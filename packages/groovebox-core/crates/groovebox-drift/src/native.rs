use crate::runner::Runner;
use groovebox_core::device::{ControlSide, Device};
use groovebox_core::input::Stamped;
use groovebox_core::message::Report;
use std::sync::atomic::{AtomicU32, Ordering};

/// The core built for this machine.
#[derive(Default)]
pub struct NativeRunner {
    device: Box<Device>,
    /// The reports that the last step took, as the browser export stashes them.
    applied: Vec<(u32, u64)>,
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
        let mut control = self.control();
        control.step(until);
        self.applied = std::iter::from_fn(|| control.take_report())
            .map(|Report::Applied { number, sample }| (number, sample))
            .collect();
    }

    fn take_applied(&mut self) -> Vec<(u32, u64)> {
        std::mem::take(&mut self.applied)
    }

    fn lights(&mut self) -> u64 {
        // SAFETY: the pointer is valid for the two words for the life of the device, which this
        // runner owns.
        let [low, high] = unsafe { &*self.device.lights_pointer().cast::<[AtomicU32; 2]>() };
        let low = low.load(Ordering::Acquire);
        u64::from(low) | u64::from(high.load(Ordering::Acquire)) << 32
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
