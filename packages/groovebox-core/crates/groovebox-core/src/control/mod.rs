pub mod buttons;
mod draw;
pub mod notes;
pub mod pages;
pub mod view;

use crate::input::{Button, Input, PADS, Stamped};
use crate::label::Label;
use crate::lights::Lights;
use crate::message::{MAX_MESSAGES_PER_EVENT, MESSAGE_QUEUE, Message, MessageKind};
use crate::param::{self, Curve, VELOCITY};
use crate::project::Project;
use crate::project::settings::DeviceSettings;
use crate::project::track::{MAX_OCTAVE, PadMode, Track};
use crate::queue::Producer;
use crate::ring::Ring;
use crate::screen::Color;
use crate::ui::tiles::{Tile, TileState};
use buttons::{Buttons, Release};
use notes::{Notes, Source};
use pages::{ItemDef, ItemKind, MENU, PageDef, pages};
use view::{Screen, View, menu_tiles, page_tiles};

pub const INPUT_QUEUE: usize = 64;
pub const REPLAY_QUEUE: usize = 64;

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
    /// The message on the right of the header, its colour and the sample it was shown at. A later
    /// button press clears it (`press`).
    message: Option<(Label<32>, Color, u64)>,
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
            if let Some(stamped) = input {
                self.inputs.pop();
                self.input(stamped, messages);
            } else if let Some((_, button)) = repeat {
                // Each repeat makes the same move as the press.
                self.nudge(button);
                self.buttons.repeated(button);
            } else {
                break;
            }
            redraw = true;
        }
        redraw
    }

    /// The lights as the state of the control part has them.
    ///
    /// The pads show the current track. In PADS mode the selected pad is lit and so is every pad
    /// with a note on that was hit as that pad. In KEYS mode pad 1, the C, is lit and so is every
    /// pad whose pitch in the current octave has a note on. T1 to T4 light the current track and
    /// PADS/KEYS lights in KEYS mode. While MENU or PAGE is held, the steps of the screens or pages
    /// that exist light: the steps whose tiles are not empty.
    pub fn lights(&self) -> Lights {
        let track = self.track();
        let notes = self
            .notes
            .on()
            .filter(|note| note.track == self.project.track);
        let mut lights = Lights(0);
        lights.light(Lights::TRACK + u32::from(self.project.track));
        match track.mode {
            PadMode::Pads => {
                for pad in track
                    .selected_pad
                    .into_iter()
                    .chain(notes.filter_map(|note| note.pad))
                {
                    lights.light(Lights::PAD + u32::from(pad));
                }
            }
            PadMode::Keys => {
                lights.light(Lights::PADS_KEYS);
                lights.light(Lights::PAD);
                let c = track.key_pitch(0);
                for note in notes.filter(|note| (c..c + PADS).contains(&note.pitch)) {
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
            Input::ButtonPress { button } => self.press(button, sample),
            Input::ButtonRelease { button } => self.release(button, sample),
            Input::EncoderTurn { encoder, clicks } => {
                self.buttons.used();
                // Under MENU or PAGE a turn is dropped.
                if self.overlay().is_none()
                    && let Some(item) = self.reach(encoder)
                {
                    self.change(item, i32::from(clicks));
                }
            }
            Input::NoteOn { .. }
            | Input::PadPressure { .. }
            | Input::NotePressure { .. }
            | Input::ChannelPressure { .. } => {}
        }
    }

    /// A hit from `source`. In PADS mode it hits `pad`: it selects the pad and its sound and plays
    /// that sound at C4, where a synth sounds unchanged. In KEYS mode it is the key of the pitch
    /// `key`: that becomes the last key played, and it plays the selected sound at that pitch. With
    /// no sound it plays nothing, and neither does a source that has a note on already.
    fn hit(
        &mut self,
        source: Source,
        pad: u8,
        key: u8,
        velocity: u8,
        sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>,
    ) {
        let track = self.track_mut();
        let (pad, pitch) = match track.mode {
            PadMode::Pads => {
                track.select(pad);
                (Some(pad), 60)
            }
            PadMode::Keys => {
                track.last_key = Some(key);
                (None, key)
            }
        };
        let Some(sound) = track.selected_sound else {
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
    /// - Of MENU and PAGE the first one pressed counts, and the other is taken. While it is held,
    ///   a step shows its screen or page, and a dark step does nothing. The arrows, OK, CANCEL, -
    ///   and +, the encoder pushes, ROLL, PADS/KEYS and COPY are dropped, and so taken too.
    /// - T1 to T4 select the track; with SHIFT held they do nothing until muting comes with the
    ///   sequencer, and neither do OK and the encoder pushes.
    /// - PADS/KEYS held + up or down moves the octave in KEYS mode, stopping at C0 and C8, and in
    ///   PADS mode does nothing.
    ///
    /// Otherwise the arrows, - and + nudge (`nudge`), OK uses the item under the cursor and an
    /// encoder push the item its encoder holds.
    fn press(&mut self, button: Button, sample: u64) {
        if self.buttons.is_held(button) {
            return;
        }
        self.message = None;
        self.buttons.press(button, sample);
        let overlay = self.overlay();
        match button {
            Button::Menu | Button::Page if overlay != Some(button) => self.buttons.take(button),
            Button::Step(step) if overlay == Some(Button::Menu) => {
                self.buttons.take(button);
                if let Some(screen) = MENU[usize::from(step)] {
                    self.view.screen = screen;
                }
            }
            Button::Step(step) if overlay == Some(Button::Page) => {
                self.buttons.take(button);
                let screen = self.view.screen.paged();
                if usize::from(step) < pages(screen).len() {
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
            Button::T1 | Button::T2 | Button::T3 | Button::T4 | Button::Ok | Button::Push(_)
                if self.buttons.is_held(Button::Shift) =>
            {
                self.buttons.take(button);
            }
            Button::T1 => self.project.track = 0,
            Button::T2 => self.project.track = 1,
            Button::T3 => self.project.track = 2,
            Button::T4 => self.project.track = 3,
            Button::Up | Button::Down if self.buttons.first_held(&[Button::PadsKeys]).is_some() => {
                self.buttons.take(button);
                let track = self.track_mut();
                if track.mode == PadMode::Keys {
                    track.octave = match button {
                        Button::Up => (track.octave + 1).min(MAX_OCTAVE),
                        _ => track.octave.saturating_sub(1),
                    };
                }
            }
            Button::Up
            | Button::Down
            | Button::Left
            | Button::Right
            | Button::Minus
            | Button::Plus => self.nudge(button),
            Button::Ok => {
                let screen = self.view.screen;
                if let Some(&item) = self.items(screen).get(self.view.cursor(screen).item) {
                    self.use_item(item);
                }
            }
            Button::Push(encoder) => {
                if let Some(item) = self.reach(encoder) {
                    self.use_item(item);
                }
            }
            _ => {}
        }
    }

    /// An arrow, - or + at its press and at each of its repeats, which reads SHIFT anew. On a page
    /// up and down move the cursor one item, stopping at the ends, and - and + move the value
    /// under it by a click, a fine one while SHIFT is held. SHIFT + an arrow does nothing outside
    /// STEP, left and right do nothing on a page of one column, and under MENU or PAGE none of
    /// them does anything. STEP has no page, and its own arrows, - and + come with the sequencer.
    fn nudge(&mut self, button: Button) {
        if self.overlay().is_some() {
            return;
        }
        let screen = self.view.screen;
        let items = self.items(screen);
        let cursor = self.view.cursor(screen).item;
        let shift = self.buttons.is_held(Button::Shift);
        match button {
            Button::Up if !shift => self.view.move_cursor(screen, cursor.saturating_sub(1)),
            Button::Down if !shift => self
                .view
                .move_cursor(screen, (cursor + 1).min(items.len().saturating_sub(1))),
            Button::Minus | Button::Plus => {
                if let Some(&item) = items.get(cursor) {
                    self.change(item, if button == Button::Plus { 1 } else { -1 });
                }
            }
            _ => {}
        }
    }

    /// OK on `item`: a switch flips.
    fn use_item(&mut self, item: ItemDef) {
        match item.kind {
            ItemKind::Param(id) => match param::entry(id).curve {
                Curve::Switch => self.settings.set(id, i32::from(self.settings.get(id) == 0)),
            },
        }
    }

    /// Moves the value of `item` by `clicks` clicks, fine ones while SHIFT is held.
    fn change(&mut self, item: ItemDef, clicks: i32) {
        match item.kind {
            ItemKind::Param(id) => self.settings.set(
                id,
                param::moved(
                    param::entry(id),
                    self.settings.get(id),
                    clicks,
                    self.buttons.is_held(Button::Shift),
                ),
            ),
        }
    }

    /// The item that encoder `encoder` holds on the page the encoders use, with that page's
    /// cursor put on it; none when the encoder holds nothing there.
    fn reach(&mut self, encoder: u8) -> Option<ItemDef> {
        let screen = self.view.screen.paged();
        let items = self.items(screen);
        let item = items
            .iter()
            .position(|item| item.encoder == Some(encoder))?;
        self.view.move_cursor(screen, item);
        Some(items[item])
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
                page_tiles(pages(screen), self.view.page(screen))
            }
        })
    }

    /// The page `screen` shows; none on a screen without pages.
    fn page(&self, screen: Screen) -> Option<&'static PageDef> {
        pages(screen).get(self.view.page(screen))
    }

    /// The items of the page `screen` shows; none on a screen without pages.
    fn items(&self, screen: Screen) -> &'static [ItemDef] {
        self.page(screen).map_or(&[], |page| page.items)
    }

    /// A button goes up. A tap of PADS/KEYS switches the current track's pad mode.
    fn release(&mut self, button: Button, sample: u64) {
        if let (Button::PadsKeys, Release::Tap) = (button, self.buttons.release(button, sample)) {
            let track = self.track_mut();
            track.mode = match track.mode {
                PadMode::Pads => PadMode::Keys,
                PadMode::Keys => PadMode::Pads,
            };
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
