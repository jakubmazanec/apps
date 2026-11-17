use crate::{
    font::glyph,
    palette::{ACCENT, DIM, FAINT, TEXT},
    screen::Canvas,
    ui::{
        layout::{BAR_HEIGHT, DIGIT_COLUMN, ITEM_BAR, PIECE_GAP, TEXT_INSET, rect},
        text,
    },
};

/// The bar under an item.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Bar {
    /// The faint track alone.
    Track,
    /// The track with an accent fill from the left: a part of the bar, the first number out of the
    /// second, rounded to the nearest pixel (half a pixel rounds up).
    Fill(u64, u64),
}

/// What an item shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ItemView<'a> {
    /// The number, from 1 to 4, of the encoder that holds the item.
    pub encoder: Option<u8>,
    pub name: &'a str,
    pub value: &'a str,
    pub bar: Bar,
}

/// Draws `item` in the 17 pixel high box at (`x`, `y`) of `width` pixels. The name is at the left
/// and dim, the value at the right and bright, and the bar is under them. A name that does not fit
/// is shortened to leave the whole value and 6 pixels between them, or scrolls in that room with
/// `scroll` (`text::draw_in`). When `numbered`, as on a page, the name comes after the encoder's dim
/// digit, or after the blank where an item without an encoder would have one. Returns whether the
/// name scrolls.
pub fn draw_item(
    canvas: &mut impl Canvas,
    x: i32,
    y: i32,
    width: i32,
    item: &ItemView,
    numbered: bool,
    scroll: Option<u64>,
) -> bool {
    let left = x + TEXT_INSET;
    let right = x + width - 1 - TEXT_INSET;
    let name = if numbered { left + DIGIT_COLUMN } else { left };
    if numbered
        && let Some(digit) = item
            .encoder
            .and_then(|encoder| char::from_digit(u32::from(encoder), 10))
    {
        canvas.glyph(left, y, glyph(digit), DIM);
    }
    text::draw_right(canvas, right, y, item.value, TEXT);
    // The name has the room up to 6 pixels before the value.
    let scrolls = text::draw_in(
        canvas,
        name,
        y,
        right - text::width(item.value) + 1 - PIECE_GAP - name,
        item.name,
        scroll,
        DIM,
    );

    let bar = (width - 2 * TEXT_INSET).max(0);
    canvas.fill_rect(rect(left, y + ITEM_BAR, bar, BAR_HEIGHT), FAINT);
    if let Bar::Fill(part, whole) = item.bar {
        canvas.fill_rect(
            rect(
                left,
                y + ITEM_BAR,
                ((2 * bar as u64 * part + whole) / (2 * whole)) as i32,
                BAR_HEIGHT,
            ),
            ACCENT,
        );
    }
    scrolls
}

/// Draws the cursor on the box at (`x`, `y`) of `width` by `height` pixels: an accent outline 1
/// pixel outside it.
pub fn draw_cursor(canvas: &mut impl Canvas, x: i32, y: i32, width: i32, height: i32) {
    canvas.outline_rect(rect(x - 1, y - 1, width + 2, height + 2), ACCENT);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{ACCENT, BACKGROUND, DIM, FAINT, TEXT};
    use crate::screen::Screen;
    use crate::ui::test_pixels::{MOVED, filled, ink, outlined, picture, span};
    use crate::ui::text;

    fn item<'a>(name: &'a str, value: &'a str, bar: Bar) -> ItemView<'a> {
        ItemView {
            encoder: None,
            name,
            value,
            bar,
        }
    }

    #[test]
    fn a_page_item_matches_sound_pad_png() {
        let mut screen = Screen::new();

        draw_item(
            &mut screen,
            2,
            17,
            160,
            &ItemView {
                encoder: Some(1),
                name: "Sound",
                value: "Snare",
                bar: Bar::Track,
            },
            true,
            None,
        );

        // The bar: a faint track two pixels thick, one pixel below the text row and one above the
        // end of the item, from 3 pixels inside on both sides.
        assert!(filled(&screen, 5..=158, 31..=32, FAINT));
        assert!(filled(&screen, 5..=158, 30..=30, BACKGROUND));
        assert!(filled(&screen, 5..=158, 33..=33, BACKGROUND));
        assert!(filled(&screen, 2..=4, 31..=32, BACKGROUND));
        assert!(filled(&screen, 159..=161, 31..=32, BACKGROUND));
        // The encoder's digit and the name, dim; the value, bright, ending 3 pixels inside.
        assert_eq!(
            picture(&screen, 5..=9, 20..=26, DIM),
            [
                "..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"
            ]
        );
        assert_eq!(span(&screen, 2..=15, 17..=29, DIM), Some((5, 9)));
        assert_eq!(span(&screen, 10..=100, 17..=29, DIM), Some((16, 44)));
        assert_eq!(span(&screen, 2..=161, 17..=29, TEXT), Some((130, 158)));
        assert_eq!(ink(&screen, ACCENT), 0);
    }

    #[test]
    fn the_name_of_an_item_without_an_encoder_keeps_the_column_blank() {
        let mut screen = Screen::new();

        draw_item(
            &mut screen,
            2,
            89,
            160,
            &item("Key follow", "50%", Bar::Track),
            true,
            None,
        );

        assert_eq!(span(&screen, 2..=161, 89..=101, DIM), Some((16, 74)));
        assert_eq!(span(&screen, 2..=161, 89..=101, TEXT), Some((142, 158)));
    }

    #[test]
    fn an_item_in_the_strip_has_no_digit_and_its_name_starts_3_pixels_in() {
        let mut screen = Screen::new();

        draw_item(
            &mut screen,
            1,
            255,
            120,
            &ItemView {
                encoder: Some(1),
                ..item("Mode", "LP 24", Bar::Track)
            },
            false,
            None,
        );
        draw_item(
            &mut screen,
            121,
            255,
            120,
            &item("Cutoff", "64%", Bar::Track),
            false,
            None,
        );

        assert_eq!(span(&screen, 1..=120, 258..=264, DIM), Some((4, 26)));
        assert_eq!(span(&screen, 1..=120, 258..=264, TEXT), Some((89, 117)));
        assert_eq!(span(&screen, 121..=240, 258..=264, DIM), Some((124, 158)));
        assert_eq!(span(&screen, 121..=240, 258..=264, TEXT), Some((221, 237)));
        assert!(filled(&screen, 4..=117, 269..=270, FAINT));
        assert!(filled(&screen, 124..=237, 269..=270, FAINT));
    }

    #[test]
    fn a_fill_is_the_accent_from_the_left_rounded_to_the_nearest_pixel() {
        // The bar of a 120 pixel item is 114 pixels, 4 to 117; of a 476 pixel item, 470.
        for (width, part, whole, pixels) in [
            (120, 0, 65_535, 0),
            // 0.4992, 0.5 and 0.5010 of a pixel.
            (120, 287, 65_535, 0),
            (120, 1, 228, 1),
            (120, 288, 65_535, 1),
            // 113.4990 and 113.5008.
            (120, 65_247, 65_535, 113),
            (120, 65_248, 65_535, 114),
            (120, 65_535, 65_535, 114),
            // 13.68: 12%, Resonance's value in Milestone 1's pictures.
            (120, 12, 100, 14),
            // 302.56: the library meter at 41.2 of 64 MB in samples.png.
            (476, 41_200_000, 64_000_000, 303),
        ] {
            let mut screen = Screen::new();
            let bar = width as usize - 6;

            draw_item(
                &mut screen,
                1,
                255,
                width,
                &item("Cutoff", "64%", Bar::Fill(part, whole)),
                false,
                None,
            );

            assert_eq!(ink(&screen, ACCENT), 2 * pixels, "{part} of {whole}");
            assert_eq!(ink(&screen, FAINT), 2 * (bar - pixels), "{part} of {whole}");
            assert!(filled(&screen, 4..=3 + pixels, 269..=270, ACCENT));
            assert!(filled(&screen, 4 + pixels..=3 + bar, 269..=270, FAINT));
        }
    }

    #[test]
    fn a_long_name_gives_way_to_the_value() {
        let mut screen = Screen::new();
        let mut name = Screen::new();

        // 119 pixels wide, as the strip's third cell.
        draw_item(
            &mut screen,
            241,
            255,
            119,
            &item("Sample", "Hat open take3", Bar::Track),
            false,
            None,
        );
        text::draw(&mut name, 244, 255, "Sam…", DIM);

        assert_eq!(span(&screen, 241..=359, 258..=264, TEXT), Some((274, 356)));
        assert_eq!(span(&screen, 241..=359, 258..=264, DIM), Some((244, 266)));
        assert_eq!(
            picture(&screen, 244..=270, 255..=267, DIM),
            picture(&name, 244..=270, 255..=267, DIM)
        );
    }

    #[test]
    fn the_name_and_the_value_keep_6_pixels_apart_as_in_sound_sample_png() {
        let mut screen = Screen::new();

        draw_item(
            &mut screen,
            1,
            255,
            120,
            &item("Sample", "snare-room.wav", Bar::Track),
            false,
            None,
        );

        // "Samp…" would end at x 32, 2 pixels short of the 6 the value needs.
        assert_eq!(span(&screen, 1..=120, 258..=264, DIM), Some((4, 26)));
        assert_eq!(span(&screen, 1..=120, 258..=264, TEXT), Some((35, 117)));
    }

    #[test]
    fn a_name_that_fits_with_a_pixel_to_spare_stays_whole() {
        let mut screen = Screen::new();

        // sound-filter.png's fourth cell: the name ends at x 451 and the value starts at 459.
        draw_item(
            &mut screen,
            360,
            255,
            119,
            &item("Envelope amount", "+40", Bar::Track),
            false,
            None,
        );

        assert_eq!(span(&screen, 360..=478, 258..=264, DIM), Some((363, 451)));
        assert_eq!(span(&screen, 360..=478, 258..=264, TEXT), Some((459, 475)));
    }

    #[test]
    fn a_name_whose_value_leaves_no_room_is_not_drawn() {
        let mut screen = Screen::new();

        draw_item(
            &mut screen,
            0,
            0,
            40,
            &item("Resonance", "Very long value", Bar::Track),
            false,
            None,
        );

        assert_eq!(ink(&screen, DIM), 0);
    }

    fn fine_tune(scroll: Option<u64>) -> (bool, Screen) {
        let mut screen = Screen::new();
        let scrolls = draw_item(
            &mut screen,
            2,
            143,
            160,
            &item("Oscillator 2 fine tune", "+0", Bar::Fill(50, 100)),
            true,
            scroll,
        );
        (scrolls, screen)
    }

    #[test]
    fn the_name_under_the_cursor_scrolls_and_the_value_stays() {
        let (scrolls, moved) = fine_tune(Some(MOVED));
        let (still, shortened) = fine_tune(None);
        let mut expected = Screen::new();
        draw_item(
            &mut expected,
            2,
            143,
            160,
            &item("Oscillator 2 fine tu…", "+0", Bar::Fill(50, 100)),
            true,
            None,
        );

        assert!(scrolls);
        assert_eq!(
            picture(&moved, 148..=158, 143..=159, TEXT),
            picture(&shortened, 148..=158, 143..=159, TEXT)
        );
        let (first, last) = span(&moved, 2..=161, 143..=155, DIM).unwrap();
        assert!(first >= 16 && last <= 141, "{first} to {last}");
        assert_ne!(
            picture(&moved, 16..=141, 143..=155, DIM),
            picture(&shortened, 16..=141, 143..=155, DIM)
        );
        assert!(!still);
        assert_eq!(shortened.pixels(), expected.pixels());
    }

    #[test]
    fn a_name_that_fits_does_not_scroll() {
        let draw = |scroll| {
            let mut screen = Screen::new();
            let scrolls = draw_item(
                &mut screen,
                2,
                17,
                160,
                &item("Cutoff", "64%", Bar::Track),
                true,
                scroll,
            );
            (scrolls, screen)
        };
        let (scrolls, moved) = draw(Some(MOVED));
        let (_, still) = draw(None);

        assert!(!scrolls);
        assert_eq!(moved.pixels(), still.pixels());
    }

    #[test]
    fn the_cursor_is_an_accent_outline_one_pixel_outside() {
        let mut screen = Screen::new();

        draw_cursor(&mut screen, 2, 17, 160, 17);

        assert!(outlined(&screen, 1, 16, 162, 19, ACCENT));
        assert_eq!(screen.pixel(0, 16), BACKGROUND);
        assert_eq!(screen.pixel(163, 35), BACKGROUND);
        assert_eq!(screen.pixel(2, 17), BACKGROUND);
        assert_eq!(ink(&screen, ACCENT), 2 * (162 + 19) - 4);
    }
}
