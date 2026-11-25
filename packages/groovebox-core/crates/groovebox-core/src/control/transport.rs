//! PLAY, SHIFT + PLAY and STOP (Workflow B).

use super::Control;
use super::record::Rec;
use crate::input::Button;
use crate::message::{MESSAGE_QUEUE, Message, MessageKind, VERSION_QUEUE, Version};
use crate::param::COUNT_IN;
use crate::queue::Producer;
use crate::sequencer::Run;
use crate::store::Store;

impl Control {
    /// PLAY at its press starts the current pattern from bar 1, with tick 0 at the press's sample
    /// and no lead, and while playing changes nothing but following (S7). SHIFT + PLAY starts from
    /// the start of the bar the step buttons show (`shown_bar`), and while playing jumps there at
    /// once with a new run anchored at the press (S8). Both follow the music from then on (S16).
    /// The control part's own sequencer plays the same run. With REC armed and COUNT-IN at 1 bar
    /// the start counts in: the pattern starts a bar after the press; with COUNT-IN off REC turns
    /// on at the press. During the count-in both do nothing at all (S4). A jump ends the held
    /// takes at the press (`end_takes`), as the new run's ticks do not continue the old one's
    /// (S11).
    pub(super) fn play(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        if self.player.counting_in(sample) {
            return;
        }
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
        let count_in = matches!(self.rec, Rec::Armed(_)) && self.settings.get(COUNT_IN.id) == 1;
        // Only a jump has takes to end: while stopped none is held.
        self.end_takes(sample, versions, store);
        self.send(sample, MessageKind::Play { run, count_in }, messages);
        self.player.play(run, count_in, &store.reader());
        self.count_in_over(sample);
    }

    /// STOP at its press: while playing the cursor stays on the bar the step buttons show
    /// (`shown_bar`, S16), the pattern stops, its sounding notes end with their own release and the
    /// preview plays on; while stopped every voice fades within one chunk and the preview stops
    /// (S9). The control part's own sequencer stops too, and REC turns off (S3), ending the held
    /// takes at the press (`end_takes`, S11).
    pub(super) fn stop(
        &mut self,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        self.rec = Rec::Off;
        self.end_takes(sample, versions, store);
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
