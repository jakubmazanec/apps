use crate::audio::{CHUNK, SAMPLE_RATE};
use crate::message::MessageKind;
use core::f32::consts::TAU;

/// One sine voice. It is throwaway: plan 2's voices replace it.
pub struct Tone {
    /// In cycles, kept in [0, 1).
    phase: f32,
    /// In cycles per sample.
    step: f32,
    gain: f32,
    target: f32,
}

impl Tone {
    pub const fn new() -> Self {
        Self {
            phase: 0.0,
            step: 0.0,
            gain: 0.0,
            target: 0.0,
        }
    }

    /// A `ToneOn` while sounding switches the frequency at once and keeps the phase.
    pub fn apply(&mut self, kind: MessageKind) {
        match kind {
            MessageKind::ToneOn { pad, velocity } => {
                self.step = 261.6256 * libm::exp2f(f32::from(pad) / 12.0) / SAMPLE_RATE as f32;
                self.target = 0.25 * f32::from(velocity) / 127.0;
            }
            MessageKind::ToneOff => self.target = 0.0,
        }
    }

    /// Renders one chunk. The gain moves from where the last chunk left it to the target over
    /// exactly this chunk, so a message applied at the chunk start ramps over those 32 samples.
    pub fn render(&mut self, out: &mut [f32; CHUNK]) {
        let (start, target) = (self.gain, self.target);
        if start == 0.0 && target == 0.0 {
            out.fill(0.0);
            return;
        }
        for (index, sample) in out.iter_mut().enumerate() {
            let gain = if start == target {
                start
            } else {
                let progress = (index + 1) as f32 / CHUNK as f32;
                start * (1.0 - progress) + target * progress
            };
            *sample = gain * libm::sinf(TAU * self.phase);
            self.phase += self.step;
            if self.phase >= 1.0 {
                self.phase -= 1.0;
            }
        }
        self.gain = target;
        if target == 0.0 {
            self.phase = 0.0;
        }
    }
}

impl Default for Tone {
    fn default() -> Self {
        Self::new()
    }
}
