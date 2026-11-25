//! PLAY, SHIFT + PLAY and STOP (Workflow B).

use super::Control;
use crate::input::Button;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind};
use crate::queue::Producer;
use crate::sequencer::Run;
use crate::store::Store;

impl Control {
    /// PLAY at its press starts the current pattern from bar 1, with tick 0 at the press's sample
    /// and no lead, and while playing changes nothing but following (S7). SHIFT + PLAY starts from
    /// the start of the bar the step buttons show (`shown_bar`), and while playing jumps there at
    /// once with a new run anchored at the press (S8). Both follow the music from then on (S16).
    /// The control part's own sequencer plays the same run.
    pub(super) fn play(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        store: &Store<'_>,
    ) {
        let start = if self.buttons.is_held(Button::Shift) {
            Some(self.shown_bar(sample))
        } else {
            self.player.run().is_none().then_some(0)
        };
        self.view.following = true;
        let Some(bar) = start else { return };
        let run = Run {
            anchor: sample,
            tick: u64::from(bar) * u64::from(self.project.signature.bar_ticks()),
            tempo: self.project.tempo,
        };
        self.send(
            sample,
            MessageKind::Play {
                run,
                count_in: false,
            },
            messages,
        );
        self.player.play(run, false, &store.reader());
    }

    /// STOP at its press: while playing the cursor stays on the bar the step buttons show
    /// (`shown_bar`, S16), the pattern stops, its sounding notes end with their own release and the
    /// preview plays on; while stopped every voice fades within one chunk and the preview stops
    /// (S9). The control part's own sequencer stops too.
    pub(super) fn stop(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if self.player.run().is_some() {
            self.view.steps.bar = self.shown_bar(sample);
            self.send(sample, MessageKind::Stop, messages);
            self.player.stop(|_| {});
        } else {
            self.send(sample, MessageKind::Silence, messages);
            self.previewing = false;
        }
    }
}
