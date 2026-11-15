use crate::screen::{Canvas, Color};

/// Joins each point to the next, from left to right, with one vertical run per column so that the
/// line has no gaps. A run is at least 2 pixels tall, as Look's curve is.
pub fn draw_line(canvas: &mut impl Canvas, points: &[(i32, i32)], color: Color) {
    for pair in points.windows(2) {
        let ((left, from), (right, to)) = (pair[0], pair[1]);
        // Two points in one column give a width of 1 and a single vertical run between them.
        let width = (right - left).max(1);
        let row_at = |x: i32| from + ((to - from) * (x - left) * 2 + width).div_euclid(2 * width);
        for x in left..=right {
            let end = if x < right { row_at(x + 1) } else { to };
            let start = row_at(x);
            canvas.vline(x, start.min(end), (start.abs_diff(end) + 1).max(2), color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::screen::Screen;
    use crate::ui::test_pixels::picture;

    const INK: Color = Color(5);

    /// The first and the last row of column `x` that hold ink.
    fn run(screen: &Screen, x: usize) -> (usize, usize) {
        let mut inked = (0..50).filter(|&y| screen.pixel(x, y) == INK);
        let first = inked.next().expect("every column of the line has ink");
        (first, inked.next_back().unwrap_or(first))
    }

    #[test]
    fn a_line_has_no_gaps_between_columns() {
        let mut screen = Screen::new();

        draw_line(&mut screen, &[(0, 0), (10, 40)], INK);

        let runs: std::vec::Vec<_> = (0..=10).map(|x| run(&screen, x)).collect();
        for pair in runs.windows(2) {
            assert!(
                pair[1].0 <= pair[0].1 + 1 && pair[0].0 <= pair[1].1 + 1,
                "{pair:?}"
            );
        }
    }

    #[test]
    fn a_flat_line_is_two_pixels_tall_and_a_vertical_one_is_one_column() {
        let mut screen = Screen::new();

        draw_line(&mut screen, &[(1, 1), (4, 1), (4, 4)], INK);

        assert_eq!(
            picture(&screen, 0..=5, 0..=5, INK),
            ["......", ".####.", ".####.", "....#.", "....#.", "......"]
        );
    }
}
