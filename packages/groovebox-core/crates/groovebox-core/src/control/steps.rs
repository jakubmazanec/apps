//! The step buttons enter and remove the selected sound's notes, and the versions of a track that
//! give its notes to the audio part (Workflow B).

use super::Control;
use crate::budget;
use crate::message::{VERSION_QUEUE, Version};
use crate::palette::RECORD;
use crate::project::track::PadMode;
use crate::queue::Producer;
use crate::store::note::{Key, Note};
use crate::store::{RESERVE, Store, Tree};

impl Control {
    /// A tap of step `button` (0 to 15) on the page the step buttons show (S1 to S5): the cursor's
    /// step goes to its sixteenth of the cursor's bar, and a step past the bar's end does nothing.
    /// With a selected sound, the sound's notes that start in the sixteenth are removed, whatever
    /// their pitch, and with none there a note of the sound goes in at the sixteenth's start, a
    /// sixteenth long, at velocity 127 and with no pressure curve. Its pitch is the one where the
    /// sound plays unchanged in PADS mode, and in KEYS mode the last key played, or the C of the
    /// octave before any key. With fewer than `RESERVE` blocks free no note goes in, and "Not
    /// enough memory" shows in red instead; a removal may use the reserve (S19).
    pub(super) fn tap_step(
        &mut self,
        button: u8,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let sixteenth = self.view.steps.step / 16 * 16 + button;
        if u32::from(sixteenth) >= self.project.signature.sixteenths() {
            return;
        }
        self.view.steps.step = sixteenth;
        let Some(sound) = self.selected() else {
            return;
        };
        let note = Note {
            bar: self.view.steps.bar,
            place: u16::from(sixteenth) * 480,
            length: 480,
            sound: sound.number,
            pitch: match self.track().mode {
                PadMode::Pads => sound.unchanged_pitch(),
                PadMode::Keys => self.track().last_key.unwrap_or(self.track().key_pitch(0)),
            },
            velocity: 127,
            curve: None,
        };
        let (pattern, track) = (self.project.pattern, self.project.track);
        let tree = self.project.patterns[usize::from(pattern)].tracks[usize::from(track)];
        let mut removed = 0;
        let kept = store.remove(
            tree,
            Key::at(note.bar, note.place),
            Key::at(note.bar, note.place + 480),
            |other| {
                let taken = other.sound == note.sound;
                removed += u32::from(taken);
                taken
            },
        );
        if removed == 0 && store.free() < RESERVE {
            self.say("Not enough memory", RECORD);
            return;
        }
        let notes = &mut self
            .project
            .pool
            .get_mut(note.sound)
            .expect("a selected sound is in the pool")
            .notes;
        let edited = if removed > 0 {
            *notes -= removed;
            kept
        } else {
            *notes += 1;
            store.insert(tree, note).0
        };
        self.edit(pattern, track, edited, sample, versions, store);
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
