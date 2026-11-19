use super::pages::{ItemDef, ItemKind, LIBRARY_METER, Picture};
use super::samples::{self, rows};
use super::view::{Picker, Question, Screen};
use super::{Control, Entry, HeaderMessage};
use crate::budget;
use crate::font::ADVANCE;
use crate::input::Button;
use crate::label::Label;
use crate::library::{self, name};
use crate::palette::{ACCENT, BACKGROUND, DIM, FAINT, NOTE_MID, RECORD, TEXT};
use crate::param::{
    self, BP, CUTOFF, Curve, END, HP, LP_12, LP_24, MODE, ParamId, RESONANCE, START,
};
use crate::project::pool::{Engine, Sample, Sound, SoundNumber};
use crate::project::track::PadMode;
use crate::screen::{Canvas, HEIGHT, WIDTH};
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::item::{Bar, ItemView, draw_cursor, draw_item};
use crate::ui::layout::{
    HEADER_RIGHT, ITEM_HEIGHT, ITEM_PITCH, LIST_VISIBLE, METER_Y, PAGE_FIRST, PAGE_VISIBLE,
    PAGE_WIDTH, PAGE_X, PICTURE, PIECE_GAP, ROW_FIRST, ROW_PITCH, ROW_WIDTH, ROW_X,
    SAMPLES_VISIBLE, TEXT_INSET, TEXT_X, rect,
};
use crate::ui::list::{Row, draw_rows};
use crate::ui::plot::draw_line;
use crate::ui::question::draw_question;
use crate::ui::text;
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
    /// selected sound, in red while it is MISSING (`missing_file`), and the pad mode with the
    /// octave in KEYS mode. While an empty pad is selected there is no sound to name, and the pad's
    /// dim number stands in its place. While MENU is held the header names MENU in place of the
    /// screen and its page. The message is on the right, or while there is none the import's
    /// progress, in the room right of the pieces; a file's name in it is shortened with "…" so that
    /// the rest of the text fits there, and a message still too wide for it loses its end to a "…".
    ///
    /// The main area shows the page's items with the cursor and the page's picture, the tiles while
    /// MENU or PAGE is held, or the picker while one is open. On STEP it stays empty, as its grid
    /// comes with the sequencer. SAMPLES shows its rows (`samples_row`) with the cursor, inside a
    /// folder under a dim line with the folder's path, which loses its start to a "…" when too wide
    /// for the row, and the library meter above the strip. The sample picker shows the same rows
    /// under a dim top line at every level: the folder's path and two spaces inside a folder, then
    /// "Library" and the meter's value, the line losing its start to a "…" when too wide for the
    /// row. POOL shows Remove unused, then a row of each sound of the pool (`pool_row`), with the
    /// cursor and the library meter above the strip. The sound picker shows a MISSING sound's row
    /// in red. A question shows in a box in the middle of the main area, over what the main area
    /// shows: DELETE's names the file, then counts the sounds that use it, if any, as "2 sounds use
    /// it" (S17). The strip shows the items that the encoders hold on the page they use, and
    /// nothing while MENU or PAGE is held, the picker is open or SAMPLES or POOL shows.
    ///
    /// The text under the cursor, the current tile's name and the selected pad's name scroll when
    /// they do not fit, as far as the samples since the cursor landed say; the strip never scrolls.
    ///
    /// Until the project opens the header holds only the message "Loading library" in the accent,
    /// and the main area and the strip are empty.
    pub fn draw(&self, canvas: &mut impl Canvas) {
        canvas.fill_rect(rect(0, 0, WIDTH as i32, HEIGHT as i32), BACKGROUND);
        if self.startup.is_some() {
            draw_header(
                canvas,
                &[],
                Some(Piece {
                    text: "Loading library",
                    color: ACCENT,
                }),
            );
            draw_strip(canvas, &[None; 4]);
            return;
        }
        let track = self.track();
        let mut track_name = Label::<2>::new();
        write!(track_name, "T{}", self.project.track + 1).expect("writing to a label never fails");
        let mut pad_number = Label::<2>::new();
        let sound = match self.selected() {
            Some(sound) => Piece {
                text: sound.name.as_str(),
                color: if self.missing_file(sound).is_some() {
                    RECORD
                } else {
                    TEXT
                },
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
        let room = HEADER_RIGHT + 1
            - TEXT_X
            - left
                .iter()
                .map(|piece| text::width(piece.text) + PIECE_GAP)
                .sum::<i32>();
        let message = self.message.or_else(|| self.import.progress()).map(
            |HeaderMessage {
                 text,
                 color,
                 name: (from, to),
             }| {
                let text = text.as_str();
                let (before, after) = (&text[..from], &text[to..]);
                let rest = (before.chars().count() + after.chars().count()) as i32;
                let name = text::fit(&text[from..to], room - ADVANCE * rest);
                // The "…" takes the place of at least one character, so two bytes more at most.
                let mut shown = Label::<{ 128 + 2 }>::new();
                write!(shown, "{before}{name}{after}").expect("writing to a label never fails");
                // A message still too wide loses its end, and the "…" takes the place of two
                // characters at least.
                let mut message = Label::<{ 128 + 2 }>::new();
                write!(message, "{}", text::fit(shown.as_str(), room))
                    .expect("writing to a label never fails");
                (message, color)
            },
        );
        draw_header(
            canvas,
            left,
            message.as_ref().map(|(text, color)| Piece {
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
        } else if let Some((open @ (Picker::Sound | Picker::Engine | Picker::Delete(_)), picker)) =
            self.view.picker
        {
            let shown = picker.scroll..self.picker_rows(open).min(picker.scroll + LIST_VISIBLE);
            let mut rows = [Row {
                left: "",
                right: None,
                alert: false,
            }; LIST_VISIBLE];
            for (slot, row) in rows.iter_mut().zip(shown.clone()) {
                *slot = match self.entry(open, row) {
                    Entry::Empty => Row {
                        left: "Empty",
                        right: None,
                        alert: false,
                    },
                    Entry::NewSample => Row {
                        left: "New sample",
                        right: None,
                        alert: false,
                    },
                    Entry::NewSynth => Row {
                        left: "New synth",
                        right: None,
                        alert: false,
                    },
                    Entry::Sound(sound) => Row {
                        left: sound.name.as_str(),
                        right: Some(engine_word(&sound.engine)),
                        alert: self.missing_file(sound).is_some(),
                    },
                    Entry::SampleEngine => Row {
                        left: "Sample",
                        right: None,
                        alert: false,
                    },
                    Entry::SynthEngine => Row {
                        left: "Synth",
                        right: None,
                        alert: false,
                    },
                    Entry::Delete(_) => Row {
                        left: "Delete",
                        right: None,
                        alert: false,
                    },
                };
            }
            scrolls = draw_rows(
                canvas,
                ROW_FIRST,
                LIST_VISIBLE,
                &rows[..shown.len()],
                0,
                Some(picker.item - picker.scroll),
                elapsed,
            );
        } else if self.view.picker.is_some() || screen == Screen::Samples {
            let samples = if self.view.picker.is_some() {
                self.view.sample_picker
            } else {
                self.view.samples
            };
            let mut line = Label::<{ 255 + 2 + 8 + 24 }>::new();
            if let Some(folder) = samples.folder {
                let path = self.library.storage_path(library::Entry::Folder(folder));
                line.push_str(&path.as_str()["samples/".len()..]);
                if samples.top_line {
                    line.push_str("  ");
                }
            }
            if samples.top_line {
                let meter = name::meter(self.library.used(), budget::SAMPLE_RAM as u64);
                write!(line, "Library {}", meter.as_str()).expect("writing to a label never fails");
            }
            let mut y = ROW_FIRST;
            if !line.as_str().is_empty() {
                text::draw_end(
                    canvas,
                    ROW_X + TEXT_INSET,
                    y,
                    ROW_WIDTH - 2 * TEXT_INSET,
                    line.as_str(),
                    DIM,
                );
                y += ROW_PITCH;
            }
            let mut lefts = [Label::new(); SAMPLES_VISIBLE];
            let mut rights = [Label::new(); SAMPLES_VISIBLE];
            let mut shown = [Row {
                left: "",
                right: None,
                alert: false,
            }; SAMPLES_VISIBLE];
            let mut count = 0;
            for ((slot, row), (left, right)) in shown
                .iter_mut()
                .zip(rows(&self.library, samples.folder).skip(samples.cursor.scroll))
                .zip(lefts.iter_mut().zip(&mut rights))
            {
                *slot = self.samples_row(row, left, right);
                count += 1;
            }
            scrolls = draw_rows(
                canvas,
                y,
                samples.fit(),
                &shown[..count],
                0,
                Some(samples.cursor.item - samples.cursor.scroll),
                elapsed,
            );
            if !samples.top_line {
                self.draw_library_meter(canvas);
            }
        } else if screen == Screen::Pool {
            let cursor = self.view.pool.cursor;
            let mut labels = [Label::new(); SAMPLES_VISIBLE];
            let mut shown = [Row {
                left: "",
                right: None,
                alert: false,
            }; SAMPLES_VISIBLE];
            let mut count = 0;
            for ((slot, label), sound) in shown.iter_mut().zip(&mut labels).zip(
                core::iter::once(None)
                    .chain(self.project.pool.sounds().iter().map(Some))
                    .skip(cursor.scroll),
            ) {
                *slot = match sound {
                    None => Row {
                        left: "Remove unused",
                        right: None,
                        alert: false,
                    },
                    Some(sound) => self.pool_row(sound, label),
                };
                count += 1;
            }
            scrolls = draw_rows(
                canvas,
                ROW_FIRST,
                SAMPLES_VISIBLE,
                &shown[..count],
                0,
                Some(cursor.item - cursor.scroll),
                elapsed,
            );
            self.draw_library_meter(canvas);
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
                Some(Picture::Waveform) => {
                    let middle = PICTURE.1 + PICTURE.3 / 2;
                    canvas.hline(PICTURE.0, middle, PICTURE.2 as u32, FAINT);
                    if self.sample_file().is_some()
                        && let Some((_, peaks)) = &self.waveform
                    {
                        for (x, &peak) in (PICTURE.0..).zip(peaks) {
                            // Full scale reaches 2 pixels less than half the area, rounded half up.
                            let half = (i32::from(peak) * (PICTURE.3 / 2 - 2) + 16_384) / 32_768;
                            if half > 0 {
                                canvas.vline(x, middle - half, 2 * half as u32 + 1, NOTE_MID);
                            }
                        }
                    }
                    let last = i64::from(self.frames().saturating_sub(1));
                    for id in [START.id, END.id] {
                        // The point's share of the last frame, rounded half up; a file of one
                        // frame, or of none, has its marks on the first column.
                        let column = if last > 0 {
                            (2 * i64::from(self.value(id)) * i64::from(SPAN) + last) / (2 * last)
                        } else {
                            0
                        };
                        canvas.vline(
                            PICTURE.0 + column as i32,
                            PICTURE.1,
                            PICTURE.3 as u32,
                            ACCENT,
                        );
                    }
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
        if let Some(Question::DeleteFile(file)) = self.view.question {
            let mut question = Label::<{ 7 + 64 + 1 }>::new();
            write!(
                question,
                "Delete {}?",
                self.library.file(file).name.as_str()
            )
            .expect("writing to a label never fails");
            let sounds = self
                .project
                .pool
                .sounds()
                .iter()
                .filter(|sound| sound.engine == Engine::Sample(Sample::File(file)))
                .count();
            let mut count = Label::<24>::new();
            write!(
                count,
                "{sounds} {}",
                if sounds == 1 {
                    "sound uses it"
                } else {
                    "sounds use it"
                }
            )
            .expect("writing to a label never fails");
            let lines = [
                (question.as_str(), TEXT),
                (count.as_str(), DIM),
                ("OK deletes, Cancel keeps", DIM),
            ];
            let shown: &[_] = if sounds == 0 {
                &[lines[0], lines[2]]
            } else {
                &lines
            };
            draw_question(canvas, shown);
        }
        draw_strip(canvas, &cells);
        self.scrolling.set(scrolls);
    }

    /// Draws the library meter above the strip, as SAMPLES and POOL show it.
    fn draw_library_meter(&self, canvas: &mut impl Canvas) {
        let mut value = Label::new();
        draw_item(
            canvas,
            ROW_X,
            METER_Y,
            ROW_WIDTH,
            &self.item_view(&LIBRARY_METER, &mut value),
            false,
            None,
        );
    }

    /// What `item` shows, with its value written into `value` where it is not a name.
    fn item_view<'a>(&'a self, item: &ItemDef, value: &'a mut Label<16>) -> ItemView<'a> {
        let (name, value, bar) = match item.kind {
            // A point of the sound's file shows its share of the file's last frame.
            ItemKind::Param(id) if param::entry(id).curve == Curve::Frame => {
                let current = self.value(id);
                let frames = self.frames();
                param::format_frame(current, frames, value);
                (
                    param::entry(id).name,
                    value.as_str(),
                    match frames.saturating_sub(1) {
                        0 => Bar::Track,
                        last => Bar::Fill(current as u64, u64::from(last)),
                    },
                )
            }
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
            ItemKind::PadEngine => (
                "Engine",
                self.selected()
                    .expect("Engine is on the Pad page only while the pad has a sound")
                    .engine
                    .page_name(),
                Bar::Track,
            ),
            ItemKind::SampleFile => {
                let sound = self
                    .selected()
                    .expect("the Sample page belongs to the selected sound");
                (
                    "Sample",
                    match sound.engine {
                        Engine::Sample(Sample::File(file)) => self.library.file(file).name.as_str(),
                        // A missing file is named by the end of its path (S15).
                        Engine::Sample(Sample::Missing(_)) => self
                            .missing_file(sound)
                            .expect("a sound whose sample is missing is MISSING"),
                        Engine::Synth => unreachable!("the Sample page belongs to a sample sound"),
                    },
                    Bar::Track,
                )
            }
            ItemKind::LibraryMeter => {
                let (used, total) = (self.library.used(), budget::SAMPLE_RAM as u64);
                value.push_str(name::meter(used, total).as_str());
                ("Library", value.as_str(), Bar::Fill(used, total))
            }
        };
        ItemView {
            encoder: item.encoder.map(|encoder| encoder + 1),
            name,
            value,
            bar,
        }
    }

    /// What SAMPLES' row `row` shows: ".."; a folder as its name and "/", written into `left`; a
    /// file as its name with its length and size written into `right`, or in red with "not loaded"
    /// when start-up could not load it.
    fn samples_row<'a>(
        &'a self,
        row: samples::Row,
        left: &'a mut Label<{ 32 + 1 }>,
        right: &'a mut Label<{ 16 + 2 + 16 }>,
    ) -> Row<'a> {
        match row {
            samples::Row::Up => Row {
                left: "..",
                right: None,
                alert: false,
            },
            samples::Row::Folder(folder) => {
                left.push_str(self.library.folder(folder).name.as_str());
                left.push_str("/");
                Row {
                    left: left.as_str(),
                    right: None,
                    alert: false,
                }
            }
            samples::Row::File(file) => {
                let file = self.library.file(file);
                if !file.loaded {
                    return Row {
                        left: file.name.as_str(),
                        right: Some("not loaded"),
                        alert: true,
                    };
                }
                write!(
                    right,
                    "{}  {}",
                    name::length(file.frames).as_str(),
                    name::size(u64::from(file.bytes())).as_str()
                )
                .expect("writing to a label never fails");
                Row {
                    left: file.name.as_str(),
                    right: Some(right.as_str()),
                    alert: false,
                }
            }
        }
    }

    /// What POOL's row of `sound` shows (S1 to S5): its name, and a dim label written into `label`
    /// of its engine, "missing" and its file's name for a MISSING sound, the current track's pads
    /// that hold it and a loaded sample's size, two spaces apart. The pads read "pad 2" or "pads 1,
    /// 12"; "no pad" when none of them holds it and "no pad, no notes" when nothing uses it. A
    /// MISSING sound's row is red, and its file's name is shortened with "…" so that the label
    /// takes at most half the row, but keeps at least the "…" (answer 5).
    fn pool_row<'a>(&'a self, sound: &'a Sound, label: &'a mut Label<160>) -> Row<'a> {
        let number = sound.number;
        let holding = || {
            (1..)
                .zip(self.track().pads)
                .filter(move |&(_, pad)| pad == Some(number))
                .map(|(pad, _)| pad)
        };
        // All 12 pads take "pads 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12".
        let mut pads = Label::<42>::new();
        match holding().count() {
            0 if self.project.is_used(number) => pads.push_str("no pad"),
            0 => pads.push_str("no pad, no notes"),
            count => {
                pads.push_str(if count == 1 { "pad" } else { "pads" });
                for (index, pad) in holding().enumerate() {
                    write!(pads, "{}{pad}", if index == 0 { " " } else { ", " })
                        .expect("writing to a label never fails");
                }
            }
        }
        let engine = engine_word(&sound.engine);
        let missing = self.missing_file(sound);
        if let Some(file) = missing {
            // All of the label but the file's name.
            let mut rest = Label::<160>::new();
            write!(rest, "{engine}  missing   {}", pads.as_str())
                .expect("writing to a label never fails");
            let name = text::fit(
                file,
                ((ROW_WIDTH - 2 * TEXT_INSET) / 2 - text::width(rest.as_str())).max(ADVANCE),
            );
            write!(label, "{engine}  missing {name}  {}", pads.as_str())
                .expect("writing to a label never fails");
        } else {
            write!(label, "{engine}  {}", pads.as_str()).expect("writing to a label never fails");
            if let Engine::Sample(Sample::File(file)) = sound.engine {
                write!(
                    label,
                    "  {}",
                    name::size(u64::from(self.library.file(file).bytes())).as_str()
                )
                .expect("writing to a label never fails");
            }
        }
        Row {
            left: sound.name.as_str(),
            right: Some(label.as_str()),
            alert: missing.is_some(),
        }
    }

    /// The frames of the selected sound's file as the library lists it, also while the audio part
    /// may not read it, which its points are shown against; none for a missing file.
    fn frames(&self) -> u32 {
        match self.selected().map(|sound| &sound.engine) {
            Some(Engine::Sample(Sample::File(file))) => self.library.file(*file).frames,
            _ => 0,
        }
    }

    /// The name of the file of `sound` while the sound is MISSING (S15): its sample is missing, and
    /// the end of its path names it, or its file is not loaded, and the library names it. None for
    /// any other sound.
    fn missing_file<'a>(&'a self, sound: &'a Sound) -> Option<&'a str> {
        match &sound.engine {
            Engine::Sample(Sample::Missing(path)) => Some(
                path.as_str()
                    .rsplit('/')
                    .next()
                    .expect("a split gives at least one part"),
            ),
            Engine::Sample(Sample::File(file)) => {
                let file = self.library.file(*file);
                (!file.loaded).then_some(file.name.as_str())
            }
            Engine::Synth => None,
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

/// The dim word that names `engine` in the sound picker and on POOL.
fn engine_word(engine: &Engine) -> &'static str {
    match engine {
        Engine::Synth => "synth",
        Engine::Sample(_) => "sample",
    }
}

/// The bar under `entry`'s item at `value`. A switch or a list shows the track only; every other
/// value fills the bar by its place in its range.
fn bar(entry: &param::Entry, value: i32) -> Bar {
    match entry.curve {
        Curve::Switch | Curve::List => Bar::Track,
        _ => Bar::Fill((value - entry.low) as u64, (entry.high - entry.low) as u64),
    }
}
