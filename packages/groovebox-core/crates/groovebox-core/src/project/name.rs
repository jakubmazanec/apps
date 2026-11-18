use super::pool::{NAME_BYTES, Pool};
use crate::label::Label;
use core::fmt::Write;

/// The longest number a name carries, with its space: `u32::MAX`.
const NUMBER_BYTES: usize = " 4294967295".len();

/// How much of a base tells it from another. A base is cut to leave room for the number, and the
/// number can take up to `NUMBER_BYTES`, so what a base keeps in every case is this many bytes. Two
/// bases that agree on them are the same base: a long base cut for its number 2 and the same base
/// cut for its number 10 still count together.
const KEY_BYTES: usize = NAME_BYTES - NUMBER_BYTES;

fn key(base: &str) -> &str {
    &base[..base.floor_char_boundary(KEY_BYTES)]
}

/// The base and the number of a name. A trailing space and digits are the number; anything else,
/// or a number that does not fit a `u32`, leaves the whole name as the base, and an unnumbered
/// name is number 1.
pub fn split(name: &str) -> (&str, u32) {
    if let Some((base, digits)) = name.rsplit_once(' ')
        && !digits.is_empty()
        && digits.bytes().all(|byte| byte.is_ascii_digit())
        && let Ok(number) = digits.parse()
    {
        (base, number)
    } else {
        (name, 1)
    }
}

/// The name of the next sound of `base`: the highest number of that base in the pool plus one. A
/// base the pool lacks starts at 1 when `numbered`, as a synth does ("Syn 1"), and as the bare
/// base otherwise, as the first sound of a file does ("Kick"). The base is shortened at a character
/// boundary so that the name fits.
///
/// `base` must be split already (`split`). A whole name such as "Take 2" counts as the base
/// "Take 2", not "Take", so the next name can be "Take 2" again.
pub fn next_name(pool: &Pool, base: &str, numbered: bool) -> Label<NAME_BYTES> {
    let highest = pool
        .sounds()
        .iter()
        .map(|sound| split(sound.name.as_str()))
        .filter(|&(other, _)| key(other) == key(base))
        .map(|(_, number)| number)
        .max();
    let mut name = Label::new();
    // Only a file named with the highest number can reach it, and then the name repeats.
    let Some(number) = highest
        .map(|number| number.saturating_add(1))
        .or(numbered.then_some(1))
    else {
        name.push_str(base);
        return name;
    };

    let mut suffix = Label::<NUMBER_BYTES>::new();
    write!(suffix, " {number}").expect("writing to a label never fails");
    let room = NAME_BYTES - suffix.as_str().len();
    name.push_str(&base[..base.floor_char_boundary(room)]);
    name.push_str(suffix.as_str());
    name
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::pool::SoundNumber;
    use std::boxed::Box;

    fn pool_of(names: &[&str]) -> Box<Pool> {
        let mut pool = Box::new(Pool::new());
        for name in names {
            pool.add_named(name);
        }
        pool
    }

    #[test]
    fn names_follow_the_owners_table() {
        let mut synths = pool_of(&[]);
        assert_eq!(next_name(&synths, "Syn", true).as_str(), "Syn 1");
        synths.new_synth().unwrap();
        synths.new_synth().unwrap();
        assert_eq!(next_name(&synths, "Syn", true).as_str(), "Syn 3");
        let copy = synths.copy(SoundNumber(1)).unwrap();
        assert_eq!(synths.get(copy).unwrap().name.as_str(), "Syn 3");

        let kick = pool_of(&["Kick"]);
        assert_eq!(next_name(&kick, "Kick", false).as_str(), "Kick 2");
        let kicks = pool_of(&["Kick", "Kick 2"]);
        assert_eq!(next_name(&kicks, "Kick", true).as_str(), "Kick 3");
        assert_eq!(next_name(&kicks, "Kick", false).as_str(), "Kick 3");

        assert_eq!(next_name(&pool_of(&[]), "Kick", false).as_str(), "Kick");
        assert_eq!(next_name(&pool_of(&[]), "Kick", true).as_str(), "Kick 1");
    }

    #[test]
    fn the_highest_number_of_the_base_counts_not_the_count_of_its_sounds() {
        let pool = pool_of(&["Syn 1", "Syn 2", "Syn 7", "Kick 9"]);

        assert_eq!(next_name(&pool, "Syn", true).as_str(), "Syn 8");
        assert_eq!(next_name(&pool, "Kick", true).as_str(), "Kick 10");
        assert_eq!(next_name(&pool, "Hat", true).as_str(), "Hat 1");
    }

    #[test]
    fn only_the_whole_base_counts() {
        let pool = pool_of(&["Hat open 12", "Hat", "Hats 40"]);

        assert_eq!(next_name(&pool, "Hat open", false).as_str(), "Hat open 13");
        assert_eq!(next_name(&pool, "Hat", false).as_str(), "Hat 2");
        assert_eq!(next_name(&pool, "Ha", false).as_str(), "Ha");
    }

    #[test]
    fn split_reads_a_trailing_space_and_digits_as_the_number() {
        assert_eq!(split("Hat open 12"), ("Hat open", 12));
        assert_eq!(split("Kick"), ("Kick", 1));
        assert_eq!(split("Syn 1"), ("Syn", 1));
        assert_eq!(split("Kick 007"), ("Kick", 7));
        assert_eq!(split("Kick 0"), ("Kick", 0));
    }

    #[test]
    fn split_leaves_anything_else_in_the_base() {
        assert_eq!(split(""), ("", 1));
        assert_eq!(split("808"), ("808", 1));
        assert_eq!(split("Kick "), ("Kick ", 1));
        assert_eq!(split("Kick 2b"), ("Kick 2b", 1));
        assert_eq!(split("Kick -2"), ("Kick -2", 1));
        assert_eq!(split("Kick +2"), ("Kick +2", 1));
        assert_eq!(split("Kick ٣"), ("Kick ٣", 1));
        assert_eq!(split("Kick 4294967296"), ("Kick 4294967296", 1));
        assert_eq!(split("Kick 4294967295"), ("Kick", u32::MAX));
        assert_eq!(split(" 5"), ("", 5));
    }

    #[test]
    fn a_long_base_is_shortened_to_fit_64_bytes() {
        // 70 bytes, ending in multibyte letters.
        let base = "b".repeat(62) + "ščřž";
        let pool = pool_of(&[&base]);

        let name = next_name(&pool, &base, false);

        assert_eq!(base.len(), 70);
        assert_eq!(name.as_str(), "b".repeat(62) + " 2");
        assert_eq!(name.as_str().len(), 64);
    }

    #[test]
    fn a_base_is_cut_at_a_character_boundary() {
        // 61 bytes, then two letters of two bytes each: the cut at 62 falls inside the first.
        let base = "a".repeat(61) + "žž";
        let pool = pool_of(&[&base]);
        let original = pool.sounds()[0].name;

        let name = next_name(&pool, original.as_str(), false);

        assert_eq!(original.as_str(), "a".repeat(61) + "ž");
        assert_eq!(name.as_str(), "a".repeat(61) + " 2");
    }

    #[test]
    fn a_shortened_base_keeps_counting_with_the_sounds_made_from_it() {
        let base = "c".repeat(62) + "žž";
        let mut pool = pool_of(&[&base]);

        let second = pool.copy(SoundNumber(1)).unwrap();
        let third = pool.copy(SoundNumber(1)).unwrap();
        let fourth = pool.copy(second).unwrap();

        for (sound, number) in [(second, 2), (third, 3), (fourth, 4)] {
            let name = pool.get(sound).unwrap().name;
            assert!(name.as_str().len() <= 64, "{name:?}");
            assert_eq!(split(name.as_str()).1, number, "{name:?}");
        }
    }

    #[test]
    fn a_number_of_ten_digits_still_fits_the_name() {
        let pool = pool_of(&[&("d".repeat(53) + " 4294967294")]);

        let name = next_name(&pool, &"d".repeat(70), false);

        assert_eq!(name.as_str(), "d".repeat(53) + " 4294967295");
    }

    #[test]
    fn the_highest_possible_number_stops_at_the_highest() {
        let pool = pool_of(&["Syn 4294967295"]);

        assert_eq!(next_name(&pool, "Syn", true).as_str(), "Syn 4294967295");
    }
}
