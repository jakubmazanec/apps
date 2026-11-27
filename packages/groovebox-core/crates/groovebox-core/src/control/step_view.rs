//! STEP's view in cells: where a place lies in the grid, which cells and lanes show and how the
//! view follows the cursor (Workflow B).

use super::Control;
use super::lanes::Lane;
use super::view::{Screen, StepCursor};
use crate::label::Label;
use crate::palette::{DIM, RECORD, TEXT};
use crate::project::Signature;
use crate::project::pool::NAME_BYTES;
use crate::screen::{Color, WIDTH};
use crate::store::note::Note;
use crate::ui::text;
use core::fmt::Write;

/// How many lanes fit (S4).
pub const LANES_SHOWN: usize = 16;
/// The most cells the grid has (S4).
pub const GRID_CELLS: usize = 58;
/// A cell's width in pixels.
pub const CELL: i32 = 8;
/// Cells in a page: the sixteenths the step buttons show.
pub const PAGE: u32 = 16;
/// The pixel the grid ends on, where its last line stands (S4).
pub const GRID_END: i32 = WIDTH as i32 - 2;
/// The space on each side of the names column's labels.
const NAMES_INSET: i32 = 3;
/// The width in pixels that a label of 12 characters takes, the most one may (S3).
const LABEL_WIDTH: i32 = 71;

/// STEP's view (S8): the first column and the first lane it shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StepView {
    pub first_cell: u32,
    pub first_lane: usize,
}

/// A bar's pages: as many of 16 cells as its sixteenths need (S5).
fn pages(signature: Signature) -> u32 {
    signature.sixteenths().div_ceil(PAGE)
}

/// The cell of `place`: its bar's pages come before it and its sixteenth counts from the first
/// page's start.
pub fn cell_of(place: StepCursor, signature: Signature) -> u32 {
    u32::from(place.bar) * pages(signature) * PAGE + u32::from(place.step)
}

/// The place of a cell, none for a dark one: a cell past its bar's last sixteenth.
pub fn place_of(cell: u32, signature: Signature) -> Option<StepCursor> {
    let bar_cells = pages(signature) * PAGE;
    let step = cell % bar_cells;
    (step < signature.sixteenths()).then(|| StepCursor {
        bar: (cell / bar_cells) as u16,
        step: step as u8,
    })
}

/// Where `note` ends on the grid, in ticks counted 480 to a cell from the pattern's first, dark
/// cells too. No note ends past the end of the pattern's `bars`. A note ends in the bar and
/// sixteenth of its last tick, a note of no ticks in those of its first.
pub fn note_end(note: Note, bars: u16, signature: Signature) -> u32 {
    let bar_ticks = signature.bar_ticks();
    let start = u32::from(note.bar) * bar_ticks + u32::from(note.place);
    let last = (start + note.length)
        .min(u32::from(bars) * bar_ticks)
        .max(start + 1)
        - 1;
    let cell = cell_of(
        StepCursor {
            bar: (last / bar_ticks) as u16,
            step: (last % bar_ticks / 480) as u8,
        },
        signature,
    );
    cell * 480 + last % 480 + 1
}

/// A pattern's cells: every bar takes its pages.
pub fn cells(bars: u16, signature: Signature) -> u32 {
    u32::from(bars) * pages(signature) * PAGE
}

/// Where the grid's left line stands for `columns` cells: the grid ends at `GRID_END` (S4).
pub fn grid_left(columns: u32) -> i32 {
    GRID_END - CELL * columns as i32
}

/// The first shown index once `cursor` must show, `visible` showing from `first`, moving `by` at a
/// time within `total` (S8): the view moves when the cursor is on its last index and more follow,
/// or on its first and more precede, as far as the cursor needs, and never starts where it would
/// end past `total`.
pub fn kept(cursor: u32, first: u32, visible: u32, by: u32, total: u32) -> u32 {
    let moved = if cursor + 1 >= first + visible && first + visible < total {
        first + (cursor + 2 - first - visible).div_ceil(by) * by
    } else if cursor <= first {
        first.saturating_sub((first + 1 - cursor).div_ceil(by) * by)
    } else {
        first
    };
    moved.min(total.saturating_sub(visible))
}

impl Control {
    /// A lane's label and its colour (S3): a sound's name, red while its sample is missing and
    /// shortened with "…" when it is longer than 12 characters; "= pad 1" dim on a copy lane of the
    /// earlier pad 1; an empty pad's number dim.
    pub(super) fn lane_label(&self, lane: Lane) -> (Label<NAME_BYTES>, Color) {
        let mut label = Label::new();
        let sound = match lane {
            Lane::Pad(pad) => match (self.copy_of(pad), self.lane_sound(lane)) {
                (Some(first), _) => {
                    write!(label, "= pad {}", first + 1).expect("writing to a label never fails");
                    return (label, DIM);
                }
                (None, None) => {
                    write!(label, "{}", pad + 1).expect("writing to a label never fails");
                    return (label, DIM);
                }
                (None, Some(sound)) => sound,
            },
            Lane::Extra(sound) => sound,
        };
        let sound = self
            .project
            .pool
            .get(sound)
            .expect("a lane's sound is in the pool");
        write!(label, "{}", text::fit(sound.name.as_str(), LABEL_WIDTH))
            .expect("writing to a label never fails");
        let color = if self.missing_file(sound).is_some() {
            RECORD
        } else {
            TEXT
        };
        (label, color)
    }

    /// The names column's width and the grid's columns (S4): the widest label of all the track's
    /// lanes, those scrolled away too, between two insets, and the whole cells that fit between it
    /// and the screen's right edge, with a pixel on each side.
    pub(super) fn step_columns(&self) -> (i32, u32) {
        let widest = self
            .lanes()
            .map(|lane| text::width(self.lane_label(lane).0.as_str()))
            .fold(0, i32::max);
        let names = NAMES_INSET + widest + NAMES_INSET;
        (names, ((WIDTH as i32 - 2 - names - 2) / CELL) as u32)
    }

    /// Moves STEP's view so the cursor's cell at `sample` and its lane show (S8): cells by a beat
    /// and lanes by one. ROLL shares the first cell and keeps it with its own columns (`columns`).
    pub(super) fn keep_step_view(&mut self, sample: u64) {
        let signature = self.project.signature;
        let view = self.view.step_view;
        self.view.step_view = StepView {
            first_cell: kept(
                cell_of(self.cursor_at(sample), signature),
                view.first_cell,
                self.columns(),
                PAGE / u32::from(signature.unit),
                cells(
                    self.project.patterns[usize::from(self.project.pattern)].bars,
                    signature,
                ),
            ),
            first_lane: kept(
                self.cursor_lane() as u32,
                view.first_lane as u32,
                LANES_SHOWN as u32,
                1,
                self.lanes().count() as u32,
            ) as usize,
        };
    }

    /// The x of the music's line while STEP or ROLL shows it (S7): the left line of the music's
    /// cell and its ticks into the sixteenth at 8 px to 480 ticks, rounded down, where that cell
    /// shows among the shown screen's columns (`columns`).
    pub(super) fn music_x(&self, sample: u64) -> Option<i32> {
        let (bar, place) = self
            .player
            .at(sample)
            .filter(|_| matches!(self.view.screen, Screen::Step | Screen::Roll))?;
        let signature = self.project.signature;
        let cell = cell_of(
            StepCursor {
                bar,
                step: (place / 480) as u8,
            },
            signature,
        );
        let columns = self.columns();
        let column = cell
            .checked_sub(self.view.step_view.first_cell)
            .filter(|&column| {
                column < columns
                    && cell
                        < cells(
                            self.project.patterns[usize::from(self.project.pattern)].bars,
                            signature,
                        )
            })?;
        Some(grid_left(columns) + CELL * column as i32 + (place % 480 * CELL as u32 / 480) as i32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cells_count_pages_of_16_and_dark_cells() {
        let five_four = Signature { beats: 5, unit: 4 };
        assert_eq!(cell_of(StepCursor { bar: 1, step: 3 }, five_four), 35);
        assert_eq!(cell_of(StepCursor { bar: 0, step: 19 }, five_four), 19);
        // The short page's dark cells.
        assert_eq!(place_of(20, five_four), None);
        assert_eq!(
            place_of(32, five_four),
            Some(StepCursor { bar: 1, step: 0 })
        );
        assert_eq!(cells(4, five_four), 128);
        assert_eq!(cells(2, Signature { beats: 16, unit: 4 }), 128);
        assert_eq!(place_of(12, Signature { beats: 3, unit: 4 }), None);
    }

    #[test]
    fn the_view_moves_a_beat_when_the_cursor_reaches_an_edge() {
        assert_eq!(kept(47, 0, 49, 4, 64), 0);
        // On the last column: one beat.
        assert_eq!(kept(48, 0, 49, 4, 64), 4);
        // On the first, cells before: one beat back.
        assert_eq!(kept(4, 4, 49, 4, 64), 0);
        // A jump, held at the end.
        assert_eq!(kept(60, 0, 49, 4, 64), 15);
        // The last cell may sit on the last column.
        assert_eq!(kept(63, 15, 49, 4, 64), 15);
        // A pattern narrower than the grid.
        assert_eq!(kept(10, 0, 57, 4, 16), 0);
        // Lanes, one at a time.
        assert_eq!(kept(15, 0, 16, 1, 20), 1);
    }
}
