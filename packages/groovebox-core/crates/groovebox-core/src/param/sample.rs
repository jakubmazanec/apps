//! The entries of the sample engine: which part of a file plays, how it loops and its pitch.

use super::{COUNT_SOUND, Curve, Entry, LIST_SOUND, ParamId, Unit};

/// What the frame entries share: a frame of the file from the first, held within the file by
/// `moved_frame`.
const FRAME_SOUND: Entry = Entry {
    high: i32::MAX,
    curve: Curve::Frame,
    unit: Unit::Percent,
    ..LIST_SOUND
};

pub const START: Entry = Entry {
    id: ParamId(3000),
    name: "Start",
    ..FRAME_SOUND
};

pub const END: Entry = Entry {
    id: ParamId(3001),
    name: "End",
    ..FRAME_SOUND
};

pub const LOOP: Entry = Entry {
    id: ParamId(3002),
    name: "Loop",
    high: 1,
    curve: Curve::Switch,
    ..LIST_SOUND
};

pub const LOOP_START: Entry = Entry {
    id: ParamId(3003),
    name: "Loop start",
    ..FRAME_SOUND
};

pub const LOOP_END: Entry = Entry {
    id: ParamId(3004),
    name: "Loop end",
    ..FRAME_SOUND
};

pub const REVERSE: Entry = Entry {
    id: ParamId(3005),
    name: "Reverse",
    high: 1,
    curve: Curve::Switch,
    ..LIST_SOUND
};

/// The note the file sounds at, as a MIDI note.
pub const ROOT_NOTE: Entry = Entry {
    id: ParamId(3006),
    name: "Root note",
    high: 127,
    default: 60,
    unit: Unit::Note,
    ..COUNT_SOUND
};
