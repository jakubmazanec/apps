use crate::label::Label;

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

/// How a number becomes sound. Plan 3 adds the curves its entries need, with their display maths.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Curve {
    /// Off (0) or on (1).
    Switch,
}

/// How a value is shown. Plan 3 adds the units its entries need.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unit {
    None,
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

pub const ENTRIES: &[Entry] = &[VELOCITY];

const _: () = assert!(check(ENTRIES).is_ok());

/// The rules the list keeps, checked when the core builds. They apply in this order: IDs are
/// unique; each ID lies in its scope's block (device 1 to 99, project 100 to 199, track 200 to 299
/// or from 10,000, sound 1,000 to 9,999); the default lies between the lowest and the highest
/// value; a smooth entry (click above 0) runs 0 to 65,535 and its click divides by 16, so a fine
/// click is a whole sixteenth; a switch runs 0 to 1.
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

/// The value after `clicks` encoder clicks (negative is down): a counted value moves 1 per click
/// and a smooth one by its click, or a sixteenth of it when `fine`. It stops at the ends.
pub fn moved(entry: &Entry, value: i32, clicks: i32, fine: bool) -> i32 {
    let step = match (entry.click, fine) {
        (0, _) => 1,
        (click, true) => click / 16,
        (click, false) => click,
    };
    let target = i64::from(value) + i64::from(clicks) * i64::from(step);

    // The result lies between two `i32` values, so it fits.
    target.clamp(i64::from(entry.low), i64::from(entry.high)) as i32
}

/// Appends the value as it is shown.
pub fn format(entry: &Entry, value: i32, out: &mut Label<16>) {
    match entry.curve {
        Curve::Switch => out.push_str(if value == 0 { "Off" } else { "On" }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A smooth sound entry of the kind plan 3 adds. `Switch` is the only curve until then.
    const SMOOTH: Entry = Entry {
        id: ParamId(1000),
        name: "Smooth",
        scope: Scope::Sound,
        low: 0,
        high: 65_535,
        default: 0,
        curve: Curve::Switch,
        unit: Unit::None,
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
        assert_eq!(count(ENTRIES, Scope::Device), 1);
        assert_eq!(defaults::<1>(ENTRIES, Scope::Device), [1]);
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
}
