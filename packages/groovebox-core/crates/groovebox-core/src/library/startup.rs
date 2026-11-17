use super::wav::{self, Encoding};
use super::{Entry, File, FileId, Library};
use crate::audio::SAMPLE_RATE;
use crate::budget;
use crate::label::Label;
use crate::sample_ram::{Listed, Tables, blocks_for};
use crate::storage::{Path, Reply, Request, Status};
use core::fmt::Write;
use core::ops::ControlFlow;

/// The bytes of a file's head that the start-up reads: they hold every chunk of a converted file
/// up to its audio.
const HEAD: u32 = 512;

/// The start-up's job: it empties `tmp/`, lists `samples/` and loads every file into the sample
/// RAM in SAMPLES' order, depth first, one request at a time. A file stays not loaded when its
/// head is not this device's, when a request for it fails, and when it or a file before it finds
/// too few free blocks. When the storage fails the `Delete` or a `List`, the listing ends there
/// and the files listed so far load.
pub struct StartUp {
    stage: Stage,
    /// Each listed file's size in bytes, by `FileId`.
    sizes: [u32; budget::LIBRARY_FILES],
    not_loaded: u32,
    /// Whether a file found too few free blocks.
    too_big: bool,
    /// Whether the storage failed the `Delete` or a `List`.
    unreadable: bool,
}

/// The request the job waits for.
#[derive(Clone, Copy)]
enum Stage {
    EmptyingTmp,
    /// The page of `samples/` from entry `from`.
    Listing {
        from: u32,
    },
    /// The head of `file`, at place `at` of SAMPLES' order.
    Reading {
        at: usize,
        file: FileId,
    },
    /// `length` bytes of the audio of `file`, at place `at` of SAMPLES' order, from byte `done` of
    /// its audio, which starts at byte `data_at` of the file, into byte `into` of the sample RAM.
    Loading {
        at: usize,
        file: FileId,
        data_at: u64,
        done: u32,
        length: u32,
        into: u32,
    },
}

impl StartUp {
    pub const fn new() -> Self {
        Self {
            stage: Stage::EmptyingTmp,
            sizes: [0; budget::LIBRARY_FILES],
            not_loaded: 0,
            too_big: false,
            unreadable: false,
        }
    }

    /// The request the job waits for now.
    pub fn request(&self, library: &Library) -> Request {
        let path = |text| {
            let mut path = Path::new();
            path.push_str(text);
            path
        };
        match self.stage {
            Stage::EmptyingTmp => Request::Delete { path: path("tmp") },
            Stage::Listing { from } => Request::List {
                folder: path("samples"),
                from,
            },
            Stage::Reading { file, .. } => Request::Read {
                file: library.path(file),
                at: 0,
                length: HEAD,
            },
            Stage::Loading {
                file,
                data_at,
                done,
                length,
                into,
                ..
            } => Request::Load {
                file: library.path(file),
                at: data_at + u64::from(done),
                length,
                into,
            },
        }
    }

    /// Takes the reply to its request, with `io` as the request left it, and moves on: it
    /// continues while it has another request to wait for, and breaks once every file is loaded
    /// or not.
    #[allow(unsafe_code)]
    pub fn reply(
        &mut self,
        Reply { status, value, .. }: Reply,
        io: &[u8],
        library: &mut Library,
        tables: &Tables,
    ) -> ControlFlow<()> {
        match self.stage {
            // `Missing` is a storage without `tmp/` or `samples/`: nothing there.
            Stage::EmptyingTmp | Stage::Listing { .. }
                if !matches!(status, Status::Done | Status::More | Status::Missing) =>
            {
                self.unreadable = true;
                self.read_from(0, library)
            }
            Stage::EmptyingTmp => {
                self.stage = Stage::Listing { from: 0 };
                ControlFlow::Continue(())
            }
            Stage::Listing { from } => {
                if matches!(status, Status::Done | Status::More) {
                    let mut records = io;
                    for _ in 0..value {
                        let (path, rest) = records[1..].split_at(usize::from(records[0]));
                        let (size, rest) = rest
                            .split_first_chunk()
                            .expect("a record ends in the file's size");
                        records = rest;
                        match core::str::from_utf8(path).ok().and_then(|path| {
                            let file = library.free_file()?;
                            library.add(file, path)?;
                            Some(file)
                        }) {
                            Some(file) => {
                                self.sizes[usize::from(file.0)] = u32::from_le_bytes(*size)
                            }
                            None => self.not_loaded += 1,
                        }
                    }
                }
                if status == Status::More {
                    self.stage = Stage::Listing {
                        from: from + value as u32,
                    };
                    ControlFlow::Continue(())
                } else {
                    self.read_from(0, library)
                }
            }
            Stage::Reading { at, file } => {
                let Some((head, ours)) = (status == Status::Done)
                    .then(|| {
                        wav::parse(
                            &io[..value as usize],
                            u64::from(self.sizes[usize::from(file.0)]),
                        )
                    })
                    .flatten()
                    .filter(|head| {
                        head.format.encoding == Encoding::Int16 && head.format.rate == SAMPLE_RATE
                    })
                    .and_then(|head| Some((head, head.ours?)))
                else {
                    self.not_loaded += 1;
                    return self.read_from(at + 1, library);
                };
                let Some(blocks) = library
                    .blocks
                    .take(blocks_for(head.frames, head.format.channels))
                else {
                    self.too_big = true;
                    return self.read_from(at, library);
                };
                assert_eq!(
                    library.listing.add(tables, file, blocks),
                    Some(Listed::Appended),
                    "the start-up lists each file after the one before"
                );
                let listed = library.file_mut(file);
                *listed = File {
                    frames: head.frames,
                    channels: head.format.channels,
                    // C4, as for a file that names no root.
                    root: head.root.unwrap_or(60),
                    loop_points: head.loop_points,
                    fingerprint: ours.fingerprint,
                    ..*listed
                };
                self.load(at, file, head.data_at, 0, library, tables)
            }
            Stage::Loading {
                at,
                file,
                data_at,
                done,
                length,
                ..
            } => {
                if status == Status::Done && value == u64::from(length) {
                    if done + length < library.file(file).bytes() {
                        return self.load(at, file, data_at, done + length, library, tables);
                    }
                    library.file_mut(file).loaded = true;
                } else {
                    // SAFETY: the audio part was never told about the file.
                    unsafe { library.free_blocks(file, tables) };
                    self.not_loaded += 1;
                }
                self.read_from(at + 1, library)
            }
        }
    }

    /// The header's message once the job ended: that the library can't be read when the storage
    /// failed it, else how many files it did not load and whether the sample RAM ran out. None
    /// when it loaded every file.
    pub fn result<const N: usize>(&self) -> Option<Label<N>> {
        let mut text = Label::new();
        if self.unreadable {
            text.push_str("Library can't be read");
        } else if self.not_loaded > 0 {
            if self.too_big {
                text.push_str("Library too big. ");
            }
            write!(
                text,
                "{} file{} not loaded",
                self.not_loaded,
                if self.not_loaded == 1 { "" } else { "s" }
            )
            .expect("writing to a label never fails");
        } else {
            return None;
        }
        Some(text)
    }

    /// Waits for the head of the first file from place `at` of SAMPLES' order on, or breaks after
    /// the last. Once a file found too few free blocks, it and every file after it are not loaded.
    fn read_from(&mut self, at: usize, library: &Library) -> ControlFlow<()> {
        for (place, &entry) in library.tree[..library.listed].iter().enumerate().skip(at) {
            match entry {
                Entry::File(file) if !self.too_big => {
                    self.stage = Stage::Reading { at: place, file };
                    return ControlFlow::Continue(());
                }
                Entry::File(_) => self.not_loaded += 1,
                Entry::Folder(_) => {}
            }
        }
        ControlFlow::Break(())
    }

    /// Waits for the `Load` of the run of consecutive blocks of `file`, at place `at` of SAMPLES'
    /// order, that holds byte `done` of its audio on, which starts at byte `data_at` of the file.
    fn load(
        &mut self,
        at: usize,
        file: FileId,
        data_at: u64,
        done: u32,
        library: &Library,
        tables: &Tables,
    ) -> ControlFlow<()> {
        let (into, length) = library.run(tables, file, done, library.file(file).bytes());
        self.stage = Stage::Loading {
            at,
            file,
            data_at,
            done,
            length,
            into,
        };
        ControlFlow::Continue(())
    }
}

impl Default for StartUp {
    fn default() -> Self {
        Self::new()
    }
}
