use crate::{
    font::{ADVANCE, glyph},
    screen::{Canvas, Color},
};

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::TEXT;
    use crate::screen::Screen;
    use std::string::String;
    use std::vec::Vec;

    fn picture(
        screen: &Screen,
        columns: core::ops::RangeInclusive<usize>,
        rows: core::ops::RangeInclusive<usize>,
    ) -> Vec<String> {
        rows.map(|y| {
            columns
                .clone()
                .map(|x| if screen.pixel(x, y) == TEXT { '#' } else { '.' })
                .collect()
        })
        .collect()
    }

    fn ink(screen: &Screen) -> usize {
        screen
            .pixels()
            .iter()
            .filter(|&&pixel| pixel == TEXT.0)
            .count()
    }

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
            picture(&screen, 3..=9, 3..=11),
            [
                ".......", ".#...#.", ".#...#.", ".#...#.", ".#####.", ".#...#.", ".#...#.",
                ".#...#.", ".......",
            ]
        );
        assert_eq!(ink(&screen), 17);
    }

    #[test]
    fn every_character_starts_six_pixels_after_the_one_before() {
        let mut screen = Screen::new();

        draw(&mut screen, 0, 0, "HH", TEXT);

        assert_eq!(picture(&screen, 0..=10, 4..=4), ["#...#.#...#"]);
        assert_eq!(ink(&screen), 34);
    }

    #[test]
    fn draw_right_ends_the_text_at_the_given_column() {
        let mut screen = Screen::new();

        draw_right(&mut screen, 20, 0, "HH", TEXT);

        assert_eq!(picture(&screen, 8..=21, 4..=4), ["..#...#.#...#."]);
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
        assert!(ink(&fitted) > 0);
    }
}
