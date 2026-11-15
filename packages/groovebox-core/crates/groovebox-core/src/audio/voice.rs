use super::synth::Synth;
use super::{CHUNK, SAMPLE_RATE};
use crate::dsp::envelope::Envelope;
use crate::dsp::filter::{Filter, Mode};
use crate::dsp::flush;
use crate::message::NoteId;
use crate::param::{
    self, ATTACK, CUTOFF, DECAY, ENVELOPE_AMOUNT, Entry, FILTER_ATTACK, FILTER_DECAY,
    FILTER_RELEASE, FILTER_SUSTAIN, FILTER_VELOCITY, FINE_TUNE, GATE, GLIDE_TIME, HP, KEY_FOLLOW,
    LEVEL, LP_12, LP_24, MODE, ONE_SHOT, PAN, ParamId, RELEASE, RESONANCE, SPREAD, SUSTAIN,
    TRANSPOSE, TRIGGER, VOLUME_VELOCITY,
};
use crate::project::pool::{SOUND_VALUES, Sound, SoundNumber};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    /// Free for a new note.
    Idle,
    /// Its key is held, or it is a one-shot that has not ended.
    Held,
    /// Its key was let go and it plays its release.
    Released,
}

/// A value that glides in whole chunks to the value it was last set to.
#[derive(Clone, Copy)]
struct Glide {
    value: i32,
    target: i32,
    /// The chunks left until `value` lands on `target`.
    chunks: u32,
}

/// A note's own copy of its sound's values, in the sound's order.
struct Values([Glide; SOUND_VALUES]);

impl Values {
    /// The one read step: every value the voice plays with comes through here. It gives the
    /// gliding home value; no value is modulated yet.
    fn read(&self, id: ParamId) -> i32 {
        self.0[Sound::place(id)].value
    }
}

/// One note: the synth engine and the chain every sound shares, the tuning, glide, filter, both
/// envelopes, level, pan and trigger.
pub struct Voice {
    state: State,
    note: NoteId,
    track: u8,
    sound: SoundNumber,
    pitch: u8,
    velocity: u8,
    /// How far the pitch still lies from `pitch` in semitones, and the chunks it takes to get
    /// there in a line.
    bend: f32,
    bend_chunks: u32,
    /// Fixed when the note starts: Spread was above 0.
    stereo: bool,
    values: Values,
    synth: Synth,
    /// A stereo voice runs both, a mono one the first.
    filters: [Filter; 2],
    filter_envelope: Envelope,
    volume_envelope: Envelope,
}

impl Voice {
    pub const fn new() -> Self {
        Self {
            state: State::Idle,
            note: NoteId(0),
            track: 0,
            sound: SoundNumber(0),
            pitch: 0,
            velocity: 0,
            bend: 0.0,
            bend_chunks: 0,
            stereo: false,
            values: Values(
                [Glide {
                    value: 0,
                    target: 0,
                    chunks: 0,
                }; SOUND_VALUES],
            ),
            synth: Synth::new(),
            filters: [Filter::new(), Filter::new()],
            filter_envelope: Envelope::new(),
            volume_envelope: Envelope::new(),
        }
    }

    pub fn state(&self) -> State {
        self.state
    }

    pub fn note(&self) -> NoteId {
        self.note
    }

    pub fn track(&self) -> u8 {
        self.track
    }

    pub fn sound(&self) -> SoundNumber {
        self.sound
    }

    /// Starts a new note with a copy of its sound's `values`, from silence: the engine, the
    /// filters and the envelopes start afresh. Whether it is stereo is fixed now.
    #[expect(
        clippy::too_many_arguments,
        reason = "a note brings all of these and the voice keeps each"
    )]
    pub fn start(
        &mut self,
        note: NoteId,
        track: u8,
        sound: SoundNumber,
        pitch: u8,
        velocity: u8,
        seed: u32,
        values: &[i32; SOUND_VALUES],
    ) {
        let values = Values(values.map(|value| Glide {
            value,
            target: value,
            chunks: 0,
        }));
        *self = Self {
            state: State::Held,
            note,
            track,
            sound,
            pitch,
            velocity,
            stereo: values.read(SPREAD.id) > 0,
            values,
            ..Self::new()
        };
        self.synth.start(seed);
        self.filter_envelope.start();
        self.volume_envelope.start();
    }

    /// Moves a mono voice to another note. With `glide` the pitch moves there in a line over Glide
    /// time; with `restart` both envelopes start again from where they are.
    pub fn change(&mut self, note: NoteId, pitch: u8, velocity: u8, restart: bool, glide: bool) {
        self.bend_chunks = if glide {
            (param::real(&GLIDE_TIME, self.values.read(GLIDE_TIME.id)) * SAMPLE_RATE as f32
                / CHUNK as f32) as u32
        } else {
            0
        };
        self.bend = if self.bend_chunks > 0 {
            self.pitch as f32 + self.bend - pitch as f32
        } else {
            0.0
        };
        self.note = note;
        self.pitch = pitch;
        self.velocity = velocity;
        self.state = State::Held;
        if restart {
            self.filter_envelope.start();
            self.volume_envelope.start();
        }
    }

    /// Lets go of the key: a Gate note starts its release, a One-shot note plays on.
    pub fn release(&mut self) {
        if self.values.read(TRIGGER.id) == GATE {
            self.state = State::Released;
            self.filter_envelope.release();
            self.volume_envelope.release();
        }
    }

    /// Glides the value of `id` to `value` over the entry's glide in whole chunks, landing exactly
    /// on it; a glide of 0 sets it at once.
    pub fn set(&mut self, id: ParamId, value: i32) {
        let chunks = param::entry(id).glide.div_ceil(CHUNK as u32);
        let glide = &mut self.values.0[Sound::place(id)];
        *glide = Glide {
            value: if chunks == 0 { value } else { glide.value },
            target: value,
            chunks,
        };
    }

    /// Adds one chunk of the note to `out`. The pitch, the filter's tuning and the gain are found
    /// once per chunk; the voice goes `Idle` once the volume envelope has ended a released or
    /// one-shot note.
    pub fn render(&mut self, out: &mut [[f32; CHUNK]; 2]) {
        for glide in &mut self.values.0 {
            if glide.chunks > 0 {
                glide.value += (glide.target - glide.value) / glide.chunks as i32;
                glide.chunks -= 1;
            }
        }
        if self.bend_chunks > 0 {
            self.bend = flush(self.bend - self.bend / self.bend_chunks as f32);
            self.bend_chunks -= 1;
        }
        let read = |id: ParamId| self.values.read(id);
        let real = |entry: &Entry| param::real(entry, read(entry.id));
        let samples = |entry: &Entry| (real(entry) * SAMPLE_RATE as f32) as u32;
        // One-shot counts the sustain as 0, so the note always ends.
        let one_shot = read(TRIGGER.id) == ONE_SHOT;
        let sustain = |entry: &Entry| if one_shot { 0.0 } else { real(entry) };

        let semitones = self.pitch as f32
            + self.bend
            + read(TRANSPOSE.id) as f32
            + read(FINE_TUNE.id) as f32 / 100.0;
        let mut sources = [[0.0; CHUNK]; 2];
        self.synth.render(
            read,
            440.0 * libm::exp2f((semitones - 69.0) / 12.0),
            self.stereo,
            &mut sources,
        );

        // The filter envelope runs through the chunk first, so the filter opens in the chunk its
        // attack starts in.
        let (attack, decay, level, release) = (
            samples(&FILTER_ATTACK),
            samples(&FILTER_DECAY),
            sustain(&FILTER_SUSTAIN),
            samples(&FILTER_RELEASE),
        );
        let envelope = (0..CHUNK).fold(0.0, |_, _| {
            self.filter_envelope.next(attack, decay, level, release)
        });
        let cutoff = real(&CUTOFF)
            * libm::exp2f(
                8.0 * real(&ENVELOPE_AMOUNT) * envelope
                    + real(&KEY_FOLLOW) * (semitones - 60.0) / 12.0
                    + 4.0 * real(&FILTER_VELOCITY) * self.velocity as f32 / 127.0,
            );
        for filter in &mut self.filters[..if self.stereo { 2 } else { 1 }] {
            filter.tune(cutoff, real(&RESONANCE));
        }
        let mode = match read(MODE.id) {
            LP_12 => Mode::Lp12,
            LP_24 => Mode::Lp24,
            HP => Mode::Hp,
            _ => Mode::Bp,
        };

        let gain =
            real(&LEVEL) * (1.0 - real(&VOLUME_VELOCITY) * (1.0 - self.velocity as f32 / 127.0));
        // Constant power, with both gains equal in the middle; a stereo voice's channels each get
        // theirs, which makes it a balance.
        let pan = real(&PAN);
        let (to_left, to_right) = (
            libm::sqrtf((1.0 - pan) / 2.0),
            libm::sqrtf((1.0 + pan) / 2.0),
        );
        let (attack, decay, level, release) = (
            samples(&ATTACK),
            samples(&DECAY),
            sustain(&SUSTAIN),
            samples(&RELEASE),
        );
        for n in 0..CHUNK {
            let gain = gain * self.volume_envelope.next(attack, decay, level, release);
            let left = self.filters[0].process(mode, sources[0][n]) * gain;
            let right = if self.stereo {
                self.filters[1].process(mode, sources[1][n]) * gain
            } else {
                left
            };
            out[0][n] += left * to_left;
            out[1][n] += right * to_right;
        }

        if self.volume_envelope.is_done() && (one_shot || self.state == State::Released) {
            self.state = State::Idle;
        }
    }

    /// Adds one last chunk of the note to `out`, fading in a line to exactly 0 at its last
    /// sample, and goes `Idle`: a taken or choked voice never stops with a click.
    pub fn fade(&mut self, out: &mut [[f32; CHUNK]; 2]) {
        let mut chunk = [[0.0; CHUNK]; 2];
        self.render(&mut chunk);
        for (out, chunk) in out.iter_mut().zip(chunk) {
            for (n, (out, x)) in out.iter_mut().zip(chunk).enumerate() {
                *out += x * (CHUNK - 1 - n) as f32 / (CHUNK - 1) as f32;
            }
        }
        self.state = State::Idle;
    }
}

impl Default for Voice {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::param::{
        CUTOFF, FINE_TUNE, ONE_SHOT, OSCILLATOR_2_INTERVAL, OSCILLATOR_2_LEVEL, SINE, SPREAD,
        SUSTAIN, TRANSPOSE, TRIGGER, VOLUME_VELOCITY, WAVE,
    };
    use crate::project::pool::SOUND_DEFAULTS;
    use std::vec::Vec;

    /// The chunks in a second.
    const SECOND: usize = SAMPLE_RATE as usize / CHUNK;

    /// A new sound's values with `changes`.
    fn sound(changes: &[(&Entry, i32)]) -> [i32; SOUND_VALUES] {
        let mut values = SOUND_DEFAULTS;
        for &(entry, value) in changes {
            values[Sound::place(entry.id)] = value;
        }
        values
    }

    /// A voice that has started `pitch` at `velocity`.
    fn note(values: &[i32; SOUND_VALUES], pitch: u8, velocity: u8, seed: u32) -> Voice {
        let mut voice = Voice::new();
        voice.start(NoteId(0), 0, SoundNumber(1), pitch, velocity, seed, values);
        voice
    }

    /// The next `chunks` chunks of `voice`, left and right.
    fn play(voice: &mut Voice, chunks: usize) -> [Vec<f32>; 2] {
        let mut channels = [Vec::new(), Vec::new()];
        for _ in 0..chunks {
            let mut out = [[0.0; CHUNK]; 2];
            voice.render(&mut out);
            channels[0].extend(out[0]);
            channels[1].extend(out[1]);
        }
        channels
    }

    fn upward_crossings(samples: &[f32]) -> usize {
        samples
            .windows(2)
            .filter(|pair| pair[0] < 0.0 && pair[1] >= 0.0)
            .count()
    }

    fn peak(samples: &[f32]) -> f32 {
        samples
            .iter()
            .fold(0.0, |peak, &x| libm::fmaxf(peak, libm::fabsf(x)))
    }

    fn bits(samples: &[f32]) -> Vec<u32> {
        samples.iter().map(|x| x.to_bits()).collect()
    }

    #[test]
    fn a_new_synth_note_sounds_at_once_and_ends_about_100_ms_after_release() {
        let mut voice = note(&SOUND_DEFAULTS, 60, 127, 1);
        let [left, _] = play(&mut voice, 4_800 / CHUNK);

        assert!(left[..CHUNK].iter().any(|&x| x != 0.0));
        let peak = peak(&left);
        assert!(libm::fabsf(peak - 0.25) < 0.02, "peak {peak}");

        voice.release();
        assert_eq!(voice.state(), State::Released);
        let idle = (1..=9_600 / CHUNK).find(|_| {
            play(&mut voice, 1);
            voice.state() == State::Idle
        });
        assert!(
            idle.is_some(),
            "still sounding 9,600 samples after the release"
        );
    }

    #[test]
    fn the_pitch_follows_note_transpose_and_fine_tune() {
        let crossings = |tuning: &[(&Entry, i32)]| {
            let mut values = sound(tuning);
            values[Sound::place(WAVE.id)] = SINE;
            upward_crossings(&play(&mut note(&values, 69, 127, 1), SECOND)[0])
        };

        for (tuning, expected) in [
            (&[][..], 440),
            (&[(&TRANSPOSE, 12)][..], 880),
            (&[(&FINE_TUNE, 50)][..], 453),
        ] {
            let crossings = crossings(tuning);
            assert!(crossings.abs_diff(expected) <= 1, "{crossings} crossings");
        }
    }

    #[test]
    fn oscillator_2_plays_its_interval() {
        let sine = |level| {
            let values = sound(&[
                (&WAVE, SINE),
                (&OSCILLATOR_2_LEVEL, level),
                (&OSCILLATOR_2_INTERVAL, 12),
            ]);
            let [left, _] = play(&mut note(&values, 69, 127, 1), SECOND);
            left
        };
        let (with, without) = (sine(65_535), sine(0));
        let difference: Vec<f32> = with.iter().zip(&without).map(|(a, b)| a - b).collect();

        let crossings = upward_crossings(&difference);
        assert!(crossings.abs_diff(880) <= 1, "{crossings} crossings");
    }

    #[test]
    fn spread_makes_a_stereo_voice_only_from_its_start() {
        let mut voice = note(&SOUND_DEFAULTS, 60, 127, 1);
        let [left, right] = play(&mut voice, 8);
        assert_eq!(bits(&left), bits(&right));

        voice.set(SPREAD.id, 32_768);
        let [left, right] = play(&mut voice, 8);
        assert_eq!(bits(&left), bits(&right));

        let [left, right] = play(&mut note(&sound(&[(&SPREAD, 32_768)]), 60, 127, 1), 8);
        assert_ne!(bits(&left), bits(&right));
    }

    #[test]
    fn a_cutoff_change_glides_over_four_chunks() {
        let mut voice = note(&SOUND_DEFAULTS, 60, 127, 1);
        play(&mut voice, 1);
        assert!(libm::fabsf(voice.filters[0].cutoff() - 20_000.0) < 1.0);

        voice.set(CUTOFF.id, 0);
        let cutoffs = [(); 5].map(|()| {
            play(&mut voice, 1);
            voice.filters[0].cutoff()
        });

        assert!(cutoffs[0] < 19_000.0, "{cutoffs:?}");
        assert!(
            cutoffs.windows(2).take(3).all(|pair| pair[1] < pair[0]),
            "{cutoffs:?}"
        );
        assert!(libm::fabsf(cutoffs[3] - 20.0) < 0.01, "{cutoffs:?}");
        assert_eq!(cutoffs[4], cutoffs[3]);
    }

    #[test]
    fn one_shot_ignores_the_release() {
        let values = sound(&[(&TRIGGER, ONE_SHOT), (&SUSTAIN, 65_535)]);
        let (mut released, mut held) = (note(&values, 60, 127, 1), note(&values, 60, 127, 1));
        assert_eq!(play(&mut released, 1), play(&mut held, 1));

        released.release();
        assert_eq!(released.state(), State::Held);
        // The decay of 300 ms counts the sustain as 0 and falls below 1/10,000 after 400 ms.
        assert_eq!(play(&mut released, 450), play(&mut held, 450));
        assert_eq!(released.state(), State::Held);
        assert_eq!(play(&mut released, 300), play(&mut held, 300));
        assert_eq!(released.state(), State::Idle);
    }

    #[test]
    fn velocity_amount_scales_the_level() {
        let peak_at = |amount, velocity| {
            let values = sound(&[(&VOLUME_VELOCITY, amount)]);
            peak(&play(&mut note(&values, 60, velocity, 1), 10)[0])
        };

        let ratio = peak_at(65_535, 64) / peak_at(65_535, 127);
        assert!(libm::fabsf(ratio - 0.5) < 0.01, "ratio {ratio}");
        assert_eq!(peak_at(0, 64), peak_at(0, 127));
    }

    #[test]
    fn a_fade_reaches_zero_in_one_chunk() {
        let mut voice = note(&SOUND_DEFAULTS, 60, 127, 1);
        play(&mut voice, 4);
        let mut out = [[0.0; CHUNK]; 2];

        voice.fade(&mut out);

        assert!(out[0].iter().any(|&x| x != 0.0));
        assert_eq!(out.map(|channel| channel[CHUNK - 1]), [0.0; 2]);
        assert_eq!(voice.state(), State::Idle);
    }
}
