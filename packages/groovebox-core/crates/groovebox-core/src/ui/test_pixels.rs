//! Reads drawn pixels back for the tests of the parts of `ui`.

use crate::screen::{Color, Screen};
use core::ops::RangeInclusive;
use std::string::String;
use std::vec::Vec;

/// The pixels in `columns` and `rows` as lines of text: `#` where a pixel is `ink`, `.` elsewhere.
pub fn picture(
    screen: &Screen,
    columns: RangeInclusive<usize>,
    rows: RangeInclusive<usize>,
    ink: Color,
) -> Vec<String> {
    rows.map(|y| {
        columns
            .clone()
            .map(|x| if screen.pixel(x, y) == ink { '#' } else { '.' })
            .collect()
    })
    .collect()
}

/// How many pixels of the whole screen are `color`.
pub fn ink(screen: &Screen, color: Color) -> usize {
    screen
        .pixels()
        .iter()
        .filter(|&&pixel| pixel == color.0)
        .count()
}

/// Whether every pixel in `columns` and `rows` is `color`.
pub fn filled(
    screen: &Screen,
    columns: RangeInclusive<usize>,
    rows: RangeInclusive<usize>,
    color: Color,
) -> bool {
    rows.into_iter()
        .all(|y| columns.clone().all(|x| screen.pixel(x, y) == color))
}

/// The first and the last column in `columns` that holds `ink` in any of `rows`.
pub fn span(
    screen: &Screen,
    columns: RangeInclusive<usize>,
    rows: RangeInclusive<usize>,
    ink: Color,
) -> Option<(usize, usize)> {
    let mut inked = columns.filter(|&x| rows.clone().any(|y| screen.pixel(x, y) == ink));
    let first = inked.next()?;
    Some((first, inked.next_back().unwrap_or(first)))
}

/// Whether the border of the rectangle at (`x`, `y`) of `width` by `height` pixels is `color`.
pub fn outlined(
    screen: &Screen,
    x: usize,
    y: usize,
    width: usize,
    height: usize,
    color: Color,
) -> bool {
    let (right, bottom) = (x + width - 1, y + height - 1);
    filled(screen, x..=right, y..=y, color)
        && filled(screen, x..=right, bottom..=bottom, color)
        && filled(screen, x..=x, y..=bottom, color)
        && filled(screen, right..=right, y..=bottom, color)
}
