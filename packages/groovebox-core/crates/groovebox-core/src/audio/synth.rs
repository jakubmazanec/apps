use super::{CHUNK, SAMPLE_RATE};
use crate::dsp::osc::{Noise, Oscillator, Wave};
use crate::param::{
    self, Entry, NOISE_LEVEL, OSCILLATOR_2_FINE_TUNE, OSCILLATOR_2_INTERVAL, OSCILLATOR_2_LEVEL,
    PULSE, ParamId, SHAPE, SINE, SPREAD, SUB_LEVEL, SUPERSAW, TRIANGLE, WAVE,
};

/// What every source is scaled by, so a new sound's plain saw peaks near 0.25 (Level 80%,
/// velocity 127, in the middle). The open filter rings about a tenth above the saw's edge.
const SOURCE: f32 = 0.5;

/// What each of the supersaw's saws is scaled by: about 1/√7, so the seven are about as loud as
/// one saw.
const SUPERSAW_SAW: f32 = 0.378;

/// Where each of the supersaw's saws lies, from −1 to 1: its detune at Shape 100% in semitones and
/// its place between left and right at Spread 100%. The first is oscillator 1 itself.
const PLACES: [f32; 7] = [0.0, -1.0, 1.0, -2.0 / 3.0, 2.0 / 3.0, -1.0 / 3.0, 1.0 / 3.0];

/// How close the pulse width comes to either end: a pulse of width 0 or 1 is a constant.
const NARROWEST: f32 = 0.05;

/// The virtual analog engine: oscillator 1, which is a supersaw's seven saws, oscillator 2 playing
/// the same wave (one saw for the supersaw), the sub a square an octave down and the noise.
pub struct Synth {
    /// Oscillator 1, and the supersaw's other six saws. Only the first sounds unless the wave is
    /// Supersaw.
    saws: [Oscillator; 7],
    second: Oscillator,
    sub: Oscillator,
    noise: Noise,
}

impl Synth {
    pub const fn new() -> Self {
        Self {
            saws: [const { Oscillator::new(0.0) }; 7],
            second: Oscillator::new(0.0),
            sub: Oscillator::new(0.0),
            noise: Noise::new(0),
        }
    }

    /// Starts a note. The plain oscillators start at phase 0, so a sound hits the same way each
    /// time; the supersaw's other six saws and the noise start from `seed`, so they vary from hit
    /// to hit. The saws' phases come from the noise, not from `seed`'s own bits: a seed can be 0,
    /// which the noise turns into 1.
    pub fn start(&mut self, seed: u32) {
        *self = Self::new();
        self.noise = Noise::new(seed);
        for saw in &mut self.saws[1..] {
            *saw = Oscillator::new(libm::fabsf(self.noise.next()));
        }
    }

    /// Writes one chunk into `out` with oscillator 1 at `frequency`. In a `stereo` note Spread
    /// places the supersaw's saws, or oscillators 1 and 2, apart; the sub and the noise stay in the
    /// middle. A mono note has the same in both channels.
    pub fn render(
        &mut self,
        read: impl Fn(ParamId) -> i32,
        frequency: f32,
        stereo: bool,
        out: &mut [[f32; CHUNK]; 2],
    ) {
        let real = |entry: &Entry| param::real(entry, read(entry.id));
        // `Oscillator::next` needs an increment under one half.
        let increment = |hz: f32| libm::fminf(hz, 0.45 * SAMPLE_RATE as f32) / SAMPLE_RATE as f32;
        // Constant power, with both gains exactly `gain` in the middle so a mono note's channels
        // are equal.
        let placed = |gain: f32, place: f32| {
            (
                gain * libm::sqrtf(1.0 - place),
                gain * libm::sqrtf(1.0 + place),
            )
        };
        let spread = if stereo { real(&SPREAD) } else { 0.0 };
        let wave = match read(WAVE.id) {
            PULSE => Wave::Pulse,
            TRIANGLE => Wave::Triangle,
            SINE => Wave::Sine,
            _ => Wave::Saw,
        };
        let width = NARROWEST + (1.0 - 2.0 * NARROWEST) * real(&SHAPE);
        let supersaw = read(WAVE.id) == SUPERSAW;
        let (count, detune, gain) = if supersaw {
            (7, real(&SHAPE), SOURCE * SUPERSAW_SAW)
        } else {
            (1, 0.0, SOURCE)
        };
        // Spread widens without moving the sound: the supersaw's saws lie symmetrically with
        // oscillator 2 in the middle, and otherwise oscillators 1 and 2 lie apart as far as
        // oscillator 2 is loud, so a silent one leaves oscillator 1 in the middle.
        let second_level = real(&OSCILLATOR_2_LEVEL);
        let apart = if supersaw { 0.0 } else { spread * second_level };
        let saws = PLACES.map(|place| {
            let (left, right) = placed(gain, if supersaw { place * spread } else { -apart });
            (
                increment(frequency * libm::exp2f(place * detune / 12.0)),
                left,
                right,
            )
        });
        let second = increment(
            frequency
                * libm::exp2f(
                    (read(OSCILLATOR_2_INTERVAL.id) as f32
                        + read(OSCILLATOR_2_FINE_TUNE.id) as f32 / 100.0)
                        / 12.0,
                ),
        );
        let (second_left, second_right) = placed(SOURCE * second_level, apart);
        let sub = increment(frequency / 2.0);
        let (sub_level, noise_level) = (SOURCE * real(&SUB_LEVEL), SOURCE * real(&NOISE_LEVEL));

        let [out_left, out_right] = out;
        for (out_left, out_right) in out_left.iter_mut().zip(out_right) {
            let (mut left, mut right) = (0.0, 0.0);
            for (saw, &(increment, to_left, to_right)) in
                self.saws.iter_mut().zip(&saws).take(count)
            {
                let x = saw.next(wave, increment, width);
                left += x * to_left;
                right += x * to_right;
            }
            let x = self.second.next(wave, second, width);
            let middle =
                self.sub.next(Wave::Pulse, sub, 0.5) * sub_level + self.noise.next() * noise_level;
            *out_left = left + x * second_left + middle;
            *out_right = right + x * second_right + middle;
        }
    }
}

impl Default for Synth {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use super::*;
    use crate::param::{SAW, SUPERSAW, WAVE};
    use crate::project::pool::{SOUND_DEFAULTS, Sound};

    #[test]
    fn the_supersaw_varies_with_the_seed_and_plain_waves_do_not() {
        let chunk = |wave, seed| {
            let mut values = SOUND_DEFAULTS;
            values[Sound::place(WAVE.id)] = wave;
            let mut synth = Synth::new();
            synth.start(seed);
            let mut out = [[0.0; CHUNK]; 2];
            synth.render(|id| values[Sound::place(id)], 261.6, false, &mut out);
            out
        };

        assert_eq!(chunk(SAW, 1), chunk(SAW, 2));
        assert_ne!(chunk(SUPERSAW, 1), chunk(SUPERSAW, 2));
    }
}
