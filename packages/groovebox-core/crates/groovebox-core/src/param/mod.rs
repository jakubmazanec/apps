use crate::label::Label;
use core::fmt::Write;

/// A parameter's permanent ID. One flat space, never reused; the block an ID lies in tells what it
/// belongs to (see `check`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct ParamId(pub u16);

/// Where a value lives.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    Device,
    Project,
    Track,
    Sound,
}

/// How a number becomes sound (`real`) and how it is shown (`format`). `p` is the value as a
/// share of 65,535.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Curve {
    /// Off (0) or on (1).
    Switch,
    /// One of the entry's choices, by key.
    List,
    /// A whole number, moved one unit per click.
    Count,
    /// `p`.
    Fraction,
    /// From −1 to 1, with 32,768 in the middle.
    Bipolar,
    /// `max_ms / 1000 × p³` seconds.
    Time { max_ms: u32 },
    /// `20 × 1000^p` Hz.
    Cutoff,
    /// `p²` as a gain.
    Level,
}

/// How a value is shown.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unit {
    None,
    Percent,
    Signed,
    Time,
}

/// One choice of a named list. Its key is permanent; its label can be renamed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Choice {
    pub key: u16,
    pub label: &'static str,
}

/// An entry of the master list: one adjustable value.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Entry {
    pub id: ParamId,
    pub name: &'static str,
    pub scope: Scope,
    pub low: i32,
    pub high: i32,
    pub default: i32,
    pub curve: Curve,
    pub unit: Unit,
    /// How far one encoder click moves a smooth value; 0 for a counted value.
    pub click: u32,
    /// The choices of a named list; empty for an entry that is not a list.
    pub choices: &'static [Choice],
    /// The samples a change glides over; 0 means it changes exactly at T.
    pub glide: u32,
    pub modulated: bool,
}

pub const VELOCITY: Entry = Entry {
    id: ParamId(1),
    name: "Velocity",
    scope: Scope::Device,
    low: 0,
    high: 1,
    default: 1,
    curve: Curve::Switch,
    unit: Unit::None,
    click: 0,
    choices: &[],
    glide: 0,
    modulated: false,
};

/// The device's output volume. No page shows it; the volume encoder moves it.
pub const OUTPUT_VOLUME: Entry = Entry {
    id: ParamId(2),
    name: "Volume",
    scope: Scope::Device,
    low: 0,
    high: 65_535,
    default: 45_875,
    curve: Curve::Level,
    unit: Unit::Percent,
    click: 512,
    choices: &[],
    glide: 128,
    modulated: false,
};

/// What the smooth sound entries share. An entry of the list names its ID and name, and what
/// differs.
const SMOOTH_SOUND: Entry = Entry {
    id: ParamId(0),
    name: "",
    scope: Scope::Sound,
    low: 0,
    high: 65_535,
    default: 0,
    curve: Curve::Fraction,
    unit: Unit::Percent,
    click: 512,
    choices: &[],
    glide: 128,
    modulated: true,
};

/// What the time entries of the envelopes share: a change takes effect at once.
const TIME_SOUND: Entry = Entry {
    curve: Curve::Time { max_ms: 10_000 },
    unit: Unit::Time,
    glide: 0,
    ..SMOOTH_SOUND
};

/// What the list entries share. A list sets its highest key and its choices.
const LIST_SOUND: Entry = Entry {
    high: 0,
    curve: Curve::List,
    unit: Unit::None,
    click: 0,
    glide: 0,
    modulated: false,
    ..SMOOTH_SOUND
};

/// What the counted entries share. A count sets its range.
const COUNT_SOUND: Entry = Entry {
    curve: Curve::Count,
    unit: Unit::Signed,
    ..LIST_SOUND
};

/// A choice of a list. A list's keys lie within `u16`.
const fn choice(key: i32, label: &'static str) -> Choice {
    Choice {
        key: key as u16,
        label,
    }
}

mod chain;
mod synth;

pub use chain::*;
pub use synth::*;

/// The master list, in ID order: a sound keeps its values in this order.
pub const ENTRIES: &[Entry] = &[
    VELOCITY,
    OUTPUT_VOLUME,
    MODE,
    CUTOFF,
    RESONANCE,
    ENVELOPE_AMOUNT,
    KEY_FOLLOW,
    FILTER_VELOCITY,
    FILTER_TYPE,
    FILTER_ATTACK,
    FILTER_DECAY,
    FILTER_SUSTAIN,
    FILTER_RELEASE,
    ATTACK,
    DECAY,
    SUSTAIN,
    RELEASE,
    VOLUME_VELOCITY,
    LEVEL,
    PAN,
    PLAY_MODE,
    GLIDE_TIME,
    GLIDE,
    TRIGGER,
    CHOKE_GROUP,
    TRANSPOSE,
    FINE_TUNE,
    WAVE,
    SHAPE,
    SPREAD,
    SUB_LEVEL,
    NOISE_LEVEL,
    OSCILLATOR_2_LEVEL,
    OSCILLATOR_2_INTERVAL,
    OSCILLATOR_2_FINE_TUNE,
];

const _: () = assert!(check(ENTRIES).is_ok());

/// The rules the list keeps, checked when the core builds. They apply in this order: IDs are
/// unique; each ID lies in its scope's block (device 1 to 99, project 100 to 199, track 200 to 299
/// or from 10,000, sound 1,000 to 9,999); the default lies between the lowest and the highest
/// value; a smooth entry (click above 0) runs 0 to 65,535 and its click divides by 16, so a fine
/// click is a whole sixteenth; a switch runs 0 to 1; a list has choices with unique keys, its
/// default among them and no click; a count has no click; a fraction, a bipolar value, a time, a
/// cutoff and a level are smooth.
pub const fn check(entries: &[Entry]) -> Result<(), &'static str> {
    let mut first = 0;
    while first < entries.len() {
        let mut second = first + 1;
        while second < entries.len() {
            if entries[first].id.0 == entries[second].id.0 {
                return Err("two entries share an ID");
            }
            second += 1;
        }
        first += 1;
    }

    let mut index = 0;
    while index < entries.len() {
        let entry = &entries[index];
        let in_block = match entry.scope {
            Scope::Device => matches!(entry.id.0, 1..=99),
            Scope::Project => matches!(entry.id.0, 100..=199),
            Scope::Track => matches!(entry.id.0, 200..=299 | 10_000..),
            Scope::Sound => matches!(entry.id.0, 1_000..=9_999),
        };
        if !in_block {
            return Err("an ID lies outside its scope's block");
        }
        if entry.default < entry.low || entry.default > entry.high {
            return Err("a default lies outside the range");
        }
        if entry.click > 0 {
            if entry.low != 0 || entry.high != 65_535 {
                return Err("a smooth entry does not run from 0 to 65,535");
            }
            if !entry.click.is_multiple_of(16) {
                return Err("a smooth entry's click does not divide by 16");
            }
        }
        if matches!(entry.curve, Curve::Switch) && (entry.low != 0 || entry.high != 1) {
            return Err("a switch does not run from 0 to 1");
        }
        if matches!(entry.curve, Curve::List) {
            let mut has_default = false;
            let mut at = 0;
            while at < entry.choices.len() {
                if entry.choices[at].key as i32 == entry.default {
                    has_default = true;
                }
                let mut after = at + 1;
                while after < entry.choices.len() {
                    if entry.choices[at].key == entry.choices[after].key {
                        return Err("a list's choices share a key");
                    }
                    after += 1;
                }
                at += 1;
            }
            if !has_default {
                return Err("a list's default is not one of its choices");
            }
        }
        if matches!(entry.curve, Curve::List | Curve::Count) && entry.click != 0 {
            return Err("a list or a count has a click");
        }
        if matches!(
            entry.curve,
            Curve::Fraction | Curve::Bipolar | Curve::Time { .. } | Curve::Cutoff | Curve::Level
        ) && entry.click == 0
        {
            return Err("a smooth curve has no click");
        }
        index += 1;
    }

    Ok(())
}

/// The entry with this ID. It panics when the list has none: an ID comes from the list itself.
pub fn entry(id: ParamId) -> &'static Entry {
    ENTRIES
        .iter()
        .find(|entry| entry.id == id)
        .expect("every ID in use is on the master list")
}

/// Whether two scopes are the same. `PartialEq` cannot be used in a constant.
const fn same(first: Scope, second: Scope) -> bool {
    first as u8 == second as u8
}

/// How many entries lie in `scope`. A scope's values are kept in arrays of this length, in list
/// order, so an entry added to the list gets its place without any other change.
pub const fn count(entries: &[Entry], scope: Scope) -> usize {
    let mut count = 0;
    let mut index = 0;
    while index < entries.len() {
        if same(entries[index].scope, scope) {
            count += 1;
        }
        index += 1;
    }
    count
}

/// The defaults of the entries in `scope`, in list order. `N` must be `count(entries, scope)`.
pub const fn defaults<const N: usize>(entries: &[Entry], scope: Scope) -> [i32; N] {
    let mut defaults = [0; N];
    let mut filled = 0;
    let mut index = 0;
    while index < entries.len() {
        if same(entries[index].scope, scope) {
            defaults[filled] = entries[index].default;
            filled += 1;
        }
        index += 1;
    }
    assert!(filled == N, "N is not the number of entries in the scope");
    defaults
}

/// The place of the entry `id` among the entries in `scope`, in list order; none when the list
/// has no such entry.
pub fn position(entries: &[Entry], scope: Scope, id: ParamId) -> Option<usize> {
    entries
        .iter()
        .filter(|entry| entry.scope == scope)
        .position(|entry| entry.id == id)
}

/// The place of `value`'s key among the choices of the list `entry`.
///
/// # Panics
///
/// When `value` is not a key of the list: a value comes from the list itself.
fn place(entry: &Entry, value: i32) -> usize {
    entry
        .choices
        .iter()
        .position(|choice| i32::from(choice.key) == value)
        .expect("a list's value is one of its keys")
}

/// The value after `clicks` encoder clicks (negative is down): a list moves that many places along
/// its choices and gives that choice's key, a counted value moves 1 per click and a smooth one by
/// its click, or a sixteenth of it when `fine`. It stops at the ends.
pub fn moved(entry: &Entry, value: i32, clicks: i32, fine: bool) -> i32 {
    if entry.curve == Curve::List {
        let target = place(entry, value).saturating_add_signed(clicks as isize);
        return i32::from(entry.choices[target.min(entry.choices.len() - 1)].key);
    }
    let step = match (entry.click, fine) {
        (0, _) => 1,
        (click, true) => click / 16,
        (click, false) => click,
    };
    let target = i64::from(value) + i64::from(clicks) * i64::from(step);

    // The result lies between two `i32` values, so it fits.
    target.clamp(i64::from(entry.low), i64::from(entry.high)) as i32
}

/// A bipolar value's distance from the middle, held within −32,767 and 32,767.
fn offset(value: i32) -> i32 {
    (value - 32_768).clamp(-32_767, 32_767)
}

/// The number the sound gets for `value`, by the entry's curve.
pub fn real(entry: &Entry, value: i32) -> f32 {
    let p = value as f32 / 65_535.0;
    match entry.curve {
        Curve::Switch | Curve::List | Curve::Count => value as f32,
        Curve::Fraction => p,
        Curve::Bipolar => offset(value) as f32 / 32_767.0,
        Curve::Time { max_ms } => max_ms as f32 / 1_000.0 * p * p * p,
        Curve::Cutoff => 20.0 * libm::powf(1_000.0, p),
        Curve::Level => p * p,
    }
}

/// Appends the value as it is shown. Rounding is half away from zero, done on integers.
pub fn format(entry: &Entry, value: i32, out: &mut Label<16>) {
    let written = match entry.curve {
        Curve::Switch => out.write_str(if value == 0 { "Off" } else { "On" }),
        Curve::List => out.write_str(entry.choices[place(entry, value)].label),
        Curve::Count => signed(value, out),
        Curve::Bipolar => {
            let from_middle = offset(value);
            signed(
                from_middle.signum() * ((from_middle.abs() * 100 + 16_383) / 32_767),
                out,
            )
        }
        Curve::Time { max_ms } => {
            // The time is `scaled / full` milliseconds.
            let scaled = i128::from(max_ms) * i128::from(value).pow(3);
            let full = 65_535_i128.pow(3);
            let milliseconds = (2 * scaled + full) / (2 * full);
            if milliseconds < 1_000 {
                write!(out, "{milliseconds} ms")
            } else {
                let tenths = (scaled + 50 * full) / (100 * full);
                write!(out, "{}.{} s", tenths / 10, tenths % 10)
            }
        }
        Curve::Fraction | Curve::Cutoff | Curve::Level => {
            write!(out, "{}%", (value * 100 + 32_767) / 65_535)
        }
    };
    written.expect("writing to a label never fails");
}

/// Appends `value` with its sign, "+" for 0 and above and "−" below.
fn signed(value: i32, out: &mut Label<16>) -> core::fmt::Result {
    write!(
        out,
        "{}{}",
        if value < 0 { '\u{2212}' } else { '+' },
        value.unsigned_abs()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A smooth sound entry.
    const SMOOTH: Entry = Entry {
        id: ParamId(1000),
        name: "Smooth",
        scope: Scope::Sound,
        low: 0,
        high: 65_535,
        default: 0,
        curve: Curve::Fraction,
        unit: Unit::Percent,
        click: 512,
        choices: &[],
        glide: 0,
        modulated: false,
    };

    fn text(entry: &Entry, value: i32) -> Label<16> {
        let mut out = Label::new();
        format(entry, value, &mut out);
        out
    }

    #[test]
    fn velocity_is_a_device_switch_numbered_1_and_on() {
        assert_eq!(VELOCITY.id, ParamId(1));
        assert_eq!(VELOCITY.scope, Scope::Device);
        assert_eq!(VELOCITY.default, 1);
        assert_eq!(entry(ParamId(1)).name, "Velocity");
    }

    /// Entries of every scope, two of them in `Sound`, with defaults that tell them apart.
    const MIXED: [Entry; 4] = [
        VELOCITY,
        Entry {
            id: ParamId(1000),
            default: 11,
            high: 20,
            scope: Scope::Sound,
            ..VELOCITY
        },
        Entry {
            id: ParamId(200),
            default: 0,
            scope: Scope::Track,
            ..VELOCITY
        },
        Entry {
            id: ParamId(1001),
            default: 7,
            high: 20,
            scope: Scope::Sound,
            ..VELOCITY
        },
    ];

    #[test]
    fn a_scope_counts_its_entries_and_lists_their_defaults_in_list_order() {
        const SOUND: [i32; 2] = defaults(&MIXED, Scope::Sound);

        assert_eq!(count(&MIXED, Scope::Sound), 2);
        assert_eq!(count(&MIXED, Scope::Device), 1);
        assert_eq!(count(&MIXED, Scope::Track), 1);
        assert_eq!(count(&MIXED, Scope::Project), 0);
        assert_eq!(SOUND, [11, 7]);
        assert_eq!(defaults::<0>(&MIXED, Scope::Project), []);
        assert_eq!(count(ENTRIES, Scope::Device), 2);
        assert_eq!(defaults::<2>(ENTRIES, Scope::Device), [1, 45_875]);
    }

    #[test]
    #[should_panic(expected = "N is not the number of entries in the scope")]
    fn defaults_refuse_a_length_that_is_not_the_count() {
        let _ = defaults::<1>(&MIXED, Scope::Project);
    }

    #[test]
    fn an_entry_is_found_by_its_place_in_its_scope() {
        assert_eq!(position(&MIXED, Scope::Sound, ParamId(1000)), Some(0));
        assert_eq!(position(&MIXED, Scope::Sound, ParamId(1001)), Some(1));
        assert_eq!(position(&MIXED, Scope::Device, ParamId(1)), Some(0));
        assert_eq!(position(&MIXED, Scope::Track, ParamId(1001)), None);
        assert_eq!(position(&MIXED, Scope::Sound, ParamId(7)), None);
    }

    #[test]
    fn counted_values_move_one_per_click_and_stop_at_the_ends() {
        assert_eq!(moved(&VELOCITY, 0, 1, false), 1);
        assert_eq!(moved(&VELOCITY, 1, 1, false), 1);
        assert_eq!(moved(&VELOCITY, 1, -5, false), 0);
        assert_eq!(moved(&VELOCITY, 0, 1, true), 1);
        assert_eq!(moved(&VELOCITY, 1, -1, true), 0);
    }

    #[test]
    fn smooth_values_move_by_the_click_or_a_sixteenth_with_shift() {
        assert_eq!(moved(&SMOOTH, 0, 1, false), 512);
        assert_eq!(moved(&SMOOTH, 0, 1, true), 32);
        assert_eq!(moved(&SMOOTH, 0, 3, false), 1_536);
        assert_eq!(moved(&SMOOTH, 65_500, 1, false), 65_535);
        assert_eq!(moved(&SMOOTH, 100, -1, false), 0);
        assert_eq!(moved(&SMOOTH, 100, i32::MIN, false), 0);
        assert_eq!(moved(&SMOOTH, 100, i32::MAX, false), 65_535);
    }

    #[test]
    fn switches_read_off_and_on() {
        assert_eq!(text(&VELOCITY, 0).as_str(), "Off");
        assert_eq!(text(&VELOCITY, 1).as_str(), "On");
    }

    #[test]
    fn the_master_list_passes_its_own_check() {
        assert_eq!(check(ENTRIES), Ok(()));
    }

    #[test]
    fn check_accepts_the_edges_of_every_block() {
        for (scope, id) in [
            (Scope::Device, 1),
            (Scope::Device, 99),
            (Scope::Project, 100),
            (Scope::Project, 199),
            (Scope::Track, 200),
            (Scope::Track, 299),
            (Scope::Track, 10_000),
            (Scope::Track, u16::MAX),
            (Scope::Sound, 1_000),
            (Scope::Sound, 9_999),
        ] {
            let entry = Entry {
                id: ParamId(id),
                scope,
                ..VELOCITY
            };

            assert_eq!(check(&[entry]), Ok(()), "{scope:?} {id}");
        }
    }

    #[test]
    fn check_refuses_what_the_rules_forbid() {
        let outside = "an ID lies outside its scope's block";

        assert_eq!(check(&[VELOCITY, VELOCITY]), Err("two entries share an ID"));
        assert_eq!(
            check(&[Entry {
                id: ParamId(100),
                ..VELOCITY
            }]),
            Err(outside)
        );
        assert_eq!(
            check(&[Entry {
                id: ParamId(50),
                scope: Scope::Sound,
                ..SMOOTH
            }]),
            Err(outside)
        );
        assert_eq!(
            check(&[Entry {
                id: ParamId(9_999),
                scope: Scope::Track,
                ..SMOOTH
            }]),
            Err(outside)
        );
        assert_eq!(
            check(&[Entry {
                default: 2,
                ..VELOCITY
            }]),
            Err("a default lies outside the range")
        );
        assert_eq!(
            check(&[Entry {
                high: 1_000,
                ..SMOOTH
            }]),
            Err("a smooth entry does not run from 0 to 65,535")
        );
        assert_eq!(
            check(&[Entry {
                click: 700,
                ..SMOOTH
            }]),
            Err("a smooth entry's click does not divide by 16")
        );
        assert_eq!(
            check(&[Entry {
                high: 2,
                ..VELOCITY
            }]),
            Err("a switch does not run from 0 to 1")
        );
    }

    /// A list whose keys are not in order, to show that a list moves along its choices.
    const OUT_OF_ORDER: Entry = Entry {
        id: ParamId(1000),
        name: "Out of order",
        high: 7,
        default: 3,
        choices: &[choice(3, "Three"), choice(0, "Zero"), choice(7, "Seven")],
        ..LIST_SOUND
    };

    #[test]
    fn the_list_passes_its_check_with_33_sound_and_2_device_entries() {
        assert_eq!(check(ENTRIES), Ok(()));
        assert_eq!(count(ENTRIES, Scope::Sound), 33);
        assert_eq!(count(ENTRIES, Scope::Device), 2);
    }

    #[test]
    fn lists_move_along_their_choices_and_stop_at_the_ends() {
        assert_eq!(moved(&OUT_OF_ORDER, 0, 1, false), 7);
        assert_eq!(moved(&OUT_OF_ORDER, 0, 5, false), 7);
        assert_eq!(moved(&OUT_OF_ORDER, 3, -1, false), 3);
        assert_eq!(moved(&OUT_OF_ORDER, 7, -1, false), 0);
        assert_eq!(moved(&OUT_OF_ORDER, 7, i32::MIN, false), 3);
        assert_eq!(moved(&OUT_OF_ORDER, 3, i32::MAX, false), 7);
        assert_eq!(moved(&WAVE, SAW, 10, true), SUPERSAW);
    }

    #[test]
    fn counts_ignore_shift() {
        assert_eq!(moved(&TRANSPOSE, 0, 1, true), 1);
        assert_eq!(moved(&FINE_TUNE, 50, 1, false), 50);
    }

    #[test]
    fn percentages_are_whole() {
        assert_eq!(text(&CUTOFF, 65_535).as_str(), "100%");
        assert_eq!(text(&CUTOFF, 41_943).as_str(), "64%");
        assert_eq!(text(&CUTOFF, 0).as_str(), "0%");
        assert_eq!(text(&LEVEL, 52_428).as_str(), "80%");
    }

    #[test]
    fn signed_values_read_plus_zero_in_the_middle() {
        assert_eq!(text(&ENVELOPE_AMOUNT, 32_768).as_str(), "+0");
        assert_eq!(text(&ENVELOPE_AMOUNT, 45_875).as_str(), "+40");
        assert_eq!(text(&ENVELOPE_AMOUNT, 0).as_str(), "\u{2212}100");
        assert_eq!(text(&ENVELOPE_AMOUNT, 65_535).as_str(), "+100");
        assert_eq!(text(&TRANSPOSE, 12).as_str(), "+12");
        assert_eq!(text(&TRANSPOSE, -7).as_str(), "\u{2212}7");
        assert_eq!(text(&TRANSPOSE, 0).as_str(), "+0");
    }

    #[test]
    fn times_read_in_milliseconds_then_seconds() {
        assert_eq!(text(&ATTACK, 0).as_str(), "0 ms");
        assert_eq!(text(&ATTACK, 6_554).as_str(), "10 ms");
        assert_eq!(text(&ATTACK, 14_117).as_str(), "100 ms");
        assert_eq!(text(&ATTACK, 49_151).as_str(), "4.2 s");
        assert_eq!(text(&ATTACK, 65_535).as_str(), "10.0 s");
        assert_eq!(text(&GLIDE_TIME, 65_535).as_str(), "2.0 s");
    }

    #[test]
    fn lists_read_their_labels() {
        assert_eq!(text(&MODE, LP_24).as_str(), "LP 24");
        assert_eq!(text(&CHOKE_GROUP, 0).as_str(), "None");
        assert_eq!(text(&CHOKE_GROUP, 3).as_str(), "3");
        assert_eq!(text(&TRIGGER, ONE_SHOT).as_str(), "One-shot");
    }

    #[test]
    fn curves_give_the_sound_its_numbers() {
        assert_eq!(real(&CUTOFF, 0), 20.0);
        assert!(libm::fabsf(real(&CUTOFF, 65_535) - 20_000.0) < 0.5);
        assert!(libm::fabsf(real(&RELEASE, 14_117) - 0.1) < 0.0001);
        assert_eq!(real(&LEVEL, 65_535), 1.0);
        assert_eq!(real(&PAN, 0), -1.0);
        assert_eq!(real(&PAN, 32_768), 0.0);
    }

    #[test]
    fn a_new_sound_is_the_plain_open_saw() {
        const DEFAULTS: [i32; 33] = defaults(ENTRIES, Scope::Sound);
        let default = |entry: &Entry| {
            DEFAULTS[position(ENTRIES, Scope::Sound, entry.id).expect("a sound entry")]
        };

        assert_eq!(default(&WAVE), SAW);
        assert_eq!(default(&CUTOFF), 65_535);
        assert_eq!(default(&MODE), LP_24);
        assert_eq!(default(&SUSTAIN), 65_535);
        assert_eq!(default(&RELEASE), 14_117);
        assert_eq!(default(&LEVEL), 52_428);
        assert_eq!(default(&PLAY_MODE), POLY);
        assert_eq!(default(&TRIGGER), GATE);
    }

    #[test]
    fn check_refuses_a_bad_list_or_count() {
        const LIST: Entry = Entry {
            id: ParamId(1000),
            high: 1,
            choices: &[choice(1, "One")],
            default: 1,
            ..LIST_SOUND
        };
        const SHARED_KEY: Entry = Entry {
            choices: &[choice(1, "One"), choice(1, "Uno")],
            ..LIST
        };

        assert_eq!(check(&[LIST]), Ok(()));
        assert_eq!(check(&[SHARED_KEY]), Err("a list's choices share a key"));
        assert_eq!(
            check(&[Entry { default: 0, ..LIST }]),
            Err("a list's default is not one of its choices")
        );
        assert_eq!(
            check(&[Entry {
                high: 65_535,
                click: 512,
                ..LIST
            }]),
            Err("a list or a count has a click")
        );
        assert_eq!(
            check(&[Entry {
                curve: Curve::Count,
                ..SMOOTH
            }]),
            Err("a list or a count has a click")
        );
        assert_eq!(
            check(&[Entry { click: 0, ..SMOOTH }]),
            Err("a smooth curve has no click")
        );
    }
}
