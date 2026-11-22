mod bars;
pub mod buttons;
mod draw;
mod held;
mod lanes;
pub mod notes;
pub mod pages;
mod pool;
pub mod samples;
pub(crate) mod step_view;
mod steps;
mod transport;
pub mod view;

use crate::budget;
use crate::input::{Button, Input, PADS, STEPS, Stamped, VOLUME};
use crate::label::Label;
use crate::library::import::Import;
use crate::library::startup::StartUp;
use crate::library::{FileId, Library, name};
use crate::lights::Lights;
use crate::message::{
    MAX_MESSAGES_PER_EVENT, MAX_VERSIONS_PER_EVENT, MESSAGE_QUEUE, Message, MessageKind,
    NoteEngine, SampleFile, Target, VERSION_QUEUE, Version,
};
use crate::palette::RECORD;
use crate::param::{
    self, Curve, END, ENTRIES, LOOP_END, LOOP_START, METRONOME, OUTPUT_VOLUME, ParamId, START,
    Scope, TEMPO, VELOCITY,
};
use crate::project::pool::{Engine, PoolFull, SOUND_VALUES, Sample, Sound, SoundNumber};
use crate::project::settings::DeviceSettings;
use crate::project::track::{MAX_OCTAVE, PadMode, Track};
use crate::project::{Project, Signature};
use crate::queue::Producer;
use crate::ring::Ring;
use crate::sample_ram::{SampleRam, Tables};
use crate::screen::Color;
use crate::sequencer::Sequencer;
use crate::storage::{Reply, Request};
use crate::store::note::Key;
use crate::store::{RESERVE, Store};
use crate::ui::layout::{LIST_VISIBLE, PICTURE};
use crate::ui::step::Mark;
use crate::ui::text::SCROLL_PIXEL;
use crate::ui::tiles::{Tile, TileState};
use bars::{Change, LENGTHS, Trim};
use buttons::{Buttons, REPEATING, Release};
use core::cell::Cell;
use core::ops::ControlFlow;
use held::Held;
use lanes::Lane;
use notes::{Notes, Source};
use pages::{ItemDef, ItemKind, MENU, NOTE, PageDef, Picture, TIMING, pages};
use samples::Deleting;
use step_view::{GRID_CELLS, LANES_SHOWN, PAGE, cell_of, cells, place_of};
use view::{
    Cursor, Pick, Picker, Question, Screen, StepCursor, View, menu_tiles, moved, page_tiles,
};

pub const INPUT_QUEUE: usize = 64;
pub const REPLAY_QUEUE: usize = 64;
pub const REPLY_QUEUE: usize = 8;
/// The most messages whose reports the control part waits for at a time.
const AWAITED: usize = 4;

/// The sound picker's first row of a sound of the pool, after Empty, New sample and New synth.
const FIRST_SOUND_ROW: usize = 3;

/// What a row of a picker chooses.
enum Entry<'a> {
    /// Empties the pad.
    Empty,
    /// Opens the sample picker, whose file goes on the pad as a new sound.
    NewSample,
    /// Puts a new synth on the pad.
    NewSynth,
    /// Puts this sound of the pool on the pad.
    Sound(&'a Sound),
    /// Opens the sample picker, and the selected sound switches to the sample engine with the file
    /// chosen there.
    SampleEngine,
    /// Switches the selected sound to the synth.
    SynthEngine,
    /// Asks whether to delete this file of the library.
    Delete(FileId),
    /// Asks whether to delete this sound of the pool.
    DeleteSound(SoundNumber),
    /// Changes the current pattern's length or the signature, asking first when notes no longer
    /// fit (S12).
    Change(Change),
}

/// An event of `step`, in this order on equal samples.
#[derive(Clone, Copy)]
enum Event {
    Reply(Reply),
    /// The report of an awaited message, with that message's number.
    Heard(u32),
    Input(Stamped),
    Repeat(Button),
}

/// A message on the right of the header: its text and colour, and where a file's name lies in the
/// text, which `draw` shortens with "…" so that the rest of the text shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeaderMessage {
    pub text: Label<128>,
    pub color: Color,
    /// The name's first byte and the byte after it, both 0 when the text names no file.
    pub name: (usize, usize),
}

/// What the text that scrolls depends on: when any of it changes, the cursor has landed on
/// something new.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Focus {
    overlay: Option<Button>,
    screen: Screen,
    /// The page that `screen.paged()` shows and the item its cursor is on.
    page: usize,
    item: usize,
    /// The highlighted row of the picker while one is open.
    picker: Option<usize>,
    /// The question while one is open.
    question: Option<Question>,
    /// The row under the cursor of SAMPLES or of the sample picker while it shows.
    samples: Option<samples::Row>,
    /// The row of POOL's cursor while POOL shows (S18).
    pool: Option<usize>,
    track: u8,
    pad: Option<u8>,
    sound: Option<SoundNumber>,
}

/// The control part: it turns stamped inputs into numbered messages for the audio part. It keeps
/// the project, the device settings, the library, the held buttons, the notes that are on, whether
/// a preview plays, where the pattern plays, what the screen shows and the header's message, works
/// out the lights and draws the picture.
///
/// The control part does not check the inputs: the browser export and the scene parser keep them
/// in range (`Input`). They are queued in sample order, so for live play and for a complete replay
/// log, the messages leave in nondecreasing `at` order.
pub struct Control {
    inputs: Ring<Stamped, INPUT_QUEUE>,
    /// The (number, sample) records of a replay: the sample at which the audio part applied the
    /// message with that number in the recorded session.
    replay: Ring<(u32, u64), REPLAY_QUEUE>,
    next_number: u32,
    /// The storage request to send once the one out has its reply.
    request: Option<Request>,
    /// The number of the next storage request.
    next_request: u32,
    /// The number of the storage request that is out, until `step` handles its reply.
    out: Option<u32>,
    /// The (sample, reply) replies of the storage, in sample order.
    replies: Ring<(u64, Reply), REPLY_QUEUE>,
    /// The number and kind of each message sent whose report the control part waits for, until
    /// `step` handles its report.
    awaited: [Option<(u32, MessageKind)>; AWAITED],
    /// The (number, sample) reports of awaited messages, each an event at its sample.
    heard: Ring<(u32, u64), AWAITED>,
    started: bool,
    /// The start-up's job until it ends and the project opens.
    startup: Option<StartUp>,
    /// The import's job, which takes the dropped files once the project is open.
    import: Import,
    /// The delete's job while it runs: the file it deletes and what it waits for. Deletes run one
    /// at a time and never while the import replaces a file, which waits for a delete that runs,
    /// so the control part waits for at most one `ForgetSample`.
    delete: Option<(FileId, Deleting)>,
    /// The sample of the event at which the import listed a file, and the file, while missing
    /// sounds of its path wait to take it (`relink`).
    relinking: Option<(u64, FileId)>,
    /// The deleted sounds whose `DeleteSound` is still to be sent, oldest first, and the sample of
    /// the event that deleted them: `step` sends them before any later event (S17).
    unsent: Ring<SoundNumber, { budget::POOL_SOUNDS }>,
    unsent_at: u64,
    /// The removal of the notes a LENGTH or SIGNATURE change no longer fits while it runs: `step`
    /// runs it before any later event (S15).
    trim: Option<Trim>,
    library: Library,
    project: Project,
    settings: DeviceSettings,
    buttons: Buttons,
    notes: Notes,
    /// Whether a preview was started since the last stop, which a stop fades out.
    previewing: bool,
    /// The control part's own sequencer, which plays and stops with the audio part's runs, plays
    /// the trees of the versions sent and whose events go nowhere: the lights and the header read
    /// the pattern's playing from it (S20).
    player: Sequencer,
    /// The moment of the latest version, before which no later version's comes (S18).
    moment: u64,
    /// A bit for each step of the page the step buttons show whose sixteenth a note of the
    /// selected sound starts in, from step 1's bit 0, as the latest step left them (S6).
    step_notes: u16,
    /// What each cell of STEP's shown lanes holds, by lane and then by column from the view's first
    /// cell, as the latest step that asked for a redraw left it (S6).
    marks: [[Option<Mark>; GRID_CELLS]; LANES_SHOWN],
    /// The bar and sixteenth each step button showed when it last went down, on which its tap acts
    /// (S16).
    pressed: [StepCursor; 16],
    /// Where the notes of each step button lie while it is held: the place it showed at its press,
    /// which POSITION moves by as many grid steps as the notes, with notes there or not (S14).
    held: [StepCursor; 16],
    /// The held steps' notes as the latest step that asked for a redraw left them, none while
    /// there are none (S13).
    held_values: Option<Held>,
    /// The cell the cursor showed when CANCEL last went down, on which its tap acts (S11).
    cancel_at: StepCursor,
    /// The bytes that the blocks of the note memory in use cost (`Store::used`), as the latest step
    /// left them: the Dev page shows them.
    note_memory: u64,
    /// The fingerprint and the peaks (`Library::peaks`) of the latest file whose waveform showed
    /// while the audio part could read it. `step` reads them again for a file of another
    /// fingerprint, so a file listed in the place of another never shows that one's picture.
    waveform: Option<([u8; 16], [u16; PICTURE.2 as usize])>,
    view: View,
    /// The message on the right of the header. A later button press clears it (`press`); while
    /// there is none, the import's progress shows there.
    message: Option<HeaderMessage>,
    /// The `until` of the latest step.
    now: u64,
    /// The sample of the event after which the cursor last landed on something new: the text
    /// under it scrolls from there.
    landed: u64,
    /// What the cursor was on after the latest event; none before the first.
    focus: Option<Focus>,
    /// Whether a text scrolled in the latest picture (`draw`).
    scrolling: Cell<bool>,
}

impl Control {
    pub const fn new() -> Self {
        Self {
            inputs: Ring::new(),
            replay: Ring::new(),
            next_number: 0,
            request: None,
            next_request: 0,
            out: None,
            replies: Ring::new(),
            awaited: [None; AWAITED],
            heard: Ring::new(),
            started: false,
            startup: Some(StartUp::new()),
            import: Import::new(),
            delete: None,
            relinking: None,
            unsent: Ring::new(),
            unsent_at: 0,
            trim: None,
            library: Library::new(),
            project: Project::new(),
            settings: DeviceSettings::new(),
            buttons: Buttons::new(),
            notes: Notes::new(),
            previewing: false,
            player: Sequencer::new(),
            moment: 0,
            step_notes: 0,
            marks: [[None; GRID_CELLS]; LANES_SHOWN],
            pressed: [StepCursor { bar: 0, step: 0 }; 16],
            held: [StepCursor { bar: 0, step: 0 }; 16],
            held_values: None,
            cancel_at: StepCursor { bar: 0, step: 0 },
            note_memory: 0,
            waveform: None,
            view: View::new(),
            message: None,
            now: 0,
            landed: 0,
            focus: None,
            scrolling: Cell::new(false),
        }
    }

    /// Gives the input back when the queue is full.
    pub fn queue_input(&mut self, input: Stamped) -> Result<(), Stamped> {
        self.inputs.push(input)
    }

    /// Queues the sample at which a recorded session applied the message with this number. The
    /// message then carries that sample as its `at` instead of the sample of its input. Gives the
    /// record back when the queue is full.
    pub fn replay_applied(&mut self, number: u32, sample: u64) -> Result<(), (u32, u64)> {
        self.replay.push((number, sample))
    }

    /// Gives the storage request to send, with its number, once. Requests are numbered from 0, and
    /// the next comes only after `step` has handled the reply to the one before.
    pub fn take_request(&mut self) -> Option<(u32, Request)> {
        if self.out.is_some() {
            return None;
        }
        let request = self.request.take()?;
        let number = self.next_request;
        self.next_request += 1;
        self.out = Some(number);
        Some((number, request))
    }

    /// Queues the storage's reply, stamped with the sample at which it came. Gives it back when
    /// the queue is full.
    pub fn queue_reply(&mut self, sample: u64, reply: Reply) -> Result<(), Reply> {
        self.replies
            .push((sample, reply))
            .map_err(|(_, reply)| reply)
    }

    /// Hears that the audio part applied the message or version with this number at `sample`. The
    /// blocks of the note memory that the version let go of are free once its group is the oldest
    /// that waits (`Store::applied`). The report of a message the control part waits for becomes
    /// an event at that sample; others are dropped.
    pub fn applied(&mut self, number: u32, sample: u64, store: &mut Store<'_>) {
        store.applied(number);
        if self
            .awaited
            .iter()
            .flatten()
            .any(|&(awaited, _)| awaited == number)
        {
            self.heard
                .push((number, sample))
                .expect("every heard report holds its message's slot in `awaited`");
        }
    }

    /// Handles the events before `until` in sample order, the storage's replies, the reports of
    /// awaited messages, the queued inputs and the repeats of held buttons, and returns whether
    /// the screen must be redrawn. That is the case on the first step, whenever it handled an
    /// event, whenever the header's bar numbers changed since the step before (the bar the step
    /// buttons show, `shown_bar`, and the bar playing), whenever the music's line on STEP moved a
    /// pixel (`music_x`) and, while a text scrolls, whenever a pixel's time has passed since the
    /// step before.
    ///
    /// On equal samples a reply goes first, then a report, then an input and then a repeat, so a
    /// release at the sample of a repeat ends the hold before it. A reply ends the wait for its
    /// request; one to another request does nothing. An event is handled only while the message
    /// queue has room for `MAX_MESSAGES_PER_EVENT` messages and the version queue for
    /// `MAX_VERSIONS_PER_EVENT` versions (S18), and not while fewer than `RESERVE` blocks of the
    /// note memory in `store` are ready and some wait for a version's report (S19). Otherwise the
    /// step stops before it and leaves it and every later event for a later step, which goes on
    /// exactly where this one stopped. Before any later event the missing sounds of a file the
    /// import listed take it, one sound at a time with the same room (`relink`). Before both, the
    /// `DeleteSound`s of deleted sounds go out, oldest first, as far as the queue has room for them
    /// (`delete_sound`, S17); while any is left the step handles no event and stops there. After
    /// them and before any later event, the removal of the notes a LENGTH or SIGNATURE change no
    /// longer fits makes its moves while the version queue has room for `MAX_VERSIONS_PER_EVENT`
    /// versions (`next_removal`, S15); with fewer than `RESERVE` blocks free it publishes what it
    /// has, and before a removal the step stops while fewer than `RESERVE` are ready and blocks
    /// wait for reports. While it runs the step handles no event. The control part's own
    /// sequencer (`player`) advances to each event's sample before the event, and to `until` once
    /// no event is left before it; a step that stops early leaves it at the last event it
    /// handled. Its events go nowhere, and it keeps the notes that sound.
    ///
    /// The first step starts the start-up's job, and a reply goes to it with `io`, the I/O buffer,
    /// as its request left it. When the job ends the project opens, with the job's result as the
    /// header's message. Until then every input is dropped but a turn of the volume encoder and a
    /// drop, whose files wait for the project. Then the import's job takes them, and the replies go
    /// to it with `io` and `ram`, the sample RAM; when it ends, its result is the header's message.
    /// A delete's job sends its `Delete` between two of the import's requests (`put_request`), and
    /// that request's reply goes to it (`deleted`).
    ///
    /// After each event every page's cursor is kept on an item that the page shows: a cursor whose
    /// item vanished moves to the nearest item above, where it stays when the item comes back.
    /// After a reply or a report SAMPLES' cursor is kept on its row (`keep_samples_cursor`), as
    /// only the jobs they drive change the library; from the reply that opens the project on, so
    /// that start-up, which lists the library page by page in another order, leaves it on the
    /// first row. While POOL shows, its cursor follows the current track's selection
    /// (`follow_selection`). STEP's view is kept on the cursor's cell and lane (`keep_step_view`),
    /// also at the end of the step, where following has moved the cursor's bar with no event. When
    /// the cursor has then landed on something new (`Focus`), the text under it scrolls from that
    /// event's sample.
    ///
    /// Last, while the screen's page shows the waveform and the audio part may read the selected
    /// sound's file (`sample_file`), it reads that file's peaks through `tables` from `ram` unless
    /// it holds them already (`waveform`), it works out which steps of the page and bar the step
    /// buttons show (`shown_bar`) start a note of the selected sound (`step_notes`) and it notes
    /// how much of the note memory is in use (`note_memory`). When it returns true it also notes
    /// the held steps' notes as the strip shows them (`held_values`), and while STEP shows what
    /// the cells of the shown lanes hold (`marks`).
    #[expect(
        clippy::too_many_arguments,
        reason = "the control part writes two queues and reads and writes three memories"
    )]
    pub fn step(
        &mut self,
        until: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        io: &mut [u8],
        tables: &Tables,
        ram: &SampleRam,
        store: &mut Store<'_>,
    ) -> bool {
        let first = !core::mem::replace(&mut self.started, true);
        if first && let Some(startup) = &self.startup {
            self.request = Some(startup.request(&self.library));
        }
        let mut redraw = first;
        let header_bars = |control: &Self, sample| {
            (
                control.shown_bar(sample),
                control.player.at(sample).map(|(bar, _)| bar),
                control.music_x(sample),
            )
        };
        let shown = header_bars(self, self.now);
        loop {
            while messages.free() > 0
                && let Some(sound) = self.unsent.pop()
            {
                self.send(self.unsent_at, MessageKind::DeleteSound { sound }, messages);
            }
            if self.trim.is_some() {
                if versions.free() < MAX_VERSIONS_PER_EVENT
                    || self.next_removal(versions, store).is_break()
                {
                    break;
                }
                redraw = true;
                continue;
            }
            if self.unsent.peek().is_some()
                || messages.free() < MAX_MESSAGES_PER_EVENT
                || versions.free() < MAX_VERSIONS_PER_EVENT
                || store.ready() < RESERVE && store.waiting()
            {
                break;
            }
            if self.relinking.is_some() {
                self.relink(messages);
                redraw = true;
                continue;
            }
            let events = [
                self.replies
                    .peek()
                    .map(|(sample, reply)| (sample, Event::Reply(reply))),
                self.heard
                    .peek()
                    .map(|(number, sample)| (sample, Event::Heard(number))),
                self.inputs
                    .peek()
                    .map(|stamped| (stamped.sample, Event::Input(stamped))),
                self.buttons
                    .next_repeat()
                    .map(|(sample, button)| (sample, Event::Repeat(button))),
            ];
            // Of equal samples `min_by_key` keeps the first.
            let Some((sample, event)) = events
                .into_iter()
                .flatten()
                .filter(|&(sample, _)| sample < until)
                .min_by_key(|&(sample, _)| sample)
            else {
                self.player.advance(until, &store.reader(), |_| {});
                break;
            };
            self.player.advance(sample, &store.reader(), |_| {});
            match event {
                Event::Reply(reply) => {
                    self.replies.pop();
                    if self.out.take_if(|&mut out| out == reply.number).is_some() {
                        if let Some(startup) = &mut self.startup {
                            match startup.reply(reply, io, &mut self.library, tables) {
                                ControlFlow::Continue(()) => {
                                    self.request = Some(startup.request(&self.library));
                                }
                                ControlFlow::Break(()) => {
                                    self.message = startup.result().map(|text| HeaderMessage {
                                        text,
                                        color: RECORD,
                                        name: (0, 0),
                                    });
                                    self.startup = None;
                                    self.start_import(sample, messages);
                                }
                            }
                        } else if let Some((file, Deleting::Reply)) = self.delete {
                            self.deleted(file, tables);
                        } else if self.import.running() {
                            if let ControlFlow::Break(result) =
                                self.import.reply(reply, io, ram, &mut self.library, tables)
                            {
                                self.message = Some(result);
                            }
                            self.follow_import(sample, messages);
                        }
                    }
                }
                Event::Heard(number) => {
                    self.heard.pop();
                    let slot = self
                        .awaited
                        .iter_mut()
                        .find(|slot| slot.is_some_and(|(awaited, _)| awaited == number))
                        .expect("every heard report holds its message's slot in `awaited`");
                    match slot.take() {
                        Some((_, MessageKind::UseTable { .. })) => {
                            // SAFETY: only a `Listed::Packed` sends a `UseTable`, so this is the
                            // report of the latest.
                            #[allow(unsafe_code)]
                            let waited = unsafe { self.import.applied(&mut self.library, tables) };
                            if waited {
                                self.follow_import(sample, messages);
                            }
                        }
                        // The audio part let go of the file the delete deletes.
                        Some((_, MessageKind::ForgetSample { file })) if self.delete.is_some() => {
                            self.delete = Some((file, Deleting::Turn));
                            self.put_request();
                        }
                        Some((_, MessageKind::ForgetSample { .. })) => {
                            // SAFETY: no delete runs while the import replaces a file, so this is
                            // the report of the `ForgetSample` of the file it replaces.
                            #[allow(unsafe_code)]
                            unsafe {
                                self.import.list_written(&mut self.library, tables);
                            }
                            self.follow_import(sample, messages);
                        }
                        _ => unreachable!(
                            "the control part waits only for `UseTable`s and `ForgetSample`s"
                        ),
                    }
                }
                Event::Input(stamped) => {
                    self.inputs.pop();
                    if self.startup.is_none()
                        || matches!(
                            stamped.input,
                            Input::EncoderTurn {
                                encoder: VOLUME,
                                ..
                            } | Input::Dropped { .. }
                        )
                    {
                        self.input(stamped, messages, versions, store);
                    }
                }
                Event::Repeat(button) => {
                    // Each repeat makes the same move as the press.
                    self.nudge(button, sample, messages);
                    self.buttons.repeated(button);
                }
            }
            if self.startup.is_none() && matches!(event, Event::Reply(_) | Event::Heard(_)) {
                self.keep_samples_cursor();
            }
            for screen in Screen::ALL {
                for (page, def) in self.pages(screen).iter().enumerate() {
                    self.view.keep_cursor(screen, page, def.items.len());
                }
            }
            self.follow_selection();
            self.keep_step_view(sample);
            let paged = self.view.screen.paged();
            let track = self.track();
            let focus = Some(Focus {
                overlay: self.overlay(),
                screen: self.view.screen,
                page: self.shown_page(paged),
                item: self.cursor(paged).item,
                picker: self.view.picker.map(|(_, highlight)| highlight.item),
                question: self.view.question,
                samples: match self.view.picker {
                    Some((Picker::Sample(_), _)) => self.view.sample_picker.on,
                    _ => self
                        .view
                        .samples
                        .on
                        .filter(|_| self.view.screen == Screen::Samples),
                },
                pool: (self.view.screen == Screen::Pool).then_some(self.view.pool.cursor.item),
                track: self.project.track,
                pad: track.selected_pad,
                sound: track.selected_sound,
            });
            if focus != self.focus {
                self.focus = focus;
                self.landed = sample;
            }
            redraw = true;
        }
        self.keep_step_view(until);
        if self.page(self.view.screen).and_then(|page| page.picture) == Some(Picture::Waveform)
            && let Some(audio) = self.sample_file()
        {
            let fingerprint = self.library.file(audio.file).fingerprint;
            if self
                .waveform
                .as_ref()
                .is_none_or(|(held, _)| *held != fingerprint)
            {
                self.waveform = Some((fingerprint, self.library.peaks(audio.file, tables, ram)));
            }
        }
        let (bar, first) = (
            self.shown_bar(until),
            u16::from(self.view.steps.step / 16) * 16,
        );
        self.step_notes = self.track().selected_sound.map_or(0, |sound| {
            store
                .reader()
                .notes(
                    self.project.patterns[usize::from(self.project.pattern)].tracks
                        [usize::from(self.project.track)],
                    Key::at(bar, first * 480),
                )
                .take_while(|note| {
                    note.key()
                        < Key::at(
                            bar,
                            (first + 16).min(self.project.signature.sixteenths() as u16) * 480,
                        )
                })
                .filter(|note| note.sound == sound)
                .fold(0, |steps, note| steps | 1 << (note.place / 480 - first))
        });
        self.note_memory = store.used();
        // shortcut: a scrolling text also redraws each pixel time during its pause, an identical
        // picture; compare offsets if the hardware's redraw cost matters.
        let pixels = |sample: u64| sample.saturating_sub(self.landed) / SCROLL_PIXEL;
        redraw |= self.scrolling.get() && pixels(until) != pixels(self.now);
        redraw |= header_bars(self, until) != shown;
        if redraw {
            self.held_values = self.summary(store);
        }
        if redraw && self.view.screen == Screen::Step {
            let signature = self.project.signature;
            let view = self.view.step_view;
            let columns = self.step_columns().1;
            // The sound each shown lane shows: none on a copy lane or an empty pad's.
            let mut sounds = [None; LANES_SHOWN];
            for (sound, lane) in sounds.iter_mut().zip(self.lanes().skip(view.first_lane)) {
                *sound = match lane {
                    Lane::Pad(pad) if self.copy_of(pad).is_some() => None,
                    lane => self.lane_sound(lane),
                };
            }
            self.marks = [[None; GRID_CELLS]; LANES_SHOWN];
            let tree = self.project.patterns[usize::from(self.project.pattern)].tracks
                [usize::from(self.project.track)];
            let first_bar = (view.first_cell / cells(1, signature)) as u16;
            for note in store.reader().notes(tree, Key::at(first_bar, 0)) {
                let cell = cell_of(
                    StepCursor {
                        bar: note.bar,
                        step: (note.place / 480) as u8,
                    },
                    signature,
                );
                if cell >= view.first_cell + columns {
                    break;
                }
                if let Some(row) = sounds.iter().position(|&sound| sound == Some(note.sound))
                    && let Some(column) = cell.checked_sub(view.first_cell)
                {
                    let mark = &mut self.marks[row][column as usize];
                    let held = mark.unwrap_or_default();
                    *mark = Some(Mark {
                        velocity: held.velocity.max(note.velocity),
                        count: held.count.saturating_add(1),
                        // 8 px to 480 ticks, so 60 ticks to a pixel.
                        tail: held.tail.max(
                            u16::try_from(note.length.saturating_sub(480) / 60).unwrap_or(u16::MAX),
                        ),
                    });
                }
            }
        }
        self.now = until;
        redraw
    }

    /// The lights as the state of the control part has them.
    ///
    /// A pad is lit from its own hit to its release, whatever changes meanwhile: the mode, the
    /// octave or the track. Otherwise the pads show the current track. In PADS mode the selected
    /// pad is lit. So is every pad a MIDI note on was hit as. So is every pad whose sound has a
    /// note of the current track sounding in the pattern (S13). In KEYS mode pad 1, the C, is lit
    /// and so is every pad whose pitch in the current octave has a MIDI note on or is a pitch the
    /// pattern sounds on the current track in the selected sound (S13). T1 to T4 light the
    /// current track and PADS/KEYS lights in KEYS mode. While MENU or PAGE is held, the steps of
    /// the screens or pages that exist light: the steps whose tiles are not empty. Otherwise the
    /// steps of the page the step buttons show light where a note of the selected sound starts
    /// (`step_notes`), and while playing the step the music is in, on that page of the bar the
    /// buttons show (`shown_bar`), is flipped (S6). PLAY lights while playing (S10), and TEMPO
    /// while the metronome is on (S9).
    pub fn lights(&self) -> Lights {
        let track = self.track();
        let midi = self
            .notes
            .midi()
            .filter(|note| note.track == self.project.track);
        let sounding = self
            .player
            .sounding()
            .filter(|note| note.track == self.project.track);
        let mut lights = Lights(0);
        lights.light(Lights::TRACK + u32::from(self.project.track));
        for pad in self.notes.held_pads() {
            lights.light(Lights::PAD + u32::from(pad));
        }
        match track.mode {
            PadMode::Pads => {
                for pad in track
                    .selected_pad
                    .into_iter()
                    .chain(midi.filter_map(|note| note.pad))
                    .chain(sounding.flat_map(|note| {
                        (0..PADS).filter(|&pad| track.pads[usize::from(pad)] == Some(note.sound))
                    }))
                {
                    lights.light(Lights::PAD + u32::from(pad));
                }
            }
            PadMode::Keys => {
                lights.light(Lights::PADS_KEYS);
                lights.light(Lights::PAD);
                let c = track.key_pitch(0);
                for pitch in midi
                    .map(|note| note.pitch)
                    .chain(
                        sounding
                            .filter(|note| Some(note.sound) == track.selected_sound)
                            .map(|note| note.pitch),
                    )
                    .filter(|pitch| (c..c + PADS).contains(pitch))
                {
                    lights.light(Lights::PAD + u32::from(pitch - c));
                }
            }
        }
        if let Some(tiles) = self.tiles() {
            for (step, tile) in tiles.iter().enumerate() {
                if tile.state != TileState::Empty {
                    lights.light(Lights::STEP + step as u32);
                }
            }
        } else {
            lights.0 |= u64::from(
                self.step_notes
                    ^ self
                        .player
                        .at(self.now)
                        .filter(|&(bar, place)| {
                            bar == self.shown_bar(self.now)
                                && place / 480 / 16 == u32::from(self.view.steps.step / 16)
                        })
                        .map_or(0, |(_, place)| 1 << (place / 480 % 16)),
            ) << Lights::STEP;
        }
        if self.player.run().is_some() {
            lights.light(Lights::PLAY);
        }
        if self.settings.get(METRONOME.id) == 1 {
            lights.light(Lights::TEMPO);
        }
        lights
    }

    /// Handles one input. Every input reaches its action here.
    fn input(
        &mut self,
        Stamped { sample, input }: Stamped,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        match input {
            Input::PadHit { pad, velocity } => {
                self.buttons.used();
                self.hit(
                    Source::Pad(pad),
                    pad,
                    self.track().key_pitch(pad),
                    velocity,
                    sample,
                    messages,
                    versions,
                    store,
                );
            }
            // A MIDI note is no control of the device, so it uses no held button. In KEYS mode it
            // plays its own pitch from C0 to B8, the pitches the pads play, and others are ignored.
            Input::NoteOn { note, velocity }
                if self.track().mode == PadMode::Pads || (12..=119).contains(&note) =>
            {
                self.hit(
                    Source::Midi(note),
                    note % PADS,
                    note,
                    velocity,
                    sample,
                    messages,
                    versions,
                    store,
                );
            }
            Input::PadRelease { pad } => self.end(Source::Pad(pad), sample, messages),
            Input::NoteOff { note } => self.end(Source::Midi(note), sample, messages),
            Input::ButtonPress { button } => self.press(button, sample, messages, versions, store),
            Input::ButtonRelease { button } => {
                self.release(button, sample, messages, versions, store)
            }
            Input::EncoderTurn { encoder, clicks } => {
                self.buttons.used();
                // Under MENU or PAGE and while a picker or a question is open a turn of encoders 1
                // to 4 is dropped. The volume acts as usual there, and SHIFT does not make its
                // click fine.
                if encoder == VOLUME {
                    self.turn(OUTPUT_VOLUME.id, i32::from(clicks), false, sample, messages);
                } else if self.overlay().is_none()
                    && self.view.picker.is_none()
                    && self.view.question.is_none()
                    && let Some(item) = self.reach(encoder)
                {
                    if NOTE.contains(&item) {
                        self.turn_held(item.kind, i32::from(clicks), sample, versions, store);
                    } else {
                        self.change(item, i32::from(clicks), sample, messages);
                    }
                }
            }
            // The drop's files join the import, whose new progress replaces the message.
            Input::Dropped { files } => {
                self.import.add(files);
                self.message = None;
                self.start_import(sample, messages);
            }
            Input::NoteOn { .. }
            | Input::PadPressure { .. }
            | Input::NotePressure { .. }
            | Input::ChannelPressure { .. } => {}
        }
    }

    /// A hit from `source`. In PADS mode it hits `pad`: it plays the pad's sound at its own pitch,
    /// C4 for a synth, where it sounds unchanged, and its Root note for a sample sound, where it
    /// sounds as recorded (S2), and selects the pad and its sound unless a picker or a question is
    /// open, as a new selection would change what it is for, or a step is held; a selected pad
    /// lands POOL's cursor (`land_on_selection`). In KEYS mode it is the key of the pitch `key`:
    /// that becomes the last key played, and it plays the selected sound at that pitch. With no
    /// sound it plays nothing, and neither does a source that has a note on already. Its note
    /// plays the sound's `note_engine`. With a step held and no picker or question open, what
    /// sounds also goes in or out of each held step's notes (`toggle_held`, S15).
    #[expect(
        clippy::too_many_arguments,
        reason = "a hit writes the message queue, the version queue and the note memory"
    )]
    fn hit(
        &mut self,
        source: Source,
        pad: u8,
        key: u8,
        velocity: u8,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        let open = self.view.picker.is_some() || self.view.question.is_some();
        let held = !open && self.held_steps().next().is_some();
        let selecting = !open && !held;
        let track = self.track_mut();
        let (pad, key, sound) = match track.mode {
            PadMode::Pads => {
                if selecting {
                    track.select(pad);
                }
                (Some(pad), None, track.pads[usize::from(pad)])
            }
            PadMode::Keys => {
                track.last_key = Some(key);
                (None, Some(key), track.selected_sound)
            }
        };
        if pad.is_some() && selecting {
            self.land_on_selection();
        }
        let Some(sound) = sound else {
            return;
        };
        let played = self
            .project
            .pool
            .get(sound)
            .expect("a sound on a pad or selected is in the pool");
        let engine = self.note_engine(played);
        let pitch = key.unwrap_or(played.unchanged_pitch());
        let track = self.project.track;
        let Some(note) = self.notes.start(source, track, pad, pitch) else {
            return;
        };
        // With VELOCITY off every note plays at full velocity.
        let velocity = if self.settings.get(VELOCITY.id) == 0 {
            127
        } else {
            velocity
        };
        self.send(
            sample,
            MessageKind::NoteOn {
                note,
                track,
                sound,
                pitch,
                velocity,
                engine,
            },
            messages,
        );
        if held {
            self.toggle_held(sound, pitch, sample, versions, store);
        }
    }

    /// What a note of `sound` plays: the synth, or a sample sound's file while the audio part may
    /// read it (`playable`), and no file otherwise.
    fn note_engine(&self, sound: &Sound) -> NoteEngine {
        match &sound.engine {
            Engine::Synth => NoteEngine::Synth,
            Engine::Sample(Sample::File(file)) => NoteEngine::Sample(self.playable(*file)),
            Engine::Sample(Sample::Missing(_)) => NoteEngine::Sample(None),
        }
    }

    /// `file` as the audio part may read it: none while it is not loaded or is being deleted or
    /// replaced, as the audio part may have let go of it.
    fn playable(&self, file: FileId) -> Option<SampleFile> {
        let audio = self.library.file(file);
        (audio.loaded
            && self.delete.is_none_or(|(deleted, _)| deleted != file)
            && self.import.replacing() != Some(file))
        .then_some(SampleFile {
            file,
            frames: audio.frames,
            stereo: audio.channels == 2,
        })
    }

    /// A pad release or a MIDI note-off: it ends the note that the hit from `source` started,
    /// whatever changed since.
    fn end(
        &mut self,
        source: Source,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if let Some(note) = self.notes.end(source) {
            self.send(sample, MessageKind::NoteOff { note }, messages);
        }
    }

    /// A button goes down. A button that is held already does nothing, as one physical control
    /// cannot go down twice. Every other press clears the header's message before it acts, so a
    /// message that its own action shows stays.
    ///
    /// A combination acts when its second control goes down, and takes that press, so that it
    /// neither repeats nor acts when it is let go:
    ///
    /// - Of MENU and PAGE the first one pressed counts, and the other is taken. The one that counts
    ///   takes the arrows, - and + that are held, so they stop repeating and act again only when
    ///   pressed again. While it is held, a step shows its screen or page, and a dark step does
    ///   nothing; leaving SAMPLES for another screen stops the preview (`stop_preview`), and POOL
    ///   opens on the selection (`land_on_selection`). The arrows, OK, CANCEL, - and +, the encoder
    ///   pushes, ROLL, PADS/KEYS and COPY are dropped, and so taken too.
    /// - T1 to T4 select the track and land POOL's cursor (`land_on_selection`). With SHIFT held
    ///   they do nothing until muting comes with the sequencer.
    /// - SHIFT + OK, SHIFT + STOP, SHIFT + an encoder push and SHIFT + a step do nothing, though a
    ///   step under MENU or PAGE still shows its screen or page.
    /// - PADS/KEYS held + up or down moves the octave in KEYS mode, stopping at C0 and C8, and in
    ///   PADS mode does nothing. PADS/KEYS held + left or right does nothing. Each arrow under
    ///   PADS/KEYS is taken, so it does not repeat, and like any press it still counts as another
    ///   control used.
    ///
    /// While a picker is open the controls act on it. The arrows, - and + move its highlight
    /// (`nudge`), OK chooses the highlighted row and closes it, Delete opening its question and New
    /// sample the sample picker, and a tap of CANCEL closes it (`release`). In the Engine picker
    /// the sound's own engine changes nothing (S9); Synth gives the sound the synth's defaults and
    /// keeps its chain, and Sample opens the sample picker, so the sound switches only once a file
    /// is chosen there. In the sample picker OK and CANCEL act as on SAMPLES (`ok_in_samples`,
    /// `cancel_in_samples`). PLAY, STOP, REC and SHIFT + T1 to T4 act as usual. T1 to T4, MENU,
    /// PAGE, ROLL, PADS/KEYS, TEMPO, COPY, the steps and the encoder pushes are dropped: they are
    /// taken, so they act neither now nor when they are let go, and the picker stays open. Every
    /// other combination does nothing there either: an arrow, - or + pressed while SHIFT or
    /// PADS/KEYS is held, even a PADS/KEYS dropped by the picker, is taken at its press, so it
    /// neither moves the highlight nor repeats, also once SHIFT or PADS/KEYS is let go. Opening and
    /// closing the picker take the arrows, - and + that are held, as a counted MENU or PAGE does
    /// (`end_held_repeats`). In the Length and Signature pickers the current value changes nothing,
    /// and another applies at once (`reshape`) unless it no longer fits some notes (`doomed`),
    /// which opens the Delete notes question (S12). While a question is open only OK and a tap of
    /// CANCEL answer it. OK on SAMPLES' DELETE deletes the file (`delete_file`) unless the import
    /// replaces a file; on POOL's DELETE it deletes the sound (`delete_sound`) and moves the cursor
    /// to the row above (S16); on Remove unused it deletes every sound unused at that moment; on
    /// Delete notes it applies the change (`reshape`). The arrows, - and + are taken too, and the
    /// other controls act as with a picker open.
    ///
    /// Otherwise the arrows, - and + nudge (`nudge`), OK uses the item under the cursor, or acts on
    /// SAMPLES' row (`ok_in_samples`) or POOL's (`ok_in_pool`), or on STEP enters a note in the
    /// cursor's cell where none starts (`enter_note`, S10), and an encoder push the item its
    /// encoder holds. PLAY and SHIFT + PLAY start or jump (`play`) and STOP stops (`stop`), also
    /// while MENU or PAGE is held. A step and TEMPO act when they are let go (`release`), a step on
    /// the bar and sixteenth it showed at its press (`pressed`, S16), and so does CANCEL on STEP, on
    /// the cell the cursor showed at its press (`cancel_at`, S11).
    fn press(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        if self.buttons.is_held(button) {
            return;
        }
        self.message = None;
        self.buttons.press(button, sample);
        let overlay = self.overlay();
        let picker = self.view.picker.is_some();
        let question = self.view.question.is_some();
        let pads_keys = self.buttons.first_held(&[Button::PadsKeys]).is_some();
        match button {
            Button::T1
            | Button::T2
            | Button::T3
            | Button::T4
            | Button::Ok
            | Button::Stop
            | Button::Push(_)
                if self.buttons.is_held(Button::Shift) =>
            {
                self.buttons.take(button);
            }
            Button::Up
            | Button::Down
            | Button::Left
            | Button::Right
            | Button::Minus
            | Button::Plus
                if question
                    || picker
                        && (self.buttons.is_held(Button::Shift)
                            || self.buttons.is_held(Button::PadsKeys)) =>
            {
                self.buttons.take(button);
            }
            Button::Up
            | Button::Down
            | Button::Left
            | Button::Right
            | Button::Minus
            | Button::Plus
                if picker =>
            {
                self.nudge(button, sample, messages);
            }
            // No delete starts while the import replaces a file (`Import::replacing`).
            Button::Ok if let Some(Question::DeleteFile(file)) = self.view.question => {
                if self.import.replacing().is_none() {
                    self.view.question = None;
                    self.delete_file(file, sample, messages);
                }
            }
            Button::Ok if let Some(Question::DeleteSound(sound)) = self.view.question => {
                self.view.question = None;
                self.delete_sound(sound, sample, versions, store);
                // The cursor is still on the deleted sound's row, and goes to the row above (S16).
                self.move_in_pool(Button::Up);
            }
            Button::Ok if self.view.question == Some(Question::RemoveUnused) => {
                self.view.question = None;
                for sound in self.project.unused() {
                    self.unsent
                        .push(sound)
                        .expect("`unsent` holds a full pool and is empty when an event deletes");
                }
                self.unsent_at = sample;
                // A delete leaves every other sound as used as it was. From the highest number
                // down, each delete moves only the used sounds above it in the pool.
                loop {
                    let Some(sound) = self.project.unused().next_back() else {
                        break;
                    };
                    self.project.delete_sound(sound);
                }
            }
            Button::Ok if let Some(Question::DeleteNotes { change, .. }) = self.view.question => {
                self.view.question = None;
                self.reshape(change, sample, messages, store);
            }
            Button::Ok if matches!(self.view.picker, Some((Picker::Sample(_), _))) => {
                self.ok_in_samples(sample, messages);
            }
            Button::Ok if let Some((open, highlight)) = self.view.picker => {
                self.view.picker = None;
                self.end_held_repeats();
                let sound = match self.entry(open, highlight.item) {
                    Entry::Delete(file) => {
                        self.view.question = Some(Question::DeleteFile(file));
                        return;
                    }
                    Entry::DeleteSound(sound) => {
                        self.view.question = Some(Question::DeleteSound(sound));
                        return;
                    }
                    Entry::Change(change) => {
                        let bars = self.project.patterns[usize::from(self.project.pattern)].bars;
                        if ![
                            Change::Length(bars),
                            Change::Signature(self.project.signature),
                        ]
                        .contains(&change)
                        {
                            match self.doomed(change, store) {
                                0 => self.reshape(change, sample, messages, store),
                                count => {
                                    self.view.question =
                                        Some(Question::DeleteNotes { count, change });
                                }
                            }
                        }
                        return;
                    }
                    // A full pool refuses at once, so the sample picker never opens (answer 4).
                    Entry::NewSample => {
                        match self.project.pool.vacancy() {
                            Ok(_) => self.open_sample_picker(Pick::NewSound, None),
                            Err(PoolFull) => self.pool_full(),
                        }
                        return;
                    }
                    Entry::SampleEngine => {
                        let sound = self
                            .selected()
                            .expect("the Engine picker belongs to the selected sound");
                        if sound.engine == Engine::Synth {
                            self.open_sample_picker(Pick::Switch, None);
                        }
                        return;
                    }
                    Entry::SynthEngine => {
                        let number = self
                            .track()
                            .selected_sound
                            .expect("the Engine picker belongs to the selected sound");
                        let sound = self
                            .project
                            .pool
                            .get_mut(number)
                            .expect("a selected sound is in the pool");
                        if sound.engine != Engine::Synth {
                            let before = *sound;
                            sound.start_synth();
                            self.send_values(
                                number,
                                &before.values,
                                self.note_engine(&before),
                                sample,
                                messages,
                            );
                        }
                        return;
                    }
                    Entry::Empty => None,
                    Entry::NewSynth => match self.project.pool.new_synth() {
                        Ok(sound) => {
                            self.send(sample, MessageKind::NewSound { sound }, messages);
                            Some(sound)
                        }
                        Err(PoolFull) => {
                            self.pool_full();
                            return;
                        }
                    },
                    Entry::Sound(sound) => Some(sound.number),
                };
                let pad = self
                    .track()
                    .selected_pad
                    .expect("the sound picker belongs to the selected pad");
                self.project.put(pad, sound);
            }
            Button::T1
            | Button::T2
            | Button::T3
            | Button::T4
            | Button::PadsKeys
            | Button::Roll
            | Button::Menu
            | Button::Page
            | Button::Copy
            | Button::Tempo
            | Button::Step(_)
            | Button::Push(_)
                if picker || question =>
            {
                self.buttons.take(button);
            }
            Button::Play if (picker || question) && self.buttons.is_held(Button::Shift) => {
                self.buttons.take(button);
            }
            Button::Play => self.play(sample, messages, store),
            Button::Stop => self.stop(sample, messages),
            Button::Menu | Button::Page if overlay != Some(button) => self.buttons.take(button),
            Button::Menu | Button::Page => self.end_held_repeats(),
            Button::Step(step) if overlay == Some(Button::Menu) => {
                self.buttons.take(button);
                if let Some(screen) = MENU[usize::from(step)] {
                    if self.view.screen == Screen::Samples && screen != Screen::Samples {
                        self.stop_preview(sample, messages);
                    }
                    self.view.screen = screen;
                    if screen == Screen::Pool {
                        self.land_on_selection();
                    }
                }
            }
            Button::Step(step) if overlay == Some(Button::Page) => {
                self.buttons.take(button);
                let screen = self.view.screen.paged();
                if usize::from(step) < self.pages(screen).len() {
                    self.view.show_page(screen, usize::from(step));
                }
            }
            Button::Step(_) if self.buttons.is_held(Button::Shift) => self.buttons.take(button),
            Button::Up
            | Button::Down
            | Button::Left
            | Button::Right
            | Button::Ok
            | Button::Cancel
            | Button::Minus
            | Button::Plus
            | Button::Push(_)
            | Button::Roll
            | Button::PadsKeys
            | Button::Copy
                if overlay.is_some() =>
            {
                self.buttons.take(button);
            }
            Button::T1 | Button::T2 | Button::T3 | Button::T4 => {
                self.project.track = match button {
                    Button::T1 => 0,
                    Button::T2 => 1,
                    Button::T3 => 2,
                    _ => 3,
                };
                self.land_on_selection();
            }
            Button::Up | Button::Down | Button::Left | Button::Right if pads_keys => {
                self.buttons.take(button);
                let track = self.track_mut();
                match (track.mode, button) {
                    (PadMode::Keys, Button::Up) => {
                        track.octave = (track.octave + 1).min(MAX_OCTAVE)
                    }
                    (PadMode::Keys, Button::Down) => track.octave = track.octave.saturating_sub(1),
                    _ => {}
                }
            }
            Button::Up
            | Button::Down
            | Button::Left
            | Button::Right
            | Button::Minus
            | Button::Plus => self.nudge(button, sample, messages),
            Button::Ok if self.view.screen == Screen::Samples => {
                self.ok_in_samples(sample, messages);
            }
            Button::Ok if self.view.screen == Screen::Pool => self.ok_in_pool(),
            Button::Ok if self.view.screen == Screen::Step => {
                self.enter_note(self.cursor_at(sample), sample, versions, store);
            }
            Button::Ok => {
                let screen = self.view.screen;
                if let Some(&item) = self.items(screen).get(self.cursor(screen).item) {
                    self.use_item(item, sample, messages);
                }
            }
            Button::Push(encoder) => {
                if let Some(item) = self.reach(encoder) {
                    self.use_item(item, sample, messages);
                }
            }
            Button::Step(step) => {
                let place = StepCursor {
                    step: self.view.steps.step / 16 * 16 + step,
                    ..self.cursor_at(sample)
                };
                self.pressed[usize::from(step)] = place;
                self.held[usize::from(step)] = place;
            }
            Button::Cancel => self.cancel_at = self.cursor_at(sample),
            _ => {}
        }
    }

    /// An arrow, - or + at its press and at each of its repeats, which reads SHIFT anew. In the
    /// picker up, down, - and + move the highlight one row and left and right a picker page of 16
    /// rows, stopping at the ends, and on SAMPLES, in the sample picker and on POOL they move its
    /// cursor the same way by as many rows as fit (`move_in_samples`, `move_in_pool`); with SHIFT
    /// held none of them does anything there. On a page up and down move the cursor one item,
    /// stopping at the ends, and - and + move the value under it by a click, a fine one while SHIFT
    /// is held. SHIFT + an arrow does nothing outside STEP, and left and right do nothing on a page
    /// of one column. None of them gets here while MENU or PAGE is held (`press`). STEP has no
    /// page, and - and + do nothing there. Its left and right move the cursor one sixteenth, over
    /// dark cells into the next or previous bar, and with SHIFT a page of 16 cells to the same
    /// place on that page or its last sixteenth where it is shorter; a move that would leave the
    /// pattern does nothing. They start from the cursor as shown (`cursor_at`), and one into
    /// another bar stops following, the cursor keeping that bar. Its up and down select the sound
    /// of the lane a lane above or below, SHIFT 12 lanes, stopping at the first and last, as a hit
    /// of a pad selects it or as POOL selects a sound (S9).
    fn nudge(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let shift = self.buttons.is_held(Button::Shift);
        if let Some((picker, highlight)) = self.view.picker {
            match picker {
                _ if shift => {}
                Picker::Sample(_) => self.move_in_samples(button, sample, messages),
                _ => self.view.highlight(
                    picker,
                    moved(
                        button,
                        highlight.item,
                        self.picker_rows(picker) - 1,
                        LIST_VISIBLE,
                    ),
                ),
            }
            return;
        }
        let screen = self.view.screen;
        if matches!(screen, Screen::Samples | Screen::Pool) {
            match screen {
                _ if shift => {}
                Screen::Samples => self.move_in_samples(button, sample, messages),
                _ => self.move_in_pool(button),
            }
            return;
        }
        if screen == Screen::Step {
            match button {
                Button::Left | Button::Right => {
                    let signature = self.project.signature;
                    let cursor = self.cursor_at(sample);
                    let cell = cell_of(cursor, signature);
                    let total = cells(
                        self.project.patterns[usize::from(self.project.pattern)].bars,
                        signature,
                    );
                    // A page may be shorter than 16 sixteenths: its dark cells land on its last.
                    let jumped = |cell: u32| StepCursor {
                        bar: (cell / cells(1, signature)) as u16,
                        step: (cell % cells(1, signature)).min(signature.sixteenths() - 1) as u8,
                    };
                    let moved = match (button == Button::Left, shift) {
                        (true, false) => (0..cell).rev().find_map(|cell| place_of(cell, signature)),
                        (false, false) => {
                            (cell + 1..total).find_map(|cell| place_of(cell, signature))
                        }
                        (true, true) => cell.checked_sub(PAGE).map(jumped),
                        (false, true) => (cell + PAGE < total).then(|| jumped(cell + PAGE)),
                    }
                    .unwrap_or(cursor);
                    self.view.following &= moved.bar == cursor.bar;
                    self.view.steps = moved;
                }
                Button::Up | Button::Down => {
                    let by = if shift { 12 } else { 1 };
                    let lane = self.cursor_lane();
                    let lane = if button == Button::Up {
                        lane.saturating_sub(by)
                    } else {
                        (lane + by).min(self.lanes().count() - 1)
                    };
                    let lane = self
                        .lanes()
                        .nth(lane)
                        .expect("the lane is one of the lanes");
                    match lane {
                        Lane::Pad(pad) => self.track_mut().select(pad),
                        Lane::Extra(sound) => self.track_mut().select_sound(sound),
                    }
                }
                _ => {}
            }
            return;
        }
        let items = self.items(screen);
        let cursor = self.cursor(screen).item;
        match button {
            Button::Up if !shift => self.move_cursor(screen, cursor.saturating_sub(1)),
            Button::Down if !shift => {
                self.move_cursor(screen, (cursor + 1).min(items.len().saturating_sub(1)))
            }
            Button::Minus | Button::Plus => {
                if let Some(&item) = items.get(cursor) {
                    self.change(
                        item,
                        if button == Button::Plus { 1 } else { -1 },
                        sample,
                        messages,
                    );
                }
            }
            _ => {}
        }
    }

    /// OK on `item`: a switch flips. The pad's sound opens the sound picker on the pad's entry,
    /// and Copy puts a copy of the pad's sound on the pad, unless the pool is full. Engine opens
    /// the Engine picker on the sound's engine, and the Sample item the sample picker on the
    /// sound's file, or as New sample does for a missing one (S13). Length and Signature open
    /// their pickers on the current value (S10, S11). The meters only show, Grid stays (S3) and
    /// the NOTE strip's items do nothing (S12).
    fn use_item(
        &mut self,
        item: ItemDef,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        match item.kind {
            ItemKind::Param(id) => {
                if param::entry(id).curve == Curve::Switch {
                    self.set(id, i32::from(self.value(id) == 0), sample, messages);
                }
            }
            ItemKind::PadSound => {
                let row = match self.track().selected_sound {
                    // Empty.
                    None => 0,
                    Some(sound) => {
                        let index = self
                            .project
                            .pool
                            .sounds()
                            .binary_search_by_key(&sound, |in_pool| in_pool.number)
                            .expect("a selected sound is in the pool");
                        FIRST_SOUND_ROW + index
                    }
                };
                self.view.highlight(Picker::Sound, row);
                self.end_held_repeats();
            }
            ItemKind::PadCopy => {
                let track = self.track();
                let pad = track
                    .selected_pad
                    .expect("the Pad page belongs to the selected pad");
                let sound = track
                    .selected_sound
                    .expect("Copy is on the Pad page only while the pad has a sound");
                match self.project.pool.copy(sound) {
                    Ok(copy) => {
                        self.send(
                            sample,
                            MessageKind::CopySound {
                                sound: copy,
                                of: sound,
                            },
                            messages,
                        );
                        self.project.put(pad, Some(copy));
                    }
                    Err(PoolFull) => self.pool_full(),
                }
            }
            ItemKind::PadEngine => {
                let row = match self
                    .selected()
                    .expect("Engine belongs to the selected sound")
                    .engine
                {
                    Engine::Sample(_) => 0,
                    Engine::Synth => 1,
                };
                self.view.highlight(Picker::Engine, row);
                self.end_held_repeats();
            }
            ItemKind::SampleFile => {
                let on = match self
                    .selected()
                    .expect("the Sample page belongs to the selected sound")
                    .engine
                {
                    Engine::Sample(Sample::File(file)) => Some(file),
                    Engine::Sample(Sample::Missing(_)) | Engine::Synth => None,
                };
                self.open_sample_picker(Pick::Change, on);
            }
            ItemKind::Length => {
                let bars = self.project.patterns[usize::from(self.project.pattern)].bars;
                self.view.highlight(
                    Picker::Length,
                    LENGTHS
                        .iter()
                        .position(|&length| length == bars)
                        .expect("a pattern's length is one of `LENGTHS`"),
                );
                self.end_held_repeats();
            }
            ItemKind::Signature => {
                let Signature { beats, unit } = self.project.signature;
                self.view.highlight(
                    Picker::Signature,
                    usize::from(beats - 1) + if unit == 8 { 16 } else { 0 },
                );
                self.end_held_repeats();
            }
            ItemKind::LibraryMeter
            | ItemKind::NoteMeter
            | ItemKind::Grid
            | ItemKind::NotePitch
            | ItemKind::NoteVelocity
            | ItemKind::NoteLength
            | ItemKind::NotePosition => {}
        }
    }

    /// Moves the value of `item` by `clicks` clicks, fine ones while SHIFT is held. A point of the
    /// sound's file, Start, End, Loop start or Loop end, moves within the file (`moved_frame`) and
    /// stops a frame short of its partner (answer 3): Start below End and Loop start below Loop
    /// end. It stays while the audio part may not read the file (`sample_file`, S15) and when no
    /// frame is left to move to. The Pad page's items and the Sample item have no value to move,
    /// so a stray turn never changes what a pad plays, and the meters and Grid have none either.
    /// Nor do Length and Signature, so a stray turn cannot delete notes (S10). The NOTE strip's
    /// items are the held notes' values, which `turn_held` moves.
    fn change(
        &mut self,
        item: ItemDef,
        clicks: i32,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let fine = self.buttons.is_held(Button::Shift);
        match item.kind {
            ItemKind::Param(id) if param::entry(id).curve == Curve::Frame => {
                let Some(audio) = self.sample_file() else {
                    return;
                };
                let moved = param::moved_frame(self.value(id), clicks, fine, audio.frames);
                let held = if id == START.id {
                    moved.min(self.value(END.id) - 1)
                } else if id == END.id {
                    moved.max(self.value(START.id) + 1)
                } else if id == LOOP_START.id {
                    moved.min(self.value(LOOP_END.id) - 1)
                } else {
                    moved.max(self.value(LOOP_START.id) + 1)
                };
                // A file lies within the sample RAM, so its frames fit in an `i32`.
                if (0..audio.frames as i32).contains(&held) {
                    self.set(id, held, sample, messages);
                }
            }
            ItemKind::Param(id) => self.turn(id, clicks, fine, sample, messages),
            ItemKind::PadSound
            | ItemKind::PadCopy
            | ItemKind::PadEngine
            | ItemKind::SampleFile
            | ItemKind::LibraryMeter
            | ItemKind::NoteMeter
            | ItemKind::Grid
            | ItemKind::Length
            | ItemKind::Signature
            | ItemKind::NotePitch
            | ItemKind::NoteVelocity
            | ItemKind::NoteLength
            | ItemKind::NotePosition => {}
        }
    }

    /// Moves the value of the entry `id` by `clicks` clicks, fine ones when `fine`.
    fn turn(
        &mut self,
        id: ParamId,
        clicks: i32,
        fine: bool,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let value = param::moved(param::entry(id), self.value(id), clicks, fine);
        self.set(id, value, sample, messages);
    }

    /// What holds the value of the entry `id`: the device, or the selected sound of the current
    /// track. The project holds the tempo (`value`, `set`).
    fn target(&self, id: ParamId) -> Target {
        match param::entry(id).scope {
            Scope::Device => Target::Device,
            Scope::Sound => Target::Sound(
                self.track()
                    .selected_sound
                    .expect("a sound's value is on a page only while a sound is selected"),
            ),
            Scope::Project | Scope::Track => {
                unreachable!("no page shows a track value or a project value but the tempo")
            }
        }
    }

    /// The value of the entry `id`, read where its scope keeps it; the tempo, the one project value
    /// a page shows, is picked out by its id.
    fn value(&self, id: ParamId) -> i32 {
        if id == TEMPO.id {
            // At most 30,000, so it fits.
            return self.project.tempo as i32;
        }
        match self.target(id) {
            Target::Device => self.settings.get(id),
            Target::Sound(sound) => self
                .project
                .pool
                .get(sound)
                .expect("a selected sound is in the pool")
                .value(id),
        }
    }

    /// Stores `value` for the entry `id` and tells the audio part, unless the entry holds it
    /// already. The tempo sends no `SetParam`: while playing the music goes on at it from the first
    /// tick after `sample`, in both parts, and while stopped the next PLAY carries it (S2).
    fn set(
        &mut self,
        id: ParamId,
        value: i32,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if value == self.value(id) {
            return;
        }
        if id == TEMPO.id {
            // At least 3,000, so it fits.
            self.project.tempo = value as u32;
            if self.player.run().is_some() {
                let run = self.player.retimed(sample, self.project.tempo);
                self.send(sample, MessageKind::Tempo { run }, messages);
                self.player.retime(run);
            }
            return;
        }
        let target = self.target(id);
        match target {
            Target::Device => self.settings.set(id, value),
            Target::Sound(sound) => self
                .project
                .pool
                .get_mut(sound)
                .expect("a selected sound is in the pool")
                .set(id, value),
        }
        self.send(
            sample,
            MessageKind::SetParam { target, id, value },
            messages,
        );
    }

    /// The item that encoder `encoder` holds on the page the encoders use, with that page's
    /// cursor put on it where the screen shows that page: under TEMPO only on the Timing page, as
    /// elsewhere the item is not there to move to (S5). None when the encoder holds nothing there.
    fn reach(&mut self, encoder: u8) -> Option<ItemDef> {
        let items = self.encoder_items();
        let item = items
            .iter()
            .position(|item| item.encoder == Some(encoder))?;
        let screen = self.view.screen.paged();
        if items == self.items(screen) {
            self.move_cursor(screen, item);
        }
        Some(items[item])
    }

    /// The items of the page the encoders use, of which each encoder holds the one that names it:
    /// on every screen Timing's while TEMPO is held and the NOTE strip's while steps are held
    /// (`held_steps`), the first of them pressed counting, unless a picker or a question is open
    /// (S5, S12). A screen that uses SOUND's page, as STEP does, has none while the selected pad
    /// is empty.
    fn encoder_items(&self) -> &'static [ItemDef] {
        let screen = self.view.screen;
        // The slots past the held steps repeat TEMPO.
        let mut counted = [Button::Tempo; 1 + STEPS as usize];
        for (slot, (step, _)) in counted[1..].iter_mut().zip(self.held_steps()) {
            *slot = Button::Step(step);
        }
        let open = self.view.picker.is_some() || self.view.question.is_some();
        match self.buttons.first_held(&counted) {
            Some(Button::Tempo) if !open => TIMING.items,
            Some(Button::Step(_)) if !open => &NOTE,
            _ if screen.paged() != screen && self.track().selected_sound.is_none() => &[],
            _ => self.items(screen.paged()),
        }
    }

    /// Row `row` of `picker`: in the sound picker Empty, New sample, New synth, then the sounds of
    /// the pool in number order; in the Engine picker Sample, then Synth; in a Delete picker,
    /// Delete; in the Length picker the lengths of `LENGTHS`; in the Signature picker 1/4 to 16/4,
    /// then 1/8 to 16/8 (S11). The sample picker's rows are the library's (`samples::rows`).
    fn entry(&self, picker: Picker, row: usize) -> Entry<'_> {
        match (picker, row) {
            (Picker::Sound, 0) => Entry::Empty,
            (Picker::Sound, 1) => Entry::NewSample,
            (Picker::Sound, 2) => Entry::NewSynth,
            (Picker::Sound, _) => Entry::Sound(&self.project.pool.sounds()[row - FIRST_SOUND_ROW]),
            (Picker::Engine, 0) => Entry::SampleEngine,
            (Picker::Engine, _) => Entry::SynthEngine,
            (Picker::Delete(file), _) => Entry::Delete(file),
            (Picker::DeleteSound(sound), _) => Entry::DeleteSound(sound),
            (Picker::Length, _) => Entry::Change(Change::Length(LENGTHS[row])),
            // The picker's 32 rows.
            (Picker::Signature, _) => Entry::Change(Change::Signature(Signature {
                beats: row as u8 % 16 + 1,
                unit: if row < 16 { 4 } else { 8 },
            })),
            (Picker::Sample(_), _) => unreachable!("the sample picker's rows are the library's"),
        }
    }

    /// How many rows `picker` has.
    fn picker_rows(&self, picker: Picker) -> usize {
        match picker {
            Picker::Sound => FIRST_SOUND_ROW + self.project.pool.sounds().len(),
            Picker::Engine => 2,
            Picker::Sample(_) => unreachable!("the sample picker's rows are the library's"),
            Picker::Delete(_) | Picker::DeleteSound(_) => 1,
            Picker::Length => LENGTHS.len(),
            Picker::Signature => 32,
        }
    }

    /// Sends a `SetParam` for each value of `sound` that differs from `before`, in list order, and
    /// then a `SoundEngine` when its `note_engine` differs from `before_engine` (S23).
    fn send_values(
        &mut self,
        sound: SoundNumber,
        before: &[i32; SOUND_VALUES],
        before_engine: NoteEngine,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let changed = self
            .project
            .pool
            .get(sound)
            .expect("the sound is in the pool");
        let (values, engine) = (changed.values, self.note_engine(changed));
        for ((entry, value), old) in ENTRIES
            .iter()
            .filter(|entry| entry.scope == Scope::Sound)
            .zip(values)
            .zip(before)
        {
            if value != *old {
                self.send(
                    sample,
                    MessageKind::SetParam {
                        target: Target::Sound(sound),
                        id: entry.id,
                        value,
                    },
                    messages,
                );
            }
        }
        if engine != before_engine {
            self.send(sample, MessageKind::SoundEngine { sound, engine }, messages);
        }
    }

    /// Shows "Pool full" in red: New synth, New sample or Copy made nothing, as the pool holds as
    /// many sounds as it can.
    fn pool_full(&mut self) {
        self.say("Pool full", RECORD);
    }

    /// Shows `text` in `color` as the header's message, which names no file.
    fn say(&mut self, text: &str, color: Color) {
        let mut label = Label::new();
        label.push_str(text);
        self.message = Some(HeaderMessage {
            text: label,
            color,
            name: (0, 0),
        });
    }

    /// Starts the import on the files waiting once the project is open, unless it runs already.
    /// Its progress replaces the message.
    fn start_import(&mut self, sample: u64, messages: &mut Producer<'_, Message, MESSAGE_QUEUE>) {
        if self.startup.is_none() && self.import.start() {
            self.message = None;
            self.follow_import(sample, messages);
        }
    }

    /// Sends the `UseTable` or `ForgetSample` that the import asks for. Once the library lists a
    /// file, the missing sounds of its path take it (`relink`). The sounds of a file it replaced,
    /// which is unlisted already, turn missing by the new file's path, their own but for case, so
    /// that they take the new file too (S16). Moves the cursors of SAMPLES and of the sample picker
    /// from a file it replaced onto the new file. Closes the old file's Delete picker or question,
    /// as CANCEL does, so that no OK deletes the audio just dropped. Puts out its next request.
    fn follow_import(&mut self, sample: u64, messages: &mut Producer<'_, Message, MESSAGE_QUEUE>) {
        if let Some(kind) = self.import.message() {
            self.send(sample, kind, messages);
        }
        let listed = self.import.listed();
        if let Some((new, _)) = listed {
            self.relinking = Some((sample, new));
        }
        if let Some((new, Some(old))) = listed {
            self.project.pool.lose(old, self.library.path(new));
            for list in [&mut self.view.samples, &mut self.view.sample_picker] {
                if list.on == Some(samples::Row::File(old)) {
                    list.on = Some(samples::Row::File(new));
                }
            }
            if self
                .view
                .picker
                .is_some_and(|(picker, _)| picker == Picker::Delete(old))
            {
                self.view.picker = None;
                self.end_held_repeats();
            }
            if self.view.question == Some(Question::DeleteFile(old)) {
                self.view.question = None;
            }
        }
        self.put_request();
    }

    /// The first missing sound whose path is that of the file the import listed, but for case,
    /// takes the file (S16) and sends each value it changed and what its notes play
    /// (`send_values`); when none is left the relink ends. A
    /// sound whose End is 0, as its file had one frame at most or the library knew no frame count
    /// of it, takes the file's points as a sound changing its file does (`take_file`, S8). Any other keeps its points
    /// within the file: End and Loop end at most its last frame, then Start before End and Loop
    /// start before Loop end (answer 3). One sound at a time, as each sound's values may fill the
    /// room of an event.
    fn relink(&mut self, messages: &mut Producer<'_, Message, MESSAGE_QUEUE>) {
        let (sample, file) = self.relinking.expect("a relink runs");
        let path = self.library.path(file);
        let Some(number) = self
            .project
            .pool
            .sounds()
            .iter()
            .find(|sound| {
                matches!(&sound.engine, Engine::Sample(Sample::Missing(missing))
                    if name::same(missing.as_str(), path.as_str()))
            })
            .map(|sound| sound.number)
        else {
            self.relinking = None;
            return;
        };
        let audio = *self.library.file(file);
        let sound = self
            .project
            .pool
            .get_mut(number)
            .expect("a sound of the pool is in the pool");
        let before = *sound;
        if sound.value(END.id) == 0 {
            sound.take_file(file, &audio);
        } else {
            // The import lists a file loaded, so it has a frame, and its frames fit in an `i32`.
            let last = audio.frames as i32 - 1;
            for (end, start) in [(END.id, START.id), (LOOP_END.id, LOOP_START.id)] {
                let held = sound.value(end).min(last);
                sound.set(end, held);
                // `set` stops at 0 when a file of one frame leaves none before it.
                sound.set(start, sound.value(start).min(held - 1));
            }
            sound.engine = Engine::Sample(Sample::File(file));
        }
        self.send_values(
            number,
            &before.values,
            self.note_engine(&before),
            sample,
            messages,
        );
    }

    /// Puts out the next storage request unless one is out: the delete's `Delete` once its turn
    /// has come, which is at the first gap between the import's requests, and otherwise the
    /// import's request, unless the delete's waits to be taken. A converted file first settles
    /// where it goes, unless it replaces a file while a delete runs (`Import::settle`).
    fn put_request(&mut self) {
        if self.out.is_some() {
            return;
        }
        match self.delete {
            Some((file, Deleting::Turn)) => {
                self.request = Some(Request::Delete {
                    path: self.library.path(file),
                });
                self.delete = Some((file, Deleting::Reply));
            }
            Some((_, Deleting::Reply)) => {}
            _ => {
                self.import.settle(&self.library, self.delete.is_some());
                self.request = self.import.request(&self.library);
            }
        }
    }

    /// MENU or PAGE while it is held and counts: the first of them pressed.
    fn overlay(&self) -> Option<Button> {
        self.buttons.first_held(&[Button::Menu, Button::Page])
    }

    /// The tiles of MENU or PAGE while it is held.
    fn tiles(&self) -> Option<[Tile<'static>; 16]> {
        Some(match self.overlay()? {
            Button::Menu => menu_tiles(self.view.screen),
            _ => {
                let screen = self.view.screen.paged();
                page_tiles(self.pages(screen), self.shown_page(screen))
            }
        })
    }

    /// The pages of `screen` for the current track's selection (`pages`).
    fn pages(&self, screen: Screen) -> &'static [PageDef] {
        pages(screen, self.selected(), self.track().selected_pad.is_some())
    }

    /// The page `screen` shows; none on a screen without pages.
    fn page(&self, screen: Screen) -> Option<&'static PageDef> {
        self.pages(screen).get(self.shown_page(screen))
    }

    /// The page `screen` shows: the page it remembers while the screen has that page, else the
    /// first. SOUND has only its Pad page while the selected pad is empty, and shows the page it
    /// remembers again once a pad with a sound is selected.
    fn shown_page(&self, screen: Screen) -> usize {
        let remembered = self.view.page(screen);
        if remembered < self.pages(screen).len() {
            remembered
        } else {
            0
        }
    }

    /// The cursor of the page `screen` shows.
    fn cursor(&self, screen: Screen) -> Cursor {
        self.view.cursor(screen, self.shown_page(screen))
    }

    /// Puts the cursor of the page `screen` shows on item `item`.
    fn move_cursor(&mut self, screen: Screen, item: usize) {
        self.view.move_cursor(screen, self.shown_page(screen), item);
    }

    /// The items of the page `screen` shows; none on a screen without pages.
    fn items(&self, screen: Screen) -> &'static [ItemDef] {
        self.page(screen).map_or(&[], |page| page.items)
    }

    /// The bar the step buttons show at `sample`, as their lights, their taps and the header's
    /// first bar number use it (S16): while following and playing the bar playing then, or the
    /// pattern's last bar while a bar past a new shorter length plays out; otherwise the cursor's.
    fn shown_bar(&self, sample: u64) -> u16 {
        self.player
            .at(sample)
            .filter(|_| self.view.following)
            .map_or(self.view.steps.bar, |(bar, _)| {
                bar.min(self.project.patterns[usize::from(self.project.pattern)].bars - 1)
            })
    }

    /// The step cursor as shown at `sample`: the bar the step buttons show (`shown_bar`) and the
    /// cursor's sixteenth.
    fn cursor_at(&self, sample: u64) -> StepCursor {
        StepCursor {
            bar: self.shown_bar(sample),
            ..self.view.steps
        }
    }

    /// A button goes up. A tap of PADS/KEYS switches the current track's pad mode, a tap of a step
    /// enters or removes notes (`tap_step`) and a tap of TEMPO turns the metronome on or off, also
    /// while MENU or PAGE is held. A tap of CANCEL closes the picker without choosing, answers the
    /// question no or, on SAMPLES and in the sample picker, goes up (`cancel_in_samples`), and on
    /// STEP removes the notes of the cell the cursor showed at its press (`remove_notes`).
    fn release(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>,
        store: &mut Store<'_>,
    ) {
        match (button, self.buttons.release(button, sample)) {
            (Button::PadsKeys, Release::Tap) => {
                let track = self.track_mut();
                track.mode = match track.mode {
                    PadMode::Pads => PadMode::Keys,
                    PadMode::Keys => PadMode::Pads,
                };
            }
            (Button::Step(step), Release::Tap) => self.tap_step(step, sample, versions, store),
            (Button::Tempo, Release::Tap) => self.set(
                METRONOME.id,
                i32::from(self.value(METRONOME.id) == 0),
                sample,
                messages,
            ),
            (Button::Cancel, Release::Tap)
                if matches!(self.view.picker, Some((Picker::Sample(_), _))) =>
            {
                self.cancel_in_samples(sample, messages);
            }
            (Button::Cancel, Release::Tap) if self.view.picker.is_some() => {
                self.view.picker = None;
                self.end_held_repeats();
            }
            (Button::Cancel, Release::Tap) if self.view.question.is_some() => {
                self.view.question = None;
            }
            (Button::Cancel, Release::Tap) if self.view.screen == Screen::Samples => {
                self.cancel_in_samples(sample, messages);
            }
            (Button::Cancel, Release::Tap) if self.view.screen == Screen::Step => {
                self.remove_notes(self.cancel_at, sample, versions, store);
            }
            _ => {}
        }
    }

    /// Takes every held arrow, - and +, so they stop repeating and act again only after a new
    /// press. Their repeats would otherwise carry on into what changed under them: the tiles of a
    /// counted MENU or PAGE, and the sound picker as it opens or closes.
    fn end_held_repeats(&mut self) {
        for held in REPEATING {
            self.buttons.take(held);
        }
    }

    /// Sends the next message, stamped with `sample` or with the sample of its replay record
    /// (`stamped`). The control part waits for the report of a `UseTable` and of a `ForgetSample`.
    fn send(
        &mut self,
        sample: u64,
        kind: MessageKind,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let number = self.next_number;
        messages
            .push(Message {
                number,
                at: self.stamped(number, sample),
                kind,
            })
            .expect("the step leaves room for every message of an event");
        if matches!(
            kind,
            MessageKind::UseTable { .. } | MessageKind::ForgetSample { .. }
        ) {
            *self
                .awaited
                .iter_mut()
                .find(|slot| slot.is_none())
                .expect("the control part waits for at most `AWAITED` messages at a time") =
                Some((number, kind));
        }
        self.next_number += 1;
    }

    /// The sample of the replay record of the message or version `number`, or `sample` when it has
    /// none. Records of lower numbers have nothing left to stamp and are dropped.
    fn stamped(&mut self, number: u32, sample: u64) -> u64 {
        while self.replay.peek().is_some_and(|(head, _)| head < number) {
            self.replay.pop();
        }
        let record = self.replay.peek().filter(|&(head, _)| head == number);
        if record.is_some() {
            self.replay.pop();
        }
        record.map_or(sample, |(_, sample)| sample)
    }

    /// The current track.
    fn track(&self) -> &Track {
        &self.project.tracks[usize::from(self.project.track)]
    }

    fn track_mut(&mut self) -> &mut Track {
        &mut self.project.tracks[usize::from(self.project.track)]
    }

    /// The selected sound of the current track.
    fn selected(&self) -> Option<&Sound> {
        self.track().selected_sound.map(|sound| {
            self.project
                .pool
                .get(sound)
                .expect("a selected sound is in the pool")
        })
    }

    /// The selected sound's file while the audio part may read it (`playable`); none for a synth,
    /// a missing file or a file it may not read, whose waveform shows no peaks and whose points
    /// stay where they are (S15).
    fn sample_file(&self) -> Option<SampleFile> {
        match self.selected()?.engine {
            Engine::Sample(Sample::File(file)) => self.playable(file),
            Engine::Sample(Sample::Missing(_)) | Engine::Synth => None,
        }
    }
}

impl Default for Control {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests;
