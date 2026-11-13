/// The distance in pixels from one character's cell to the next. The font is monospaced, and each
/// glyph leaves its last column blank.
pub const ADVANCE: i32 = 6;

/// One character of the font, as ink in a cell of 6 x 12 pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Glyph {
    pub code: u32,
    /// How far the glyph's leftmost column lies right of the cell's left edge (left of it when
    /// negative).
    pub x: i8,
    /// How far the glyph's first row lies below the cell's top edge.
    pub y: i8,
    pub width: u8,
    pub height: u8,
    /// The glyph's `height` rows of ink, from its first row. Bit 7 is the leftmost column.
    pub rows: [u8; 12],
}

// `build.rs` reads the font's files and writes `GLYPHS`, sorted by code point.
include!(concat!(env!("OUT_DIR"), "/font.rs"));

/// The glyph of `c`, or of `?` when the font has none.
pub fn glyph(c: char) -> &'static Glyph {
    let find = |code: u32| {
        GLYPHS
            .binary_search_by_key(&code, |glyph| glyph.code)
            .ok()
            .map(|index| &GLYPHS[index])
    };
    find(c as u32)
        .or_else(|| find('?' as u32))
        .expect("the font has a question mark")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_czech_letter_and_symbol_has_its_own_glyph() {
        let characters = "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž←↑→↓▲▶▼◀•…";

        for c in characters.chars() {
            assert_eq!(glyph(c).code, c as u32, "{c}");
        }
    }

    #[test]
    fn a_missing_character_draws_as_a_question_mark() {
        assert_eq!(glyph('\u{4e00}').code, '?' as u32);
    }

    #[test]
    fn the_table_is_sorted_by_code_point_without_repeats() {
        assert!(GLYPHS.windows(2).all(|pair| pair[0].code < pair[1].code));
    }

    #[test]
    fn a_glyph_keeps_its_offsets_and_its_ink_as_bits() {
        assert_eq!(
            *glyph('H'),
            Glyph {
                code: 'H' as u32,
                x: 0,
                y: 3,
                width: 5,
                height: 7,
                rows: [
                    0b1000_1000,
                    0b1000_1000,
                    0b1000_1000,
                    0b1111_1000,
                    0b1000_1000,
                    0b1000_1000,
                    0b1000_1000,
                    0,
                    0,
                    0,
                    0,
                    0,
                ],
            }
        );
        // The space is blank, and it reaches into the cell on its left.
        assert_eq!((glyph(' ').x, glyph(' ').y), (-1, 11));
        assert_eq!(glyph(' ').rows, [0; 12]);
    }

    #[test]
    fn every_character_advances_six_pixels() {
        assert_eq!(ADVANCE, 6);
    }
}
