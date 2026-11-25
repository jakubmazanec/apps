//! REC and the count-in (Workflow B).

use super::Control;
use crate::message::{VERSION_QUEUE, Version};
use crate::queue::Producer;
use crate::sequencer::Run;
use crate::store::Store;

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
    /// and disarms; while playing it drops in or out, a drop in starting a pass that is not full
    /// (S14).
    pub(super) fn press_rec(
        &mut self,
        sample: u64,
        _versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        _store: &mut Store<'_>,
    ) {
        self.rec = match self.rec {
            Rec::Off if self.player.run().is_none() || self.player.counting_in(sample) => {
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
    }

    /// An armed REC whose player plays past its count-in at `sample` turns on, starting a pass
    /// that is not full (S5, S14).
    pub(super) fn count_in_over(&mut self, sample: u64) {
        if matches!(self.rec, Rec::Armed(_))
            && self.player.run().is_some()
            && !self.player.counting_in(sample)
        {
            self.full = false;
            self.rec = Rec::On;
        }
    }
}
