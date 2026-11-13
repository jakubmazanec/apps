use crate::{
    palette::{DIM, TEXT},
    screen::Canvas,
    ui::{
        item::draw_cursor,
        layout::{
            LIST_VISIBLE, PIECE_GAP, ROW_FIRST, ROW_HEIGHT, ROW_PITCH, ROW_WIDTH, ROW_X, TEXT_INSET,
        },
        text,
    },
};

/// A row of a picker or a list: its text at the left and, where it has one, a label at the right.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Row<'a> {
    pub left: &'a str,
    pub right: Option<&'a str>,
}

/// Draws the rows from `first` on, at most 16 of them. The cursor goes on the row `cursor` when it
/// is one of them. The text is bright and the label dim. A text that does not fit is shortened to
/// leave the whole label and 6 pixels between them.
pub fn draw_rows(canvas: &mut impl Canvas, rows: &[Row], first: usize, cursor: Option<usize>) {
    let left = ROW_X + TEXT_INSET;
    let right = ROW_X + ROW_WIDTH - 1 - TEXT_INSET;
    for (slot, row) in rows.iter().skip(first).take(LIST_VISIBLE).enumerate() {
        let y = ROW_FIRST + ROW_PITCH * slot as i32;
        let mut room = right - left + 1;
        if let Some(label) = row.right {
            text::draw_right(canvas, right, y, label, DIM);
            room -= text::width(label) + PIECE_GAP;
        }
        text::draw_fitted(canvas, left, y, text::fit(row.left, room), TEXT);
        if cursor == Some(first + slot) {
            draw_cursor(canvas, ROW_X, y, ROW_WIDTH, ROW_HEIGHT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{ACCENT, DIM, TEXT};
    use crate::screen::Screen;
    use crate::ui::test_pixels::{ink, outlined, span};

    /// The first six rows of picker-sound.png.
    const PICKER: [Row; 6] = [
        Row {
            left: "Empty",
            right: None,
        },
        Row {
            left: "New sample",
            right: None,
        },
        Row {
            left: "New synth",
            right: None,
        },
        Row {
            left: "Kick",
            right: Some("sample"),
        },
        Row {
            left: "Snare",
            right: Some("sample"),
        },
        Row {
            left: "Hat",
            right: Some("sample"),
        },
    ];

    #[test]
    fn the_rows_and_cursor_match_picker_sound_png() {
        let mut screen = Screen::new();

        draw_rows(&mut screen, &PICKER, 0, Some(4));

        // The cursor on row 4: an outline 1 pixel outside the row, which spans x 2 to 477.
        assert!(outlined(&screen, 1, 72, 478, 15, ACCENT));
        assert_eq!(ink(&screen, ACCENT), 2 * (478 + 15) - 4);
        // Its text from x 5 and its label ending at x 474, dim.
        assert_eq!(span(&screen, 2..=300, 76..=82, TEXT), Some((5, 33)));
        assert_eq!(span(&screen, 300..=477, 76..=82, DIM), Some((440, 474)));
        // The rows above: 14 pixels apart from y 17, a label only where there is one.
        assert_eq!(span(&screen, 2..=477, 20..=26, TEXT), Some((5, 33)));
        assert_eq!(span(&screen, 2..=477, 34..=40, TEXT), Some((5, 63)));
        assert_eq!(span(&screen, 2..=477, 48..=54, TEXT), Some((5, 57)));
        assert_eq!(span(&screen, 2..=477, 20..=54, DIM), None);
        assert_eq!(span(&screen, 2..=477, 62..=68, TEXT), Some((5, 27)));
        assert_eq!(span(&screen, 300..=477, 62..=68, DIM), Some((440, 474)));
        // And the row below.
        assert_eq!(span(&screen, 2..=300, 90..=96, TEXT), Some((5, 21)));
    }

    fn many() -> [Row<'static>; 20] {
        [Row {
            left: "x",
            right: None,
        }; 20]
    }

    #[test]
    fn sixteen_rows_from_the_first_are_drawn() {
        let mut screen = Screen::new();

        draw_rows(&mut screen, &many(), 2, Some(2));

        // 16 rows fit under the header, the last one's text on rows 230 to 236.
        assert_eq!(span(&screen, 0..=479, 20..=26, TEXT), Some((5, 9)));
        assert_eq!(span(&screen, 0..=479, 230..=236, TEXT), Some((5, 9)));
        assert_eq!(span(&screen, 0..=479, 244..=252, TEXT), None);
        assert!(outlined(&screen, 1, 16, 478, 15, ACCENT));
    }

    #[test]
    fn the_cursor_is_drawn_only_on_a_row_that_is_drawn() {
        for (cursor, visible) in [(1, false), (18, false), (19, false), (17, true)] {
            let mut screen = Screen::new();

            draw_rows(&mut screen, &many(), 2, Some(cursor));

            assert_eq!(ink(&screen, ACCENT) > 0, visible, "cursor {cursor}");
        }
        let mut screen = Screen::new();

        draw_rows(&mut screen, &many()[..3], 0, Some(5));

        assert_eq!(ink(&screen, ACCENT), 0);
    }

    #[test]
    fn the_cursor_on_the_last_visible_row_is_one_pixel_outside_it() {
        let mut screen = Screen::new();

        draw_rows(&mut screen, &many(), 2, Some(17));

        assert!(outlined(&screen, 1, 226, 478, 15, ACCENT));
    }

    #[test]
    fn no_cursor_means_no_outline_and_a_first_past_the_end_means_no_rows() {
        let mut with_rows = Screen::new();
        let mut past_the_end = Screen::new();

        draw_rows(&mut with_rows, &many(), 0, None);
        draw_rows(&mut past_the_end, &many()[..3], 5, Some(5));

        assert_eq!(ink(&with_rows, ACCENT), 0);
        assert!(ink(&with_rows, TEXT) > 0);
        assert_eq!(ink(&past_the_end, TEXT) + ink(&past_the_end, ACCENT), 0);
    }

    #[test]
    fn a_long_left_text_gives_way_to_the_label_and_to_the_edge() {
        let long = "x".repeat(80);
        let mut screen = Screen::new();

        draw_rows(
            &mut screen,
            &[
                Row {
                    left: &long,
                    right: Some("sample"),
                },
                Row {
                    left: &long,
                    right: None,
                },
            ],
            0,
            None,
        );

        // 70 characters and "…" end at x 429, 10 pixels before the label's 440 (one more character
        // would leave less than 6); without a label 77 characters and "…" end at x 471.
        assert_eq!(span(&screen, 2..=439, 20..=26, TEXT), Some((5, 429)));
        assert_eq!(span(&screen, 440..=477, 20..=26, DIM), Some((440, 474)));
        assert_eq!(span(&screen, 2..=477, 34..=40, TEXT), Some((5, 471)));
    }
}
