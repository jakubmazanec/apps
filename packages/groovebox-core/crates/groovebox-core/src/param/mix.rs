//! The entries of the mix: a track's level and mute, and the master level.

use super::{Curve, Entry, ParamId, SMOOTH_SOUND, Scope, Unit};

/// A track's level, at full level so that a new project sounds as it did before there was one.
pub const TRACK_LEVEL: Entry = Entry {
    id: ParamId(200),
    name: "Level",
    scope: Scope::Track,
    default: 65_535,
    curve: Curve::Level,
    modulated: false,
    ..SMOOTH_SOUND
};

/// The level of the sum of the tracks.
pub const MASTER_LEVEL: Entry = Entry {
    id: ParamId(101),
    name: "Master",
    scope: Scope::Project,
    ..TRACK_LEVEL
};

/// Whether the track's pattern plays: on means its notes start nothing.
pub const MUTE: Entry = Entry {
    id: ParamId(201),
    name: "Mute",
    high: 1,
    default: 0,
    curve: Curve::Switch,
    unit: Unit::None,
    click: 0,
    glide: 0,
    ..TRACK_LEVEL
};
