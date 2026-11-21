//! Where each drawn part goes, measured from Look's pictures. A part is placed by its top-left
//! pixel, and a text by its row: 13 pixels, the capitals on its rows 3 to 9.

use crate::font::ADVANCE;
use crate::screen::Rect;

/// The rectangle at (`x`, `y`) of `width` by `height` pixels; a size below zero is empty.
pub fn rect(x: i32, y: i32, width: i32, height: i32) -> Rect {
    Rect {
        x,
        y,
        width: width.max(0).cast_unsigned(),
        height: height.max(0).cast_unsigned(),
    }
}

/// How far a text's ink lies inside the box around it, on every side.
pub const TEXT_INSET: i32 = 3;
/// The gap between two texts of a row.
pub const PIECE_GAP: i32 = 6;

/// The header's text row.
pub const HEADER_ROW: i32 = 1;
/// The header's line, across the whole screen.
pub const HEADER_LINE: i32 = 14;
/// Where the first text of the header starts.
pub const TEXT_X: i32 = 4;
/// The last column of the header's right group.
pub const HEADER_RIGHT: i32 = 475;
/// The width of the metronome's icon, which ends the header's right group while the metronome is
/// on.
pub const METRONOME_WIDTH: i32 = 7;

/// The first and the last row of the main area.
pub const MAIN_TOP: i32 = 15;
pub const MAIN_BOTTOM: i32 = 252;

/// The line above the strip, across the whole screen.
pub const STRIP_LINE: i32 = 253;
/// The top row of the strip's items.
pub const STRIP_ITEM: i32 = 255;
/// The strip's cells as (x, width).
pub const STRIP_CELLS: [(i32, i32); 4] = [(1, 120), (121, 120), (241, 119), (360, 119)];

/// An item's height: its text row, 1 pixel, its bar and 1 pixel.
pub const ITEM_HEIGHT: i32 = 17;
/// How far its bar lies below the top of an item and how thick it is.
pub const ITEM_BAR: i32 = 14;
pub const BAR_HEIGHT: i32 = 2;
/// How far a page item's name lies from the item's digit's box, which is 5 pixels wide.
pub const DIGIT_COLUMN: i32 = ADVANCE - 1 + PIECE_GAP;

/// A page's column of items: its x and width, the top of the first item, the distance from one
/// item to the next and how many fit.
pub const PAGE_X: i32 = 2;
pub const PAGE_WIDTH: i32 = 160;
pub const PAGE_FIRST: i32 = 17;
pub const ITEM_PITCH: i32 = 18;
pub const PAGE_VISIBLE: usize = 13;

/// A page's picture area at the right of its items, as (x, y, width, height).
pub const PICTURE: (i32, i32, i32, i32) = (164, 16, 315, 236);

/// The pad tiles of the Pad page, which fill the picture area: a tile's width and height, the
/// distance from one to the next, the tiles in a row and the row of a name below the tile's top.
pub const PAD_TILE_SIZE: i32 = 78;
pub const PAD_TILE_PITCH: i32 = 79;
pub const PAD_TILE_COLUMNS: usize = 4;
pub const PAD_TILE_NAME_Y: i32 = 17;

/// The tiles under MENU and PAGE: the top-left of the first, a tile's width and height, the
/// distance from one to the next across and down, the tiles in a row and where a name starts.
pub const TILE_X: i32 = 1;
pub const TILE_Y: i32 = 16;
pub const TILE_WIDTH: i32 = 118;
pub const TILE_HEIGHT: i32 = 58;
pub const TILE_PITCH_X: i32 = 119;
pub const TILE_PITCH_Y: i32 = 59;
pub const TILE_COLUMNS: usize = 4;
pub const TILE_NAME_X: i32 = 20;

/// A picker's rows: the x and width, the top of the first, the height, the distance from one to
/// the next and how many fit.
pub const ROW_X: i32 = 2;
pub const ROW_WIDTH: i32 = 476;
pub const ROW_FIRST: i32 = 17;
pub const ROW_HEIGHT: i32 = 13;
pub const ROW_PITCH: i32 = 14;
pub const LIST_VISIBLE: usize = 16;

/// SAMPLES' rows from `ROW_FIRST` above its meter, an item at the bottom of the main area: how many
/// fit at the top level, and the meter's top.
pub const SAMPLES_VISIBLE: usize = 15;
pub const METER_Y: i32 = MAIN_BOTTOM - ITEM_HEIGHT;

#[cfg(test)]
mod tests {
    use super::*;

    /// The last pixel row of `count` things `size` pixels high that start `pitch` pixels apart.
    fn last_row(first: i32, pitch: i32, size: i32, count: usize) -> i32 {
        first + pitch * (count as i32 - 1) + size - 1
    }

    #[test]
    fn as_many_items_and_rows_fit_as_are_visible() {
        // The last visible one has its cursor's outline in the main area too; one more would not.
        let fits = |first, pitch, size, count| last_row(first, pitch, size, count) < MAIN_BOTTOM;

        assert!(fits(PAGE_FIRST, ITEM_PITCH, ITEM_HEIGHT, PAGE_VISIBLE));
        assert!(!fits(PAGE_FIRST, ITEM_PITCH, ITEM_HEIGHT, PAGE_VISIBLE + 1));
        assert!(fits(ROW_FIRST, ROW_PITCH, ROW_HEIGHT, LIST_VISIBLE));
        assert!(!fits(ROW_FIRST, ROW_PITCH, ROW_HEIGHT, LIST_VISIBLE + 1));
        // SAMPLES' rows and their cursor stay above its meter, at y 235 as in samples.png.
        let above_meter = |count| last_row(ROW_FIRST, ROW_PITCH, ROW_HEIGHT, count) + 1 < METER_Y;
        assert!(above_meter(SAMPLES_VISIBLE));
        assert!(!above_meter(SAMPLES_VISIBLE + 1));
        assert_eq!(METER_Y, 235);
    }

    #[test]
    fn the_tiles_lie_in_the_main_area() {
        assert!(last_row(PICTURE.1, PAD_TILE_PITCH, PAD_TILE_SIZE, 3) <= MAIN_BOTTOM);
        assert!(last_row(TILE_Y, TILE_PITCH_Y, TILE_HEIGHT, 4) <= MAIN_BOTTOM);
    }

    #[test]
    fn the_pad_tiles_fill_the_picture_area() {
        let across = PAD_TILE_PITCH * (PAD_TILE_COLUMNS as i32 - 1) + PAD_TILE_SIZE;
        let down = PAD_TILE_PITCH * 2 + PAD_TILE_SIZE;

        assert_eq!((PICTURE.2, PICTURE.3), (across, down));
    }

    #[test]
    fn an_item_is_its_text_row_a_bar_and_a_pixel() {
        assert_eq!(ITEM_BAR + BAR_HEIGHT + 1, ITEM_HEIGHT);
        assert_eq!(ITEM_BAR, 14);
    }

    #[test]
    fn the_strip_cells_follow_one_another_inside_a_pixel_of_margin() {
        for pair in STRIP_CELLS.windows(2) {
            assert_eq!(pair[0].0 + pair[0].1, pair[1].0);
        }
        assert_eq!(STRIP_CELLS[0].0, 1);
        let (last, width) = STRIP_CELLS[3];
        assert_eq!(last + width, crate::screen::WIDTH as i32 - 1);
    }

    #[test]
    fn a_negative_size_is_an_empty_rectangle() {
        let empty = rect(3, 4, -5, -1);

        assert_eq!((empty.x, empty.y, empty.width, empty.height), (3, 4, 0, 0));
    }
}
