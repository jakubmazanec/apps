use super::Control;
use super::pages::{ItemDef, ItemKind};
use crate::input::Button;
use crate::label::Label;
use crate::palette::{ACCENT, BACKGROUND, DIM, TEXT};
use crate::param::{self, Curve};
use crate::project::track::PadMode;
use crate::screen::{Canvas, HEIGHT, WIDTH};
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::item::{Bar, ItemView, draw_cursor, draw_item};
use crate::ui::layout::{
    ITEM_HEIGHT, ITEM_PITCH, PAGE_FIRST, PAGE_VISIBLE, PAGE_WIDTH, PAGE_X, rect,
};
use crate::ui::tiles::draw_tiles;
use core::fmt::Write;

impl Control {
    /// Draws the whole picture from the state of the control part alone, whatever the canvas held
    /// before.
    ///
    /// The header names the screen and, on a screen with pages, its page; then the track, the
    /// selected sound and the pad mode with the octave in KEYS mode. While an empty pad is selected
    /// there is no sound to name, and the pad's dim number stands in its place. While MENU is held
    /// the header names MENU in place of the screen and its page. The message is on the right.
    ///
    /// The main area shows the page's items with the cursor, or the tiles while MENU or PAGE is
    /// held. On STEP it stays empty, as its grid comes with the sequencer. The strip shows the items
    /// that the encoders hold on the page they use, and nothing while MENU or PAGE is held.
    pub fn draw(&self, canvas: &mut impl Canvas) {
        canvas.fill_rect(rect(0, 0, WIDTH as i32, HEIGHT as i32), BACKGROUND);
        let track = self.track();
        let mut track_name = Label::<2>::new();
        write!(track_name, "T{}", self.project.track + 1).expect("writing to a label never fails");
        let mut pad_number = Label::<2>::new();
        let sound = match track.selected_sound {
            Some(sound) => Piece {
                text: self
                    .project
                    .pool
                    .get(sound)
                    .expect("a selected sound is in the pool")
                    .name
                    .as_str(),
                color: TEXT,
            },
            None => {
                write!(
                    pad_number,
                    "{}",
                    track
                        .selected_pad
                        .expect("a track without a selected sound has a selected pad")
                        + 1
                )
                .expect("writing to a label never fails");
                Piece {
                    text: pad_number.as_str(),
                    color: DIM,
                }
            }
        };
        let mut mode = Label::<8>::new();
        match track.mode {
            PadMode::Pads => mode.push_str("Pads"),
            PadMode::Keys => {
                write!(mode, "Keys C{}", track.octave).expect("writing to a label never fails");
            }
        }
        let screen = self.view.screen;
        let (name, page) = if self.overlay() == Some(Button::Menu) {
            ("Menu", None)
        } else {
            (screen.name(), self.page(screen).map(|page| page.name))
        };
        let header = [
            Piece {
                text: name,
                color: ACCENT,
            },
            Piece {
                text: page.unwrap_or_default(),
                color: TEXT,
            },
            Piece {
                text: track_name.as_str(),
                color: TEXT,
            },
            sound,
            Piece {
                text: mode.as_str(),
                color: DIM,
            },
        ];
        let left: &[Piece] = if page.is_some() {
            &header
        } else {
            &[header[0], header[2], header[3], header[4]]
        };
        draw_header(
            canvas,
            left,
            self.message.as_ref().map(|(text, color, _)| Piece {
                text: text.as_str(),
                color: *color,
            }),
        );

        let mut values = [Label::new(); 4];
        let mut cells = [None; 4];
        if let Some(tiles) = self.tiles() {
            draw_tiles(canvas, &tiles);
        } else {
            let cursor = self.view.cursor(screen);
            for (row, (index, item)) in (0..).zip(
                self.items(screen)
                    .iter()
                    .enumerate()
                    .skip(cursor.scroll)
                    .take(PAGE_VISIBLE),
            ) {
                let y = PAGE_FIRST + ITEM_PITCH * row;
                let mut value = Label::new();
                draw_item(
                    canvas,
                    PAGE_X,
                    y,
                    PAGE_WIDTH,
                    &self.item_view(item, &mut value),
                    true,
                );
                if index == cursor.item {
                    draw_cursor(canvas, PAGE_X, y, PAGE_WIDTH, ITEM_HEIGHT);
                }
            }
            for ((encoder, cell), value) in (0..).zip(&mut cells).zip(&mut values) {
                *cell = self
                    .items(screen.paged())
                    .iter()
                    .find(|item| item.encoder == Some(encoder))
                    .map(|item| self.item_view(item, value));
            }
        }
        draw_strip(canvas, &cells);
    }

    /// What `item` shows, with its value written into `value`.
    fn item_view<'a>(&self, item: &ItemDef, value: &'a mut Label<16>) -> ItemView<'a> {
        match item.kind {
            ItemKind::Param(id) => {
                let entry = param::entry(id);
                param::format(entry, self.settings.get(id), value);
                ItemView {
                    encoder: item.encoder.map(|encoder| encoder + 1),
                    name: entry.name,
                    value: value.as_str(),
                    bar: match entry.curve {
                        Curve::Switch => Bar::Track,
                    },
                }
            }
        }
    }
}
