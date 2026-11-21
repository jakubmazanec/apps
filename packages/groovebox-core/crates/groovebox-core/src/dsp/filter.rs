use super::flush;
use crate::audio::SAMPLE_RATE;
use core::f32::consts::PI;

#[derive(Clone, Copy, Debug)]
pub enum Mode {
    Lp12,
    Lp24,
    Hp,
    Bp,
}

/// One trapezoidal state-variable stage in Zavalishin's form.
#[derive(Clone, Copy)]
struct Stage {
    first: f32,
    second: f32,
}

impl Stage {
    /// Takes in `x` and returns the band and the low outputs.
    fn run(&mut self, x: f32, a1: f32, a2: f32, a3: f32) -> (f32, f32) {
        let difference = x - self.second;
        let band = a1 * self.first + a2 * difference;
        let low = self.second + a2 * self.first + a3 * difference;
        self.first = flush(2.0 * band - self.first);
        self.second = flush(2.0 * low - self.second);
        (band, low)
    }
}

/// A state-variable filter of two stages. Low-pass 24 runs both, every other mode the first.
pub struct Filter {
    damping: f32,
    a1: f32,
    a2: f32,
    a3: f32,
    stages: [Stage; 2],
}

impl Filter {
    pub const fn new() -> Self {
        Self {
            damping: 0.0,
            a1: 0.0,
            a2: 0.0,
            a3: 0.0,
            stages: [Stage {
                first: 0.0,
                second: 0.0,
            }; 2],
        }
    }

    /// Sets the cutoff, held within 20 Hz and 0.45 times the sample rate, and the resonance from 0
    /// to 1. Call it once per chunk before `process`: the tangent is too dear to find per sample.
    pub fn tune(&mut self, cutoff_hz: f32, resonance: f32) {
        let cutoff_hz = libm::fminf(libm::fmaxf(cutoff_hz, 20.0), 0.45 * SAMPLE_RATE as f32);
        let g = libm::tanf(PI * cutoff_hz / SAMPLE_RATE as f32);
        self.damping = 2.0 - 1.98 * resonance;
        self.a1 = 1.0 / (1.0 + g * (g + self.damping));
        self.a2 = g * self.a1;
        self.a3 = g * self.a2;
    }

    /// The cutoff the filter is tuned to, found back from its coefficients.
    #[cfg(test)]
    pub fn cutoff(&self) -> f32 {
        libm::atanf(self.a2 / self.a1) * SAMPLE_RATE as f32 / PI
    }

    /// Scales what the filter holds of the samples before by `factor`. The filter is linear, so
    /// they then come out as if they had come in `factor` times as loud.
    pub fn scale(&mut self, factor: f32) {
        for stage in &mut self.stages {
            stage.first *= factor;
            stage.second *= factor;
        }
    }

    /// Filters one sample. The band-pass is scaled by the damping so that it peaks at 0 dB at the
    /// cutoff whatever the resonance, as the Filter page draws it.
    pub fn process(&mut self, mode: Mode, x: f32) -> f32 {
        let (band, low) = self.stages[0].run(x, self.a1, self.a2, self.a3);
        match mode {
            Mode::Lp12 => low,
            Mode::Lp24 => self.stages[1].run(low, self.a1, self.a2, self.a3).1,
            Mode::Hp => x - self.damping * band - low,
            Mode::Bp => self.damping * band,
        }
    }
}

impl Default for Filter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::SAMPLE_RATE;
    use crate::dsp::osc::{Noise, Oscillator, Wave};

    const MODES: [Mode; 4] = [Mode::Lp12, Mode::Lp24, Mode::Hp, Mode::Bp];

    /// The level in dB of a sine at `hz` after the filter, against the sine itself, over the
    /// second half of a second so the filter has settled.
    fn gain(mode: Mode, cutoff_hz: f32, resonance: f32, hz: f32) -> f32 {
        let mut filter = Filter::new();
        filter.tune(cutoff_hz, resonance);
        let mut sine = Oscillator::new(0.0);
        let (mut input, mut output) = (0.0, 0.0);
        for n in 0..SAMPLE_RATE {
            let x = sine.next(Wave::Sine, hz / SAMPLE_RATE as f32, 0.0);
            let y = filter.process(mode, x);
            if n >= SAMPLE_RATE / 2 {
                input += f64::from(x * x);
                output += f64::from(y * y);
            }
        }
        (10.0 * libm::log10(output / input)) as f32
    }

    #[test]
    fn low_pass_passes_100_hz_and_cuts_10_khz() {
        assert!(libm::fabsf(gain(Mode::Lp12, 1_000.0, 0.0, 100.0)) < 1.0);
        assert!(gain(Mode::Lp12, 1_000.0, 0.0, 10_000.0) < -30.0);
    }

    #[test]
    fn lp_24_falls_twice_as_steeply() {
        assert!(gain(Mode::Lp24, 1_000.0, 0.0, 10_000.0) < -60.0);
    }

    #[test]
    fn high_pass_and_band_pass_keep_their_side() {
        assert!(gain(Mode::Hp, 1_000.0, 0.0, 100.0) < -30.0);
        assert!(libm::fabsf(gain(Mode::Hp, 1_000.0, 0.0, 10_000.0)) < 1.0);
        assert!(gain(Mode::Bp, 1_000.0, 0.5, 100.0) < -10.0);
        assert!(gain(Mode::Bp, 1_000.0, 0.5, 10_000.0) < -10.0);
    }

    #[test]
    fn band_pass_peaks_at_0_db_at_the_cutoff_whatever_the_resonance() {
        for resonance in [0.0, 0.5, 1.0] {
            let peak = gain(Mode::Bp, 1_000.0, resonance, 1_000.0);

            assert!(
                libm::fabsf(peak) < 0.1,
                "{peak} dB at resonance {resonance}"
            );
        }
    }

    #[test]
    fn full_resonance_at_the_top_stays_finite() {
        for mode in MODES {
            let mut filter = Filter::new();
            filter.tune(21_600.0, 1.0);
            let mut noise = Noise::new(1);

            assert!(
                (0..SAMPLE_RATE).all(|_| filter.process(mode, noise.next()).is_finite()),
                "{mode:?}"
            );
        }
    }

    #[test]
    fn silence_flushes_the_state_to_zero() {
        for mode in MODES {
            let mut filter = Filter::new();
            filter.tune(1_000.0, 0.5);
            filter.process(mode, 1.0);
            let last = (0..2 * SAMPLE_RATE)
                .map(|_| filter.process(mode, 0.0))
                .last();

            assert_eq!(last, Some(0.0), "{mode:?}");
        }
    }
}
