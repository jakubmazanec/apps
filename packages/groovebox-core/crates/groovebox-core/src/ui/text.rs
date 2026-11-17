use crate::{
    font::{ADVANCE, glyph},
    screen::{Canvas, Color, Rect},
};
use core::fmt;

/// The width in pixels of `text`: 6 per character, except that the last one's blank column does
/// not count.
pub fn width(text: &str) -> i32 {
    match text.chars().count() {
        0 => 0,
        count => ADVANCE * count as i32 - 1,
    }
}

/// Draws `text` with the top-left of its first cell at (`x`, `row`). The row is 13 pixels high and
/// the capitals sit on its rows 3 to 9.
pub fn draw(canvas: &mut impl Canvas, x: i32, row: i32, text: &str, color: Color) {
    let mut cell = x;
    for c in text.chars() {
        canvas.glyph(cell, row, glyph(c), color);
        cell = cell.saturating_add(ADVANCE);
    }
}

/// Draws `text` so that its last pixel column is `right`.
pub fn draw_right(canvas: &mut impl Canvas, right: i32, row: i32, text: &str, color: Color) {
    draw(
        canvas,
        right.saturating_sub(width(text) - 1),
        row,
        text,
        color,
    );
}

/// A text that has been made to fit a width: `text`, followed by "…" when `ellipsis` is set.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fitted<'a> {
    pub text: &'a str,
    pub ellipsis: bool,
}

/// `text` whole when it is at most `max` pixels wide, otherwise its longest prefix of whole
/// characters that leaves room for "…". When not even the "…" fits, nothing is left.
pub fn fit(text: &str, max: i32) -> Fitted<'_> {
    if width(text) <= max {
        return Fitted {
            text,
            ellipsis: false,
        };
    }
    // The prefix and the "…" are `characters + 1` characters, 6 * (characters + 1) - 1 pixels.
    match usize::try_from(max.saturating_add(1) / ADVANCE - 1) {
        Ok(characters) => Fitted {
            text: &text[..text
                .char_indices()
                .nth(characters)
                .map_or(text.len(), |(end, _)| end)],
            ellipsis: true,
        },
        Err(_) => Fitted {
            text: "",
            ellipsis: false,
        },
    }
}

/// Draws `fitted` as `draw` does, with the "…" in the cell after the text.
pub fn draw_fitted(canvas: &mut impl Canvas, x: i32, row: i32, fitted: Fitted, color: Color) {
    draw(canvas, x, row, fitted.text, color);
    if fitted.ellipsis {
        let after = x.saturating_add(ADVANCE * fitted.text.chars().count() as i32);
        draw(canvas, after, row, "…", color);
    }
}

/// The text, followed by "…" when `ellipsis` is set.
impl fmt::Display for Fitted<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.text)?;
        if self.ellipsis {
            f.write_str("…")?;
        }
        Ok(())
    }
}

/// Draws `text` with its first cell at (`x`, `row`) in the `room` pixels from `x`: whole when it
/// fits; otherwise its end after a "…", from the longest suffix of whole characters that leaves room
/// for it. A text with no room for even the "…" is not drawn.
pub fn draw_end(canvas: &mut impl Canvas, x: i32, row: i32, room: i32, text: &str, color: Color) {
    if width(text) <= room {
        draw(canvas, x, row, text, color);
        return;
    }
    // The "…" and the suffix are `characters + 1` characters, 6 * (characters + 1) - 1 pixels.
    let Ok(characters) = usize::try_from(room.saturating_add(1) / ADVANCE - 1) else {
        return;
    };
    let start = text
        .char_indices()
        .rev()
        .take(characters)
        .last()
        .map_or(text.len(), |(start, _)| start);
    draw(canvas, x, row, "…", color);
    draw(
        canvas,
        x.saturating_add(ADVANCE),
        row,
        &text[start..],
        color,
    );
}

/// Samples a scrolling text holds still at its start each round, about a second. It is a whole
/// number of pixels' time, so the text moves on the redraws `Control::step` asks for each pixel's
/// time.
pub const SCROLL_PAUSE: u64 = 30 * SCROLL_PIXEL;
/// Samples per pixel a scrolling text moves.
pub const SCROLL_PIXEL: u64 = 1_600;
/// Pixels between a scrolling text's last letter and its first letter coming round.
pub const SCROLL_GAP: i32 = 18;

/// Draws `text` with its first cell at (`x`, `row`) in the `room` pixels from `x`: whole when it
/// fits; otherwise shortened with "…" (`fit`) when `scroll` is `None`, or, when it is
/// `Some(elapsed)`, `elapsed` samples after the cursor landed on it, scrolled and cut at the room's
/// edges. A text with no room for even the "…" is not drawn and does not scroll. Returns whether it
/// scrolls.
pub fn draw_in(
    canvas: &mut impl Canvas,
    x: i32,
    row: i32,
    room: i32,
    text: &str,
    scroll: Option<u64>,
    color: Color,
) -> bool {
    // Only a text that would be shortened scrolls: one with no room for even the "…" shows nothing.
    let fitted = fit(text, room);
    let Some(elapsed) = scroll.filter(|_| fitted.ellipsis) else {
        draw_fitted(canvas, x, row, fitted, color);
        return false;
    };
    // The loop is the text and the gap; each round holds still for the pause, then moves through it.
    let period = width(text) + SCROLL_GAP;
    let offset = ((elapsed % (SCROLL_PAUSE + period as u64 * SCROLL_PIXEL))
        .saturating_sub(SCROLL_PAUSE)
        / SCROLL_PIXEL) as i32;
    let mut clip = Clip {
        canvas,
        left: x,
        right: x.saturating_add(room),
    };
    draw(&mut clip, x - offset, row, text, color);
    draw(&mut clip, x - offset + period, row, text, color);
    true
}

/// A canvas that passes on only the part of each rectangle in columns `left` to `right - 1`.
struct Clip<'a, C> {
    canvas: &'a mut C,
    left: i32,
    right: i32,
}

impl<C: Canvas> Canvas for Clip<'_, C> {
    fn fill_rect(&mut self, rect: Rect, color: Color) {
        let start = rect.x.max(self.left);
        let end = rect.x.saturating_add_unsigned(rect.width).min(self.right);
        if start < end {
            self.canvas.fill_rect(
                Rect {
                    x: start,
                    width: end.abs_diff(start),
                    ..rect
                },
                color,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{BACKGROUND, TEXT};
    use crate::screen::Screen;
    use crate::ui::test_pixels::{ink, picture};
    use std::format;

    #[test]
    fn text_width_is_six_per_character_minus_one() {
        assert_eq!(width("Sound"), 29);
        assert_eq!(width("T1"), 11);
        assert_eq!(width(""), 0);
        assert_eq!(width("Říkanka"), 41);
    }

    #[test]
    fn capitals_sit_three_pixels_into_a_row() {
        let mut screen = Screen::new();

        draw(&mut screen, 4, 1, "H", TEXT);

        assert_eq!(
            picture(&screen, 3..=9, 3..=11, TEXT),
            [
                ".......", ".#...#.", ".#...#.", ".#...#.", ".#####.", ".#...#.", ".#...#.",
                ".#...#.", ".......",
            ]
        );
        assert_eq!(ink(&screen, TEXT), 17);
    }

    #[test]
    fn every_character_starts_six_pixels_after_the_one_before() {
        let mut screen = Screen::new();

        draw(&mut screen, 0, 0, "HH", TEXT);

        assert_eq!(picture(&screen, 0..=10, 4..=4, TEXT), ["#...#.#...#"]);
        assert_eq!(ink(&screen, TEXT), 34);
    }

    #[test]
    fn draw_right_ends_the_text_at_the_given_column() {
        let mut screen = Screen::new();

        draw_right(&mut screen, 20, 0, "HH", TEXT);

        assert_eq!(picture(&screen, 8..=21, 4..=4, TEXT), ["..#...#.#...#."]);
    }

    #[test]
    fn fit_shortens_with_an_ellipsis_only_when_needed() {
        assert_eq!(
            fit("Kick", 71),
            Fitted {
                text: "Kick",
                ellipsis: false,
            }
        );
        assert_eq!(
            fit("Žluťoučký kůň", 71),
            Fitted {
                text: "Žluťoučký k",
                ellipsis: true,
            }
        );
    }

    #[test]
    fn fit_keeps_a_text_that_fills_the_space_exactly() {
        assert_eq!(fit("Kick", 23).text, "Kick");
        assert!(!fit("Kick", 23).ellipsis);
        assert_eq!(
            fit("Kicks", 23),
            Fitted {
                text: "Kic",
                ellipsis: true,
            }
        );
    }

    #[test]
    fn fit_draws_nothing_when_not_even_the_ellipsis_fits() {
        assert_eq!(
            fit("Kick", 5),
            Fitted {
                text: "",
                ellipsis: true,
            }
        );
        assert_eq!(
            fit("Kick", 4),
            Fitted {
                text: "",
                ellipsis: false,
            }
        );
        assert_eq!(
            fit("Kick", -30),
            Fitted {
                text: "",
                ellipsis: false,
            }
        );
        assert_eq!(
            fit("", -1),
            Fitted {
                text: "",
                ellipsis: false,
            }
        );
    }

    #[test]
    fn draw_fitted_puts_the_ellipsis_after_the_prefix() {
        let mut fitted = Screen::new();
        let mut whole = Screen::new();

        draw_fitted(&mut fitted, 3, 2, fit("Kicks", 23), TEXT);
        draw(&mut whole, 3, 2, "Kic…", TEXT);

        assert_eq!(fitted.pixels(), whole.pixels());
        assert!(ink(&fitted, TEXT) > 0);
    }

    #[test]
    fn a_fitted_text_displays_with_its_ellipsis_after_it() {
        assert_eq!(format!("{}", fit("Kicks", 23)), "Kic…");
        assert_eq!(format!("{}", fit("Kick", 23)), "Kick");
        assert_eq!(format!("{}", fit("Kick", 4)), "");
    }

    /// `text` drawn by `draw_end` from column 10 in a room of `room` pixels.
    fn drawn_end(text: &str, room: i32) -> Screen {
        let mut screen = Screen::new();
        draw_end(&mut screen, 10, 0, room, text, TEXT);
        screen
    }

    #[test]
    fn draw_end_draws_a_text_that_fits_whole() {
        let mut whole = Screen::new();
        draw(&mut whole, 10, 0, "Kick", TEXT);

        assert_eq!(drawn_end("Kick", 23).pixels(), whole.pixels());
        assert!(ink(&whole, TEXT) > 0);
    }

    #[test]
    fn draw_end_keeps_the_end_after_an_ellipsis() {
        let mut shortened = Screen::new();
        draw(&mut shortened, 10, 0, "…cks", TEXT);

        assert_eq!(drawn_end("Kicks", 23).pixels(), shortened.pixels());
        assert!(ink(&shortened, TEXT) > 0);
    }

    #[test]
    fn draw_end_cuts_the_start_at_a_character_boundary() {
        let mut shortened = Screen::new();
        draw(&mut shortened, 10, 0, "…uťoučký kůň", TEXT);

        assert_eq!(drawn_end("Žluťoučký kůň", 71).pixels(), shortened.pixels());
        assert!(ink(&shortened, TEXT) > 0);
    }

    #[test]
    fn draw_end_draws_nothing_when_not_even_the_ellipsis_fits() {
        let mut ellipsis = Screen::new();
        draw(&mut ellipsis, 10, 0, "…", TEXT);

        assert_eq!(drawn_end("Kick", 5).pixels(), ellipsis.pixels());
        for room in [4, 0, -30] {
            assert_eq!(ink(&drawn_end("Kick", room), TEXT), 0, "room {room}");
        }
    }

    /// "Kicks" scrolled `offset` pixels into its 47 px loop in the 23 px room from column 10.
    fn scrolled_by(offset: i32) -> Screen {
        let mut screen = Screen::new();
        draw(&mut screen, 10 - offset, 0, "Kicks", TEXT);
        draw(&mut screen, 10 - offset + 47, 0, "Kicks", TEXT);
        screen.fill_rect(
            Rect {
                x: 0,
                y: 0,
                width: 10,
                height: 13,
            },
            BACKGROUND,
        );
        screen.fill_rect(
            Rect {
                x: 33,
                y: 0,
                width: 447,
                height: 13,
            },
            BACKGROUND,
        );
        screen
    }

    fn drawn_in(text: &str, scroll: Option<u64>) -> (bool, Screen) {
        let mut screen = Screen::new();
        let scrolls = draw_in(&mut screen, 10, 0, 23, text, scroll, TEXT);
        (scrolls, screen)
    }

    #[test]
    fn a_text_that_fits_is_drawn_whole_and_never_moves() {
        let mut whole = Screen::new();
        draw(&mut whole, 10, 0, "Kick", TEXT);

        for scroll in [Some(SCROLL_PAUSE + 5 * SCROLL_PIXEL), None] {
            let (scrolls, screen) = drawn_in("Kick", scroll);

            assert!(!scrolls);
            assert_eq!(screen.pixels(), whole.pixels());
        }
    }

    #[test]
    fn a_text_without_room_for_the_ellipsis_neither_shows_nor_scrolls() {
        for room in [-30, 0, 4] {
            let mut screen = Screen::new();

            let scrolls = draw_in(
                &mut screen,
                10,
                0,
                room,
                "Kicks",
                Some(SCROLL_PAUSE + 5 * SCROLL_PIXEL),
                TEXT,
            );

            assert!(!scrolls, "room {room}");
            assert_eq!(ink(&screen, TEXT), 0, "room {room}");
        }
    }

    #[test]
    fn a_text_not_under_the_cursor_is_shortened() {
        let mut shortened = Screen::new();
        draw_fitted(&mut shortened, 10, 0, fit("Kicks", 23), TEXT);

        let (scrolls, screen) = drawn_in("Kicks", None);

        assert!(!scrolls);
        assert_eq!(screen.pixels(), shortened.pixels());
    }

    #[test]
    fn a_scrolling_text_holds_still_at_its_start_for_the_pause() {
        for elapsed in [0, SCROLL_PAUSE + SCROLL_PIXEL - 1] {
            let (scrolls, screen) = drawn_in("Kicks", Some(elapsed));

            assert!(scrolls);
            assert_eq!(screen.pixels(), scrolled_by(0).pixels());
        }
    }

    #[test]
    fn then_it_moves_a_pixel_each_pixel_time() {
        let (_, screen) = drawn_in("Kicks", Some(SCROLL_PAUSE + 5 * SCROLL_PIXEL));

        assert_eq!(screen.pixels(), scrolled_by(5).pixels());
    }

    #[test]
    fn after_its_end_and_the_gap_it_comes_round_and_pauses_again() {
        for (elapsed, offset) in [
            (SCROLL_PAUSE + 41 * SCROLL_PIXEL, 41),
            (SCROLL_PAUSE + 47 * SCROLL_PIXEL, 0),
            (2 * SCROLL_PAUSE + 48 * SCROLL_PIXEL, 1),
        ] {
            let (_, screen) = drawn_in("Kicks", Some(elapsed));

            assert_eq!(screen.pixels(), scrolled_by(offset).pixels());
        }
    }
}
