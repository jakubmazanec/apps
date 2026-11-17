#![allow(unsafe_code)]

use crate::budget;
use crate::library::FileId;
use core::cell::UnsafeCell;
use core::sync::atomic::{AtomicU32, Ordering};

pub const BLOCK: usize = 2_048;
pub const BLOCKS: usize = budget::SAMPLE_RAM / BLOCK;

const _: () = assert!(
    budget::SAMPLE_RAM.is_multiple_of(BLOCK),
    "the sample RAM in budget.toml is not a whole number of blocks"
);

/// The frames of 16-bit samples that a block holds of a file with `channels` channels. A frame is
/// never split between blocks.
const fn frames_per_block(channels: u32) -> u32 {
    BLOCK as u32 / 2 / channels
}

/// The blocks that `frames` frames of `channels` channels take.
pub fn blocks_for(frames: u32, channels: u8) -> usize {
    frames.div_ceil(frames_per_block(u32::from(channels))) as usize
}

/// The sample RAM: a host keeps it beside the device, outside the working memory, and gives it to
/// both of the device's sides. Its blocks hold the files' audio as little-endian 16-bit samples, a
/// stereo frame left then right.
pub struct SampleRam(UnsafeCell<[u8; budget::SAMPLE_RAM]>);

// SAFETY: `bytes` and the readers of `Tables::readers` are the only ways to its bytes, and the
// callers of both promise that only the side that owns a block touches it.
unsafe impl Sync for SampleRam {}

impl SampleRam {
    #[expect(
        clippy::new_without_default,
        reason = "a sample RAM is too big to build anywhere but in a static or on the heap"
    )]
    pub const fn new() -> Self {
        Self(UnsafeCell::new([0; budget::SAMPLE_RAM]))
    }

    /// A sample RAM zeroed straight on the heap: one built on the stack would overflow it.
    #[cfg(any(test, feature = "harness"))]
    pub fn boxed() -> std::boxed::Box<Self> {
        // SAFETY: zeroed bytes are a sample RAM.
        unsafe { std::boxed::Box::new_zeroed().assume_init() }
    }

    /// The `length` bytes from `offset`.
    ///
    /// # Safety
    ///
    /// Only the side that owns the blocks of these bytes may touch them, and no other reference to
    /// them may live meanwhile. The control side owns every block it took and has not yet told the
    /// audio side about; the audio side reads the blocks of each file it was told about until the
    /// control side hears that it let go of it.
    ///
    /// # Panics
    ///
    /// When the bytes reach past the sample RAM.
    #[expect(
        clippy::mut_from_ref,
        reason = "both sides share the sample RAM and each writes only its own blocks"
    )]
    pub unsafe fn bytes(&self, offset: u32, length: u32) -> &mut [u8] {
        // SAFETY: the span lies in the sample RAM, and the caller promises that nothing else
        // touches it meanwhile.
        unsafe { &mut *self.span(offset, length) }
    }

    /// The `length` bytes from `offset`.
    ///
    /// # Panics
    ///
    /// When the bytes reach past the sample RAM.
    fn span(&self, offset: u32, length: u32) -> *mut [u8] {
        assert!(
            offset
                .checked_add(length)
                .is_some_and(|end| end as usize <= budget::SAMPLE_RAM),
            "bytes {offset} to {offset} + {length} reach past the sample RAM"
        );
        let start = self.0.get().cast::<u8>().wrapping_add(offset as usize);
        core::ptr::slice_from_raw_parts_mut(start, length as usize)
    }
}

/// Which blocks are free. The control side keeps it.
pub struct Blocks {
    /// A bit for each block, set while it is taken.
    taken: [u32; BLOCKS.div_ceil(32)],
}

impl Blocks {
    pub const fn new() -> Self {
        Self {
            taken: [0; BLOCKS.div_ceil(32)],
        }
    }

    pub fn free(&self) -> usize {
        let taken: u32 = self.taken.iter().map(|word| word.count_ones()).sum();
        BLOCKS - taken as usize
    }

    /// The lowest `count` free blocks, each taken as the iterator gives it, or `None` when fewer
    /// are free: the sample RAM has no room for them.
    pub fn take(&mut self, count: usize) -> Option<impl ExactSizeIterator<Item = u32>> {
        let mut block = 0;
        (self.free() >= count).then(move || {
            (0..count).map(move |_| {
                while self.taken[block / 32] & 1 << (block % 32) != 0 {
                    block += 1;
                }
                self.taken[block / 32] |= 1 << (block % 32);
                block += 1;
                block as u32 - 1
            })
        })
    }

    pub fn give_back(&mut self, block: u32) {
        self.taken[block as usize / 32] &= !(1 << (block % 32));
    }
}

impl Default for Blocks {
    fn default() -> Self {
        Self::new()
    }
}

/// A block table: the blocks of every file the audio part may read, each file's blocks in a row
/// (its slice), and where each file's slice starts.
struct Table {
    entries: [AtomicU32; BLOCKS],
    directory: [AtomicU32; budget::LIBRARY_FILES],
}

impl Table {
    const fn new() -> Self {
        Self {
            entries: [const { AtomicU32::new(0) }; BLOCKS],
            directory: [const { AtomicU32::new(0) }; budget::LIBRARY_FILES],
        }
    }

    fn slice(&self, file: usize) -> u32 {
        self.directory[file].load(Ordering::Relaxed)
    }

    /// Lists `blocks` from entry `at` as the slice of `file`.
    fn list(&self, file: usize, at: u32, blocks: impl Iterator<Item = u32>) {
        for (entry, block) in blocks.enumerate() {
            self.entries[at as usize + entry].store(block, Ordering::Relaxed);
        }
        self.directory[file].store(at, Ordering::Relaxed);
    }
}

/// The two block tables, kept in `Device`. The control side writes them through its `Listing` and
/// the audio side reads the one it uses through a `Reader`. They are atomics, so either side may
/// touch any entry; the listing writes only entries that the audio part does not read, so that
/// what it reads stays put.
pub struct Tables([Table; 2]);

impl Tables {
    pub const fn new() -> Self {
        Self([Table::new(), Table::new()])
    }

    /// A reader of each table.
    ///
    /// # Safety
    ///
    /// The readers may read only the frames of files that the control side told the audio side
    /// about and has not yet heard it let go of, each within its file's length: only those
    /// blocks are the audio side's (see `SampleRam::bytes`).
    pub unsafe fn readers<'a>(&'a self, ram: &'a SampleRam) -> [Reader<'a>; 2] {
        self.0.each_ref().map(|table| Reader { table, ram })
    }
}

impl Default for Tables {
    fn default() -> Self {
        Self::new()
    }
}

/// What `Listing::add` did with a file's blocks.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Listed {
    /// It listed them after the last slice of the table the audio part reads.
    Appended,
    /// It wrote every other file's slice, packed, and then this one into the other table, where
    /// the slices differ from those of the table the audio part reads. So the caller sends
    /// `UseTable { version }` at once, before any other message, as only the table it names lists
    /// this file. It calls `applied` once that message's applied report has come back.
    Packed { version: u8 },
}

/// The control side of the tables: each listed file's length in blocks, and which table the audio
/// part reads.
pub struct Listing {
    /// Each file's blocks by `FileId`, 0 when it is not listed.
    lengths: [u32; budget::LIBRARY_FILES],
    /// The table that the latest `UseTable` named, which every message sent from now on reads.
    table: u8,
    /// Whether that `UseTable` has yet to apply, so that the audio part may read either table.
    switching: bool,
}

impl Listing {
    pub const fn new() -> Self {
        Self {
            lengths: [0; budget::LIBRARY_FILES],
            table: 0,
            switching: false,
        }
    }

    /// Lists `blocks` as the slice of `file`, which must not be listed: the audio part may still
    /// read a listed file's slice. After `Listed::Appended` a message may name `file` at once;
    /// `Listed::Packed` says what comes first.
    ///
    /// It gives `None`, writing nothing and taking no block, while the audio part may read either
    /// table: the caller tries again after `applied`. Room is not its to refuse: blocks from
    /// `Blocks` always fit once packed, and `Blocks::take` gives `None` when too few are free.
    ///
    /// # Panics
    ///
    /// When `file` is listed.
    pub fn add(
        &mut self,
        tables: &Tables,
        file: FileId,
        blocks: impl ExactSizeIterator<Item = u32>,
    ) -> Option<Listed> {
        assert_eq!(
            self.lengths[usize::from(file.0)],
            0,
            "file {} is listed",
            file.0
        );
        if self.switching {
            return None;
        }
        let table = &tables.0[usize::from(self.table)];
        // The place, first entry and length of every listed file's slice in `table`.
        let slices = || {
            self.lengths
                .iter()
                .enumerate()
                .filter(|&(_, &length)| length > 0)
                .map(|(place, &length)| (place, table.slice(place), length))
        };
        let end = slices()
            .map(|(_, start, length)| start + length)
            .max()
            .unwrap_or(0);
        let count = blocks.len() as u32;
        let listed = if end + count <= BLOCKS as u32 {
            table.list(usize::from(file.0), end, blocks);
            Listed::Appended
        } else {
            let other = &tables.0[usize::from(1 - self.table)];
            let mut at = 0;
            for (place, start, length) in slices() {
                let entries = &table.entries[start as usize..][..length as usize];
                other.list(
                    place,
                    at,
                    entries.iter().map(|entry| entry.load(Ordering::Relaxed)),
                );
                at += length;
            }
            other.list(usize::from(file.0), at, blocks);
            self.table = 1 - self.table;
            self.switching = true;
            Listed::Packed {
                version: self.table,
            }
        };
        self.lengths[usize::from(file.0)] = count;
        Some(listed)
    }

    /// Unlists `file`, whose blocks go back to `Blocks` at the same time: its entries may then be
    /// written again.
    ///
    /// # Safety
    ///
    /// The audio part has let go of `file`, as the applied report of the message that told it to
    /// has come back, or it was never told about `file`: either way it reads none of the file's
    /// entries and blocks.
    pub unsafe fn forget(&mut self, file: FileId) {
        self.lengths[usize::from(file.0)] = 0;
    }

    /// Lets `add` write the tables again after a `Listed::Packed`.
    ///
    /// # Safety
    ///
    /// The applied report of the `UseTable` that the latest `Listed::Packed` asked for has come
    /// back: the audio part reads only the table it named, so the other may be written again.
    pub unsafe fn applied(&mut self) {
        self.switching = false;
    }

    /// Where the slice of `file` starts in the table that every message sent from now on reads,
    /// once the `UseTable` that a `Listed::Packed` asks for has been sent.
    pub fn slice(&self, tables: &Tables, file: FileId) -> u32 {
        tables.0[usize::from(self.table)].slice(usize::from(file.0))
    }

    /// The blocks of `file`, in the order of its slice, as the table that `slice` reads lists them.
    pub fn blocks<'a>(&self, tables: &'a Tables, file: FileId) -> impl Iterator<Item = u32> + 'a {
        let entries =
            &tables.0[usize::from(self.table)].entries[self.slice(tables, file) as usize..];
        entries[..self.lengths[usize::from(file.0)] as usize]
            .iter()
            .map(|entry| entry.load(Ordering::Relaxed))
    }
}

impl Default for Listing {
    fn default() -> Self {
        Self::new()
    }
}

/// The audio side's view of one block table and the sample RAM.
pub struct Reader<'a> {
    table: &'a Table,
    ram: &'a SampleRam,
}

impl Reader<'_> {
    /// Where the slice of `file` starts in this table.
    pub fn slice(&self, file: FileId) -> u32 {
        self.table.slice(usize::from(file.0))
    }

    /// The left and right samples of `frame` of the file whose slice starts at `slice`; a mono
    /// file gives its sample twice. `Tables::readers` says which frames it may read.
    pub fn frame(&self, slice: u32, stereo: bool, frame: u32) -> (i16, i16) {
        let channels = 1 + u32::from(stereo);
        let per_block = frames_per_block(channels);
        let block =
            self.table.entries[(slice + frame / per_block) as usize].load(Ordering::Relaxed);
        let offset = block * BLOCK as u32 + frame % per_block * 2 * channels;
        // SAFETY: whoever made this reader promised that it reads only the audio side's blocks,
        // which nothing writes meanwhile; a shared slice may overlap another reader's.
        let bytes = unsafe { &*self.ram.span(offset, 2 * channels) };
        let sample = |at: usize| i16::from_le_bytes([bytes[at], bytes[at + 1]]);
        (sample(0), sample(bytes.len() - 2))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::boxed::Box;
    use std::vec::Vec;

    #[test]
    fn a_file_takes_whole_blocks() {
        assert_eq!(blocks_for(1, 1), 1);
        assert_eq!(blocks_for(1_024, 1), 1);
        assert_eq!(blocks_for(1_025, 1), 2);
        assert_eq!(blocks_for(512, 2), 1);
        assert_eq!(blocks_for(513, 2), 2);
    }

    fn taken(blocks: &mut Blocks, count: usize) -> Option<Vec<u32>> {
        blocks.take(count).map(Iterator::collect)
    }

    #[test]
    fn blocks_are_taken_lowest_first_and_given_back() {
        let mut blocks = Blocks::new();
        assert_eq!(blocks.free(), BLOCKS);

        assert_eq!(taken(&mut blocks, 3), Some(std::vec![0, 1, 2]));
        blocks.give_back(1);
        assert_eq!(blocks.free(), BLOCKS - 2);
        assert_eq!(taken(&mut blocks, 2), Some(std::vec![1, 3]));

        assert_eq!(taken(&mut blocks, BLOCKS - 3), None);
        assert_eq!(blocks.free(), BLOCKS - 4);
        let rest = taken(&mut blocks, BLOCKS - 4).expect("the rest is free");
        assert!(rest.into_iter().eq(4..BLOCKS as u32));
        assert_eq!(blocks.free(), 0);
        blocks.give_back(BLOCKS as u32 - 1);
        assert_eq!(taken(&mut blocks, 1), Some(std::vec![BLOCKS as u32 - 1]));
    }

    /// The sample of `channel` at `frame` of `file`, different for every one of them.
    fn sample(file: u16, frame: u32, channel: u32) -> i16 {
        (u32::from(file) * 10_000 + frame * 2 + channel) as i16
    }

    /// Writes `frames` frames of `file` into `blocks`: each block holds 2,048 bytes of
    /// little-endian samples, a stereo frame left then right.
    fn write(ram: &SampleRam, file: u16, blocks: &[u32], stereo: bool, frames: u32) {
        let channels = 1 + u32::from(stereo);
        let per_block = 1_024 / channels;
        for frame in 0..frames {
            for channel in 0..channels {
                let at = blocks[(frame / per_block) as usize] * 2_048
                    + (frame % per_block * channels + channel) * 2;
                // SAFETY: the test is the only side of its sample RAM.
                unsafe { ram.bytes(at, 2) }
                    .copy_from_slice(&sample(file, frame, channel).to_le_bytes());
            }
        }
    }

    #[test]
    fn a_reader_finds_every_frame_across_scattered_blocks() {
        for (stereo, frames) in [(false, 2_500), (true, 1_200)] {
            let (tables, ram) = (Box::new(Tables::new()), SampleRam::boxed());
            let mut listing = Listing::new();
            write(&ram, 7, &[5, 2, 9], stereo, frames);

            let listed = listing.add(&tables, FileId(7), [5, 2, 9].into_iter());

            assert_eq!(listed, Some(Listed::Appended));
            // SAFETY: the readers read only the file the test listed.
            let [reader, _] = unsafe { tables.readers(&ram) };
            let slice = reader.slice(FileId(7));
            for frame in 0..frames {
                let (left, right) = (0, u32::from(stereo));
                assert_eq!(
                    reader.frame(slice, stereo, frame),
                    (sample(7, frame, left), sample(7, frame, right))
                );
            }
        }
    }

    #[test]
    #[should_panic(expected = "file 3 is listed")]
    fn a_listed_file_is_not_listed_again() {
        let (tables, mut listing) = (Box::new(Tables::new()), Listing::new());
        assert_eq!(
            listing.add(&tables, FileId(3), [0].into_iter()),
            Some(Listed::Appended)
        );

        listing.add(&tables, FileId(3), [1].into_iter());
    }

    fn add(
        listing: &mut Listing,
        tables: &Tables,
        blocks: &mut Blocks,
        file: u16,
        count: usize,
    ) -> Option<Listed> {
        let taken = blocks.take(count).expect("enough blocks are free");
        listing.add(tables, FileId(file), taken)
    }

    /// The first and the last frame of each of the `blocks` blocks of the mono `file`.
    fn block_ends(reader: &Reader<'_>, file: u16, blocks: u32) -> Vec<(i16, i16)> {
        let slice = reader.slice(FileId(file));
        (0..blocks)
            .flat_map(|block| [block * 1_024, block * 1_024 + 1_023])
            .map(|frame| reader.frame(slice, false, frame))
            .collect()
    }

    #[test]
    fn a_full_table_packs_into_the_other_one() {
        let (tables, ram) = (Box::new(Tables::new()), SampleRam::boxed());
        let (mut listing, mut blocks) = (Listing::new(), Blocks::new());
        // Each block's first and last sample hold its number.
        for block in 0..BLOCKS as u32 {
            for at in [0, 2_046] {
                // SAFETY: the test is the only side of its sample RAM.
                unsafe { ram.bytes(block * 2_048 + at, 2) }
                    .copy_from_slice(&(block as i16).to_le_bytes());
            }
        }
        for (file, count) in [(0, 20_000), (1, 100), (2, 11_000)] {
            let listed = add(&mut listing, &tables, &mut blocks, file, count);
            assert_eq!(listed, Some(Listed::Appended));
        }
        // The audio part let go of file 1.
        // SAFETY: the test plays the audio part, which reads nothing.
        unsafe { listing.forget(FileId(1)) };
        (20_000..20_100).for_each(|block| blocks.give_back(block));
        // SAFETY: the readers read only the files the test listed.
        let [old, new] = unsafe { tables.readers(&ram) };
        let before = [block_ends(&old, 0, 20_000), block_ends(&old, 2, 11_000)];

        // 31,100 entries are in use, so 200 more do not fit after them.
        let listed = add(&mut listing, &tables, &mut blocks, 3, 200);

        assert_eq!(listed, Some(Listed::Packed { version: 1 }));
        assert_eq!(
            [0, 2, 3].map(|file| new.slice(FileId(file))),
            [0, 20_000, 31_000]
        );
        assert_eq!(listing.slice(&tables, FileId(3)), 31_000);
        assert!(
            listing
                .blocks(&tables, FileId(3))
                .eq((20_000..20_100).chain(31_100..31_200))
        );
        let after = [block_ends(&new, 0, 20_000), block_ends(&new, 2, 11_000)];
        assert_eq!(after, before);
        // File 3 got the blocks file 1 gave back and the next 100.
        let numbers = (20_000..20_100).chain(31_100..31_200);
        let ends: Vec<_> = numbers
            .flat_map(|block| [(block as i16, block as i16); 2])
            .collect();
        assert_eq!(block_ends(&new, 3, 200), ends);
        // The table the audio part reads until the switch is as it was.
        assert_eq!([0, 2].map(|file| old.slice(FileId(file))), [0, 20_100]);
        assert_eq!(
            [block_ends(&old, 0, 20_000), block_ends(&old, 2, 11_000)],
            before
        );

        // Neither table is written, nor a block taken, until the `UseTable` applied.
        assert_eq!(add(&mut listing, &tables, &mut blocks, 4, 50), None);
        assert_eq!(blocks.free(), 50);
        // SAFETY: the test plays the audio part, which now reads only table 1.
        unsafe { listing.applied() };
        let listed = add(&mut listing, &tables, &mut blocks, 4, 50);
        assert_eq!(listed, Some(Listed::Appended));
        assert_eq!(new.slice(FileId(4)), 31_200);
    }
}
