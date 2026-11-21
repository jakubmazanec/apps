use super::sample::Player;
use super::synth::Synth;
use super::{CHUNK, SAMPLE_RATE};
use crate::dsp::envelope::Envelope;
use crate::dsp::filter::{Filter, Mode};
use crate::dsp::flush;
use crate::library::FileId;
use crate::message::{NoteEngine, NoteId};
use crate::param::{
    self, ATTACK, CUTOFF, DECAY, ENVELOPE_AMOUNT, Entry, FILTER_ATTACK, FILTER_DECAY,
    FILTER_RELEASE, FILTER_SUSTAIN, FILTER_VELOCITY, FINE_TUNE, GLIDE_TIME, HP, KEY_FOLLOW, LEVEL,
    LOOP, LP_12, LP_24, MODE, ONE_SHOT, PAN, ParamId, RELEASE, RESONANCE, ROOT_NOTE, SPREAD,
    SUSTAIN, TRANSPOSE, TRIGGER, VOLUME_VELOCITY,
};
use crate::project::pool::{SOUND_VALUES, Sound, SoundNumber};
use crate::sample_ram::Reader;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    /// Free for a new note.
    Idle,
    /// Its key is held.
    Held,
    /// Its key was let go: a Gate note plays its release, a One-shot note the rest of its decay,
    /// or of its sample when that does not loop.
    Released,
}

/// A value that glides in whole chunks to the value it was last set to.
#[derive(Clone, Copy)]
pub(super) struct Glide {
    pub(super) value: i32,
    target: i32,
    /// The chunks left until `value` lands on `target`.
    chunks: u32,
}

impl Glide {
    pub(super) const fn at(value: i32) -> Self {
        Self {
            value,
            target: value,
            chunks: 0,
        }
    }

    /// Glides to `value` over `samples` in whole chunks, landing exactly on it; 0 samples set it at
    /// once.
    pub(super) fn set(&mut self, value: i32, samples: u32) {
        let chunks = samples.div_ceil(CHUNK as u32);
        *self = Self {
            value: if chunks == 0 { value } else { self.value },
            target: value,
            chunks,
        };
    }

    /// Moves `value` one chunk along.
    pub(super) fn step(&mut self) {
        if self.chunks > 0 {
            self.value += (self.target - self.value) / self.chunks as i32;
            self.chunks -= 1;
        }
    }
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

/// What a note plays, chosen when it starts.
#[expect(
    clippy::large_enum_variant,
    reason = "every voice can play a sample and the audio part never allocates"
)]
enum Engine {
    Synth(Synth),
    Sample(Player),
}

/// One note: its engine (the synth or the sample player) and the chain every sound shares, the
/// tuning, glide, filter, both envelopes, level, pan and trigger.
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
    /// Fixed when the note starts: Spread was above 0, or its sample's file is stereo.
    stereo: bool,
    values: Values,
    engine: Engine,
    /// A stereo voice runs both, a mono one the first.
    filters: [Filter; 2],
    filter_envelope: Envelope,
    volume_envelope: Envelope,
    /// The chunk a restart, a Mono one or a Legato one after the voice's key was let go, took from
    /// the sample that sounded before it, and the velocity it sounded at. The next chunk adds it
    /// fading out to the new note's source at its own volume, as is what the filter still holds of
    /// the old note; the filter's tuning and the envelopes are the new note's. Of several restarts
    /// before that chunk the first keeps its chunk: the others took chunks that never sounded.
    fading: Option<([[f32; CHUNK]; 2], u8)>,
    /// The velocity a synth note sounded at before a restart changed it: the next chunk's volume
    /// moves from it to the new velocity's in a line, so the level never steps.
    old_velocity: Option<u8>,
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
            values: Values([Glide::at(0); SOUND_VALUES]),
            engine: Engine::Synth(Synth::new()),
            filters: [Filter::new(), Filter::new()],
            filter_envelope: Envelope::new(),
            volume_envelope: Envelope::new(),
            fading: None,
            old_velocity: None,
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

    /// The file the note reads: none for a synth note, a missing sample or an idle voice.
    pub fn reads(&self) -> Option<FileId> {
        match &self.engine {
            Engine::Sample(player) if self.state != State::Idle => player.file(),
            _ => None,
        }
    }

    /// Whether `change` may move the note to one of `engine`: the voice plays that engine and,
    /// when it restarts, the new file has the voice's channels, which its start fixed. A missing
    /// sample sounds nothing, so it fits either.
    pub fn can_change(&self, engine: NoteEngine, restart: bool) -> bool {
        match (&self.engine, engine) {
            (Engine::Synth(_), NoteEngine::Synth) => true,
            (Engine::Sample(_), NoteEngine::Sample(sample)) => {
                !restart || sample.is_none_or(|sample| sample.stereo == self.stereo)
            }
            _ => false,
        }
    }

    /// Starts a new note of `engine` with a copy of its sound's `values`, from silence: the
    /// engine, the filters and the envelopes start afresh. A sample note reads its first chunk of
    /// the file through `reader` now. Whether it is stereo is fixed now.
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
        engine: NoteEngine,
        values: &[i32; SOUND_VALUES],
        reader: &Reader<'_>,
    ) {
        let values = Values(values.map(Glide::at));
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
        self.engine = match engine {
            NoteEngine::Synth => {
                let mut synth = Synth::new();
                synth.start(seed);
                Engine::Synth(synth)
            }
            NoteEngine::Sample(sample) => {
                let mut player = Player::new();
                player.start(
                    sample,
                    |id| self.values.read(id),
                    rate(self.semitones(), self.values.read(ROOT_NOTE.id)),
                    reader,
                );
                self.stereo = player.stereo();
                Engine::Sample(player)
            }
        };
        self.filter_envelope.start();
        self.volume_envelope.start();
    }

    /// Moves a mono voice to another note, of an `engine` that `can_change` allows. With `glide`
    /// the pitch moves there in a line over Glide time. With `restart` both envelopes start again
    /// from where they are and the new velocity counts, a synth note's volume moving to it in a
    /// line over the next chunk; a sample note then plays the file of
    /// `engine` from Start (End in reverse), reading its first chunk through `reader`, while the
    /// chunk it had read ahead fades out at its own volume in the new note's first, reading nothing
    /// more of its file. Without it, as in Legato while the voice's key is held, only the pitch
    /// moves: a sample note keeps its place and its file.
    #[expect(
        clippy::too_many_arguments,
        reason = "a change brings the new note, how it moves there and what it plays"
    )]
    pub fn change(
        &mut self,
        note: NoteId,
        pitch: u8,
        velocity: u8,
        restart: bool,
        glide: bool,
        engine: NoteEngine,
        reader: &Reader<'_>,
    ) {
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
        self.state = State::Held;
        if restart {
            self.filter_envelope.start();
            self.volume_envelope.start();
            let speed = rate(self.semitones(), self.values.read(ROOT_NOTE.id));
            if let (Engine::Sample(player), NoteEngine::Sample(sample)) = (&mut self.engine, engine)
            {
                self.fading
                    .get_or_insert_with(|| (player.ahead(), self.velocity));
                player.start(sample, |id| self.values.read(id), speed, reader);
            } else {
                self.old_velocity.get_or_insert(self.velocity);
            }
            self.velocity = velocity;
        }
    }

    /// Lets go of the key. From the chunk it renders next, a Gate note plays its release; a
    /// One-shot note plays on to the end of its decay, or of its sample when that does not loop,
    /// or releases once Trigger turns to Gate.
    pub fn release(&mut self) {
        self.state = State::Released;
    }

    /// Glides the value of `id` to `value` over the entry's glide in whole chunks, landing exactly
    /// on it; a glide of 0 sets it at once.
    pub fn set(&mut self, id: ParamId, value: i32) {
        self.values.0[Sound::place(id)].set(value, param::entry(id).glide);
    }

    /// Adds one chunk of the note to `out`. The pitch, the filter's tuning and the gain are found
    /// once per chunk; the voice goes `Idle` once the volume envelope has ended a released or
    /// one-shot note, or after the chunk in which its sample ended. A sample note reads its file
    /// through `reader`, one chunk ahead.
    pub fn render(&mut self, reader: &Reader<'_>, out: &mut [[f32; CHUNK]; 2]) {
        self.play(Some(reader), out);
    }

    /// Adds one last chunk of the note to `out`, fading in a line to exactly 0 at its last
    /// sample, and goes `Idle`: a taken or choked voice never stops with a click. A sample note
    /// fades the chunk it read ahead, so a fade reads nothing of its file.
    pub fn fade(&mut self, out: &mut [[f32; CHUNK]; 2]) {
        let mut chunk = [[0.0; CHUNK]; 2];
        self.play(None, &mut chunk);
        add_fading(out, chunk);
        self.state = State::Idle;
    }

    /// The pitch the note plays in semitones: its key's, bent on its way there, with Transpose and
    /// Fine tune.
    fn semitones(&self) -> f32 {
        self.pitch as f32
            + self.bend
            + self.values.read(TRANSPOSE.id) as f32
            + self.values.read(FINE_TUNE.id) as f32 / 100.0
    }

    /// `render`; without a reader a sample note plays the chunk it read ahead and reads nothing.
    fn play(&mut self, reader: Option<&Reader<'_>>, out: &mut [[f32; CHUNK]; 2]) {
        for glide in &mut self.values.0 {
            glide.step();
        }
        if self.bend_chunks > 0 {
            self.bend = flush(self.bend - self.bend / self.bend_chunks as f32);
            self.bend_chunks -= 1;
        }
        let read = |id: ParamId| self.values.read(id);
        let real = |entry: &Entry| param::real(entry, read(entry.id));
        let samples = |entry: &Entry| (real(entry) * SAMPLE_RATE as f32) as u32;
        // One-shot counts the sustain as 0 when the note would never end by itself, a synth or a
        // looping sample, so the note always ends; a sample that does not loop plays to its end.
        let one_shot = read(TRIGGER.id) == ONE_SHOT;
        let endless = !matches!(self.engine, Engine::Sample(_)) || read(LOOP.id) != 0;
        let sustain = |entry: &Entry| {
            if one_shot && endless {
                0.0
            } else {
                real(entry)
            }
        };
        // A let-go note releases whenever its trigger reads Gate, so a One-shot turned to Gate
        // after its key is up still ends; releasing an envelope that already does changes nothing.
        if self.state == State::Released && !one_shot {
            self.filter_envelope.release();
            self.volume_envelope.release();
        }

        let semitones = self.semitones();
        let mut sources = [[0.0; CHUNK]; 2];
        match &mut self.engine {
            Engine::Synth(synth) => synth.render(
                read,
                440.0 * libm::exp2f((semitones - 69.0) / 12.0),
                self.stereo,
                &mut sources,
            ),
            Engine::Sample(player) => {
                sources = match reader {
                    Some(reader) => {
                        player.render(read, rate(semitones, read(ROOT_NOTE.id)), reader)
                    }
                    None => player.ahead(),
                };
                if let Some((fading, velocity)) = self.fading.take() {
                    // A new gain of 0 silences the whole chunk, so the old one needs no scale.
                    let gain = level_gain(read, self.velocity);
                    let scale = if gain == 0.0 {
                        1.0
                    } else {
                        level_gain(read, velocity) / gain
                    };
                    add_fading(&mut sources, fading.map(|chunk| chunk.map(|x| x * scale)));
                    for filter in &mut self.filters {
                        filter.scale(scale);
                    }
                }
            }
        }

        // The filter envelope runs through the chunk first, so the filter opens in the chunk its
        // attack starts in.
        let (attack, decay, level, release) = (
            samples(&FILTER_ATTACK),
            samples(&FILTER_DECAY),
            sustain(&FILTER_SUSTAIN),
            samples(&FILTER_RELEASE),
        );
        let mut envelope = 0.0;
        for _ in 0..CHUNK {
            envelope = self.filter_envelope.next(attack, decay, level, release);
        }
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

        let gain = level_gain(read, self.velocity);
        let before = self
            .old_velocity
            .take()
            .map_or(gain, |velocity| level_gain(read, velocity));
        let (to_left, to_right) = pan_gains(read);
        let (attack, decay, level, release) = (
            samples(&ATTACK),
            samples(&DECAY),
            sustain(&SUSTAIN),
            samples(&RELEASE),
        );
        for n in 0..CHUNK {
            let gain = (before + (gain - before) * (n + 1) as f32 / CHUNK as f32)
                * self.volume_envelope.next(attack, decay, level, release);
            let left = self.filters[0].process(mode, sources[0][n]) * gain;
            let right = if self.stereo {
                self.filters[1].process(mode, sources[1][n]) * gain
            } else {
                left
            };
            out[0][n] += left * to_left;
            out[1][n] += right * to_right;
        }

        if matches!(&self.engine, Engine::Sample(player) if player.finished())
            || (self.volume_envelope.is_done() && (one_shot || self.state == State::Released))
        {
            self.state = State::Idle;
        }
    }
}

/// How many times as fast as it was recorded a sample plays at `semitones`, from Root note `root`.
fn rate(semitones: f32, root: i32) -> f32 {
    libm::exp2f((semitones - root as f32) / 12.0)
}

/// The gain of a note at `velocity`, before its envelope, of a sound whose values `read` gives.
pub(super) fn level_gain(read: impl Fn(ParamId) -> i32, velocity: u8) -> f32 {
    param::real(&LEVEL, read(LEVEL.id))
        * (1.0
            - param::real(&VOLUME_VELOCITY, read(VOLUME_VELOCITY.id))
                * (1.0 - velocity as f32 / 127.0))
}

/// The left and right gains of the pan of a sound whose values `read` gives. Constant power, with
/// both gains equal in the middle; a stereo voice's channels each get theirs, which makes it a
/// balance.
pub(super) fn pan_gains(read: impl Fn(ParamId) -> i32) -> (f32, f32) {
    let pan = param::real(&PAN, read(PAN.id));
    (
        libm::sqrtf((1.0 - pan) / 2.0),
        libm::sqrtf((1.0 + pan) / 2.0),
    )
}

/// Adds `chunk` to `out`, fading in a line to exactly 0 at its last sample: a stop never clicks.
pub(super) fn add_fading(out: &mut [[f32; CHUNK]; 2], chunk: [[f32; CHUNK]; 2]) {
    for (out, chunk) in out.iter_mut().zip(chunk) {
        for (n, (out, x)) in out.iter_mut().zip(chunk).enumerate() {
            *out += x * (CHUNK - 1 - n) as f32 / (CHUNK - 1) as f32;
        }
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
    use crate::audio::tests::empty_reader;
    use crate::param::{
        CUTOFF, FINE_TUNE, GATE, ONE_SHOT, OSCILLATOR_2_INTERVAL, OSCILLATOR_2_LEVEL, SINE, SPREAD,
        SUPERSAW, SUSTAIN, TRANSPOSE, TRIGGER, VOLUME_VELOCITY, WAVE,
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

    /// A voice that has started a synth note of `pitch` at `velocity`.
    fn note(values: &[i32; SOUND_VALUES], pitch: u8, velocity: u8, seed: u32) -> Voice {
        let mut voice = Voice::new();
        voice.start(
            NoteId(0),
            0,
            SoundNumber(1),
            pitch,
            velocity,
            seed,
            NoteEngine::Synth,
            values,
            &empty_reader(),
        );
        voice
    }

    /// The next `chunks` chunks of `voice`, left and right.
    fn play(voice: &mut Voice, chunks: usize) -> [Vec<f32>; 2] {
        let mut channels = [Vec::new(), Vec::new()];
        for _ in 0..chunks {
            let mut out = [[0.0; CHUNK]; 2];
            voice.render(&empty_reader(), &mut out);
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

        let supersaw = sound(&[(&WAVE, SUPERSAW), (&SPREAD, 32_768)]);
        let [left, right] = play(&mut note(&supersaw, 60, 127, 1), 8);
        assert_ne!(bits(&left), bits(&right));
    }

    #[test]
    fn spread_leaves_a_lone_oscillator_1_in_the_middle() {
        let [left, right] = play(&mut note(&sound(&[(&SPREAD, 65_535)]), 60, 127, 1), 8);

        assert_eq!(peak(&left), peak(&right));
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
        assert_eq!(released.state(), State::Released);
        // The decay of 300 ms counts the sustain as 0 and falls below 1/10,000 after 400 ms.
        assert_eq!(play(&mut released, 450), play(&mut held, 450));
        assert_eq!(released.state(), State::Released);
        assert_eq!(play(&mut released, 300), play(&mut held, 300));
        assert_eq!(released.state(), State::Idle);
    }

    #[test]
    fn a_let_go_one_shot_turned_to_gate_ends_by_its_release() {
        let mut voice = note(
            &sound(&[(&TRIGGER, ONE_SHOT), (&SUSTAIN, 65_535)]),
            60,
            127,
            1,
        );
        play(&mut voice, 10);
        voice.release();
        play(&mut voice, 10);

        voice.set(TRIGGER.id, GATE);

        // Its decay alone would end it 19,200 samples after the start.
        let idle = (1..=9_600 / CHUNK).find(|_| {
            play(&mut voice, 1);
            voice.state() == State::Idle
        });
        assert!(idle.is_some(), "still sounding 9,600 samples after Gate");
    }

    #[test]
    fn a_change_without_restart_keeps_the_velocity() {
        let mut voice = note(&sound(&[(&VOLUME_VELOCITY, 65_535)]), 60, 127, 1);
        let before = peak(&play(&mut voice, 20)[0]);

        voice.change(
            NoteId(1),
            60,
            30,
            false,
            false,
            NoteEngine::Synth,
            &empty_reader(),
        );

        let after = peak(&play(&mut voice, 20)[0]);
        assert!(
            libm::fabsf(after / before - 1.0) < 0.02,
            "{before} then {after}"
        );
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
