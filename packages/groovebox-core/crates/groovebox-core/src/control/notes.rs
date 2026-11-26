use crate::input::PADS;
use crate::message::NoteId;
use crate::project::pool::SoundNumber;
use crate::store::curve::Curve;

/// Where a note comes from: a pad or a MIDI note. A source has at most one note on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Pad(u8),
    Midi(u8),
}

/// What a hit while recording will put in its track's tree once it ends (S9, S10).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Take {
    /// The pattern current at the hit.
    pub pattern: u8,
    pub sound: SoundNumber,
    pub velocity: u8,
    /// The run's tick of the hit's sample less the output delay.
    pub tick: u64,
    /// Where it starts: snapped with QUANTIZE on, at `tick` with it off.
    pub bar: u16,
    pub place: u16,
    /// The sample of the start in its pass (S12).
    pub due: u64,
    /// Whether pressure came since the hit: a curve starts only at the first (S15).
    pub pressed: bool,
    /// The pressure since the hit, when the first found room for it (S15).
    pub curve: Option<Curve>,
}

/// A note that is on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Note {
    pub id: NoteId,
    /// The track it plays on, 0 to 3.
    pub track: u8,
    /// The pad it was hit as in PADS mode, or `None` for a key of KEYS mode.
    pub pad: Option<u8>,
    pub pitch: u8,
    /// What it records, while it does.
    pub take: Option<Take>,
}

/// The notes that are on, by source: at most one for each of the 12 pads and the 128 MIDI notes.
/// It gives every note its ID, counting up from 0 and never reusing one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notes {
    pads: [Option<Note>; PADS as usize],
    /// By MIDI note, 0 to 127.
    midi: [Option<Note>; 128],
    /// The notes ended whose takes wait to go in, with the tick each ended at: at most one for
    /// each source, the pads' first.
    waiting: [Option<(Note, u64)>; PADS as usize + 128],
    /// The ID of the next note.
    next: u32,
}

impl Notes {
    pub const fn new() -> Self {
        Self {
            pads: [None; PADS as usize],
            midi: [None; 128],
            waiting: [None; PADS as usize + 128],
            next: 0,
        }
    }

    /// Starts a note from `source` with its take and returns its ID, or `None` when the source has
    /// a note on, which then stays its only one.
    pub fn start(
        &mut self,
        source: Source,
        track: u8,
        pad: Option<u8>,
        pitch: u8,
        take: Option<Take>,
    ) -> Option<NoteId> {
        let id = NoteId(self.next);
        let slot = self.slot(source);
        if slot.is_some() {
            return None;
        }
        *slot = Some(Note {
            id,
            track,
            pad,
            pitch,
            take,
        });
        self.next += 1;
        Some(id)
    }

    /// Ends the note of `source` and gives it, or `None` when it has none on.
    pub fn end(&mut self, source: Source) -> Option<Note> {
        self.slot(source).take()
    }

    /// The take of the note of `source`, while it has one on that records.
    pub fn take_mut(&mut self, source: Source) -> Option<&mut Take> {
        self.slot(source).as_mut()?.take.as_mut()
    }

    /// The notes on that record.
    pub fn taken(&mut self) -> impl Iterator<Item = &mut Note> {
        self.pads
            .iter_mut()
            .chain(&mut self.midi)
            .flatten()
            .filter(|note| note.take.is_some())
    }

    /// Keeps `note` of `source`, ended at tick `end`, waiting with its take, and gives the note of
    /// `source` that waited before.
    pub fn wait(&mut self, source: Source, note: Note, end: u64) -> Option<(Note, u64)> {
        self.waiting[match source {
            Source::Pad(pad) => usize::from(pad),
            Source::Midi(midi) => PADS as usize + usize::from(midi),
        }]
        .replace((note, end))
    }

    /// Ends the takes of the notes on at tick `end`, while none waits: each waits with its note
    /// (`wait`), and the note stays on without it.
    pub fn end_takes(&mut self, end: u64) {
        for (on, waiting) in self
            .pads
            .iter_mut()
            .chain(&mut self.midi)
            .zip(&mut self.waiting)
        {
            if let Some(note) = on
                && note.take.is_some()
            {
                *waiting = Some((*note, end));
                note.take = None;
            }
        }
    }

    /// Every source's place for a note that waits with its take (`wait`).
    pub fn waiting(&mut self) -> impl Iterator<Item = &mut Option<(Note, u64)>> {
        self.waiting.iter_mut()
    }

    /// The pads whose own hit has a note on, held from the hit to its release.
    pub fn held_pads(&self) -> impl Iterator<Item = u8> {
        (0..PADS).filter(|&pad| self.pads[usize::from(pad)].is_some())
    }

    /// The notes of MIDI notes that are on.
    pub fn midi(&self) -> impl Iterator<Item = &Note> {
        self.midi.iter().flatten()
    }

    fn slot(&mut self, source: Source) -> &mut Option<Note> {
        match source {
            Source::Pad(pad) => &mut self.pads[usize::from(pad)],
            Source::Midi(note) => &mut self.midi[usize::from(note)],
        }
    }
}

impl Default for Notes {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::vec::Vec;

    fn ids(notes: &Notes) -> Vec<u32> {
        notes
            .pads
            .iter()
            .chain(&notes.midi)
            .flatten()
            .map(|note| note.id.0)
            .collect()
    }

    #[test]
    fn a_source_has_one_note_on_at_a_time() {
        let mut notes = Notes::new();

        assert_eq!(
            notes.start(Source::Pad(3), 0, Some(3), 60, None),
            Some(NoteId(0))
        );
        assert_eq!(notes.start(Source::Pad(3), 1, None, 64, None), None);
        assert_eq!(
            notes.start(Source::Midi(3), 0, Some(3), 60, None),
            Some(NoteId(1))
        );

        assert_eq!(notes.held_pads().collect::<Vec<_>>(), [3]);
        assert_eq!(
            notes.midi().copied().collect::<Vec<_>>(),
            [Note {
                id: NoteId(1),
                track: 0,
                pad: Some(3),
                pitch: 60,
                take: None
            }]
        );
    }

    #[test]
    fn ending_a_note_frees_its_source_and_its_id_is_never_given_again() {
        let mut notes = Notes::new();
        notes.start(Source::Midi(127), 2, None, 119, None);

        assert_eq!(
            notes.end(Source::Midi(127)).map(|note| note.id),
            Some(NoteId(0))
        );
        assert_eq!(notes.end(Source::Midi(127)), None);
        assert_eq!(notes.end(Source::Pad(0)), None);
        assert_eq!(ids(&notes), []);
        assert_eq!(
            notes.start(Source::Midi(127), 2, None, 119, None),
            Some(NoteId(1))
        );
    }

    #[test]
    fn every_pad_and_every_midi_note_can_have_a_note_on_at_once() {
        let mut notes = Notes::new();

        for pad in 0..PADS {
            assert!(
                notes
                    .start(Source::Pad(pad), 0, Some(pad), 60, None)
                    .is_some()
            );
        }
        for note in 0..=127 {
            assert!(
                notes
                    .start(Source::Midi(note), 0, None, note, None)
                    .is_some()
            );
        }

        assert_eq!(ids(&notes), (0..140).collect::<Vec<_>>());
    }

    #[test]
    fn the_notes_that_record_carry_their_take_to_their_end() {
        let mut notes = Notes::new();
        let take = Take {
            pattern: 0,
            sound: SoundNumber(1),
            velocity: 100,
            tick: 472,
            bar: 0,
            place: 480,
            due: 6_000,
            pressed: false,
            curve: None,
        };
        notes.start(Source::Pad(0), 3, Some(0), 60, Some(take));
        notes.start(Source::Midi(64), 3, None, 64, None);

        assert_eq!(notes.take_mut(Source::Midi(64)), None);
        assert_eq!(notes.take_mut(Source::Midi(65)), None);
        notes.take_mut(Source::Pad(0)).unwrap().velocity = 50;
        let taken = Take {
            velocity: 50,
            ..take
        };
        assert_eq!(
            notes.taken().map(|note| note.take).collect::<Vec<_>>(),
            [Some(taken)]
        );
        assert_eq!(notes.end(Source::Pad(0)).unwrap().take, Some(taken));
        assert_eq!(notes.taken().count(), 0);
    }
}
