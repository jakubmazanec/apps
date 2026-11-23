use crate::{
    palette::{DIM, LINE},
    screen::{Canvas, Color, WIDTH},
    ui::{
        item::{ItemView, draw_item},
        layout::{
            HEADER_LINE, HEADER_RIGHT, HEADER_ROW, METRONOME_WIDTH, PIECE_GAP, STRIP_CELLS,
            STRIP_ITEM, STRIP_LINE, TEXT_X,
        },
        text,
    },
};

/// A text of the header and its colour.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Piece<'a> {
    pub text: &'a str,
    pub color: Color,
}

/// Draws the header: the `left` pieces from the left edge 6 pixels apart and the line under them
/// all. The right group is laid out from the right edge inwards, 6 pixels apart: `mute` in the dim
/// colour unless it is empty (S5), with `metronome` the metronome's icon, a dim triangle on the
/// capitals' rows (S9), then the `right` pieces from the last to the first.
pub fn draw_header(
    canvas: &mut impl Canvas,
    left: &[Piece],
    right: &[Piece],
    metronome: bool,
    mute: &str,
) {
    let mut x = TEXT_X;
    for piece in left {
        text::draw(canvas, x, HEADER_ROW, piece.text, piece.color);
        x += text::width(piece.text) + PIECE_GAP;
    }
    x = HEADER_RIGHT;
    if !mute.is_empty() {
        text::draw_right(canvas, x, HEADER_ROW, mute, DIM);
        x -= text::width(mute) + PIECE_GAP;
    }
    if metronome {
        // Its sides spread a column every 2 rows from the apex down to its base.
        for spread in 0..3 {
            for side in [x - 3 - spread, x - 3 + spread] {
                canvas.vline(side, HEADER_ROW + 3 + 2 * spread, 2, DIM);
            }
        }
        canvas.hline(
            x + 1 - METRONOME_WIDTH,
            HEADER_ROW + 9,
            METRONOME_WIDTH as u32,
            DIM,
        );
        x -= METRONOME_WIDTH + PIECE_GAP;
    }
    for piece in right.iter().rev() {
        text::draw_right(canvas, x, HEADER_ROW, piece.text, piece.color);
        x -= text::width(piece.text) + PIECE_GAP;
    }
    canvas.hline(0, HEADER_LINE, WIDTH as u32, LINE);
}

/// Draws the line above the strip and the item of each cell that has one.
pub fn draw_strip(canvas: &mut impl Canvas, cells: &[Option<ItemView>; 4]) {
    canvas.hline(0, STRIP_LINE, WIDTH as u32, LINE);
    for (cell, &(x, width)) in cells.iter().zip(&STRIP_CELLS) {
        if let Some(item) = cell {
            draw_item(canvas, x, STRIP_ITEM, width, item, false, None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{ACCENT, BACKGROUND, DIM, FAINT, LINE, RECORD, TEXT};
    use crate::screen::Screen;
    use crate::ui::item::{Bar, ItemView};
    use crate::ui::test_pixels::{filled, ink, picture, span};

    fn piece(text: &str, color: Color) -> Piece<'_> {
        Piece { text, color }
    }

    #[test]
    fn the_header_matches_sound_pad_png() {
        let mut screen = Screen::new();

        draw_header(
            &mut screen,
            &[
                piece("Sound", ACCENT),
                piece("Pad", TEXT),
                piece("T1", TEXT),
                piece("Snare", TEXT),
                piece("Pads", DIM),
            ],
            &[],
            false,
            "",
        );

        // The line under the header, across the whole screen.
        assert!(filled(&screen, 0..=479, 14..=14, LINE));
        assert_eq!(ink(&screen, LINE), 480);
        // Each piece 6 pixels after the one before it, ink from x 4, on the capitals' rows 4 to 10.
        assert_eq!(span(&screen, 0..=36, 4..=10, ACCENT), Some((4, 32)));
        assert_eq!(span(&screen, 37..=60, 4..=10, TEXT), Some((39, 55)));
        assert_eq!(span(&screen, 61..=76, 4..=10, TEXT), Some((62, 72)));
        assert_eq!(span(&screen, 77..=112, 4..=10, TEXT), Some((79, 107)));
        assert_eq!(span(&screen, 113..=150, 4..=10, DIM), Some((114, 136)));
        assert!(filled(&screen, 0..=479, 15..=271, BACKGROUND));
    }

    #[test]
    fn a_message_ends_at_the_right_edge_of_the_header() {
        let mut screen = Screen::new();

        draw_header(
            &mut screen,
            &[piece("Step", ACCENT)],
            &[piece("Storage full. Not saved", RECORD)],
            false,
            "",
        );

        assert_eq!(span(&screen, 0..=479, 4..=10, ACCENT), Some((4, 26)));
        assert_eq!(span(&screen, 0..=479, 4..=10, RECORD), Some((339, 475)));
    }

    #[test]
    fn right_pieces_end_at_the_right_edge_6_pixels_apart() {
        let mut screen = Screen::new();

        draw_header(
            &mut screen,
            &[piece("Step", ACCENT)],
            &[piece("P1", TEXT), piece("1/1", TEXT), piece("120.0", TEXT)],
            false,
            "",
        );

        // step-stopped.png: the tempo last, ending at x 475.
        assert_eq!(span(&screen, 300..=420, 4..=10, TEXT), Some((407, 417)));
        assert_eq!(span(&screen, 421..=443, 4..=10, TEXT), Some((424, 440)));
        assert_eq!(span(&screen, 444..=479, 4..=10, TEXT), Some((447, 475)));
    }

    #[test]
    fn the_metronome_icon_ends_the_transport() {
        let mut screen = Screen::new();

        draw_header(
            &mut screen,
            &[piece("Step", ACCENT)],
            &[piece("P1", TEXT), piece("1/1", TEXT), piece("120.0", TEXT)],
            true,
            "",
        );

        // A dim triangle on the capitals' rows 4 to 10, ending at x 475, and nothing else dim.
        assert_eq!(
            picture(&screen, 469..=475, 4..=10, DIM),
            [
                "...#...", "...#...", "..#.#..", "..#.#..", ".#...#.", ".#...#.", "#######"
            ]
        );
        assert_eq!(ink(&screen, DIM), 17);
        // The tempo ends 6 pixels before it.
        assert_eq!(span(&screen, 431..=479, 4..=10, TEXT), Some((434, 462)));
    }

    #[test]
    fn the_muted_tracks_end_the_right_group_before_the_metronome_icon() {
        let mut screen = Screen::new();

        draw_header(
            &mut screen,
            &[piece("Step", ACCENT)],
            &[piece("P1", TEXT), piece("1/1", TEXT), piece("120.0", TEXT)],
            true,
            "Mute 2 4",
        );

        // The dim text ends at x 475, with the icon, 7 pixels wide, 6 pixels before it.
        assert_eq!(span(&screen, 423..=479, 4..=10, DIM), Some((429, 475)));
        assert_eq!(span(&screen, 400..=422, 4..=10, DIM), Some((416, 422)));
        // The tempo ends 6 pixels before the icon.
        assert_eq!(span(&screen, 380..=415, 4..=10, TEXT), Some((381, 409)));
    }

    #[test]
    fn the_strip_matches_sound_filter_png() {
        let mut screen = Screen::new();
        let cell = |name, value, bar| {
            Some(ItemView {
                encoder: Some(1),
                name,
                value,
                bar,
                alert: false,
            })
        };

        draw_strip(
            &mut screen,
            &[
                cell("Mode", "LP 24", Bar::Fill(65_535, 65_535)),
                cell("Cutoff", "64%", Bar::Track),
                None,
                None,
            ],
        );

        assert!(filled(&screen, 0..=479, 253..=253, LINE));
        assert_eq!(ink(&screen, LINE), 480);
        assert!(filled(&screen, 4..=117, 269..=270, ACCENT));
        assert!(filled(&screen, 124..=237, 269..=270, FAINT));
        // Name and value of each cell, the digit left out, on the capitals' rows 258 to 264.
        assert_eq!(span(&screen, 1..=120, 258..=264, DIM), Some((4, 26)));
        assert_eq!(span(&screen, 1..=120, 258..=264, TEXT), Some((89, 117)));
        assert_eq!(span(&screen, 121..=240, 258..=264, DIM), Some((124, 158)));
        assert_eq!(span(&screen, 121..=240, 258..=264, TEXT), Some((221, 237)));
        // Nothing above the line and nothing in the two empty cells.
        assert!(filled(&screen, 0..=479, 0..=252, BACKGROUND));
        assert!(filled(&screen, 241..=478, 254..=271, BACKGROUND));
    }

    #[test]
    fn an_empty_strip_is_only_its_line() {
        let mut screen = Screen::new();

        draw_strip(&mut screen, &[None; 4]);

        assert_eq!(ink(&screen, LINE), 480);
        assert_eq!(ink(&screen, BACKGROUND), 480 * 272 - 480);
    }

    #[test]
    fn the_four_cells_of_the_strip_sit_where_the_pictures_put_them() {
        let mut screen = Screen::new();
        let cell = |name, value| {
            Some(ItemView {
                encoder: None,
                name,
                value,
                bar: Bar::Track,
                alert: false,
            })
        };

        draw_strip(
            &mut screen,
            &[
                cell("Mode", "LP 24"),
                cell("Cutoff", "64%"),
                cell("Resonance", "12%"),
                cell("Envelope amount", "+40"),
            ],
        );

        // sound-filter.png: where each name starts and each bar and value ends.
        assert_eq!(span(&screen, 241..=359, 258..=264, DIM), Some((244, 296)));
        assert_eq!(span(&screen, 241..=359, 258..=264, TEXT), Some((340, 356)));
        assert_eq!(span(&screen, 360..=478, 258..=264, DIM), Some((363, 451)));
        assert_eq!(span(&screen, 360..=478, 258..=264, TEXT), Some((459, 475)));
        assert!(filled(&screen, 244..=356, 269..=270, FAINT));
        assert!(filled(&screen, 363..=475, 269..=270, FAINT));
    }
}
