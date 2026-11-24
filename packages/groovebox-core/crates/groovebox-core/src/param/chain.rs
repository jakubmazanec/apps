//! The entries of the voice chain every sound has, whatever makes its sound: the filter, the two
//! envelopes, the level, the pan and how notes play.

use super::{
    COUNT_SOUND, Curve, Entry, LIST_SOUND, ParamId, SMOOTH_SOUND, TIME_SOUND, Unit, choice,
};

pub const LP_12: i32 = 0;
pub const LP_24: i32 = 1;
pub const HP: i32 = 2;
pub const BP: i32 = 3;

pub const POLY: i32 = 0;
pub const MONO: i32 = 1;
pub const LEGATO: i32 = 2;

pub const ALWAYS: i32 = 0;
pub const OVERLAPPING: i32 = 1;

pub const GATE: i32 = 0;
pub const ONE_SHOT: i32 = 1;

pub const MODE: Entry = Entry {
    id: ParamId(1000),
    name: "Mode",
    high: 3,
    default: LP_24,
    choices: &[
        choice(LP_12, "LP 12"),
        choice(LP_24, "LP 24"),
        choice(HP, "HP"),
        choice(BP, "BP"),
    ],
    ..LIST_SOUND
};

pub const CUTOFF: Entry = Entry {
    id: ParamId(1001),
    name: "Cutoff",
    default: 65_535,
    curve: Curve::Cutoff,
    ..SMOOTH_SOUND
};

pub const RESONANCE: Entry = Entry {
    id: ParamId(1002),
    name: "Resonance",
    ..SMOOTH_SOUND
};

pub const ENVELOPE_AMOUNT: Entry = Entry {
    id: ParamId(1003),
    name: "Envelope amount",
    default: 32_768,
    curve: Curve::Bipolar,
    unit: Unit::Signed,
    ..SMOOTH_SOUND
};

pub const KEY_FOLLOW: Entry = Entry {
    id: ParamId(1004),
    name: "Key follow",
    ..SMOOTH_SOUND
};

/// How much the velocity opens the filter.
pub const FILTER_VELOCITY: Entry = Entry {
    id: ParamId(1005),
    name: "Velocity amount",
    ..SMOOTH_SOUND
};

pub const FILTER_TYPE: Entry = Entry {
    id: ParamId(1006),
    name: "Type",
    choices: &[choice(0, "State variable")],
    ..LIST_SOUND
};

pub const FILTER_ATTACK: Entry = Entry {
    id: ParamId(1010),
    name: "Attack",
    ..TIME_SOUND
};

pub const FILTER_DECAY: Entry = Entry {
    id: ParamId(1011),
    name: "Decay",
    default: 20_363,
    ..TIME_SOUND
};

pub const FILTER_SUSTAIN: Entry = Entry {
    id: ParamId(1012),
    name: "Sustain",
    ..SMOOTH_SOUND
};

pub const FILTER_RELEASE: Entry = Entry {
    id: ParamId(1013),
    name: "Release",
    default: 14_117,
    ..TIME_SOUND
};

pub const ATTACK: Entry = Entry {
    id: ParamId(1020),
    name: "Attack",
    ..TIME_SOUND
};

pub const DECAY: Entry = Entry {
    id: ParamId(1021),
    name: "Decay",
    default: 20_363,
    ..TIME_SOUND
};

pub const SUSTAIN: Entry = Entry {
    id: ParamId(1022),
    name: "Sustain",
    default: 65_535,
    ..SMOOTH_SOUND
};

pub const RELEASE: Entry = Entry {
    id: ParamId(1023),
    name: "Release",
    default: 14_117,
    ..TIME_SOUND
};

/// How much the velocity sets the volume.
pub const VOLUME_VELOCITY: Entry = Entry {
    id: ParamId(1024),
    name: "Velocity amount",
    default: 32_768,
    ..SMOOTH_SOUND
};

pub const LEVEL: Entry = Entry {
    id: ParamId(1025),
    name: "Level",
    default: 52_428,
    curve: Curve::Level,
    ..SMOOTH_SOUND
};

pub const PAN: Entry = Entry {
    id: ParamId(1026),
    name: "Pan",
    default: 32_768,
    curve: Curve::Bipolar,
    unit: Unit::Signed,
    ..SMOOTH_SOUND
};

pub const PLAY_MODE: Entry = Entry {
    id: ParamId(1030),
    name: "Play mode",
    high: 2,
    default: POLY,
    choices: &[
        choice(POLY, "Poly"),
        choice(MONO, "Mono"),
        choice(LEGATO, "Legato"),
    ],
    ..LIST_SOUND
};

pub const GLIDE_TIME: Entry = Entry {
    id: ParamId(1031),
    name: "Glide time",
    curve: Curve::Time { max_ms: 2_000 },
    ..TIME_SOUND
};

pub const GLIDE: Entry = Entry {
    id: ParamId(1032),
    name: "Glide",
    high: 1,
    default: ALWAYS,
    choices: &[choice(ALWAYS, "Always"), choice(OVERLAPPING, "Overlapping")],
    ..LIST_SOUND
};

pub const TRIGGER: Entry = Entry {
    id: ParamId(1033),
    name: "Trigger",
    high: 1,
    default: GATE,
    choices: &[choice(GATE, "Gate"), choice(ONE_SHOT, "One-shot")],
    ..LIST_SOUND
};

pub const CHOKE_GROUP: Entry = Entry {
    id: ParamId(1034),
    name: "Choke group",
    high: 8,
    choices: &[
        choice(0, "None"),
        choice(1, "1"),
        choice(2, "2"),
        choice(3, "3"),
        choice(4, "4"),
        choice(5, "5"),
        choice(6, "6"),
        choice(7, "7"),
        choice(8, "8"),
    ],
    ..LIST_SOUND
};

pub const TRANSPOSE: Entry = Entry {
    id: ParamId(1035),
    name: "Transpose",
    low: -48,
    high: 48,
    ..COUNT_SOUND
};

pub const FINE_TUNE: Entry = Entry {
    id: ParamId(1036),
    name: "Fine tune",
    low: -50,
    high: 50,
    ..COUNT_SOUND
};

/// How many semitones above the note's pitch a note starts; below when negative.
pub const PITCH_AMOUNT: Entry = Entry {
    id: ParamId(1037),
    name: "Pitch amount",
    low: -48,
    high: 48,
    ..COUNT_SOUND
};

/// How long a note takes to fall back to its pitch.
pub const PITCH_DECAY: Entry = Entry {
    id: ParamId(1038),
    name: "Pitch decay",
    default: 10_403,
    ..TIME_SOUND
};
