//! POOL: Remove unused, then every sound of the pool in number order (Workflow A).

use super::Control;
use super::view::{Cursor, Screen, moved, scrolled};
use crate::input::Button;
use crate::ui::layout::SAMPLES_VISIBLE;

impl Control {
    /// An arrow, - or + on POOL moves its cursor as in a list (`moved`) by as many rows as fit,
    /// as on SAMPLES' top level (S7). Moving onto a sound selects it with the first pad of the
    /// current track that holds it, or no pad (S9); moving onto Remove unused keeps the selection.
    pub(super) fn move_in_pool(&mut self, button: Button) {
        let cursor = &mut self.view.pool.cursor;
        let item = moved(
            button,
            cursor.item,
            self.project.pool.sounds().len(),
            SAMPLES_VISIBLE,
        );
        // A press at an end moves nothing and keeps the selected pad, which may be another of the
        // sound's pads.
        if item == cursor.item {
            return;
        }
        *cursor = Cursor {
            item,
            scroll: scrolled(item, cursor.scroll, SAMPLES_VISIBLE),
        };
        if item > 0 {
            let sound = self.project.pool.sounds()[item - 1].number;
            self.track_mut().select_sound(sound);
            self.view.pool.shows = (self.project.track, Some(sound));
        }
    }

    /// While POOL shows, puts its cursor on the row of the current track's selected sound, or on
    /// Remove unused while an empty pad is selected, scrolled as far as it must, and records the
    /// selection it shows (S8). Opening POOL, every pad hit that selects a pad and T1 to T4 land
    /// it, also on the sound it shows already, so the cursor and the header agree (answer 1).
    pub(super) fn land_on_selection(&mut self) {
        if self.view.screen != Screen::Pool {
            return;
        }
        let selected = self.track().selected_sound;
        let item = selected.map_or(0, |sound| {
            1 + self
                .project
                .pool
                .sounds()
                .binary_search_by_key(&sound, |in_pool| in_pool.number)
                .expect("a selected sound is in the pool")
        });
        let pool = &mut self.view.pool;
        pool.cursor = Cursor {
            item,
            scroll: scrolled(item, pool.cursor.scroll, SAMPLES_VISIBLE),
        };
        pool.shows = (self.project.track, selected);
    }

    /// While POOL shows, lands its cursor on the selection when the current track or its selected
    /// sound changed since the cursor last landed by anything but a move on POOL (S8).
    pub(super) fn follow_selection(&mut self) {
        if self.view.pool.shows != (self.project.track, self.track().selected_sound) {
            self.land_on_selection();
        }
    }
}
