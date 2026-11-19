//! POOL: Remove unused, then every sound of the pool in number order (Workflow A).

use super::Control;
use super::view::{Cursor, moved, scrolled};
use crate::input::Button;
use crate::ui::layout::SAMPLES_VISIBLE;

impl Control {
    /// An arrow, - or + on POOL moves its cursor as in a list (`moved`) by as many rows as fit,
    /// as on SAMPLES' top level (S7).
    pub(super) fn move_in_pool(&mut self, button: Button) {
        let cursor = &mut self.view.pool.cursor;
        let item = moved(
            button,
            cursor.item,
            self.project.pool.sounds().len(),
            SAMPLES_VISIBLE,
        );
        *cursor = Cursor {
            item,
            scroll: scrolled(item, cursor.scroll, SAMPLES_VISIBLE),
        };
    }
}
