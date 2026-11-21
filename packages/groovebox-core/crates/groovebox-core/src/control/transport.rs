//! PLAY, SHIFT + PLAY and STOP (Workflow B).

use super::Control;
use crate::input::Button;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::queue::Producer;
use crate::sequencer::Run;
use crate::store::Store;

impl Control {
    /// PLAY at its press starts the current pattern from bar 1, with tick 0 at the press's sample
    /// and no lead, and while playing changes nothing (S7). SHIFT + PLAY starts from the start of
    /// the cursor's bar, and while playing jumps there at once with a new run anchored at the press
    /// (S8). The control part's own sequencer plays the same run.
    pub(super) fn play(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        store: &Store<'_>,
    ) {
        let bar = if self.buttons.is_held(Button::Shift) {
            self.view.steps.bar
        } else if self.player.run().is_none() {
            0
        } else {
            return;
        };
        let run = Run {
            anchor: sample,
            tick: u64::from(bar) * u64::from(self.project.signature.bar_ticks()),
            tempo: self.project.tempo,
        };
        self.send(sample, MessageKind::Play { run }, messages);
        self.player.play(run, &store.reader());
    }

    /// STOP at its press: while playing the pattern stops and its sounding notes end with their
    /// own release, and the preview plays on; while stopped every voice fades within one chunk and
    /// the preview stops (S9). The control part's own sequencer stops too.
    pub(super) fn stop(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if self.player.run().is_some() {
            self.send(sample, MessageKind::Stop, messages);
            self.player.stop(|_| {});
        } else {
            self.send(sample, MessageKind::Silence, messages);
            self.previewing = false;
        }
    }
}
