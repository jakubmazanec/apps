//! Held steps and the NOTE strip, whose encoders change the pitch, velocity, length and position
//! of the selected sound's notes in the held steps' sixteenths, and whose steps a pad or key hit
//! adds a sound or pitch to or removes it from (Workflow B).

use super::Control;
use super::pages::ItemKind;
use super::steps::sixteenth;
use super::view::StepCursor;
use crate::input::{Button, STEPS};
use crate::message::{VERSION_QUEUE, Version};
use crate::palette::RECORD;
use crate::project::pool::SoundNumber;
use crate::project::track::PadMode;
use crate::queue::Producer;
use crate::store::note::Note;
use crate::store::{RESERVE, Store};
use core::fmt::Write;

/// The held steps' notes as the strip shows them (S13): the lowest and the highest of each value.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Held {
    pub pitch: (u8, u8),
    pub velocity: (u8, u8),
    pub length: (u32, u32),
    /// How many grid steps the notes lie from the sixteenths their steps showed at their press.
    pub position: (i32, i32),
}

/// A length as answer 5 writes it: the shortened fraction of a whole note of 7,680 ticks, such as
/// "1/16" for a sixteenth and "17/256" between steps.
pub fn write_length(ticks: u32, out: &mut impl Write) -> core::fmt::Result {
    let (mut common, mut rest) = (ticks, 7_680);
    while rest > 0 {
        (common, rest) = (rest, common % rest);
    }
    write!(out, "{}/{}", ticks / common, 7_680 / common)
}

/// The grid position of `place` in bars of `sixteenths` (S14): bar after bar, over dark cells.
fn grid(place: StepCursor, sixteenths: u32) -> u32 {
    u32::from(place.bar) * sixteenths + u32::from(place.step)
}

/// `range` widened to take in `value`.
fn spread<T: Ord + Copy>((low, high): (T, T), value: T) -> (T, T) {
    (low.min(value), high.max(value))
}

impl Control {
    /// The held steps (S12), each with where its notes lie now (`held`): the steps held and not
    /// taken by a combination whose sixteenth at their press (`pressed`) lies inside the bar and
    /// whose place now lies inside the pattern, as a shorter length or signature may have left it.
    pub(super) fn held_steps(&self) -> impl Iterator<Item = (u8, StepCursor)> + '_ {
        let sixteenths = self.project.signature.sixteenths();
        let bars = self.project.patterns[usize::from(self.project.pattern)].bars;
        (0..STEPS)
            .filter(move |&step| {
                let now = self.held[usize::from(step)];
                self.buttons.first_held(&[Button::Step(step)]).is_some()
                    && u32::from(self.pressed[usize::from(step)].step) < sixteenths
                    && now.bar < bars
                    && u32::from(now.step) < sixteenths
            })
            .map(move |step| (step, self.held[usize::from(step)]))
    }

    /// The held notes as the strip shows them: the selected sound's notes in each held step's
    /// sixteenth. None while there are none.
    pub(super) fn summary(&self, store: &Store<'_>) -> Option<Held> {
        let sound = self.track().selected_sound?;
        let sixteenths = self.project.signature.sixteenths();
        let mut summary = None;
        for (step, place) in self.held_steps() {
            // A step pressed where an earlier one's notes lie shares them, at the earlier one's
            // position.
            if self
                .held_steps()
                .any(|(earlier, at)| earlier < step && at == place)
            {
                continue;
            }
            let position = grid(place, sixteenths) as i32
                - grid(self.pressed[usize::from(step)], sixteenths) as i32;
            let keys = sixteenth(place);
            for note in store
                .reader()
                .notes(self.track_tree(), keys.start)
                .take_while(|note| keys.contains(&note.key()))
                .filter(|note| note.sound == sound)
            {
                let held = summary.get_or_insert(Held {
                    pitch: (note.pitch, note.pitch),
                    velocity: (note.velocity, note.velocity),
                    length: (note.length, note.length),
                    position: (position, position),
                });
                *held = Held {
                    pitch: spread(held.pitch, note.pitch),
                    velocity: spread(held.velocity, note.velocity),
                    length: spread(held.length, note.length),
                    position: spread(held.position, position),
                };
            }
        }
        summary
    }

    /// A turn of `clicks` on the NOTE item `kind` (S13, S14). Every held note moves by the same
    /// amount: PITCH a semitone and VELOCITY one a click, LENGTH 480 ticks and 30 while SHIFT is
    /// held, POSITION a grid step. VELOCITY and LENGTH stop each note at its own end, 1 to 127 and
    /// 30 ticks to a bar, or at its own length for a note longer or shorter than that (S18); PITCH
    /// stops all of them where the first note reaches 0 or 127, and
    /// POSITION where the first held step, with notes or without, reaches the pattern's first or
    /// last grid position, so no held note lands on another. A turn that changes nothing does
    /// nothing, and with fewer than `RESERVE` blocks free none changes and "Not enough memory"
    /// shows in red. The held notes leave the track's tree and go back changed, read from the old
    /// tree, which the track holds until `edit`. A moved note replaces a note of the sound and
    /// pitch where it lands, which goes off its counts, and every held step moves by the same
    /// number (`held`), so each stands for the sixteenth its notes moved to.
    pub(super) fn turn_held(
        &mut self,
        kind: ItemKind,
        clicks: i32,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let (Some(sound), Some(held)) = (self.track().selected_sound, self.summary(store)) else {
            return;
        };
        let signature = self.project.signature;
        let sixteenths = signature.sixteenths();
        let by = match kind {
            ItemKind::NotePitch => {
                clicks.clamp(-i32::from(held.pitch.0), 127 - i32::from(held.pitch.1))
            }
            ItemKind::NotePosition => {
                let (first, last) = self
                    .held_steps()
                    .map(|(_, place)| grid(place, sixteenths))
                    .fold((u32::MAX, 0), spread);
                // A held place lies inside the pattern (`held_steps`), so the last grid position is
                // never before it.
                clicks.clamp(
                    -(first as i32),
                    (u32::from(self.project.patterns[usize::from(self.project.pattern)].bars)
                        * sixteenths
                        - 1
                        - last) as i32,
                )
            }
            ItemKind::NoteLength if self.buttons.is_held(Button::Shift) => clicks * 30,
            ItemKind::NoteLength => clicks * 480,
            _ => clicks,
        };
        let velocity = |velocity: u8| (i32::from(velocity) + by).clamp(1, 127) as u8;
        // A note is shorter than 2^31 ticks. Its range reaches its own length, so no turn moves it
        // against the turn (S18).
        let length = |length: u32| {
            let old = length as i32;
            (old + by).clamp(old.min(30), old.max(signature.bar_ticks() as i32)) as u32
        };
        let moved = |place: StepCursor| {
            let at = (grid(place, sixteenths) as i32 + by) as u32;
            StepCursor {
                bar: (at / sixteenths) as u16,
                step: (at % sixteenths) as u8,
            }
        };
        if match kind {
            ItemKind::NoteVelocity => {
                (velocity(held.velocity.0), velocity(held.velocity.1)) == held.velocity
            }
            ItemKind::NoteLength => (length(held.length.0), length(held.length.1)) == held.length,
            _ => by == 0,
        } {
            return;
        }
        if store.free() < RESERVE {
            self.say("Not enough memory", RECORD);
            return;
        }
        let mut steps = [None; STEPS as usize];
        for (step, place) in self.held_steps() {
            steps[usize::from(step)] = Some(place);
        }
        let old = self.track_tree();
        let mut tree = old;
        for &place in steps.iter().flatten() {
            tree = self.cleared(tree, place, sound, None, store).0;
        }
        for (step, place) in steps.iter().enumerate() {
            // A step pressed where an earlier one's notes lie shares them, and they go in once.
            let Some(place) = place.filter(|place| !steps[..step].contains(&Some(*place))) else {
                continue;
            };
            let keys = sixteenth(place);
            let mut cursor = store.reader().seek(old, keys.start);
            while let Some(note) = store
                .reader()
                .peek(&cursor)
                .filter(|note| keys.contains(&note.key()))
            {
                store.reader().advance(&mut cursor);
                if note.sound != sound {
                    continue;
                }
                let (added, replaced) = store.insert(
                    tree,
                    match kind {
                        ItemKind::NotePitch => Note {
                            pitch: (i32::from(note.pitch) + by) as u8,
                            ..note
                        },
                        ItemKind::NoteVelocity => Note {
                            velocity: velocity(note.velocity),
                            ..note
                        },
                        ItemKind::NoteLength => Note {
                            length: length(note.length),
                            ..note
                        },
                        _ => {
                            let to = moved(place);
                            Note {
                                bar: to.bar,
                                place: u16::from(to.step) * 480 + note.place % 480,
                                ..note
                            }
                        }
                    },
                );
                self.hold_over(tree, added, store);
                tree = added;
                self.counted(
                    self.project.pattern,
                    self.project.track,
                    sound,
                    1 - i32::from(replaced.is_some()),
                );
            }
        }
        if kind == ItemKind::NotePosition {
            for (held, place) in self.held.iter_mut().zip(steps) {
                if let Some(place) = place {
                    *held = moved(place);
                }
            }
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
    }

    /// A hit of `sound` at `pitch` under held steps (S15). On each sixteenth the held steps stand
    /// for, the earlier step owning one that two share, it removes the notes of `sound` there, of
    /// `pitch` in KEYS mode and of every pitch in PADS mode, or where it removed none adds a
    /// step-entered note at `pitch`. Once fewer than `RESERVE` blocks are free no note goes in and
    /// "Not enough memory" shows in red, while the removals go ahead. The changes are one new tree
    /// and one version, and a hit that changes nothing sends none.
    pub(super) fn toggle_held(
        &mut self,
        sound: SoundNumber,
        pitch: u8,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let mut steps = [None; STEPS as usize];
        for (step, place) in self.held_steps() {
            steps[usize::from(step)] = Some(place);
        }
        let old = self.track_tree();
        let mut tree = old;
        for (step, place) in steps.iter().enumerate() {
            // A step pressed where an earlier one's notes lie shares them, and they toggle once.
            let Some(place) = place.filter(|place| !steps[..step].contains(&Some(*place))) else {
                continue;
            };
            let (kept, removed) = self.cleared(
                tree,
                place,
                sound,
                (self.track().mode == PadMode::Keys).then_some(pitch),
                store,
            );
            tree = kept;
            if removed > 0 {
                continue;
            }
            if store.free() < RESERVE {
                self.say("Not enough memory", RECORD);
            } else {
                tree = self.added(tree, place, sound, pitch, store);
            }
        }
        if tree != old {
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::label::Label;

    #[test]
    fn lengths_read_as_shortened_fractions_of_a_whole_note() {
        for (ticks, written) in [
            (480, "1/16"),
            (960, "1/8"),
            (1_440, "3/16"),
            (510, "17/256"),
            (30, "1/256"),
            (7_680, "1/1"),
            (15_360, "2/1"),
        ] {
            let mut out = Label::<16>::new();
            write_length(ticks, &mut out).unwrap();
            assert_eq!(out.as_str(), written, "{ticks} ticks");
        }
    }
}
