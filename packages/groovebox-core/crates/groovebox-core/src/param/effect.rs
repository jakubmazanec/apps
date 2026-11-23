//! The entries of the track effects: the values an effect slot keeps for each effect type.

use super::{Choice, Curve, Entry, LIST_SOUND, ParamId, SMOOTH_SOUND, Scope, Unit, choice};

/// What the smooth slot entries share.
const SMOOTH_SLOT: Entry = Entry {
    scope: Scope::Slot,
    ..SMOOTH_SOUND
};

/// DELAY_TIME's choices, keyed by their length in ticks and ordered by it (answer 1): 1/32T 160,
/// 1/32 240, 1/16T 320, 1/32D 360, 1/16 480, 1/8T 640, 1/16D 720, 1/8 960, 1/4T 1,280, 1/8D 1,440,
/// 1/4 1,920, 1/2T 2,560, 1/4D 2,880, 1/2 3,840, 1/1T 5,120, 1/2D 5,760, 1/1 7,680, 1/1D 11,520.
pub const DELAY_TIMES: [Choice; 18] = [
    choice(160, "1/32T"),
    choice(240, "1/32"),
    choice(320, "1/16T"),
    choice(360, "1/32D"),
    choice(480, "1/16"),
    choice(640, "1/8T"),
    choice(720, "1/16D"),
    choice(960, "1/8"),
    choice(1_280, "1/4T"),
    choice(1_440, "1/8D"),
    choice(1_920, "1/4"),
    choice(2_560, "1/2T"),
    choice(2_880, "1/4D"),
    choice(3_840, "1/2"),
    choice(5_120, "1/1T"),
    choice(5_760, "1/2D"),
    choice(7_680, "1/1"),
    choice(11_520, "1/1D"),
];

/// The delay's time as a note value, which follows the tempo.
pub const DELAY_TIME: Entry = Entry {
    id: ParamId(10_000),
    name: "Time",
    scope: Scope::Slot,
    high: 11_520,
    default: 960,
    choices: &DELAY_TIMES,
    ..LIST_SOUND
};

/// How much of each echo comes back: 100% is 0.98 in the loop.
pub const DELAY_FEEDBACK: Entry = Entry {
    id: ParamId(10_001),
    name: "Feedback",
    default: 26_214,
    ..SMOOTH_SLOT
};

/// The low-pass in the loop, from 1 kHz to 16 kHz.
pub const DELAY_TONE: Entry = Entry {
    id: ParamId(10_002),
    name: "Tone",
    default: 32_768,
    ..SMOOTH_SLOT
};

/// Whether the echoes bounce between the sides.
pub const DELAY_PING_PONG: Entry = Entry {
    id: ParamId(10_003),
    name: "Ping-pong",
    high: 1,
    curve: Curve::Switch,
    unit: Unit::None,
    click: 0,
    glide: 0,
    modulated: false,
    ..SMOOTH_SLOT
};

/// How loud the echoes are on top of the dry sound, which never drops.
pub const DELAY_LEVEL: Entry = Entry {
    id: ParamId(10_004),
    name: "Level",
    curve: Curve::Level,
    ..SMOOTH_SLOT
};
