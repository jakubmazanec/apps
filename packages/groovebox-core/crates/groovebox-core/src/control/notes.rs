use crate::input::PADS;
use crate::message::NoteId;

/// Where a note comes from: a pad or a MIDI note. A source has at most one note on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Pad(u8),
    Midi(u8),
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
}

/// The notes that are on, by source: at most one for each of the 12 pads and the 128 MIDI notes.
/// It gives every note its ID, counting up from 0 and never reusing one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notes {
    pads: [Option<Note>; PADS as usize],
    /// By MIDI note, 0 to 127.
    midi: [Option<Note>; 128],
    /// The ID of the next note.
    next: u32,
}

impl Notes {
    pub const fn new() -> Self {
        Self {
            pads: [None; PADS as usize],
            midi: [None; 128],
            next: 0,
        }
    }

    /// Starts a note from `source` and returns its ID, or `None` when the source has a note on,
    /// which then stays its only one.
    pub fn start(
        &mut self,
        source: Source,
        track: u8,
        pad: Option<u8>,
        pitch: u8,
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
        });
        self.next += 1;
        Some(id)
    }

    /// Ends the note of `source` and returns its ID, or `None` when it has none on.
    pub fn end(&mut self, source: Source) -> Option<NoteId> {
        self.slot(source).take().map(|note| note.id)
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

        assert_eq!(notes.start(Source::Pad(3), 0, Some(3), 60), Some(NoteId(0)));
        assert_eq!(notes.start(Source::Pad(3), 1, None, 64), None);
        assert_eq!(
            notes.start(Source::Midi(3), 0, Some(3), 60),
            Some(NoteId(1))
        );

        assert_eq!(notes.held_pads().collect::<Vec<_>>(), [3]);
        assert_eq!(
            notes.midi().copied().collect::<Vec<_>>(),
            [Note {
                id: NoteId(1),
                track: 0,
                pad: Some(3),
                pitch: 60
            }]
        );
    }

    #[test]
    fn ending_a_note_frees_its_source_and_its_id_is_never_given_again() {
        let mut notes = Notes::new();
        notes.start(Source::Midi(127), 2, None, 119);

        assert_eq!(notes.end(Source::Midi(127)), Some(NoteId(0)));
        assert_eq!(notes.end(Source::Midi(127)), None);
        assert_eq!(notes.end(Source::Pad(0)), None);
        assert_eq!(ids(&notes), []);
        assert_eq!(
            notes.start(Source::Midi(127), 2, None, 119),
            Some(NoteId(1))
        );
    }

    #[test]
    fn every_pad_and_every_midi_note_can_have_a_note_on_at_once() {
        let mut notes = Notes::new();

        for pad in 0..PADS {
            assert!(notes.start(Source::Pad(pad), 0, Some(pad), 60).is_some());
        }
        for note in 0..=127 {
            assert!(notes.start(Source::Midi(note), 0, None, note).is_some());
        }

        assert_eq!(ids(&notes), (0..140).collect::<Vec<_>>());
    }
}
