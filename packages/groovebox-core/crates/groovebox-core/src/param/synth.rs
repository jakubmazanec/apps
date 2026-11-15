//! The entries of the synth engine: its oscillators and noise.

use super::{COUNT_SOUND, Curve, Entry, LIST_SOUND, ParamId, SMOOTH_SOUND, choice};

pub const SAW: i32 = 0;
pub const PULSE: i32 = 1;
pub const TRIANGLE: i32 = 2;
pub const SINE: i32 = 3;
pub const SUPERSAW: i32 = 4;

pub const WAVE: Entry = Entry {
    id: ParamId(2000),
    name: "Wave",
    high: 4,
    default: SAW,
    choices: &[
        choice(SAW, "Saw"),
        choice(PULSE, "Pulse"),
        choice(TRIANGLE, "Triangle"),
        choice(SINE, "Sine"),
        choice(SUPERSAW, "Supersaw"),
    ],
    ..LIST_SOUND
};

/// The pulse width, or the supersaw's detune.
pub const SHAPE: Entry = Entry {
    id: ParamId(2001),
    name: "Shape",
    default: 32_768,
    ..SMOOTH_SOUND
};

pub const SPREAD: Entry = Entry {
    id: ParamId(2002),
    name: "Spread",
    ..SMOOTH_SOUND
};

pub const SUB_LEVEL: Entry = Entry {
    id: ParamId(2003),
    name: "Sub level",
    curve: Curve::Level,
    ..SMOOTH_SOUND
};

pub const NOISE_LEVEL: Entry = Entry {
    id: ParamId(2004),
    name: "Noise level",
    curve: Curve::Level,
    ..SMOOTH_SOUND
};

pub const OSCILLATOR_2_LEVEL: Entry = Entry {
    id: ParamId(2005),
    name: "Oscillator 2 level",
    curve: Curve::Level,
    ..SMOOTH_SOUND
};

pub const OSCILLATOR_2_INTERVAL: Entry = Entry {
    id: ParamId(2006),
    name: "Oscillator 2 interval",
    low: -24,
    high: 24,
    ..COUNT_SOUND
};

pub const OSCILLATOR_2_FINE_TUNE: Entry = Entry {
    id: ParamId(2007),
    name: "Oscillator 2 fine tune",
    low: -50,
    high: 50,
    ..COUNT_SOUND
};
