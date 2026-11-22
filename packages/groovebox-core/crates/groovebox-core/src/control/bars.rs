//! PATTERN's Bars page: LENGTH and SIGNATURE (Workflow B).

use super::Control;
use crate::budget;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind, VERSION_QUEUE, Version};
use crate::project::Signature;
use crate::queue::Producer;
use crate::sequencer::Meter;
use crate::store::note::Key;
use crate::store::{RESERVE, Store, Tree};
use core::fmt;
use core::ops::ControlFlow;

/// A choice of LENGTH or SIGNATURE.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Change {
    Length(u16),
    Signature(Signature),
}

/// LENGTH's choices in bars (answer 1).
pub const LENGTHS: [u16; 7] = [1, 2, 4, 8, 16, 32, 64];

/// The removal of the notes a change no longer fits (S15): the change, the sample of its event,
/// the pattern, track and bar it has reached and its latest tree.
#[derive(Clone, Copy)]
pub(super) struct Trim {
    change: Change,
    sample: u64,
    pattern: u8,
    track: u8,
    /// The track's next removal: a length's is the bars past the end, a signature's the tail of
    /// this bar.
    bar: u16,
    /// The track without the notes removed so far, which the removal holds: none until a removal
    /// takes a note, and again once the track has it.
    tree: Option<Tree>,
}

impl fmt::Display for Change {
    /// As the items and the pickers' rows read it: "1 bar", "4 bars" or "7/8".
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length(1) => f.write_str("1 bar"),
            Self::Length(bars) => write!(f, "{bars} bars"),
            Self::Signature(Signature { beats, unit }) => write!(f, "{beats}/{unit}"),
        }
    }
}

impl Control {
    /// The notes `change` no longer fits, over the four tracks (S12): for a length those of the
    /// current pattern in bars past it, for a signature those of every pattern past each bar's new
    /// end.
    pub(super) fn doomed(&self, change: Change, store: &Store<'_>) -> u32 {
        let reader = store.reader();
        match change {
            Change::Length(bars) => self.project.patterns[usize::from(self.project.pattern)]
                .tracks
                .iter()
                .map(|&tree| reader.notes(tree, Key::at(bars, 0)).count() as u32)
                .sum(),
            Change::Signature(signature) => self
                .project
                .patterns
                .iter()
                .flat_map(|pattern| {
                    (0..pattern.bars).flat_map(|bar| pattern.tracks.map(|tree| (tree, bar)))
                })
                .map(|(tree, bar)| {
                    // A bar has 30,720 ticks at most, which fits.
                    reader
                        .notes(tree, Key::at(bar, signature.bar_ticks() as u16))
                        .take_while(|note| note.bar == bar)
                        .count() as u32
                })
                .sum(),
        }
    }

    /// Applies `change` (S13): the project's record changes at once and the cursor's bar and step
    /// stay inside the new length and bar; both sequencers get the new meter. Stopped, they take
    /// it at once. Playing, it takes hold at the first bar line `EDIT_LEAD` after `sample`, or at
    /// that of a meter already waiting (S14), so the bar under the music keeps its length; the
    /// pattern goes on there with the bar after the one ending there, or with bar 1 when that is
    /// past the new length. Then the removal of the notes the change no longer fits starts, which
    /// `step` runs before any later event (`next_removal`, S15).
    pub(super) fn reshape(
        &mut self,
        change: Change,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        store: &Store<'_>,
    ) {
        let pattern = &mut self.project.patterns[usize::from(self.project.pattern)];
        match change {
            Change::Length(bars) => pattern.bars = bars,
            Change::Signature(signature) => self.project.signature = signature,
        }
        let (bars, signature) = (pattern.bars, self.project.signature);
        let steps = &mut self.view.steps;
        steps.bar = steps.bar.min(bars - 1);
        // A bar has 64 sixteenths at most, which fits.
        steps.step = steps.step.min(signature.sixteenths() as u8 - 1);
        let meter = if self.player.run().is_some() {
            let (tick, ended) = self.player.next_bar_line(sample + budget::EDIT_LEAD as u64);
            Meter {
                tick,
                bar: if ended + 1 < bars { ended + 1 } else { 0 },
                bars,
                signature,
            }
        } else {
            Meter {
                tick: 0,
                bar: 0,
                bars,
                signature,
            }
        };
        self.send(sample, MessageKind::Meter { meter }, messages);
        self.player.meter(meter, &store.reader());
        self.trim = Some(Trim {
            change,
            sample,
            pattern: match change {
                Change::Length(_) => self.project.pattern,
                Change::Signature(_) => 0,
            },
            track: 0,
            bar: 0,
            tree: None,
        });
    }

    /// The removal's next move (S15), or `Break` with nothing done when a removal is due while
    /// fewer than `RESERVE` blocks are ready and some wait for a version's report: the step then
    /// waits for reports.
    ///
    /// Its decisions count the free blocks (`Store::free`), which reports do not change, so when
    /// they come changes nothing it sends. Unless fewer than `RESERVE` are free while it holds a
    /// tree of its own, it removes the track's next range from its tree, or from the track's: the
    /// bars past a new length, or the tail of a bar past a new bar's end. Each note goes off its
    /// sound's count. `remove` gives a root nobody holds, so it holds the new tree before it lets
    /// go of the one it replaces. Once the track is done, or with fewer than `RESERVE` free, its
    /// tree takes the track's place (`edit`): the current pattern's is published, another's is
    /// swapped at once. Then it goes on to the next track, of the current pattern for a length and
    /// of every pattern for a signature, or ends.
    pub(super) fn next_removal(
        &mut self,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) -> ControlFlow<()> {
        let mut trim = self.trim.expect("`step` removes only while a removal runs");
        let short = store.free() < RESERVE;
        if !short || trim.tree.is_none() {
            if store.ready() < RESERVE && store.waiting() {
                return ControlFlow::Break(());
            }
            let (from, to) = match trim.change {
                Change::Length(bars) => (Key::at(bars, 0), Key::MAX),
                // A bar has 30,720 ticks at most, which fits.
                Change::Signature(signature) => (
                    Key::at(trim.bar, signature.bar_ticks() as u16),
                    Key::at(trim.bar + 1, 0),
                ),
            };
            let old = trim.tree.unwrap_or(
                self.project.patterns[usize::from(trim.pattern)].tracks[usize::from(trim.track)],
            );
            let new = store.remove(old, from, to, |note| {
                self.counted(trim.pattern, trim.track, note.sound, -1);
                true
            });
            if new != old {
                store.hold(new);
                if trim.tree.replace(new).is_some() {
                    store.release(old, None);
                }
            }
            trim.bar += 1;
        }
        let done = trim.bar
            == match trim.change {
                Change::Length(_) => 1,
                Change::Signature(_) => self.project.patterns[usize::from(trim.pattern)].bars,
            };
        if (short || done)
            && let Some(tree) = trim.tree.take()
        {
            self.edit(trim.pattern, trim.track, tree, trim.sample, versions, store);
            store.release(tree, None);
        }
        self.trim = if done {
            let (pattern, track) = match trim.track {
                3 => (trim.pattern + 1, 0),
                track => (trim.pattern, track + 1),
            };
            // A length's removal ends after the current pattern's last track, a signature's after
            // the last pattern's.
            match trim.change {
                Change::Length(_) => track > 0,
                Change::Signature(_) => usize::from(pattern) < self.project.patterns.len(),
            }
            .then_some(Trim {
                pattern,
                track,
                bar: 0,
                ..trim
            })
        } else {
            Some(trim)
        };
        ControlFlow::Continue(())
    }
}
