use super::CHUNK;
use crate::dsp::clip::soft_clip;
use crate::dsp::filter::OnePole;
use crate::dsp::line::Line;
use crate::effect_ram::Piece;
use crate::param::{
    self, DELAY_FEEDBACK, DELAY_LEVEL, DELAY_PING_PONG, DELAY_TIME, DELAY_TIMES, DELAY_TONE, Entry,
    TEMPO,
};
use crate::project::track::{SLOT_VALUES, Slot};
use crate::sequencer::SCALE;

/// The longest echo, 2 seconds: each side's line is half a piece.
pub const MOST_SAMPLES: u32 = 96_000;
/// The samples a change of the read in use crossfades over.
pub const CROSSFADE: u32 = 1_024;

/// The samples of `ticks` at `tempo` hundredths of a BPM, rounded down.
pub const fn samples(ticks: u32, tempo: u32) -> u32 {
    // At most 11,520 ticks at 30 BPM, 576,000 samples, so it fits.
    (ticks as u64 * SCALE / tempo as u64) as u32
}

/// The ticks the delay plays for the picked `ticks`: those, or the longest of `DELAY_TIMES` whose
/// samples are at most `MOST_SAMPLES`.
pub fn ticks_in_use(ticks: u32, tempo: u32) -> u32 {
    DELAY_TIMES
        .iter()
        .rev()
        .map(|choice| u32::from(choice.key))
        .find(|&choice| choice <= ticks && samples(choice, tempo) <= MOST_SAMPLES)
        .expect("the shortest time fits at the slowest tempo")
}

/// Where a line is read, a number of samples back: from one place to another in a straight line
/// over `CROSSFADE` samples while a crossfade runs, else at the one it went to.
#[derive(Clone, Copy)]
pub struct Crossfade {
    from: u32,
    to: u32,
    /// The samples since the crossfade started, `CROSSFADE` once it has finished.
    done: u32,
}

impl Crossfade {
    pub const fn new(back: u32) -> Self {
        Self {
            from: back,
            to: back,
            done: CROSSFADE,
        }
    }

    /// Starts a crossfade to `back` when that is not the read in use and none runs: a change
    /// during a crossfade waits for it to finish (Sound, "Effect determinism"). A line that is not
    /// `ringing` holds only silence, and the read goes to `back` at once.
    pub fn aim(&mut self, back: u32, ringing: bool) {
        if !ringing {
            *self = Self::new(back);
        } else if self.done == CROSSFADE && back != self.to {
            *self = Self {
                from: self.to,
                to: back,
                done: 0,
            };
        }
    }

    /// What `read` gives at the read in use: `(1 − k) × read(from) + k × read(to)`, `k` the share of
    /// the crossfade done, 1 outside one.
    pub fn read(&self, read: impl Fn(u32) -> f32) -> f32 {
        if self.done == CROSSFADE {
            read(self.to)
        } else {
            let k = self.done as f32 / CROSSFADE as f32;
            (1.0 - k) * read(self.from) + k * read(self.to)
        }
    }

    /// Moves one sample on.
    pub fn step(&mut self) {
        self.done = (self.done + 1).min(CROSSFADE);
    }
}

/// A stereo delay whose echoes follow the tempo, with its lines in the two halves of a piece, the
/// left side's first (S12).
#[derive(Clone, Copy)]
pub struct Delay {
    lines: [Line; 2],
    crossfade: Crossfade,
    /// Each side's Tone low-pass in the loop.
    tones: [OnePole; 2],
    /// Each side's low cut in the loop.
    low_cuts: [OnePole; 2],
}

impl Delay {
    /// A delay that holds no echo, reading at its default time at the default tempo.
    pub const fn new() -> Self {
        Self {
            lines: [Line::new(8_192.0); 2],
            crossfade: Crossfade::new(samples(DELAY_TIME.default as u32, TEMPO.default as u32)),
            tones: [OnePole::new(); 2],
            low_cuts: [OnePole::new(); 2],
        }
    }

    /// Every echo so far is gone from the next chunk on. Writes nothing.
    pub fn clear(&mut self) {
        *self = Self {
            crossfade: self.crossfade,
            ..Self::new()
        };
    }

    pub fn ringing(&self, piece: &Piece) -> bool {
        let (left, right) = piece.split_at(MOST_SAMPLES as usize);
        self.lines[0].ringing(left) || self.lines[1].ringing(right)
    }

    /// One chunk of `bus` through the delay, with the slot's `values` (in list order) at `tempo`.
    pub fn render(
        &mut self,
        values: &[i32; SLOT_VALUES],
        tempo: u32,
        bus: &mut [[f32; CHUNK]; 2],
        piece: &mut Piece,
    ) {
        let value = |entry: &Entry| values[Slot::place(entry.id)];
        let real = |entry: &Entry| param::real(entry, value(entry));
        // A time is a key of `DELAY_TIMES`, so it is not negative.
        self.crossfade.aim(
            samples(ticks_in_use(value(&DELAY_TIME) as u32, tempo), tempo),
            self.ringing(piece),
        );
        let feedback = real(&DELAY_FEEDBACK) * 0.98;
        let tone = OnePole::gain(1_000.0 * libm::powf(16.0, real(&DELAY_TONE)));
        let low_cut = OnePole::gain(100.0);
        let ping_pong = value(&DELAY_PING_PONG) != 0;
        let level = real(&DELAY_LEVEL);

        let (left, right) = piece.split_at_mut(MOST_SAMPLES as usize);
        let memories = [left, right];
        let [lefts, rights] = bus;
        for (left, right) in lefts.iter_mut().zip(rights) {
            let echo = [0, 1].map(|side| {
                self.crossfade
                    .read(|back| self.lines[side].read(memories[side], back))
            });
            let x = [*left, *right];
            if level > 0.0 {
                *left += level * echo[0];
                *right += level * echo[1];
            }
            let fed = [0, 1].map(|side| {
                soft_clip(self.low_cuts[side].high_pass(
                    self.tones[side].low_pass(echo[side] * feedback, tone),
                    low_cut,
                ))
            });
            let written = if ping_pong {
                [(x[0] + x[1]) / 2.0 + fed[1], fed[0]]
            } else {
                [x[0] + fed[0], x[1] + fed[1]]
            };
            for side in 0..2 {
                self.lines[side].write(memories[side], written[side]);
            }
            self.crossfade.step();
        }
        if !self.ringing(piece) {
            self.tones = [OnePole::new(); 2];
            self.low_cuts = [OnePole::new(); 2];
        }
    }
}

impl Default for Delay {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::effect_ram::PIECE;
    use crate::param::{
        DELAY_FEEDBACK, DELAY_LEVEL, DELAY_PING_PONG, DELAY_TIME, DELAY_TONE, Entry,
    };
    use crate::project::track::{Effect, Slot};
    use std::boxed::Box;
    use std::vec::Vec;

    /// A slot's values: its defaults with `changes`.
    pub(crate) fn values(changes: &[(&Entry, i32)]) -> [i32; SLOT_VALUES] {
        let mut slot = Slot::new(Effect::Delay);
        for &(entry, value) in changes {
            slot.set(entry.id, value);
        }
        slot.values
    }

    /// A piece on the heap: one on a test thread's stack would crowd it.
    pub(crate) fn piece() -> Box<Piece> {
        std::vec![0; PIECE]
            .into_boxed_slice()
            .try_into()
            .expect("the vector is a piece long")
    }

    /// Both sides of `input` through `delay` chunk by chunk, with `values` at `tempo`.
    fn through(
        delay: &mut Delay,
        piece: &mut Piece,
        values: &[i32; SLOT_VALUES],
        tempo: u32,
        input: [&[f32]; 2],
    ) -> [Vec<f32>; 2] {
        let mut out = [Vec::new(), Vec::new()];
        for (left, right) in input[0].chunks(CHUNK).zip(input[1].chunks(CHUNK)) {
            let mut bus = [[0.0; CHUNK]; 2];
            bus[0].copy_from_slice(left);
            bus[1].copy_from_slice(right);
            delay.render(values, tempo, &mut bus, piece);
            out[0].extend(bus[0]);
            out[1].extend(bus[1]);
        }
        out
    }

    /// `length` samples of 0 with `value` at sample 0.
    pub(crate) fn impulse(value: f32, length: usize) -> Vec<f32> {
        let mut samples = std::vec![0.0; length];
        samples[0] = value;
        samples
    }

    /// The first sample after `after` that is not 0.
    fn next_sound(samples: &[f32], after: usize) -> Option<usize> {
        (after + 1..samples.len()).find(|&n| samples[n] != 0.0)
    }

    fn peak(samples: &[f32]) -> f32 {
        samples
            .iter()
            .fold(0.0, |peak, &x| libm::fmaxf(peak, libm::fabsf(x)))
    }

    #[test]
    fn samples_follow_the_tempo_in_whole_samples() {
        assert_eq!(samples(1_920, 12_000), 24_000);
        assert_eq!(samples(160, 12_000), 2_000);
        assert_eq!(samples(240, 12_100), 2_975);
    }

    #[test]
    fn a_time_too_long_plays_the_longest_choice_that_fits() {
        // 1/1 plays 1/2 at 60 BPM.
        assert_eq!(ticks_in_use(7_680, 6_000), 3_840);
        assert_eq!(ticks_in_use(11_520, 6_000), 3_840);
        assert_eq!(ticks_in_use(7_680, 12_000), 7_680);
        assert_eq!(ticks_in_use(11_520, 3_000), 1_920);
    }

    #[test]
    fn an_echo_comes_after_the_time_at_the_level() {
        // 1/16 at 120 BPM: 6,000 samples.
        let values = values(&[
            (&DELAY_TIME, 480),
            (&DELAY_LEVEL, 65_535),
            (&DELAY_FEEDBACK, 0),
        ]);
        let input = impulse(0.5, 12_032);

        let out = through(
            &mut Delay::new(),
            &mut piece(),
            &values,
            12_000,
            [&input, &input],
        );

        for side in out {
            for (n, &x) in side.iter().enumerate() {
                let echo = if n == 0 || n == 6_000 { 0.5 } else { 0.0 };
                assert_eq!(x, echo, "sample {n}");
            }
        }
    }

    #[test]
    fn a_new_delay_shorter_than_the_crossfade_echoes_on_time_at_full_level() {
        // 1/32T at 300 BPM: 800 samples.
        let values = values(&[
            (&DELAY_TIME, 160),
            (&DELAY_LEVEL, 65_535),
            (&DELAY_FEEDBACK, 0),
        ]);
        let input = impulse(0.5, 1_024);

        let out = through(
            &mut Delay::new(),
            &mut piece(),
            &values,
            30_000,
            [&input, &input],
        );

        for side in out {
            assert_eq!(next_sound(&side, 0), Some(800));
            assert_eq!(side[800], 0.5);
        }
    }

    #[test]
    fn a_delay_holding_only_silence_takes_a_new_time_at_once() {
        let at = |time| {
            values(&[
                (&DELAY_TIME, time),
                (&DELAY_LEVEL, 65_535),
                (&DELAY_FEEDBACK, 0),
            ])
        };
        let (mut delay, mut piece) = (Delay::new(), piece());
        let (input, silence) = (impulse(0.5, CHUNK), [0.0; CHUNK]);
        // An echo at 1/16, 2,400 samples at 300 BPM, then silence until the lines hold only zeros.
        through(&mut delay, &mut piece, &at(480), 30_000, [&input, &input]);
        while delay.ringing(&piece) {
            through(
                &mut delay,
                &mut piece,
                &at(480),
                30_000,
                [&silence, &silence],
            );
        }
        let input = impulse(0.5, 1_024);

        // 1/32T: 800 samples.
        let out = through(&mut delay, &mut piece, &at(160), 30_000, [&input, &input]);

        for side in out {
            assert_eq!(next_sound(&side, 0), Some(800));
            assert_eq!(side[800], 0.5);
        }
    }

    #[test]
    fn ping_pong_bounces_the_echoes_between_the_sides() {
        let values = values(&[
            (&DELAY_TIME, 480),
            (&DELAY_LEVEL, 65_535),
            (&DELAY_FEEDBACK, 65_535),
            (&DELAY_PING_PONG, 1),
        ]);
        let d = 6_000;

        let [left, right] = through(
            &mut Delay::new(),
            &mut piece(),
            &values,
            12_000,
            [&impulse(0.5, 18_048), &[0.0; 18_048]],
        );

        assert_eq!(next_sound(&left, 0), Some(d));
        assert_eq!(next_sound(&left, d), Some(3 * d));
        assert_eq!(right[0], 0.0);
        assert_eq!(next_sound(&right, 0), Some(2 * d));
    }

    #[test]
    fn feedback_at_most_stays_bounded_and_fades() {
        let values = values(&[
            (&DELAY_FEEDBACK, 65_535),
            (&DELAY_TONE, 65_535),
            (&DELAY_LEVEL, 65_535),
        ]);
        // A second of a chord of 32 loud notes a semitone apart from A1, then 30 seconds and an
        // echo of nothing.
        let mut chord: Vec<f32> = (0..48_000)
            .map(|n| {
                let time = n as f32 / 48_000.0;
                (0..32)
                    .map(|note| {
                        let hz = 55.0 * libm::exp2f(note as f32 / 12.0);
                        0.5 * libm::sinf(2.0 * core::f32::consts::PI * hz * time)
                    })
                    .sum()
            })
            .collect();
        chord.resize(48_000 * 31 + 12_000, 0.0);

        let [left, right] = through(
            &mut Delay::new(),
            &mut piece(),
            &values,
            12_000,
            [&chord, &chord],
        );

        assert!(peak(&chord) > 4.0, "peak {}", peak(&chord));
        // Found once: inside the check it would scan the chord for every sample.
        let bound = 2.0 * peak(&chord) + 1.0;
        assert!(
            left.iter()
                .chain(&right)
                .all(|&x| x.is_finite() && libm::fabsf(x) <= bound)
        );
        // From one echo time after the chord ends only the fed-back part sounds, held by the
        // limiter.
        assert!(
            left[48_000 + 12_000..]
                .iter()
                .chain(&right[48_000 + 12_000..])
                .all(|&x| libm::fabsf(x) <= 1.0)
        );
        // An echo of 1/8 at 120 BPM, 12,000 samples, a second and 30 seconds after the chord.
        let echoes = |seconds: usize| peak(&left[48_000 * (1 + seconds)..][..12_000]);
        assert!(echoes(30) < echoes(1), "{} and {}", echoes(30), echoes(1));
    }

    #[test]
    fn a_tempo_change_crossfades_to_the_new_time() {
        // 1/4: 24,000 samples at 120 BPM and 23,801 at 121.
        let values = values(&[
            (&DELAY_TIME, 1_920),
            (&DELAY_LEVEL, 65_535),
            (&DELAY_FEEDBACK, 0),
        ]);
        let tone: Vec<f32> = (0..26_048)
            .map(|n| 0.25 * libm::sinf(2.0 * core::f32::consts::PI * 440.0 * n as f32 / 48_000.0))
            .collect();
        let stored = |n: usize| (tone[n] * 8_192.0) as i32 as f32 / 8_192.0;
        let (mut delay, mut piece) = (Delay::new(), piece());

        through(
            &mut delay,
            &mut piece,
            &values,
            12_000,
            [&tone[..24_000], &tone[..24_000]],
        );
        let [out, _] = through(
            &mut delay,
            &mut piece,
            &values,
            12_100,
            [&tone[24_000..], &tone[24_000..]],
        );

        for (n, &x) in out.iter().enumerate() {
            let (old, new) = (stored(n), stored(24_000 + n - 23_801));
            let echo = if n < 1_024 {
                let k = n as f32 / 1_024.0;
                (1.0 - k) * old + k * new
            } else {
                new
            };
            assert!(
                libm::fabsf(x - (tone[24_000 + n] + echo)) < 1e-6,
                "sample {n}"
            );
        }
    }
}
