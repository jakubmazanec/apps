//! ROLL's rows and columns: one row for each pitch, and STEP's cursor and first cell (Workflow B).

use super::Control;
use super::step_view::{CELL, LANES_SHOWN, kept};
use super::view::Screen;
use crate::screen::WIDTH;
use crate::store::Store;
use crate::store::note::Key;

/// The width of ROLL's names column: 3 px, the widest name ("C#−1") and 3 px (S3).
pub const ROLL_NAMES: i32 = 29;
/// The cells ROLL's grid shows: the whole cells between its names column and the screen's right
/// edge, with a pixel on each side (S3).
pub const ROLL_COLUMNS: u32 = ((WIDTH as i32 - 2 - ROLL_NAMES - 2) / CELL) as u32;
/// The pixels of a row of ROLL's grid, from the grid's left line to its closing line (S9).
pub const ROLL_PIXELS: usize = 441;
/// The highest pitch, G9, ROLL's top row at the most.
pub(super) const HIGHEST: u8 = 127;
/// The rows above the cursor's when ROLL centres: the cursor lies on the 8th of the 16 rows (S5).
const ROWS_ABOVE: u8 = 7;

impl Control {
    /// The columns of the grid the shown screen has: ROLL's are fixed, and STEP's follow its names
    /// column (`step_columns`).
    pub(super) fn columns(&self) -> u32 {
        if self.view.screen == Screen::Roll {
            ROLL_COLUMNS
        } else {
            self.step_columns().1
        }
    }

    /// While ROLL shows, puts its row in the middle of the selected sound's notes on the current
    /// track of the current pattern, halfway between the lowest and the highest pitch rounded
    /// down, or at the sound's unchanged pitch while it has none, when the track or the selected
    /// sound differs from what the row was last put on; with no sound selected the row stays and
    /// the next sound selected centres it (S5, S6). Then keeps the cursor's row on the screen: the
    /// top row moves one row at a time, a jump in one go (S4).
    pub(super) fn keep_roll_view(&mut self, store: &Store<'_>) {
        if self.view.screen != Screen::Roll {
            return;
        }
        let on = (self.project.track, self.track().selected_sound);
        if self.view.roll.shows != on {
            self.view.roll.shows = on;
            if let Some(sound) = self.selected() {
                let pitch = store
                    .reader()
                    .notes(
                        self.project.patterns[usize::from(self.project.pattern)].tracks
                            [usize::from(self.project.track)],
                        Key::at(0, 0),
                    )
                    .filter(|note| note.sound == sound.number)
                    .fold(None, |range, note| match range {
                        None => Some((note.pitch, note.pitch)),
                        Some((lowest, highest)) => {
                            Some((note.pitch.min(lowest), note.pitch.max(highest)))
                        }
                    })
                    .map_or(sound.unchanged_pitch(), |(lowest, highest)| {
                        (lowest + highest) / 2
                    });
                self.view.roll.pitch = pitch;
                self.view.roll.top = (pitch + ROWS_ABOVE).clamp(LANES_SHOWN as u8 - 1, HIGHEST);
            }
        }
        let roll = &mut self.view.roll;
        roll.top = HIGHEST
            - kept(
                u32::from(HIGHEST - roll.pitch),
                u32::from(HIGHEST - roll.top),
                LANES_SHOWN as u32,
                1,
                u32::from(HIGHEST) + 1,
            ) as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::step_view::{GRID_END, grid_left};
    use crate::ui::text;

    #[test]
    fn the_names_column_the_columns_and_the_pixels_follow_from_the_widest_name() {
        assert_eq!(ROLL_NAMES, 3 + text::width("C#\u{2212}1") + 3);
        assert_eq!(ROLL_COLUMNS, 55);
        assert_eq!(grid_left(ROLL_COLUMNS), 38);
        assert_eq!(
            ROLL_PIXELS,
            (GRID_END - grid_left(ROLL_COLUMNS) + 1) as usize
        );
    }
}
