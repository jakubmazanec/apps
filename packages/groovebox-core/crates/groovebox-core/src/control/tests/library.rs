//! The start-up, importing dropped files, SETTINGS' Dev page and SAMPLES.

use super::*;
use crate::blake3::Hasher;
use crate::budget;
use crate::library::wav::{self, Encoding, Format, Ours};
use crate::library::{Entry, FileId, FolderId};
use crate::storage::{Memory, Path};
use crate::ui::list::{Row, draw_rows};
use crate::ui::question::draw_question;
use crate::ui::test_pixels::MOVED;
use crate::ui::text;
use samples::Row as Line;
use std::format;
use std::string::String;
use view::{Cursor, Picker, Question, SamplesView};

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

    /// Carries out the request that is out and queues its reply at `sample` with `value` in place
    /// of the storage's, as a faulty platform might. Gives the request.
    #[allow(unsafe_code)]
    fn serve_claiming(&mut self, sample: u64, value: u64) -> Request {
        let (number, request) = self.control.take_request().expect("a request is out");
        // SAFETY: the rig has no audio part, so every block of its sample RAM is the control side's.
        let reply = unsafe { self.storage.carry_out(&request, &mut self.io, &self.ram) };
        let claimed = Reply {
            number,
            value,
            ..reply
        };
        assert_eq!(self.control.queue_reply(sample, claimed), Ok(()));
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
fn a_list_claiming_more_records_than_its_page_holds_ends_the_listing() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", converted(100, 1))]);
    rig.step(1);
    rig.serve(0);
    rig.step(1);
    // The page holds kick.wav's record of 13 bytes and no more.
    rig.io.truncate(13);

    assert!(matches!(rig.serve_claiming(0, 2), Request::List { .. }));
    rig.step(1);
    rig.io.resize(budget::IO_BUFFER, 0);
    rig.open();

    assert!(rig.control.library.file(FileId(0)).loaded);
    assert!(shows(
        &rig.control,
        &step_with(("Library can't be read", RECORD))
    ));
}

#[test]
fn a_head_claiming_more_bytes_than_the_buffer_holds_is_read_from_the_buffer() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[("samples/kick.wav", converted(100, 1))]);
    rig.step(1);
    // The Delete and the List.
    for _ in 0..2 {
        rig.serve(0);
        rig.step(1);
    }

    let claimed = budget::IO_BUFFER as u64 + 1;
    assert!(matches!(
        rig.serve_claiming(0, claimed),
        Request::Read { .. }
    ));
    rig.step(1);
    rig.open();

    assert!(rig.control.library.file(FileId(0)).loaded);
    assert_eq!(rig.control.message, None);
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

#[test]
fn a_dropped_head_claiming_more_bytes_than_the_buffer_holds_is_read_from_the_buffer() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.drop_files(10, &[("tmp/1/kick.wav", short(100.0, 0.01))]);
    rig.step(11);
    assert!(matches!(rig.serve(11), Request::List { .. }));
    rig.step(12);

    let claimed = budget::IO_BUFFER as u64 + 1;
    assert!(matches!(
        rig.serve_claiming(12, claimed),
        Request::Read { .. }
    ));
    rig.settle(13);

    assert_eq!(stored(&rig), ["samples/kick.wav"]);
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

/// SAMPLES' header on T1 in PADS mode while pad 1 is empty.
const SAMPLES_HEADER: [(&str, Color); 4] =
    [("Samples", ACCENT), ("T1", TEXT), ("1", DIM), ("Pads", DIM)];

/// A row of SAMPLES in the usual colours: its text bright and its label dim.
fn row<'a>(left: &'a str, right: Option<&'a str>) -> Row<'a> {
    Row {
        left,
        right,
        alert: false,
    }
}

/// The library meter showing `value`, its bar filled `fill` of 65,535.
fn meter(value: &str, fill: u16) -> ItemView<'_> {
    ItemView {
        encoder: None,
        name: "Library",
        value,
        bar: Bar::Fill(fill),
    }
}

/// SAMPLES over an empty strip: inside a folder the dim `line` and the rows under it, at the top
/// level the rows alone, from row `cursor.scroll` with the cursor on row `cursor.item`; and `meter`
/// above the strip.
fn samples(line: Option<&str>, rows: &[Row], cursor: Cursor, meter: &ItemView) -> Screen {
    drawn(
        &SAMPLES_HEADER,
        None,
        |screen| {
            let (y, fit) = match line {
                Some(line) => {
                    text::draw(screen, 5, 17, line, DIM);
                    (31, 14)
                }
                None => (17, 15),
            };
            draw_rows(screen, y, fit, rows, cursor.scroll, Some(cursor.item), 0);
            draw_item(screen, 2, 235, 476, meter, false, None);
        },
        &[None; 4],
    )
}

/// A second of Bass.wav at the top level, and drums/808/kick.wav and drums/clap.wav. They are files
/// 0 to 2, and drums/ and 808/ are folders 0 and 1.
fn three_files() -> [(&'static str, Vec<u8>); 3] {
    [
        ("samples/Bass.wav", converted(48_000, 1)),
        ("samples/drums/808/kick.wav", converted(14_400, 1)),
        ("samples/drums/clap.wav", converted(4_800, 1)),
    ]
}

/// The meter of `three_files`: their 67 blocks.
fn three_files_meter() -> ItemView<'static> {
    meter("0.1 of 64 MB", 140)
}

/// A rig whose library holds `files`, on SAMPLES, which MENU + 10 opened from sample 10 to 13.
fn on_samples<'a>(queue: &'a Queue<Message, MESSAGE_QUEUE>, files: &[(&str, Vec<u8>)]) -> Rig<'a> {
    let mut rig = Rig::with_files(queue, files);
    rig.open();
    rig.menu(10, 9);
    rig.step(20);
    rig
}

/// A preview of the mono file `file` of `frames` frames.
fn preview(file: u16, frames: u32) -> MessageKind {
    MessageKind::Preview {
        file: FileId(file),
        frames,
        stereo: false,
    }
}

const TOP: Cursor = Cursor { item: 0, scroll: 0 };

#[test]
fn menu_10_lists_the_top_level() {
    let queue = Queue::new();
    let rig = on_samples(&queue, &three_files());

    assert!(shows(
        &rig.control,
        &samples(
            None,
            &[row("drums/", None), row("Bass.wav", Some("1.0 s  96 KB"))],
            TOP,
            &three_files_meter()
        )
    ));
    // As in samples.png: a file's length and size end at x 474, and the meter's name starts at x 5
    // with its capitals on rows 238 to 244 and its bar on rows 249 and 250.
    let screen = picture(&rig.control);
    assert_eq!(
        span(&screen, 300..=477, 34..=40, DIM).map(|(_, last)| last),
        Some(474)
    );
    assert_eq!(span(&screen, 2..=100, 238..=244, DIM), Some((5, 45)));
    assert_eq!(span(&screen, 0..=479, 249..=250, FAINT), Some((6, 474)));
    assert_eq!(rig.lit(), [pad(0), track(0)]);
}

#[test]
fn inside_a_folder_a_dim_line_names_it_and_dot_dot_comes_first() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());

    rig.tap(100, Button::Ok);
    rig.step(110);
    assert!(shows(
        &rig.control,
        &samples(
            Some("drums/"),
            &[
                row("..", None),
                row("808/", None),
                row("clap.wav", Some("0.1 s  10 KB"))
            ],
            TOP,
            &three_files_meter()
        )
    ));

    rig.tap(200, Button::Down);
    rig.tap(210, Button::Ok);
    rig.step(220);
    assert!(shows(
        &rig.control,
        &samples(
            Some("drums/808/"),
            &[row("..", None), row("kick.wav", Some("0.3 s  29 KB"))],
            TOP,
            &three_files_meter()
        )
    ));
    // The line takes the first text row, and ".." is the row under it.
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 2..=477, 17..=29, TEXT), None);
    assert!(span(&screen, 2..=477, 20..=26, DIM).is_some());
    assert!(outlined(&screen, 1, 30, 478, 15, ACCENT));
}

#[test]
fn ok_enters_and_dot_dot_and_cancel_go_up_onto_the_folder_left() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    let (drums, eight_o_eight) = (Some(FolderId(0)), Some(FolderId(1)));
    let at = |folder, item, on| SamplesView {
        folder,
        cursor: Cursor { item, scroll: 0 },
        on: Some(on),
    };

    for (sample, button, view) in [
        (100, Button::Ok, at(drums, 0, Line::Up)),
        (110, Button::Down, at(drums, 1, Line::Folder(FolderId(1)))),
        (120, Button::Ok, at(eight_o_eight, 0, Line::Up)),
        (130, Button::Ok, at(drums, 1, Line::Folder(FolderId(1)))),
        (140, Button::Ok, at(eight_o_eight, 0, Line::Up)),
        (
            150,
            Button::Down,
            at(eight_o_eight, 1, Line::File(FileId(1))),
        ),
        (160, Button::Cancel, at(drums, 1, Line::Folder(FolderId(1)))),
        (170, Button::Cancel, at(None, 0, Line::Folder(FolderId(0)))),
        (180, Button::Cancel, at(None, 0, Line::Folder(FolderId(0)))),
    ] {
        rig.tap(sample, button);
        rig.step(sample + 2);
        assert_eq!(rig.control.view.samples, view, "{button:?} at {sample}");
    }
    // Only kick.wav played, and CANCEL stopped it.
    assert_eq!(
        rig.sent(),
        [
            message(0, 150, preview(1, 14_400)),
            message(1, 161, MessageKind::StopPreview)
        ]
    );
}

#[test]
fn the_arrows_and_minus_plus_move_rows_and_stop_at_the_ends() {
    let queue = Queue::new();
    let paths: Vec<String> = (0..30)
        .map(|n| format!("samples/{n:02}.wav"))
        .chain((0..40).map(|n| format!("samples/many/{n:02}.wav")))
        .collect();
    let files: Vec<_> = paths
        .iter()
        .map(|path| (path.as_str(), converted(1, 1)))
        .collect();
    let mut rig = on_samples(&queue, &files);
    let check = |rig: &mut Rig<'_>, moves: &[(u64, Button, usize)]| {
        for &(sample, button, row) in moves {
            rig.tap(sample, button);
            rig.step(sample + 2);
            let cursor = rig.control.view.samples.cursor.item;
            assert_eq!(cursor, row, "{button:?} at {sample}");
        }
    };

    // At the top level many/ and 30 files: up, down, - and + move one row and left and right 15,
    // all stopping at row 0 and row 30.
    check(
        &mut rig,
        &[
            (100, Button::Up, 0),
            (110, Button::Minus, 0),
            (120, Button::Left, 0),
            (130, Button::Plus, 1),
            (140, Button::Down, 2),
            (150, Button::Right, 17),
            (160, Button::Right, 30),
            (170, Button::Down, 30),
            (180, Button::Plus, 30),
            (190, Button::Left, 15),
            (200, Button::Minus, 14),
            (210, Button::Up, 13),
        ],
    );
    // The rows move only as far as they must: row 30 came in at the bottom, row 13 at the top.
    let names: Vec<String> = (0..30).map(|n| format!("{n:02}.wav")).collect();
    let rows: Vec<Row> = [row("many/", None)]
        .into_iter()
        .chain(names.iter().map(|name| row(name, Some("0.0 s  0 KB"))))
        .collect();
    let scrolled = Cursor {
        item: 13,
        scroll: 13,
    };
    assert_eq!(rig.control.view.samples.cursor, scrolled);
    assert!(shows(
        &rig.control,
        &samples(None, &rows, scrolled, &meter("0.1 of 64 MB", 146))
    ));

    // SHIFT + an arrow, - or + does nothing.
    rig.press(300, Button::Shift);
    check(
        &mut rig,
        &[
            (310, Button::Up, 13),
            (320, Button::Down, 13),
            (330, Button::Left, 13),
            (340, Button::Right, 13),
            (350, Button::Minus, 13),
            (360, Button::Plus, 13),
        ],
    );
    rig.let_go(370, Button::Shift);

    // Inside many/ ".." and 40 files: left and right move 14 rows, stopping at row 0 and row 40.
    check(&mut rig, &[(400, Button::Left, 0), (410, Button::Ok, 0)]);
    check(
        &mut rig,
        &[
            (500, Button::Right, 14),
            (510, Button::Right, 28),
            (520, Button::Right, 40),
            (530, Button::Down, 40),
            (540, Button::Left, 26),
            (550, Button::Left, 12),
            (560, Button::Left, 0),
            (570, Button::Up, 0),
        ],
    );
}

#[test]
fn moving_onto_a_file_previews_it_and_landing_does_not() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    assert_eq!(
        rig.control.library.file(FileId(0)).name.as_str(),
        "Bass.wav"
    );

    rig.tap(100, Button::Down);
    rig.menu(200, 0);
    rig.step(210);
    assert_eq!(
        rig.sent(),
        [
            message(0, 100, preview(0, 48_000)),
            message(1, 201, MessageKind::StopPreview)
        ]
    );

    // Back on SAMPLES the cursor is on Bass.wav, which does not play.
    rig.menu(300, 9);
    rig.step(310);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.samples.on, Some(Line::File(FileId(0))));

    // Moving off it plays nothing, and moving back onto it plays it.
    rig.tap(400, Button::Up);
    rig.tap(500, Button::Down);
    rig.step(510);
    assert_eq!(rig.sent(), [message(2, 500, preview(0, 48_000))]);
}

#[test]
fn a_folder_row_ok_cancel_and_leaving_stop_the_preview() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    let stop = MessageKind::StopPreview;

    // Each move from drums/ down onto Bass.wav plays it.
    rig.tap(100, Button::Down);
    rig.tap(110, Button::Up);
    rig.tap(120, Button::Down);
    rig.tap(130, Button::Ok);
    // OK opened the Delete picker, which CANCEL closes.
    rig.tap(135, Button::Cancel);
    // A stop with no preview since the last one sends nothing.
    rig.tap(140, Button::Cancel);
    rig.tap(150, Button::Up);
    rig.tap(160, Button::Down);
    rig.tap(170, Button::Cancel);
    rig.tap(180, Button::Up);
    rig.tap(190, Button::Down);
    // MENU or PAGE held without choosing a screen does not stop it.
    rig.tap(200, Button::Menu);
    rig.press(210, Button::Page);
    rig.let_go(210 + HOLD, Button::Page);
    rig.menu(20_000, 2);
    rig.step(20_010);
    assert_eq!(
        rig.sent(),
        [
            message(0, 100, preview(0, 48_000)),
            message(1, 110, stop),
            message(2, 120, preview(0, 48_000)),
            message(3, 130, stop),
            message(4, 160, preview(0, 48_000)),
            message(5, 171, stop),
            message(6, 190, preview(0, 48_000)),
            message(7, 20_001, stop),
        ]
    );

    // Inside drums/ ".." stops it too.
    rig.menu(30_000, 9);
    rig.tap(30_100, Button::Up);
    rig.tap(30_110, Button::Ok);
    rig.tap(30_120, Button::Right);
    rig.tap(30_130, Button::Left);
    rig.step(30_140);
    assert_eq!(
        rig.sent(),
        [
            message(8, 30_120, preview(2, 4_800)),
            message(9, 30_130, stop)
        ]
    );
}

#[test]
fn the_cursor_stays_on_its_file_when_an_import_adds_rows_above() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Down);
    rig.step(110);
    rig.sent();

    rig.drop_files(200, &[("tmp/1/Arp.wav", short(100.0, 0.01))]);
    rig.settle(210);

    // drums/, Arp.wav and Bass.wav: the cursor moved down with Bass.wav, and played nothing.
    assert_eq!(
        rig.control.view.samples,
        SamplesView {
            folder: None,
            cursor: Cursor { item: 2, scroll: 0 },
            on: Some(Line::File(FileId(0)))
        }
    );
    assert_eq!(rig.sent(), []);
}

#[test]
fn a_cursor_whose_row_is_gone_moves_to_the_row_above() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);
    rig.step(120);
    assert_eq!(rig.control.view.samples.on, Some(Line::File(FileId(2))));

    delete_under_cursor(&mut rig, 200);
    rig.control.applied(2, 224);
    rig.settle(300);

    assert_eq!(
        rig.control.view.samples,
        SamplesView {
            folder: Some(FolderId(0)),
            cursor: Cursor { item: 1, scroll: 0 },
            on: Some(Line::Folder(FolderId(1)))
        }
    );
}

#[test]
fn samples_opens_on_its_first_row_after_a_listing_of_several_pages() {
    let queue = Queue::new();
    let names: Vec<String> = (100..150)
        .map(|n| format!("samples/{n}.wav"))
        .chain([String::from("samples/zz/x.wav")])
        .collect();
    let files: Vec<_> = names
        .iter()
        .map(|name| (name.as_str(), converted(1, 1)))
        .collect();
    let mut rig = Rig::with_files(&queue, &files);
    // A buffer that holds a file's head holds 42 records of "100.wav", so zz/ comes on the second
    // page, though SAMPLES lists it first.
    rig.io.truncate(512);

    let requests = rig.open();
    rig.menu(10, 9);
    rig.step(20);

    let lists = requests
        .iter()
        .filter(|request| matches!(request, Request::List { .. }));
    assert_eq!(lists.count(), 2);
    assert_eq!(
        rig.control.view.samples,
        SamplesView {
            folder: None,
            cursor: TOP,
            on: Some(Line::Folder(FolderId(0)))
        }
    );
}

#[test]
fn not_loaded_files_are_red_and_play_nothing() {
    let queue = Queue::new();
    let plain = wav::sine(440.0, 0.5, 44_100, Encoding::Int16, 1);
    let mut rig = on_samples(
        &queue,
        &[
            ("samples/Bass.wav", converted(48_000, 1)),
            ("samples/plain.wav", plain),
        ],
    );

    assert!(shows(
        &rig.control,
        &samples(
            None,
            &[
                row("Bass.wav", Some("1.0 s  96 KB")),
                Row {
                    left: "plain.wav",
                    right: Some("not loaded"),
                    alert: true
                }
            ],
            TOP,
            &meter("0.1 of 64 MB", 98)
        )
    ));
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 2..=477, 31..=43, TEXT), None);
    assert_eq!(span(&screen, 2..=477, 31..=43, DIM), None);
    assert_eq!(
        span(&screen, 300..=477, 34..=40, RECORD).map(|(_, last)| last),
        Some(474)
    );

    rig.tap(100, Button::Down);
    rig.tap(110, Button::Up);
    rig.tap(120, Button::Down);
    rig.step(130);
    assert_eq!(
        rig.sent(),
        [
            message(0, 110, preview(0, 48_000)),
            message(1, 120, MessageKind::StopPreview)
        ]
    );
}

#[test]
fn the_encoders_hold_nothing_and_page_shows_sixteen_empty_tiles() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    let top_level = samples(
        None,
        &[row("drums/", None), row("Bass.wav", Some("1.0 s  96 KB"))],
        TOP,
        &three_files_meter(),
    );

    for encoder in 0..4 {
        rig.turn(100 + 10 * u64::from(encoder), encoder, 1);
        rig.tap(105 + 10 * u64::from(encoder), Button::Push(encoder));
    }
    rig.step(200);
    assert_eq!(rig.sent(), []);
    assert!(shows(&rig.control, &top_level));

    rig.press(300, Button::Page);
    rig.tap(310, Button::Step(0));
    rig.step(320);
    assert!(shows(
        &rig.control,
        &tiles(&SAMPLES_HEADER, &page_tiles(&[], 0))
    ));
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    rig.let_go(400, Button::Page);
    rig.step(410);
    assert!(shows(&rig.control, &top_level));
}

#[test]
fn a_long_name_scrolls_under_the_cursor() {
    let queue = Queue::new();
    // 64 characters do not fit beside "10.0 s  960 KB".
    let names = ["x".repeat(60) + ".wav", "y".repeat(60) + ".wav"];
    let paths = names.clone().map(|name| format!("samples/{name}"));
    let mut rig = on_samples(
        &queue,
        &[
            (&paths[0], converted(480_000, 1)),
            (&paths[1], converted(480_000, 1)),
        ],
    );
    let rows = names
        .each_ref()
        .map(|name| row(name, Some("10.0 s  960 KB")));
    let meter = meter("1.9 of 64 MB", 1_967);

    // The cursor last landed when MENU was let go, at 13.
    rig.step(13 + MOVED);

    assert!(shows(
        &rig.control,
        &drawn(
            &SAMPLES_HEADER,
            None,
            |screen| {
                draw_rows(screen, 17, 15, &rows, 0, Some(0), MOVED);
                draw_item(screen, 2, 235, 476, &meter, false, None);
            },
            &[None; 4],
        )
    ));
    assert!(!shows(&rig.control, &samples(None, &rows, TOP, &meter)));
}

/// Asks from `sample` on to delete the file under SAMPLES' cursor: OK opens the Delete picker, OK
/// on Delete opens the question and OK answers it, 10 samples apart.
fn delete_under_cursor(rig: &mut Rig<'_>, sample: u64) {
    for tap in 0..3 {
        rig.tap(sample + 10 * tap, Button::Ok);
    }
    rig.step(sample + 30);
}

fn forget(file: u16) -> MessageKind {
    MessageKind::ForgetSample { file: FileId(file) }
}

/// The rows of drums/ in `three_files`.
fn drums_rows() -> [Row<'static>; 3] {
    [
        row("..", None),
        row("808/", None),
        row("clap.wav", Some("0.1 s  10 KB")),
    ]
}

#[test]
fn ok_on_a_file_opens_the_delete_picker_and_stops_the_preview() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Down);

    rig.tap(200, Button::Ok);
    rig.step(210);

    assert_eq!(
        rig.sent(),
        [
            message(0, 100, preview(0, 48_000)),
            message(1, 200, MessageKind::StopPreview)
        ]
    );
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Delete(FileId(0)), TOP))
    );
    assert!(shows(
        &rig.control,
        &drawn(
            &SAMPLES_HEADER,
            None,
            |screen| {
                draw_rows(screen, 17, 16, &[row("Delete", None)], 0, Some(0), 0);
            },
            &[None; 4],
        )
    ));

    rig.tap(300, Button::Cancel);
    rig.step(310);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.picker, None);
    assert!(shows(
        &rig.control,
        &samples(
            None,
            &[row("drums/", None), row("Bass.wav", Some("1.0 s  96 KB"))],
            Cursor { item: 1, scroll: 0 },
            &three_files_meter()
        )
    ));
}

#[test]
fn the_question_names_the_file_and_only_ok_and_cancel_answer_it() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    let syn_1 = rig.synth_on(1);
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);
    rig.tap(200, Button::Ok);
    rig.tap(210, Button::Ok);
    rig.step(220);
    rig.sent();
    let at_clap = Cursor { item: 2, scroll: 0 };
    let mut question = samples(Some("drums/"), &drums_rows(), at_clap, &three_files_meter());
    draw_question(
        &mut question,
        &[
            ("Delete clap.wav?", TEXT),
            ("OK deletes, Cancel keeps", DIM),
        ],
    );
    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteFile(FileId(2)))
    );
    assert!(shows(&rig.control, &question));

    // The arrows, - and + do nothing, an encoder does nothing and MENU waits; a pad sounds but
    // does not select.
    rig.tap(300, Button::Down);
    rig.tap(310, Button::Minus);
    rig.turn(320, 0, 1);
    rig.menu(330, 0);
    rig.hit(340, 1, 100);
    rig.release(350, 1);
    rig.step(360);

    assert_eq!(
        rig.sent(),
        [
            message(2, 340, note_on(0, 0, syn_1, 60, 100)),
            message(3, 350, note_off(0))
        ]
    );
    assert_eq!(rig.track().selected_pad, Some(0));
    assert!(shows(&rig.control, &question));

    rig.tap(400, Button::Cancel);
    rig.step(410);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.question, None);
    assert!(shows(
        &rig.control,
        &samples(Some("drums/"), &drums_rows(), at_clap, &three_files_meter())
    ));
}

#[test]
fn a_question_drops_encoders_1_to_4_and_lets_the_volume_act() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // SAMPLES' encoders hold nothing, so the question is put over SETTINGS' Playing page, where
    // encoder 1 holds Velocity.
    rig.menu(100, 7);
    rig.step(110);
    rig.control.view.question = Some(Question::DeleteFile(FileId(0)));

    rig.turn(200, 0, -1);
    rig.turn(210, VOLUME, -1);
    rig.step(220);

    assert_eq!(rig.velocity(), 1);
    assert_eq!(rig.sent(), [message(0, 210, volume(45_875 - 512))]);
}

#[test]
fn ok_deletes_after_the_audio_part_let_go() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);

    delete_under_cursor(&mut rig, 200);

    assert_eq!(
        rig.sent(),
        [
            message(0, 110, preview(2, 4_800)),
            message(1, 200, MessageKind::StopPreview),
            message(2, 220, forget(2))
        ]
    );
    assert_eq!(rig.control.view.question, None);
    // Until the audio part let go, nothing goes to the storage, moving back onto clap.wav plays
    // nothing and OK on it offers no second delete.
    rig.tap(300, Button::Up);
    rig.tap(310, Button::Down);
    rig.tap(320, Button::Ok);
    rig.step(330);
    assert_eq!(rig.control.take_request(), None);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.picker, None);

    rig.control.applied(2, 224);
    rig.step(400);

    assert_eq!(
        rig.serve(400),
        Request::Delete {
            path: path("samples/drums/clap.wav")
        }
    );
    rig.step(401);
    assert_eq!(rig.control.take_request(), None);
    assert_eq!(
        stored(&rig),
        ["samples/Bass.wav", "samples/drums/808/kick.wav"]
    );
    let drums: Vec<_> = rig.control.library.entries(Some(FolderId(0))).collect();
    assert_eq!(drums, [Entry::Folder(FolderId(1))]);
    assert_eq!(rig.control.message, None);
    assert_eq!(rig.sent(), []);
}

#[test]
fn blocks_are_reused_only_after_the_audio_part_let_go() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);
    // clap.wav is previewing when it is deleted.
    delete_under_cursor(&mut rig, 200);
    let into = |requests: &[Request]| {
        requests.iter().find_map(|request| match *request {
            Request::Append {
                from: Memory::SampleRam,
                offset,
                ..
            } => Some(offset / 2_048),
            _ => None,
        })
    };

    // kick.wav takes blocks 0 to 14, clap.wav 15 to 19 and Bass.wav 20 to 66, so a drop imported
    // while the report is pending gets block 67.
    rig.drop_files(300, &[("tmp/1/Arp.wav", short(100.0, 0.01))]);
    let requests = rig.settle(310);
    assert_eq!(into(&requests), Some(67));

    rig.control.applied(2, 224);
    rig.settle(400);
    rig.drop_files(500, &[("tmp/2/Bell.wav", short(200.0, 0.01))]);
    let requests = rig.settle(510);

    assert_eq!(into(&requests), Some(15));
}

#[test]
fn deleting_the_last_file_of_a_folder_shows_the_folder_above() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Down);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Down);

    delete_under_cursor(&mut rig, 200);
    rig.control.applied(2, 224);
    rig.settle(300);

    // 808/ is gone, so SAMPLES shows drums/ with the cursor on "..", the row above where 808/ was.
    assert_eq!(stored(&rig), ["samples/Bass.wav", "samples/drums/clap.wav"]);
    assert_eq!(
        rig.control.view.samples,
        SamplesView {
            folder: Some(FolderId(0)),
            cursor: TOP,
            on: Some(Line::Up)
        }
    );
    assert!(shows(
        &rig.control,
        &samples(
            Some("drums/"),
            &[row("..", None), row("clap.wav", Some("0.1 s  10 KB"))],
            TOP,
            &meter("0.1 of 64 MB", 109)
        )
    ));
    assert_eq!(rig.sent()[2..], [message(2, 220, forget(1))]);

    // Two folders emptied at once: SAMPLES shows the top level, the cursor on the row above x/.
    let queue = Queue::new();
    let mut rig = on_samples(
        &queue,
        &[
            ("samples/a/b.wav", converted(100, 1)),
            ("samples/x/y/z.wav", converted(100, 1)),
        ],
    );
    rig.tap(100, Button::Down);
    rig.tap(110, Button::Ok);
    rig.tap(120, Button::Down);
    rig.tap(130, Button::Ok);
    rig.tap(140, Button::Down);

    delete_under_cursor(&mut rig, 200);
    rig.control.applied(2, 224);
    rig.settle(300);

    assert_eq!(stored(&rig), ["samples/a/b.wav"]);
    assert_eq!(
        rig.control.view.samples,
        SamplesView {
            folder: None,
            cursor: TOP,
            on: Some(Line::Folder(FolderId(0)))
        }
    );
}

#[test]
fn a_not_loaded_file_is_deleted_from_storage_only() {
    let queue = Queue::new();
    let plain = wav::sine(440.0, 0.5, 44_100, Encoding::Int16, 1);
    let mut rig = on_samples(
        &queue,
        &[
            ("samples/Bass.wav", converted(48_000, 1)),
            ("samples/plain.wav", plain),
        ],
    );
    rig.tap(100, Button::Down);

    delete_under_cursor(&mut rig, 200);

    assert_eq!(rig.sent(), []);
    assert_eq!(
        rig.serve(300),
        Request::Delete {
            path: path("samples/plain.wav")
        }
    );
    rig.step(301);
    assert_eq!(stored(&rig), ["samples/Bass.wav"]);
    assert_eq!(entries(&rig), [Entry::File(FileId(0))]);
    assert_eq!(rig.control.library.used(), 47 * 2_048);
    assert_eq!(rig.control.view.samples.on, Some(Line::File(FileId(0))));
}

#[test]
fn the_meter_drops_once_the_blocks_are_free() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Down);
    delete_under_cursor(&mut rig, 200);

    rig.control.applied(2, 224);
    rig.step(300);

    // The audio part let go of Bass.wav, but the storage still holds it.
    assert_eq!(rig.control.library.used(), 67 * 2_048);
    rig.settle(300);
    // Its 47 blocks are free: 20 blocks fill 41 of 65,535.
    assert_eq!(rig.control.library.used(), 20 * 2_048);
    assert!(shows(
        &rig.control,
        &samples(
            None,
            &[row("drums/", None)],
            TOP,
            &meter("0.0 of 64 MB", 41)
        )
    ));
}

#[test]
fn a_failed_delete_keeps_the_file_and_says_so() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);
    delete_under_cursor(&mut rig, 200);
    rig.control.applied(2, 224);
    rig.step(300);

    assert_eq!(
        rig.fail(300),
        Request::Delete {
            path: path("samples/drums/clap.wav")
        }
    );
    rig.step(301);

    let mut text = Label::new();
    text.push_str("clap.wav not deleted");
    assert_eq!(
        rig.control.message,
        Some(HeaderMessage {
            text,
            color: RECORD,
            name: (0, 8)
        })
    );
    let drums: Vec<_> = rig.control.library.entries(Some(FolderId(0))).collect();
    assert_eq!(drums, [Entry::Folder(FolderId(1)), Entry::File(FileId(2))]);
    assert_eq!(rig.control.library.used(), 67 * 2_048);
    // It plays again from the next preview.
    rig.sent();
    rig.tap(400, Button::Up);
    rig.tap(410, Button::Down);
    rig.step(420);
    assert_eq!(rig.sent(), [message(3, 410, preview(2, 4_800))]);
}

#[test]
fn a_file_the_storage_no_longer_holds_is_deleted_all_the_same() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Down);
    delete_under_cursor(&mut rig, 200);
    rig.control.applied(2, 224);
    rig.step(300);

    let (number, _) = rig.control.take_request().expect("a request is out");
    let missing = Reply {
        number,
        status: Status::Missing,
        value: 0,
    };
    assert_eq!(rig.control.queue_reply(300, missing), Ok(()));
    rig.step(301);

    assert_eq!(entries(&rig), [Entry::Folder(FolderId(0))]);
    assert_eq!(rig.control.message, None);
}

#[test]
fn a_delete_during_an_import_goes_out_between_its_requests() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &three_files());
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Right);
    rig.drop_files(150, &[("tmp/1/Arp.wav", short(100.0, 0.01))]);
    rig.step(151);
    // The import's listing is out, and its reply comes at 400.
    assert_eq!(
        rig.serve(400),
        Request::List {
            folder: path("tmp/1"),
            from: 0
        }
    );

    delete_under_cursor(&mut rig, 200);
    rig.control.applied(2, 224);
    rig.step(300);
    assert_eq!(rig.control.take_request(), None);
    rig.step(401);

    assert_eq!(
        rig.serve(401),
        Request::Delete {
            path: path("samples/drums/clap.wav")
        }
    );
    rig.step(402);
    assert_eq!(
        rig.serve(402),
        Request::Read {
            file: path("tmp/1/Arp.wav"),
            at: 0,
            length: 65_536
        }
    );
    rig.settle(403);
    assert_eq!(
        stored(&rig),
        [
            "samples/Arp.wav",
            "samples/Bass.wav",
            "samples/drums/808/kick.wav"
        ]
    );
    assert_eq!(rig.control.library.used(), 63 * 2_048);
}

/// a.wav and b.wav, which take every block of the sample RAM: 20,000 and 11,250 blocks.
fn two_files_filling_the_ram() -> [(&'static str, Vec<u8>); 2] {
    [
        ("samples/a.wav", converted(20_000 * 1_024, 1)),
        ("samples/b.wav", converted(11_250 * 1_024, 1)),
    ]
}

#[test]
fn an_import_after_a_delete_packs_the_tables_before_its_preview() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &two_files_filling_the_ram());
    delete_under_cursor(&mut rig, 100);
    rig.control.applied(0, 128);
    rig.settle(200);

    // c.wav takes one of a.wav's blocks, but its slice does not fit after b.wav's, which ends at
    // the last entry of the table.
    rig.drop_files(300, &[("tmp/1/c.wav", short(100.0, 0.01))]);
    rig.settle(310);
    rig.tap(400, Button::Down);
    rig.step(410);

    assert_eq!(
        rig.sent(),
        [
            message(0, 120, forget(0)),
            message(1, 310, MessageKind::UseTable { version: 1 }),
            message(2, 400, preview(0, 480))
        ]
    );
}

#[test]
fn only_the_report_of_a_use_table_ends_the_switch_of_tables() {
    let queue = Queue::new();
    let mut rig = on_samples(&queue, &two_files_filling_the_ram());
    delete_under_cursor(&mut rig, 100);
    rig.control.applied(0, 128);
    rig.settle(200);
    // b.wav's `ForgetSample` goes before c.wav packs the tables, and d.wav waits for the switch.
    delete_under_cursor(&mut rig, 300);
    rig.drop_files(
        400,
        &[
            ("tmp/1/c.wav", short(100.0, 0.01)),
            ("tmp/2/d.wav", short(200.0, 0.01)),
        ],
    );
    rig.settle(410);
    assert_eq!(
        rig.sent(),
        [
            message(0, 120, forget(0)),
            message(1, 320, forget(1)),
            message(2, 410, MessageKind::UseTable { version: 1 })
        ]
    );
    assert_eq!(rig.control.request, None);

    // The report of b.wav's `ForgetSample` lets its delete go on, but d.wav still waits.
    rig.control.applied(1, 416);
    let requests = rig.settle(500);
    assert_eq!(
        requests,
        [Request::Delete {
            path: path("samples/b.wav")
        }]
    );
    assert_eq!(rig.control.request, None);

    rig.control.applied(2, 416);
    let requests = rig.settle(600);

    assert_eq!(requests.first(), Some(&Request::Free));
    assert_eq!(stored(&rig), ["samples/c.wav", "samples/d.wav"]);
    assert_eq!(rig.control.library.used(), 2 * 2_048);
}
