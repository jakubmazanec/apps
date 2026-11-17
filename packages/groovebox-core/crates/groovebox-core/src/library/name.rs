use crate::audio::SAMPLE_RATE;
use crate::font;
use crate::label::Label;
use core::cmp::Ordering;
use core::fmt::{self, Write};
use core::iter;

const EXTENSION: &str = ".wav";
const FILE_BYTES: usize = 64;
const FOLDER_BYTES: usize = 32;
/// What a name becomes when nothing is left of it, before ".wav" for a file.
const EMPTY_NAME: &str = "sample";

/// Writes `arguments` into a label; what does not fit is cut.
fn written<const N: usize>(arguments: fmt::Arguments) -> Label<N> {
    let mut label = Label::new();
    label
        .write_fmt(arguments)
        .expect("writing to a label never fails");
    label
}

/// `numerator` over `denominator`, rounded half up.
fn rounded(numerator: u64, denominator: u64) -> u64 {
    (numerator + denominator / 2) / denominator
}

/// A number of tenths, written with its decimal point.
struct Tenths(u64);

impl fmt::Display for Tenths {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}", self.0 / 10, self.0 % 10)
    }
}

/// The letters the font draws, the digits and the marks space, dash, underscore and dot.
fn is_kept(c: char) -> bool {
    c.is_ascii_digit()
        || matches!(c, ' ' | '-' | '_' | '.')
        || (c.is_alphabetic() && font::glyph(c).code == c as u32)
}

/// The kept characters of `text` in at most `room` bytes: the rest is cut at a character boundary.
/// Spaces come singly and never lead or trail, so removed characters leave no gaps, and dots never
/// lead, so a name is never "." or ".." and never hidden.
fn reduce<const N: usize>(text: &str, room: usize) -> Label<N> {
    let mut name = Label::new();
    let mut space = false;
    for c in text.chars().filter(|&c| is_kept(c)) {
        if c == ' ' {
            space = true;
            continue;
        }
        if c == '.' && name.as_str().is_empty() {
            continue;
        }
        let gap = if space && !name.as_str().is_empty() {
            " "
        } else {
            ""
        };
        if name.as_str().len() + gap.len() + c.len_utf8() > room {
            break;
        }
        name.push_str(gap);
        name.push_str(c.encode_utf8(&mut [0; 4]));
        space = false;
    }
    if name.as_str().is_empty() {
        name.push_str(EMPTY_NAME);
    }
    name
}

/// `name` as its stem and its ending, which is ".wav" in any case and stays as it was written. A
/// name without that ending is all stem and gets ".wav".
fn split_extension(name: &str) -> (&str, &str) {
    match name
        .len()
        .checked_sub(EXTENSION.len())
        .and_then(|at| name.split_at_checked(at))
    {
        Some((stem, extension)) if extension.eq_ignore_ascii_case(EXTENSION) => (stem, extension),
        _ => (name, EXTENSION),
    }
}

/// `original` as a file name of the library.
pub fn file_name(original: &str) -> Label<FILE_BYTES> {
    let (stem, extension) = split_extension(original.trim());
    let mut name = reduce(stem, FILE_BYTES - EXTENSION.len());
    name.push_str(extension);
    name
}

/// `original` as a folder name of the library. Windows drops the dots that end a name, so they go.
pub fn folder_name(original: &str) -> Label<FOLDER_BYTES> {
    let name = reduce::<FOLDER_BYTES>(original, FOLDER_BYTES);
    let mut folder = Label::new();
    folder.push_str(name.as_str().trim_end_matches(['.', ' ']));
    folder
}

/// Names that differ only in case are the same.
pub fn same(a: &str, b: &str) -> bool {
    a.chars()
        .flat_map(char::to_lowercase)
        .eq(b.chars().flat_map(char::to_lowercase))
}

/// The letter a lowercase character is sorted as: its plain letter when it is a plain letter with
/// an accent, a stroke or a dot (Latin-1 Supplement and Latin Extended-A), else itself, so that
/// ligatures and letters of their own (æ ð þ ß ĳ ŉ ĸ ŋ œ) come after z.
fn plain(c: char) -> char {
    match c {
        'à'..='å' | 'ā'..='ą' => 'a',
        'ç' | 'ć'..='č' => 'c',
        'ď'..='đ' => 'd',
        'è'..='ë' | 'ē'..='ě' => 'e',
        'ĝ'..='ģ' => 'g',
        'ĥ'..='ħ' => 'h',
        'ì'..='ï' | 'ĩ'..='ı' => 'i',
        'ĵ' => 'j',
        'ķ' => 'k',
        'ĺ'..='ł' => 'l',
        'ñ' | 'ń'..='ň' => 'n',
        'ò'..='ö' | 'ø' | 'ō'..='ő' => 'o',
        'ŕ'..='ř' => 'r',
        'ś'..='š' | 'ſ' => 's',
        'ţ'..='ŧ' => 't',
        'ù'..='ü' | 'ũ'..='ų' => 'u',
        'ŵ' => 'w',
        'ý' | 'ÿ' | 'ŷ' => 'y',
        'ź'..='ž' => 'z',
        _ => c,
    }
}

fn key(name: &str) -> impl Iterator<Item = char> + '_ {
    name.chars().flat_map(char::to_lowercase).map(plain)
}

/// Orders two keys by their characters, a run of digits counting as its number, so "2" comes before
/// "10". The run's length without its leading zeros settles it first, then its digits one by one, so
/// no run is too long. Only when nothing else tells the keys apart does the run with fewer leading
/// zeros come first.
fn compare_keys(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (key(a).peekable(), key(b).peekable());
    let mut zeros = Ordering::Equal;
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let a_zeros = iter::from_fn(|| a.next_if_eq(&'0')).count();
                let b_zeros = iter::from_fn(|| b.next_if_eq(&'0')).count();
                zeros = zeros.then(a_zeros.cmp(&b_zeros));
                let mut first_difference = Ordering::Equal;
                let longer = loop {
                    match (
                        a.next_if(char::is_ascii_digit),
                        b.next_if(char::is_ascii_digit),
                    ) {
                        (Some(x), Some(y)) => first_difference = first_difference.then(x.cmp(&y)),
                        (x, y) => break x.cmp(&y),
                    }
                };
                let numbers = longer.then(first_difference);
                if numbers.is_ne() {
                    return numbers;
                }
            }
            (Some(x), Some(y)) if x == y => {
                a.next();
                b.next();
            }
            (x, y) => return x.cmp(&y).then(zeros),
        }
    }
}

/// The order of the library: by lowercase letters with accents folded away and runs of digits as
/// numbers, each name without its ".wav" so that "kick.wav" comes before "kick 2.wav", then by bytes.
pub fn order(a: &str, b: &str) -> Ordering {
    compare_keys(split_extension(a).0, split_extension(b).0).then_with(|| a.cmp(b))
}

/// Frames at 48 kHz: tenths of a second below a minute, else minutes and seconds. It rounds first
/// and then chooses the form, so 59.96 s reads "1:00".
pub fn length(frames: u32) -> Label<16> {
    let frames = u64::from(frames);
    let rate = u64::from(SAMPLE_RATE);
    let tenths = rounded(frames * 10, rate);
    if tenths < 600 {
        return written(format_args!("{} s", Tenths(tenths)));
    }
    let seconds = rounded(frames, rate);
    written(format_args!("{}:{:02}", seconds / 60, seconds % 60))
}

/// Bytes, a KB being 1,000 bytes: whole KB below 1,000 KB, else tenths of a MB.
pub fn size(bytes: u64) -> Label<16> {
    let kilobytes = rounded(bytes, 1_000);
    if kilobytes < 1_000 {
        return written(format_args!("{kilobytes} KB"));
    }
    written(format_args!("{} MB", Tenths(rounded(bytes, 100_000))))
}

/// The library meter: "41.2 of 64 MB", a MB being 1,000,000 bytes.
pub fn meter(used: u64, total: u64) -> Label<24> {
    written(format_args!(
        "{} of {} MB",
        Tenths(rounded(used, 100_000)),
        rounded(total, 1_000_000)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::string::ToString;
    use std::vec::Vec;

    #[test]
    fn names_keep_letters_digits_and_four_marks() {
        assert_eq!(file_name("Kick #1 (dry).WAV").as_str(), "Kick 1 dry.WAV");
        assert_eq!(file_name("  Říkanka.wav ").as_str(), "Říkanka.wav");
        assert_eq!(file_name("a-b_c.d.wav").as_str(), "a-b_c.d.wav");
        assert_eq!(file_name("漢字.wav").as_str(), "sample.wav");
        assert_eq!(file_name(".wav").as_str(), "sample.wav");
        assert_eq!(folder_name("Drums & Bass!").as_str(), "Drums Bass");
        assert_eq!(folder_name("漢字").as_str(), "sample");
    }

    #[test]
    fn a_name_that_does_not_end_in_dot_wav_gets_it() {
        assert_eq!(file_name("").as_str(), "sample.wav");
        assert_eq!(file_name("abc").as_str(), "abc.wav");
        assert_eq!(file_name("漢字").as_str(), "sample.wav");
        assert!(file_name("kick.waΩ").as_str().ends_with(".wav"));
        assert_eq!(file_name("kick.mp3").as_str(), "kick.mp3.wav");
    }

    #[test]
    fn a_name_is_never_a_dot_or_hidden() {
        assert_eq!(file_name("..wav").as_str(), "sample.wav");
        assert_eq!(file_name(".hidden.wav").as_str(), "hidden.wav");
        assert_eq!(file_name(" . ..a.wav").as_str(), "a.wav");
        assert_eq!(folder_name("..").as_str(), "sample");
        assert_eq!(folder_name(".").as_str(), "sample");
        assert_eq!(folder_name(". .").as_str(), "sample");
        assert_eq!(folder_name(".hidden").as_str(), "hidden");
    }

    #[test]
    fn a_folder_name_does_not_end_in_a_dot() {
        assert_eq!(folder_name("drums.").as_str(), "drums");
        assert_eq!(folder_name("drums . .").as_str(), "drums");
        assert_eq!(folder_name("drums.#").as_str(), "drums");
        assert_eq!(folder_name("v1.2").as_str(), "v1.2");
        assert_eq!(
            folder_name(&("a".repeat(31) + ".b")).as_str(),
            "a".repeat(31)
        );
    }

    #[test]
    fn removed_characters_leave_no_double_space() {
        assert_eq!(
            file_name("Kick # (dry)   hard .wav").as_str(),
            "Kick dry hard.wav"
        );
        assert_eq!(folder_name("a  #  b").as_str(), "a b");
    }

    #[test]
    fn long_names_are_cut_at_a_character_boundary_keeping_dot_wav() {
        let name = file_name(&("ž".repeat(70) + ".wav"));

        assert!(name.as_str().len() <= 64);
        assert!(name.as_str().ends_with(".wav"));
        assert_eq!(name.as_str(), "ž".repeat(30) + ".wav");
        assert!(folder_name(&"b".repeat(40)).as_str().len() <= 32);
        assert_eq!(folder_name(&"ž".repeat(40)).as_str(), "ž".repeat(16));
    }

    #[test]
    fn a_cut_never_leaves_a_space_before_dot_wav() {
        let name = file_name(&("a".repeat(59) + " b.wav"));

        assert_eq!(name.as_str(), "a".repeat(59) + ".wav");
    }

    #[test]
    fn case_does_not_make_a_new_name() {
        assert!(same("Kick.wav", "KICK.WAV"));
        assert!(same("Říkanka.wav", "říkanka.WAV"));
        assert!(!same("Kick.wav", "Kick-2.wav"));
        assert!(!same("rikanka.wav", "říkanka.wav"));
    }

    #[test]
    fn names_sort_ignoring_case_and_accents() {
        let mut names = [
            "rim.wav",
            "hat-closed.wav",
            "říkanka.wav",
            "Clap.wav",
            "déšť.wav",
        ];

        names.sort_by(|a, b| order(a, b));

        assert_eq!(
            names,
            [
                "Clap.wav",
                "déšť.wav",
                "hat-closed.wav",
                "říkanka.wav",
                "rim.wav"
            ]
        );
    }

    #[test]
    fn names_that_differ_only_in_case_or_accents_sort_by_bytes() {
        assert_eq!(order("Kick.wav", "kick.wav"), Ordering::Less);
        assert_eq!(order("kick.wav", "kick.wav"), Ordering::Equal);
        assert_eq!(order("resume.wav", "résumé.wav"), Ordering::Less);
        assert_eq!(order("zebra.wav", "Ábel.wav"), Ordering::Greater);
    }

    #[test]
    fn a_run_of_digits_sorts_by_its_value() {
        let mut names = ["kick 10.wav", "Kick 2.wav", "kick 1.wav", "kick 9.wav"];

        names.sort_by(|a, b| order(a, b));

        assert_eq!(
            names,
            ["kick 1.wav", "Kick 2.wav", "kick 9.wav", "kick 10.wav"]
        );
        assert_eq!(order("take 2 b.wav", "take 10 a.wav"), Ordering::Less);
        assert_eq!(order("a9.wav", "a_.wav"), Ordering::Less);
        assert_eq!(order("a-.wav", "a9.wav"), Ordering::Less);
    }

    #[test]
    fn a_name_comes_before_the_same_name_with_more_after_it() {
        assert_eq!(order("kick.wav", "kick 2.wav"), Ordering::Less);
        assert_eq!(order("kick.wav", "kick-2.wav"), Ordering::Less);
        assert_eq!(order("kick.wav", "kick2.wav"), Ordering::Less);
        assert_eq!(order("kick.WAV", "kick 2.wav"), Ordering::Less);
    }

    #[test]
    fn equal_numbers_sort_by_their_leading_zeros_then_by_bytes() {
        assert_eq!(order("a1.wav", "a01.wav"), Ordering::Less);
        assert_eq!(order("a01.wav", "a1.wav"), Ordering::Greater);
        assert_eq!(order("a0.wav", "a00.wav"), Ordering::Less);
        assert_eq!(order("a01b.wav", "a1c.wav"), Ordering::Less);
        assert_eq!(order("a01.wav", "a001.wav"), Ordering::Less);
        assert_eq!(order("a01.wav", "A01.wav"), Ordering::Greater);
    }

    #[test]
    fn a_run_of_digits_of_any_length_sorts_without_overflow() {
        let forty = "9".repeat(40);
        let shorter = "9".repeat(39);
        let next = "1".to_string() + &"0".repeat(40);

        assert_eq!(
            order(&(forty.clone() + ".wav"), &(shorter + ".wav")),
            Ordering::Greater
        );
        assert_eq!(
            order(&(forty.clone() + ".wav"), &(next + ".wav")),
            Ordering::Less
        );
        assert_eq!(
            order(&("0".repeat(40) + &forty + "8.wav"), &(forty + "9.wav")),
            Ordering::Less
        );
    }

    #[test]
    fn the_order_is_total() {
        let mut names = std::vec![std::string::String::new()];
        let mut longest = names.clone();
        for _ in 0..3 {
            longest = longest
                .iter()
                .flat_map(|name| ["0", "1", "2", " ", "a"].map(|c| std::format!("{name}{c}")))
                .collect();
            names.extend(longest.clone());
        }
        let orders: Vec<Vec<Ordering>> = names
            .iter()
            .map(|a| names.iter().map(|b| order(a, b)).collect())
            .collect();

        for a in 0..names.len() {
            for b in 0..names.len() {
                assert_eq!(orders[a][b], orders[b][a].reverse(), "{a} {b}");
                if orders[a][b].is_le() {
                    for c in 0..names.len() {
                        assert!(
                            orders[b][c].is_gt() || orders[a][c].is_le(),
                            "{:?} {:?} {:?}",
                            names[a],
                            names[b],
                            names[c]
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn every_accented_letter_folds_to_its_plain_letter() {
        let folded = [
            ('a', "àáâãäåāăą"),
            ('c', "çćĉċč"),
            ('d', "ďđ"),
            ('e', "èéêëēĕėęě"),
            ('g', "ĝğġģ"),
            ('h', "ĥħ"),
            ('i', "ìíîïĩīĭįıİ"),
            ('j', "ĵ"),
            ('k', "ķ"),
            ('l', "ĺļľŀł"),
            ('n', "ñńņň"),
            ('o', "òóôõöøōŏő"),
            ('r', "ŕŗř"),
            ('s', "śŝşšſ"),
            ('t', "ţťŧ"),
            ('u', "ùúûüũūŭůűų"),
            ('w', "ŵ"),
            ('y', "ýÿŷŸ"),
            ('z', "źżž"),
        ];
        for (plain, accented) in folded {
            for c in accented.chars() {
                assert_eq!(key(&c.to_string()).next(), Some(plain), "{c}");
                assert_eq!(
                    key(&c.to_uppercase().to_string()).next(),
                    Some(plain),
                    "{c}"
                );
            }
        }
    }

    #[test]
    fn a_letter_with_no_plain_letter_stays_after_z() {
        // Every other letter of Latin-1 Supplement and Latin Extended-A folds to a plain letter.
        let unfolded = "æðþßĳŉĸŋœ";
        for c in ('\u{c0}'..='\u{17f}').filter(|c| c.is_alphabetic()) {
            let key: Vec<char> = key(&c.to_string()).collect();
            if unfolded.contains(c.to_lowercase().next().unwrap()) {
                assert!(key[0] > 'z', "{c}");
            } else {
                assert!(key[0].is_ascii_lowercase(), "{c}");
            }
        }
    }

    #[test]
    fn lengths_read_as_on_the_picker() {
        assert_eq!(length(19_200).as_str(), "0.4 s");
        assert_eq!(length(672_000).as_str(), "14.0 s");
        assert_eq!(length(2_878_080).as_str(), "1:00");
        assert_eq!(length(15_840_000).as_str(), "5:30");
        assert_eq!(length(0).as_str(), "0.0 s");
        assert_eq!(length(2).as_str(), "0.0 s");
        assert_eq!(length(2_399).as_str(), "0.0 s");
        assert_eq!(length(2_400).as_str(), "0.1 s");
        assert_eq!(length(2_877_599).as_str(), "59.9 s");
        assert_eq!(length(2_877_600).as_str(), "1:00");
        assert_eq!(length(5_735_999).as_str(), "1:59");
        assert_eq!(length(5_736_000).as_str(), "2:00");
        assert_eq!(length(u32::MAX).as_str(), "1491:18");
    }

    #[test]
    fn sizes_read_as_on_the_picker() {
        assert_eq!(size(38_400).as_str(), "38 KB");
        assert_eq!(size(999_499).as_str(), "999 KB");
        assert_eq!(size(999_500).as_str(), "1.0 MB");
        assert_eq!(size(31_700_000).as_str(), "31.7 MB");
        assert_eq!(size(0).as_str(), "0 KB");
        assert_eq!(size(499).as_str(), "0 KB");
        assert_eq!(size(500).as_str(), "1 KB");
        assert_eq!(size(2_649_999).as_str(), "2.6 MB");
        assert_eq!(size(2_650_000).as_str(), "2.7 MB");
    }

    #[test]
    fn the_meter_reads_tenths_of_64_mb() {
        assert_eq!(meter(41_200_000, 64_000_000).as_str(), "41.2 of 64 MB");
        assert_eq!(meter(0, 64_000_000).as_str(), "0.0 of 64 MB");
        assert_eq!(meter(49_999, 64_000_000).as_str(), "0.0 of 64 MB");
        assert_eq!(meter(50_000, 64_000_000).as_str(), "0.1 of 64 MB");
        assert_eq!(meter(64_000_000, 64_000_000).as_str(), "64.0 of 64 MB");
    }
}
