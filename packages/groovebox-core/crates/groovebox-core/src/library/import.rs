use super::convert::{Converter, output_frames};
use super::wav::{self, Encoding, Format, Ours};
use super::{Entry, File, FileId, FolderId, Library, name};
use crate::audio::SAMPLE_RATE;
use crate::blake3::Hasher;
use crate::budget;
use crate::control::HeaderMessage;
use crate::label::Label;
use crate::message::MessageKind;
use crate::palette::{ACCENT, RECORD};
use crate::sample_ram::{BLOCK, Listed, SampleRam, Tables, blocks_for};
use crate::storage::{Memory, Path, Reply, Request, Status};
use core::fmt::Write;
use core::ops::ControlFlow;

/// The bytes of a dropped file's head that the import reads: its chunks up to its audio must lie in
/// them.
const HEAD: u32 = budget::IO_BUFFER as u32;
/// The folders of a dropped path that the library keeps: deeper files go into the fourth.
const FOLDER_LEVELS: usize = 4;
/// The samples decoded at a time: whole frames of one or two channels.
const DECODED: usize = 256;
/// The reasons a file is not imported, in the order the header lists them.
const REASONS: [&str; 3] = ["library full", "storage full", "can't be read"];

/// Why a file is not imported: its reason's place in `REASONS`.
#[derive(Clone, Copy)]
enum Refusal {
    LibraryFull,
    StorageFull,
    Unreadable,
}

/// The request the job waits for.
#[derive(Clone, Copy)]
enum Stage {
    /// The listing of the file's folder in `tmp/`.
    Listing,
    /// The file's head.
    Reading,
    /// No request: `Listing::add` waits for the audio part to switch block tables.
    Switching,
    /// The storage's free bytes.
    Freeing,
    /// The piece of the file's audio from byte `done` of it.
    Converting {
        done: u64,
    },
    /// No request: the file's name is taken, and its replace waits for the delete that runs to
    /// end (`settle`).
    Settling,
    Beginning,
    /// The converted file's head, from Io.
    AppendingHead,
    /// `length` bytes of the converted audio from byte `done` of it, from byte `from` of the sample
    /// RAM.
    Appending {
        done: u32,
        from: u32,
        length: u32,
    },
    Committing,
    /// The deletion of the file it replaces, whose name differs from its own in case.
    Removing,
    /// No request: the audio part lets go of the file it replaces (`list_written`).
    LettingGo,
    /// The deletion of the file's folder in `tmp/`.
    Deleting,
}

/// The import's job: it takes the dropped files in the order dropped, the k-th in `tmp/<k>/`, one
/// request at a time. For each it lists its folder in `tmp/` for its path, reads its head and
/// checks it in this order: whether it can be read, whether the library has room for its file, its
/// folders and its blocks at 48 kHz, and whether the storage's free space less the reserve holds
/// the converted file. It takes the blocks, reads the audio in pieces of whole frames and converts
/// it into them, hashing it for the fingerprint. It writes the converted file under `samples/`
/// under its own name, its head from Io and its audio from the blocks, lists it in the library
/// and deletes its folder in `tmp/`. A name the folder holds already, but for case, replaces that
/// file: the old file stays until the new one is written whole, then its other spelling goes from
/// the storage, and the audio part lets go of it as of a deleted file before the library unlists
/// it and its blocks are free. A refused file gives its blocks back and is deleted from `tmp/`
/// too; any failed request refuses it as unreadable.
pub struct Import {
    /// The files dropped since the start.
    dropped: u32,
    /// The number of the file the job works on or takes next, counting from 1.
    next: u32,
    /// None while the job is idle.
    stage: Option<Stage>,
    /// The files of this import, those imported and the reasons the others were not, by
    /// `Refusal`.
    files: u32,
    imported: u32,
    reasons: [bool; 3],
    /// The file's path in its folder in `tmp/` and its size.
    path: Label<255>,
    size: u32,
    /// Its name in the library before any number; empty until the listing comes.
    name: Label<64>,
    /// What its head says: its format, where its audio starts and its frames.
    format: Format,
    data_at: u64,
    frames: u32,
    /// Its frames at 48 kHz, its root and its loop at 48 kHz.
    converted: u32,
    root: u8,
    loop_points: Option<(u32, u32)>,
    /// Its place in the library, which the listing holds its blocks for while `holding`.
    file: FileId,
    holding: bool,
    /// The bytes of its converted head.
    head: u32,
    converter: Option<Converter>,
    hasher: Option<Hasher>,
    /// The samples converted so far.
    written: u32,
    fingerprint: [u8; 16],
    /// Its path under `samples/`.
    target: Path,
    /// The file of the library it replaces, from `settle` until the library lists the new one.
    old: Option<FileId>,
    /// The message to send at once, once: a `UseTable` as `Listing::add` packed the tables, or the
    /// `ForgetSample` of the file it replaces.
    message: Option<MessageKind>,
    /// The file replaced and the file that replaced it, once, as the library lists the new one.
    replaced: Option<(FileId, FileId)>,
}

impl Import {
    pub const fn new() -> Self {
        Self {
            dropped: 0,
            next: 1,
            stage: None,
            files: 0,
            imported: 0,
            reasons: [false; 3],
            path: Label::new(),
            size: 0,
            name: Label::new(),
            format: Format {
                channels: 0,
                rate: 0,
                encoding: Encoding::Int16,
            },
            data_at: 0,
            frames: 0,
            converted: 0,
            root: 0,
            loop_points: None,
            file: FileId(0),
            holding: false,
            head: 0,
            converter: None,
            hasher: None,
            written: 0,
            fingerprint: [0; 16],
            target: Path::new(),
            old: None,
            message: None,
            replaced: None,
        }
    }

    /// Adds the `files` files of a drop, the next numbers in `tmp/`, to the files waiting.
    pub fn add(&mut self, files: u16) {
        self.dropped += u32::from(files);
        self.files += u32::from(files);
    }

    /// Starts on the files waiting unless it runs already. Gives whether it started.
    pub fn start(&mut self) -> bool {
        let start = self.stage.is_none() && self.next <= self.dropped;
        if start {
            self.list();
        }
        start
    }

    /// Whether it works on a file.
    pub fn running(&self) -> bool {
        self.stage.is_some()
    }

    /// The request the job waits for now; none while it is idle or waits for the audio part or a
    /// delete.
    pub fn request(&self, library: &Library) -> Option<Request> {
        let mut folder = Path::new();
        write!(folder, "tmp/{}", self.next).expect("writing to a label never fails");
        let mut source = folder;
        source.push_str("/");
        source.push_str(self.path.as_str());
        Some(match self.stage? {
            Stage::Listing => Request::List { folder, from: 0 },
            Stage::Reading => Request::Read {
                file: source,
                at: 0,
                length: HEAD,
            },
            Stage::Switching => return None,
            Stage::Freeing => Request::Free,
            Stage::Converting { done } => Request::Read {
                file: source,
                at: self.data_at + done,
                length: self.piece(done),
            },
            Stage::Beginning => {
                let mut file = Path::new();
                file.push_str("samples/");
                file.push_str(self.target.as_str());
                Request::Begin { file }
            }
            Stage::AppendingHead => Request::Append {
                from: Memory::Io,
                offset: 0,
                length: self.head,
            },
            Stage::Appending { from, length, .. } => Request::Append {
                from: Memory::SampleRam,
                offset: from,
                length,
            },
            Stage::Committing => Request::Commit,
            Stage::Removing => Request::Delete {
                path: library.path(self.old.expect("only a replace removes a file")),
            },
            Stage::Settling | Stage::LettingGo => return None,
            Stage::Deleting => Request::Delete { path: folder },
        })
    }

    /// Takes the reply to its request, with `io` as the request left it, and moves on: it
    /// continues while files wait or it waits for the audio part, and breaks with the header's
    /// message once the last file waiting is done.
    pub fn reply(
        &mut self,
        Reply { status, value, .. }: Reply,
        io: &mut [u8],
        ram: &SampleRam,
        library: &mut Library,
        tables: &Tables,
    ) -> ControlFlow<HeaderMessage> {
        let ok = status == Status::Done;
        match self.stage.expect("a reply comes only to a request") {
            Stage::Listing => {
                // A drop's folder in `tmp/` holds its one file.
                let (path, rest) = io[1..].split_at(usize::from(io[0]));
                match core::str::from_utf8(path) {
                    Ok(path) if ok && value > 0 => {
                        self.path = Label::new();
                        self.path.push_str(path);
                        self.size = u32::from_le_bytes(
                            *rest
                                .first_chunk()
                                .expect("a record ends in the file's size"),
                        );
                        self.name = name::file_name(self.original());
                        self.stage = Some(Stage::Reading);
                    }
                    _ => self.end(Some(Refusal::Unreadable), library, tables),
                }
            }
            Stage::Reading => {
                let Some(head) = ok
                    .then(|| {
                        wav::parse(
                            &io[..value.min(io.len() as u64) as usize],
                            u64::from(self.size),
                        )
                    })
                    .flatten()
                else {
                    self.end(Some(Refusal::Unreadable), library, tables);
                    return ControlFlow::Continue(());
                };
                let converted =
                    u32::try_from(output_frames(u64::from(head.frames), head.format.rate)).ok();
                let (_, _, new_folders) = self.folders(library);
                let free_folders = library
                    .folders
                    .iter()
                    .filter(|folder| folder.is_none())
                    .count();
                match (converted, library.free_file()) {
                    (Some(converted), Some(file)) if new_folders <= free_folders => {
                        let rate = u64::from(head.format.rate);
                        // A frame at 48 kHz, rounded and within the audio.
                        let at_48 = |frame: u32| {
                            let frame =
                                (u64::from(frame) * u64::from(SAMPLE_RATE) + rate / 2) / rate;
                            (frame as u32).min(converted - 1)
                        };
                        self.format = head.format;
                        self.data_at = head.data_at;
                        self.frames = head.frames;
                        self.converted = converted;
                        // C4 when neither the file nor its name gives a root.
                        self.root = head
                            .root
                            .or_else(|| wav::root_from_name(self.original()))
                            .unwrap_or(60);
                        self.loop_points = head
                            .loop_points
                            .map(|(first, last)| (at_48(first), at_48(last)));
                        self.file = file;
                        self.take_blocks(library, tables);
                    }
                    _ => self.end(Some(Refusal::LibraryFull), library, tables),
                }
            }
            Stage::Switching | Stage::Settling | Stage::LettingGo => {
                unreachable!("no request is out while the job waits for the audio part or a delete")
            }
            Stage::Freeing if !ok => self.end(Some(Refusal::Unreadable), library, tables),
            Stage::Freeing => {
                if value.saturating_sub(budget::STORAGE_RESERVE as u64)
                    < u64::from(self.head + self.bytes())
                {
                    self.end(Some(Refusal::StorageFull), library, tables);
                } else {
                    let channels = self.format.channels;
                    self.converter = Some(Converter::new(self.format.rate, channels));
                    let mut hasher = Hasher::new();
                    hasher.update(&[channels]);
                    self.hasher = Some(hasher);
                    self.written = 0;
                    self.stage = Some(Stage::Converting { done: 0 });
                }
            }
            Stage::Converting { done } => {
                let length = self.piece(done);
                if !ok || value != u64::from(length) {
                    self.end(Some(Refusal::Unreadable), library, tables);
                } else {
                    self.convert(Some(&io[..length as usize]), library, tables, ram);
                    let done = done + u64::from(length);
                    if self.piece(done) > 0 {
                        self.stage = Some(Stage::Converting { done });
                    } else {
                        self.convert(None, library, tables, ram);
                        assert_eq!(
                            self.written,
                            self.converted * u32::from(self.format.channels),
                            "the conversion gives the frames that `output_frames` counts"
                        );
                        self.hasher
                            .as_ref()
                            .expect("the conversion has started")
                            .finalize(&mut self.fingerprint);
                        self.stage = Some(Stage::Settling);
                    }
                }
            }
            Stage::Beginning
            | Stage::AppendingHead
            | Stage::Appending { .. }
            | Stage::Committing
                if status == Status::Full =>
            {
                self.end(Some(Refusal::StorageFull), library, tables)
            }
            Stage::Beginning
            | Stage::AppendingHead
            | Stage::Appending { .. }
            | Stage::Committing
                if !ok =>
            {
                self.end(Some(Refusal::Unreadable), library, tables)
            }
            Stage::Beginning => {
                wav::write_header(
                    io,
                    self.format.channels,
                    self.converted,
                    self.root,
                    self.loop_points,
                    &self.ours(),
                );
                self.stage = Some(Stage::AppendingHead);
            }
            Stage::AppendingHead => self.append(0, library, tables),
            Stage::Appending { done, length, .. } if done + length < self.bytes() => {
                self.append(done + length, library, tables)
            }
            Stage::Appending { .. } => self.stage = Some(Stage::Committing),
            Stage::Committing => match self.old {
                // The storage keeps a name that differs in case beside the new one.
                Some(old) if library.file(old).name != self.name => {
                    self.stage = Some(Stage::Removing);
                }
                _ => self.forget_old(library, tables),
            },
            // The library lists the old file beside the new one while the storage keeps it.
            Stage::Removing if !matches!(status, Status::Done | Status::Missing) => {
                self.old = None;
                self.forget_old(library, tables);
            }
            Stage::Removing => self.forget_old(library, tables),
            Stage::Deleting => {
                self.next += 1;
                if self.next <= self.dropped {
                    self.list();
                } else {
                    let result = self.result();
                    self.stage = None;
                    self.files = 0;
                    self.imported = 0;
                    self.reasons = [false; 3];
                    return ControlFlow::Break(result);
                }
            }
        }
        ControlFlow::Continue(())
    }

    /// Hears that the audio part switched to the block table that the latest `UseTable` named,
    /// and takes the blocks the job waits for. Gives whether it waited for them, so that it has a
    /// request now.
    ///
    /// # Safety
    ///
    /// The applied report of the `UseTable` that the latest `Listed::Packed` asked for has come
    /// back.
    #[allow(unsafe_code)]
    pub unsafe fn applied(&mut self, library: &mut Library, tables: &Tables) -> bool {
        // SAFETY: the caller promises that the audio part switched.
        unsafe { library.listing.applied() };
        let waited = matches!(self.stage, Some(Stage::Switching));
        if waited {
            self.take_blocks(library, tables);
        }
        waited
    }

    /// The message to send at once, once.
    pub fn message(&mut self) -> Option<MessageKind> {
        self.message.take()
    }

    /// The file it replaces, from `settle` until the library lists the new one: meanwhile it is
    /// never previewed and no delete starts.
    pub fn replacing(&self) -> Option<FileId> {
        self.old
    }

    /// The file replaced and the file that replaced it, once the library lists the new one.
    pub fn replaced(&mut self) -> Option<(FileId, FileId)> {
        self.replaced.take()
    }

    /// The header's message while it runs: "Importing 3 files", or "Importing kick.wav" for one
    /// once its listing has named it.
    pub fn progress(&self) -> Option<HeaderMessage> {
        self.stage?;
        let mut text = Label::new();
        let mut name = (0, 0);
        if self.files == 1 {
            if self.name.as_str().is_empty() {
                return None;
            }
            text.push_str("Importing ");
            name.0 = text.as_str().len();
            text.push_str(self.name.as_str());
            name.1 = text.as_str().len();
        } else {
            write!(text, "Importing {} files", self.files).expect("writing to a label never fails");
        }
        Some(HeaderMessage {
            text,
            color: ACCENT,
            name,
        })
    }

    /// The header's message once the files waiting are done: "kick.wav imported" or "3 files
    /// imported" in the accent, or in red "kick.wav not imported: library full" or "2 files
    /// imported, 1 not: library full, can't be read".
    fn result(&self) -> HeaderMessage {
        let refused = self.files - self.imported;
        let mut text = Label::new();
        let mut name = (0, 0);
        if self.files == 1 && !self.name.as_str().is_empty() {
            text.push_str(self.name.as_str());
            name.1 = text.as_str().len();
            text.push_str(if refused == 0 {
                " imported"
            } else {
                " not imported: "
            });
        } else {
            write!(
                text,
                "{} file{} imported",
                self.imported,
                if self.imported == 1 { "" } else { "s" }
            )
            .expect("writing to a label never fails");
            if refused > 0 {
                write!(text, ", {refused} not: ").expect("writing to a label never fails");
            }
        }
        let mut separator = "";
        for (reason, given) in REASONS.iter().zip(self.reasons) {
            if given {
                text.push_str(separator);
                text.push_str(reason);
                separator = ", ";
            }
        }
        HeaderMessage {
            text,
            color: if refused == 0 { ACCENT } else { RECORD },
            name,
        }
    }

    /// Waits for the listing of the next file's folder in `tmp/`.
    fn list(&mut self) {
        self.name = Label::new();
        self.stage = Some(Stage::Listing);
    }

    /// The name the file was dropped with.
    fn original(&self) -> &str {
        self.path
            .as_str()
            .rsplit('/')
            .next()
            .expect("a split gives at least one part")
    }

    fn ours(&self) -> Ours {
        let mut original = Label::new();
        original.push_str(self.original());
        Ours {
            fingerprint: self.fingerprint,
            original,
        }
    }

    /// The bytes of the converted audio.
    fn bytes(&self) -> u32 {
        self.converted * u32::from(self.format.channels) * 2
    }

    /// The bytes of the piece of the file's audio from byte `done`: as many whole frames as Io
    /// holds, or the rest.
    fn piece(&self, done: u64) -> u32 {
        let frame = u64::from(self.format.channels) * self.format.encoding.bytes() as u64;
        (u64::from(self.frames) * frame - done).min(budget::IO_BUFFER as u64 / frame * frame) as u32
    }

    /// Where the file goes under `samples/`: its first four folders, each named as the library
    /// names a folder there whose name differs only in case, and each followed by "/". Also the
    /// deepest of them that the library lists and how many it does not list.
    fn folders(&self, library: &Library) -> (Path, Option<FolderId>, usize) {
        let (mut place, mut folder, mut new) = (Path::new(), None, 0);
        let mut parts = self.path.as_str().split('/');
        parts.next_back();
        for part in parts.take(FOLDER_LEVELS) {
            let name = name::folder_name(part);
            let listed = library.folders.iter().position(|listed| {
                listed.is_some_and(|listed| {
                    listed.parent == folder && name::same(listed.name.as_str(), name.as_str())
                })
            });
            match listed.filter(|_| new == 0) {
                Some(listed) => {
                    folder = Some(FolderId(listed as u16));
                    place.push_str(library.folder(FolderId(listed as u16)).name.as_str());
                }
                None => {
                    new += 1;
                    place.push_str(name.as_str());
                }
            }
            place.push_str("/");
        }
        (place, folder, new)
    }

    /// Takes the file's blocks and lists them as its slice, waits for the switch of tables that
    /// `Listing::add` waits for, or refuses the file when too few blocks are free.
    fn take_blocks(&mut self, library: &mut Library, tables: &Tables) {
        let Some(blocks) = library
            .blocks
            .take(blocks_for(self.converted, self.format.channels))
        else {
            return self.end(Some(Refusal::LibraryFull), library, tables);
        };
        match library.listing.add(tables, self.file, blocks) {
            None => self.stage = Some(Stage::Switching),
            Some(listed) => {
                if let Listed::Packed { version } = listed {
                    self.message = Some(MessageKind::UseTable { version });
                }
                self.holding = true;
                self.head = wav::write_header(
                    &mut [0; 512],
                    self.format.channels,
                    self.converted,
                    self.root,
                    self.loop_points,
                    &self.ours(),
                ) as u32;
                self.stage = Some(Stage::Freeing);
            }
        }
    }

    /// Converts the audio in `input`, or the rest after the end when there is none, into the
    /// file's blocks and its fingerprint.
    #[allow(unsafe_code)]
    fn convert(
        &mut self,
        input: Option<&[u8]>,
        library: &Library,
        tables: &Tables,
        ram: &SampleRam,
    ) {
        let converter = self.converter.as_mut().expect("the conversion has started");
        let hasher = self.hasher.as_mut().expect("the conversion has started");
        let written = &mut self.written;
        let mut blocks = library
            .listing
            .blocks(tables, self.file)
            .skip(*written as usize * 2 / BLOCK);
        let mut block = None;
        let mut out = |sample: i16| {
            let at = *written * 2 % BLOCK as u32;
            if at == 0 || block.is_none() {
                block = blocks.next();
            }
            let into = block.expect("a file's blocks hold all of its audio") * BLOCK as u32 + at;
            let bytes = sample.to_le_bytes();
            // SAFETY: the import took the block, and the audio part was never told about the file.
            unsafe { ram.bytes(into, 2) }.copy_from_slice(&bytes);
            hasher.update(&bytes);
            *written += 1;
        };
        let encoding = self.format.encoding;
        match input {
            Some(input) => {
                for piece in input.chunks(DECODED * encoding.bytes()) {
                    let mut samples = [0.0; DECODED];
                    let samples = &mut samples[..piece.len() / encoding.bytes()];
                    wav::decode(encoding, piece, samples);
                    converter.push(samples, &mut out);
                }
            }
            None => converter.finish(&mut out),
        }
    }

    /// Once the file is converted, settles where it goes: under its own name in its folder,
    /// replacing the file there whose name is the same but for case. A replace waits while a
    /// delete runs (`deleting`), so that the two never take the same file and the audio part lets
    /// go of one file at a time.
    pub fn settle(&mut self, library: &Library, deleting: bool) {
        if !matches!(self.stage, Some(Stage::Settling)) {
            return;
        }
        let (place, folder, new_folders) = self.folders(library);
        let old = library
            .entries(folder)
            .filter(|_| new_folders == 0)
            .find_map(|entry| match entry {
                Entry::File(file) => Some(file).filter(|&file| {
                    name::same(library.file(file).name.as_str(), self.name.as_str())
                }),
                Entry::Folder(_) => None,
            });
        if old.is_some() && deleting {
            return;
        }
        self.old = old;
        self.target = place;
        self.target.push_str(self.name.as_str());
        self.stage = Some(Stage::Beginning);
    }

    /// Lists the written file once the audio part let go of the file it replaces: of a loaded one
    /// it asks with a `ForgetSample` and waits for its report.
    #[allow(unsafe_code)]
    fn forget_old(&mut self, library: &mut Library, tables: &Tables) {
        match self.old.filter(|&old| library.file(old).loaded) {
            Some(file) => {
                self.message = Some(MessageKind::ForgetSample { file });
                self.stage = Some(Stage::LettingGo);
            }
            // SAFETY: the audio part was never told about a file that is not loaded.
            None => unsafe { self.list_written(library, tables) },
        }
    }

    /// Lists the written file in its place of SAMPLES' order, unlists the file it replaces and
    /// gives that file's blocks back, then waits for the deletion of its folder in `tmp/`.
    ///
    /// # Safety
    ///
    /// The audio part has let go of the file it replaces or was never told about it: the applied
    /// report of the `ForgetSample` that `message` gave has come back.
    #[allow(unsafe_code)]
    pub unsafe fn list_written(&mut self, library: &mut Library, tables: &Tables) {
        library
            .add(self.file, self.target.as_str())
            .expect("the import checked the room for the file and its folders");
        let listed = library.file_mut(self.file);
        *listed = File {
            frames: self.converted,
            channels: self.format.channels,
            root: self.root,
            loop_points: self.loop_points,
            fingerprint: self.fingerprint,
            loaded: true,
            ..*listed
        };
        // The library holds the blocks now.
        self.holding = false;
        if let Some(old) = self.old {
            // The new file holds the old one's folders, so none is left empty.
            // SAFETY: the caller promises that the audio part let go of the old file.
            unsafe { library.remove(old, tables) };
            self.replaced = Some((old, self.file));
        }
        self.end(None, library, tables);
    }

    /// Waits for the `Append` of the run of consecutive blocks that holds byte `done` of the
    /// converted audio on.
    fn append(&mut self, done: u32, library: &Library, tables: &Tables) {
        let (from, length) = library.run(tables, self.file, done, self.bytes());
        self.stage = Some(Stage::Appending { done, from, length });
    }

    /// Ends the file: gives back the blocks it holds, counts it as imported or refused, replaces
    /// nothing any more and waits for the deletion of its folder in `tmp/`.
    #[allow(unsafe_code)]
    fn end(&mut self, refusal: Option<Refusal>, library: &mut Library, tables: &Tables) {
        self.old = None;
        if core::mem::take(&mut self.holding) {
            // SAFETY: the audio part was never told about the file.
            unsafe { library.free_blocks(self.file, tables) };
        }
        match refusal {
            None => self.imported += 1,
            Some(refusal) => self.reasons[refusal as usize] = true,
        }
        self.stage = Some(Stage::Deleting);
    }
}

impl Default for Import {
    fn default() -> Self {
        Self::new()
    }
}
