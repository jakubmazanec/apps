#![allow(unsafe_code)]

pub mod curve;
pub mod note;
pub mod tree;

use crate::budget;
use crate::message::{REPORT_QUEUE, VERSION_QUEUE};
use core::cell::UnsafeCell;

pub const BLOCK: usize = 512;
/// What each block costs: its 512 bytes and 8 of bookkeeping.
const BLOCK_COST: usize = BLOCK + 8;
pub const NOTE_BLOCKS: usize = budget::NOTE_RAM / BLOCK_COST;
pub const RESERVE: usize = 256;
pub type Block = u16;
/// The most versions whose waiting blocks wait at once: those in the version queue and those the
/// audio part took whose reports the control part has not read, which the report queue bounds.
const WAITING_VERSIONS: usize = VERSION_QUEUE + REPORT_QUEUE;

const _: () = assert!(
    size_of::<NoteRam>() <= budget::NOTE_RAM,
    "the note memory outgrew note_ram in budget.toml"
);

/// A tree's root, or none for an empty tree.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Tree(pub Option<Block>);

/// The note memory: a host keeps it beside the device, outside the working memory, and gives it to
/// both of the device's sides. The control side writes the blocks of trees no version it sent can
/// reach, and keeps the books of who holds each block and which blocks are free.
pub struct NoteRam {
    blocks: UnsafeCell<[[u8; BLOCK]; NOTE_BLOCKS]>,
    books: UnsafeCell<Books>,
}

// SAFETY: `Store` and `NoteReader` are the only ways to the blocks and the books, and the callers
// of `store` and `reader` promise that only the side that owns a block touches it.
unsafe impl Sync for NoteRam {}

impl NoteRam {
    #[expect(
        clippy::new_without_default,
        reason = "a note memory is too big to build anywhere but in a static or on the heap"
    )]
    pub const fn new() -> Self {
        Self {
            blocks: UnsafeCell::new([[0; BLOCK]; NOTE_BLOCKS]),
            books: UnsafeCell::new(Books {
                holders: [0; NOTE_BLOCKS],
                taken: [0; NOTE_BLOCKS.div_ceil(32)],
                waiting: [0; NOTE_BLOCKS],
                waiting_start: 0,
                waiting_len: 0,
                versions: [(0, 0); WAITING_VERSIONS],
                versions_start: 0,
                versions_len: 0,
            }),
        }
    }

    /// A note memory zeroed straight on the heap: one built on the stack would overflow it.
    #[cfg(any(test, feature = "harness"))]
    pub fn boxed() -> std::boxed::Box<Self> {
        // SAFETY: zeroed bytes are a note memory.
        unsafe { std::boxed::Box::new_zeroed().assume_init() }
    }

    /// The control side's handle.
    ///
    /// # Safety
    ///
    /// Only one store lives at a time, on the control side.
    pub unsafe fn store(&self) -> Store<'_> {
        Store {
            ram: self,
            // SAFETY: the caller promises that no other store lives.
            books: unsafe { &mut *self.books.get() },
        }
    }

    /// The audio side's handle.
    ///
    /// # Safety
    ///
    /// The reader reads only blocks of trees that a version gave the audio side, until the report
    /// that lets go of them reaches the control side.
    pub unsafe fn reader(&self) -> NoteReader<'_> {
        NoteReader { ram: self }
    }

    /// The block `b`, as a pointer: no reference to the whole array is ever made, so the audio
    /// side's reads of one block and the control side's writes of another never alias.
    ///
    /// # Panics
    ///
    /// When `b` is not a block of the note memory.
    fn block(&self, b: Block) -> *mut [u8; BLOCK] {
        assert!(
            usize::from(b) < NOTE_BLOCKS,
            "block {b} is not in the note memory"
        );
        self.blocks
            .get()
            .cast::<[u8; BLOCK]>()
            .wrapping_add(usize::from(b))
    }
}

/// The control side's books.
struct Books {
    /// How many trees and parent blocks hold each block.
    holders: [u16; NOTE_BLOCKS],
    /// A bit for each block, set while it is taken or waits.
    taken: [u32; NOTE_BLOCKS.div_ceil(32)],
    /// The blocks that wait for a version's report, oldest first, as a ring.
    waiting: [Block; NOTE_BLOCKS],
    waiting_start: usize,
    waiting_len: usize,
    /// The versions whose reports free the waiting blocks, oldest first, as a ring: a version's
    /// number and how many of the waiting blocks it let go of.
    versions: [(u32, u16); WAITING_VERSIONS],
    versions_start: usize,
    versions_len: usize,
}

impl Books {
    fn give_back(&mut self, block: Block) {
        self.taken[usize::from(block) / 32] &= !(1 << (block % 32));
    }
}

/// The control side's handle on the note memory.
pub struct Store<'a> {
    ram: &'a NoteRam,
    books: &'a mut Books,
}

impl Store<'_> {
    /// The lowest ready block, zeroed and held by nobody yet.
    ///
    /// # Panics
    ///
    /// When no block is ready: callers keep to the reserve.
    pub fn take(&mut self) -> Block {
        let block = self
            .books
            .taken
            .iter()
            .enumerate()
            .find_map(|(word, &bits)| {
                (bits != u32::MAX).then(|| word * 32 + bits.trailing_ones() as usize)
            })
            .filter(|&block| block < NOTE_BLOCKS)
            .expect("no block is ready") as Block;
        self.books.taken[usize::from(block) / 32] |= 1 << (block % 32);
        self.block_mut(block).fill(0);
        block
    }

    /// One more holder of the root of `tree`.
    pub fn hold(&mut self, tree: Tree) {
        if let Some(root) = tree.0 {
            self.books.holders[usize::from(root)] += 1;
        }
    }

    /// One holder fewer of the root of `tree`. A block that no one holds any more lets go of its
    /// children the same way. It is free at once with `after` none, or waits until `applied` hears
    /// the version `after` names: the audio part may still read it until then.
    ///
    /// # Panics
    ///
    /// When more versions wait than `VERSION_QUEUE + REPORT_QUEUE`.
    pub fn release(&mut self, tree: Tree, after: Option<u32>) {
        let Some(root) = tree.0 else { return };
        let holders = &mut self.books.holders[usize::from(root)];
        *holders -= 1;
        if *holders > 0 {
            return;
        }
        for child in self.children(root) {
            self.release(Tree(Some(child)), after);
        }
        let Some(number) = after else {
            self.books.give_back(root);
            return;
        };
        let books = &mut *self.books;
        books.waiting[(books.waiting_start + books.waiting_len) % NOTE_BLOCKS] = root;
        books.waiting_len += 1;
        let newest =
            (books.versions_start + books.versions_len + WAITING_VERSIONS - 1) % WAITING_VERSIONS;
        if books.versions_len > 0 && books.versions[newest].0 == number {
            books.versions[newest].1 += 1;
        } else {
            assert!(
                books.versions_len < WAITING_VERSIONS,
                "too many versions wait"
            );
            books.versions[(newest + 1) % WAITING_VERSIONS] = (number, 1);
            books.versions_len += 1;
        }
    }

    /// The audio part reported the version `number`: the blocks it let go of are free, when its
    /// group is the oldest that waits.
    pub fn applied(&mut self, number: u32) {
        let books = &mut *self.books;
        if books.versions_len == 0 || books.versions[books.versions_start].0 != number {
            return;
        }
        for _ in 0..books.versions[books.versions_start].1 {
            books.give_back(books.waiting[books.waiting_start]);
            books.waiting_start = (books.waiting_start + 1) % NOTE_BLOCKS;
            books.waiting_len -= 1;
        }
        books.versions_start = (books.versions_start + 1) % WAITING_VERSIONS;
        books.versions_len -= 1;
    }

    /// The blocks that are ready or wait, which decisions count as free.
    pub fn free(&self) -> usize {
        self.ready() + self.books.waiting_len
    }

    /// The blocks that `take` may give.
    pub fn ready(&self) -> usize {
        let taken: u32 = self.books.taken.iter().map(|word| word.count_ones()).sum();
        NOTE_BLOCKS - taken as usize
    }

    /// Whether blocks wait for a version's report.
    pub fn waiting(&self) -> bool {
        self.books.waiting_len > 0
    }

    /// The bytes that the blocks in use cost, bookkeeping included.
    pub fn used(&self) -> u64 {
        (NOTE_BLOCKS - self.free()) as u64 * BLOCK_COST as u64
    }

    pub(crate) fn block(&self, b: Block) -> &[u8; BLOCK] {
        // SAFETY: the audio side only reads blocks, and the control side writes none that it reads
        // here meanwhile.
        unsafe { &*self.ram.block(b) }
    }

    /// The caller writes only blocks that no version it sent can reach.
    pub(crate) fn block_mut(&mut self, b: Block) -> &mut [u8; BLOCK] {
        // SAFETY: no version reaches the block, so no one else reads or writes it.
        unsafe { &mut *self.ram.block(b) }
    }

    /// Gives back `b`, which nobody holds: a curve no note kept.
    ///
    /// # Panics
    ///
    /// When someone holds `b`.
    pub fn give_back(&mut self, b: Block) {
        assert_eq!(self.books.holders[usize::from(b)], 0, "block {b} is held");
        self.books.give_back(b);
    }

    /// The blocks that `b` holds. The children of an index block, in order: the last two bytes of
    /// each 12-byte entry that follows the 4 bytes of its head. The curve blocks of a leaf's notes,
    /// as it holds them the way an index holds its children (S16). A curve block holds none.
    pub(crate) fn children(&self, b: Block) -> impl Iterator<Item = Block> + use<> {
        let block = self.block(b);
        let count = usize::from(block[1]);
        let mut children = [None; (BLOCK - 4) / 12];
        match block[0] {
            0 => {
                for (child, bytes) in children.iter_mut().zip(&block[4..].as_chunks().0[..count]) {
                    *child = note::Note::from_bytes(bytes).curve;
                }
            }
            curve::CURVE => {}
            _ => {
                for (child, entry) in children
                    .iter_mut()
                    .zip(&block[4..].as_chunks::<12>().0[..count])
                {
                    *child = Some(Block::from_le_bytes([entry[10], entry[11]]));
                }
            }
        }
        children.into_iter().flatten()
    }
}

/// The audio side's handle on the note memory.
pub struct NoteReader<'a> {
    ram: &'a NoteRam,
}

impl NoteReader<'_> {
    pub fn block(&self, b: Block) -> &[u8; BLOCK] {
        // SAFETY: whoever made this reader promised that it reads only blocks of trees a version
        // gave it, which nothing writes meanwhile.
        unsafe { &*self.ram.block(b) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Makes `block` an index block of `children`, each held by it.
    fn index(store: &mut Store<'_>, block: Block, children: &[Block]) {
        let bytes = store.block_mut(block);
        bytes[0] = 1;
        bytes[1] = children.len() as u8;
        for (entry, child) in bytes[4..].as_chunks_mut::<12>().0.iter_mut().zip(children) {
            entry[10..].copy_from_slice(&child.to_le_bytes());
        }
        for &child in children {
            store.hold(Tree(Some(child)));
        }
    }

    #[test]
    fn note_memory_fits_its_budget() {
        assert_eq!(NOTE_BLOCKS, 15_384);
        assert!(core::mem::size_of::<NoteRam>() <= budget::NOTE_RAM);
    }

    #[test]
    fn blocks_are_taken_lowest_first() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store and the only reader.
        let (mut store, reader) = unsafe { (ram.store(), ram.reader()) };
        assert_eq!([store.take(), store.take(), store.take()], [0, 1, 2]);
        store.block_mut(1)[BLOCK - 1] = 7;
        assert_eq!(reader.block(1)[BLOCK - 1], 7);
        store.hold(Tree(Some(1)));

        store.release(Tree(Some(1)), None);

        assert_eq!(store.take(), 1);
        assert_eq!(store.block(1), &[0; BLOCK]);
    }

    #[test]
    fn a_released_tree_lets_go_of_its_children() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        (0..3).for_each(|_| _ = store.take());
        index(&mut store, 0, &[1, 2]);
        store.hold(Tree(Some(0)));
        assert_eq!(store.free(), NOTE_BLOCKS - 3);

        store.release(Tree(Some(0)), None);

        assert_eq!((store.free(), store.ready()), (NOTE_BLOCKS, NOTE_BLOCKS));
    }

    #[test]
    fn a_shared_block_is_freed_with_its_last_holder() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        (0..5).for_each(|_| _ = store.take());
        index(&mut store, 0, &[1, 2]);
        index(&mut store, 3, &[1, 4]);
        store.hold(Tree(Some(0)));
        store.hold(Tree(Some(3)));

        store.release(Tree(Some(0)), None);

        assert_eq!(store.free(), NOTE_BLOCKS - 3);
        assert_eq!([store.take(), store.take()], [0, 2]);
        store.release(Tree(Some(3)), None);
        assert_eq!(store.free(), NOTE_BLOCKS - 2);
        assert_eq!([store.take(), store.take(), store.take()], [1, 3, 4]);
    }

    #[test]
    fn waiting_blocks_stay_taken_until_their_version_is_reported() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        (0..3).for_each(|_| _ = store.take());
        index(&mut store, 0, &[1, 2]);
        store.hold(Tree(Some(0)));

        store.release(Tree(Some(0)), Some(7));

        assert_eq!(
            (store.free(), store.ready()),
            (NOTE_BLOCKS, NOTE_BLOCKS - 3)
        );
        assert!(store.waiting());
        store.applied(6);
        assert_eq!(
            (store.free(), store.ready()),
            (NOTE_BLOCKS, NOTE_BLOCKS - 3)
        );
        assert!(store.waiting());
        store.applied(7);
        assert_eq!((store.free(), store.ready()), (NOTE_BLOCKS, NOTE_BLOCKS));
        assert!(!store.waiting());
    }

    #[test]
    fn groups_free_in_their_order() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        (0..3).for_each(|_| _ = store.take());
        (0..3).for_each(|block| store.hold(Tree(Some(block))));

        // Version 5 let go of two trees, which wait together.
        store.release(Tree(Some(0)), Some(3));
        store.release(Tree(Some(2)), Some(5));
        store.release(Tree(Some(1)), Some(5));

        store.applied(5);
        assert_eq!(store.ready(), NOTE_BLOCKS - 3);
        store.applied(3);
        assert_eq!(store.ready(), NOTE_BLOCKS - 2);
        store.applied(5);
        assert_eq!(store.ready(), NOTE_BLOCKS);
    }

    #[test]
    fn the_rings_of_waiting_blocks_wrap_around() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };

        // More versions than blocks, each reported two versions late.
        for version in 0..2 * NOTE_BLOCKS as u32 {
            let block = store.take();
            store.hold(Tree(Some(block)));
            store.release(Tree(Some(block)), Some(version));
            if let Some(oldest) = version.checked_sub(2) {
                store.applied(oldest);
            }
        }

        assert_eq!(store.ready(), NOTE_BLOCKS - 2);
        store.applied(2 * NOTE_BLOCKS as u32 - 2);
        store.applied(2 * NOTE_BLOCKS as u32 - 1);
        assert_eq!(store.ready(), NOTE_BLOCKS);
    }

    #[test]
    fn used_counts_520_bytes_a_block() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        assert_eq!(store.used(), 0);

        store.take();
        store.take();

        assert_eq!(store.used(), 1_040);
    }

    #[test]
    fn a_leaf_holds_its_notes_curves() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let mut curve = curve::Curve::start(&mut store, 0, 40).unwrap();
        // Points whose bytes would name blocks if the curve were read as an index.
        for ticks in 1..10 {
            curve.point(&mut store, 60 * ticks, 40);
        }
        let c = curve.block();
        let note = note::Note {
            bar: 0,
            place: 0,
            length: 480,
            sound: crate::project::pool::SoundNumber(1),
            pitch: 60,
            velocity: 127,
            curve: Some(c),
        };
        assert_eq!(store.children(c).count(), 0);

        let (first, _) = store.insert(Tree(None), note);
        store.hold(first);
        assert_eq!(store.books.holders[usize::from(c)], 1);
        let (second, _) = store.insert(
            first,
            note::Note {
                pitch: 61,
                curve: None,
                ..note
            },
        );
        store.hold(second);
        assert_eq!(store.books.holders[usize::from(c)], 2);
        store.release(first, None);
        store.release(second, None);

        assert_eq!(store.ready(), NOTE_BLOCKS);
    }

    #[test]
    fn give_back_frees_a_block_nobody_holds() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let block = store.take();

        store.give_back(block);

        assert_eq!(store.ready(), NOTE_BLOCKS);
        assert_eq!(store.take(), block);
    }
}
