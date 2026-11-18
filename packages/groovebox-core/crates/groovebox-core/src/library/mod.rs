pub mod convert;
pub mod import;
pub mod name;
pub mod startup;
pub mod wav;

use crate::budget;
use crate::label::Label;
use crate::sample_ram::{BLOCK, BLOCKS, Blocks, Listing, SampleRam, Tables};
use crate::storage::Path;
use crate::ui::layout::PICTURE;
use core::cmp::Ordering;

/// A file's place in the library's table. It is reused only once the audio part let go of the
/// file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileId(pub u16);

/// A folder's place in the library's table of folders.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FolderId(pub u16);

/// A file of the library: its stored name, the folder it is in (none at the top level), its audio
/// as its converted file's head gives it and whether it is in the sample RAM.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct File {
    pub name: Label<64>,
    pub folder: Option<FolderId>,
    pub frames: u32,
    pub channels: u8,
    pub root: u8,
    /// The loop's first and last frame, both inclusive.
    pub loop_points: Option<(u32, u32)>,
    pub fingerprint: [u8; 16],
    pub loaded: bool,
}

impl File {
    /// The bytes of its audio, 16 bits a sample.
    pub fn bytes(&self) -> u32 {
        self.frames * u32::from(self.channels) * 2
    }
}

/// A folder of the library: its name and the folder it is in (none at the top level).
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Folder {
    pub name: Label<32>,
    pub parent: Option<FolderId>,
}

/// A row of SAMPLES.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
    Folder(FolderId),
    File(FileId),
}

/// The library as the control part keeps it: its files and folders, SAMPLES' order of them, the
/// sample RAM's blocks and the control side of the block tables.
pub struct Library {
    files: [Option<File>; budget::LIBRARY_FILES],
    folders: [Option<Folder>; budget::LIBRARY_FOLDERS],
    /// The first `listed` entries are every folder and file in SAMPLES' order, depth first: a
    /// folder comes right before what it holds.
    tree: [Entry; budget::LIBRARY_FILES + budget::LIBRARY_FOLDERS],
    listed: usize,
    blocks: Blocks,
    listing: Listing,
}

impl Library {
    pub const fn new() -> Self {
        Self {
            files: [None; budget::LIBRARY_FILES],
            folders: [None; budget::LIBRARY_FOLDERS],
            tree: [Entry::File(FileId(0)); budget::LIBRARY_FILES + budget::LIBRARY_FOLDERS],
            listed: 0,
            blocks: Blocks::new(),
            listing: Listing::new(),
        }
    }

    /// The folders and then the files in `folder`, or at the top level, each by name (answer 8).
    pub fn entries(&self, folder: Option<FolderId>) -> impl Iterator<Item = Entry> + '_ {
        self.tree[..self.listed]
            .iter()
            .copied()
            .filter(move |&entry| self.parent(entry) == folder)
    }

    pub fn file(&self, file: FileId) -> &File {
        self.files[usize::from(file.0)]
            .as_ref()
            .expect("the file is listed")
    }

    fn file_mut(&mut self, file: FileId) -> &mut File {
        self.files[usize::from(file.0)]
            .as_mut()
            .expect("the file is listed")
    }

    /// The folders that hold nothing but `file`, from its own folder up: those that `remove`
    /// unlists with it.
    pub fn emptied_by(&self, file: FileId) -> impl Iterator<Item = FolderId> + '_ {
        core::iter::successors(self.file(file).folder, |&folder| self.folder(folder).parent)
            .take_while(|&folder| self.entries(Some(folder)).nth(1).is_none())
    }

    /// Unlists `file` and the folders it leaves empty, and gives its blocks back when it is
    /// loaded.
    ///
    /// # Safety
    ///
    /// The audio part has let go of `file` or was never told about it (`Listing::forget`).
    #[allow(unsafe_code)]
    pub unsafe fn remove(&mut self, file: FileId, tables: &Tables) {
        let File {
            mut folder, loaded, ..
        } = *self.file(file);
        if loaded {
            // SAFETY: the caller promises that the audio part let go of the file or was never told
            // about it.
            unsafe { self.free_blocks(file, tables) };
        }
        self.unlist(Entry::File(file));
        self.files[usize::from(file.0)] = None;
        while let Some(empty) = folder.filter(|&folder| self.entries(Some(folder)).next().is_none())
        {
            folder = self.folder(empty).parent;
            self.unlist(Entry::Folder(empty));
            self.folders[usize::from(empty.0)] = None;
        }
    }

    /// Gives the blocks of `file` back, then unlists them: the listing gives them only while it
    /// lists the file.
    ///
    /// # Safety
    ///
    /// The audio part has let go of `file` or was never told about it (`Listing::forget`).
    #[allow(unsafe_code)]
    unsafe fn free_blocks(&mut self, file: FileId, tables: &Tables) {
        for block in self.listing.blocks(tables, file) {
            self.blocks.give_back(block);
        }
        // SAFETY: the caller promises that the audio part let go of the file or was never told
        // about it.
        unsafe { self.listing.forget(file) };
    }

    /// The waveform of `file` as the picture shows it (S19): for each of its columns the highest
    /// absolute sample, of both channels, among up to 64 frames spread evenly over the column's
    /// share of the file, or the frame under it when the share starts none. It reads them through a
    /// reader of the table the listing uses, as no one writes a loaded file's blocks.
    ///
    /// # Panics
    ///
    /// When `file` is not loaded.
    #[allow(unsafe_code)]
    pub fn peaks(
        &self,
        file: FileId,
        tables: &Tables,
        ram: &SampleRam,
    ) -> [u16; PICTURE.2 as usize] {
        let audio = self.file(file);
        assert!(audio.loaded, "file {} is not loaded", file.0);
        // SAFETY: the reader reads frames of a loaded file below its length, through the table the
        // listing uses.
        let readers = unsafe { tables.readers(ram) };
        let reader = &readers[usize::from(self.listing.table())];
        let slice = reader.slice(file);
        let (frames, columns) = (u64::from(audio.frames), PICTURE.2 as u64);
        core::array::from_fn(|column| {
            let from = column as u64 * frames / columns;
            let share = (column as u64 + 1) * frames / columns - from;
            // A loaded file has a frame at least, so `from` is one of its frames.
            let reads = share.clamp(1, 64);
            (0..reads)
                .map(|read| {
                    let frame = (from + read * share / reads) as u32;
                    let (left, right) = reader.frame(slice, audio.channels == 2, frame);
                    left.unsigned_abs().max(right.unsigned_abs())
                })
                .max()
                .expect("a column reads a frame at least")
        })
    }

    /// The bytes of the sample RAM that the files take: their blocks, whole.
    pub fn used(&self) -> u64 {
        ((BLOCKS - self.blocks.free()) * BLOCK) as u64
    }

    /// Where `file` is in the storage, such as "samples/drums/kick.wav".
    pub fn path(&self, file: FileId) -> Path {
        self.storage_path(Entry::File(file))
    }

    /// The first free place in the table of files; none when the library holds as many files as it
    /// can.
    fn free_file(&self) -> Option<FileId> {
        Some(FileId(self.files.iter().position(Option::is_none)? as u16))
    }

    /// Lists the file at `path` under `samples/` as `file`, whose place is free, not loaded, in its
    /// place of SAMPLES' order, and the folders it is in that are not listed yet. None when one of
    /// its folders finds the library full.
    fn add(&mut self, file: FileId, path: &str) -> Option<()> {
        let mut parts = path.split('/');
        let mut name = Label::new();
        name.push_str(parts.next_back().expect("a split gives at least one part"));
        let mut folder = None;
        for part in parts {
            let mut wanted = Folder {
                name: Label::new(),
                parent: folder,
            };
            wanted.name.push_str(part);
            folder = Some(
                match self
                    .folders
                    .iter()
                    .position(|listed| *listed == Some(wanted))
                {
                    Some(place) => FolderId(place as u16),
                    None => {
                        let made = FolderId(self.folders.iter().position(Option::is_none)? as u16);
                        self.folders[usize::from(made.0)] = Some(wanted);
                        self.insert(Entry::Folder(made));
                        made
                    }
                },
            );
        }
        self.files[usize::from(file.0)] = Some(File {
            name,
            folder,
            frames: 0,
            channels: 0,
            root: 0,
            loop_points: None,
            fingerprint: [0; 16],
            loaded: false,
        });
        self.insert(Entry::File(file));
        Some(())
    }

    /// The run of consecutive blocks of `file` that holds byte `done` of its `bytes` bytes of audio
    /// on: where it starts in the sample RAM and its bytes, which end with the audio at the latest.
    fn run(&self, tables: &Tables, file: FileId, done: u32, bytes: u32) -> (u32, u32) {
        let mut blocks = self
            .listing
            .blocks(tables, file)
            .skip(done as usize / BLOCK);
        let first = blocks
            .next()
            .expect("a file's blocks hold all of its audio");
        let run = 1 + blocks
            .zip(first + 1..)
            .take_while(|&(block, next)| block == next)
            .count();
        (
            first * BLOCK as u32,
            (run * BLOCK).min((bytes - done) as usize) as u32,
        )
    }

    /// Puts `entry` in its place of SAMPLES' order.
    fn insert(&mut self, entry: Entry) {
        let path = self.storage_path(entry);
        let place = self.tree[..self.listed].partition_point(|&other| {
            tree_order(self.storage_path(other).as_str(), path.as_str()).is_lt()
        });
        self.tree.copy_within(place..self.listed, place + 1);
        self.tree[place] = entry;
        self.listed += 1;
    }

    /// Takes `entry` out of SAMPLES' order.
    fn unlist(&mut self, entry: Entry) {
        let place = self.tree[..self.listed]
            .iter()
            .position(|&listed| listed == entry)
            .expect("the entry is listed");
        self.tree.copy_within(place + 1..self.listed, place);
        self.listed -= 1;
    }

    fn parent(&self, entry: Entry) -> Option<FolderId> {
        match entry {
            Entry::Folder(folder) => self.folder(folder).parent,
            Entry::File(file) => self.file(file).folder,
        }
    }

    pub fn folder(&self, folder: FolderId) -> &Folder {
        self.folders[usize::from(folder.0)]
            .as_ref()
            .expect("the folder is listed")
    }

    /// Where `entry` is in the storage, a folder's path ending in "/".
    pub fn storage_path(&self, entry: Entry) -> Path {
        let mut path = Path::new();
        match entry {
            Entry::Folder(folder) => self.write_folder(Some(folder), &mut path),
            Entry::File(file) => {
                let file = self.file(file);
                self.write_folder(file.folder, &mut path);
                path.push_str(file.name.as_str());
            }
        }
        path
    }

    /// Writes where `folder` is in the storage, ending in "/": `samples/` itself when none.
    fn write_folder(&self, folder: Option<FolderId>, path: &mut Path) {
        match folder {
            None => path.push_str("samples/"),
            Some(folder) => {
                let folder = self.folder(folder);
                self.write_folder(folder.parent, path);
                path.push_str(folder.name.as_str());
                path.push_str("/");
            }
        }
    }
}

impl Default for Library {
    fn default() -> Self {
        Self::new()
    }
}

/// SAMPLES' order of two paths, depth first, a folder's path ending in "/": inside a folder its
/// folders, each followed by what it holds, then its files, each by name (answer 8).
fn tree_order(a: &str, b: &str) -> Ordering {
    /// Whether each part of `path` is a file, and its name.
    fn parts(path: &str) -> impl Iterator<Item = (bool, &str)> {
        path.split_inclusive('/')
            .map(|part| match part.strip_suffix('/') {
                Some(folder) => (false, folder),
                None => (true, part),
            })
    }
    let (mut a, mut b) = (parts(a), parts(b));
    loop {
        match (a.next(), b.next()) {
            (Some((a_file, a_name)), Some((b_file, b_name))) => {
                let order = a_file
                    .cmp(&b_file)
                    .then_with(|| name::order(a_name, b_name));
                if order.is_ne() {
                    return order;
                }
            }
            // What a folder holds comes after it.
            (a, b) => return a.is_some().cmp(&b.is_some()),
        }
    }
}
