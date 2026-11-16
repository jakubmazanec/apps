#![allow(unsafe_code)]

use crate::audio::Audio;
use crate::budget;
use crate::control::Control;
use crate::input::Stamped;
use crate::message::{MESSAGE_QUEUE, Message, REPORT_QUEUE, Report};
use crate::queue::{Consumer, Producer, Queue};
use crate::ring::Ring;
use crate::sample_ram::{Reader, SampleRam, Tables};
use crate::screen::Screen;
use crate::storage::{Reply, Request};
use core::cell::UnsafeCell;
use core::sync::atomic::{AtomicU32, Ordering};

/// The whole core in one struct: both parts, both queues, two screens, the lights, the block tables
/// and the I/O buffer. A host puts it in a `static`, keeps a `SampleRam` beside it and gives the
/// control side to one thread and the audio side to another, each with that sample RAM.
///
/// The control side draws into the back screen and then makes it the front one by storing its
/// index in `front`. A reader of the picture loads `front` and reads that screen. After every step
/// the control side also stores the lights in `lights`.
pub struct Device {
    control: UnsafeCell<Control>,
    audio: UnsafeCell<Audio>,
    messages: Queue<Message, MESSAGE_QUEUE>,
    reports: Queue<Report, REPORT_QUEUE>,
    screens: [UnsafeCell<Screen>; 2],
    /// The index of the screen to show, 0 or 1. Only the control side stores it.
    front: AtomicU32,
    /// The bits of `Lights` in two words, bits 0 to 31 in the low one and the rest in the high
    /// one, so that a target without 64-bit atomics holds them. All are off until the first step.
    /// Only the control side stores them.
    lights: [AtomicU32; 2],
    tables: Tables,
    /// The reports that steps took off `reports`, until `take_report` gives them to the host.
    taken: UnsafeCell<Ring<Report, REPORT_QUEUE>>,
    /// Storage requests read data into it and write data from it.
    io: UnsafeCell<[u8; budget::IO_BUFFER]>,
}

const _: () = assert!(
    core::mem::size_of::<Device>() <= budget::WORKING_MEMORY,
    "the device is larger than the working memory in budget.toml"
);

// SAFETY: every part of the device belongs to exactly one side, except `front`, `lights`, `tables`,
// `io` and the front screen, and `control_side` and `audio_side` promise that at most one of each
// side exists.
// - The control side owns `control`, the producer of `messages`, the consumer of `reports`, `taken`
//   and the back screen, which is `screens[1 - front]`.
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
// - `lights` are two atomic words that only the control side stores, so any thread may load them.
//   After every step the control side stores the high word, then the low word, each with Release.
//   A reader loads the low word, then the high word, each with Acquire, so it gets the high word
//   of the step whose low word it loaded or of a later one. A reader on another thread may thus
//   pair one step's low word with a later step's high word for one read, while a step stores. The
//   lights only show, and the next read is whole; a reader on the control side's own thread, such
//   as the drift harness, reads between steps and always gets one step's lights.
// - The sample RAM beside the device is split by blocks. The control side owns every block it took
//   and has not yet told the audio side about in a message. The audio side reads, and never
//   writes, the blocks of each file it was told about, until its report that it let go of the file
//   reaches the control side; only then does the control side give those blocks back. The queues
//   hand the blocks over: the Release of a push and the Acquire of its pop order every byte
//   written before it.
// - `tables` are atomics, so either side may touch any entry. The control side writes an entry or
//   a directory slot only where the audio side does not read: after the last slice of the table
//   that the audio side uses, or in the other table once the latest `UseTable` has applied. So the
//   entries that the audio side reads stay put while it reads them. The control side's `Listing`
//   keeps to this as long as its caller keeps the order that its unsafe `forget` and `applied`
//   and the docs of `add` and `Listed::Packed` set out.
// - `io` belongs to the control side while one exists: a host written in Rust carries out a
//   request through `ControlSide::io`, which borrows the control side. The browser writes it
//   through `io_pointer` while it carries out a request, between control steps, when no control
//   side exists. The control part touches it only while no request is out, so neither meets the
//   other's data half written.
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
            lights: [AtomicU32::new(0), AtomicU32::new(0)],
            tables: Tables::new(),
            taken: UnsafeCell::new(Ring::new()),
            io: UnsafeCell::new([0; budget::IO_BUFFER]),
        }
    }

    /// # Safety
    ///
    /// At most one control side may exist at a time, on any thread.
    pub unsafe fn control_side<'a>(&'a self, ram: &'a SampleRam) -> ControlSide<'a> {
        // SAFETY: the caller promises that this is the only control side, so it is the only user
        // of `control`, of the producer of `messages`, of the consumer of `reports` and of
        // `taken`. Nothing else touches `io` while a control side exists: see the note on `Sync`
        // for `Device`.
        unsafe {
            ControlSide {
                device: self,
                control: &mut *self.control.get(),
                messages: self.messages.producer(),
                reports: self.reports.consumer(),
                taken: &mut *self.taken.get(),
                io: &mut *self.io.get(),
                ram,
            }
        }
    }

    /// # Safety
    ///
    /// At most one audio side may exist at a time, on any thread.
    pub unsafe fn audio_side<'a>(&'a self, ram: &'a SampleRam) -> AudioSide<'a> {
        // SAFETY: the caller promises that this is the only audio side, so it is the only user of
        // `audio`, of the consumer of `messages` and of the producer of `reports`. The audio part
        // reads only the files it was told about: see the note on `Sync` for `Device`.
        unsafe {
            AudioSide {
                audio: &mut *self.audio.get(),
                messages: self.messages.consumer(),
                reports: self.reports.producer(),
                readers: self.tables.readers(ram),
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

    /// The lights after the latest step, the bits of `Lights` in two words: this low word, bits 0
    /// to 31, and the high word after it. A reader loads the low word, then the high word: see the
    /// note on `Sync` for `Device`.
    pub fn lights_pointer(&self) -> *const AtomicU32 {
        self.lights.as_ptr()
    }

    /// The first byte of the I/O buffer, which holds `IO_BUFFER` bytes. Only the platform that
    /// carries out the request that is out writes it, while no control side exists: see the note
    /// on `Sync` for `Device`.
    pub fn io_pointer(&self) -> *mut u8 {
        self.io.get().cast::<u8>()
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
    taken: &'a mut Ring<Report, REPORT_QUEUE>,
    io: &'a mut [u8; budget::IO_BUFFER],
    #[expect(
        dead_code,
        reason = "the control part has no file to write into its blocks yet"
    )]
    ram: &'a SampleRam,
}

impl ControlSide<'_> {
    pub fn queue_input(&mut self, input: Stamped) -> Result<(), Stamped> {
        self.control.queue_input(input)
    }

    pub fn replay_applied(&mut self, number: u32, sample: u64) -> Result<(), (u32, u64)> {
        self.control.replay_applied(number, sample)
    }

    pub fn take_request(&mut self) -> Option<(u32, Request)> {
        self.control.take_request()
    }

    pub fn queue_reply(&mut self, sample: u64, reply: Reply) -> Result<(), Reply> {
        self.control.queue_reply(sample, reply)
    }

    /// The I/O buffer, through which the platform carries out the request that is out.
    pub fn io(&mut self) -> &mut [u8] {
        self.io
    }

    /// Takes every report off the report queue and gives each to the control part, and later to
    /// the host through `take_report`. Then it handles the events before `until`. When the picture
    /// changes, it draws it into the back screen and makes that the front one. Then it stores the
    /// lights.
    pub fn step(&mut self, until: u64) {
        while let Some(report) = self.reports.pop() {
            let Report::Applied { number, sample } = report;
            self.control.applied(number, sample);
            // A host that leaves reports untaken loses the newest, as a full report queue does.
            let _ = self.taken.push(report);
        }
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
        let lights = self.control.lights().0;
        let [low, high] = &self.device.lights;
        // The high word first: a reader loads the low word first.
        high.store((lights >> 32) as u32, Ordering::Release);
        low.store(lights as u32, Ordering::Release);
    }

    /// The next report that a step took off the report queue.
    pub fn take_report(&mut self) -> Option<Report> {
        self.taken.pop()
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
    readers: [Reader<'a>; 2],
}

impl<'a> AudioSide<'a> {
    /// Renders `left.len()` samples: see `Audio::render`.
    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.audio
            .render(left, right, &mut self.messages, &mut self.reports);
    }

    /// The sample at which the next `render` starts.
    pub fn position(&self) -> u64 {
        self.audio.position()
    }

    /// Reads the files' blocks through the table that the audio part uses.
    ///
    /// # Safety
    ///
    /// The caller reads through it only the frames that `Tables::readers` allows.
    pub unsafe fn reader(&self) -> &Reader<'a> {
        &self.readers[usize::from(self.audio.table())]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::REPLAY_QUEUE;
    use crate::input::{Button, Input, Stamped};
    use crate::library::FileId;
    use crate::lights::Lights;
    use crate::message::{MessageKind, NoteId};
    use crate::palette::{BACKGROUND, LINE};
    use crate::project::pool::SoundNumber;
    use crate::sample_ram::{BLOCK, BLOCKS, Blocks, Listed, Listing};
    use crate::screen::{HEIGHT, WIDTH};

    fn press(sample: u64, button: Button) -> Stamped {
        let input = Input::ButtonPress { button };
        Stamped { sample, input }
    }

    fn release(sample: u64, button: Button) -> Stamped {
        let input = Input::ButtonRelease { button };
        Stamped { sample, input }
    }

    #[test]
    fn step_draws_into_the_back_screen_and_flips() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
        assert_eq!(DEVICE.front.load(Ordering::Acquire), 0);

        control.step(128);

        assert_eq!(DEVICE.front.load(Ordering::Acquire), 1);
        let screen = control.front_screen();
        // The header's line and the strip's.
        assert_eq!(screen.pixel(0, 14), LINE);
        assert_eq!(screen.pixel(WIDTH - 1, 253), LINE);
        assert_eq!(screen.pixel(0, 0), BACKGROUND);
        // SAFETY: nothing writes the old front screen while the test reads it.
        let old = unsafe { &*DEVICE.screens[0].get() };
        assert_eq!(old.pixel(0, 14), BACKGROUND);
    }

    #[test]
    fn a_step_without_a_change_does_not_flip() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
        control.step(128);

        control.step(256);

        assert_eq!(DEVICE.front.load(Ordering::Acquire), 1);
    }

    #[test]
    fn the_front_screen_shows_only_the_current_state() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
        control.step(1);
        // KEYS mode draws the longer "Keys C4" into the screen that is drawn again last.
        assert_eq!(control.queue_input(press(1, Button::PadsKeys)), Ok(()));
        assert_eq!(control.queue_input(release(2, Button::PadsKeys)), Ok(()));
        control.step(3);
        assert_eq!(control.queue_input(press(3, Button::PadsKeys)), Ok(()));
        assert_eq!(control.queue_input(release(4, Button::PadsKeys)), Ok(()));
        control.step(5);
        assert_eq!(control.queue_input(press(5, Button::T2)), Ok(()));

        control.step(6);

        assert_eq!(DEVICE.front.load(Ordering::Acquire), 0);
        let mut fresh = Screen::new();
        control.control.draw(&mut fresh);
        assert!(control.front_screen().pixels() == fresh.pixels());
    }

    #[test]
    fn the_pointers_reach_the_front_flag_and_the_pixels() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
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

    /// The lights of the device as a reader on another thread loads them: the low word, then the
    /// high word.
    fn loaded(device: &Device) -> u64 {
        // SAFETY: the pointer is valid for the two words for the life of the device.
        let [low, high] = unsafe { &*device.lights_pointer().cast::<[AtomicU32; 2]>() };
        let low = low.load(Ordering::Acquire);
        u64::from(low) | u64::from(high.load(Ordering::Acquire)) << 32
    }

    #[test]
    fn the_lights_reach_the_lights_words_after_a_step() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
        assert_eq!(loaded(&DEVICE), 0);

        control.step(128);
        assert_eq!(loaded(&DEVICE), 1 << Lights::PAD | 1 << Lights::TRACK);

        assert_eq!(control.queue_input(press(200, Button::T2)), Ok(()));
        control.step(256);
        assert_eq!(loaded(&DEVICE), 1 << Lights::PAD | 1 << (Lights::TRACK + 1));

        // A step that handles nothing stores them too.
        DEVICE.lights[0].store(0, Ordering::Relaxed);
        control.step(384);
        assert_eq!(loaded(&DEVICE), control.control.lights().0);
    }

    #[test]
    fn the_high_lights_are_in_the_second_word() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
        assert_eq!(control.queue_input(press(0, Button::PadsKeys)), Ok(()));
        assert_eq!(control.queue_input(release(1, Button::PadsKeys)), Ok(()));

        control.step(128);

        let [low, high] = &DEVICE.lights;
        assert_eq!(
            low.load(Ordering::Acquire),
            1 << Lights::PAD | 1 << Lights::TRACK
        );
        assert_eq!(high.load(Ordering::Acquire), 1 << (Lights::PADS_KEYS - 32));
        assert_eq!(DEVICE.lights_pointer(), low as *const AtomicU32);
    }

    #[test]
    fn messages_reach_the_audio_part_and_reports_come_back() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side and the only audio side of its own device.
        let (mut control, mut audio) =
            unsafe { (DEVICE.control_side(&ram), DEVICE.audio_side(&ram)) };
        let kind = MessageKind::NoteOn {
            note: NoteId(0),
            track: 0,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 100,
        };
        // The control part sends a message only for a pad with a sound, so the test sends one
        // itself through the control side's end of the queue, after the sound it plays.
        let new_sound = Message {
            number: 0,
            at: 0,
            kind: MessageKind::NewSound {
                sound: SoundNumber(1),
            },
        };
        let message = Message {
            number: 1,
            at: 40,
            kind,
        };
        assert_eq!(control.messages.push(new_sound), Ok(()));
        assert_eq!(control.messages.push(message), Ok(()));

        audio.render(&mut [0.0; 128], &mut [0.0; 128]);
        control.step(128);

        assert_eq!(audio.position(), 128);
        assert_eq!(
            control.take_report(),
            Some(Report::Applied {
                number: 0,
                sample: 0
            })
        );
        assert_eq!(
            control.take_report(),
            Some(Report::Applied {
                number: 1,
                sample: 64
            })
        );
        assert_eq!(control.take_report(), None);
    }

    #[test]
    fn the_audio_part_switches_tables_at_the_chunk_of_use_table() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side and the only audio side of its own device.
        let (mut control, mut audio) =
            unsafe { (DEVICE.control_side(&ram), DEVICE.audio_side(&ram)) };
        let (mut listing, mut blocks) = (Listing::new(), Blocks::new());
        let mut add = |file, count| {
            let taken = blocks.take(count).expect("enough blocks are free");
            listing.add(&DEVICE.tables, FileId(file), taken)
        };
        // File 1 takes blocks 1 to 10 at entry 1 of table 0. Once file 0 has gone, file 2 fills the
        // rest, so they are packed into table 1, file 1 from entry 0.
        add(0, 1);
        add(1, 10);
        // SAFETY: the audio side was never told about file 0.
        unsafe { listing.forget(FileId(0)) };
        blocks.give_back(0);
        let listed = listing.add(
            &DEVICE.tables,
            FileId(2),
            blocks.take(BLOCKS - 10).expect("the rest is free"),
        );
        assert_eq!(listed, Some(Listed::Packed { version: 1 }));
        // SAFETY: block 5, file 1's fifth, is the test's own: no side reads it yet.
        unsafe { ram.bytes(5 * BLOCK as u32, 2) }.copy_from_slice(&7i16.to_le_bytes());
        let message = Message {
            number: 0,
            at: 40,
            kind: MessageKind::UseTable { version: 1 },
        };
        assert_eq!(control.messages.push(message), Ok(()));

        audio.render(&mut [0.0; 64], &mut [0.0; 64]);
        // SAFETY: the test reads a frame of file 1, which the control side no longer writes.
        let reader = unsafe { audio.reader() };
        assert_eq!(reader.slice(FileId(1)), 1);
        assert_eq!(reader.frame(1, false, 4 * 1_024), (7, 7));

        audio.render(&mut [0.0; 32], &mut [0.0; 32]);
        // SAFETY: as above.
        let reader = unsafe { audio.reader() };
        assert_eq!(reader.slice(FileId(1)), 0);
        assert_eq!(reader.frame(0, false, 4 * 1_024), (7, 7));
        control.step(96);
        assert_eq!(
            control.take_report(),
            Some(Report::Applied {
                number: 0,
                sample: 64
            })
        );
    }

    #[test]
    fn the_io_pointer_reaches_the_io_buffer() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };
        assert_eq!(control.io().len(), budget::IO_BUFFER);
        control.io()[budget::IO_BUFFER - 1] = 7;

        // SAFETY: the pointer is valid for `IO_BUFFER` bytes, and the control side does not touch
        // them while the test reads.
        let io = unsafe { core::slice::from_raw_parts(DEVICE.io_pointer(), budget::IO_BUFFER) };

        assert_eq!(io[budget::IO_BUFFER - 1], 7);
    }

    #[test]
    fn the_device_fits_the_working_memory() {
        let size = core::mem::size_of::<Device>();

        std::println!(
            "the device takes {size} of {} bytes",
            budget::WORKING_MEMORY
        );
        assert!(size <= budget::WORKING_MEMORY);
    }

    #[test]
    fn replay_records_reach_the_control_part() {
        static DEVICE: Device = Device::new();
        let ram = SampleRam::boxed();
        // SAFETY: this test takes the only control side of its own device.
        let mut control = unsafe { DEVICE.control_side(&ram) };

        for number in 0..REPLAY_QUEUE as u32 {
            assert_eq!(control.replay_applied(number, 64), Ok(()));
        }

        assert_eq!(
            control.replay_applied(REPLAY_QUEUE as u32, 64),
            Err((REPLAY_QUEUE as u32, 64))
        );
    }
}
