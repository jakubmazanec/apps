//! The start-up, importing dropped files and SETTINGS' Dev page.

use super::*;
use crate::blake3::Hasher;
use crate::budget;
use crate::library::wav::{self, Encoding, Format, Ours};
use crate::library::{Entry, FileId, FolderId};
use crate::storage::{Memory, Path};
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

    /// Queues a `Failed` reply at `sample` to the request that is out. Gives the request.
    fn fail(&mut self, sample: u64) -> Request {
        let (number, request) = self.control.take_request().expect("a request is out");
        let failed = Reply {
            number,
            status: Status::Failed,
            value: 0,
        };
        assert_eq!(self.control.queue_reply(sample, failed), Ok(()));
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

    /// Puts `files` at their paths in `tmp/`, as the platform copies a drop, and queues the drop's
    /// input at `sample`.
    fn drop_files(&mut self, sample: u64, files: &[(&str, Vec<u8>)]) {
        for (path, bytes) in files {
            self.storage.put(path, bytes.clone());
        }
        let files = files.len() as u16;
        self.queue(sample, Input::Dropped { files });
    }

    /// Handles the events before `sample`, then serves every request at `sample` until none is
    /// out. Gives the requests.
    fn settle(&mut self, sample: u64) -> Vec<Request> {
        self.step(sample);
        let mut requests = Vec::new();
        while self.control.request.is_some() {
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

/// A 16-bit mono file of `seconds` of a sine at 48 kHz, which converts by rounding alone.
fn short(hz: f32, seconds: f32) -> Vec<u8> {
    wav::sine(hz, seconds, 48_000, Encoding::Int16, 1)
}

/// A 16-bit mono file of `frames` frames of silence at `rate`.
fn silence(frames: u32, rate: u32) -> Vec<u8> {
    wav::sine(0.0, frames as f32 / rate as f32, rate, Encoding::Int16, 1)
}

/// The fingerprint of audio of `channels` channels.
fn fingerprint(channels: u8, audio: &[u8]) -> [u8; 16] {
    let mut hasher = Hasher::new();
    hasher.update(&[channels]);
    hasher.update(audio);
    let mut fingerprint = [0; 16];
    hasher.finalize(&mut fingerprint);
    fingerprint
}

/// The paths of the storage's files.
fn stored<'a>(rig: &'a Rig<'_>) -> Vec<&'a str> {
    rig.storage.files().keys().map(String::as_str).collect()
}

/// The paths that the requests begin to write.
fn begun(requests: &[Request]) -> Vec<&str> {
    requests
        .iter()
        .filter_map(|request| match request {
            Request::Begin { file } => Some(file.as_str()),
            _ => None,
        })
        .collect()
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
fn a_file_with_our_chunk_but_another_format_is_not_loaded() {
    // In a converted file the `fmt ` chunk's rate is at byte 24 and its bits at byte 34.
    let mut bits_24 = converted(100, 1);
    bits_24[34..36].copy_from_slice(&24u16.to_le_bytes());
    let mut rate_44_1 = converted(100, 1);
    rate_44_1[24..28].copy_from_slice(&44_100u32.to_le_bytes());
    for file in [bits_24, rate_44_1] {
        let queue = Queue::new();
        let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", file)]);

        rig.open();

        assert_eq!(entries(&rig), [Entry::File(FileId(0))]);
        assert!(!rig.control.library.file(FileId(0)).loaded);
        assert_eq!(rig.control.library.used(), 0);
        assert!(shows(
            &rig.control,
            &step_with(("1 file not loaded", RECORD))
        ));
    }
}

#[test]
fn a_failed_list_ends_the_listing_and_says_the_library_cant_be_read() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", converted(100, 1))]);
    rig.step(1);
    rig.serve(0);
    rig.step(1);

    assert!(matches!(rig.fail(0), Request::List { .. }));
    rig.step(1);

    assert!(rig.control.startup.is_none());
    assert!(entries(&rig).is_empty());
    assert!(shows(
        &rig.control,
        &step_with(("Library can't be read", RECORD))
    ));
}

#[test]
fn a_failed_delete_of_tmp_says_the_library_cant_be_read() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", converted(100, 1))]);
    rig.step(1);

    assert_eq!(rig.fail(0), Request::Delete { path: path("tmp") });
    rig.step(1);

    assert_eq!(rig.control.take_request(), None);
    assert!(rig.control.startup.is_none());
    assert!(entries(&rig).is_empty());
    assert!(shows(
        &rig.control,
        &step_with(("Library can't be read", RECORD))
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
    assert!(matches!(rig.fail(0), Request::Load { .. }));
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

#[test]
#[allow(unsafe_code)]
fn a_dropped_file_is_converted_written_and_listed() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let kick = wav::sine(440.0, 1.0, 44_100, Encoding::Int24, 2);
    rig.drop_files(10, &[("tmp/1/drums/kick.wav", kick)]);
    rig.step(11);
    assert_eq!(
        rig.serve(11),
        Request::List {
            folder: path("tmp/1"),
            from: 0
        }
    );
    rig.step(12);
    assert!(shows(
        &rig.control,
        &step_with(("Importing kick.wav", ACCENT))
    ));

    let requests = rig.settle(20);

    assert!(shows(
        &rig.control,
        &step_with(("kick.wav imported", ACCENT))
    ));
    let file = &rig.storage.files()["samples/drums/kick.wav"];
    let header = wav::parse(file, file.len() as u64).unwrap();
    assert_eq!(
        header.format,
        Format {
            channels: 2,
            rate: 48_000,
            encoding: Encoding::Int16
        }
    );
    assert_eq!(header.frames, 48_000);
    let audio = &file[header.data_at as usize..];
    let ours = header.ours.unwrap();
    assert_eq!(ours.fingerprint, fingerprint(2, audio));
    assert_eq!(ours.original.as_str(), "kick.wav");
    // 48,000 stereo frames take 94 blocks, the first ones.
    assert_eq!(rig.control.library.used(), 94 * 2_048);
    // SAFETY: the rig has no audio part, so every block of its sample RAM is the control side's.
    assert_eq!(unsafe { rig.ram.bytes(0, audio.len() as u32) }, audio);
    assert_eq!(
        requests[requests.len() - 5..],
        [
            Request::Begin {
                file: path("samples/drums/kick.wav")
            },
            Request::Append {
                from: Memory::Io,
                offset: 0,
                length: header.data_at as u32
            },
            Request::Append {
                from: Memory::SampleRam,
                offset: 0,
                length: 192_000
            },
            Request::Commit,
            Request::Delete {
                path: path("tmp/1")
            },
        ]
    );
    assert_eq!(entries(&rig), [Entry::Folder(FolderId(0))]);
    let drums: Vec<_> = rig.control.library.entries(Some(FolderId(0))).collect();
    assert_eq!(drums, [Entry::File(FileId(0))]);
    let listed = rig.control.library.file(FileId(0));
    assert_eq!(listed.name.as_str(), "kick.wav");
    assert_eq!((listed.frames, listed.channels), (48_000, 2));
    assert_eq!((listed.root, listed.loop_points), (60, None));
    assert_eq!(listed.fingerprint, ours.fingerprint);
    assert!(listed.loaded);
    assert_eq!(stored(&rig), ["samples/drums/kick.wav"]);
}

#[test]
fn loose_files_sit_at_the_top_and_folders_keep_their_subfolders() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.drop_files(
        10,
        &[
            ("tmp/1/kick.wav", short(100.0, 0.01)),
            ("tmp/2/drums/808/clap.wav", short(200.0, 0.01)),
            ("tmp/3/drums/hat.wav", short(300.0, 0.01)),
            // At most four folder levels: deeper files go into the fourth.
            ("tmp/4/a/b/c/d/e/deep.wav", short(400.0, 0.01)),
        ],
    );

    rig.settle(20);

    assert_eq!(
        stored(&rig),
        [
            "samples/a/b/c/d/deep.wav",
            "samples/drums/808/clap.wav",
            "samples/drums/hat.wav",
            "samples/kick.wav"
        ]
    );
    // drums/ and 808/ are folders 0 and 1, a/ to d/ 2 to 5.
    assert_eq!(
        entries(&rig),
        [
            Entry::Folder(FolderId(2)),
            Entry::Folder(FolderId(0)),
            Entry::File(FileId(0))
        ]
    );
    let drums: Vec<_> = rig.control.library.entries(Some(FolderId(0))).collect();
    assert_eq!(drums, [Entry::Folder(FolderId(1)), Entry::File(FileId(2))]);
    assert_eq!(
        rig.control.library.path(FileId(3)).as_str(),
        "samples/a/b/c/d/deep.wav"
    );
    assert!(shows(
        &rig.control,
        &step_with(("4 files imported", ACCENT))
    ));
}

#[test]
fn an_identical_redrop_writes_nothing_and_counts_as_imported() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let kick = short(100.0, 0.1);
    rig.drop_files(10, &[("tmp/1/kick.wav", kick.clone())]);
    rig.settle(20);
    let written = rig.storage.files()["samples/kick.wav"].clone();
    let used = rig.control.library.used();

    rig.drop_files(30, &[("tmp/2/kick.wav", kick)]);
    let requests = rig.settle(40);

    assert!(begun(&requests).is_empty());
    assert_eq!(
        requests.last(),
        Some(&Request::Delete {
            path: path("tmp/2")
        })
    );
    assert_eq!(stored(&rig), ["samples/kick.wav"]);
    assert_eq!(rig.storage.files()["samples/kick.wav"], written);
    assert_eq!(entries(&rig), [Entry::File(FileId(0))]);
    assert_eq!(rig.control.library.used(), used);
    assert!(shows(
        &rig.control,
        &step_with(("kick.wav imported", ACCENT))
    ));
}

#[test]
fn different_audio_under_a_name_differing_in_case_gets_dash_2() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.drop_files(10, &[("tmp/1/kick.wav", short(100.0, 0.01))]);
    rig.settle(20);

    rig.drop_files(
        30,
        &[
            ("tmp/2/KICK.wav", short(200.0, 0.01)),
            ("tmp/3/Kick.wav", short(300.0, 0.01)),
        ],
    );
    let requests = rig.settle(40);

    assert_eq!(
        begun(&requests),
        ["samples/KICK-2.wav", "samples/Kick-3.wav"]
    );
    assert_eq!(
        stored(&rig),
        [
            "samples/KICK-2.wav",
            "samples/Kick-3.wav",
            "samples/kick.wav"
        ]
    );
    assert_eq!(
        entries(&rig),
        [
            Entry::File(FileId(1)),
            Entry::File(FileId(2)),
            Entry::File(FileId(0))
        ]
    );
    assert_eq!(
        rig.control.library.file(FileId(1)).name.as_str(),
        "KICK-2.wav"
    );
}

#[test]
fn a_file_that_does_not_fit_is_refused_and_the_ones_after_it_import() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // 700,000 frames at 1 kHz become 33,600,000 at 48 kHz: 67.2 MB.
    rig.drop_files(
        10,
        &[
            ("tmp/1/a.wav", short(100.0, 0.01)),
            ("tmp/2/big.wav", silence(700_000, 1_000)),
            ("tmp/3/c.wav", short(300.0, 0.01)),
        ],
    );

    let requests = rig.settle(20);

    assert_eq!(begun(&requests), ["samples/a.wav", "samples/c.wav"]);
    assert_eq!(stored(&rig), ["samples/a.wav", "samples/c.wav"]);
    assert_eq!(rig.control.library.used(), 2 * 2_048);
    assert!(shows(
        &rig.control,
        &step_with(("2 files imported, 1 not: library full", RECORD))
    ));
}

#[test]
fn a_file_that_fills_the_last_block_imports_and_one_byte_more_is_refused() {
    let queue = Queue::new();
    // The library leaves 10 blocks free, which hold 10,240 mono frames.
    let mut rig = Rig::with_files(&queue, &[("samples/big.wav", converted(31_240 * 1_024, 1))]);
    rig.open();

    rig.drop_files(10, &[("tmp/1/over.wav", silence(10_241, 48_000))]);
    rig.settle(20);

    assert!(shows(
        &rig.control,
        &step_with(("over.wav not imported: library full", RECORD))
    ));
    assert_eq!(rig.control.library.used(), 31_240 * 2_048);

    rig.drop_files(30, &[("tmp/2/exact.wav", silence(10_240, 48_000))]);
    rig.settle(40);

    assert!(shows(
        &rig.control,
        &step_with(("exact.wav imported", ACCENT))
    ));
    assert_eq!(rig.control.library.used(), 64_000_000);
    assert_eq!(stored(&rig), ["samples/big.wav", "samples/exact.wav"]);
}

#[test]
fn the_4097th_file_is_refused() {
    let queue = Queue::new();
    let names: Vec<String> = (0..4_096).map(|n| format!("samples/{n:04}.wav")).collect();
    let files: Vec<_> = names
        .iter()
        .map(|name| (name.as_str(), converted(1, 1)))
        .collect();
    let mut rig = Rig::with_files(&queue, &files);
    rig.open();
    assert_eq!(rig.control.library.used(), 4_096 * 2_048);

    rig.drop_files(10, &[("tmp/1/kick.wav", short(100.0, 0.01))]);
    rig.settle(20);

    assert!(shows(
        &rig.control,
        &step_with(("kick.wav not imported: library full", RECORD))
    ));
    assert_eq!(rig.control.library.used(), 4_096 * 2_048);
    assert!(!rig.storage.files().contains_key("samples/kick.wav"));
}

#[test]
fn storage_full_keeps_the_reserve() {
    let kick = short(100.0, 0.1);
    let mut original = Label::new();
    original.push_str("kick.wav");
    let ours = Ours {
        fingerprint: [0; 16],
        original,
    };
    let converted = wav::write_header(&mut [0; 512], 1, 4_800, 60, None, &ours) as u64 + 9_600;
    // The free space less the 9 MB reserve: one byte short of the converted file, then just enough.
    for (room, message) in [
        (
            converted - 1,
            ("kick.wav not imported: storage full", RECORD),
        ),
        (converted, ("kick.wav imported", ACCENT)),
    ] {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.storage = MemoryStorage::new(kick.len() as u64 + 9_000_000 + room);

        rig.drop_files(10, &[("tmp/1/kick.wav", kick.clone())]);
        rig.settle(20);

        assert!(shows(&rig.control, &step_with(message)), "{room}");
    }
}

#[test]
fn an_unreadable_wav_is_refused_and_reasons_are_listed_in_order() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // The `fmt ` chunk's bits are at byte 34.
    let mut eight_bit = short(100.0, 0.01);
    eight_bit[34..36].copy_from_slice(&8u16.to_le_bytes());

    rig.drop_files(
        10,
        &[
            ("tmp/1/eight.wav", eight_bit),
            ("tmp/2/good.wav", short(100.0, 0.01)),
            ("tmp/3/big.wav", silence(700_000, 1_000)),
        ],
    );
    rig.settle(20);

    assert_eq!(stored(&rig), ["samples/good.wav"]);
    assert!(shows(
        &rig.control,
        &step_with((
            "1 file imported, 2 not: library full, can't be read",
            RECORD
        ))
    ));
}

/// `file`, a plain WAV file from `wav::sine`, with a `smpl` chunk before its audio that names
/// `unity` and one loop.
fn with_smpl(file: &[u8], unity: u32, (first, last): (u32, u32)) -> Vec<u8> {
    let mut body = [0; 60];
    body[12..16].copy_from_slice(&unity.to_le_bytes());
    body[28..32].copy_from_slice(&1u32.to_le_bytes());
    body[44..48].copy_from_slice(&first.to_le_bytes());
    body[48..52].copy_from_slice(&last.to_le_bytes());
    // `sine`'s `data` chunk starts at byte 36.
    let mut with = file[..36].to_vec();
    with.extend_from_slice(b"smpl");
    with.extend_from_slice(&60u32.to_le_bytes());
    with.extend_from_slice(&body);
    with.extend_from_slice(&file[36..]);
    let riff = (with.len() - 8) as u32;
    with[4..8].copy_from_slice(&riff.to_le_bytes());
    with
}

#[test]
fn the_root_and_loop_come_from_smpl_then_the_name() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let plain = wav::sine(110.0, 0.25, 44_100, Encoding::Int16, 1);
    let looped = with_smpl(&plain, 40, (4_410, 8_819));

    rig.drop_files(
        10,
        &[("tmp/1/Bass_C2.wav", plain), ("tmp/2/Lead_C2.wav", looped)],
    );
    rig.settle(20);

    let bass = rig.control.library.file(FileId(0));
    assert_eq!((bass.root, bass.loop_points), (36, None));
    let lead = rig.control.library.file(FileId(1));
    assert_eq!((lead.root, lead.loop_points), (40, Some((4_800, 9_599))));
    let file = &rig.storage.files()["samples/Lead_C2.wav"];
    let header = wav::parse(file, file.len() as u64).unwrap();
    assert_eq!(
        (header.root, header.loop_points),
        (Some(40), Some((4_800, 9_599)))
    );
}

#[test]
fn a_drop_during_an_import_joins_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.drop_files(
        10,
        &[
            ("tmp/1/a.wav", short(100.0, 0.01)),
            ("tmp/2/b.wav", short(200.0, 0.01)),
            ("tmp/3/c.wav", short(300.0, 0.01)),
        ],
    );
    rig.step(11);
    rig.serve(11);
    rig.step(12);
    assert!(shows(
        &rig.control,
        &step_with(("Importing 3 files", ACCENT))
    ));

    rig.drop_files(
        12,
        &[
            ("tmp/4/d.wav", short(400.0, 0.01)),
            ("tmp/5/e.wav", short(500.0, 0.01)),
        ],
    );
    rig.step(13);
    assert!(shows(
        &rig.control,
        &step_with(("Importing 5 files", ACCENT))
    ));
    let requests = rig.settle(20);

    assert_eq!(
        begun(&requests),
        [
            "samples/a.wav",
            "samples/b.wav",
            "samples/c.wav",
            "samples/d.wav",
            "samples/e.wav"
        ]
    );
    assert!(shows(
        &rig.control,
        &step_with(("5 files imported", ACCENT))
    ));
}

#[test]
fn a_drop_during_loading_waits_for_the_project() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/zap.wav", converted(100, 1))]);
    rig.step(1);
    assert_eq!(rig.serve(0), Request::Delete { path: path("tmp") });
    rig.step(1);
    // The drop lands in `tmp/` once the start-up emptied it, while the library loads.
    rig.drop_files(1, &[("tmp/1/kick.wav", short(100.0, 0.01))]);

    let requests = rig.open();

    assert_eq!(
        requests,
        [
            Request::List {
                folder: path("samples"),
                from: 0
            },
            Request::Read {
                file: path("samples/zap.wav"),
                at: 0,
                length: 512
            },
            Request::Load {
                file: path("samples/zap.wav"),
                at: data_at(),
                length: 200,
                into: 0
            },
        ]
    );
    assert_eq!(
        rig.control.request,
        Some(Request::List {
            folder: path("tmp/1"),
            from: 0
        })
    );
    rig.settle(20);
    assert_eq!(stored(&rig), ["samples/kick.wav", "samples/zap.wav"]);
    assert!(shows(
        &rig.control,
        &step_with(("kick.wav imported", ACCENT))
    ));
}

#[test]
fn a_press_does_not_clear_importing_but_clears_the_result() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.drop_files(
        10,
        &[
            ("tmp/1/a.wav", short(100.0, 0.01)),
            ("tmp/2/b.wav", short(200.0, 0.01)),
        ],
    );
    rig.step(11);

    rig.tap(20, Button::Ok);
    rig.step(30);
    assert!(shows(
        &rig.control,
        &step_with(("Importing 2 files", ACCENT))
    ));
    rig.settle(40);
    assert!(shows(
        &rig.control,
        &step_with(("2 files imported", ACCENT))
    ));

    rig.tap(50, Button::Ok);
    rig.step(60);

    assert_eq!(rig.control.message, None);
    assert!(shows_step(&rig.control, &STEP_HEADER));
}

#[test]
fn a_long_name_is_shortened_so_the_rest_of_the_message_shows() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let path = format!("tmp/1/{}.wav", "x".repeat(56));

    rig.drop_files(10, &[(&path, b"not a wav".to_vec())]);
    rig.settle(20);

    // Right of STEP's pieces 386 pixels hold 64 characters: 35 of the name, the "…" and the rest.
    let shortened = format!("{}… not imported: can't be read", "x".repeat(35));
    assert!(shows(&rig.control, &step_with((&shortened, RECORD))));
}
