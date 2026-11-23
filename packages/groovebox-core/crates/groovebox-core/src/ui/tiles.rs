use crate::{
    palette::{ACCENT, DIM, FAINT, LINE, TEXT},
    screen::Canvas,
    ui::{
        layout::{
            CHAIN_NAME_X, CHAIN_TILE_HEIGHT, CHAIN_TILE_PITCH, CHAIN_TILE_WIDTH, CHAIN_TILE_X,
            CHAIN_TILE_Y, PAD_TILE_COLUMNS, PAD_TILE_NAME_Y, PAD_TILE_PITCH, PAD_TILE_SIZE,
            PICTURE, TEXT_INSET, TILE_COLUMNS, TILE_HEIGHT, TILE_NAME_X, TILE_PITCH_X,
            TILE_PITCH_Y, TILE_WIDTH, TILE_X, TILE_Y, rect,
        },
        text,
    },
};

/// The numbers on the tiles, 1 to 16.
const NUMBERS: [&str; 16] = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16",
];

/// How a tile under MENU or PAGE looks.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TileState {
    /// The screen or page shown now: all in the accent.
    Current,
    /// One that exists: a line outline, a dim number and a bright name.
    Exists,
    /// One that does not: a faint outline and a dim number, no name.
    Empty,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Tile<'a> {
    pub name: Option<&'a str>,
    pub state: TileState,
}

/// Draws the 16 tiles of the step buttons, 4 in a row, each with its number from 1 and its name
/// next to it. A name that does not fit is shortened, or on the current tile scrolls, `elapsed`
/// samples after the cursor landed (`text::draw_in`). Returns whether a name scrolls.
pub fn draw_tiles(canvas: &mut impl Canvas, tiles: &[Tile; 16], elapsed: u64) -> bool {
    let mut scrolls = false;
    for (index, tile) in tiles.iter().enumerate() {
        let x = TILE_X + TILE_PITCH_X * (index % TILE_COLUMNS) as i32;
        let y = TILE_Y + TILE_PITCH_Y * (index / TILE_COLUMNS) as i32;
        let (outline, number_color, name_color) = match tile.state {
            TileState::Current => (ACCENT, ACCENT, Some(ACCENT)),
            TileState::Exists => (LINE, DIM, Some(TEXT)),
            TileState::Empty => (FAINT, DIM, None),
        };
        canvas.outline_rect(rect(x, y, TILE_WIDTH, TILE_HEIGHT), outline);
        text::draw(
            canvas,
            x + TEXT_INSET,
            y + TEXT_INSET,
            NUMBERS[index],
            number_color,
        );
        if let (Some(name), Some(color)) = (tile.name, name_color) {
            scrolls |= text::draw_in(
                canvas,
                x + TILE_NAME_X,
                y + TEXT_INSET,
                TILE_WIDTH - TILE_NAME_X - TEXT_INSET,
                name,
                (tile.state == TileState::Current).then_some(elapsed),
                color,
            );
        }
    }
    scrolls
}

/// A pad of the Pad page: the name of its sound, none when it is empty.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PadTile<'a> {
    pub name: Option<&'a str>,
    pub selected: bool,
}

/// Draws the 12 pads, 4 in a row, each with its number from 1 and below it the name of its
/// sound. The selected pad is all in the accent. The others have a dim number and a bright name,
/// and a line outline or, when the pad is empty, a faint one. A name that does not fit is
/// shortened, or on the selected pad scrolls, `elapsed` samples after the cursor landed
/// (`text::draw_in`). Returns whether a name scrolls.
pub fn draw_pad_tiles(canvas: &mut impl Canvas, pads: &[PadTile; 12], elapsed: u64) -> bool {
    let mut scrolls = false;
    for (index, pad) in pads.iter().enumerate() {
        let x = PICTURE.0 + PAD_TILE_PITCH * (index % PAD_TILE_COLUMNS) as i32;
        let y = PICTURE.1 + PAD_TILE_PITCH * (index / PAD_TILE_COLUMNS) as i32;
        let (outline, number_color, name_color) = match (pad.selected, pad.name) {
            (true, _) => (ACCENT, ACCENT, ACCENT),
            (false, Some(_)) => (LINE, DIM, TEXT),
            (false, None) => (FAINT, DIM, TEXT),
        };
        canvas.outline_rect(rect(x, y, PAD_TILE_SIZE, PAD_TILE_SIZE), outline);
        text::draw(
            canvas,
            x + TEXT_INSET,
            y + TEXT_INSET,
            NUMBERS[index],
            number_color,
        );
        if let Some(name) = pad.name {
            scrolls |= text::draw_in(
                canvas,
                x + TEXT_INSET,
                y + PAD_TILE_NAME_Y,
                PAD_TILE_SIZE - 2 * TEXT_INSET,
                name,
                pad.selected.then_some(elapsed),
                name_color,
            );
        }
    }
    scrolls
}

/// Draws FX Chain's six slots in a row (S15), each with its number from 1 and its effect's name
/// from `names`, none for an empty slot. The `cursor`'s tile is all in the accent. The others have
/// a dim number and a bright name, and a line outline or, when the slot is empty, a faint one.
pub fn draw_chain(canvas: &mut impl Canvas, names: &[Option<&str>; 6], cursor: Option<usize>) {
    for (index, name) in names.iter().enumerate() {
        let x = CHAIN_TILE_X + CHAIN_TILE_PITCH * index as i32;
        let (outline, number_color, name_color) = match (cursor == Some(index), name) {
            (true, _) => (ACCENT, ACCENT, ACCENT),
            (false, Some(_)) => (LINE, DIM, TEXT),
            (false, None) => (FAINT, DIM, TEXT),
        };
        canvas.outline_rect(
            rect(x, CHAIN_TILE_Y, CHAIN_TILE_WIDTH, CHAIN_TILE_HEIGHT),
            outline,
        );
        text::draw(
            canvas,
            x + TEXT_INSET,
            CHAIN_TILE_Y + TEXT_INSET,
            NUMBERS[index],
            number_color,
        );
        if let Some(name) = name {
            text::draw(
                canvas,
                x + CHAIN_NAME_X,
                CHAIN_TILE_Y + TEXT_INSET,
                name,
                name_color,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{ACCENT, DIM, FAINT, LINE, TEXT};
    use crate::screen::Screen;
    use crate::ui::test_pixels::{MOVED, ink, outlined, picture, span};
    use crate::ui::text;

    /// The sixteen tiles of menu-held.png: Step is the current screen, the next nine exist.
    fn menu() -> [Tile<'static>; 16] {
        let names = [
            "Step", "Roll", "Sound", "Fx", "Mix", "Pool", "Project", "Settings", "Pattern",
            "Samples",
        ];
        core::array::from_fn(|index| match names.get(index) {
            Some(&name) => Tile {
                name: Some(name),
                state: if index == 0 {
                    TileState::Current
                } else {
                    TileState::Exists
                },
            },
            None => Tile {
                name: None,
                state: TileState::Empty,
            },
        })
    }

    #[test]
    fn the_menu_tiles_match_menu_held_png() {
        let mut screen = Screen::new();

        draw_tiles(&mut screen, &menu(), 0);

        // Tile 1, the current one: the accent outline, number and name.
        assert!(outlined(&screen, 1, 16, 118, 58, ACCENT));
        assert_eq!(span(&screen, 2..=117, 17..=72, ACCENT), Some((4, 43)));
        assert_eq!(span(&screen, 2..=19, 17..=72, ACCENT), Some((4, 8)));
        assert_eq!(span(&screen, 20..=117, 17..=72, ACCENT), Some((21, 43)));
        assert_eq!(
            picture(&screen, 4..=8, 22..=28, ACCENT),
            [
                "..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"
            ]
        );
        // Tile 2, one that exists: a line outline, a dim number and a bright name.
        assert!(outlined(&screen, 120, 16, 118, 58, LINE));
        assert_eq!(span(&screen, 121..=137, 17..=72, DIM), Some((123, 127)));
        assert_eq!(
            span(&screen, 138..=236, 17..=72, TEXT).map(|s| s.0),
            Some(140)
        );
        // Tile 4 ends the first row, tiles 9 and 10 start the third.
        assert!(outlined(&screen, 358, 16, 118, 58, LINE));
        assert!(outlined(&screen, 1, 134, 118, 58, LINE));
        assert!(outlined(&screen, 120, 134, 118, 58, LINE));
        // Tile 11, empty: a faint outline and a dim number, no name.
        assert!(outlined(&screen, 239, 134, 118, 58, FAINT));
        assert_eq!(span(&screen, 240..=355, 135..=190, DIM), Some((242, 252)));
        assert_eq!(span(&screen, 240..=355, 135..=190, TEXT), None);
        assert_eq!(span(&screen, 240..=355, 135..=190, ACCENT), None);
        // Tile 16, the last one.
        assert!(outlined(&screen, 358, 193, 118, 58, FAINT));
        assert_eq!(span(&screen, 359..=474, 194..=249, DIM), Some((361, 371)));
    }

    #[test]
    fn a_menu_tile_name_is_shortened_to_the_room_after_the_number() {
        let mut screen = Screen::new();
        let mut name = Screen::new();
        let mut tiles = menu();
        tiles[1].name = Some("Name that is far too long");

        draw_tiles(&mut screen, &tiles, 0);
        // 16 characters are 95 pixels, from the name's x 140 to the 3 pixels inside the tile.
        text::draw(&mut name, 140, 19, "Name that is fa…", TEXT);

        assert_eq!(
            picture(&screen, 139..=236, 17..=72, TEXT),
            picture(&name, 139..=236, 17..=72, TEXT)
        );
        assert_eq!(span(&screen, 139..=236, 17..=72, TEXT), Some((140, 234)));
    }

    #[test]
    fn a_name_on_an_empty_menu_tile_is_not_drawn() {
        let mut screen = Screen::new();
        let mut tiles = menu();
        tiles[10].name = Some("Hidden");

        draw_tiles(&mut screen, &tiles, 0);

        assert_eq!(span(&screen, 240..=355, 135..=190, TEXT), None);
    }

    /// The twelve pads of sound-pad.png: pad 2 is selected and pad 10 is empty.
    fn pads() -> [PadTile<'static>; 12] {
        let names = [
            Some("Kick"),
            Some("Snare"),
            Some("Hat"),
            Some("Hat open"),
            Some("Clap"),
            Some("Říkanka"),
            Some("Tom"),
            Some("Déšť"),
            Some("Bass"),
            None,
            Some("Chord"),
            Some("Kick"),
        ];
        core::array::from_fn(|index| PadTile {
            name: names[index],
            selected: index == 1,
        })
    }

    #[test]
    fn the_pad_tiles_match_sound_pad_png() {
        let mut screen = Screen::new();

        draw_pad_tiles(&mut screen, &pads(), 0);

        // Tile 1: a line outline, a dim number 3 pixels in and the name on the row at y + 17.
        assert!(outlined(&screen, 164, 16, 78, 78, LINE));
        assert_eq!(
            picture(&screen, 167..=171, 22..=28, DIM),
            [
                "..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"
            ]
        );
        assert_eq!(span(&screen, 165..=240, 17..=32, DIM), Some((167, 171)));
        assert_eq!(span(&screen, 165..=240, 33..=92, TEXT), Some((167, 189)));
        // Tile 2, selected: the outline, the number and the name in the accent.
        assert!(outlined(&screen, 243, 16, 78, 78, ACCENT));
        assert_eq!(span(&screen, 244..=319, 17..=32, ACCENT), Some((246, 250)));
        assert_eq!(span(&screen, 244..=319, 36..=42, ACCENT), Some((246, 274)));
        assert_eq!(span(&screen, 244..=319, 17..=92, TEXT), None);
        // Tile 4 ends the first row, tile 5 starts the second and tile 12 ends the third.
        assert!(outlined(&screen, 401, 16, 78, 78, LINE));
        assert!(outlined(&screen, 164, 95, 78, 78, LINE));
        assert!(outlined(&screen, 401, 174, 78, 78, LINE));
        assert_eq!(span(&screen, 402..=477, 17..=92, TEXT), Some((404, 450)));
        assert_eq!(span(&screen, 165..=240, 112..=121, TEXT), Some((167, 189)));
    }

    #[test]
    fn an_empty_pad_tile_has_a_faint_outline_and_only_its_number() {
        let mut screen = Screen::new();

        draw_pad_tiles(&mut screen, &pads(), 0);

        assert!(outlined(&screen, 243, 174, 78, 78, FAINT));
        assert_eq!(span(&screen, 244..=319, 175..=250, DIM), Some((246, 256)));
        assert_eq!(span(&screen, 244..=319, 188..=250, DIM), None);
        assert_eq!(span(&screen, 244..=319, 175..=250, TEXT), None);
    }

    #[test]
    fn a_selected_empty_pad_is_outlined_and_numbered_in_the_accent() {
        let mut screen = Screen::new();
        let mut pads = pads();
        pads[1] = PadTile {
            name: None,
            selected: false,
        };
        pads[9].selected = true;

        draw_pad_tiles(&mut screen, &pads, 0);

        assert!(outlined(&screen, 243, 174, 78, 78, ACCENT));
        assert_eq!(
            span(&screen, 244..=319, 175..=250, ACCENT),
            Some((246, 256))
        );
        assert!(outlined(&screen, 243, 16, 78, 78, FAINT));
        assert_eq!(ink(&screen, ACCENT), 2 * (78 + 78) - 4 + 31);
    }

    #[test]
    fn a_pad_tile_name_is_shortened_to_the_room_inside_the_tile() {
        let mut screen = Screen::new();
        let mut name = Screen::new();
        let mut pads = pads();
        pads[0].name = Some("Žluťoučký kůň");

        draw_pad_tiles(&mut screen, &pads, 0);
        text::draw(&mut name, 167, 33, "Žluťoučký k…", TEXT);

        assert_eq!(
            picture(&screen, 165..=240, 33..=92, TEXT),
            picture(&name, 165..=240, 33..=92, TEXT)
        );
    }

    #[test]
    fn the_chain_tiles_match_fx_chain_png() {
        let mut screen = Screen::new();

        draw_chain(
            &mut screen,
            &[Some("Delay"), Some("Reverb"), None, None, None, None],
            Some(1),
        );

        // Slot 1, used: a line outline of 78 by 19 pixels at (1, 16), a dim number 3 pixels in and
        // a bright name 14 pixels in.
        assert!(outlined(&screen, 1, 16, 78, 19, LINE));
        assert_eq!(span(&screen, 2..=77, 17..=33, DIM), Some((4, 8)));
        assert_eq!(
            span(&screen, 2..=77, 17..=33, TEXT),
            Some((15, 14 + text::width("Delay") as usize))
        );
        // Slot 2, the cursor's: its outline, number and name in the accent.
        assert!(outlined(&screen, 80, 16, 78, 19, ACCENT));
        assert_eq!(
            span(&screen, 81..=156, 17..=33, ACCENT),
            Some((83, 93 + text::width("Reverb") as usize))
        );
        assert_eq!(span(&screen, 81..=156, 17..=33, TEXT), None);
        // Slots 3 to 6, empty: a faint outline and a dim number, no name.
        for slot in 2..6 {
            let x = 1 + 79 * slot;
            assert!(outlined(&screen, x, 16, 78, 19, FAINT), "{slot}");
            assert_eq!(
                span(&screen, x + 1..=x + 76, 17..=33, DIM),
                Some((x + 3, x + 7))
            );
            assert_eq!(span(&screen, x + 1..=x + 76, 17..=33, TEXT), None);
        }
    }

    #[test]
    fn only_the_current_tile_scrolls() {
        let mut screen = Screen::new();
        let mut name = Screen::new();
        let mut tiles = menu();
        tiles[0].name = Some("Filter envelope 2");
        tiles[1].name = Some("Filter envelope 2");

        let scrolls = draw_tiles(&mut screen, &tiles, MOVED);
        text::draw(&mut name, 140, 19, "Filter envelope…", TEXT);
        // The name's room is 95 pixels, from x 21 to the 3 pixels inside the tile.
        text::draw_in(
            &mut name,
            21,
            19,
            95,
            "Filter envelope 2",
            Some(MOVED),
            ACCENT,
        );

        assert!(scrolls);
        let (first, last) = span(&screen, 20..=117, 17..=72, ACCENT).unwrap();
        assert!(first >= 21 && last <= 115, "{first} to {last}");
        assert_eq!(
            picture(&screen, 20..=117, 17..=72, ACCENT),
            picture(&name, 20..=117, 17..=72, ACCENT)
        );
        assert_eq!(
            picture(&screen, 139..=236, 17..=72, TEXT),
            picture(&name, 139..=236, 17..=72, TEXT)
        );
        assert!(!draw_tiles(&mut Screen::new(), &menu(), MOVED));
    }

    #[test]
    fn only_the_selected_pad_scrolls() {
        let mut screen = Screen::new();
        let mut name = Screen::new();
        let mut pads = pads();
        pads[0] = PadTile {
            name: Some("Hat open take3"),
            selected: true,
        };
        pads[1] = PadTile {
            name: Some("Hat open take3"),
            selected: false,
        };

        let scrolls = draw_pad_tiles(&mut screen, &pads, MOVED);
        text::draw(&mut name, 246, 33, "Hat open ta…", TEXT);
        // The name's room is 72 pixels, from x 167 to the 3 pixels inside the tile.
        text::draw_in(
            &mut name,
            167,
            33,
            72,
            "Hat open take3",
            Some(MOVED),
            ACCENT,
        );

        assert!(scrolls);
        let (first, last) = span(&screen, 165..=240, 33..=92, ACCENT).unwrap();
        assert!(first >= 167 && last <= 238, "{first} to {last}");
        assert_eq!(
            picture(&screen, 165..=240, 33..=92, ACCENT),
            picture(&name, 165..=240, 33..=92, ACCENT)
        );
        assert_eq!(
            picture(&screen, 244..=319, 33..=92, TEXT),
            picture(&name, 244..=319, 33..=92, TEXT)
        );
        assert!(!draw_pad_tiles(&mut Screen::new(), &self::pads(), MOVED));
    }
}
