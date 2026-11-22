use crate::message::NoteId;
use crate::project::pool::SoundNumber;
use crate::project::{FOUR_FOUR, Signature};
use crate::store::note::{Key, Note};
use crate::store::tree::Cursor;
use crate::store::{NoteReader, Tree};

/// The most pattern notes that sound at once (S24).
pub const SOUNDING: usize = 128;

/// Foundation's 48,000 samples × 60 seconds × 100 over 1,920 ticks a beat.
const SCALE: u64 = 150_000;

/// Sample `anchor` is tick `tick` of the run, counted from bar 1 of the first pass, at `tempo`
/// hundredths of a BPM.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Run {
    pub anchor: u64,
    pub tick: u64,
    pub tempo: u32,
}

impl Run {
    /// The sample of `tick`, the run's tick or later, rounded down (Foundation).
    pub fn sample(&self, tick: u64) -> u64 {
        self.anchor + (tick - self.tick) * SCALE / u64::from(self.tempo)
    }

    /// The first tick of the run whose sample is later than `sample`.
    pub fn first_tick_after(&self, sample: u64) -> u64 {
        sample.checked_sub(self.anchor).map_or(self.tick, |since| {
            self.tick + ((since + 1) * u64::from(self.tempo)).div_ceil(SCALE)
        })
    }
}

/// From run tick `tick`, the start of bar `bar`, the pattern loops `bars` bars of `signature`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Meter {
    pub tick: u64,
    pub bar: u16,
    pub bars: u16,
    pub signature: Signature,
}

impl Meter {
    /// The pass of the pattern, counted from the one holding the meter's bar, and the bar and the
    /// place in it of `tick`, the meter's tick or later.
    fn locate(&self, tick: u64) -> (u64, u16, u32) {
        let (bar_ticks, since) = (u64::from(self.signature.bar_ticks()), tick - self.tick);
        let (bar, bars) = (
            u64::from(self.bar) + since / bar_ticks,
            u64::from(self.bars),
        );
        (bar / bars, (bar % bars) as u16, (since % bar_ticks) as u32)
    }

    /// A beat's ticks: a quarter in x/4 and an eighth in x/8 (S7).
    fn beat(&self) -> u64 {
        u64::from(self.signature.bar_ticks() / u32::from(self.signature.beats))
    }
}

/// A started note until its end.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Sounding {
    pub id: NoteId,
    pub end: u64,
    pub track: u8,
    pub sound: SoundNumber,
    pub pitch: u8,
}

/// A note's start or end, or a beat, `first` at a bar's start (S7).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Start { id: NoteId, track: u8, note: Note },
    End(Sounding),
    Beat { first: bool },
}

/// A track's tree and where it plays.
#[derive(Clone, Copy)]
struct Track {
    tree: Tree,
    /// At the note it starts next.
    cursor: Cursor,
    /// The pass of the pattern the cursor is in, from 0: the one holding the meter's bar.
    pass: u64,
    /// The tick and the note of the next start: none for a tree with no note inside the pattern.
    next: Option<(u64, Note)>,
}

/// Walks the tracks' trees in time: starts their notes, ends them after their length and loops
/// the pattern.
pub struct Sequencer {
    /// None while stopped.
    run: Option<Run>,
    /// Takes over from its tick: none while stopped.
    waiting_run: Option<Run>,
    /// Stopped, its tick and bar are 0.
    meter: Meter,
    /// Takes over from its tick: none while stopped.
    waiting_meter: Option<Meter>,
    /// Waits in the waiting meter's place when that one takes over: none unless one waits.
    queued_meter: Option<Meter>,
    tracks: [Track; 4],
    /// The tick of the next beat.
    beat: u64,
    /// The first tick whose notes are not yet due.
    due: u64,
    table: [Option<Sounding>; SOUNDING],
    /// The notes started so far, which number the next.
    started: u32,
}

impl Sequencer {
    /// Stopped, with a pattern of 1 bar of 4/4 and every track's tree empty.
    pub const fn new() -> Self {
        Self {
            run: None,
            waiting_run: None,
            meter: Meter {
                tick: 0,
                bar: 0,
                bars: 1,
                signature: FOUR_FOUR,
            },
            waiting_meter: None,
            queued_meter: None,
            tracks: [Track {
                tree: Tree(None),
                cursor: Cursor::END,
                pass: 0,
                next: None,
            }; 4],
            beat: 0,
            due: 0,
            table: [None; SOUNDING],
            started: 0,
        }
    }

    /// Plays from `run`, starting or jumping: every note whose sample is the run's anchor or later
    /// is due. Notes sounding keep sounding. The latest waiting meter takes over at once and a
    /// waiting run is dropped; tick 0 of the run is the start of bar 0.
    pub fn play(&mut self, run: Run, notes: &NoteReader<'_>) {
        self.run = Some(run);
        self.waiting_run = None;
        self.due = run.tick;
        // A let, as the call borrows the whole sequencer.
        let latest = self
            .queued_meter
            .take()
            .or(self.waiting_meter)
            .unwrap_or(self.meter);
        self.take(
            Meter {
                tick: 0,
                bar: 0,
                ..latest
            },
            run.tick,
            notes,
        );
    }

    /// Ends every sounding note, then stops. The latest waiting meter takes over at once and a
    /// waiting run is dropped.
    pub fn stop(&mut self, mut out: impl FnMut(Event)) {
        for sounding in self.table.iter_mut().filter_map(Option::take) {
            out(Event::End(sounding));
        }
        self.run = None;
        self.waiting_run = None;
        self.meter = Meter {
            tick: 0,
            bar: 0,
            // Both are taken: `or`'s argument runs in any case.
            ..self
                .queued_meter
                .take()
                .or(self.waiting_meter.take())
                .unwrap_or(self.meter)
        };
    }

    /// Track `track` plays `tree` from its first note not yet due, so no note starts twice.
    pub fn switch(&mut self, track: u8, tree: Tree, notes: &NoteReader<'_>) {
        self.tracks[usize::from(track)].tree = tree;
        self.seek(usize::from(track), self.due, notes);
    }

    /// Stopped, the pattern takes `meter`'s bars and signature at once. Playing, `meter` waits for
    /// its tick, replacing a waiting one with the same tick or queueing behind one with an earlier
    /// tick, and every track then goes on from its bar; one whose tick has passed takes over at
    /// once from where the music is, so nothing before that starts (S14).
    pub fn meter(&mut self, meter: Meter, notes: &NoteReader<'_>) {
        if self.run.is_none() {
            self.meter = Meter {
                tick: 0,
                bar: 0,
                ..meter
            };
        } else if meter.tick < self.due {
            self.take(meter, self.due, notes);
        } else if self
            .waiting_meter
            .is_some_and(|waiting| waiting.tick < meter.tick)
        {
            // The player took the waiting one at its sample, which the audio part has not reached
            // (S19).
            self.queued_meter = Some(meter);
        } else {
            self.waiting_meter = Some(meter);
        }
    }

    /// Playing, `run` takes over at its tick, replacing a waiting one; one whose tick has passed
    /// takes over at once, and the notes and beats already given are not given again. Stopped,
    /// nothing.
    pub fn retime(&mut self, run: Run) {
        if self.run.is_some() {
            self.waiting_run = Some(run);
            self.take_passed_run();
        }
    }

    /// While playing, the run that goes on at `tempo` from the first tick after `sample`, counting
    /// a waiting run (S2).
    pub fn retimed(&self, sample: u64, tempo: u32) -> Run {
        let run = self
            .run
            .expect("a tempo change retimes only a playing sequencer (S2)");
        let tick = self.first_tick_after(run, sample);
        Run {
            anchor: self.sample(run, tick),
            tick,
            tempo,
        }
    }

    /// The tick of the bar line where a change from `sample` takes hold, and the bar that ends
    /// there: the latest waiting meter's tick, else the first bar line whose sample is `sample` or
    /// later (S13, S14). Only while playing, and that bar line must be past the tick of the meter
    /// in force.
    pub fn next_bar_line(&self, sample: u64) -> (u64, u16) {
        let run = self
            .run
            .expect("a change waits for a bar line only while playing (S13)");
        let Meter {
            tick, signature, ..
        } = self.meter;
        let bar_ticks = u64::from(signature.bar_ticks());
        let line = self.queued_meter.or(self.waiting_meter).map_or_else(
            || {
                let since = self.first_tick_after(run, sample - 1) - tick;
                tick + since.div_ceil(bar_ticks) * bar_ticks
            },
            |meter| meter.tick,
        );
        (line, self.meter_at(line - 1).locate(line - 1).1)
    }

    /// Every event due by `until`, in sample order: at one sample ends before starts (S14), and
    /// tracks in order, with the beat between them (S7). A waiting meter takes over at its tick
    /// before the events there, and a waiting run maps the ticks from its own on; a note's end goes
    /// by the run of its start, so a note sounding when a run takes over keeps its end. Then
    /// nothing at `until` or before is due again, and an `until` earlier than the one before leaves
    /// due what was. Each start takes the next number with the top bit set (S24); a full table
    /// first ends the note that ends soonest.
    pub fn advance(&mut self, until: u64, notes: &NoteReader<'_>, mut out: impl FnMut(Event)) {
        let Some(run) = self.run else { return };
        loop {
            let end = self
                .table
                .iter()
                .enumerate()
                .filter_map(|(slot, sounding)| Some((slot, (*sounding)?)))
                .min_by_key(|(_, sounding)| (sounding.end, sounding.track));
            let start = (0..self.tracks.len())
                .filter_map(|t| {
                    let (tick, note) = self.tracks[t].next?;
                    Some((self.sample(run, tick), t, tick, note))
                })
                .min_by_key(|&(sample, t, ..)| (sample, t));
            if let Some(meter) = self.waiting_meter.filter(|meter| {
                self.sample(run, meter.tick) <= until
                    && meter.tick <= self.beat
                    && start.is_none_or(|(_, _, tick, _)| meter.tick <= tick)
            }) {
                self.take(meter, meter.tick, notes);
                continue;
            }
            let beat = self.sample(run, self.beat);
            match (end, start) {
                (Some((slot, sounding)), start)
                    if sounding.end <= until
                        && sounding.end <= beat
                        && start.is_none_or(|(sample, ..)| sounding.end <= sample) =>
                {
                    self.table[slot] = None;
                    out(Event::End(sounding));
                }
                _ if beat <= until && start.is_none_or(|(sample, ..)| beat <= sample) => {
                    out(Event::Beat {
                        first: self.meter.locate(self.beat).2 == 0,
                    });
                    self.beat += self.meter.beat();
                }
                (end, Some((sample, t, tick, note))) if sample <= until => {
                    if let Some((slot, sounding)) =
                        end.filter(|_| self.table.iter().all(Option::is_some))
                    {
                        self.table[slot] = None;
                        out(Event::End(sounding));
                    }
                    let id = NoteId(0x8000_0000 | self.started);
                    self.started += 1;
                    *self
                        .table
                        .iter_mut()
                        .find(|slot| slot.is_none())
                        .expect("a full table has just ended a note") = Some(Sounding {
                        id,
                        end: self.run_at(run, tick).sample(tick + u64::from(note.length)),
                        track: t as u8,
                        sound: note.sound,
                        pitch: note.pitch,
                    });
                    out(Event::Start {
                        id,
                        track: t as u8,
                        note,
                    });
                    notes.advance(&mut self.tracks[t].cursor);
                    self.find_next(t, notes);
                }
                _ => break,
            }
        }
        self.due = self.due.max(self.first_tick_after(run, until));
        self.take_passed_run();
    }

    pub fn run(&self) -> Option<Run> {
        self.run
    }

    /// The tree track `track` plays.
    pub fn tree(&self, track: u8) -> Tree {
        self.tracks[usize::from(track)].tree
    }

    pub fn sounding(&self) -> impl Iterator<Item = &Sounding> {
        self.table.iter().flatten()
    }

    /// While playing, the bar and the place in it where the music is at `sample`: the tick before
    /// the first after `sample`, within the pattern, counting the waiting meters and run.
    /// `sample` is that of the last advance or later, so the meter in force holds it.
    pub fn at(&self, sample: u64) -> Option<(u16, u32)> {
        let tick = self.first_tick_after(self.run?, sample).saturating_sub(1);
        let (_, bar, place) = self.meter_at(tick).locate(tick);
        Some((bar, place))
    }

    /// The meter that holds `tick`, the meter in force's tick or later, counting the waiting ones.
    fn meter_at(&self, tick: u64) -> Meter {
        [self.queued_meter, self.waiting_meter]
            .into_iter()
            .flatten()
            .find(|meter| meter.tick <= tick)
            .unwrap_or(self.meter)
    }

    /// The sample of `tick`, `run`'s tick or later, with a waiting run from its tick on.
    fn sample(&self, run: Run, tick: u64) -> u64 {
        self.run_at(run, tick).sample(tick)
    }

    /// The run that times `tick`, `run`'s tick or later: a waiting run from its tick on.
    fn run_at(&self, run: Run, tick: u64) -> Run {
        self.waiting_run
            .filter(|waiting| waiting.tick <= tick)
            .unwrap_or(run)
    }

    /// The first tick whose sample is later than `sample`, with a waiting run from its tick on.
    fn first_tick_after(&self, run: Run, sample: u64) -> u64 {
        let tick = run.first_tick_after(sample);
        self.waiting_run
            .filter(|waiting| waiting.tick <= tick)
            .map_or(tick, |waiting| waiting.first_tick_after(sample))
    }

    /// A waiting run whose tick has passed takes over.
    fn take_passed_run(&mut self) {
        if let Some(run) = self.waiting_run.take_if(|run| run.tick < self.due) {
            self.run = Some(run);
        }
    }

    /// `meter` takes over and the queued meter waits in place of the waiting one; the tracks and
    /// the beats go on from tick `from`, the meter's tick or later.
    fn take(&mut self, meter: Meter, from: u64, notes: &NoteReader<'_>) {
        self.meter = meter;
        self.waiting_meter = self.queued_meter.take();
        self.beat = meter.tick + (from - meter.tick).div_ceil(meter.beat()) * meter.beat();
        for track in 0..self.tracks.len() {
            self.seek(track, from, notes);
        }
    }

    /// Puts track `t` at its first note at tick `from` or later, the meter's tick or later.
    fn seek(&mut self, t: usize, from: u64, notes: &NoteReader<'_>) {
        let (pass, bar, place) = self.meter.locate(from);
        let track = &mut self.tracks[t];
        track.pass = pass;
        track.cursor = notes.seek(track.tree, Key::at(bar, place as u16));
        self.find_next(t, notes);
    }

    /// Finds track `t`'s next start from its cursor, past the notes outside their bar or the
    /// pattern. At the pattern's end it goes on into the next pass once, so a tree with no note
    /// inside the pattern has none.
    fn find_next(&mut self, t: usize, notes: &NoteReader<'_>) {
        let meter = self.meter;
        let (bar_ticks, bars) = (u64::from(meter.signature.bar_ticks()), meter.bars);
        let track = &mut self.tracks[t];
        let mut wrapped = false;
        track.next = loop {
            match notes.peek(&track.cursor) {
                Some(note) if note.bar < bars && u64::from(note.place) < bar_ticks => {
                    // The cursor's pass holds the meter's bar, so this note is not before it.
                    break Some((
                        meter.tick
                            + (track.pass * u64::from(bars) + u64::from(note.bar)
                                - u64::from(meter.bar))
                                * bar_ticks
                            + u64::from(note.place),
                        note,
                    ));
                }
                Some(note) if note.bar < bars => {
                    track.cursor = notes.seek(track.tree, Key::at(note.bar + 1, 0));
                }
                _ if wrapped => break None,
                _ => {
                    track.pass += 1;
                    track.cursor = notes.seek(track.tree, Key::at(0, 0));
                    wrapped = true;
                }
            }
        };
    }
}

impl Default for Sequencer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{NoteRam, Store};
    use std::vec::Vec;

    const RUN: Run = Run {
        anchor: 0,
        tick: 0,
        tempo: 12_000,
    };

    const FOUR_BARS: Meter = Meter {
        tick: 0,
        bar: 0,
        bars: 4,
        signature: FOUR_FOUR,
    };

    /// From bar 1 at tick 7,680 on, 4 bars of 3/4.
    const THREE_FOUR: Meter = Meter {
        tick: 7_680,
        bar: 1,
        bars: 4,
        signature: Signature { beats: 3, unit: 4 },
    };

    /// A start of a track at a place, or an end at its sample.
    #[derive(Debug, PartialEq)]
    enum Heard {
        Start(u8, u16),
        End(u64),
    }

    struct Rig<'a> {
        store: Store<'a>,
        notes: NoteReader<'a>,
        sequencer: Sequencer,
    }

    impl<'a> Rig<'a> {
        /// A sequencer playing `track` on track 0 from `RUN`.
        fn new(ram: &'a NoteRam, track: impl IntoIterator<Item = Note>) -> Self {
            Self::with(
                ram,
                Meter {
                    bars: 1,
                    ..FOUR_BARS
                },
                track,
            )
        }

        /// A sequencer given `meter` while stopped, then playing `track` on track 0 from `RUN`.
        #[allow(unsafe_code)]
        fn with(ram: &'a NoteRam, meter: Meter, track: impl IntoIterator<Item = Note>) -> Self {
            // SAFETY: the rig is the only store and the only reader.
            let (store, notes) = unsafe { (ram.store(), ram.reader()) };
            let mut rig = Self {
                store,
                notes,
                sequencer: Sequencer::new(),
            };
            rig.sequencer.meter(meter, &rig.notes);
            rig.switch(0, track);
            rig.sequencer.play(RUN, &rig.notes);
            rig
        }

        /// Track `track` plays a held tree of `notes`.
        fn switch(&mut self, track: u8, notes: impl IntoIterator<Item = Note>) {
            let tree = notes
                .into_iter()
                .fold(Tree(None), |tree, note| self.store.insert(tree, note).0);
            self.store.hold(tree);
            self.sequencer.switch(track, tree, &self.notes);
        }

        fn events(&mut self, until: u64) -> Vec<Event> {
            let mut events = Vec::new();
            self.sequencer
                .advance(until, &self.notes, |event| events.push(event));
            events
        }

        /// The starts and ends by `until`, without the beats.
        fn heard(&mut self, until: u64) -> Vec<Heard> {
            self.events(until)
                .into_iter()
                .filter_map(|event| match event {
                    Event::Start { track, note, .. } => Some(Heard::Start(track, note.place)),
                    Event::End(sounding) => Some(Heard::End(sounding.end)),
                    Event::Beat { .. } => None,
                })
                .collect()
        }
    }

    /// A note at bar 0, place `k × 480`, length 480, of sound 1 at pitch 60.
    fn step(k: u16) -> Note {
        Note {
            bar: 0,
            place: k * 480,
            length: 480,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 127,
            curve: None,
        }
    }

    #[test]
    fn ticks_become_samples_rounded_down() {
        let run = Run {
            anchor: 1_000,
            tick: 0,
            tempo: 12_000,
        };

        assert_eq!(
            [run.sample(0), run.sample(1), run.sample(2), run.sample(480)],
            [1_000, 1_012, 1_025, 7_000]
        );
        assert_eq!(run.first_tick_after(999), 0);
        assert_eq!(run.first_tick_after(1_000), 1);
        assert_eq!(run.first_tick_after(1_012), 2);
        assert_eq!(run.first_tick_after(6_999), 480);
    }

    #[test]
    fn a_bar_of_4_4_is_7_680_ticks_and_7_8_is_6_720() {
        let seven_eight = Signature { beats: 7, unit: 8 };

        assert_eq!([FOUR_FOUR.bar_ticks(), FOUR_FOUR.sixteenths()], [7_680, 16]);
        assert_eq!(
            [seven_eight.bar_ticks(), seven_eight.sixteenths()],
            [6_720, 14]
        );
    }

    #[test]
    fn notes_start_at_their_sample_and_end_after_their_length() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(4)]);

        assert_eq!(rig.heard(0), [Heard::Start(0, 0)]);
        assert_eq!(rig.heard(5_999), []);
        assert_eq!(rig.heard(6_000), [Heard::End(6_000)]);
        assert_eq!(rig.heard(23_999), []);
        assert_eq!(rig.heard(24_000), [Heard::Start(0, 1_920)]);
    }

    #[test]
    fn the_pattern_loops_with_no_gap() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0)]);

        assert_eq!(rig.heard(0), [Heard::Start(0, 0)]);
        assert_eq!(rig.heard(95_999), [Heard::End(6_000)]);
        assert_eq!(rig.heard(96_000), [Heard::Start(0, 0)]);
        assert_eq!(rig.heard(191_999), [Heard::End(102_000)]);
        assert_eq!(rig.heard(192_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn at_one_sample_ends_go_before_starts() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(1)]);
        rig.switch(1, [step(1)]);

        assert_eq!(rig.heard(0), [Heard::Start(0, 0)]);
        // Then tracks in order.
        assert_eq!(
            rig.heard(6_000),
            [
                Heard::End(6_000),
                Heard::Start(0, 480),
                Heard::Start(1, 480)
            ]
        );
    }

    #[test]
    fn a_note_over_the_loop_point_keeps_its_end() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(
            &ram,
            [Note {
                length: 960,
                ..step(15)
            }],
        );

        assert_eq!(rig.heard(89_999), []);
        assert_eq!(rig.heard(90_000), [Heard::Start(0, 7_200)]);
        assert_eq!(rig.heard(101_999), []);
        assert_eq!(rig.heard(102_000), [Heard::End(102_000)]);
        assert_eq!(rig.heard(185_999), []);
        assert_eq!(rig.heard(186_000), [Heard::Start(0, 7_200)]);
    }

    #[test]
    fn a_late_play_starts_the_notes_it_missed_in_its_first_chunk() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(1)]);

        assert_eq!(
            rig.heard(7_000),
            [Heard::Start(0, 0), Heard::End(6_000), Heard::Start(0, 480)]
        );
        assert_eq!(rig.heard(11_999), []);
        assert_eq!(rig.heard(12_000), [Heard::End(12_000)]);
    }

    #[test]
    fn a_switch_starts_no_note_twice() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(8)]);
        rig.heard(10_000);

        rig.switch(0, [step(0), step(4), step(8)]);

        assert_eq!(rig.heard(23_999), []);
        assert_eq!(
            rig.heard(48_000),
            [
                Heard::Start(0, 1_920),
                Heard::End(30_000),
                Heard::Start(0, 3_840)
            ]
        );
    }

    #[test]
    fn an_advance_to_an_earlier_sample_leaves_a_switch_starting_nothing_twice() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(1)]);
        rig.heard(7_000);
        // An input stamped before the step before's end.
        assert_eq!(rig.heard(3_000), []);

        rig.switch(0, [step(0), step(1), step(2)]);

        assert_eq!(
            rig.heard(12_000),
            [Heard::End(12_000), Heard::Start(0, 960)]
        );
    }

    #[test]
    fn a_jump_starts_from_its_run() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(4)]);
        rig.heard(10_000);
        let jump = Run {
            anchor: 30_000,
            tick: 1_920,
            tempo: 12_000,
        };

        rig.sequencer.play(jump, &rig.notes);

        assert_eq!(rig.heard(29_999), []);
        assert_eq!(rig.heard(30_000), [Heard::Start(0, 1_920)]);
    }

    #[test]
    fn stop_ends_every_sounding_note() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(
            &ram,
            [
                step(0),
                Note {
                    pitch: 64,
                    ..step(0)
                },
            ],
        );
        rig.heard(0);
        let mut ended = Vec::new();

        rig.sequencer.stop(|event| ended.push(event));

        let pitches: Vec<u8> = ended
            .iter()
            .map(|event| match event {
                Event::End(sounding) => sounding.pitch,
                Event::Start { .. } | Event::Beat { .. } => panic!("stop started {event:?}"),
            })
            .collect();
        assert_eq!(pitches, [60, 64]);
        assert_eq!(rig.sequencer.sounding().count(), 0);
        assert_eq!(rig.sequencer.run(), None);
        assert_eq!(rig.heard(200_000), []);
    }

    #[test]
    fn notes_past_their_bar_or_the_pattern_are_skipped() {
        let ram = NoteRam::boxed();
        let outside = [
            Note {
                place: 7_680,
                ..step(0)
            },
            Note { bar: 1, ..step(0) },
        ];
        let mut rig = Rig::new(&ram, [step(0)].into_iter().chain(outside));
        // A tree with no note inside the pattern.
        rig.switch(1, outside);

        assert_eq!(rig.heard(0), [Heard::Start(0, 0)]);
        assert_eq!(
            rig.heard(191_999),
            [Heard::End(6_000), Heard::Start(0, 0), Heard::End(102_000)]
        );
    }

    #[test]
    fn a_full_table_ends_the_note_that_ends_soonest() {
        let ram = NoteRam::boxed();
        let sound_1 = (0..=127).map(|pitch| Note {
            length: 1_000 + u32::from(pitch),
            pitch,
            ..step(0)
        });
        let last = Note {
            length: 1_128,
            sound: SoundNumber(2),
            pitch: 0,
            ..step(0)
        };
        let mut rig = Rig::new(&ram, sound_1.chain([last]));

        // After the bar's first beat.
        let events = &rig.events(0)[1..];

        assert_eq!(events.len(), 130);
        assert!(
            matches!(
                events[128],
                Event::End(Sounding {
                    end: 12_500,
                    sound: SoundNumber(1),
                    pitch: 0,
                    ..
                })
            ),
            "{:?}",
            events[128]
        );
        assert!(
            matches!(events[129], Event::Start { note, .. } if note == last),
            "{:?}",
            events[129]
        );
        assert_eq!(rig.sequencer.sounding().count(), SOUNDING);
    }

    #[test]
    fn sequencer_ids_have_the_top_bit_set() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::new(&ram, [step(0), step(1)]);

        assert_eq!(
            rig.events(6_000),
            [
                Event::Beat { first: true },
                Event::Start {
                    id: NoteId(0x8000_0000),
                    track: 0,
                    note: step(0)
                },
                Event::End(Sounding {
                    id: NoteId(0x8000_0000),
                    end: 6_000,
                    track: 0,
                    sound: SoundNumber(1),
                    pitch: 60
                }),
                Event::Start {
                    id: NoteId(0x8000_0001),
                    track: 0,
                    note: step(1)
                },
            ]
        );
    }

    #[test]
    fn at_gives_the_bar_and_place_of_the_music() {
        let ram = NoteRam::boxed();
        assert_eq!(Sequencer::new().at(6_000), None);
        let mut rig = Rig::new(&ram, []);

        assert_eq!(rig.sequencer.at(6_000), Some((0, 480)));
        assert_eq!(rig.sequencer.at(96_011), Some((0, 0)));
        assert_eq!(rig.sequencer.at(96_012), Some((0, 1)));
        rig.sequencer.stop(|_| {});
        assert_eq!(rig.sequencer.at(6_000), None);
    }

    #[test]
    fn beats_come_every_quarter_in_4_4_and_every_eighth_in_7_8() {
        let (first, other) = (Event::Beat { first: true }, Event::Beat { first: false });
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, []);

        assert_eq!(rig.events(0), [first]);
        assert_eq!(rig.events(23_999), []);
        assert_eq!(rig.events(24_000), [other]);
        assert_eq!(rig.events(72_000), [other, other]);
        assert_eq!(rig.events(95_999), []);
        assert_eq!(rig.events(96_000), [first]);

        let ram = NoteRam::boxed();
        let mut rig = Rig::with(
            &ram,
            Meter {
                signature: Signature { beats: 7, unit: 8 },
                ..FOUR_BARS
            },
            [],
        );

        assert_eq!(rig.events(0), [first]);
        assert_eq!(rig.events(11_999), []);
        assert_eq!(rig.events(12_000), [other]);
        assert_eq!(rig.events(83_999), [other; 5]);
        assert_eq!(rig.events(84_000), [first]);
    }

    #[test]
    fn beats_go_in_sample_order_after_ends_and_before_starts() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(
            &ram,
            FOUR_BARS,
            [
                step(3),
                Note {
                    length: 4_800,
                    ..step(4)
                },
            ],
        );
        rig.heard(23_999);

        let events = rig.events(24_000);
        assert!(
            matches!(
                events[..],
                [
                    Event::End(_),
                    Event::Beat { first: false },
                    Event::Start { .. }
                ]
            ),
            "{events:?}"
        );
        let events = rig.events(84_000);
        assert!(
            matches!(
                events[..],
                [Event::Beat { .. }, Event::Beat { .. }, Event::End(_)]
            ),
            "{events:?}"
        );
    }

    #[test]
    fn retimed_goes_on_from_the_first_tick_after() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, []);

        assert_eq!(
            rig.sequencer.retimed(3_000, 6_000),
            Run {
                anchor: 3_012,
                tick: 241,
                tempo: 6_000
            }
        );
        // Counting a waiting run.
        rig.sequencer.retime(Run {
            anchor: 3_012,
            tick: 241,
            tempo: 6_000,
        });
        assert_eq!(
            rig.sequencer.retimed(28_012, 12_000),
            Run {
                anchor: 28_037,
                tick: 1_242,
                tempo: 12_000
            }
        );
    }

    #[test]
    fn a_tempo_change_keeps_sounding_ends_and_moves_the_rest() {
        let ram = NoteRam::boxed();
        let long = |k| Note {
            length: 960,
            ..step(k)
        };
        let mut rig = Rig::with(&ram, FOUR_BARS, [long(0), long(4)]);
        assert_eq!(rig.heard(3_000), [Heard::Start(0, 0)]);

        let run = rig.sequencer.retimed(3_000, 6_000);
        rig.sequencer.retime(run);

        assert_eq!(rig.heard(44_986), [Heard::End(12_000)]);
        assert_eq!(rig.heard(44_987), [Heard::Start(0, 1_920)]);
    }

    #[test]
    fn a_note_starting_before_a_waiting_run_keeps_its_end() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [step(1)]);
        rig.heard(5_984);

        // As the audio part does: the run arrives at a chunk start before the note starts.
        rig.sequencer.retime(rig.sequencer.retimed(6_005, 6_000));

        assert_eq!(rig.heard(6_016), [Heard::Start(0, 480)]);
        assert_eq!(rig.heard(17_986), [Heard::End(12_000)]);
    }

    #[test]
    fn a_late_tempo_change_starts_nothing_twice() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [step(0), step(4), step(8)]);
        rig.heard(30_000);

        rig.sequencer.retime(Run {
            anchor: 3_012,
            tick: 241,
            tempo: 6_000,
        });

        assert_eq!(rig.heard(92_986), []);
        assert_eq!(rig.heard(92_987), [Heard::Start(0, 3_840)]);
    }

    #[test]
    fn a_meter_takes_over_at_its_bar_line() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(
            &ram,
            FOUR_BARS,
            [
                step(12),
                Note { bar: 1, ..step(0) },
                Note { bar: 1, ..step(12) },
                Note { bar: 2, ..step(0) },
            ],
        );
        rig.heard(50_000);

        rig.sequencer.meter(THREE_FOUR, &rig.notes);

        assert_eq!(rig.heard(71_999), []);
        assert_eq!(rig.heard(72_000), [Heard::Start(0, 5_760)]);
        assert_eq!(rig.heard(95_999), [Heard::End(78_000)]);
        assert_eq!(rig.heard(96_000), [Heard::Start(0, 0)]);
        // Bar 1's note at place 5,760 never starts.
        assert_eq!(rig.heard(167_999), [Heard::End(102_000)]);
        assert_eq!(rig.heard(168_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn a_meter_takes_over_after_what_comes_before_its_tick_in_one_advance() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [step(12), Note { bar: 1, ..step(0) }]);
        rig.sequencer.meter(THREE_FOUR, &rig.notes);

        let events = rig.events(96_000);

        assert!(
            matches!(
                events[..],
                [
                    ..,
                    Event::Start {
                        note: Note { place: 5_760, .. },
                        ..
                    },
                    Event::End(_),
                    Event::Beat { first: true },
                    Event::Start {
                        note: Note { bar: 1, .. },
                        ..
                    }
                ]
            ),
            "{events:?}"
        );
        let (first, other) = (Event::Beat { first: true }, Event::Beat { first: false });
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, []);
        rig.sequencer.meter(THREE_FOUR, &rig.notes);

        assert_eq!(rig.events(96_000), [first, other, other, other, first]);
    }

    #[test]
    fn a_shorter_length_wraps_to_bar_1_at_the_bar_line() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [step(0)]);
        // In bar index 2.
        rig.heard(200_000);

        rig.sequencer.meter(
            Meter {
                tick: 23_040,
                bar: 0,
                bars: 2,
                signature: FOUR_FOUR,
            },
            &rig.notes,
        );

        assert_eq!(rig.heard(287_999), []);
        assert_eq!(rig.heard(288_000), [Heard::Start(0, 0)]);
        assert_eq!(rig.heard(479_999), [Heard::End(294_000)]);
        assert_eq!(rig.heard(480_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn a_later_meter_replaces_a_waiting_one() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [Note { bar: 2, ..step(0) }]);

        rig.sequencer.meter(THREE_FOUR, &rig.notes);
        rig.sequencer.meter(
            Meter {
                signature: Signature { beats: 7, unit: 8 },
                ..THREE_FOUR
            },
            &rig.notes,
        );

        assert_eq!(rig.heard(179_999), []);
        assert_eq!(rig.heard(96_000 + 84_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn a_meter_coming_while_another_waits_for_an_earlier_bar_line_plays_as_the_player_has_it() {
        // The player advances to each input's sample before its meter, so it has taken the first
        // meter at its bar line; the audio part is still at the chunk start before (S19).
        let heard = |behind: u64| {
            let ram = NoteRam::boxed();
            let mut rig = Rig::with(&ram, FOUR_BARS, (0..4).map(|bar| Note { bar, ..step(0) }));
            let mut events = rig.events(200_000 - behind);
            rig.sequencer.meter(
                Meter {
                    tick: 23_040,
                    bar: 0,
                    bars: 2,
                    signature: FOUR_FOUR,
                },
                &rig.notes,
            );
            events.extend(rig.events(288_000 - behind));
            rig.sequencer.meter(
                Meter {
                    tick: 30_720,
                    bar: 1,
                    bars: 2,
                    signature: THREE_FOUR.signature,
                },
                &rig.notes,
            );
            events.extend(rig.events(600_000));
            events
        };

        assert_eq!(heard(32), heard(0));
    }

    #[test]
    fn a_late_meter_takes_over_where_the_music_is() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(
            &ram,
            FOUR_BARS,
            [
                Note { bar: 1, ..step(0) },
                Note { bar: 1, ..step(4) },
                Note { bar: 2, ..step(0) },
            ],
        );
        assert_eq!(rig.heard(100_000), [Heard::Start(0, 0)]);

        rig.sequencer.meter(THREE_FOUR, &rig.notes);

        assert_eq!(rig.heard(119_999), [Heard::End(102_000)]);
        assert_eq!(rig.heard(120_000), [Heard::Start(0, 1_920)]);
        // Bar 2 follows bar 1's 3/4.
        assert_eq!(rig.heard(167_999), [Heard::End(126_000)]);
        assert_eq!(rig.heard(168_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn while_stopped_a_meter_applies_at_once() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [Note { bar: 1, ..step(0) }]);
        rig.sequencer.stop(|_| {});

        rig.sequencer.meter(THREE_FOUR, &rig.notes);
        rig.sequencer.play(RUN, &rig.notes);

        assert_eq!(rig.heard(71_999), []);
        assert_eq!(rig.heard(72_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn play_takes_a_waiting_meter_at_once() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [Note { bar: 1, ..step(0) }]);
        rig.sequencer.meter(THREE_FOUR, &rig.notes);

        rig.sequencer.play(
            Run {
                anchor: 50_000,
                tick: 0,
                tempo: 12_000,
            },
            &rig.notes,
        );

        assert_eq!(rig.heard(121_999), []);
        assert_eq!(rig.heard(122_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn play_takes_the_latest_waiting_meter_and_leaves_none_waiting() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, [Note { bar: 1, ..step(0) }]);
        rig.sequencer.meter(THREE_FOUR, &rig.notes);
        rig.sequencer.meter(
            Meter {
                tick: 19_200,
                bar: 3,
                signature: Signature { beats: 7, unit: 8 },
                ..THREE_FOUR
            },
            &rig.notes,
        );

        rig.sequencer.play(RUN, &rig.notes);

        assert_eq!(rig.heard(83_999), []);
        assert_eq!(rig.heard(84_000), [Heard::Start(0, 0)]);
        assert_eq!(rig.heard(419_999), [Heard::End(90_000)]);
        assert_eq!(rig.heard(420_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn stop_takes_a_waiting_meter_at_once() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, []);
        rig.sequencer.meter(THREE_FOUR, &rig.notes);

        rig.sequencer.stop(|_| {});
        // A switch while stopped seeks with the meter taken.
        rig.switch(0, [Note { bar: 1, ..step(0) }]);
        rig.sequencer.play(RUN, &rig.notes);

        assert_eq!(rig.heard(71_999), []);
        assert_eq!(rig.heard(72_000), [Heard::Start(0, 0)]);
    }

    #[test]
    fn notes_past_the_bar_or_the_length_of_the_meter_are_skipped() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(
            &ram,
            Meter {
                bars: 2,
                signature: THREE_FOUR.signature,
                ..FOUR_BARS
            },
            [step(0), step(12), Note { bar: 2, ..step(4) }],
        );

        assert_eq!(rig.heard(0), [Heard::Start(0, 0)]);
        // Place 5,760 never starts.
        assert_eq!(rig.heard(143_999), [Heard::End(6_000)]);
        assert_eq!(rig.heard(144_000), [Heard::Start(0, 0)]);
        // Nor does bar 2.
        assert_eq!(rig.heard(287_999), [Heard::End(150_000)]);
    }

    #[test]
    fn next_bar_line_and_at_count_a_waiting_change() {
        let ram = NoteRam::boxed();
        let mut rig = Rig::with(&ram, FOUR_BARS, []);

        assert_eq!(rig.sequencer.next_bar_line(51_024), (7_680, 0));
        assert_eq!(rig.sequencer.next_bar_line(96_524), (15_360, 1));
        rig.sequencer.meter(THREE_FOUR, &rig.notes);
        assert_eq!(rig.sequencer.next_bar_line(96_524), (7_680, 0));
        assert_eq!(rig.sequencer.at(100_000), Some((1, 320)));
        // In bar 2 of the waiting 3/4, still bar 1 of the 4/4.
        assert_eq!(rig.sequencer.at(170_000), Some((2, 160)));
        // A meter queued behind it, from the 3/4's fourth bar line on.
        rig.sequencer.meter(
            Meter {
                tick: 30_720,
                bar: 1,
                bars: 4,
                signature: FOUR_FOUR,
            },
            &rig.notes,
        );
        assert_eq!(rig.sequencer.next_bar_line(96_524), (30_720, 0));
        assert_eq!(rig.sequencer.at(170_000), Some((2, 160)));
        assert_eq!(rig.sequencer.at(459_000), Some((1, 6_000)));
        // A waiting run.
        rig.sequencer.retime(Run {
            anchor: 3_012,
            tick: 241,
            tempo: 6_000,
        });
        assert_eq!(rig.sequencer.at(28_012), Some((0, 1_241)));
    }
}
