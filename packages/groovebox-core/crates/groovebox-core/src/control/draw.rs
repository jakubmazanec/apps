use super::pages::{ItemDef, ItemKind, Picture};
use super::{Control, Entry};
use crate::input::Button;
use crate::label::Label;
use crate::palette::{ACCENT, BACKGROUND, DIM, FAINT, TEXT};
use crate::param::{self, BP, CUTOFF, Curve, HP, LP_12, LP_24, MODE, ParamId, RESONANCE};
use crate::project::pool::{Engine, SoundNumber};
use crate::project::track::PadMode;
use crate::screen::{Canvas, HEIGHT, WIDTH};
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::item::{Bar, ItemView, draw_cursor, draw_item};
use crate::ui::layout::{
    ITEM_HEIGHT, ITEM_PITCH, LIST_VISIBLE, PAGE_FIRST, PAGE_VISIBLE, PAGE_WIDTH, PAGE_X, PICTURE,
    rect,
};
use crate::ui::list::{Row, draw_rows};
use crate::ui::plot::draw_line;
use crate::ui::tiles::{PadTile, draw_pad_tiles, draw_tiles};
use core::fmt::Write;

/// Where a curve or a shape runs: from the picture area's first column across `SPAN` more columns,
/// and from `TOP_ROW` across `ROWS` more rows, 1 pixel inside the area at the top and the bottom.
const SPAN: i32 = PICTURE.2 - 1;
const TOP_ROW: i32 = PICTURE.1 + 1;
const BOTTOM_ROW: i32 = PICTURE.1 + PICTURE.3 - 2;
const ROWS: i32 = BOTTOM_ROW - TOP_ROW;

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
    ///
    /// The text under the cursor, the current tile's name and the selected pad's name scroll when
    /// they do not fit, as far as the samples since the cursor landed say; the strip never scrolls.
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

        let elapsed = self.now - self.landed;
        let mut values = [Label::new(); 4];
        let mut cells = [None; 4];
        let mut scrolls = false;
        if let Some(tiles) = self.tiles() {
            scrolls = draw_tiles(canvas, &tiles, elapsed);
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
            scrolls = draw_rows(
                canvas,
                &rows[..shown.len()],
                0,
                Some(picker.item - picker.scroll),
                elapsed,
            );
        } else {
            let cursor = self.cursor(screen);
            for (row, (index, item)) in (0..).zip(
                self.items(screen)
                    .iter()
                    .enumerate()
                    .skip(cursor.scroll)
                    .take(PAGE_VISIBLE),
            ) {
                let y = PAGE_FIRST + ITEM_PITCH * row;
                let mut value = Label::new();
                scrolls |= draw_item(
                    canvas,
                    PAGE_X,
                    y,
                    PAGE_WIDTH,
                    &self.item_view(item, &mut value),
                    true,
                    (index == cursor.item).then_some(elapsed),
                );
                if index == cursor.item {
                    draw_cursor(canvas, PAGE_X, y, PAGE_WIDTH, ITEM_HEIGHT);
                }
            }
            match self.page(screen).and_then(|page| page.picture) {
                Some(Picture::Pads) => {
                    scrolls |= draw_pad_tiles(
                        canvas,
                        &core::array::from_fn(|pad| PadTile {
                            name: track.pads[pad].map(|sound| self.name(sound)),
                            selected: track.selected_pad.map(usize::from) == Some(pad),
                        }),
                        elapsed,
                    );
                }
                Some(Picture::FilterCurve) => {
                    let mode = self.value(MODE.id);
                    let cutoff = param::real(&CUTOFF, self.value(CUTOFF.id));
                    // The filter damps by 2 without resonance and by 0.02 at full resonance.
                    let q = 1.0 / (2.0 - 1.98 * param::real(&RESONANCE, self.value(RESONANCE.id)));
                    canvas.vline(
                        PICTURE.0
                            + libm::roundf(libm::log10f(cutoff / 20.0) / 3.0 * SPAN as f32) as i32,
                        TOP_ROW,
                        ROWS as u32 + 1,
                        FAINT,
                    );
                    let curve: [_; PICTURE.2 as usize] = core::array::from_fn(|column| {
                        let r = 20.0 * libm::powf(1_000.0, column as f32 / SPAN as f32) / cutoff;
                        let low_pass =
                            1.0 / libm::sqrtf((1.0 - r * r) * (1.0 - r * r) + r * r / (q * q));
                        let gain = match mode {
                            LP_12 => low_pass,
                            LP_24 => low_pass * low_pass,
                            HP => r * r * low_pass,
                            BP => r / q * low_pass,
                            _ => unreachable!("a filter mode is one of the four"),
                        };
                        // +12 dB lies on the top row and -48 dB on the bottom row.
                        let row = TOP_ROW as f32
                            + (12.0 - 20.0 * libm::log10f(gain)) / 60.0 * ROWS as f32;
                        (
                            PICTURE.0 + column as i32,
                            (libm::roundf(row) as i32).clamp(TOP_ROW, BOTTOM_ROW),
                        )
                    });
                    draw_line(canvas, &curve, TEXT);
                }
                Some(Picture::Envelope {
                    attack,
                    decay,
                    sustain,
                    release,
                }) => {
                    let share = |id: ParamId| self.value(id) as f32 / 65_535.0;
                    // The attack, the decay and the release each take up to a quarter of the width,
                    // and the hold takes a quarter.
                    let column = |quarters: f32| {
                        PICTURE.0 + libm::roundf(quarters * SPAN as f32 / 4.0) as i32
                    };
                    let peak = share(attack);
                    let hold = peak + share(decay);
                    let release_start = hold + 1.0;
                    let level = BOTTOM_ROW
                        - libm::roundf(
                            param::real(param::entry(sustain), self.value(sustain)) * ROWS as f32,
                        ) as i32;
                    canvas.hline(PICTURE.0, BOTTOM_ROW, PICTURE.2 as u32, FAINT);
                    canvas.vline(column(release_start), TOP_ROW, ROWS as u32 + 1, FAINT);
                    draw_line(
                        canvas,
                        &[
                            (PICTURE.0, BOTTOM_ROW),
                            (column(peak), TOP_ROW),
                            (column(hold), level),
                            (column(release_start), level),
                            (column(release_start + share(release)), BOTTOM_ROW),
                        ],
                        TEXT,
                    );
                }
                None => {}
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
        self.scrolling.set(scrolls);
    }

    /// What `item` shows, with its value written into `value` where it is not a name.
    fn item_view<'a>(&'a self, item: &ItemDef, value: &'a mut Label<16>) -> ItemView<'a> {
        let (name, value, bar) = match item.kind {
            ItemKind::Param(id) => {
                let entry = param::entry(id);
                let current = self.value(id);
                param::format(entry, current, value);
                (entry.name, value.as_str(), bar(entry, current))
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

/// The bar under `entry`'s item at `value`. A switch or a list shows the track only; every other
/// value fills the bar by its place in its range.
fn bar(entry: &param::Entry, value: i32) -> Bar {
    match entry.curve {
        Curve::Switch | Curve::List => Bar::Track,
        _ => Bar::Fill(
            (i64::from(value - entry.low) * i64::from(u16::MAX) / i64::from(entry.high - entry.low))
                as u16,
        ),
    }
}
