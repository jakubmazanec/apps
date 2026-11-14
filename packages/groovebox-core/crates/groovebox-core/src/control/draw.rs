use super::pages::{ItemDef, ItemKind, Picture};
use super::{Control, Entry};
use crate::input::Button;
use crate::label::Label;
use crate::palette::{ACCENT, BACKGROUND, DIM, TEXT};
use crate::param::{self, Curve};
use crate::project::pool::{Engine, SoundNumber};
use crate::project::track::PadMode;
use crate::screen::{Canvas, HEIGHT, WIDTH};
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::item::{Bar, ItemView, draw_cursor, draw_item};
use crate::ui::layout::{
    ITEM_HEIGHT, ITEM_PITCH, LIST_VISIBLE, PAGE_FIRST, PAGE_VISIBLE, PAGE_WIDTH, PAGE_X, rect,
};
use crate::ui::list::{Row, draw_rows};
use crate::ui::tiles::{PadTile, draw_pad_tiles, draw_tiles};
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
    /// The main area shows the page's items with the cursor and the page's picture, the tiles while
    /// MENU or PAGE is held, or the sound picker while it is open. On STEP it stays empty, as its
    /// grid comes with the sequencer. The strip shows the items that the encoders hold on the page
    /// they use, and nothing while MENU or PAGE is held or the picker is open.
    pub fn draw(&self, canvas: &mut impl Canvas) {
        canvas.fill_rect(rect(0, 0, WIDTH as i32, HEIGHT as i32), BACKGROUND);
        let track = self.track();
        let mut track_name = Label::<2>::new();
        write!(track_name, "T{}", self.project.track + 1).expect("writing to a label never fails");
        let mut pad_number = Label::<2>::new();
        let sound = match track.selected_sound {
            Some(sound) => Piece {
                text: self.name(sound),
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
            self.message.as_ref().map(|(text, color)| Piece {
                text: text.as_str(),
                color: *color,
            }),
        );

        let mut values = [Label::new(); 4];
        let mut cells = [None; 4];
        if let Some(tiles) = self.tiles() {
            draw_tiles(canvas, &tiles);
        } else if let Some(picker) = self.view.picker {
            let shown = picker.scroll..self.picker_rows().min(picker.scroll + LIST_VISIBLE);
            let mut rows = [Row {
                left: "",
                right: None,
            }; LIST_VISIBLE];
            for (slot, row) in rows.iter_mut().zip(shown.clone()) {
                *slot = match self.entry(row) {
                    Entry::Empty => Row {
                        left: "Empty",
                        right: None,
                    },
                    Entry::NewSynth => Row {
                        left: "New synth",
                        right: None,
                    },
                    Entry::Sound(sound) => Row {
                        left: sound.name.as_str(),
                        right: Some(match sound.engine {
                            Engine::Synth => "synth",
                        }),
                    },
                };
            }
            draw_rows(
                canvas,
                &rows[..shown.len()],
                0,
                Some(picker.item - picker.scroll),
            );
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
            if self.page(screen).and_then(|page| page.picture) == Some(Picture::Pads) {
                draw_pad_tiles(
                    canvas,
                    &core::array::from_fn(|pad| PadTile {
                        name: track.pads[pad].map(|sound| self.name(sound)),
                        selected: track.selected_pad.map(usize::from) == Some(pad),
                    }),
                );
            }
            for ((encoder, cell), value) in (0..).zip(&mut cells).zip(&mut values) {
                *cell = self
                    .encoder_items()
                    .iter()
                    .find(|item| item.encoder == Some(encoder))
                    .map(|item| self.item_view(item, value));
            }
        }
        draw_strip(canvas, &cells);
    }

    /// What `item` shows, with its value written into `value` where it is not a name.
    fn item_view<'a>(&'a self, item: &ItemDef, value: &'a mut Label<16>) -> ItemView<'a> {
        let (name, value, bar) = match item.kind {
            ItemKind::Param(id) => {
                let entry = param::entry(id);
                param::format(entry, self.settings.get(id), value);
                (
                    entry.name,
                    value.as_str(),
                    match entry.curve {
                        Curve::Switch => Bar::Track,
                    },
                )
            }
            ItemKind::PadSound => (
                "Sound",
                self.track()
                    .selected_sound
                    .map_or("Empty", |sound| self.name(sound)),
                Bar::Track,
            ),
            ItemKind::PadCopy => {
                let pads = self.project.pads_using(
                    self.track()
                        .selected_sound
                        .expect("Copy is on the Pad page only while the pad has a sound"),
                );
                write!(value, "on {pads} pad{}", if pads == 1 { "" } else { "s" })
                    .expect("writing to a label never fails");
                ("Copy", value.as_str(), Bar::Track)
            }
        };
        ItemView {
            encoder: item.encoder.map(|encoder| encoder + 1),
            name,
            value,
            bar,
        }
    }

    /// The name of `sound`, which is in the pool.
    fn name(&self, sound: SoundNumber) -> &str {
        self.project
            .pool
            .get(sound)
            .expect("a sound on a pad is in the pool")
            .name
            .as_str()
    }
}
