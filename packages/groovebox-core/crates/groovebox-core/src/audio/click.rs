use super::{CHUNK, SAMPLE_RATE};
use crate::dsp::osc::{Oscillator, Wave};

/// The click's pitch on a beat (S8). Tuned by ear.
pub const CLICK_HZ: f32 = 1_000.0;
/// The click's pitch on a bar's first beat (S8). Tuned by ear.
pub const FIRST_HZ: f32 = 2_000.0;
/// How long a click lasts: 30 ms (S8).
pub const CLICK_FRAMES: u32 = 1_440;
/// What the click's gain is multiplied by every sample: e^(-1/240), a time constant of 5 ms (S8).
pub const CLICK_DECAY: f32 = 0.995_842;

/// The metronome's click: a sine from phase 0 whose gain falls by `CLICK_DECAY` every sample,
/// `CLICK_FRAMES` long (S8).
pub struct Click {
    sine: Oscillator,
    /// The frequency over the sample rate.
    increment: f32,
    gain: f32,
    /// The samples it has left: 0 while it is silent.
    left: u32,
    /// Its next chunk fades out and it ends.
    fading: bool,
}

impl Click {
    /// Silent.
    pub const fn new() -> Self {
        Self {
            sine: Oscillator::new(0.0),
            increment: 0.0,
            gain: 1.0,
            left: 0,
            fading: false,
        }
    }

    /// Starts from phase 0 at full gain, at `FIRST_HZ` on a bar's `first` beat and at `CLICK_HZ`
    /// on the others; a click still sounding stops.
    pub fn start(&mut self, first: bool) {
        *self = Self {
            increment: (if first { FIRST_HZ } else { CLICK_HZ }) / SAMPLE_RATE as f32,
            left: CLICK_FRAMES,
            ..Self::new()
        };
    }

    /// Its next chunk fades out in a line to exactly 0 at its last sample, as a taken voice does,
    /// and it ends.
    pub fn silence(&mut self) {
        self.fading = true;
    }

    /// Adds one chunk of its samples to `out`.
    pub fn render(&mut self, out: &mut [f32; CHUNK]) {
        for (n, out) in out.iter_mut().enumerate().take(self.left as usize) {
            let fade = if self.fading {
                (CHUNK - 1 - n) as f32 / (CHUNK - 1) as f32
            } else {
                1.0
            };
            *out += self.sine.next(Wave::Sine, self.increment, 0.0) * self.gain * fade;
            self.gain *= CLICK_DECAY;
        }
        self.left = if self.fading {
            0
        } else {
            self.left.saturating_sub(CHUNK as u32)
        };
        self.fading = false;
    }
}

impl Default for Click {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests {
    use crate::audio::tests::clicked;
    use std::vec::Vec;

    /// Whether `samples` cross zero every `half` samples, rising first: between two crossings
    /// every sample has the sign of its half cycle.
    fn crosses_zero_every(half: usize, samples: &[f32]) -> bool {
        samples.chunks(half).enumerate().all(|(k, cycle)| {
            cycle[1..]
                .iter()
                .all(|&x| x != 0.0 && (x > 0.0) == (k % 2 == 0))
        })
    }

    #[test]
    fn a_click_is_a_falling_sine_of_30_ms() {
        let samples = clicked(false, 1_536);

        assert_eq!(samples[0].to_bits(), 0);
        assert!(crosses_zero_every(24, &samples[..1_440]));
        let peaks: Vec<f32> = samples[..1_440]
            .chunks(24)
            .map(|cycle| {
                cycle
                    .iter()
                    .fold(0.0, |peak, &x| libm::fmaxf(peak, libm::fabsf(x)))
            })
            .collect();
        assert!(peaks.windows(2).all(|pair| pair[1] < pair[0]), "{peaks:?}");
        assert!(samples[1_440..].iter().all(|x| x.to_bits() == 0));
    }

    #[test]
    fn the_first_beat_clicks_at_2_000_hz() {
        assert!(crosses_zero_every(12, &clicked(true, 1_440)));
    }
}
