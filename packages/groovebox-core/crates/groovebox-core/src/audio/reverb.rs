// Copyright 2014 Emilie Gillet.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// Ported from rings/dsp/fx/reverb.h and rings/dsp/fx/fx_engine.h of
// https://github.com/pichenettes/eurorack and dsp/cosine_oscillator.h of
// https://github.com/pichenettes/stmlib.
// Changed from the original: ported to Rust; a pre-delay and a low cut at 100 Hz on the input;
// the room added at Level on top of the dry sound instead of crossfading the two; a clear that
// counts the samples since it instead of filling the memory with zeros; the oscillators as 32-bit
// integer phases through `cosf`, stepped once a chunk.
//! Mutable Instruments Rings's reverb: four all-passes that diffuse the input, then a loop of two
//! all-passes and a delay on each side, in one ring of 16-bit samples (S13).

use super::delay::Crossfade;
use super::{CHUNK, SAMPLE_RATE};
use crate::dsp::filter::OnePole;
use crate::dsp::flush;
use crate::dsp::line::{Line, compress};
use crate::effect_ram::Piece;
use crate::param::{self, Entry, REVERB_DECAY, REVERB_LEVEL, REVERB_PRE_DELAY, REVERB_TONE};
use crate::project::track::{SLOT_VALUES, Slot};
use core::f32::consts::TAU;

/// Rings's ring: the first samples of the piece, a power of two for its `MASK`.
const RING: usize = 32_768;
const MASK: usize = RING - 1;
/// The longest pre-delay, 100 ms: a mono line after the ring.
const PRE_DELAY: usize = 4_800;
/// The lengths of Rings's ten lines: the four all-passes on the input, then the left side's two
/// all-passes and delay in the loop, then the right side's.
const LENGTHS: [u32; 10] = [150, 214, 319, 527, 2_182, 2_690, 4_501, 2_525, 2_197, 6_312];
/// Where each line starts in the ring: Rings's `base`, the lines before it each one longer.
const BASES: [u32; 10] = {
    let mut bases = [0; 10];
    let mut line = 1;
    while line < 10 {
        bases[line] = bases[line - 1] + LENGTHS[line - 1] + 1;
        line += 1;
    }
    bases
};
const DAP1A: usize = 4;
const DAP1B: usize = 5;
const DEL1: usize = 6;
const DAP2A: usize = 7;
const DAP2B: usize = 8;
const DEL2: usize = 9;
/// Rings's diffusion.
const KAP: f32 = 0.625;
/// How far Rings's two oscillators move a chunk, at 0.5 Hz and 0.3 Hz, in turns of 2^32.
const WOBBLE_STEPS: [u32; 2] = [wobble_step(5), wobble_step(3)];

/// How far an oscillator at `tenths` tenths of a Hz moves a chunk, in turns of 2^32.
const fn wobble_step(tenths: u64) -> u32 {
    ((tenths << 32) * CHUNK as u64 / (10 * SAMPLE_RATE as u64)) as u32
}

/// Rings's `Context`: one sample's reads and writes of the ring through an accumulator.
struct Context<'a> {
    ring: &'a mut [i16],
    /// Rings's `write_ptr` for this sample.
    at: u32,
    /// The samples started since the clear, this one counted.
    started: u32,
    accumulator: f32,
    previous_read: f32,
    /// Whether a write stored a sample that is not 0.
    loud: bool,
}

impl Context<'_> {
    /// What `line` held `back` samples ago, 0 when that was before the clear (S10).
    fn sample(&self, line: usize, back: u32) -> f32 {
        if back >= self.started {
            0.0
        } else {
            f32::from(self.ring[(self.at + BASES[line] + back) as usize & MASK]) / 32_768.0
        }
    }

    /// Rings's `Read(line TAIL, scale)` then `WriteAllPass(line, −scale)`.
    fn all_pass(&mut self, line: usize, scale: f32) {
        self.previous_read = self.sample(line, LENGTHS[line] - 1);
        self.accumulator += self.previous_read * scale;
        self.write(line, -scale);
        self.accumulator += self.previous_read;
    }

    /// Rings's `Interpolate`: `offset` and `offset + 1` samples back, mixed by the fraction.
    fn interpolate(&mut self, line: usize, offset: f32, scale: f32) {
        let whole = offset as u32;
        let (a, b) = (self.sample(line, whole), self.sample(line, whole + 1));
        self.previous_read = a + (b - a) * (offset - whole as f32);
        self.accumulator += self.previous_read * scale;
    }

    /// Rings's `Write(line, scale)`: stores the accumulator, then scales it.
    fn write(&mut self, line: usize, scale: f32) {
        let stored = compress(self.accumulator, 32_768.0);
        self.ring[(self.at + BASES[line]) as usize & MASK] = stored;
        self.loud |= stored != 0;
        self.accumulator *= scale;
    }

    /// Rings's `Lp`.
    fn low_pass(&mut self, state: &mut f32, coefficient: f32) {
        *state = flush(*state + coefficient * (self.accumulator - *state));
        self.accumulator = *state;
    }
}

/// Rings's reverb in the ring at the start of a piece, its pre-delay in the line after it (S13).
#[derive(Clone, Copy)]
pub struct Reverb {
    /// Rings's `write_ptr`: where the first line is written, one lower each sample.
    at: u32,
    /// The samples started since the clear, held at `u32::MAX`.
    started: u32,
    /// The samples since the last that stored a sample that is not 0 in the ring, held at
    /// `u32::MAX`, which it starts at.
    quiet: u32,
    pre_delay: Line,
    /// Where the pre-delay is read, 0 passing the input straight.
    crossfade: Crossfade,
    low_cut: OnePole,
    /// Each side's low-pass in the loop: Rings's `lp_decay_1_` and `lp_decay_2_`.
    low_passes: [f32; 2],
    /// Rings's two oscillators, in turns of 2^32.
    phases: [u32; 2],
}

impl Reverb {
    /// A reverb that holds no room, with no pre-delay.
    pub const fn new() -> Self {
        Self {
            at: 0,
            started: 0,
            quiet: u32::MAX,
            pre_delay: Line::new(8_192.0),
            crossfade: Crossfade::new(0),
            low_cut: OnePole::new(),
            low_passes: [0.0; 2],
            phases: [0; 2],
        }
    }

    /// The room so far is gone from the next chunk on. Writes nothing.
    pub fn clear(&mut self) {
        *self = Self {
            crossfade: self.crossfade,
            ..Self::new()
        };
    }

    pub fn ringing(&self, piece: &Piece) -> bool {
        self.quiet < RING as u32 || self.pre_delay.ringing(&piece[RING..][..PRE_DELAY])
    }

    /// One chunk of `bus` through the reverb, with the slot's `values` (in list order).
    pub fn render(
        &mut self,
        values: &[i32; SLOT_VALUES],
        bus: &mut [[f32; CHUNK]; 2],
        piece: &mut Piece,
    ) {
        let real = |entry: &Entry| param::real(entry, values[Slot::place(entry.id)]);
        let krt = 0.4 + (0.98 - 0.4) * real(&REVERB_DECAY);
        let klp = 0.2 + (0.9 - 0.2) * real(&REVERB_TONE);
        let level = real(&REVERB_LEVEL);
        // At most 100 ms, 4,800 samples.
        self.crossfade.aim(
            (real(&REVERB_PRE_DELAY) * SAMPLE_RATE as f32) as u32,
            self.pre_delay.ringing(&piece[RING..][..PRE_DELAY]),
        );
        let low_cut = OnePole::gain(100.0);
        let [wobble_1, wobble_2] = self
            .phases
            .map(|phase| 0.5 + 0.5 * libm::cosf(TAU * (phase as f32 / 4_294_967_296.0)));
        for (phase, step) in self.phases.iter_mut().zip(WOBBLE_STEPS) {
            *phase = phase.wrapping_add(step);
        }

        let (ring, rest) = piece.split_at_mut(RING);
        let line = &mut rest[..PRE_DELAY];
        let [lefts, rights] = bus;
        for (left, right) in lefts.iter_mut().zip(rights) {
            let cut = self.low_cut.high_pass(*left + *right, low_cut);
            let input = self.crossfade.read(|back| {
                if back == 0 {
                    cut
                } else {
                    self.pre_delay.read(line, back)
                }
            });
            self.pre_delay.write(line, cut);
            self.crossfade.step();
            // Rings's `Start`.
            self.at = (self.at + MASK as u32) & MASK as u32;
            self.started = self.started.saturating_add(1);
            let mut c = Context {
                ring: &mut *ring,
                at: self.at,
                started: self.started,
                accumulator: input * 0.2,
                previous_read: 0.0,
                loud: false,
            };

            for ap in 0..4 {
                c.all_pass(ap, KAP);
            }
            let apout = c.accumulator;

            c.interpolate(DEL2, 6_261.0 + 50.0 * wobble_2, krt);
            c.low_pass(&mut self.low_passes[0], klp);
            c.all_pass(DAP1A, -KAP);
            c.all_pass(DAP1B, KAP);
            c.write(DEL1, 2.0);
            let wet_left = c.accumulator;

            c.accumulator = apout;
            c.interpolate(DEL1, 4_460.0 + 40.0 * wobble_1, krt);
            c.low_pass(&mut self.low_passes[1], klp);
            c.all_pass(DAP2A, KAP);
            c.all_pass(DAP2B, -KAP);
            c.write(DEL2, 2.0);
            let wet_right = c.accumulator;

            self.quiet = if c.loud {
                0
            } else {
                self.quiet.saturating_add(1)
            };
            if level > 0.0 {
                *left += level * wet_left;
                *right += level * wet_right;
            }
        }
        if !self.ringing(piece) {
            self.low_cut = OnePole::new();
            self.low_passes = [0.0; 2];
        }
    }
}

impl Default for Reverb {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::delay::CROSSFADE;
    use crate::audio::delay::tests::{impulse, piece, values};
    use crate::param::{REVERB_DECAY, REVERB_LEVEL, REVERB_PRE_DELAY};
    use std::vec::Vec;

    /// Both sides of `input` through `reverb` chunk by chunk, with `values`.
    fn through(
        reverb: &mut Reverb,
        piece: &mut Piece,
        values: &[i32; SLOT_VALUES],
        input: [&[f32]; 2],
    ) -> [Vec<f32>; 2] {
        let mut out = [Vec::new(), Vec::new()];
        for (left, right) in input[0].chunks(CHUNK).zip(input[1].chunks(CHUNK)) {
            let mut bus = [[0.0; CHUNK]; 2];
            bus[0].copy_from_slice(left);
            bus[1].copy_from_slice(right);
            reverb.render(values, &mut bus, piece);
            out[0].extend(bus[0]);
            out[1].extend(bus[1]);
        }
        out
    }

    /// The sum of the squares of `samples`.
    fn energy(samples: &[f32]) -> f64 {
        samples.iter().map(|&x| f64::from(x * x)).sum()
    }

    #[test]
    fn an_impulse_gives_a_tail_on_both_sides_that_fades() {
        let values = values(&[(&REVERB_LEVEL, 65_535)]);

        // The impulse on the left side only: the room reaches both.
        let out = through(
            &mut Reverb::new(),
            &mut piece(),
            &values,
            [&impulse(0.5, 48_000), &[0.0; 48_000]],
        );

        for side in out {
            // After the impulse itself, which the dry left side holds.
            assert!(side[1..9_600].iter().any(|&x| x != 0.0));
            let (first, second) = (energy(&side[1..24_000]), energy(&side[24_000..]));
            assert!(second < first, "{second} and {first}");
        }
    }

    #[test]
    fn a_longer_decay_rings_longer() {
        let input = impulse(0.5, 96_000);
        let late = |decay: i32| {
            let values = values(&[(&REVERB_LEVEL, 65_535), (&REVERB_DECAY, decay)]);
            let [left, right] =
                through(&mut Reverb::new(), &mut piece(), &values, [&input, &input]);
            energy(&left[48_000..]) + energy(&right[48_000..])
        };

        let (long, short) = (late(65_535), late(0));

        assert!(long > short, "{long} and {short}");
    }

    #[test]
    fn pre_delay_holds_the_tail_back() {
        // The impulse on the left, which a new reverb takes through the pre-delay at once, since
        // the pre-delay's line holds only silence; the right side holds only the room.
        let first_sound = |pre_delay: i32| {
            let values = values(&[(&REVERB_LEVEL, 65_535), (&REVERB_PRE_DELAY, pre_delay)]);
            let [_, right] = through(
                &mut Reverb::new(),
                &mut piece(),
                &values,
                [&impulse(0.5, 12_000), &[0.0; 12_000]],
            );
            right.iter().position(|&x| x != 0.0)
        };

        assert_eq!(first_sound(0), Some(0));
        assert_eq!(first_sound(65_535), Some(4_800));
    }

    /// After an impulse with no pre-delay and `lead` samples of silence, Pre-delay turns to 100 ms
    /// with a hit on the left at `hit`, while the room rings at Decay 100%: whether the pre-delay's
    /// line still rang at the turn, and the first of the 4,800 samples after it at which the right
    /// side, which holds only the room, differs from the same without the hit.
    fn after_a_pre_delay_turn(lead: usize, hit: usize) -> (bool, Option<usize>) {
        let at = |pre_delay| {
            values(&[
                (&REVERB_LEVEL, 65_535),
                (&REVERB_DECAY, 65_535),
                (&REVERB_PRE_DELAY, pre_delay),
            ])
        };
        let room = |hit: Option<usize>| {
            let (mut reverb, mut piece) = (Reverb::new(), piece());
            let before = impulse(0.5, CHUNK + lead);
            through(
                &mut reverb,
                &mut piece,
                &at(0),
                [&before, &std::vec![0.0; before.len()]],
            );
            assert!(reverb.ringing(&piece));
            let rang = reverb.pre_delay.ringing(&piece[RING..][..PRE_DELAY]);
            let mut left = [0.0; PRE_DELAY];
            if let Some(hit) = hit {
                left[hit] = 0.5;
            }
            let [_, right] = through(
                &mut reverb,
                &mut piece,
                &at(65_535),
                [&left, &[0.0; PRE_DELAY]],
            );
            (rang, right)
        };

        let ((rang, with), (_, without)) = (room(Some(hit)), room(None));
        (rang, with.iter().zip(&without).position(|(a, b)| a != b))
    }

    #[test]
    fn a_silent_pre_delay_takes_a_new_time_at_once_while_the_room_rings() {
        // The hit waits in the pre-delay: none of it reaches the room for 100 ms.
        assert_eq!(after_a_pre_delay_turn(9_600, 0), (false, None));
    }

    #[test]
    fn a_ringing_pre_delay_crossfades_to_a_new_time() {
        // Until the crossfade ends a hit still reaches the room in part straight, then not at all.
        let last = CROSSFADE as usize - 1;

        assert_eq!(after_a_pre_delay_turn(992, last), (true, Some(last)));
        assert_eq!(after_a_pre_delay_turn(992, last + 1), (true, None));
    }

    #[test]
    fn a_cleared_reverb_reads_nothing_written_before() {
        let values = values(&[
            (&REVERB_LEVEL, 65_535),
            (&REVERB_DECAY, 65_535),
            (&REVERB_PRE_DELAY, 65_535),
        ]);
        // A quarter of a second of a loud tone fills the ring and the pre-delay.
        let tone: Vec<f32> = (0..12_000)
            .map(|n| 0.5 * libm::sinf(2.0 * core::f32::consts::PI * 440.0 * n as f32 / 48_000.0))
            .collect();
        let (mut reverb, mut piece) = (Reverb::new(), piece());
        through(&mut reverb, &mut piece, &values, [&tone, &tone]);
        assert!(reverb.ringing(&piece));

        reverb.clear();

        assert!(!reverb.ringing(&piece));
        let silence = [0.0; 48_000];
        let [left, right] = through(&mut reverb, &mut piece, &values, [&silence, &silence]);
        assert!(left.iter().chain(&right).all(|&x| x == 0.0));
    }

    #[test]
    fn a_reverb_stops_ringing_once_its_memory_holds_only_zeros() {
        let values = values(&[(&REVERB_LEVEL, 65_535)]);
        let (mut reverb, mut piece) = (Reverb::new(), piece());
        let (input, silence) = (impulse(0.5, CHUNK), [0.0; CHUNK]);
        through(&mut reverb, &mut piece, &values, [&input, &input]);

        let mut quiet = 0;
        while reverb.ringing(&piece) {
            through(&mut reverb, &mut piece, &values, [&silence, &silence]);
            quiet += CHUNK;
            assert!(quiet < 60 * 48_000, "still ringing after a minute");
        }

        // Not before a whole ring of samples has stored only zeros.
        assert!(quiet >= RING, "{quiet}");
        assert!(piece[..RING + PRE_DELAY].iter().all(|&x| x == 0));
        // Its filters are at 0 too, so silence stays silent.
        let [left, right] = through(&mut reverb, &mut piece, &values, [&silence, &silence]);
        assert!(left.iter().chain(&right).all(|&x| x == 0.0));
    }
}
