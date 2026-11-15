use crate::param::ParamId;
use crate::project::pool::SoundNumber;

pub const MESSAGE_QUEUE: usize = 256;
pub const REPORT_QUEUE: usize = 256;
/// The most messages the control part sends for one event, an input or a repeat. It handles an
/// event only while the message queue has room for this many.
pub const MAX_MESSAGES_PER_EVENT: usize = 1;

/// A control message for the audio part. The audio part applies it at the first chunk start at or
/// after `at`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Message {
    pub number: u32,
    pub at: u64,
    pub kind: MessageKind,
}

/// The number of a note: they count up from 0 and are never reused, so a `NoteOff` ends exactly
/// the note its `NoteOn` started.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NoteId(pub u32);

/// What a changed value belongs to. Milestone 3 adds the project, a track and a slot.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target {
    Device,
    Sound(SoundNumber),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MessageKind {
    /// A note of `sound` starts on track `track` (0 to 3) at the MIDI note `pitch`, with a
    /// velocity from 1 to 127.
    NoteOn {
        note: NoteId,
        track: u8,
        sound: SoundNumber,
        pitch: u8,
        velocity: u8,
    },
    NoteOff {
        note: NoteId,
    },
    /// The entry `id` of `target` now holds `value`.
    SetParam {
        target: Target,
        id: ParamId,
        value: i32,
    },
    /// A sound with every default was made.
    NewSound {
        sound: SoundNumber,
    },
    /// `sound` was made with the values of `of`.
    CopySound {
        sound: SoundNumber,
        of: SoundNumber,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Report {
    Applied { number: u32, sample: u64 },
}
