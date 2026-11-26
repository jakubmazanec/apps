use super::bars::Change;
use super::pages::{MENU, PageDef};
use super::samples::Row;
use super::step_view::StepView;
use crate::input::{Button, STEPS};
use crate::library::{FileId, FolderId};
use crate::project::pool::SoundNumber;
use crate::ui::layout::{LIST_VISIBLE, PAGE_VISIBLE, SAMPLES_VISIBLE};
use crate::ui::tiles::{Tile, TileState};

/// The screens of the device that exist so far. A new project opens on STEP.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Step,
    Roll,
    Sound,
    Fx,
    Mix,
    Pool,
    Settings,
    Pattern,
    Samples,
}

/// How many screens there are.
const SCREENS: usize = Screen::Samples as usize + 1;
/// The most pages a screen can have: one per step.
const PAGES: usize = STEPS as usize;

impl Screen {
    /// Every screen, in the order of their steps under MENU.
    pub const ALL: [Self; SCREENS] = [
        Self::Step,
        Self::Roll,
        Self::Sound,
        Self::Fx,
        Self::Mix,
        Self::Pool,
        Self::Settings,
        Self::Pattern,
        Self::Samples,
    ];

    /// The name the header starts with.
    pub fn name(self) -> &'static str {
        match self {
            Self::Step => "Step",
            Self::Roll => "Roll",
            Self::Sound => "Sound",
            Self::Fx => "Fx",
            Self::Mix => "Mix",
            Self::Pool => "Pool",
            Self::Settings => "Settings",
            Self::Pattern => "Pattern",
            Self::Samples => "Samples",
        }
    }

    /// The screen whose pages PAGE shows here and whose page the encoders use: SOUND on STEP and
    /// ROLL, which have no pages of their own, and the screen itself elsewhere.
    pub fn paged(self) -> Self {
        match self {
            Self::Step | Self::Roll => Self::Sound,
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

/// The folder and cursor of SAMPLES or of the sample picker. The cursor stays on its row while rows
/// come or go above it (`Control::keep_samples_cursor`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SamplesView {
    /// The folder shown; none at the top level.
    pub folder: Option<FolderId>,
    pub cursor: Cursor,
    /// The row under the cursor; none while the folder has no rows.
    pub on: Option<Row>,
    /// Whether a line is above the rows at every level, as the sample picker's top line is, and
    /// not only inside a folder, as SAMPLES' folder line is.
    pub top_line: bool,
}

impl SamplesView {
    /// The top level with the cursor on its first row, before keeping it there names the row
    /// (`Control::keep_samples_cursor`).
    pub const fn top(top_line: bool) -> Self {
        Self {
            folder: None,
            cursor: Cursor { item: 0, scroll: 0 },
            on: None,
            top_line,
        }
    }

    /// How many rows fit: 15 under the sample picker's top line, and on SAMPLES 15 at the top
    /// level and 14 inside a folder, under its line.
    pub fn fit(&self) -> usize {
        if self.top_line {
            LIST_VISIBLE - 1
        } else {
            SAMPLES_VISIBLE - usize::from(self.folder.is_some())
        }
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

/// POOL's cursor: row 0 is Remove unused, row `n` the pool's sound `n - 1` in number order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PoolView {
    pub cursor: Cursor,
    /// The current track and its selected sound when the cursor last landed (S8).
    pub shows: (u8, Option<SoundNumber>),
}

/// A picker: the sound picker of the selected pad, the Engine picker of the selected sound, the
/// sample picker or the Delete picker of a file of SAMPLES or of a sound of POOL; PATTERN's Length
/// or Signature picker; or FX's Type picker of the slot the Chain page is on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Picker {
    Sound,
    /// Sample, then Synth.
    Engine,
    Sample(Pick),
    Delete(FileId),
    DeleteSound(SoundNumber),
    /// The lengths of `LENGTHS`.
    Length,
    /// 1/4 to 16/4, then 1/8 to 16/8.
    Signature,
    /// Empty, Delay and Reverb.
    Effect,
}

/// What choosing a file in the sample picker does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pick {
    /// Puts a new sample sound of the file on the selected pad (New sample).
    NewSound,
    /// Gives the selected sound the file and keeps its other values (the Sample item).
    Change,
    /// Switches the selected sound to the sample engine with the file (ENGINE).
    Switch,
}

/// A question, which only OK and CANCEL answer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Question {
    /// "Delete clap.wav?"
    DeleteFile(FileId),
    /// "Delete Kick?"
    DeleteSound(SoundNumber),
    /// "Remove 3 unused sounds?"
    RemoveUnused,
    /// "Delete 24 notes?": the `count` notes that `change` no longer fits (S12).
    DeleteNotes { count: u32, change: Change },
}

/// STEP and ROLL's shared cursor, from 0: a bar and a step of it (S5).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StepCursor {
    pub bar: u16,
    /// Sixteenths from the bar's start.
    pub step: u8,
}

/// ROLL's own state: its cursor's pitch, the pitch of the top row it shows and the track and
/// selected sound its row was last put on (S5). Its bar and sixteenth are STEP's (`StepCursor`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RollView {
    pub pitch: u8,
    pub top: u8,
    /// The current track and its selected sound when ROLL last centred its row on them, or last
    /// found none selected; ROLL centres again once they differ.
    pub shows: (u8, Option<SoundNumber>),
}

/// The NOTE panel while it is open over STEP or ROLL (S13): its cursor, 0 (Pitch) to 3
/// (Position), and the cell it opened on, from which Position counts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NotePanel {
    pub item: usize,
    pub from: StepCursor,
}

/// What the screen shows: the screen, the page each screen shows, the cursor of each page, the
/// folder and cursor of SAMPLES and of the sample picker, POOL's cursor, the step cursor, STEP's
/// view, ROLL's, whether it follows the music, FX Chain's slot and a picker, a question or the NOTE
/// panel while one is open. They are kept while the control part lives and are not saved.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct View {
    pub screen: Screen,
    /// The page each screen shows, by screen.
    pages: [usize; SCREENS],
    /// The cursor of each page, by screen and page.
    cursors: [[Cursor; PAGES]; SCREENS],
    pub samples: SamplesView,
    /// The sample picker's folder, kept while it is closed, and its cursor.
    pub sample_picker: SamplesView,
    pub pool: PoolView,
    pub steps: StepCursor,
    pub step_view: StepView,
    pub roll: RollView,
    /// Whether the step buttons and the header show the bar playing while the music plays (S16).
    /// PLAY and SHIFT + PLAY set it, and an arrow on STEP or ROLL that moves the cursor into
    /// another bar clears it.
    pub following: bool,
    /// FX Chain's chosen slot, 0 to 5: the one the cursor last stood on among the tiles, drawn in
    /// the accent, which Type and Move act on and which stays when the track changes (S15).
    pub fx_slot: u8,
    /// The picker while it is open over the main area of `screen`, with its highlight. The sample
    /// picker's highlight is `sample_picker`'s cursor, and this one stays on its first row.
    pub picker: Option<(Picker, Cursor)>,
    /// The question while it is open over the middle of the main area of `screen`.
    pub question: Option<Question>,
    /// The NOTE panel while it is open over the middle of the main area of STEP or ROLL.
    pub note_panel: Option<NotePanel>,
}

impl View {
    /// STEP, where a new project opens, with every screen on its first page, every cursor on the
    /// first item, SAMPLES and the sample picker at the top level, POOL's cursor on Remove unused
    /// for T1 with no sound selected, the step cursor on bar 1, step 1, STEP's view at its first
    /// cell and lane, ROLL's cursor on C4 under its top row G4 with no sound centred on, not
    /// following, FX Chain on slot 1 and no picker, question or NOTE panel open.
    pub const fn new() -> Self {
        Self {
            screen: Screen::Step,
            pages: [0; SCREENS],
            cursors: [[Cursor { item: 0, scroll: 0 }; PAGES]; SCREENS],
            samples: SamplesView::top(false),
            sample_picker: SamplesView::top(true),
            pool: PoolView {
                cursor: Cursor { item: 0, scroll: 0 },
                shows: (0, None),
            },
            steps: StepCursor { bar: 0, step: 0 },
            step_view: StepView {
                first_cell: 0,
                first_lane: 0,
            },
            roll: RollView {
                pitch: 60,
                top: 67,
                shows: (0, None),
            },
            following: false,
            fx_slot: 0,
            picker: None,
            question: None,
            note_panel: None,
        }
    }

    /// The folder and cursor that the arrows, OK and CANCEL move: the sample picker's while it is
    /// open, else SAMPLES'.
    pub fn list(&mut self) -> &mut SamplesView {
        match self.picker {
            Some((Picker::Sample(_), _)) => &mut self.sample_picker,
            _ => &mut self.samples,
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
/// stopping at the ends. Pickers, SAMPLES and POOL move this way.
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
    fn the_menu_tiles_show_step_roll_sound_fx_mix_pool_settings_pattern_and_samples() {
        let tiles = menu_tiles(Screen::Settings);

        assert_eq!(
            tiles[0],
            Tile {
                name: Some("Step"),
                state: TileState::Exists
            }
        );
        assert_eq!(
            tiles[1],
            Tile {
                name: Some("Roll"),
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
        // Step 4 is FX's.
        assert_eq!(
            tiles[3],
            Tile {
                name: Some("Fx"),
                state: TileState::Exists
            }
        );
        assert_eq!(
            tiles[4],
            Tile {
                name: Some("Mix"),
                state: TileState::Exists
            }
        );
        assert_eq!(
            tiles[5],
            Tile {
                name: Some("Pool"),
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
            tiles[8],
            Tile {
                name: Some("Pattern"),
                state: TileState::Exists
            }
        );
        assert_eq!(
            tiles[9],
            Tile {
                name: Some("Samples"),
                state: TileState::Exists
            }
        );
        assert_eq!(tiles.iter().filter(|&&tile| tile == EMPTY).count(), 7);
        assert_eq!(menu_tiles(Screen::Roll)[1].state, TileState::Current);
        assert_eq!(menu_tiles(Screen::Fx)[3].state, TileState::Current);
        assert_eq!(menu_tiles(Screen::Mix)[4].state, TileState::Current);
        assert_eq!(menu_tiles(Screen::Step)[0].state, TileState::Current);
        assert_eq!(menu_tiles(Screen::Pool)[5].state, TileState::Current);
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
