pub mod buttons;
mod draw;
pub mod notes;
pub mod pages;
pub mod view;

use crate::input::{Button, Input, PADS, Stamped, VOLUME};
use crate::label::Label;
use crate::lights::Lights;
use crate::message::{MAX_MESSAGES_PER_EVENT, MESSAGE_QUEUE, Message, MessageKind, Target};
use crate::palette::RECORD;
use crate::param::{self, Curve, OUTPUT_VOLUME, ParamId, Scope, VELOCITY};
use crate::project::Project;
use crate::project::pool::{PoolFull, Sound, SoundNumber};
use crate::project::settings::DeviceSettings;
use crate::project::track::{MAX_OCTAVE, PadMode, Track};
use crate::queue::Producer;
use crate::ring::Ring;
use crate::screen::Color;
use crate::ui::layout::LIST_VISIBLE;
use crate::ui::tiles::{Tile, TileState};
use buttons::{Buttons, REPEATING, Release};
use notes::{Notes, Source};
use pages::{ItemDef, ItemKind, MENU, PageDef, pages};
use view::{Cursor, Screen, View, menu_tiles, page_tiles};

pub const INPUT_QUEUE: usize = 64;
pub const REPLAY_QUEUE: usize = 64;

/// The sound picker's first row of a sound of the pool, after Empty and New synth.
const FIRST_SOUND_ROW: usize = 2;

/// What a row of the sound picker chooses.
enum Entry<'a> {
    /// Empties the pad.
    Empty,
    /// Puts a new synth on the pad.
    NewSynth,
    /// Puts this sound of the pool on the pad.
    Sound(&'a Sound),
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
    /// The highlighted row of the sound picker while it is open.
    picker: Option<usize>,
    track: u8,
    pad: Option<u8>,
    sound: Option<SoundNumber>,
}

/// The control part: it turns stamped inputs into numbered messages for the audio part. It keeps
/// the project, the device settings, the held buttons, the notes that are on, what the screen
/// shows and the header's message, works out the lights and draws the picture.
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
    started: bool,
    project: Project,
    settings: DeviceSettings,
    buttons: Buttons,
    notes: Notes,
    view: View,
    /// The message on the right of the header and its colour. A later button press clears it
    /// (`press`).
    message: Option<(Label<32>, Color)>,
    /// The `until` of the latest step.
    now: u64,
    /// The sample of the event after which the cursor last landed on something new: the text
    /// under it scrolls from there.
    landed: u64,
    /// What the cursor was on after the latest event; none before the first.
    focus: Option<Focus>,
}

impl Control {
    pub const fn new() -> Self {
        Self {
            inputs: Ring::new(),
            replay: Ring::new(),
            next_number: 0,
            started: false,
            project: Project::new(),
            settings: DeviceSettings::new(),
            buttons: Buttons::new(),
            notes: Notes::new(),
            view: View::new(),
            message: None,
            now: 0,
            landed: 0,
            focus: None,
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

    /// Handles the events before `until` in sample order, the queued inputs and the repeats of
    /// held buttons, and returns whether the screen must be redrawn. That is the case on the first
    /// step and whenever it handled an event.
    ///
    /// On equal samples the input goes first, so a release at the sample of a repeat ends the
    /// hold before it. An event is handled only while the message queue has room for
    /// `MAX_MESSAGES_PER_EVENT` messages. Otherwise the step stops before it and leaves it and
    /// every later event for a later step, which goes on exactly where this one stopped.
    ///
    /// After each event every page's cursor is kept on an item that the page shows: a cursor whose
    /// item vanished moves to the nearest item above, where it stays when the item comes back. When
    /// the cursor has then landed on something new (`Focus`), the text under it scrolls from that
    /// event's sample.
    pub fn step(
        &mut self,
        until: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) -> bool {
        let mut redraw = !core::mem::replace(&mut self.started, true);
        while messages.free() >= MAX_MESSAGES_PER_EVENT {
            let repeat = self
                .buttons
                .next_repeat()
                .filter(|&(sample, _)| sample < until);
            let input = self.inputs.peek().filter(|stamped| {
                stamped.sample < until && repeat.is_none_or(|(sample, _)| stamped.sample <= sample)
            });
            let sample = if let Some(stamped) = input {
                self.inputs.pop();
                self.input(stamped, messages);
                stamped.sample
            } else if let Some((sample, button)) = repeat {
                // Each repeat makes the same move as the press.
                self.nudge(button, sample, messages);
                self.buttons.repeated(button);
                sample
            } else {
                break;
            };
            for screen in Screen::ALL {
                for (page, def) in pages(screen, self.track()).iter().enumerate() {
                    self.view.keep_cursor(screen, page, def.items.len());
                }
            }
            let paged = self.view.screen.paged();
            let track = self.track();
            let focus = Some(Focus {
                overlay: self.overlay(),
                screen: self.view.screen,
                page: self.shown_page(paged),
                item: self.cursor(paged).item,
                picker: self.view.picker.map(|picker| picker.item),
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
        self.now = until;
        redraw
    }

    /// The lights as the state of the control part has them.
    ///
    /// A pad is lit from its own hit to its release, whatever changes meanwhile: the mode, the
    /// octave or the track. Otherwise the pads show the current track. In PADS mode the selected
    /// pad is lit and so is every pad a MIDI note on was hit as. In KEYS mode pad 1, the C, is lit
    /// and so is every pad whose pitch in the current octave has a MIDI note on. T1 to T4 light the
    /// current track and PADS/KEYS lights in KEYS mode. While MENU or PAGE is held, the steps of
    /// the screens or pages that exist light: the steps whose tiles are not empty.
    pub fn lights(&self) -> Lights {
        let track = self.track();
        let midi = self
            .notes
            .midi()
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
                {
                    lights.light(Lights::PAD + u32::from(pad));
                }
            }
            PadMode::Keys => {
                lights.light(Lights::PADS_KEYS);
                lights.light(Lights::PAD);
                let c = track.key_pitch(0);
                for note in midi.filter(|note| (c..c + PADS).contains(&note.pitch)) {
                    lights.light(Lights::PAD + u32::from(note.pitch - c));
                }
            }
        }
        for (step, tile) in self.tiles().iter().flatten().enumerate() {
            if tile.state != TileState::Empty {
                lights.light(Lights::STEP + step as u32);
            }
        }
        lights
    }

    /// Handles one input. Every input reaches its action here.
    fn input(
        &mut self,
        Stamped { sample, input }: Stamped,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
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
                );
            }
            Input::PadRelease { pad } => self.end(Source::Pad(pad), sample, messages),
            Input::NoteOff { note } => self.end(Source::Midi(note), sample, messages),
            Input::ButtonPress { button } => self.press(button, sample, messages),
            Input::ButtonRelease { button } => self.release(button, sample),
            Input::EncoderTurn { encoder, clicks } => {
                self.buttons.used();
                // Under MENU or PAGE and while the picker is open a turn of encoders 1 to 4 is
                // dropped. The volume acts as usual there, and SHIFT does not make its click fine.
                if encoder == VOLUME {
                    self.turn(OUTPUT_VOLUME.id, i32::from(clicks), false, sample, messages);
                } else if self.overlay().is_none()
                    && self.view.picker.is_none()
                    && let Some(item) = self.reach(encoder)
                {
                    self.change(item, i32::from(clicks), sample, messages);
                }
            }
            Input::NoteOn { .. }
            | Input::PadPressure { .. }
            | Input::NotePressure { .. }
            | Input::ChannelPressure { .. } => {}
        }
    }

    /// A hit from `source`. In PADS mode it hits `pad`: it plays the pad's sound at C4, where a
    /// synth sounds unchanged, and selects the pad and its sound unless the picker is open, as a
    /// new selection would change the pad the picker is for. In KEYS mode it is the key of the
    /// pitch `key`: that becomes the last key played, and it plays the selected sound at that
    /// pitch. With no sound it plays nothing, and neither does a source that has a note on
    /// already.
    fn hit(
        &mut self,
        source: Source,
        pad: u8,
        key: u8,
        velocity: u8,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let picker = self.view.picker.is_some();
        let track = self.track_mut();
        let (pad, pitch, sound) = match track.mode {
            PadMode::Pads => {
                if !picker {
                    track.select(pad);
                }
                (Some(pad), 60, track.pads[usize::from(pad)])
            }
            PadMode::Keys => {
                track.last_key = Some(key);
                (None, key, track.selected_sound)
            }
        };
        let Some(sound) = sound else {
            return;
        };
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
            },
            messages,
        );
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
    ///   nothing. The arrows, OK, CANCEL, - and +, the encoder pushes, ROLL, PADS/KEYS and COPY
    ///   are dropped, and so taken too.
    /// - T1 to T4 select the track. With SHIFT held they do nothing until muting comes with the
    ///   sequencer.
    /// - SHIFT + OK and SHIFT + an encoder push do nothing.
    /// - PADS/KEYS held + up or down moves the octave in KEYS mode, stopping at C0 and C8, and in
    ///   PADS mode does nothing. PADS/KEYS held + left or right does nothing. Each arrow under
    ///   PADS/KEYS is taken, so it does not repeat, and like any press it still counts as another
    ///   control used.
    ///
    /// While the sound picker is open the controls act on it. The arrows, - and + move its
    /// highlight (`nudge`), OK chooses the highlighted row and closes it, and a tap of CANCEL
    /// closes it (`release`). PLAY, STOP, REC and SHIFT + T1 to T4 act as usual. T1 to T4, MENU,
    /// PAGE, ROLL, PADS/KEYS, TEMPO, COPY, the steps and the encoder pushes are dropped: they are
    /// taken, so they act neither now nor when they are let go, and the picker stays open. Every
    /// other combination does nothing there either: an arrow, - or + pressed while SHIFT or
    /// PADS/KEYS is held, even a PADS/KEYS dropped by the picker, is taken at its press, so it
    /// neither moves the highlight nor repeats, also once SHIFT or PADS/KEYS is let go. Opening
    /// and closing the picker take the arrows, - and + that are held, as a counted MENU or PAGE
    /// does (`end_held_repeats`).
    ///
    /// Otherwise the arrows, - and + nudge (`nudge`), OK uses the item under the cursor and an
    /// encoder push the item its encoder holds.
    fn press(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        if self.buttons.is_held(button) {
            return;
        }
        self.message = None;
        self.buttons.press(button, sample);
        let overlay = self.overlay();
        let picker = self.view.picker.is_some();
        let pads_keys = self.buttons.first_held(&[Button::PadsKeys]).is_some();
        match button {
            Button::T1 | Button::T2 | Button::T3 | Button::T4 | Button::Ok | Button::Push(_)
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
                if picker
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
            Button::Ok if let Some(highlight) = self.view.picker => {
                self.view.picker = None;
                self.end_held_repeats();
                let pad = self
                    .track()
                    .selected_pad
                    .expect("the sound picker belongs to the selected pad");
                let sound = match self.entry(highlight.item) {
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
                if picker =>
            {
                self.buttons.take(button);
            }
            Button::Menu | Button::Page if overlay != Some(button) => self.buttons.take(button),
            Button::Menu | Button::Page => self.end_held_repeats(),
            Button::Step(step) if overlay == Some(Button::Menu) => {
                self.buttons.take(button);
                if let Some(screen) = MENU[usize::from(step)] {
                    self.view.screen = screen;
                }
            }
            Button::Step(step) if overlay == Some(Button::Page) => {
                self.buttons.take(button);
                let screen = self.view.screen.paged();
                if usize::from(step) < pages(screen, self.track()).len() {
                    self.view.show_page(screen, usize::from(step));
                }
            }
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
            Button::T1 => self.project.track = 0,
            Button::T2 => self.project.track = 1,
            Button::T3 => self.project.track = 2,
            Button::T4 => self.project.track = 3,
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
            _ => {}
        }
    }

    /// An arrow, - or + at its press and at each of its repeats, which reads SHIFT anew. In the
    /// picker up, down, - and + move the highlight one row and left and right a picker page of 16
    /// rows, stopping at the ends, and with SHIFT held none of them does anything. On a page up
    /// and down move the cursor one item, stopping at the ends, and - and + move the value under
    /// it by a click, a fine one while SHIFT is held. SHIFT + an arrow does nothing outside STEP,
    /// and left and right do nothing on a page of one column. None of them gets here while MENU or
    /// PAGE is held (`press`). STEP has no page, and its own arrows, - and + come with the
    /// sequencer.
    fn nudge(
        &mut self,
        button: Button,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let shift = self.buttons.is_held(Button::Shift);
        if let Some(picker) = self.view.picker {
            let (row, last) = (picker.item, self.picker_rows() - 1);
            self.view.highlight(match (button, shift) {
                (Button::Up | Button::Minus, false) => row.saturating_sub(1),
                (Button::Down | Button::Plus, false) => (row + 1).min(last),
                (Button::Left, false) => row.saturating_sub(LIST_VISIBLE),
                (Button::Right, false) => (row + LIST_VISIBLE).min(last),
                _ => return,
            });
            return;
        }
        let screen = self.view.screen;
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
    /// and Copy puts a copy of the pad's sound on the pad, unless the pool is full.
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
                self.view.highlight(row);
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
        }
    }

    /// Moves the value of `item` by `clicks` clicks, fine ones while SHIFT is held. The Pad page's
    /// items have no value to move, so a stray turn never changes what a pad plays.
    fn change(
        &mut self,
        item: ItemDef,
        clicks: i32,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        match item.kind {
            ItemKind::Param(id) => self.turn(
                id,
                clicks,
                self.buttons.is_held(Button::Shift),
                sample,
                messages,
            ),
            ItemKind::PadSound | ItemKind::PadCopy => {}
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
    /// track.
    fn target(&self, id: ParamId) -> Target {
        match param::entry(id).scope {
            Scope::Device => Target::Device,
            Scope::Sound => Target::Sound(
                self.track()
                    .selected_sound
                    .expect("a sound's value is on a page only while the pad has a sound"),
            ),
            Scope::Project | Scope::Track => unreachable!("no page shows a project or track value"),
        }
    }

    /// The value of the entry `id`, read where its scope keeps it.
    fn value(&self, id: ParamId) -> i32 {
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
    /// already.
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
    /// cursor put on it; none when the encoder holds nothing there.
    fn reach(&mut self, encoder: u8) -> Option<ItemDef> {
        let items = self.encoder_items();
        let item = items
            .iter()
            .position(|item| item.encoder == Some(encoder))?;
        self.move_cursor(self.view.screen.paged(), item);
        Some(items[item])
    }

    /// The items of the page the encoders use, of which each encoder holds the one that names it.
    /// A screen that uses SOUND's page, as STEP does, has none while the selected pad is empty.
    fn encoder_items(&self) -> &'static [ItemDef] {
        let screen = self.view.screen;
        if screen.paged() != screen && self.track().selected_sound.is_none() {
            &[]
        } else {
            self.items(screen.paged())
        }
    }

    /// Row `row` of the sound picker: Empty, New synth, then the sounds of the pool in number
    /// order.
    fn entry(&self, row: usize) -> Entry<'_> {
        match row {
            0 => Entry::Empty,
            1 => Entry::NewSynth,
            _ => Entry::Sound(&self.project.pool.sounds()[row - FIRST_SOUND_ROW]),
        }
    }

    /// How many rows the sound picker has.
    fn picker_rows(&self) -> usize {
        FIRST_SOUND_ROW + self.project.pool.sounds().len()
    }

    /// Shows "Pool full" in red: New synth or Copy made nothing, as the pool holds as many sounds
    /// as it can.
    fn pool_full(&mut self) {
        let mut text = Label::new();
        text.push_str("Pool full");
        self.message = Some((text, RECORD));
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
                page_tiles(pages(screen, self.track()), self.shown_page(screen))
            }
        })
    }

    /// The page `screen` shows; none on a screen without pages.
    fn page(&self, screen: Screen) -> Option<&'static PageDef> {
        pages(screen, self.track()).get(self.shown_page(screen))
    }

    /// The page `screen` shows: the page it remembers while the screen has that page, else the
    /// first. SOUND has only its Pad page while the selected pad is empty, and shows the page it
    /// remembers again once a pad with a sound is selected.
    fn shown_page(&self, screen: Screen) -> usize {
        let remembered = self.view.page(screen);
        if remembered < pages(screen, self.track()).len() {
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

    /// A button goes up. A tap of PADS/KEYS switches the current track's pad mode, and a tap of
    /// CANCEL closes the picker without choosing.
    fn release(&mut self, button: Button, sample: u64) {
        match (button, self.buttons.release(button, sample)) {
            (Button::PadsKeys, Release::Tap) => {
                let track = self.track_mut();
                track.mode = match track.mode {
                    PadMode::Pads => PadMode::Keys,
                    PadMode::Keys => PadMode::Pads,
                };
            }
            (Button::Cancel, Release::Tap) if self.view.picker.is_some() => {
                self.view.picker = None;
                self.end_held_repeats();
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

    /// Sends the next message, stamped with `sample` or with the sample of its replay record.
    fn send(
        &mut self,
        sample: u64,
        kind: MessageKind,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let number = self.next_number;
        while self.replay.peek().is_some_and(|(head, _)| head < number) {
            self.replay.pop();
        }
        let record = self.replay.peek().filter(|&(head, _)| head == number);
        if record.is_some() {
            self.replay.pop();
        }
        messages
            .push(Message {
                number,
                at: record.map_or(sample, |(_, sample)| sample),
                kind,
            })
            .expect("the step leaves room for every message of an event");
        self.next_number += 1;
    }

    /// The current track.
    fn track(&self) -> &Track {
        &self.project.tracks[usize::from(self.project.track)]
    }

    fn track_mut(&mut self) -> &mut Track {
        &mut self.project.tracks[usize::from(self.project.track)]
    }
}

impl Default for Control {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, not(feature = "loom")))]
mod tests;
