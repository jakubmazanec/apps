#![allow(unsafe_code)]

use crate::audio::Audio;
use crate::budget;
use crate::control::Control;
use crate::input::Stamped;
use crate::message::{MESSAGE_QUEUE, Message, REPORT_QUEUE, Report};
use crate::queue::{Consumer, Producer, Queue};
use crate::screen::Screen;
use core::cell::UnsafeCell;
use core::sync::atomic::{AtomicU32, Ordering};

/// The whole core in one struct: both parts, both queues and two screens. A host puts it in a
/// `static` and gives the control side to one thread and the audio side to another.
///
/// The control side draws into the back screen and then makes it the front one by storing its
/// index in `front`. A reader of the picture loads `front` and reads that screen.
pub struct Device {
    control: UnsafeCell<Control>,
    audio: UnsafeCell<Audio>,
    messages: Queue<Message, MESSAGE_QUEUE>,
    reports: Queue<Report, REPORT_QUEUE>,
    screens: [UnsafeCell<Screen>; 2],
    /// The index of the screen to show, 0 or 1. Only the control side stores it.
    front: AtomicU32,
}

const _: () = assert!(
    core::mem::size_of::<Device>() <= budget::WORKING_MEMORY,
    "the device is larger than the working memory in budget.toml"
);

// SAFETY: every part of the device belongs to exactly one side, except `front` and the front
// screen, and `control_side` and `audio_side` promise that at most one of each side exists.
// - The control side owns `control`, the producer of `messages`, the consumer of `reports` and
//   the back screen, which is `screens[1 - front]`.
// - The audio side owns `audio`, the consumer of `messages` and the producer of `reports`.
// - `front` is the only handoff of screens between threads. Only the control side stores it, and
//   it does so with Release after it has drawn the back screen, so a thread that loads `front`
//   with Acquire sees every pixel of that screen. Nothing writes that screen until the control
//   side's second redraw after the load; a redraw already running at the load counts as the first.
// - Rust code reads the front screen only through `ControlSide::front_screen`, which borrows the
//   control side and so keeps it from drawing. Other readers, such as the browser page, read it
//   through `screen_pointer` and `front_pointer` and must finish copying the screen they loaded
//   before the control side starts its second redraw after the load. In practice, copy it promptly,
//   once per frame; a reader that is slower sees a torn picture.
unsafe impl Sync for Device {}

impl Device {
    pub const fn new() -> Self {
        Self {
            control: UnsafeCell::new(Control::new()),
            audio: UnsafeCell::new(Audio::new()),
            messages: Queue::new(),
            reports: Queue::new(),
            screens: [
                UnsafeCell::new(Screen::new()),
                UnsafeCell::new(Screen::new()),
            ],
            front: AtomicU32::new(0),
        }
    }

    /// # Safety
    ///
    /// At most one control side may exist at a time, on any thread.
    pub unsafe fn control_side(&self) -> ControlSide<'_> {
        // SAFETY: the caller promises that this is the only control side, so it is the only user
        // of `control`, of the producer of `messages` and of the consumer of `reports`.
        unsafe {
            ControlSide {
                device: self,
                control: &mut *self.control.get(),
                messages: self.messages.producer(),
                reports: self.reports.consumer(),
            }
        }
    }

    /// # Safety
    ///
    /// At most one audio side may exist at a time, on any thread.
    pub unsafe fn audio_side(&self) -> AudioSide<'_> {
        // SAFETY: the caller promises that this is the only audio side, so it is the only user of
        // `audio`, of the consumer of `messages` and of the producer of `reports`.
        unsafe {
            AudioSide {
                audio: &mut *self.audio.get(),
                messages: self.messages.consumer(),
                reports: self.reports.producer(),
            }
        }
    }

    /// The first pixel of screen `index`, 0 or 1. The screen holds `WIDTH * HEIGHT` bytes in row
    /// order. Reading it is the reader's responsibility: see the note on `Sync` for `Device`.
    pub fn screen_pointer(&self, index: usize) -> *const u8 {
        self.screens[index].get().cast::<u8>().cast_const()
    }

    /// The index of the screen to show.
    pub fn front_pointer(&self) -> *const AtomicU32 {
        &raw const self.front
    }
}

impl Default for Device {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ControlSide<'a> {
    device: &'a Device,
    control: &'a mut Control,
    messages: Producer<'a, Message, MESSAGE_QUEUE>,
    reports: Consumer<'a, Report, REPORT_QUEUE>,
}

impl ControlSide<'_> {
    pub fn queue_input(&mut self, input: Stamped) -> Result<(), Stamped> {
        self.control.queue_input(input)
    }

    pub fn replay_applied(&mut self, number: u32, sample: u64) -> Result<(), (u32, u64)> {
        self.control.replay_applied(number, sample)
    }

    /// Handles the inputs stamped before `until`. When the picture changes, it draws it into the
    /// back screen and makes that the front one.
    pub fn step(&mut self, until: u64) {
        if self.control.step(until, &mut self.messages) {
            // Only this side stores `front`, so a relaxed load sees its last store.
            let back = 1 - self.device.front.load(Ordering::Relaxed);
            // SAFETY: only the control side writes a screen, and it writes only the back one. No
            // reference to it exists: `front_screen` borrows this control side, so none lives
            // while `step` runs.
            let screen = unsafe { &mut *self.device.screens[back as usize].get() };
            self.control.draw(screen);
            self.device.front.store(back, Ordering::Release);
        }
    }

    pub fn take_report(&mut self) -> Option<Report> {
        self.reports.pop()
    }

    pub fn front_screen(&self) -> &Screen {
        // Only this side stores `front`, so a relaxed load sees its last store.
        let front = self.device.front.load(Ordering::Relaxed);
        // SAFETY: the control side writes only the back screen, and it cannot draw while this
        // reference borrows it.
        unsafe { &*self.device.screens[front as usize].get() }
    }
}

pub struct AudioSide<'a> {
    audio: &'a mut Audio,
    messages: Consumer<'a, Message, MESSAGE_QUEUE>,
    reports: Producer<'a, Report, REPORT_QUEUE>,
}

impl AudioSide<'_> {
    /// Renders `left.len()` samples: see `Audio::render`.
    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.audio
            .render(left, right, &mut self.messages, &mut self.reports);
    }

    /// The sample at which the next `render` starts.
    pub fn position(&self) -> u64 {
        self.audio.position()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{Input, Stamped};
    use crate::palette::{ACCENT, BACKGROUND, LINE};
    use crate::screen::{HEIGHT, WIDTH};

    fn hit(sample: u64, pad: u8) -> Stamped {
        let input = Input::PadHit { pad, velocity: 100 };
        Stamped { sample, input }
    }

    fn release(sample: u64, pad: u8) -> Stamped {
        let input = Input::PadRelease { pad };
        Stamped { sample, input }
    }

    #[test]
    fn step_draws_into_the_back_screen_and_flips() {
        static DEVICE: Device = Device::new();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side() };
        assert_eq!(DEVICE.front.load(Ordering::Acquire), 0);

        control.step(128);

        assert_eq!(DEVICE.front.load(Ordering::Acquire), 1);
        let screen = control.front_screen();
        assert_eq!(screen.pixel(0, 0), LINE);
        assert_eq!(screen.pixel(WIDTH - 1, HEIGHT - 1), LINE);
        assert_eq!(screen.pixel(1, 1), BACKGROUND);
        // SAFETY: nothing writes the old front screen while the test reads it.
        let old = unsafe { &*DEVICE.screens[0].get() };
        assert_eq!(old.pixel(0, 0), BACKGROUND);
    }

    #[test]
    fn a_step_without_a_change_does_not_flip() {
        static DEVICE: Device = Device::new();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side() };
        control.step(128);

        control.step(256);

        assert_eq!(DEVICE.front.load(Ordering::Acquire), 1);
    }

    #[test]
    fn the_front_screen_shows_only_the_current_state() {
        static DEVICE: Device = Device::new();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side() };
        control.step(1);
        assert_eq!(control.queue_input(hit(1, 0)), Ok(()));
        control.step(2);
        assert_eq!(control.queue_input(release(2, 0)), Ok(()));
        control.step(3);
        assert_eq!(control.queue_input(hit(3, 1)), Ok(()));

        control.step(4);

        assert_eq!(DEVICE.front.load(Ordering::Acquire), 0);
        let screen = control.front_screen();
        assert_eq!(screen.pixel(36, 136), BACKGROUND);
        assert_eq!(screen.pixel(36 + 37, 136), ACCENT);
    }

    #[test]
    fn the_pointers_reach_the_front_flag_and_the_pixels() {
        static DEVICE: Device = Device::new();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side() };
        assert_eq!(control.queue_input(hit(0, 0)), Ok(()));
        control.step(128);

        // SAFETY: the pointer is valid for the life of the device.
        let front = unsafe { &*DEVICE.front_pointer() }.load(Ordering::Acquire);
        // SAFETY: the pointer is valid for `WIDTH * HEIGHT` bytes, and the control side does not
        // draw while the test reads.
        let pixels = unsafe {
            core::slice::from_raw_parts(DEVICE.screen_pointer(front as usize), WIDTH * HEIGHT)
        };

        assert_eq!(front, 1);
        assert_eq!(pixels, control.front_screen().pixels());
        assert_ne!(DEVICE.screen_pointer(0), DEVICE.screen_pointer(1));
    }

    #[test]
    fn messages_reach_the_audio_part_and_reports_come_back() {
        static DEVICE: Device = Device::new();
        // SAFETY: this test takes the only control side and the only audio side of its own device.
        let (mut control, mut audio) = unsafe { (DEVICE.control_side(), DEVICE.audio_side()) };
        assert_eq!(control.queue_input(hit(0, 0)), Ok(()));
        control.step(128);

        audio.render(&mut [0.0; 128], &mut [0.0; 128]);

        assert_eq!(audio.position(), 128);
        assert_eq!(
            control.take_report(),
            Some(Report::Applied {
                number: 0,
                sample: 0
            })
        );
        assert_eq!(control.take_report(), None);
    }

    #[test]
    fn replay_records_reach_the_control_part() {
        static DEVICE: Device = Device::new();
        // SAFETY: this test takes the only control side and the only audio side of its own device.
        let (mut control, mut audio) = unsafe { (DEVICE.control_side(), DEVICE.audio_side()) };
        assert_eq!(control.replay_applied(0, 64), Ok(()));
        assert_eq!(control.queue_input(hit(0, 0)), Ok(()));
        control.step(128);

        audio.render(&mut [0.0; 128], &mut [0.0; 128]);

        assert_eq!(
            control.take_report(),
            Some(Report::Applied {
                number: 0,
                sample: 64
            })
        );
    }
}
