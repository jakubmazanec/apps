use crate::runner::Runner;
use groovebox_core::device::{ControlSide, Device};
use groovebox_core::input::Stamped;
use groovebox_core::memory_storage::MemoryStorage;
use groovebox_core::message::Report;
use groovebox_core::sample_ram::SampleRam;
use groovebox_core::storage::{Reply, Request};
use groovebox_core::store::NoteRam;
use std::sync::atomic::{AtomicU32, Ordering};

/// The core built for this machine.
pub struct NativeRunner {
    device: Box<Device>,
    ram: Box<SampleRam>,
    notes: Box<NoteRam>,
    /// The reports that the last step took, as the browser export stashes them.
    applied: Vec<(u32, u64)>,
}

impl Default for NativeRunner {
    /// A fresh device, copied straight onto the heap: a debug build of `Device::new()` builds it on
    /// the stack, and its copies there overflow a test thread's 2 MiB.
    fn default() -> Self {
        static FRESH: Device = Device::new();
        let mut device = Box::<Device>::new_uninit();
        // SAFETY: no side of `FRESH` is ever taken, so it keeps the bytes of a new device, which
        // holds no pointers and owns nothing: a copy of them is a new device too.
        let device = unsafe {
            device.as_mut_ptr().copy_from_nonoverlapping(&FRESH, 1);
            device.assume_init()
        };
        Self {
            device,
            ram: SampleRam::boxed(),
            notes: NoteRam::boxed(),
            applied: Vec::new(),
        }
    }
}

impl NativeRunner {
    fn control(&mut self) -> ControlSide<'_> {
        // SAFETY: the side borrows this runner mutably, so no other side of its device exists
        // while it lives.
        unsafe { self.device.control_side(&self.ram) }
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

    fn take_request(&mut self) -> Option<(u32, Request)> {
        self.control().take_request()
    }

    fn queue_reply(&mut self, sample: u64, reply: Reply) -> bool {
        self.control().queue_reply(sample, reply).is_ok()
    }

    fn carry_out(&mut self, storage: &mut MemoryStorage, request: &Request) -> Reply {
        // SAFETY: the side lives only for this call, which borrows this runner mutably, so no
        // other side of its device exists while it lives.
        let mut control = unsafe { self.device.control_side(&self.ram) };
        // SAFETY: no render runs while this call does, and the core loads into and appends from
        // only blocks of its control side that the audio part was never told about.
        unsafe { storage.carry_out(request, control.io(), &self.ram) }
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
        unsafe { self.device.audio_side(&self.ram, &self.notes) }.render(left, right);
    }

    fn front_screen(&mut self) -> Vec<u8> {
        self.control().front_screen().pixels().to_vec()
    }
}
