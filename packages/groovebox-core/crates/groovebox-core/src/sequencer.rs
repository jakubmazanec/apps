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

/// A started note until its end.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Sounding {
    pub id: NoteId,
    pub end: u64,
    pub track: u8,
    pub sound: SoundNumber,
    pub pitch: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Start { id: NoteId, track: u8, note: Note },
    End(Sounding),
}

/// A track's tree and where it plays.
#[derive(Clone, Copy)]
struct Track {
    tree: Tree,
    /// At the note it starts next.
    cursor: Cursor,
    /// The pass of the pattern the cursor is in, from 0.
    pass: u64,
    /// The tick and the note of the next start: none for a tree with no note inside the pattern.
    next: Option<(u64, Note)>,
}

/// Walks the tracks' trees in time: starts their notes, ends them after their length and loops
/// the pattern.
pub struct Sequencer {
    /// None while stopped.
    run: Option<Run>,
    bars: u16,
    signature: Signature,
    tracks: [Track; 4],
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
            bars: 1,
            signature: FOUR_FOUR,
            tracks: [Track {
                tree: Tree(None),
                cursor: Cursor::END,
                pass: 0,
                next: None,
            }; 4],
            due: 0,
            table: [None; SOUNDING],
            started: 0,
        }
    }

    /// Plays from `run`, starting or jumping: every note whose sample is the run's anchor or later
    /// is due. Notes sounding keep sounding.
    pub fn play(&mut self, run: Run, notes: &NoteReader<'_>) {
        self.run = Some(run);
        self.due = run.tick;
        for track in 0..self.tracks.len() {
            self.seek(track, notes);
        }
    }

    /// Ends every sounding note, then stops.
    pub fn stop(&mut self, mut out: impl FnMut(Event)) {
        for sounding in self.table.iter_mut().filter_map(Option::take) {
            out(Event::End(sounding));
        }
        self.run = None;
    }

    /// Track `track` plays `tree` from its first note not yet due, so no note starts twice.
    pub fn switch(&mut self, track: u8, tree: Tree, notes: &NoteReader<'_>) {
        self.tracks[usize::from(track)].tree = tree;
        self.seek(usize::from(track), notes);
    }

    /// Every event due by `until`, in sample order: at one sample ends before starts (S14), and
    /// tracks in order. Then nothing at `until` or before is due again, and an `until` earlier than
    /// the one before leaves due what was. Each start takes the next number with the top bit set
    /// (S24); a full table first ends the note that ends soonest.
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
                    Some((run.sample(tick), t, tick, note))
                })
                .min_by_key(|&(sample, t, ..)| (sample, t));
            match (end, start) {
                (Some((slot, sounding)), start)
                    if sounding.end <= until
                        && start.is_none_or(|(sample, ..)| sounding.end <= sample) =>
                {
                    self.table[slot] = None;
                    out(Event::End(sounding));
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
                        end: run.sample(tick + u64::from(note.length)),
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
        self.due = self.due.max(run.first_tick_after(until));
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
    /// the first after `sample`, within the pattern.
    pub fn at(&self, sample: u64) -> Option<(u16, u32)> {
        let bar_ticks = u64::from(self.signature.bar_ticks());
        let tick = self.run?.first_tick_after(sample).saturating_sub(1) % self.pattern_ticks();
        Some(((tick / bar_ticks) as u16, (tick % bar_ticks) as u32))
    }

    fn pattern_ticks(&self) -> u64 {
        u64::from(self.bars) * u64::from(self.signature.bar_ticks())
    }

    /// Puts track `t` at its first note at the due tick or later.
    fn seek(&mut self, t: usize, notes: &NoteReader<'_>) {
        let (bar_ticks, pattern) = (u64::from(self.signature.bar_ticks()), self.pattern_ticks());
        let at = self.due % pattern;
        let track = &mut self.tracks[t];
        track.pass = self.due / pattern;
        track.cursor = notes.seek(
            track.tree,
            Key::at((at / bar_ticks) as u16, (at % bar_ticks) as u16),
        );
        self.find_next(t, notes);
    }

    /// Finds track `t`'s next start from its cursor, past the notes outside their bar or the
    /// pattern. At the pattern's end it goes on into the next pass once, so a tree with no note
    /// inside the pattern has none.
    fn find_next(&mut self, t: usize, notes: &NoteReader<'_>) {
        let (bar_ticks, pattern) = (u64::from(self.signature.bar_ticks()), self.pattern_ticks());
        let bars = self.bars;
        let track = &mut self.tracks[t];
        let mut wrapped = false;
        track.next = loop {
            match notes.peek(&track.cursor) {
                Some(note) if note.bar < bars && u64::from(note.place) < bar_ticks => {
                    break Some((
                        track.pass * pattern
                            + u64::from(note.bar) * bar_ticks
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
        #[allow(unsafe_code)]
        fn new(ram: &'a NoteRam, track: impl IntoIterator<Item = Note>) -> Self {
            // SAFETY: the rig is the only store and the only reader.
            let (store, notes) = unsafe { (ram.store(), ram.reader()) };
            let mut rig = Self {
                store,
                notes,
                sequencer: Sequencer::new(),
            };
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

        fn heard(&mut self, until: u64) -> Vec<Heard> {
            self.events(until)
                .into_iter()
                .map(|event| match event {
                    Event::Start { track, note, .. } => Heard::Start(track, note.place),
                    Event::End(sounding) => Heard::End(sounding.end),
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
                Event::Start { .. } => panic!("stop started {event:?}"),
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

        let events = rig.events(0);

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
}
