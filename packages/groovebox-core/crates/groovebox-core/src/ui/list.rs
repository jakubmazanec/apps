use crate::{
    palette::{DIM, RECORD, TEXT},
    screen::Canvas,
    ui::{
        item::draw_cursor,
        layout::{PIECE_GAP, ROW_HEIGHT, ROW_PITCH, ROW_WIDTH, ROW_X, TEXT_INSET},
        text,
    },
};

/// A row of a picker or a list: its text at the left and, where it has one, a label at the right.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Row<'a> {
    pub left: &'a str,
    pub right: Option<&'a str>,
    /// Whether the text and the label are red, as for a file start-up could not load.
    pub alert: bool,
}

/// Draws the rows from `first` on, as many as `fit`, the first at `y`. The cursor goes on the row
/// `cursor` when it is one of them. The text is bright and the label dim, or both red on an alert
/// row. A text that does not fit is shortened to leave the whole label and 6 pixels between them;
/// under the cursor it scrolls in that room, `elapsed` samples after the cursor landed
/// (`text::draw_in`). Returns whether a text scrolls.
pub fn draw_rows(
    canvas: &mut impl Canvas,
    y: i32,
    fit: usize,
    rows: &[Row],
    first: usize,
    cursor: Option<usize>,
    elapsed: u64,
) -> bool {
    let left = ROW_X + TEXT_INSET;
    let right = ROW_X + ROW_WIDTH - 1 - TEXT_INSET;
    let mut scrolls = false;
    for (slot, row) in rows.iter().skip(first).take(fit).enumerate() {
        let y = y + ROW_PITCH * slot as i32;
        let (text_color, label_color) = if row.alert {
            (RECORD, RECORD)
        } else {
            (TEXT, DIM)
        };
        let mut room = right - left + 1;
        if let Some(label) = row.right {
            text::draw_right(canvas, right, y, label, label_color);
            room -= text::width(label) + PIECE_GAP;
        }
        let under_cursor = cursor == Some(first + slot);
        scrolls |= text::draw_in(
            canvas,
            left,
            y,
            room,
            row.left,
            under_cursor.then_some(elapsed),
            text_color,
        );
        if under_cursor {
            draw_cursor(canvas, ROW_X, y, ROW_WIDTH, ROW_HEIGHT);
        }
    }
    scrolls
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{ACCENT, DIM, RECORD, TEXT};
    use crate::screen::Screen;
    use crate::ui::layout::{LIST_VISIBLE, ROW_FIRST};
    use crate::ui::test_pixels::{MOVED, ink, outlined, picture, span};

    /// The first six rows of picker-sound.png.
    const PICKER: [Row; 6] = [
        Row {
            left: "Empty",
            right: None,
            alert: false,
        },
        Row {
            left: "New sample",
            right: None,
            alert: false,
        },
        Row {
            left: "New synth",
            right: None,
            alert: false,
        },
        Row {
            left: "Kick",
            right: Some("sample"),
            alert: false,
        },
        Row {
            left: "Snare",
            right: Some("sample"),
            alert: false,
        },
        Row {
            left: "Hat",
            right: Some("sample"),
            alert: false,
        },
    ];

    #[test]
    fn the_rows_and_cursor_match_picker_sound_png() {
        let mut screen = Screen::new();

        draw_rows(&mut screen, ROW_FIRST, LIST_VISIBLE, &PICKER, 0, Some(4), 0);

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
            alert: false,
        }; 20]
    }

    #[test]
    fn sixteen_rows_from_the_first_are_drawn() {
        let mut screen = Screen::new();

        draw_rows(&mut screen, ROW_FIRST, LIST_VISIBLE, &many(), 2, Some(2), 0);

        // 16 rows fit under the header, the last one's text on rows 230 to 236.
        assert_eq!(span(&screen, 0..=479, 20..=26, TEXT), Some((5, 9)));
        assert_eq!(span(&screen, 0..=479, 230..=236, TEXT), Some((5, 9)));
        assert_eq!(span(&screen, 0..=479, 244..=252, TEXT), None);
        assert!(outlined(&screen, 1, 16, 478, 15, ACCENT));
    }

    #[test]
    fn as_many_rows_as_fit_are_drawn_from_their_first_row() {
        let mut screen = Screen::new();

        draw_rows(&mut screen, 31, 14, &many(), 0, Some(0), 0);

        // 14 rows from y 31, as inside a folder of SAMPLES: the last one's text on rows 216 to 222.
        assert_eq!(span(&screen, 0..=479, 17..=29, TEXT), None);
        assert_eq!(span(&screen, 0..=479, 34..=40, TEXT), Some((5, 9)));
        assert_eq!(span(&screen, 0..=479, 216..=222, TEXT), Some((5, 9)));
        assert_eq!(span(&screen, 0..=479, 223..=252, TEXT), None);
        assert!(outlined(&screen, 1, 30, 478, 15, ACCENT));
    }

    #[test]
    fn an_alert_row_has_its_text_and_label_in_red() {
        let mut screen = Screen::new();

        draw_rows(
            &mut screen,
            ROW_FIRST,
            LIST_VISIBLE,
            &[Row {
                left: "kick.wav",
                right: Some("not loaded"),
                alert: true,
            }],
            0,
            None,
            0,
        );

        assert_eq!(span(&screen, 2..=300, 17..=29, RECORD), Some((5, 51)));
        assert_eq!(span(&screen, 300..=477, 17..=29, RECORD), Some((416, 474)));
        assert_eq!(ink(&screen, TEXT) + ink(&screen, DIM), 0);
    }

    #[test]
    fn the_cursor_is_drawn_only_on_a_row_that_is_drawn() {
        for (cursor, visible) in [(1, false), (18, false), (19, false), (17, true)] {
            let mut screen = Screen::new();

            draw_rows(
                &mut screen,
                ROW_FIRST,
                LIST_VISIBLE,
                &many(),
                2,
                Some(cursor),
                0,
            );

            assert_eq!(ink(&screen, ACCENT) > 0, visible, "cursor {cursor}");
        }
        let mut screen = Screen::new();

        draw_rows(
            &mut screen,
            ROW_FIRST,
            LIST_VISIBLE,
            &many()[..3],
            0,
            Some(5),
            0,
        );

        assert_eq!(ink(&screen, ACCENT), 0);
    }

    #[test]
    fn the_cursor_on_the_last_visible_row_is_one_pixel_outside_it() {
        let mut screen = Screen::new();

        draw_rows(
            &mut screen,
            ROW_FIRST,
            LIST_VISIBLE,
            &many(),
            2,
            Some(17),
            0,
        );

        assert!(outlined(&screen, 1, 226, 478, 15, ACCENT));
    }

    #[test]
    fn no_cursor_means_no_outline_and_a_first_past_the_end_means_no_rows() {
        let mut with_rows = Screen::new();
        let mut past_the_end = Screen::new();

        draw_rows(&mut with_rows, ROW_FIRST, LIST_VISIBLE, &many(), 0, None, 0);
        draw_rows(
            &mut past_the_end,
            ROW_FIRST,
            LIST_VISIBLE,
            &many()[..3],
            5,
            Some(5),
            0,
        );

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
            ROW_FIRST,
            LIST_VISIBLE,
            &[
                Row {
                    left: &long,
                    right: Some("sample"),
                    alert: false,
                },
                Row {
                    left: &long,
                    right: None,
                    alert: false,
                },
            ],
            0,
            None,
            0,
        );

        // 70 characters and "…" end at x 429, 10 pixels before the label's 440 (one more character
        // would leave less than 6); without a label 77 characters and "…" end at x 471.
        assert_eq!(span(&screen, 2..=439, 20..=26, TEXT), Some((5, 429)));
        assert_eq!(span(&screen, 440..=477, 20..=26, DIM), Some((440, 474)));
        assert_eq!(span(&screen, 2..=477, 34..=40, TEXT), Some((5, 471)));
    }

    const LONG: &str = "Žluťoučký kůň úpěl ďábelské ódy, Žluťoučký kůň úpěl ďábelské ódy, Žluťoučký kůň úpěl ďábelské ódy";

    #[test]
    fn the_row_under_the_cursor_scrolls_up_to_its_label() {
        let rows = [Row {
            left: LONG,
            right: Some("synth"),
            alert: false,
        }; 2];
        let mut screen = Screen::new();
        let mut shortened = Screen::new();

        let scrolls = draw_rows(
            &mut screen,
            ROW_FIRST,
            LIST_VISIBLE,
            &rows,
            0,
            Some(0),
            MOVED,
        );
        draw_rows(
            &mut shortened,
            ROW_FIRST,
            LIST_VISIBLE,
            &rows,
            0,
            None,
            MOVED,
        );

        assert!(scrolls);
        // The text has the room up to 6 pixels before "synth", which starts at x 446.
        let (first, last) = span(&screen, 2..=477, 17..=29, TEXT).unwrap();
        assert!(first >= 5 && last <= 439, "{first} to {last}");
        assert_ne!(
            picture(&screen, 5..=439, 17..=29, TEXT),
            picture(&shortened, 5..=439, 17..=29, TEXT)
        );
        assert_eq!(
            picture(&screen, 2..=477, 17..=29, DIM),
            picture(&shortened, 2..=477, 17..=29, DIM)
        );
        assert_eq!(
            picture(&screen, 2..=477, 31..=43, TEXT),
            picture(&shortened, 2..=477, 31..=43, TEXT)
        );
        assert!(!draw_rows(
            &mut shortened,
            ROW_FIRST,
            LIST_VISIBLE,
            &rows,
            0,
            None,
            MOVED
        ));
    }
}
