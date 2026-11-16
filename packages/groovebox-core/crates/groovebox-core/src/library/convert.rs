use super::wav::MAX_RATE;
use crate::audio::SAMPLE_RATE;
use core::f64::consts::PI;

/// The kernel's zero crossings on each side of its centre.
const ZERO_CROSSINGS: u32 = 32;
/// The table's steps from one zero crossing to the next.
const PHASES: u32 = 256;
/// The table runs from the centre to the last zero crossing, both included.
const TABLE: usize = (ZERO_CROSSINGS * PHASES) as usize + 1;
const BETA: f64 = 8.6;
/// The input frames kept: every frame the kernel reaches at the highest rate.
const HISTORY: usize = 2 * reach(MAX_RATE) as usize;

/// The input frames the kernel reaches on each side of an output frame at `rate`: its zero
/// crossings lie rate / (0.95 × the lower of the two rates) input frames apart, 0.95 being 19 / 20.
const fn reach(rate: u32) -> u64 {
    let lower = if rate < SAMPLE_RATE {
        rate
    } else {
        SAMPLE_RATE
    };
    (ZERO_CROSSINGS as u64 * 20 * rate as u64).div_ceil(19 * lower as u64)
}

/// The frames `input_frames` at `rate` become at 48 kHz, rounded up.
pub fn output_frames(input_frames: u64, rate: u32) -> u64 {
    (input_frames * u64::from(SAMPLE_RATE)).div_ceil(u64::from(rate))
}

/// `x × 32,768` rounded half away from zero, without dither.
pub fn to_i16(x: f32) -> i16 {
    // The cast holds it within -32,768 and 32,767.
    libm::roundf(x * 32_768.0) as i16
}

/// Converts interleaved frames at any rate the device reads to 48 kHz and 16 bits through a
/// Kaiser-windowed sinc (β 8.6, 32 zero crossings a side, cutoff 0.95 of the lower Nyquist
/// frequency). Output frame `n` sits at input position `n × rate / 48,000`, which is exact in
/// integers, so the output does not depend on how the input is cut into pieces.
pub struct Converter {
    rate: u32,
    channels: u8,
    reach: u64,
    /// The table's steps per 48,000th of an input frame.
    step: f32,
    /// The kernel from its centre outwards, in `PHASES` steps per zero crossing, scaled so that
    /// it passes a constant unchanged.
    table: [f32; TABLE],
    /// The latest input frames, frame `k` at `k % HISTORY`.
    history: [[f32; 2]; HISTORY],
    /// The input frames taken, with the silence `finish` adds.
    frames: u64,
    /// The next output frame.
    next: u64,
}

impl Converter {
    /// `rate` lies from 1,000 to 384,000 and `channels` is 1 or 2.
    pub fn new(rate: u32, channels: u8) -> Self {
        // The kernel's zero crossings per input frame.
        let density = 0.95 * f64::from(rate.min(SAMPLE_RATE)) / f64::from(rate);
        let mut table = [0.0; TABLE];
        if rate != SAMPLE_RATE {
            // The modified Bessel function of the first kind and order 0, from its power series,
            // whose terms are far below an f64's precision by the 32nd for x up to β.
            let i0 = |x: f64| {
                (1..32)
                    .fold((1.0, 1.0), |(sum, term), k| {
                        let term = term * x / 2.0 / f64::from(k);
                        (sum + term * term, term)
                    })
                    .0
            };
            for (k, entry) in (0u32..).zip(table.iter_mut()) {
                let crossings = f64::from(k) / f64::from(PHASES);
                let sinc = if k == 0 {
                    1.0
                } else {
                    libm::sin(PI * crossings) / (PI * crossings)
                };
                let edge = crossings / f64::from(ZERO_CROSSINGS);
                let window = i0(BETA * libm::sqrt(1.0 - edge * edge)) / i0(BETA);
                *entry = (density * sinc * window) as f32;
            }
        }
        Self {
            rate,
            channels,
            reach: reach(rate),
            step: (density * f64::from(PHASES) / f64::from(SAMPLE_RATE)) as f32,
            table,
            history: [[0.0; 2]; HISTORY],
            frames: 0,
            next: 0,
        }
    }

    /// Takes interleaved frames and gives every output sample they complete, interleaved. At 48
    /// kHz it only rounds.
    pub fn push(&mut self, input: &[f32], out: &mut impl FnMut(i16)) {
        if self.rate == SAMPLE_RATE {
            input.iter().for_each(|&x| out(to_i16(x)));
        } else {
            input
                .chunks_exact(usize::from(self.channels))
                .for_each(|frame| self.take(frame, out));
        }
    }

    /// Gives the rest as though silence followed the input, so the total is `output_frames`.
    pub fn finish(&mut self, out: &mut impl FnMut(i16)) {
        let frames = self.frames;
        while self.next * u64::from(self.rate) / u64::from(SAMPLE_RATE) < frames {
            self.take(&[0.0; 2][..usize::from(self.channels)], out);
        }
    }

    /// Keeps one input frame and gives every output frame whose last tap it is.
    fn take(&mut self, frame: &[f32], out: &mut impl FnMut(i16)) {
        self.history[(self.frames % HISTORY as u64) as usize][..frame.len()].copy_from_slice(frame);
        self.frames += 1;
        loop {
            let position = self.next * u64::from(self.rate);
            let (index, remainder) = (
                position / u64::from(SAMPLE_RATE),
                position % u64::from(SAMPLE_RATE),
            );
            if index + self.reach >= self.frames {
                return;
            }
            let mut sums = [0.0f32; 2];
            // The frames before the first are silent.
            for tap in (index + 1).saturating_sub(self.reach)..=index + self.reach {
                // In 48,000ths of an input frame the distance is an integer, exact in an f32.
                let place = ((index as i64 - tap as i64) * i64::from(SAMPLE_RATE)
                    + remainder as i64)
                    .unsigned_abs() as f32
                    * self.step;
                let at = place as usize;
                let weight = match self.table.get(at..at + 2) {
                    Some(&[left, right]) => left + (right - left) * (place - at as f32),
                    _ => 0.0,
                };
                for (sum, x) in sums
                    .iter_mut()
                    .zip(self.history[(tap % HISTORY as u64) as usize])
                {
                    *sum += x * weight;
                }
            }
            sums[..usize::from(self.channels)]
                .iter()
                .for_each(|&sum| out(to_i16(sum)));
            self.next += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::wav::{Encoding, decode, parse, sine};
    use core::f64::consts::TAU;
    use std::vec::Vec;

    /// The interleaved samples of a whole WAV file.
    fn samples(file: &[u8]) -> Vec<f32> {
        let header = parse(file, file.len() as u64).unwrap();
        let mut samples =
            std::vec![0.0; header.frames as usize * usize::from(header.format.channels)];
        decode(
            header.format.encoding,
            &file[header.data_at as usize..],
            &mut samples,
        );
        samples
    }

    /// `input` at `rate` converted in pieces of `frames` frames.
    fn convert(input: &[f32], rate: u32, channels: u8, frames: usize) -> Vec<i16> {
        let mut converter = Converter::new(rate, channels);
        let mut output = Vec::new();
        for piece in input.chunks(frames * usize::from(channels)) {
            converter.push(piece, &mut |x| output.push(x));
        }
        converter.finish(&mut |x| output.push(x));
        output
    }

    /// The root mean square of `samples` in dB of full scale.
    fn rms_db(samples: &[f64]) -> f64 {
        let power = samples.iter().map(|x| x * x).sum::<f64>() / samples.len() as f64;
        10.0 * libm::log10(power)
    }

    /// `output` in shares of full scale.
    fn real(output: &[i16]) -> Vec<f64> {
        output.iter().map(|&x| f64::from(x) / 32_768.0).collect()
    }

    #[test]
    fn at_48_khz_16_bit_passes_bit_exact() {
        let every: Vec<i16> = (i16::MIN..=i16::MAX).collect();
        let bytes: Vec<u8> = every.iter().flat_map(|x| x.to_le_bytes()).collect();
        let mut input = std::vec![0.0; every.len()];
        decode(Encoding::Int16, &bytes, &mut input);

        assert_eq!(convert(&input, 48_000, 2, 4_096), every);
    }

    #[test]
    fn the_length_rounds_up() {
        assert_eq!(output_frames(44_100, 44_100), 48_000);
        assert_eq!(output_frames(10, 44_100), 11);
        assert_eq!(output_frames(1, 96_000), 1);
    }

    #[test]
    fn a_44_1_khz_sine_keeps_its_pitch_and_stays_clean() {
        let output = convert(
            &samples(&sine(1_000.0, 1.0, 44_100, Encoding::Float32, 1)),
            44_100,
            1,
            4_096,
        );

        assert_eq!(output.len(), 48_000);
        let crossings = output
            .windows(2)
            .filter(|pair| pair[0] < 0 && pair[1] >= 0)
            .count();
        assert!((999..=1_001).contains(&crossings), "{crossings}");
        let output = real(&output);
        let omega = TAU * 1_000.0 / 48_000.0;
        // 48,000 frames hold 1,000 whole cycles, so the sine and the cosine are orthogonal.
        let (sine, cosine) = output
            .iter()
            .enumerate()
            .fold((0.0, 0.0), |(s, c), (n, y)| {
                (
                    s + y * libm::sin(omega * n as f64),
                    c + y * libm::cos(omega * n as f64),
                )
            });
        let (sine, cosine) = (2.0 * sine / 48_000.0, 2.0 * cosine / 48_000.0);
        let rest: Vec<f64> = output
            .iter()
            .enumerate()
            .map(|(n, y)| {
                y - sine * libm::sin(omega * n as f64) - cosine * libm::cos(omega * n as f64)
            })
            .collect();
        let rest = rms_db(&rest);
        assert!(rest < -80.0, "{rest} dB");
    }

    #[test]
    fn a_tone_above_24_khz_is_removed() {
        let output = convert(
            &samples(&sine(30_000.0, 1.0, 96_000, Encoding::Float32, 1)),
            96_000,
            1,
            4_096,
        );

        // Switching the tone on and off clicks below 24 kHz, which is kept, so only the frames
        // whose kernel lies wholly inside the tone count: 2 input frames make 1 output frame.
        let edge = reach(96_000) as usize / 2;
        let level = rms_db(&real(&output[edge..output.len() - edge]));
        assert!(level < -80.0, "{level} dB");
    }

    #[test]
    fn pieces_give_what_one_push_gives() {
        let input = samples(&sine(1_000.0, 0.2, 44_100, Encoding::Float32, 2));
        let whole = convert(&input, 44_100, 2, input.len());

        assert_eq!(whole.len() as u64, 2 * output_frames(8_820, 44_100));
        for frames in [1, 17, 4_096] {
            assert_eq!(convert(&input, 44_100, 2, frames), whole, "{frames}");
        }
    }

    #[test]
    fn rounding_is_half_away_from_zero_and_loud_floats_clip() {
        assert_eq!(to_i16(1.5), 32_767);
        assert_eq!(to_i16(-1.0), -32_768);
        assert_eq!(to_i16(0.5 / 32_768.0), 1);
        assert_eq!(to_i16(-0.5 / 32_768.0), -1);
    }
}
