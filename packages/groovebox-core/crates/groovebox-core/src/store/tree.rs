use super::note::{Key, Note};
use super::{BLOCK, Block, NoteReader, Store, Tree};
use crate::project::pool::SoundNumber;

/// The levels a cursor has room for: a tree of 6 would take 2 × 11⁴ leaves, more than the note
/// memory holds.
const DEPTH: usize = 6;

/// A place in a tree: the block and the entry at each level from the root to a note in a leaf. A
/// cursor past the last note is 0 deep.
#[derive(Clone, Copy, Debug)]
pub struct Cursor {
    path: [(Block, u8); DEPTH],
    depth: u8,
}

impl NoteReader<'_> {
    /// At the first note whose key is `from` or later.
    pub fn seek(&self, tree: Tree, from: Key) -> Cursor {
        let mut cursor = Cursor {
            path: [(0, 0); DEPTH],
            depth: 0,
        };
        let mut next = tree.0;
        while let Some(b) = next {
            let block = self.block(b);
            let at = find(block, from);
            cursor.path[usize::from(cursor.depth)] = (b, at as u8);
            cursor.depth += 1;
            next = (block[0] > 0).then(|| child_at(block, at));
        }
        self.settle(&mut cursor);
        cursor
    }

    /// The note at `cursor`: none past the last note.
    pub fn peek(&self, cursor: &Cursor) -> Option<Note> {
        let &(leaf, at) = cursor.path[..usize::from(cursor.depth)].last()?;
        Some(note_at(self.block(leaf), usize::from(at)))
    }

    /// On to the next note.
    pub fn advance(&self, cursor: &mut Cursor) {
        if let Some((_, at)) = cursor.path[..usize::from(cursor.depth)].last_mut() {
            *at += 1;
        }
        self.settle(cursor);
    }

    /// The notes from the first whose key is `from` or later, in key order.
    pub fn notes(&self, tree: Tree, from: Key) -> impl Iterator<Item = Note> + '_ {
        let mut cursor = self.seek(tree, from);
        core::iter::from_fn(move || {
            let note = self.peek(&cursor)?;
            self.advance(&mut cursor);
            Some(note)
        })
    }

    /// Moves a cursor past the end of its leaf to the first note after it, or past the last note.
    fn settle(&self, cursor: &mut Cursor) {
        let depth = usize::from(cursor.depth);
        let mut level = depth;
        while level > 0 {
            let (b, at) = cursor.path[level - 1];
            if usize::from(at) < count(self.block(b)) {
                break;
            }
            level -= 1;
            if level > 0 {
                cursor.path[level - 1].1 += 1;
            }
        }
        if level == 0 {
            cursor.depth = 0;
            return;
        }
        for i in level..depth {
            let (parent, at) = cursor.path[i - 1];
            cursor.path[i] = (child_at(self.block(parent), usize::from(at)), 0);
        }
    }
}

impl Store<'_> {
    /// A new tree with `note`, replacing and giving back a note of the same key; `tree` stays as
    /// it was.
    pub fn insert(&mut self, tree: Tree, note: Note) -> (Tree, Option<Note>) {
        let Some(root) = tree.0 else {
            return (Tree(Some(self.write(0, &note.to_bytes()))), None);
        };
        let ((left, right), old) = self.insert_in(root, note);
        let root = match right {
            None => left,
            Some(right) => self.write(
                self.block(left)[0] + 1,
                [self.entry(left), self.entry(right)].as_flattened(),
            ),
        };
        self.hold_new(root);
        (Tree(Some(root)), old)
    }

    /// A new tree without the notes in `from..to` that `take` takes, each copied leaf touched
    /// once; `tree` itself when it takes none.
    pub fn remove(
        &mut self,
        tree: Tree,
        from: Key,
        to: Key,
        mut take: impl FnMut(&Note) -> bool,
    ) -> Tree {
        let Some(root) = tree.0 else { return tree };
        let mut root = match self.remove_in(root, from, to, &mut take) {
            None => return tree,
            Some(Tree(None)) => return Tree(None),
            Some(Tree(Some(root))) => root,
        };
        // A root index of one child gives way to it.
        while self.block(root)[0] > 0 && count(self.block(root)) == 1 {
            let child = child_at(self.block(root), 0);
            self.books.give_back(root);
            root = child;
        }
        self.hold_new(root);
        Tree(Some(root))
    }

    /// A reader for the control side, which may read every block.
    pub fn reader(&self) -> NoteReader<'_> {
        NoteReader { ram: self.ram }
    }

    /// The blocks that take the place of `b` once `note` is in its subtree, and the note it
    /// replaces.
    fn insert_in(&mut self, b: Block, note: Note) -> ((Block, Option<Block>), Option<Note>) {
        let mut work = [0; 2 * BLOCK];
        work[..BLOCK].copy_from_slice(self.block(b));
        let at = find(&work, note.key());
        let old = if work[0] == 0 {
            let old =
                (at < count(&work) && key_at(&work, at) == note.key()).then(|| note_at(&work, at));
            splice(&mut work, at, usize::from(old.is_some()), &note.to_bytes());
            old
        } else {
            let (blocks, old) = self.insert_in(child_at(&work, at), note);
            self.put(&mut work, at, 1, blocks);
            old
        };
        (self.split(&work), old)
    }

    /// The subtree of `b` without the notes in `from..to` that `take` takes, under a block that
    /// may hold less than a quarter: none when it loses no note.
    fn remove_in(
        &mut self,
        b: Block,
        from: Key,
        to: Key,
        take: &mut impl FnMut(&Note) -> bool,
    ) -> Option<Tree> {
        let block = *self.block(b);
        let mut work = [0; 2 * BLOCK];
        work[0] = block[0];
        let mut lost = false;
        for i in 0..count(&block) {
            if block[0] == 0 {
                let note = note_at(&block, i);
                if (from..to).contains(&note.key()) && take(&note) {
                    lost = true;
                } else {
                    let n = count(&work);
                    splice(&mut work, n, 0, &note.to_bytes());
                }
                continue;
            }
            let child = child_at(&block, i);
            let reached =
                key_at(&block, i) < to && (i + 1 == count(&block) || key_at(&block, i + 1) > from);
            let kept = match reached
                .then(|| self.remove_in(child, from, to, take))
                .flatten()
            {
                None => child,
                Some(Tree(None)) => {
                    lost = true;
                    continue;
                }
                Some(Tree(Some(kept))) => {
                    lost = true;
                    kept
                }
            };
            // A block under a quarter joins its neighbour.
            let n = count(&work);
            match (n > 0).then(|| child_at(&work, n - 1)) {
                Some(last) if short(self.block(last)) || short(self.block(kept)) => {
                    let joined = self.join(last, kept);
                    self.put(&mut work, n - 1, 1, joined);
                }
                _ => self.put(&mut work, n, 0, (kept, None)),
            }
        }
        lost.then(|| Tree((count(&work) > 0).then(|| self.split(&work).0)))
    }

    /// Two neighbouring blocks of one level in one block, or in two halves when they do not fit
    /// in one. A child under a quarter at their seam first joins the child across it.
    fn join(&mut self, a: Block, b: Block) -> (Block, Option<Block>) {
        let (left, right) = (*self.block(a), *self.block(b));
        let level = left[0];
        let mut work = [0; 2 * BLOCK];
        work[..BLOCK].copy_from_slice(&left);
        splice(
            &mut work,
            count(&left),
            0,
            &right[4..][..count(&right) * size(level)],
        );
        if level > 0 {
            let (c, d) = (child_at(&left, count(&left) - 1), child_at(&right, 0));
            if short(self.block(c)) || short(self.block(d)) {
                let joined = self.join(c, d);
                self.put(&mut work, count(&left) - 1, 2, joined);
            }
        }
        // Blocks this edit wrote are held by no one: no version saw them.
        for x in [a, b] {
            if self.books.holders[usize::from(x)] == 0 {
                self.books.give_back(x);
            }
        }
        self.split(&work)
    }

    /// Holds the children of every block of `b`'s tree that no one holds yet: the blocks this
    /// edit wrote.
    fn hold_new(&mut self, b: Block) {
        if self.books.holders[usize::from(b)] > 0 {
            return;
        }
        for child in self.children(b) {
            self.hold_new(child);
            self.hold(Tree(Some(child)));
        }
    }

    /// The entries of `blocks` in place of the entries `at..at + gone` of an index's working
    /// block.
    fn put(&self, work: &mut [u8], at: usize, gone: usize, (a, b): (Block, Option<Block>)) {
        splice(work, at, gone, &self.entry(a));
        if let Some(b) = b {
            splice(work, at + 1, 0, &self.entry(b));
        }
    }

    /// The entry that points a parent at `b`: the first key of its subtree, a spare byte and `b`.
    fn entry(&self, b: Block) -> [u8; 12] {
        let key = key_at(self.block(b), 0);
        let mut entry = [0; 12];
        entry[..2].copy_from_slice(&key.bar.to_le_bytes());
        entry[2..4].copy_from_slice(&key.place.to_le_bytes());
        entry[4..8].copy_from_slice(&key.sound.0.to_le_bytes());
        entry[8] = key.pitch;
        entry[10..].copy_from_slice(&b.to_le_bytes());
        entry
    }

    /// The entries of a working block in one new block, or in two halves when they do not fit in
    /// one.
    fn split(&mut self, work: &[u8]) -> (Block, Option<Block>) {
        let (level, n) = (work[0], count(work));
        let entries = &work[4..][..n * size(level)];
        if n <= capacity(level) {
            return (self.write(level, entries), None);
        }
        let (left, right) = entries.split_at(n / 2 * size(level));
        (self.write(level, left), Some(self.write(level, right)))
    }

    /// A new block at `level` of `entries`.
    fn write(&mut self, level: u8, entries: &[u8]) -> Block {
        let b = self.take();
        let block = self.block_mut(b);
        block[0] = level;
        block[1] = (entries.len() / size(level)) as u8;
        block[4..][..entries.len()].copy_from_slice(entries);
        b
    }
}

// A block, or a working block of up to twice as many entries: byte 0 its level, byte 1 its count
// and its entries from byte 4.

fn count(block: &[u8]) -> usize {
    usize::from(block[1])
}

/// The bytes of an entry at `level`: a note in a leaf, a child in an index.
fn size(level: u8) -> usize {
    if level == 0 { 16 } else { 12 }
}

/// The entries a block at `level` holds: 31 notes in a leaf, 42 children in an index.
fn capacity(level: u8) -> usize {
    (BLOCK - 4) / size(level)
}

/// Whether a block holds less than a quarter, which only a root may.
fn short(block: &[u8]) -> bool {
    count(block) < capacity(block[0]).div_ceil(4)
}

fn note_at(block: &[u8], i: usize) -> Note {
    Note::from_bytes(&block[4..].as_chunks().0[i])
}

fn child_at(block: &[u8], i: usize) -> Block {
    let entry = block[4..].as_chunks::<12>().0[i];
    Block::from_le_bytes([entry[10], entry[11]])
}

/// The key of a leaf's note `i`, or the first key of the subtree of an index's child `i`.
fn key_at(block: &[u8], i: usize) -> Key {
    if block[0] == 0 {
        return note_at(block, i).key();
    }
    let entry = block[4..].as_chunks::<12>().0[i];
    Key {
        bar: u16::from_le_bytes([entry[0], entry[1]]),
        place: u16::from_le_bytes([entry[2], entry[3]]),
        sound: SoundNumber(u32::from_le_bytes([entry[4], entry[5], entry[6], entry[7]])),
        pitch: entry[8],
    }
}

/// Where `key` goes in a block: in a leaf the first note at or after it, in an index the last
/// child whose subtree starts at or before it, or the first.
fn find(block: &[u8], key: Key) -> usize {
    if block[0] == 0 {
        (0..count(block))
            .take_while(|&i| key_at(block, i) < key)
            .count()
    } else {
        (1..count(block))
            .take_while(|&i| key_at(block, i) <= key)
            .count()
    }
}

/// Puts `new` entries in place of the entries `at..at + gone` of a working block.
fn splice(work: &mut [u8], at: usize, gone: usize, new: &[u8]) {
    let (size, n) = (size(work[0]), count(work));
    work.copy_within(
        4 + (at + gone) * size..4 + n * size,
        4 + at * size + new.len(),
    );
    work[4 + at * size..][..new.len()].copy_from_slice(new);
    work[1] = (n - gone + new.len() / size) as u8;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{NOTE_BLOCKS, NoteRam};
    use std::vec::Vec;

    /// xorshift64, seeded.
    struct Random(u64);

    impl Random {
        fn below(&mut self, n: u32) -> u32 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 % u64::from(n)) as u32
        }
    }

    fn note(bar: u16, place: u16, sound: u32, pitch: u8) -> Note {
        Note {
            bar,
            place,
            length: 480,
            sound: SoundNumber(sound),
            pitch,
            velocity: 127,
            curve: None,
        }
    }

    fn notes(store: &Store<'_>, tree: Tree) -> Vec<Note> {
        store.reader().notes(tree, Key::at(0, 0)).collect()
    }

    /// Holds `next` in place of `tree`.
    fn keep(store: &mut Store<'_>, tree: &mut Tree, next: Tree) {
        store.hold(next);
        store.release(*tree, None);
        *tree = next;
    }

    /// A held tree of `notes`, each inserted into the tree of the ones before.
    fn build(store: &mut Store<'_>, notes: impl IntoIterator<Item = Note>) -> Tree {
        let mut tree = Tree(None);
        for note in notes {
            let (next, _) = store.insert(tree, note);
            keep(store, &mut tree, next);
        }
        tree
    }

    /// Checks the held trees and the books: every taken block is reachable from a held root, and
    /// the holders of each block are its parents plus its holds.
    fn check(store: &Store<'_>, held: &[Tree]) {
        let mut holders = std::vec![0; NOTE_BLOCKS];
        let mut taken = std::vec![0; NOTE_BLOCKS.div_ceil(32)];
        let mut blocks: Vec<Block> = held.iter().filter_map(|tree| tree.0).collect();
        for &root in &blocks {
            walk(store, root, true);
            holders[usize::from(root)] += 1;
        }
        while let Some(b) = blocks.pop() {
            let (word, bit) = (usize::from(b) / 32, 1 << (b % 32));
            if taken[word] & bit == 0 {
                taken[word] |= bit;
                for child in store.children(b) {
                    holders[usize::from(child)] += 1;
                    blocks.push(child);
                }
            }
        }
        assert_eq!(store.books.holders[..], holders[..]);
        assert_eq!(store.books.taken[..], taken[..]);
    }

    /// Checks the tree under `b` and gives its first and last keys: the keys in order, each entry
    /// with its child's first key, the levels one apart down to the leaves at 0 and every block
    /// but the root at least a quarter full.
    fn walk(store: &Store<'_>, b: Block, root: bool) -> (Key, Key) {
        let block = store.block(b);
        let (level, count) = (block[0], usize::from(block[1]));
        let (most, least) = if level == 0 { (31, 8) } else { (42, 11) };
        let fewest = match (root, level) {
            (false, _) => least,
            (true, 0) => 1,
            (true, _) => 2,
        };
        assert!(
            (fewest..=most).contains(&count),
            "block {b} at level {level} holds {count}"
        );
        let keys: Vec<(Key, Key)> = (0..count)
            .map(|i| {
                if level == 0 {
                    return (key_at(block, i), key_at(block, i));
                }
                let child = child_at(block, i);
                assert_eq!(store.block(child)[0] + 1, level, "block {child} under {b}");
                let keys = walk(store, child, false);
                assert_eq!(key_at(block, i), keys.0, "entry {i} of block {b}");
                keys
            })
            .collect();
        assert!(
            keys.windows(2).all(|pair| pair[0].1 < pair[1].0),
            "block {b} is out of order"
        );
        (keys[0].0, keys[count - 1].1)
    }

    #[test]
    fn a_tree_matches_a_sorted_list_through_random_edits() {
        /// A key at the `place`th of 16 places a bar from bar 0, of 1 of 6 sounds and 4 pitches.
        fn key(place: u32, random: &mut Random) -> Key {
            Key {
                bar: (place / 16) as u16,
                place: (place % 16 * 480) as u16,
                sound: SoundNumber(1 + random.below(6)),
                pitch: 60 + random.below(4) as u8,
            }
        }
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let mut random = Random(1);
        let mut reference: Vec<Note> = Vec::new();
        let mut tree = Tree(None);
        let (mut growing, mut deepest) = (true, 0);

        for _ in 0..20_000 {
            // The tree grows past 1,500 notes with small removals, then shrinks with big ones.
            growing = match reference.len() {
                ..100 => true,
                1_500.. => false,
                _ => growing,
            };
            if random.below(if growing { 8 } else { 2 }) > 0 {
                let at = key(random.below(40 * 16), &mut random);
                let new = Note {
                    length: 1 + random.below(7_680),
                    velocity: 1 + random.below(127) as u8,
                    ..note(at.bar, at.place, at.sound.0, at.pitch)
                };
                let old = match reference.binary_search_by_key(&new.key(), Note::key) {
                    Ok(i) => Some(core::mem::replace(&mut reference[i], new)),
                    Err(i) => {
                        reference.insert(i, new);
                        None
                    }
                };
                let (next, replaced) = store.insert(tree, new);
                assert_eq!(replaced, old);
                keep(&mut store, &mut tree, next);
            } else {
                let start = random.below(40 * 16);
                // Up to a bar while growing, up to 64 bars while shrinking.
                let most = if growing { 16 } else { 1 << random.below(11) };
                let (from, to) = (
                    key(start, &mut random),
                    key(start + random.below(most), &mut random),
                );
                let sound = SoundNumber(1 + random.below(6));
                // One sound while growing, every sound but one while shrinking.
                let taken = |note: &Note| (note.sound == sound) == growing;
                let mut calls = 0;
                let next = store.remove(tree, from, to, |note| {
                    calls += 1;
                    taken(note)
                });
                let before = reference.len();
                assert_eq!(
                    calls,
                    reference
                        .iter()
                        .filter(|note| (from..to).contains(&note.key()))
                        .count()
                );
                reference.retain(|note| !((from..to).contains(&note.key()) && taken(note)));
                if reference.len() == before {
                    assert_eq!(next, tree);
                }
                keep(&mut store, &mut tree, next);
            }
            check(&store, &[tree]);
            assert_eq!(notes(&store, tree), reference);
            deepest = deepest.max(tree.0.map_or(0, |root| store.block(root)[0] + 1));
        }

        assert!(deepest >= 3, "the tree reached only {deepest} levels");
    }

    #[test]
    fn an_insert_of_a_taken_key_replaces_and_gives_back_the_old_note() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let first = note(1, 480, 2, 60);
        let mut tree = build(&mut store, [first, note(1, 480, 2, 61)]);
        let second = Note {
            length: 960,
            velocity: 64,
            ..first
        };

        let (next, old) = store.insert(tree, second);

        assert_eq!(old, Some(first));
        keep(&mut store, &mut tree, next);
        assert_eq!(notes(&store, tree), [second, note(1, 480, 2, 61)]);
        check(&store, &[tree]);
    }

    #[test]
    fn old_trees_stay_as_they_were() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let v1 = build(&mut store, (0..300).map(|bar| note(bar, 0, 1, 60)));
        let before = notes(&store, v1);

        let (v2, _) = store.insert(v1, note(150, 240, 1, 60));
        store.hold(v2);
        let v3 = store.remove(v2, Key::at(100, 0), Key::at(200, 0), |_| true);
        store.hold(v3);
        store.release(v2, None);

        assert_eq!(notes(&store, v1), before);
        assert_eq!(notes(&store, v3).len(), 200);
        check(&store, &[v1, v3]);
    }

    #[test]
    fn a_removal_that_removes_nothing_copies_nothing() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let tree = build(&mut store, (0..300).map(|bar| note(bar, 0, 1, 60)));
        let ready = store.ready();

        assert_eq!(store.remove(tree, Key::at(0, 0), Key::MAX, |_| false), tree);
        assert_eq!(
            store.remove(tree, Key::at(300, 0), Key::MAX, |_| true),
            tree
        );
        assert_eq!(
            store.remove(tree, Key::at(7, 1), Key::at(8, 0), |_| true),
            tree
        );
        assert_eq!(
            store.remove(Tree(None), Key::at(0, 0), Key::MAX, |_| true),
            Tree(None)
        );

        assert_eq!(store.ready(), ready);
        check(&store, &[tree]);
    }

    #[test]
    fn an_edit_copies_only_its_path() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let mut tree = Tree(None);

        // 3,000 bars, in an order that scatters them over the tree.
        for i in 0..3_000 {
            let ready = store.ready();
            let (next, _) = store.insert(tree, note((i * 1_237 % 3_000) as u16, 0, 1, 60));
            let levels = usize::from(store.block(next.0.unwrap())[0]) + 1;
            let taken = ready - store.ready();
            assert!(
                taken <= levels + 2,
                "an insert into {levels} levels took {taken} blocks"
            );
            keep(&mut store, &mut tree, next);
        }

        check(&store, &[tree]);
    }

    #[test]
    fn seek_stops_at_the_first_key_at_or_after() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let small = build(&mut store, [0, 2, 5].map(|bar| note(bar, 0, 1, 60)));
        let big = build(&mut store, (0..300).map(|i| note(2 * i, 0, 1, 60)));
        let reader = store.reader();
        let bar = |cursor: &Cursor| reader.peek(cursor).map(|note| note.bar);

        let mut cursor = reader.seek(small, Key::at(1, 0));

        assert_eq!(bar(&cursor), Some(2));
        reader.advance(&mut cursor);
        assert_eq!(bar(&cursor), Some(5));
        reader.advance(&mut cursor);
        assert_eq!(bar(&cursor), None);
        reader.advance(&mut cursor);
        assert_eq!(bar(&cursor), None);
        assert_eq!(bar(&reader.seek(small, Key::at(2, 0))), Some(2));
        assert_eq!(bar(&reader.seek(Tree(None), Key::at(0, 0))), None);
        // Through the index and over the ends of the leaves of a bigger tree.
        for at in 0..600 {
            let next = (at / 2 + 1) * 2;
            assert_eq!(
                bar(&reader.seek(big, Key::at(at, 1))),
                (next < 600).then_some(next)
            );
        }
    }

    #[test]
    fn removing_every_note_gives_an_empty_tree_and_frees_every_block() {
        let ram = NoteRam::boxed();
        // SAFETY: the test is the only store.
        let mut store = unsafe { ram.store() };
        let all = (Key::at(0, 0), Key::MAX);

        for removals in [
            &[(all, 1..=4)][..],
            // A sound at a time, which leaves every leaf under a quarter before the last.
            &[(all, 1..=1), (all, 2..=2), (all, 3..=3), (all, 4..=4)],
            // Ranges that leave a few notes at the ends of subtrees of leaves, which then join the
            // subtrees across the emptied ones.
            &[
                ((Key::at(1, 0), Key::at(170, 0)), 1..=4),
                ((Key::at(2, 0), Key::at(497, 0)), 1..=4),
                (all, 1..=4),
            ],
        ] {
            // 4 notes a bar over 500 bars.
            let mut tree = build(
                &mut store,
                (0..2_000).map(|i| note((i / 4) as u16, 0, 1 + i % 4, 60)),
            );
            for ((from, to), sounds) in removals {
                let next = store.remove(tree, *from, *to, |note| sounds.contains(&note.sound.0));
                keep(&mut store, &mut tree, next);
                check(&store, &[tree]);
            }
            assert_eq!(tree, Tree(None));
            assert_eq!(store.ready(), NOTE_BLOCKS);
        }
    }
}
