//! The step buttons, OK and CANCEL enter and remove the selected sound's notes, and the versions
//! of a track that give its notes to the audio part (Workflow B).

use super::Control;
use super::view::{Screen, StepCursor};
use crate::budget;
use crate::message::{VERSION_QUEUE, Version};
use crate::palette::RECORD;
use crate::project::pool::SoundNumber;
use crate::project::track::PadMode;
use crate::queue::Producer;
use crate::store::note::{Key, Note};
use crate::store::{RESERVE, Store, Tree};
use core::ops::Range;

/// The keys of the notes that start in the sixteenth of `place`.
pub(super) fn sixteenth(place: StepCursor) -> Range<Key> {
    let start = u16::from(place.step) * 480;
    Key::at(place.bar, start)..Key::at(place.bar, start + 480)
}

impl Control {
    /// A tap of step `button` (0 to 15) on the page the step buttons show (S1 to S5) acts on the
    /// bar and sixteenth the button showed when it went down (`pressed`, S16): the cursor's step
    /// goes to the sixteenth, and a step past the bar's end does nothing. With a selected sound,
    /// the sound's notes that start in the sixteenth are removed (`remove_notes`), whatever their
    /// pitch, and with none there a note goes in (`enter_note`).
    pub(super) fn tap_step(
        &mut self,
        button: u8,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let place = self.pressed[usize::from(button)];
        if u32::from(place.step) >= self.project.signature.sixteenths() {
            return;
        }
        self.view.steps.step = place.step;
        if !self.remove_notes(place, None, sample, versions, store) {
            self.enter_note(place, None, sample, versions, store);
        }
    }

    /// OK on the cursor's cell of STEP or ROLL: where the selected sound has no note starting in
    /// the cell's sixteenth, of the row's pitch on ROLL, a note goes in (`enter_note`).
    pub(super) fn ok_on_cell(
        &mut self,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let Some(sound) = self.selected() else {
            return;
        };
        let place = self.cursor_at(sample);
        let pitch = self.cell_pitch();
        let keys = sixteenth(place);
        if store
            .reader()
            .notes(self.track_tree(), keys.start)
            .take_while(|note| keys.contains(&note.key()))
            .any(|note| note.sound == sound.number && pitch.is_none_or(|pitch| note.pitch == pitch))
        {
            return;
        }
        self.enter_note(place, pitch, sample, versions, store);
    }

    /// The pitch a cell is of: ROLL's row, and none on STEP, where a cell holds every pitch.
    pub(super) fn cell_pitch(&self) -> Option<u8> {
        (self.view.screen == Screen::Roll).then_some(self.view.roll.pitch)
    }

    /// Removes the notes of the selected sound that start in the sixteenth of `place`, of `pitch`
    /// or of every pitch, and says whether there were any. A removal may use the reserve (S19).
    pub(super) fn remove_notes(
        &mut self,
        place: StepCursor,
        pitch: Option<u8>,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) -> bool {
        let Some(sound) = self.track().selected_sound else {
            return false;
        };
        let (tree, removed) = self.cleared(self.track_tree(), place, sound, pitch, store);
        if removed == 0 {
            return false;
        }
        self.edit(
            self.project.pattern,
            self.project.track,
            tree,
            sample,
            versions,
            store,
        );
        store.release(tree, None);
        true
    }

    /// Enters a note of the selected sound in the sixteenth of `place`. It starts the sixteenth, is
    /// a sixteenth long, has velocity 127 and no pressure curve, and its pitch is `pitch`, or where
    /// the sound plays unchanged in PADS mode, and in KEYS mode the last key played, or the C of
    /// the octave before any key. With fewer than `RESERVE` blocks free no note goes in, and "Not
    /// enough memory" shows in red instead (S19).
    pub(super) fn enter_note(
        &mut self,
        place: StepCursor,
        pitch: Option<u8>,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let Some(sound) = self.selected() else {
            return;
        };
        if store.free() < RESERVE {
            self.say("Not enough memory", RECORD);
            return;
        }
        let tree = self.added(
            self.track_tree(),
            place,
            sound.number,
            pitch.unwrap_or(match self.track().mode {
                PadMode::Pads => sound.unchanged_pitch(),
                PadMode::Keys => self.track().last_key.unwrap_or(self.track().key_pitch(0)),
            }),
            store,
        );
        self.edit(
            self.project.pattern,
            self.project.track,
            tree,
            sample,
            versions,
            store,
        );
        store.release(tree, None);
    }

    /// `tree` without the notes of `sound` that start in the sixteenth of `place`, of `pitch` or of
    /// every pitch, and how many went, each off its counts. It holds the tree it makes before it
    /// lets go of `tree`, unless that is the track's (the order of `next_removal`), and gives
    /// `tree` itself when nothing goes. The caller passes the tree to `edit` and then lets go of it.
    pub(super) fn cleared(
        &mut self,
        tree: Tree,
        place: StepCursor,
        sound: SoundNumber,
        pitch: Option<u8>,
        store: &mut Store<'_>,
    ) -> (Tree, u32) {
        let keys = sixteenth(place);
        let mut removed = 0;
        let kept = store.remove(tree, keys.start, keys.end, |note| {
            let taken = note.sound == sound && pitch.is_none_or(|pitch| note.pitch == pitch);
            removed += u32::from(taken);
            taken
        });
        if kept != tree {
            self.hold_over(tree, kept, store);
        }
        self.counted(
            self.project.pattern,
            self.project.track,
            sound,
            -(removed as i32),
        );
        (kept, removed)
    }

    /// `tree` with a step-entered note of `sound` at `pitch` at the start of the sixteenth of
    /// `place`, a sixteenth long at velocity 127 with no curve, counted. It holds the tree it
    /// makes before it lets go of `tree`, unless that is the track's (the order of `next_removal`),
    /// and the caller passes the tree to `edit` and then lets go of it.
    pub(super) fn added(
        &mut self,
        tree: Tree,
        place: StepCursor,
        sound: SoundNumber,
        pitch: u8,
        store: &mut Store<'_>,
    ) -> Tree {
        let note = Note {
            bar: place.bar,
            place: u16::from(place.step) * 480,
            length: 480,
            sound,
            pitch,
            velocity: 127,
            curve: None,
        };
        let added = store.insert(tree, note).0;
        self.hold_over(tree, added, store);
        self.counted(self.project.pattern, self.project.track, sound, 1);
        added
    }

    /// Holds `made`, which `old` was edited into, and lets go of `old` unless it is the track's:
    /// the track keeps its own tree until `edit`.
    pub(super) fn hold_over(&self, old: Tree, made: Tree, store: &mut Store<'_>) {
        store.hold(made);
        if old != self.track_tree() {
            store.release(old, None);
        }
    }

    /// The current track's tree.
    pub(super) fn track_tree(&self) -> Tree {
        self.project.patterns[usize::from(self.project.pattern)].tracks
            [usize::from(self.project.track)]
    }

    /// Track `track` of pattern `pattern` takes `tree` in place of its own, which it lets go of at
    /// once: a version reaches the old tree only through the audio part's own hold (`publish`).
    /// The current pattern's track is published.
    pub(super) fn edit(
        &mut self,
        pattern: u8,
        track: u8,
        tree: Tree,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let old = core::mem::replace(
            &mut self.project.patterns[usize::from(pattern)].tracks[usize::from(track)],
            tree,
        );
        store.hold(tree);
        store.release(old, None);
        if pattern == self.project.pattern {
            self.publish(track, tree, sample, versions, store);
        }
    }

    /// Sends the version in which track `track` of the current pattern plays `tree`, numbered from
    /// the messages' count. Its moment is `EDIT_LEAD` after `sample` and never before the moment
    /// before it, or the sample of its replay record (`stamped`, S18). The audio part holds the
    /// tree from now on, and the blocks of the tree it held before wait for this version's report.
    /// The control part's own sequencer plays the tree at once.
    fn publish(
        &mut self,
        track: u8,
        tree: Tree,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let number = self.next_number;
        self.next_number += 1;
        self.moment = self.stamped(number, (sample + budget::EDIT_LEAD as u64).max(self.moment));
        versions
            .push(Version {
                number,
                moment: self.moment,
                track,
                tree,
            })
            .expect("the step leaves room for every version of an event");
        store.hold(tree);
        store.release(self.player.tree(track), Some(number));
        self.player.switch(track, tree, &store.reader());
    }
}
