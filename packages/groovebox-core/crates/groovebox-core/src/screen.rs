pub const WIDTH: usize = 480;
pub const HEIGHT: usize = 272;

/// An index into the palette.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Color(pub u8);

/// A rectangle in screen pixels. It may lie partly or wholly outside the buffer it is drawn on.
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub trait Canvas {
    /// Fills the part of `rect` that lies inside the canvas.
    fn fill_rect(&mut self, rect: Rect, color: Color);

    fn hline(&mut self, x: i32, y: i32, width: u32, color: Color) {
        self.fill_rect(
            Rect {
                x,
                y,
                width,
                height: 1,
            },
            color,
        );
    }

    fn vline(&mut self, x: i32, y: i32, height: u32, color: Color) {
        self.fill_rect(
            Rect {
                x,
                y,
                width: 1,
                height,
            },
            color,
        );
    }

    /// Draws a one-pixel border inside `rect`.
    fn outline_rect(&mut self, rect: Rect, color: Color) {
        let Rect {
            x,
            y,
            width,
            height,
        } = rect;
        if width == 0 || height == 0 {
            return;
        }
        // A column or row beyond `i32::MAX` is beyond any buffer, so saturating loses nothing.
        let right = x.saturating_add_unsigned(width - 1);
        let bottom = y.saturating_add_unsigned(height - 1);
        self.hline(x, y, width, color);
        self.hline(x, bottom, width, color);
        self.vline(x, y, height, color);
        self.vline(right, y, height, color);
    }
}

/// An 8-bit indexed picture of `W` x `H` pixels. A target presents it by looking each index up
/// in the palette.
pub struct FrameBuffer<const W: usize, const H: usize> {
    rows: [[u8; W]; H],
}

impl<const W: usize, const H: usize> FrameBuffer<W, H> {
    pub const fn new() -> Self {
        Self { rows: [[0; W]; H] }
    }

    /// The whole buffer in row order.
    pub fn pixels(&self) -> &[u8] {
        self.rows.as_flattened()
    }

    pub fn pixel(&self, x: usize, y: usize) -> Color {
        Color(self.rows[y][x])
    }
}

impl<const W: usize, const H: usize> Default for FrameBuffer<W, H> {
    fn default() -> Self {
        Self::new()
    }
}

impl<const W: usize, const H: usize> Canvas for FrameBuffer<W, H> {
    fn fill_rect(&mut self, rect: Rect, color: Color) {
        // The sums are in `i64` so that `x + width` cannot overflow.
        let clip = |edge: i64, size: usize| edge.clamp(0, size as i64) as usize;
        let (left, top) = (i64::from(rect.x), i64::from(rect.y));
        let columns = clip(left, W)..clip(left + i64::from(rect.width), W);
        let rows = clip(top, H)..clip(top + i64::from(rect.height), H);
        for row in &mut self.rows[rows] {
            row[columns.clone()].fill(color.0);
        }
    }
}

pub type Screen = FrameBuffer<WIDTH, HEIGHT>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::string::String;
    use std::vec::Vec;

    const INK: Color = Color(5);

    fn picture<const W: usize, const H: usize>(buffer: &FrameBuffer<W, H>) -> Vec<String> {
        (0..H)
            .map(|y| {
                (0..W)
                    .map(|x| if buffer.pixel(x, y) == INK { '#' } else { '.' })
                    .collect()
            })
            .collect()
    }

    #[test]
    fn fill_rect_clips_to_the_buffer() {
        let mut buffer = FrameBuffer::<8, 8>::new();

        buffer.fill_rect(
            Rect {
                x: -5,
                y: -5,
                width: 10,
                height: 10,
            },
            INK,
        );

        assert_eq!(
            picture(&buffer),
            [
                "#####...", "#####...", "#####...", "#####...", "#####...", "........", "........",
                "........",
            ]
        );
    }

    #[test]
    fn fill_rect_far_outside_or_huge_does_not_overflow() {
        let mut buffer = FrameBuffer::<8, 8>::new();

        buffer.fill_rect(
            Rect {
                x: i32::MAX,
                y: i32::MAX,
                width: u32::MAX,
                height: u32::MAX,
            },
            INK,
        );
        buffer.fill_rect(
            Rect {
                x: i32::MIN,
                y: i32::MIN,
                width: 1 << 31,
                height: 1 << 31,
            },
            INK,
        );

        assert_eq!(picture(&buffer), ["........"; 8]);

        buffer.fill_rect(
            Rect {
                x: i32::MIN,
                y: 3,
                width: u32::MAX,
                height: 2,
            },
            INK,
        );

        assert_eq!(
            picture(&buffer),
            [
                "........", "........", "........", "########", "########", "........", "........",
                "........",
            ]
        );
    }

    #[test]
    fn outline_rect_draws_a_one_pixel_border() {
        let mut buffer = FrameBuffer::<8, 8>::new();

        buffer.outline_rect(
            Rect {
                x: 1,
                y: 1,
                width: 4,
                height: 3,
            },
            INK,
        );

        assert_eq!(
            picture(&buffer),
            [
                "........", ".####...", ".#..#...", ".####...", "........", "........", "........",
                "........",
            ]
        );
    }

    #[test]
    fn outline_rect_one_pixel_wide_or_high_draws_a_line() {
        let mut buffer = FrameBuffer::<8, 8>::new();

        buffer.outline_rect(
            Rect {
                x: 1,
                y: 1,
                width: 1,
                height: 3,
            },
            INK,
        );
        buffer.outline_rect(
            Rect {
                x: 3,
                y: 5,
                width: 4,
                height: 1,
            },
            INK,
        );

        assert_eq!(
            picture(&buffer),
            [
                "........", ".#......", ".#......", ".#......", "........", "...####.", "........",
                "........",
            ]
        );
    }

    #[test]
    fn outline_rect_that_spans_the_whole_screen_draws_the_screen_edge() {
        let mut screen = Screen::new();

        screen.outline_rect(
            Rect {
                x: 0,
                y: 0,
                width: WIDTH as u32,
                height: HEIGHT as u32,
            },
            INK,
        );

        assert_eq!(screen.pixel(0, 0), INK);
        assert_eq!(screen.pixel(WIDTH - 1, HEIGHT - 1), INK);
        assert_eq!(screen.pixel(WIDTH - 1, 0), INK);
        assert_eq!(screen.pixel(0, HEIGHT - 1), INK);
        assert_eq!(screen.pixel(1, 1), Color(0));
        assert_eq!(
            screen
                .pixels()
                .iter()
                .filter(|&&pixel| pixel == INK.0)
                .count(),
            2 * (WIDTH + HEIGHT) - 4
        );
    }

    #[test]
    fn outline_rect_extremes_do_not_overflow() {
        let mut buffer = FrameBuffer::<8, 8>::new();

        buffer.outline_rect(
            Rect {
                x: i32::MAX,
                y: i32::MAX,
                width: u32::MAX,
                height: u32::MAX,
            },
            INK,
        );
        buffer.outline_rect(
            Rect {
                x: i32::MIN,
                y: i32::MIN,
                width: u32::MAX,
                height: u32::MAX,
            },
            INK,
        );

        assert_eq!(picture(&buffer), ["........"; 8]);
    }

    #[test]
    fn empty_rect_draws_nothing() {
        let mut buffer = FrameBuffer::<8, 8>::new();

        for (width, height) in [(0, 3), (3, 0), (0, 0)] {
            let rect = || Rect {
                x: 2,
                y: 2,
                width,
                height,
            };
            buffer.fill_rect(rect(), INK);
            buffer.outline_rect(rect(), INK);
        }
        buffer.hline(2, 2, 0, INK);
        buffer.vline(2, 2, 0, INK);

        assert_eq!(picture(&buffer), ["........"; 8]);
    }

    #[test]
    fn pixels_are_in_row_order() {
        let mut screen = Screen::new();
        screen.hline(3, 2, 1, INK);

        assert_eq!(screen.pixels().len(), WIDTH * HEIGHT);
        assert_eq!(screen.pixels()[2 * WIDTH + 3], INK.0);
        assert_eq!(
            screen.pixels().iter().filter(|&&pixel| pixel != 0).count(),
            1
        );
    }

    #[test]
    fn screen_is_130_560_bytes() {
        assert_eq!(core::mem::size_of::<Screen>(), 130_560);
    }
}
