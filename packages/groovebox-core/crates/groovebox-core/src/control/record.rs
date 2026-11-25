//! REC, the count-in and the notes recorded (Workflow B).

use super::Control;
use super::notes::{self, Source, Take};
use crate::message::{VERSION_QUEUE, Version};
use crate::palette::RECORD;
use crate::project::pool::SoundNumber;
use crate::queue::Producer;
use crate::sequencer::Run;
use crate::store::curve::Curve;
use crate::store::note::Note;
use crate::store::{RESERVE, Store, Tree};

/// Whether REC is on, off or armed for the next PLAY or during the count-in (S3). An armed REC's
/// run times its blink while stopped, from the press that armed it (S7).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Rec {
    Off,
    Armed(Run),
    On,
}

impl Control {
    /// REC at its press, which sends nothing (S3). While stopped or during the count-in it arms
    /// and disarms; while playing it drops in or out. Arming and a drop in start a pass that is not
    /// full (S14), and turning off ends the held takes there (`end_takes`, S11).
    pub(super) fn press_rec(
        &mut self,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        self.rec = match self.rec {
            Rec::Off if self.player.run().is_none() || self.player.counting_in(sample) => {
                self.full = false;
                Rec::Armed(Run {
                    anchor: sample,
                    tick: 0,
                    tempo: self.project.tempo,
                })
            }
            Rec::Off => {
                self.full = false;
                Rec::On
            }
            Rec::Armed(_) | Rec::On => Rec::Off,
        };
        if self.rec == Rec::Off {
            self.end_takes(sample, versions, store);
        }
    }

    /// An armed REC whose player plays past its count-in at `sample` turns on (S5). Arming started
    /// the pass, which stays full if a take of the count-in filled it (S14).
    pub(super) fn count_in_over(&mut self, sample: u64) {
        if matches!(self.rec, Rec::Armed(_))
            && self.player.run().is_some()
            && !self.player.counting_in(sample)
        {
            self.rec = Rec::On;
        }
    }

    /// The take of a hit at `sample` that plays `sound` at `velocity`, on the current track and
    /// pattern, while REC is on or armed during the count-in (S9): its tick less the output delay,
    /// its start snapped with QUANTIZE on (S10) and the sample of the start in its pass (S12).
    /// None for a start before the pattern's start, and while the pass is full, which shows "Full"
    /// again (S14).
    pub(super) fn take(&mut self, sound: SoundNumber, velocity: u8, sample: u64) -> Option<Take> {
        if !(self.rec == Rec::On
            || matches!(self.rec, Rec::Armed(_)) && self.player.counting_in(sample))
        {
            return None;
        }
        if self.full {
            self.say("Full", RECORD);
            return None;
        }
        let tick = self.played_tick(sample);
        let start = if self.project.quantize {
            self.player.snap(tick)
        } else {
            tick
        };
        let (bar, place) = self.player.place(start)?;
        Some(Take {
            pattern: self.project.pattern,
            sound,
            velocity,
            tick,
            bar,
            // A bar has 30,720 ticks at most, which fits.
            place: place as u16,
            // A start snapped back has passed, and may lie before the run's first tick.
            due: self.player.sample_at(start.max(tick)),
            pressed: false,
            curve: None,
        })
    }

    /// Pressure `value` at `sample` from `source`, or from the channel for every held note with
    /// `None`: it goes into the curve of each such note that records, which starts at its first
    /// pressure (`Curve::start`, S15). Its ticks are counted from the hit's.
    pub(super) fn pressure(
        &mut self,
        source: Option<Source>,
        value: u8,
        sample: u64,
        store: &mut Store<'_>,
    ) {
        // Notes record only while the player plays, which alone has ticks.
        if self.notes.taken().next().is_none() {
            return;
        }
        let tick = self.played_tick(sample);
        let press = |take: &mut Take| {
            let ticks = tick.saturating_sub(take.tick);
            match &mut take.curve {
                Some(curve) => curve.point(store, ticks, value),
                None if !take.pressed => take.curve = Curve::start(store, ticks, value),
                None => {}
            }
            take.pressed = true;
        };
        match source {
            Some(source) => self.notes.take_mut(source).into_iter().for_each(press),
            None => self
                .notes
                .taken()
                .filter_map(|note| note.take.as_mut())
                .for_each(press),
        }
    }

    /// The run's tick of an input at `sample`, less the output delay (S8).
    fn played_tick(&self, sample: u64) -> u64 {
        self.player
            .tick_at(sample.saturating_sub(u64::from(self.output_delay)))
    }

    /// The release of `note` at `sample`: what it recorded goes into its track's tree
    /// (`recorded`), which the track takes (`edit`).
    pub(super) fn keep(
        &mut self,
        note: notes::Note,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let Some(take) = note.take else { return };
        let old = self.project.patterns[usize::from(take.pattern)].tracks[usize::from(note.track)];
        let tree = self.recorded(old, note, sample, store);
        if tree != old {
            self.edit(take.pattern, note.track, tree, sample, versions, store);
            store.release(tree, None);
        }
    }

    /// REC turning off, STOP or a jump at `sample` (S11): every held take goes into its track's
    /// tree there (`recorded`), and each track takes all of its own at once (`edit`), in track
    /// order. During the count-in nothing has played, so the takes go instead, each giving back its
    /// curve. The notes stay on without their takes, so their release adds nothing.
    pub(super) fn end_takes(
        &mut self,
        sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        if self.player.counting_in(sample) {
            for note in self.notes.taken() {
                if let Some(curve) = note.take.take().and_then(|take| take.curve) {
                    store.give_back(curve.block());
                }
            }
            return;
        }
        while let Some((track, pattern)) = self
            .notes
            .taken()
            .map(|note| {
                (
                    note.track,
                    note.take.expect("a taken note has a take").pattern,
                )
            })
            .min()
        {
            let old = self.project.patterns[usize::from(pattern)].tracks[usize::from(track)];
            let mut tree = old;
            // `let else` rather than `while let`, whose iterator would borrow the notes for the
            // body.
            loop {
                let Some(note) = self
                    .notes
                    .taken()
                    .find(|note| {
                        note.track == track && note.take.is_some_and(|take| take.pattern == pattern)
                    })
                    .map(|note| {
                        core::mem::replace(
                            note,
                            notes::Note {
                                take: None,
                                ..*note
                            },
                        )
                    })
                else {
                    break;
                };
                tree = self.recorded(tree, note, sample, store);
            }
            if tree != old {
                self.edit(pattern, track, tree, sample, versions, store);
                store.release(tree, None);
            }
        }
    }

    /// `tree`, the tree of the track and pattern of `note`'s take or one made from it, with the
    /// note the take recorded, ended at `sample` less the output delay (S11): as long as it was
    /// held from its tick before snapping, at least 1 tick and at most the pattern. It holds the
    /// tree it makes before it lets go of `tree`, unless that is the track's, replaces a note of
    /// the same sound, pitch and start (counting it only when it replaced none) and raises
    /// `moment` past the start's sample in its pass (S12). The note takes the take's curve, which
    /// goes back first when fewer than `RESERVE` blocks are free with it (Project model: the curve
    /// gives way first). It gives `tree` itself for a take it drops: one whose sound left the pool
    /// or whose bar or place no longer fits the pattern, and any once the pass is full or with
    /// fewer than `RESERVE` blocks free even without its curve, which make the pass full and show
    /// "Full" (S13, S14). A dropped take gives its curve back.
    fn recorded(
        &mut self,
        tree: Tree,
        note: notes::Note,
        sample: u64,
        store: &mut Store<'_>,
    ) -> Tree {
        let take = note.take.expect("a recorded note has a take");
        let pattern = self.project.patterns[usize::from(take.pattern)];
        let bar_ticks = self.project.signature.bar_ticks();
        let mut curve = take.curve.map(|curve| curve.block());
        if store.free() < RESERVE
            && let Some(block) = curve.take()
        {
            store.give_back(block);
        }
        let fits = self.project.pool.get(take.sound).is_some()
            && take.bar < pattern.bars
            && u32::from(take.place) < bar_ticks;
        if fits && (self.full || store.free() < RESERVE) {
            self.full = true;
            self.say("Full", RECORD);
        }
        if !fits || self.full {
            if let Some(block) = curve {
                store.give_back(block);
            }
            return tree;
        }
        let (made, replaced) = store.insert(
            tree,
            Note {
                bar: take.bar,
                place: take.place,
                // A pattern of 64 bars of 30,720 ticks fits.
                length: self
                    .played_tick(sample)
                    .saturating_sub(take.tick)
                    .clamp(1, u64::from(pattern.bars) * u64::from(bar_ticks))
                    as u32,
                sound: take.sound,
                pitch: note.pitch,
                velocity: take.velocity,
                curve,
            },
        );
        store.hold(made);
        if tree != pattern.tracks[usize::from(note.track)] {
            store.release(tree, None);
        }
        self.counted(
            take.pattern,
            note.track,
            take.sound,
            i32::from(replaced.is_none()),
        );
        self.moment = self.moment.max(take.due + 1);
        made
    }
}
