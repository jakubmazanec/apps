//! PATTERN's Bars page: LENGTH and SIGNATURE (Workflow B).

use super::Control;
use crate::budget;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::project::Signature;
use crate::queue::Producer;
use crate::sequencer::Meter;
use crate::store::Store;
use crate::store::note::Key;
use core::fmt;

/// A choice of LENGTH or SIGNATURE.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Change {
    Length(u16),
    Signature(Signature),
}

/// LENGTH's choices in bars (answer 1).
pub const LENGTHS: [u16; 7] = [1, 2, 4, 8, 16, 32, 64];

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
    /// past the new length.
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
    }
}
