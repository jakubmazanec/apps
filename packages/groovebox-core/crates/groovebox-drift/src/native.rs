use crate::runner::Runner;
use groovebox_core::device::{ControlSide, Device};
use groovebox_core::input::Stamped;

/// The core built for this machine.
#[derive(Default)]
pub struct NativeRunner {
    device: Box<Device>,
}

impl NativeRunner {
    fn control(&mut self) -> ControlSide<'_> {
        // SAFETY: the side borrows this runner mutably, so no other side of its device exists
        // while it lives.
        unsafe { self.device.control_side() }
    }
}

impl Runner for NativeRunner {
    fn queue_input(&mut self, input: Stamped) -> bool {
        self.control().queue_input(input).is_ok()
    }

    fn replay_applied(&mut self, number: u32, sample: u64) -> bool {
        self.control().replay_applied(number, sample).is_ok()
    }

    fn step(&mut self, until: u64) {
        self.control().step(until);
    }

    fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        // SAFETY: the side lives only for this call, which borrows this runner mutably, so no
        // other side of its device exists while it lives.
        unsafe { self.device.audio_side() }.render(left, right);
    }

    fn front_screen(&mut self) -> Vec<u8> {
        self.control().front_screen().pixels().to_vec()
    }
}
