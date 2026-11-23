use crate::library::FileId;
use crate::param::ParamId;
use crate::project::pool::SoundNumber;
use crate::project::track::Effect;
use crate::sequencer::{Meter, Run};
use crate::store::Tree;

pub const MESSAGE_QUEUE: usize = 256;
/// Room for a report of every message and every version in flight. The audio part takes one only
/// while its report has room, so none is ever dropped: a version's blocks wait for its report
/// (S26). A queue's length is a power of two.
pub const REPORT_QUEUE: usize = (MESSAGE_QUEUE + VERSION_QUEUE).next_power_of_two();
/// The most versions of the note memory that the control part has sent and the audio part has not
/// yet taken. The note memory's waiting blocks are grouped by version in a ring this long, plus
/// `REPORT_QUEUE` for the versions taken whose reports the control part has not read.
pub const VERSION_QUEUE: usize = 64;
/// The most messages the control part sends for one event, an input or a repeat: ENGINE to Sample
/// sends `StopPreview`, up to seven values and `SoundEngine`, and ENGINE to Synth up to eight values
/// and `SoundEngine`. It handles an event only while the message queue has room for this many.
pub const MAX_MESSAGES_PER_EVENT: usize = 9;
/// The most versions one event sends: one for each track of the current pattern.
pub const MAX_VERSIONS_PER_EVENT: usize = 4;

/// A control message for the audio part. The audio part applies it at the first chunk start at or
/// after `at`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Message {
    pub number: u32,
    pub at: u64,
    pub kind: MessageKind,
}

/// Track `track` of the current pattern plays `tree` from the first chunk start at or after
/// `moment`. Numbered from the messages' count.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Version {
    pub number: u32,
    pub moment: u64,
    pub track: u8,
    pub tree: Tree,
}

/// The number of a note: they count up from 0 and are never reused, so a `NoteOff` ends exactly
/// the note its `NoteOn` started.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NoteId(pub u32);

/// A library file the audio part may read: its place, its length in frames and its channels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SampleFile {
    pub file: FileId,
    pub frames: u32,
    pub stereo: bool,
}

/// What a note's engine plays: the synth, or a sample sound's file; none for a missing one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoteEngine {
    Synth,
    Sample(Option<SampleFile>),
}

/// What a changed value belongs to: the device, a sound, the project, a track (0 to 3) or an
/// effect slot of a track (0 to 5, in chain order).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Target {
    Device,
    Sound(SoundNumber),
    Project,
    Track(u8),
    Slot { track: u8, slot: u8 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MessageKind {
    /// A note of `sound` starts on track `track` (0 to 3) at the MIDI note `pitch`, with a
    /// velocity from 1 to 127, playing `engine`.
    NoteOn {
        note: NoteId,
        track: u8,
        sound: SoundNumber,
        pitch: u8,
        velocity: u8,
        engine: NoteEngine,
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
    /// `sound` was deleted: its voices fade out and the audio part forgets its values.
    DeleteSound {
        sound: SoundNumber,
    },
    /// From this chunk on the audio part reads blocks through block table `version`, 0 or 1.
    UseTable {
        version: u8,
    },
    /// The preview player plays `sample` once from its first frame; the file it played fades
    /// out.
    Preview {
        sample: SampleFile,
    },
    /// The file the preview player plays fades out.
    StopPreview,
    /// Whatever plays `file` fades out, and once this applies the audio part reads none of its
    /// blocks: its report says that the audio part let go of the file. From then on the pattern
    /// notes of its sounds play no file.
    ForgetSample {
        file: FileId,
    },
    /// The current pattern plays from `run`: it starts, or jumps while playing (S7, S8).
    Play {
        run: Run,
    },
    /// The pattern stops and its sounding notes end, each with its own release (S9).
    Stop,
    /// Every voice fades out within the chunk and the preview stops: STOP while stopped (S9).
    Silence,
    /// The pattern's notes of `sound` play `engine` from now on (S23).
    SoundEngine {
        sound: SoundNumber,
        engine: NoteEngine,
    },
    /// While playing, the music goes on at `run`'s tempo from its tick: notes sounding keep their
    /// end and the others follow the new tempo (S2).
    Tempo {
        run: Run,
    },
    /// The pattern takes `meter`'s bars and signature: while playing at its tick, while stopped at
    /// once (S13).
    Meter {
        meter: Meter,
    },
    /// The slot clears and takes `effect` at its defaults.
    SlotEffect {
        track: u8,
        slot: u8,
        effect: Effect,
    },
    /// The slot at `from` goes to `to` with its memory, and the slots between move one place
    /// towards `from`; nothing clears.
    MoveSlot {
        track: u8,
        from: u8,
        to: u8,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Report {
    Applied { number: u32, sample: u64 },
}
