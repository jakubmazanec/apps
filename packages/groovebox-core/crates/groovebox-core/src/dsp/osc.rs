use core::f32::consts::TAU;

#[derive(Clone, Copy, Debug)]
pub enum Wave {
    Saw,
    Pulse,
    Triangle,
    Sine,
}

/// The PolyBLEP correction that smooths a jump of the wave over the sample on either side of it.
/// `t` is the phase since the jump and `dt` the phase one sample takes.
fn blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let t = t / dt;
        t + t - t * t - 1.0
    } else if t > 1.0 - dt {
        let t = (t - 1.0) / dt;
        t * t + t + t + 1.0
    } else {
        0.0
    }
}

/// An oscillator that keeps its phase, a number from 0 up to but not including 1.
pub struct Oscillator {
    phase: f32,
}

impl Oscillator {
    pub const fn new(phase: f32) -> Self {
        Self { phase }
    }

    /// The next sample of `wave`, within -1 and 1. `increment` is the frequency over the sample
    /// rate, under one half. `width` is the share of the cycle a pulse spends high. A saw and a
    /// pulse smooth their jumps with PolyBLEP so they do not fold back into the audible range; a
    /// triangle and a sine are plain. Every wave starts at 0 at phase 0.
    pub fn next(&mut self, wave: Wave, increment: f32, width: f32) -> f32 {
        let phase = self.phase;
        self.phase += increment;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        match wave {
            Wave::Saw => phase + phase - 1.0 - blep(phase, increment),
            Wave::Pulse => {
                let falling = phase - width;
                let falling = if falling < 0.0 {
                    falling + 1.0
                } else {
                    falling
                };
                let level = if phase < width { 1.0 } else { -1.0 };
                level + blep(phase, increment) - blep(falling, increment)
            }
            Wave::Triangle => {
                let shifted = phase + 0.25;
                let shifted = if shifted >= 1.0 {
                    shifted - 1.0
                } else {
                    shifted
                };
                1.0 - 4.0 * libm::fabsf(shifted - 0.5)
            }
            Wave::Sine => libm::sinf(TAU * phase),
        }
    }
}

/// White noise from xorshift32, which repeats for the same seed.
pub struct Noise(u32);

impl Noise {
    /// A zero seed becomes 1: xorshift32 would stay at 0.
    pub const fn new(seed: u32) -> Self {
        Self(if seed == 0 { 1 } else { seed })
    }

    /// The next sample, within -1 and 1.
    #[expect(
        clippy::should_implement_trait,
        reason = "noise never ends, so it gives a sample, not an option"
    )]
    pub fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as i32 as f32 / 2_147_483_648.0
    }
}

/// The seed of the note that is the `count`th the audio part starts: MurmurHash3's 32-bit
/// finaliser, which mixes the count so that neighbouring notes get unrelated seeds.
pub fn seed(count: u32) -> u32 {
    let mut hash = count;
    hash ^= hash >> 16;
    hash = hash.wrapping_mul(0x85eb_ca6b);
    hash ^= hash >> 13;
    hash = hash.wrapping_mul(0xc2b2_ae35);
    hash ^ (hash >> 16)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::SAMPLE_RATE;

    const WAVES: [Wave; 4] = [Wave::Saw, Wave::Pulse, Wave::Triangle, Wave::Sine];

    /// One second of `wave` at `hz` from a fresh oscillator.
    fn second(wave: Wave, hz: f32, width: f32) -> impl Iterator<Item = f32> {
        let mut oscillator = Oscillator::new(0.0);
        (0..SAMPLE_RATE).map(move |_| oscillator.next(wave, hz / SAMPLE_RATE as f32, width))
    }

    #[test]
    fn a_440_hz_saw_crosses_zero_upwards_440_times_a_second() {
        let mut last = 0.0;
        let crossings = second(Wave::Saw, 440.0, 0.5)
            .filter(|&x| {
                let upwards = last < 0.0 && x >= 0.0;
                last = x;
                upwards
            })
            .count();

        assert!(crossings.abs_diff(440) <= 1, "{crossings} crossings");
    }

    #[test]
    fn every_wave_stays_within_one_and_starts_at_phase_0() {
        for wave in WAVES {
            for hz in [100.0, 5_000.0, 15_000.0] {
                for width in [0.0, 0.05, 0.5, 0.95, 1.0] {
                    assert!(
                        second(wave, hz, width).all(|x| x.is_finite() && libm::fabsf(x) <= 1.0),
                        "{wave:?} at {hz} Hz, width {width}"
                    );
                    assert!(second(wave, hz, width).eq(second(wave, hz, width)));
                }
                assert_eq!(second(wave, hz, 0.5).next(), Some(0.0));
            }
        }
    }

    #[test]
    fn a_square_spends_half_its_time_high() {
        let high = second(Wave::Pulse, 1_000.0, 0.5)
            .filter(|&x| x > 0.0)
            .count();

        assert!(
            high.abs_diff(SAMPLE_RATE as usize / 2) <= SAMPLE_RATE as usize / 100,
            "{high} positive samples"
        );
    }

    #[test]
    fn noise_repeats_for_its_seed_only() {
        let sequence = |seed| {
            let mut noise = Noise::new(seed);
            [(); 64].map(|()| noise.next())
        };

        assert_eq!(sequence(7), sequence(7));
        assert_ne!(sequence(7), sequence(8));
        assert!(sequence(0).iter().all(|&x| libm::fabsf(x) <= 1.0));
        assert_ne!(seed(0), seed(1));
    }
}
