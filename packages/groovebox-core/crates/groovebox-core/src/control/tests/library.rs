//! The start-up and SETTINGS' Dev page.

use super::*;
use crate::budget;
use crate::library::wav::{self, Encoding, Ours};
use crate::library::{Entry, FileId};
use crate::storage::Path;
use std::format;
use std::string::String;

impl<'a> Rig<'a> {
    /// A rig before its first step, whose storage holds `files`, each at its path.
    #[allow(unsafe_code)]
    pub(super) fn with_files(
        messages: &'a Queue<Message, MESSAGE_QUEUE>,
        files: &[(&str, Vec<u8>)],
    ) -> Self {
        /// A new control part that is only ever read.
        struct Fresh(Control);
        // SAFETY: nothing writes `FRESH`, so it is shared only to be read.
        unsafe impl Sync for Fresh {}
        static FRESH: Fresh = Fresh(Control::new());
        let mut control = Box::<Control>::new_uninit();
        // SAFETY: a new control part holds no pointers and owns nothing: a copy of its bytes is a
        // new control part too.
        let control = unsafe {
            control.as_mut_ptr().copy_from_nonoverlapping(&FRESH.0, 1);
            control.assume_init()
        };
        let mut storage = MemoryStorage::new(1_000_000_000);
        for (path, bytes) in files {
            storage.put(path, bytes.clone());
        }
        // SAFETY: each rig takes one producer and one consumer from its own queue.
        let (producer, consumer) = unsafe { (messages.producer(), messages.consumer()) };
        Self {
            control,
            producer,
            consumer,
            storage,
            io: std::vec![0; budget::IO_BUFFER],
            tables: Box::new(Tables::new()),
            ram: SampleRam::boxed(),
        }
    }

    /// Carries out the request that is out and queues its reply at `sample`. Gives the request.
    #[allow(unsafe_code)]
    pub(super) fn serve(&mut self, sample: u64) -> Request {
        let (number, request) = self.control.take_request().expect("a request is out");
        // SAFETY: the rig has no audio part, so every block of its sample RAM is the control side's.
        let reply = unsafe { self.storage.carry_out(&request, &mut self.io, &self.ram) };
        assert_eq!(
            self.control.queue_reply(sample, Reply { number, ..reply }),
            Ok(())
        );
        request
    }

    /// Serves every request of the start-up at the sample where the latest step ended, until the
    /// project opens. Gives the requests.
    pub(super) fn open(&mut self) -> Vec<Request> {
        let sample = self.control.now;
        self.step(sample + 1);
        let mut requests = Vec::new();
        while self.control.startup.is_some() {
            requests.push(self.serve(sample));
            self.step(sample + 1);
        }
        requests
    }
}

/// A file as the device converts it: `frames` frames of silence in `channels` channels.
fn converted(frames: u32, channels: u8) -> Vec<u8> {
    let mut file = std::vec![0; 512];
    let ours = Ours {
        fingerprint: [7; 16],
        original: Label::new(),
    };
    let head = wav::write_header(&mut file, channels, frames, 60, None, &ours);
    file.truncate(head);
    file.resize(file.len() + frames as usize * usize::from(channels) * 2, 0);
    file
}

fn path(text: &str) -> Path {
    let mut path = Path::new();
    path.push_str(text);
    path
}

/// Where the audio of every file that `converted` makes starts.
fn data_at() -> u64 {
    converted(0, 1).len() as u64
}

fn entries(rig: &Rig<'_>) -> Vec<Entry> {
    rig.control.library.entries(None).collect()
}

/// STEP over an empty main area and strip with `message` on the right of the header.
fn step_with(message: (&str, Color)) -> Screen {
    drawn(&STEP_HEADER, Some(message), |_| {}, &[None; 4])
}

#[test]
fn start_up_empties_tmp_then_loads_every_file_in_order() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/zap.wav", converted(100, 1)),
            ("samples/Bass.wav", converted(2_000, 2)),
            ("samples/drums/clap.wav", converted(1_500, 1)),
            ("samples/drums/808/kick.wav", converted(3_000, 1)),
            ("tmp/1/hat.wav", converted(10, 1)),
        ],
    );
    let read = |file: &str| Request::Read {
        file: path(file),
        at: 0,
        length: 512,
    };
    let load = |file: &str, length, block: u32| Request::Load {
        file: path(file),
        at: data_at(),
        length,
        into: block * 2_048,
    };

    let requests = rig.open();

    assert_eq!(
        requests,
        [
            Request::Delete { path: path("tmp") },
            Request::List {
                folder: path("samples"),
                from: 0
            },
            // Folders first, then files, each by name: kick takes blocks 0 to 2, clap 3 and 4,
            // Bass 5 to 8 and zap 9.
            read("samples/drums/808/kick.wav"),
            load("samples/drums/808/kick.wav", 6_000, 0),
            read("samples/drums/clap.wav"),
            load("samples/drums/clap.wav", 3_000, 3),
            read("samples/Bass.wav"),
            load("samples/Bass.wav", 8_000, 5),
            read("samples/zap.wav"),
            load("samples/zap.wav", 200, 9),
        ]
    );
    assert!(
        rig.storage
            .files()
            .keys()
            .all(|file| file.starts_with("samples/"))
    );
    assert_eq!(rig.control.library.used(), 10 * 2_048);
    assert!(shows_step(&rig.control, &STEP_HEADER));
}

#[test]
fn the_list_comes_page_by_page() {
    let queue = Queue::new();
    let names: Vec<String> = (100..200).map(|n| format!("samples/{n}.wav")).collect();
    let files: Vec<_> = names
        .iter()
        .map(|name| (name.as_str(), converted(1, 1)))
        .collect();
    let mut rig = Rig::with_files(&queue, &files);
    // A buffer that holds a file's head holds 42 records of 12 bytes, as "100.wav" takes.
    rig.io.truncate(512);

    let requests = rig.open();

    let lists: Vec<_> = requests
        .into_iter()
        .filter(|request| matches!(request, Request::List { .. }))
        .collect();
    let list = |from| Request::List {
        folder: path("samples"),
        from,
    };
    assert_eq!(lists, [list(0), list(42), list(84)]);
    assert_eq!(rig.control.library.used(), 100 * 2_048);
}

#[test]
fn loading_library_shows_until_the_project_opens() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", converted(100, 1))]);
    let loading = drawn(&[], Some(("Loading library", ACCENT)), |_| {}, &[None; 4]);

    rig.step(1);
    assert!(shows(&rig.control, &loading));
    rig.serve(0);
    rig.step(1);
    assert!(shows(&rig.control, &loading));
    rig.open();

    assert_eq!(rig.control.message, None);
    assert!(shows_step(&rig.control, &STEP_HEADER));
}

#[test]
fn before_the_project_opens_only_the_volume_acts() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[]);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.hit(10, 0, 100);
    rig.release(20, 0);
    rig.hit(30, 5, 100);
    rig.turn(40, VOLUME, -1);
    rig.step(50);

    assert_eq!(rig.sent(), [message(0, 40, volume(45_875 - 512))]);
    rig.open();
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            None,
            |_| {},
            &[Some(sound("Syn 1")), Some(copy("on 1 pad")), None, None],
        )
    ));
}

#[test]
fn a_library_bigger_than_the_ram_loads_in_order_as_far_as_it_fits() {
    let queue = Queue::new();
    // 20,000,000 mono frames are 40 MB, which take 19,532 of the 31,250 blocks.
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/a.wav", converted(20_000_000, 1)),
            ("samples/b.wav", converted(20_000_000, 1)),
        ],
    );

    rig.open();

    assert_eq!(
        entries(&rig),
        [Entry::File(FileId(0)), Entry::File(FileId(1))]
    );
    assert!(rig.control.library.file(FileId(0)).loaded);
    assert!(!rig.control.library.file(FileId(1)).loaded);
    assert_eq!(rig.control.library.used(), 19_532 * 2_048);
    assert!(shows(
        &rig.control,
        &step_with(("Library too big. 1 file not loaded", RECORD))
    ));
}

#[test]
fn a_file_that_is_not_ours_is_not_loaded() {
    let queue = Queue::new();
    let plain = wav::sine(440.0, 0.5, 44_100, Encoding::Int16, 1);
    let mut rig = Rig::with_files(&queue, &[("samples/plain.wav", plain)]);

    rig.open();

    assert_eq!(entries(&rig), [Entry::File(FileId(0))]);
    assert!(!rig.control.library.file(FileId(0)).loaded);
    assert_eq!(rig.control.library.used(), 0);
    assert!(shows(
        &rig.control,
        &step_with(("1 file not loaded", RECORD))
    ));
}

#[test]
fn a_failed_load_leaves_its_file_not_loaded_and_its_blocks_free() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(
        &queue,
        &[
            ("samples/a.wav", converted(3_000, 1)),
            ("samples/b.wav", converted(100, 1)),
        ],
    );
    rig.step(1);
    // The Delete, the List and the head of a.wav.
    for _ in 0..3 {
        rig.serve(0);
        rig.step(1);
    }
    let (number, load) = rig.control.take_request().unwrap();
    assert!(matches!(load, Request::Load { .. }));
    let failed = Reply {
        number,
        status: Status::Failed,
        value: 0,
    };
    assert_eq!(rig.control.queue_reply(0, failed), Ok(()));
    rig.step(1);

    let requests = rig.open();

    assert_eq!(
        requests[1],
        Request::Load {
            file: path("samples/b.wav"),
            at: data_at(),
            length: 200,
            into: 0
        }
    );
    assert!(!rig.control.library.file(FileId(0)).loaded);
    assert!(rig.control.library.file(FileId(1)).loaded);
    assert_eq!(rig.control.library.used(), 2_048);
    assert!(shows(
        &rig.control,
        &step_with(("1 file not loaded", RECORD))
    ));
}

#[test]
fn the_dev_page_shows_the_library_meter() {
    let queue = Queue::new();
    // A second of mono audio takes 47 blocks, 96,256 bytes.
    let mut rig = Rig::with_files(&queue, &[("samples/Bass.wav", converted(48_000, 1))]);
    rig.open();
    rig.menu(10, 7);
    rig.page(20, 1);
    rig.step(30);
    // 96,256 of 64,000,000 bytes fill 98 of 65,535.
    let meter = ItemView {
        encoder: None,
        name: "Library",
        value: "0.1 of 64 MB",
        bar: Bar::Fill(98),
    };
    let dev = drawn(
        &[
            ("Settings", ACCENT),
            ("Dev", TEXT),
            ("T1", TEXT),
            ("1", DIM),
            ("Pads", DIM),
        ],
        None,
        |screen| {
            draw_item(screen, 2, 17, 160, &meter, true, None);
            draw_cursor(screen, 2, 17, 160, 17);
        },
        &[None; 4],
    );
    assert!(shows(&rig.control, &dev));

    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Minus);
    rig.tap(120, Button::Plus);
    rig.turn(130, 0, 1);
    rig.step(140);

    assert_eq!(rig.sent(), []);
    assert!(shows(&rig.control, &dev));
}

#[test]
fn the_meter_counts_whole_blocks() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", converted(1_025, 1))]);

    rig.open();

    assert_eq!(rig.control.library.used(), 4_096);
}
