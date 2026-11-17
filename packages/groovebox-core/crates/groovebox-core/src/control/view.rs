use super::pages::{MENU, PageDef};
use super::samples::Row;
use crate::input::{Button, STEPS};
use crate::library::{FileId, FolderId};
use crate::ui::layout::{LIST_VISIBLE, PAGE_VISIBLE, SAMPLES_VISIBLE};
use crate::ui::tiles::{Tile, TileState};

/// The screens of the device that exist so far. A new project opens on STEP.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Step,
    Sound,
    Settings,
    Samples,
}

/// How many screens there are.
const SCREENS: usize = Screen::Samples as usize + 1;
/// The most pages a screen can have: one per step.
const PAGES: usize = STEPS as usize;

impl Screen {
    /// Every screen, in the order of their steps under MENU.
    pub const ALL: [Self; SCREENS] = [Self::Step, Self::Sound, Self::Settings, Self::Samples];

    /// The name the header starts with.
    pub fn name(self) -> &'static str {
        match self {
            Self::Step => "Step",
            Self::Sound => "Sound",
            Self::Settings => "Settings",
            Self::Samples => "Samples",
        }
    }

    /// The screen whose pages PAGE shows here and whose page the encoders use: SOUND on STEP,
    /// which has no pages of its own, and the screen itself elsewhere.
    pub fn paged(self) -> Self {
        match self {
            Self::Step => Self::Sound,
            screen => screen,
        }
    }
}

/// The cursor of a page or the highlight of a picker: the item or row it is on and the first one
/// the page's column or the picker shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cursor {
    pub item: usize,
    pub scroll: usize,
}

/// SAMPLES' folder and cursor. The cursor stays on its row while rows come or go above it
/// (`Control::keep_samples_cursor`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SamplesView {
    /// The folder shown; none at the top level.
    pub folder: Option<FolderId>,
    pub cursor: Cursor,
    /// The row under the cursor; none while the folder has no rows.
    pub on: Option<Row>,
}

impl SamplesView {
    /// How many rows fit: 15 at the top level and 14 inside a folder, under its line.
    pub fn fit(&self) -> usize {
        SAMPLES_VISIBLE - usize::from(self.folder.is_some())
    }

    /// Puts the cursor on row `item`, which is `on`, and scrolls the rows as far as they must to
    /// keep it on the screen.
    pub fn land(&mut self, item: usize, on: Option<Row>) {
        self.cursor = Cursor {
            item,
            scroll: scrolled(item, self.cursor.scroll, self.fit()),
        };
        self.on = on;
    }
}

/// A picker: the sound picker of the selected pad, or the Delete picker of a file of SAMPLES.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Picker {
    Sound,
    Delete(FileId),
}

/// A question, which only OK and CANCEL answer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Question {
    /// "Delete clap.wav?"
    DeleteFile(FileId),
}

/// What the screen shows: the screen, the page each screen shows, the cursor of each page, SAMPLES'
/// folder and cursor and a picker or a question while one is open. They are kept while the control
/// part lives and are not saved.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct View {
    pub screen: Screen,
    /// The page each screen shows, by screen.
    pages: [usize; SCREENS],
    /// The cursor of each page, by screen and page.
    cursors: [[Cursor; PAGES]; SCREENS],
    pub samples: SamplesView,
    /// The picker while it is open over the main area of `screen`, with its highlight.
    pub picker: Option<(Picker, Cursor)>,
    /// The question while it is open over the middle of the main area of `screen`.
    pub question: Option<Question>,
}

impl View {
    /// STEP, where a new project opens, with every screen on its first page, every cursor on the
    /// first item, SAMPLES at the top level and no picker or question open.
    pub const fn new() -> Self {
        Self {
            screen: Screen::Step,
            pages: [0; SCREENS],
            cursors: [[Cursor { item: 0, scroll: 0 }; PAGES]; SCREENS],
            samples: SamplesView {
                folder: None,
                cursor: Cursor { item: 0, scroll: 0 },
                on: None,
            },
            picker: None,
            question: None,
        }
    }

    /// The page `screen` remembers, counted from 0. It is not shown while the screen has fewer
    /// pages (`Control::shown_page`).
    pub fn page(&self, screen: Screen) -> usize {
        self.pages[screen as usize]
    }

    /// Makes `screen` show page `page`, with its cursor where it was left.
    pub fn show_page(&mut self, screen: Screen, page: usize) {
        self.pages[screen as usize] = page;
    }

    /// The cursor of page `page` of `screen`.
    pub fn cursor(&self, screen: Screen, page: usize) -> Cursor {
        self.cursors[screen as usize][page]
    }

    /// Puts the cursor of page `page` of `screen` on item `item`, and scrolls the page's column as
    /// far as it must to keep the item on the screen.
    pub fn move_cursor(&mut self, screen: Screen, page: usize, item: usize) {
        let cursor = &mut self.cursors[screen as usize][page];
        *cursor = Cursor {
            item,
            scroll: scrolled(item, cursor.scroll, PAGE_VISIBLE),
        };
    }

    /// Keeps the cursor of page `page` of `screen` on one of the page's `items` items: when it is
    /// past the last one, as when the item under it vanished, it moves up to the last one and
    /// stays there.
    pub fn keep_cursor(&mut self, screen: Screen, page: usize, items: usize) {
        let cursor = &mut self.cursors[screen as usize][page];
        if cursor.item >= items {
            let item = items.saturating_sub(1);
            *cursor = Cursor {
                item,
                scroll: scrolled(item, cursor.scroll, PAGE_VISIBLE),
            };
        }
    }

    /// Highlights row `row` of `picker`, opening it when it is closed, and scrolls it as far as it
    /// must to keep the row on the screen.
    pub fn highlight(&mut self, picker: Picker, row: usize) {
        let scroll = self.picker.map_or(0, |(_, highlight)| highlight.scroll);
        self.picker = Some((
            picker,
            Cursor {
                item: row,
                scroll: scrolled(row, scroll, LIST_VISIBLE),
            },
        ));
    }
}

impl Default for View {
    fn default() -> Self {
        Self::new()
    }
}

/// The first item a column shows once its cursor is on item `cursor`, when it showed item `scroll`
/// first before and `visible` items fit. The column moves only as far as it must: one item when
/// the cursor passes the last item fully shown, and up to the cursor when the cursor goes above
/// the first. Pages and pickers scroll this way.
pub fn scrolled(cursor: usize, scroll: usize, visible: usize) -> usize {
    scroll.clamp((cursor + 1).saturating_sub(visible), cursor)
}

/// The row an arrow, - or + moves a list's highlight to from row `row`, when `last` is its last row
/// and `visible` rows fit: up, down, - and + move one row and left and right `visible` rows,
/// stopping at the ends. Pickers and SAMPLES move this way.
pub fn moved(button: Button, row: usize, last: usize, visible: usize) -> usize {
    match button {
        Button::Up | Button::Minus => row.saturating_sub(1),
        Button::Down | Button::Plus => (row + 1).min(last),
        Button::Left => row.saturating_sub(visible),
        Button::Right => (row + visible).min(last),
        _ => unreachable!("only the arrows, - and + move a list"),
    }
}

/// The tiles MENU shows: each screen that exists on the tile of its step, `current` as the
/// current one.
pub fn menu_tiles(current: Screen) -> [Tile<'static>; 16] {
    MENU.map(|screen| tile(screen.map(Screen::name), screen == Some(current)))
}

/// The tiles PAGE shows for a screen's `pages`: each page on the tile of its step, page `current`
/// as the current one. The steps without a page have empty tiles, all 16 of them when there are no
/// pages.
pub fn page_tiles(pages: &[PageDef], current: usize) -> [Tile<'static>; 16] {
    core::array::from_fn(|step| tile(pages.get(step).map(|page| page.name), step == current))
}

/// The tile of the screen or page with this name, which is the current one or not; an empty tile
/// without one.
fn tile(name: Option<&'static str>, current: bool) -> Tile<'static> {
    Tile {
        name,
        state: match (name, current) {
            (None, _) => TileState::Empty,
            (Some(_), true) => TileState::Current,
            (Some(_), false) => TileState::Exists,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY: Tile = Tile {
        name: None,
        state: TileState::Empty,
    };

    #[test]
    fn no_pages_give_16_empty_tiles() {
        assert_eq!(page_tiles(&[], 0), [EMPTY; 16]);
    }

    #[test]
    fn each_page_has_its_tile_and_the_current_one_is_marked() {
        let page = |name| PageDef {
            name,
            items: &[],
            picture: None,
        };
        let tiles = page_tiles(&[page("Pad"), page("Sample"), page("Filter")], 1);

        assert_eq!(
            tiles[..3],
            [
                Tile {
                    name: Some("Pad"),
                    state: TileState::Exists
                },
                Tile {
                    name: Some("Sample"),
                    state: TileState::Current
                },
                Tile {
                    name: Some("Filter"),
                    state: TileState::Exists
                },
            ]
        );
        assert_eq!(tiles[3..], [EMPTY; 13]);
    }

    #[test]
    fn the_menu_tiles_show_step_sound_settings_and_samples() {
        let tiles = menu_tiles(Screen::Settings);

        assert_eq!(
            tiles[0],
            Tile {
                name: Some("Step"),
                state: TileState::Exists
            }
        );
        assert_eq!(
            tiles[2],
            Tile {
                name: Some("Sound"),
                state: TileState::Exists
            }
        );
        assert_eq!(
            tiles[7],
            Tile {
                name: Some("Settings"),
                state: TileState::Current
            }
        );
        assert_eq!(
            tiles[9],
            Tile {
                name: Some("Samples"),
                state: TileState::Exists
            }
        );
        assert_eq!(tiles.iter().filter(|&&tile| tile == EMPTY).count(), 12);
        assert_eq!(menu_tiles(Screen::Step)[0].state, TileState::Current);
    }

    #[test]
    fn scrolling_keeps_the_cursor_on_screen_one_item_at_a_time() {
        assert_eq!(scrolled(12, 0, 13), 0);
        assert_eq!(scrolled(13, 0, 13), 1);
        assert_eq!(scrolled(0, 5, 13), 0);

        // Down a page of 20 items and back up.
        let mut scroll = 0;
        for cursor in 0..20 {
            scroll = scrolled(cursor, scroll, 13);
            assert_eq!(scroll, cursor.saturating_sub(12), "down to {cursor}");
        }
        for cursor in (0..20).rev() {
            scroll = scrolled(cursor, scroll, 13);
            assert_eq!(scroll, cursor.min(7), "up to {cursor}");
        }
    }

    #[test]
    fn each_page_remembers_its_cursor() {
        let mut view = View::new();
        let top = Cursor { item: 0, scroll: 0 };

        view.move_cursor(Screen::Settings, 0, 14);
        assert_eq!(
            view.cursor(Screen::Settings, 0),
            Cursor {
                item: 14,
                scroll: 2
            }
        );
        view.show_page(Screen::Settings, 1);
        assert_eq!(view.page(Screen::Settings), 1);
        assert_eq!(view.cursor(Screen::Settings, 1), top);
        view.move_cursor(Screen::Settings, 1, 3);
        view.show_page(Screen::Settings, 0);

        assert_eq!(
            view.cursor(Screen::Settings, 0),
            Cursor {
                item: 14,
                scroll: 2
            }
        );
        assert_eq!(view.page(Screen::Sound), 0);
        assert_eq!(view.cursor(Screen::Sound, 0), top);
    }
}
