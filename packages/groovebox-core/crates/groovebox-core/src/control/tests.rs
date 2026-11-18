use super::buttons::{HOLD, REPEAT_DELAY, REPEAT_EVERY};
use super::view::{menu_tiles, page_tiles};
use super::*;
use crate::input::VOLUME;
use crate::memory_storage::MemoryStorage;
use crate::message::{NoteId, Target};
use crate::palette::{ACCENT, BACKGROUND, DIM, FAINT, LINE, RECORD, TEXT};
use crate::param::{CUTOFF, OUTPUT_VOLUME};
use crate::project::pool::SoundNumber;
use crate::queue::{Consumer, Queue};
use crate::sample_ram::SampleRam;
use crate::screen::{Canvas, Color, HEIGHT, Rect, Screen, WIDTH};
use crate::storage::Status;
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::item::{Bar, ItemView, draw_cursor, draw_item};
use crate::ui::test_pixels::{filled, outlined, span};
use crate::ui::tiles::{Tile, TileState, draw_tiles};
use std::boxed::Box;
use std::vec::Vec;

mod library;
mod sample_sounds;
mod sound;

/// A control part with its own storage, I/O buffer, block tables and sample RAM. The control part
/// is copied straight onto the heap: a debug build of `Control::new()` builds it on the stack, and
/// its copies there overflow a test thread's 2 MiB.
struct Rig<'a> {
    control: Box<Control>,
    producer: Producer<'a, Message, MESSAGE_QUEUE>,
    consumer: Consumer<'a, Message, MESSAGE_QUEUE>,
    storage: MemoryStorage,
    io: Vec<u8>,
    tables: Box<Tables>,
    ram: Box<SampleRam>,
}

impl<'a> Rig<'a> {
    /// A rig whose project opened at sample 0, after a start-up on an empty storage.
    fn new(messages: &'a Queue<Message, MESSAGE_QUEUE>) -> Self {
        let mut rig = Self::with_files(messages, &[]);
        rig.open();
        rig
    }

    fn queue(&mut self, sample: u64, input: Input) {
        assert_eq!(self.control.queue_input(Stamped { sample, input }), Ok(()));
    }

    fn hit(&mut self, sample: u64, pad: u8, velocity: u8) {
        self.queue(sample, Input::PadHit { pad, velocity });
    }

    fn release(&mut self, sample: u64, pad: u8) {
        self.queue(sample, Input::PadRelease { pad });
    }

    fn press(&mut self, sample: u64, button: Button) {
        self.queue(sample, Input::ButtonPress { button });
    }

    fn let_go(&mut self, sample: u64, button: Button) {
        self.queue(sample, Input::ButtonRelease { button });
    }

    /// A press and its release one sample later.
    fn tap(&mut self, sample: u64, button: Button) {
        self.press(sample, button);
        self.let_go(sample + 1, button);
    }

    fn note_on(&mut self, sample: u64, note: u8, velocity: u8) {
        self.queue(sample, Input::NoteOn { note, velocity });
    }

    fn note_off(&mut self, sample: u64, note: u8) {
        self.queue(sample, Input::NoteOff { note });
    }

    fn turn(&mut self, sample: u64, encoder: u8, clicks: i8) {
        self.queue(sample, Input::EncoderTurn { encoder, clicks });
    }

    /// Holds MENU, taps step `step` (0 to 15) and lets go of MENU, from `sample` to 3 samples
    /// later.
    fn menu(&mut self, sample: u64, step: u8) {
        self.press(sample, Button::Menu);
        self.tap(sample + 1, Button::Step(step));
        self.let_go(sample + 3, Button::Menu);
    }

    /// Holds PAGE, taps step `step` (0 to 15) and lets go of PAGE, from `sample` to 3 samples
    /// later.
    fn page(&mut self, sample: u64, step: u8) {
        self.press(sample, Button::Page);
        self.tap(sample + 1, Button::Step(step));
        self.let_go(sample + 3, Button::Page);
    }

    fn step(&mut self, until: u64) -> bool {
        self.control.step(
            until,
            &mut self.producer,
            &mut self.io,
            &self.tables,
            &self.ram,
        )
    }

    /// Takes every message that was sent.
    fn sent(&mut self) -> Vec<Message> {
        core::iter::from_fn(|| self.consumer.pop()).collect()
    }

    fn track(&self) -> &Track {
        &self.control.project.tracks[usize::from(self.control.project.track)]
    }

    fn velocity(&self) -> i32 {
        self.control.settings.get(VELOCITY.id)
    }

    /// Makes a synth and puts it on `pad` of the current track.
    fn synth_on(&mut self, pad: u8) -> SoundNumber {
        let sound = self.control.project.pool.new_synth().unwrap();
        self.control.project.put(pad, Some(sound));
        sound
    }

    /// The bits of the lights that are on.
    fn lit(&self) -> Vec<u32> {
        let lights = self.control.lights().0;
        (0..64).filter(|bit| lights & 1 << bit != 0).collect()
    }

    /// Fills the message queue with messages that the control part did not send, until it has
    /// room for one message fewer than an event may send.
    fn fill_the_message_queue(&mut self) {
        while self.producer.free() >= MAX_MESSAGES_PER_EVENT {
            self.producer
                .push(message(u32::MAX, 0, MessageKind::StopPreview))
                .unwrap();
        }
    }
}

fn message(number: u32, at: u64, kind: MessageKind) -> Message {
    Message { number, at, kind }
}

fn note_on(note: u32, track: u8, sound: SoundNumber, pitch: u8, velocity: u8) -> MessageKind {
    MessageKind::NoteOn {
        note: NoteId(note),
        track,
        sound,
        pitch,
        velocity,
        engine: NoteEngine::Synth,
    }
}

fn note_off(note: u32) -> MessageKind {
    MessageKind::NoteOff { note: NoteId(note) }
}

fn pad(pad: u32) -> u32 {
    Lights::PAD + pad
}

fn track(track: u32) -> u32 {
    Lights::TRACK + track
}

fn step(step: u32) -> u32 {
    Lights::STEP + step
}

fn picture(control: &Control) -> Screen {
    let mut screen = Screen::new();
    control.draw(&mut screen);
    screen
}

/// The picture of these header pieces and message, what `main` draws and the strip with these
/// cells.
fn drawn(
    header: &[(&str, Color)],
    message: Option<(&str, Color)>,
    main: impl FnOnce(&mut Screen),
    strip: &[Option<ItemView>; 4],
) -> Screen {
    let pieces: Vec<Piece> = header
        .iter()
        .map(|&(text, color)| Piece { text, color })
        .collect();
    let mut screen = Screen::new();
    draw_header(
        &mut screen,
        &pieces,
        message.map(|(text, color)| Piece { text, color }),
    );
    main(&mut screen);
    draw_strip(&mut screen, strip);
    screen
}

/// Whether the control part draws `expected`.
fn shows(control: &Control, expected: &Screen) -> bool {
    picture(control).pixels() == expected.pixels()
}

/// Whether the control part draws STEP with these header pieces over an empty main area and an
/// empty strip.
fn shows_step(control: &Control, pieces: &[(&str, Color)]) -> bool {
    shows(control, &drawn(pieces, None, |_| {}, &[None; 4]))
}

/// The header of a new project on STEP, on SETTINGS and while MENU is held.
const STEP_HEADER: [(&str, Color); 4] = [("Step", ACCENT), ("T1", TEXT), ("1", DIM), ("Pads", DIM)];
const SETTINGS_HEADER: [(&str, Color); 5] = [
    ("Settings", ACCENT),
    ("Playing", TEXT),
    ("T1", TEXT),
    ("1", DIM),
    ("Pads", DIM),
];
const MENU_HEADER: [(&str, Color); 4] = [("Menu", ACCENT), ("T1", TEXT), ("1", DIM), ("Pads", DIM)];

/// Velocity as SETTINGS' Playing page and the strip show it.
fn velocity(value: &str) -> ItemView<'_> {
    ItemView {
        encoder: Some(1),
        name: "Velocity",
        value,
        bar: Bar::Track,
    }
}

/// The Pad page's first item, the pad's sound, showing `value`.
fn sound(value: &str) -> ItemView<'_> {
    ItemView {
        encoder: Some(1),
        name: "Sound",
        value,
        bar: Bar::Track,
    }
}

/// The Pad page's second item, Copy, showing `value`.
fn copy(value: &str) -> ItemView<'_> {
    ItemView {
        encoder: Some(2),
        name: "Copy",
        value,
        bar: Bar::Track,
    }
}

/// STEP's header on T1 in PADS mode with `sound` selected.
fn step_header(sound: &str) -> [(&str, Color); 4] {
    [("Step", ACCENT), ("T1", TEXT), (sound, TEXT), ("Pads", DIM)]
}

/// SETTINGS' Playing page: Velocity at `value` under the cursor and in the strip's first cell.
fn playing(value: &str) -> Screen {
    drawn(
        &SETTINGS_HEADER,
        None,
        |screen| {
            draw_item(screen, 2, 17, 160, &velocity(value), true, None);
            draw_cursor(screen, 2, 17, 160, 17);
        },
        &[Some(velocity(value)), None, None, None],
    )
}

/// The tiles of MENU or PAGE under this header, over an empty strip.
fn tiles(header: &[(&str, Color)], tiles: &[Tile; 16]) -> Screen {
    drawn(
        header,
        None,
        |screen| {
            draw_tiles(screen, tiles, 0);
        },
        &[None; 4],
    )
}

#[test]
fn a_new_project_draws_step_t1_pad_1_pads() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.step(128);

    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("1", DIM), ("Pads", DIM)]
    ));
    let screen = picture(&rig.control);
    // Each piece 6 pixels after the one before it, ink from x 4, on the capitals' rows 4 to 10.
    assert_eq!(span(&screen, 0..=479, 4..=10, ACCENT), Some((4, 26)));
    assert_eq!(span(&screen, 0..=479, 4..=10, TEXT), Some((33, 43)));
    assert_eq!(span(&screen, 0..=479, 4..=10, DIM), Some((50, 83)));
    assert!(filled(&screen, 0..=479, 14..=14, LINE));
    assert!(filled(&screen, 0..=479, 15..=252, BACKGROUND));
    assert!(filled(&screen, 0..=479, 253..=253, LINE));
    assert!(filled(&screen, 0..=479, 254..=271, BACKGROUND));
}

#[test]
fn a_hit_on_an_empty_pad_selects_it_and_sends_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.hit(10, 5, 100);
    rig.release(20, 5);

    rig.step(128);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.track().selected_pad, Some(5));
    assert_eq!(rig.track().selected_sound, None);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("6", DIM), ("Pads", DIM)]
    ));
}

#[test]
fn pads_mode_plays_the_pads_sound_at_c4_and_selects_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(2);
    rig.hit(10, 2, 90);

    rig.step(128);

    assert_eq!(rig.sent(), [message(0, 10, note_on(0, 0, syn_1, 60, 90))]);
    assert_eq!(rig.track().selected_pad, Some(2));
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    // STEP's strip shows the items of SOUND's Pad page.
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            None,
            |_| {},
            &[Some(sound("Syn 1")), Some(copy("on 1 pad")), None, None],
        )
    ));
}

#[test]
fn keys_mode_plays_the_selected_sound_at_the_keys_pitch() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    rig.hit(10, 4, 100);
    rig.release(20, 4);

    rig.step(128);

    assert_eq!(
        rig.sent(),
        [
            message(0, 10, note_on(0, 0, sound, 64, 100)),
            message(1, 20, note_off(0)),
        ]
    );
    assert_eq!(rig.track().selected_pad, Some(0));

    // T2 has no selected sound, so its keys play nothing.
    rig.tap(200, Button::T2);
    rig.tap(210, Button::PadsKeys);
    rig.hit(220, 4, 100);
    rig.release(230, 4);
    rig.step(256);

    assert_eq!(rig.track().mode, PadMode::Keys);
    assert_eq!(rig.sent(), []);
}

#[test]
fn a_release_ends_the_note_its_hit_started() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    rig.hit(10, 0, 100);
    rig.press(20, Button::PadsKeys);
    rig.tap(30, Button::Up);
    rig.let_go(40, Button::PadsKeys);
    rig.tap(50, Button::T2);
    rig.tap(60, Button::PadsKeys);
    rig.release(70, 0);

    rig.step(128);

    assert_eq!(
        rig.sent(),
        [
            message(0, 10, note_on(0, 0, sound, 60, 100)),
            message(1, 70, note_off(0)),
        ]
    );
    assert_eq!(rig.control.project.tracks[0].octave, 5);
    assert_eq!(rig.control.project.track, 1);
    assert_eq!(rig.track().mode, PadMode::Keys);
}

#[test]
fn pads_keys_taps_switch_the_mode_and_long_presses_do_not() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.press(0, Button::PadsKeys);
    rig.let_go(HOLD - 1, Button::PadsKeys);
    rig.step(HOLD);
    assert_eq!(rig.track().mode, PadMode::Keys);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("1", DIM), ("Keys C4", DIM)]
    ));

    rig.press(20_000, Button::PadsKeys);
    rig.let_go(20_000 + HOLD, Button::PadsKeys);
    rig.step(40_000);
    assert_eq!(rig.track().mode, PadMode::Keys);

    rig.tap(40_000, Button::PadsKeys);
    rig.step(40_064);
    assert_eq!(rig.track().mode, PadMode::Pads);
}

#[test]
fn a_hit_or_a_turn_spoils_the_tap_and_a_midi_note_does_not() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.press(0, Button::PadsKeys);
    rig.hit(10, 3, 100);
    rig.release(20, 3);
    rig.let_go(30, Button::PadsKeys);
    rig.press(40, Button::PadsKeys);
    rig.queue(
        50,
        Input::EncoderTurn {
            encoder: 1,
            clicks: 1,
        },
    );
    rig.let_go(60, Button::PadsKeys);
    rig.step(128);
    assert_eq!(rig.track().mode, PadMode::Pads);

    rig.press(200, Button::PadsKeys);
    rig.note_on(210, 61, 100);
    rig.note_off(220, 61);
    rig.let_go(230, Button::PadsKeys);
    rig.step(256);
    assert_eq!(rig.track().mode, PadMode::Keys);
}

#[test]
fn pads_keys_with_an_arrow_moves_the_octave_between_c0_and_c8() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::PadsKeys);

    rig.press(100, Button::PadsKeys);
    for index in 0..5 {
        rig.tap(200 + 10 * index, Button::Up);
    }
    rig.step(1_000);
    assert_eq!(rig.track().octave, 8);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("1", DIM), ("Keys C8", DIM)]
    ));
    rig.let_go(1_000, Button::PadsKeys);
    rig.step(1_024);
    assert_eq!(rig.track().mode, PadMode::Keys);

    // A held arrow is taken: it moves the octave once and does not repeat.
    rig.press(2_000, Button::PadsKeys);
    rig.press(2_010, Button::Down);
    rig.step(2_010 + 3 * REPEAT_DELAY);
    assert_eq!(rig.track().octave, 7);
    assert_eq!(rig.control.buttons.next_repeat(), None);
    rig.let_go(70_000, Button::Down);
    for index in 0..8 {
        rig.tap(70_010 + 10 * index, Button::Down);
    }
    rig.let_go(71_000, Button::PadsKeys);
    rig.step(71_008);
    assert_eq!(rig.track().octave, 0);
    assert_eq!(rig.track().mode, PadMode::Keys);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("1", DIM), ("Keys C0", DIM)]
    ));

    // In PADS mode the arrow changes nothing, and letting go still switches nothing.
    rig.tap(72_000, Button::PadsKeys);
    rig.press(72_100, Button::PadsKeys);
    rig.tap(72_200, Button::Up);
    rig.let_go(72_300, Button::PadsKeys);
    rig.step(72_320);
    assert_eq!(rig.track().mode, PadMode::Pads);
    assert_eq!(rig.track().octave, 0);
}

#[test]
fn left_and_right_under_pads_keys_are_taken_and_still_count_as_used() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::PadsKeys);

    // Held left and right do nothing and do not repeat, also once PADS/KEYS is let go.
    rig.press(100, Button::PadsKeys);
    rig.press(110, Button::Left);
    rig.press(120, Button::Right);
    rig.let_go(1_000, Button::PadsKeys);
    rig.step(120 + 3 * REPEAT_DELAY);
    assert_eq!(rig.control.buttons.next_repeat(), None);
    assert_eq!(rig.track().octave, 4);
    assert_eq!(rig.track().mode, PadMode::Keys);
    rig.let_go(70_000, Button::Left);
    rig.let_go(70_000, Button::Right);

    // A short PADS/KEYS with left or right tapped under it switches no mode.
    for (sample, button) in [(80_000, Button::Left), (90_000, Button::Right)] {
        rig.press(sample, Button::PadsKeys);
        rig.tap(sample + 10, button);
        rig.let_go(sample + 20, Button::PadsKeys);
        rig.step(sample + 30);
        assert_eq!(rig.track().mode, PadMode::Keys, "{button:?}");
    }
}

#[test]
fn each_track_keeps_its_mode_octave_and_selection() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.hit(0, 3, 100);
    rig.release(1, 3);
    rig.tap(10, Button::PadsKeys);
    rig.press(20, Button::PadsKeys);
    rig.tap(30, Button::Up);
    rig.let_go(40, Button::PadsKeys);
    rig.tap(50, Button::T2);
    rig.hit(60, 7, 100);
    rig.release(61, 7);
    rig.step(128);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T2", TEXT), ("8", DIM), ("Pads", DIM)]
    ));
    assert_eq!(rig.lit(), [pad(7), track(1)]);

    rig.tap(200, Button::T1);
    rig.step(256);

    assert_eq!(rig.track().selected_pad, Some(3));
    assert_eq!(rig.track().mode, PadMode::Keys);
    assert_eq!(rig.track().octave, 5);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("4", DIM), ("Keys C5", DIM)]
    ));
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);
    for (number, track) in rig.control.project.tracks.iter().enumerate().skip(2) {
        assert_eq!(*track, Track::new(), "track {number}");
    }
}

#[test]
fn shift_with_a_track_button_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Shift);
    rig.tap(10, Button::T3);
    rig.let_go(20, Button::Shift);
    rig.step(128);
    assert_eq!(rig.control.project.track, 0);
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    rig.tap(200, Button::T3);
    rig.step(256);
    assert_eq!(rig.control.project.track, 2);
    assert_eq!(rig.lit(), [pad(0), track(2)]);
}

#[test]
fn a_second_press_of_a_held_button_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Shift);
    rig.press(10, Button::T2);
    rig.let_go(20, Button::Shift);
    rig.press(30, Button::T2);
    rig.step(128);
    assert_eq!(rig.control.project.track, 0);

    rig.let_go(200, Button::T2);
    rig.press(210, Button::T2);
    rig.step(256);
    assert_eq!(rig.control.project.track, 1);
}

#[test]
fn velocity_off_plays_every_hit_at_127() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.hit(0, 0, 40);
    rig.release(10, 0);
    rig.step(128);
    rig.control.settings.set(VELOCITY.id, 0);
    rig.hit(200, 0, 40);
    rig.release(210, 0);
    rig.note_on(220, 60, 1);

    rig.step(256);

    assert_eq!(
        rig.sent(),
        [
            message(0, 0, note_on(0, 0, sound, 60, 40)),
            message(1, 10, note_off(0)),
            message(2, 200, note_on(1, 0, sound, 60, 127)),
            message(3, 210, note_off(1)),
            message(4, 220, note_on(2, 0, sound, 60, 127)),
        ]
    );
}

#[test]
fn midi_notes_fold_onto_pads_in_pads_mode() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.hit(0, 5, 100);
    rig.release(1, 5);
    rig.note_on(10, 48, 100);
    rig.note_on(20, 60, 90);
    rig.step(128);
    assert_eq!(
        rig.sent(),
        [
            message(0, 10, note_on(0, 0, sound, 60, 100)),
            message(1, 20, note_on(1, 0, sound, 60, 90)),
        ]
    );
    assert_eq!(rig.track().selected_pad, Some(0));

    rig.hit(200, 5, 100);
    rig.release(201, 5);
    rig.step(256);
    assert_eq!(rig.lit(), [pad(0), pad(5), track(0)]);

    rig.note_off(300, 48);
    rig.step(384);
    assert_eq!(rig.sent(), [message(2, 300, note_off(0))]);
    assert_eq!(rig.lit(), [pad(0), pad(5), track(0)]);

    rig.note_off(400, 60);
    rig.step(512);
    assert_eq!(rig.sent(), [message(3, 400, note_off(1))]);
    assert_eq!(rig.lit(), [pad(5), track(0)]);
}

#[test]
fn midi_notes_play_their_own_pitch_in_keys_mode() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    rig.note_on(10, 40, 100);
    rig.step(128);
    assert_eq!(rig.sent(), [message(0, 10, note_on(0, 0, sound, 40, 100))]);
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);
    assert_eq!(rig.track().octave, 4);

    rig.note_on(200, 11, 100);
    rig.note_on(210, 120, 100);
    rig.note_off(220, 11);
    rig.note_off(230, 120);
    rig.step(256);
    assert_eq!(rig.sent(), []);

    rig.note_on(300, 64, 80);
    rig.step(384);
    assert_eq!(rig.sent(), [message(1, 300, note_on(1, 0, sound, 64, 80))]);
    assert_eq!(rig.lit(), [pad(0), pad(4), track(0), Lights::PADS_KEYS]);

    rig.note_off(400, 40);
    rig.note_off(410, 64);
    rig.step(512);
    assert_eq!(
        rig.sent(),
        [message(2, 400, note_off(0)), message(3, 410, note_off(1))]
    );
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);
    assert_eq!(rig.track().selected_pad, Some(0));
}

#[test]
fn a_source_with_a_note_on_starts_no_second_note() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.hit(0, 0, 100);
    rig.hit(10, 3, 100);
    rig.hit(20, 0, 90);
    rig.note_on(30, 60, 100);
    rig.note_on(40, 60, 70);
    rig.step(128);
    assert_eq!(
        rig.sent(),
        [
            message(0, 0, note_on(0, 0, sound, 60, 100)),
            message(1, 30, note_on(1, 0, sound, 60, 100)),
        ]
    );
    // The second hit still selects.
    assert_eq!(rig.track().selected_pad, Some(0));

    rig.release(200, 0);
    rig.note_off(210, 60);
    rig.release(220, 0);
    rig.note_off(230, 60);
    rig.step(256);
    assert_eq!(
        rig.sent(),
        [message(2, 200, note_off(0)), message(3, 210, note_off(1))]
    );
}

#[test]
fn keys_hits_and_accepted_midi_notes_are_the_last_key_played() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.hit(0, 4, 100);
    rig.release(1, 4);
    rig.note_on(10, 62, 100);
    rig.note_off(11, 62);
    rig.step(128);
    assert_eq!(rig.track().last_key, None);

    // A key plays nothing without a selected sound, and still counts.
    rig.tap(200, Button::PadsKeys);
    rig.hit(210, 4, 100);
    rig.release(211, 4);
    rig.step(256);
    assert_eq!(rig.track().last_key, Some(64));

    rig.note_on(300, 40, 100);
    rig.note_off(301, 40);
    rig.note_on(310, 11, 100);
    rig.note_off(311, 11);
    rig.note_on(320, 120, 100);
    rig.note_off(321, 120);
    rig.step(384);
    assert_eq!(rig.track().last_key, Some(40));
    assert_eq!(rig.control.project.tracks[1].last_key, None);
}

#[test]
fn the_lights_follow_answer_9() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(2);
    rig.step(128);
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    // PADS mode: the selected pad and the pads with a note on.
    rig.hit(200, 2, 100);
    rig.hit(210, 6, 100);
    rig.step(256);
    assert_eq!(rig.lit(), [pad(2), pad(6), track(0)]);
    rig.release(300, 2);
    rig.release(310, 6);
    rig.hit(320, 2, 100);
    rig.release(330, 2);
    rig.step(384);
    assert_eq!(rig.lit(), [pad(2), track(0)]);

    // KEYS mode: pad 1 and the keys of the shown octave with a note on.
    rig.tap(400, Button::PadsKeys);
    rig.hit(410, 3, 100);
    rig.step(512);
    assert_eq!(rig.lit(), [pad(0), pad(3), track(0), Lights::PADS_KEYS]);
    // A pad stays lit from its hit to its release, also when the octave moves away from its key.
    // A MIDI note lights the key that plays it in the shown octave.
    rig.press(600, Button::PadsKeys);
    rig.tap(610, Button::Up);
    rig.let_go(620, Button::PadsKeys);
    rig.step(640);
    assert_eq!(rig.lit(), [pad(0), pad(3), track(0), Lights::PADS_KEYS]);
    rig.note_on(700, 77, 100);
    rig.step(768);
    assert_eq!(
        rig.lit(),
        [pad(0), pad(3), pad(5), track(0), Lights::PADS_KEYS]
    );

    // On another track the held pad stays lit, and the MIDI note of T1 lights nothing.
    rig.tap(800, Button::T2);
    rig.step(896);
    assert_eq!(rig.lit(), [pad(0), pad(3), track(1)]);
    rig.release(900, 3);
    rig.note_off(910, 77);
    rig.tap(920, Button::T1);
    rig.step(1_024);
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);
}

#[test]
fn a_held_pad_stays_lit_when_the_mode_switches() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(2);

    // A pad hit in PADS mode stays lit in KEYS mode until it is let go.
    rig.hit(100, 2, 100);
    rig.tap(200, Button::PadsKeys);
    rig.step(256);
    assert_eq!(rig.lit(), [pad(0), pad(2), track(0), Lights::PADS_KEYS]);
    rig.release(300, 2);
    rig.step(384);
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);

    // A key hit in KEYS mode stays lit in PADS mode until it is let go.
    rig.hit(400, 4, 100);
    rig.tap(500, Button::PadsKeys);
    rig.step(512);
    assert_eq!(rig.lit(), [pad(2), pad(4), track(0)]);
    rig.release(600, 4);
    rig.step(640);
    assert_eq!(rig.lit(), [pad(2), track(0)]);
}

#[test]
fn an_event_waits_while_the_message_queue_is_full() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.fill_the_message_queue();
    rig.hit(1_000, 0, 80);
    rig.tap(1_010, Button::T2);

    assert!(!rig.step(u64::MAX));
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    rig.consumer.pop();
    assert!(rig.step(u64::MAX));
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    rig.consumer.pop();
    assert!(rig.step(u64::MAX));
    assert_eq!(rig.lit(), [pad(0), track(1)]);
    let sent = rig.sent();
    assert_eq!(sent.len(), MESSAGE_QUEUE - MAX_MESSAGES_PER_EVENT);
    assert_eq!(
        sent.last(),
        Some(&message(0, 1_000, note_on(0, 0, sound, 60, 80)))
    );
}

#[test]
fn a_stalled_step_keeps_the_replay_record_of_the_message_it_waits_to_send() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.fill_the_message_queue();
    assert_eq!(rig.control.replay_applied(0, 9_000), Ok(()));
    rig.hit(1_000, 0, 90);

    rig.step(u64::MAX);
    rig.sent();
    rig.step(u64::MAX);

    assert_eq!(
        rig.sent(),
        [message(0, 9_000, note_on(0, 0, sound, 60, 90))]
    );
}

#[test]
fn replay_records_still_set_the_message_sample() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    assert_eq!(rig.control.replay_applied(0, 512), Ok(()));
    assert_eq!(rig.control.replay_applied(2, 900), Ok(()));
    rig.hit(100, 0, 127);
    rig.release(200, 0);
    rig.hit(300, 0, 127);

    rig.step(512);

    assert_eq!(
        rig.sent(),
        [
            message(0, 512, note_on(0, 0, sound, 60, 127)),
            message(1, 200, note_off(0)),
            message(2, 900, note_on(1, 0, sound, 60, 127)),
        ]
    );
}

#[test]
fn replay_record_of_a_message_already_sent_is_dropped() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.hit(10, 0, 127);
    rig.step(128);
    assert_eq!(rig.control.replay_applied(0, 999), Ok(()));
    assert_eq!(rig.control.replay_applied(1, 700), Ok(()));
    rig.release(200, 0);

    rig.step(256);

    assert_eq!(
        rig.sent(),
        [
            message(0, 10, note_on(0, 0, sound, 60, 127)),
            message(1, 700, note_off(0)),
        ]
    );
}

#[test]
fn replay_queue_refuses_when_full() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    for number in 0..REPLAY_QUEUE as u32 {
        assert_eq!(rig.control.replay_applied(number, 0), Ok(()));
    }

    assert_eq!(
        rig.control.replay_applied(REPLAY_QUEUE as u32, 5),
        Err((REPLAY_QUEUE as u32, 5))
    );
}

#[test]
fn input_queue_refuses_when_full_and_accepts_after_a_step() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    for sample in 0..INPUT_QUEUE as u64 {
        rig.hit(sample, (sample % 12) as u8, 100);
    }
    let refused = Stamped {
        sample: 64,
        input: Input::PadRelease { pad: 0 },
    };
    assert_eq!(rig.control.queue_input(refused), Err(refused));

    rig.step(u64::MAX);

    assert_eq!(
        rig.track().selected_pad,
        Some(((INPUT_QUEUE - 1) % 12) as u8)
    );
    assert_eq!(rig.control.queue_input(refused), Ok(()));
}

#[test]
fn step_handles_only_inputs_stamped_before_until() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.hit(200, 0, 127);

    rig.step(128);
    assert_eq!(rig.sent(), []);
    rig.step(200);
    assert_eq!(rig.sent(), []);
    rig.step(256);

    assert_eq!(rig.sent(), [message(0, 200, note_on(0, 0, sound, 60, 127))]);
}

#[test]
fn held_arrows_repeat_at_their_own_samples_and_do_nothing_on_step() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.step(128);
    rig.press(1_000, Button::Up);

    assert!(rig.step(50_000));

    // The repeats at 20_200, 22_600 and so on up to 49_000 were made.
    let next = 1_000 + REPEAT_DELAY + 13 * REPEAT_EVERY;
    assert_eq!(rig.control.buttons.next_repeat(), Some((next, Button::Up)));
    assert_eq!(rig.sent(), []);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("1", DIM), ("Pads", DIM)]
    ));
    assert!(!rig.step(next));
    assert!(rig.step(next + 1));
    rig.let_go(next + REPEAT_EVERY, Button::Up);
    rig.step(next + 3 * REPEAT_EVERY);
    assert_eq!(rig.control.buttons.next_repeat(), None);
}

#[test]
fn step_redraws_on_the_first_step_and_after_an_event() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &[]);

    assert!(rig.step(128));
    assert!(!rig.step(128));

    rig.release(130, 3);
    assert!(rig.step(256));
    assert!(!rig.step(256));

    rig.queue(300, Input::ChannelPressure { pressure: 40 });
    assert!(rig.step(384));
    assert!(!rig.step(512));
}

#[test]
fn nothing_redraws_on_time_alone_when_nothing_scrolls() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.step(128);
    picture(&rig.control);

    for until in (256..=200_064).step_by(128) {
        assert!(!rig.step(until), "step to {until}");
    }
}

#[test]
fn a_frame_does_not_depend_on_what_the_canvas_held_before() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(4);
    rig.hit(0, 4, 100);
    rig.step(1);
    let mut used = Screen::new();
    let (width, height) = (WIDTH as u32, HEIGHT as u32);
    used.fill_rect(
        Rect {
            x: 0,
            y: 0,
            width,
            height,
        },
        Color(99),
    );

    rig.control.draw(&mut used);

    assert_eq!(used.pixels(), picture(&rig.control).pixels());
}

#[test]
fn menu_with_step_8_shows_settings_at_the_steps_press() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Menu);
    rig.press(100, Button::Step(7));

    rig.step(100);
    assert!(shows(
        &rig.control,
        &tiles(&MENU_HEADER, &menu_tiles(view::Screen::Step))
    ));
    assert_eq!(
        rig.lit(),
        [pad(0), step(0), step(2), step(7), step(9), track(0)]
    );

    rig.step(101);
    assert_eq!(rig.control.view.screen, view::Screen::Settings);
    assert!(shows(
        &rig.control,
        &tiles(&MENU_HEADER, &menu_tiles(view::Screen::Settings))
    ));
    assert_eq!(
        rig.lit(),
        [pad(0), step(0), step(2), step(7), step(9), track(0)]
    );

    rig.let_go(200, Button::Step(7));
    rig.let_go(300, Button::Menu);
    rig.step(301);
    assert!(shows(&rig.control, &playing("On")));
    assert_eq!(rig.lit(), [pad(0), track(0)]);
}

#[test]
fn the_step_pressed_under_menu_does_nothing_when_let_go() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Menu);
    rig.press(100, Button::Step(7));
    rig.let_go(200, Button::Menu);
    rig.step(201);
    // The step is still held, and its press was taken.
    assert!(rig.control.buttons.is_held(Button::Step(7)));
    assert_eq!(rig.control.buttons.first_held(&[Button::Step(7)]), None);
    let before = picture(&rig.control);

    rig.let_go(300, Button::Step(7));
    assert!(rig.step(400));

    assert!(!rig.control.buttons.is_held(Button::Step(7)));
    assert_eq!(rig.control.view.screen, view::Screen::Settings);
    assert!(shows(&rig.control, &before));
    assert_eq!(rig.lit(), [pad(0), track(0)]);
    assert_eq!(rig.sent(), []);
}

#[test]
fn menu_let_go_alone_changes_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::Menu);
    rig.press(100, Button::Menu);
    rig.let_go(100 + HOLD, Button::Menu);

    rig.step(20_000);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert!(shows_step(&rig.control, &STEP_HEADER));
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    rig.menu(20_000, 7);
    rig.tap(20_100, Button::Menu);
    rig.step(20_200);
    assert!(shows(&rig.control, &playing("On")));
}

#[test]
fn a_dark_step_under_menu_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // Step 2 is ROLL's, which does not exist yet.
    rig.press(0, Button::Menu);
    rig.press(100, Button::Step(1));

    rig.step(101);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert!(shows(
        &rig.control,
        &tiles(&MENU_HEADER, &menu_tiles(view::Screen::Step))
    ));
    assert_eq!(rig.control.buttons.first_held(&[Button::Step(1)]), None);

    rig.let_go(200, Button::Step(1));
    rig.let_go(300, Button::Menu);
    rig.step(301);
    assert!(shows_step(&rig.control, &STEP_HEADER));
}

#[test]
fn the_first_of_menu_and_page_counts() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    // PAGE first: MENU is dropped, and step 8 is dark under PAGE on STEP, which shows SOUND's one
    // page. The header stays STEP's and only step 1 is lit.
    rig.press(0, Button::Page);
    rig.press(10, Button::Menu);
    rig.press(20, Button::Step(7));
    rig.step(21);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert!(shows(
        &rig.control,
        &tiles(
            &STEP_HEADER,
            &page_tiles(pages(view::Screen::Sound, rig.track()), 0)
        )
    ));
    assert_eq!(rig.lit(), [pad(0), step(0), track(0)]);

    // Letting go of PAGE leaves the MENU that is still held without effect.
    rig.let_go(30, Button::Step(7));
    rig.let_go(40, Button::Page);
    rig.tap(50, Button::Step(7));
    rig.step(60);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert!(shows_step(&rig.control, &STEP_HEADER));

    // A new press of MENU counts, and PAGE pressed after it is dropped.
    rig.let_go(70, Button::Menu);
    rig.press(80, Button::Menu);
    rig.press(90, Button::Page);
    rig.press(100, Button::Step(7));
    rig.step(101);
    assert_eq!(rig.control.view.screen, view::Screen::Settings);
    assert!(shows(
        &rig.control,
        &tiles(&MENU_HEADER, &menu_tiles(view::Screen::Settings))
    ));

    rig.let_go(110, Button::Step(7));
    rig.let_go(120, Button::Menu);
    rig.step(121);
    assert!(shows(&rig.control, &playing("On")));
}

#[test]
fn under_menu_pads_play_and_select_and_the_rest_is_dropped() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(2);
    rig.menu(0, 7);
    rig.press(100, Button::Menu);
    rig.hit(110, 2, 100);
    rig.release(120, 2);
    rig.press(130, Button::Down);
    rig.press(140, Button::Ok);
    rig.press(150, Button::Minus);
    rig.turn(160, 0, -1);
    rig.tap(170, Button::Push(0));
    rig.tap(180, Button::T2);

    rig.step(200);
    assert_eq!(
        rig.sent(),
        [
            message(0, 110, note_on(0, 0, sound, 60, 100)),
            message(1, 120, note_off(0)),
        ]
    );
    assert_eq!(rig.control.project.tracks[0].selected_pad, Some(2));
    // T1 to T4 act as usual.
    assert_eq!(rig.control.project.track, 1);
    assert_eq!(rig.velocity(), 1);

    // After MENU is let go the dropped presses still neither act nor repeat.
    rig.let_go(300, Button::Menu);
    rig.let_go(400, Button::Ok);
    let later = 150 + 3 * REPEAT_DELAY;
    rig.step(later);
    assert_eq!(rig.control.buttons.next_repeat(), None);
    rig.let_go(later, Button::Down);
    rig.let_go(later, Button::Minus);
    rig.step(later + 20);
    assert_eq!(rig.velocity(), 1);
    assert_eq!(rig.control.view.screen, view::Screen::Settings);
    assert_eq!(
        rig.control.cursor(view::Screen::Settings),
        view::Cursor { item: 0, scroll: 0 }
    );
}

#[test]
fn page_on_settings_shows_playing_and_dev_and_lights_steps_1_and_2() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 7);
    rig.press(100, Button::Page);
    rig.step(101);

    let shown = page_tiles(pages(view::Screen::Settings, rig.track()), 0);
    assert_eq!(
        shown[..2],
        [
            Tile {
                name: Some("Playing"),
                state: TileState::Current
            },
            Tile {
                name: Some("Dev"),
                state: TileState::Exists
            }
        ]
    );
    assert!(shown[2..].iter().all(|tile| tile.state == TileState::Empty));
    // The header stays as it is.
    assert!(shows(&rig.control, &tiles(&SETTINGS_HEADER, &shown)));
    assert!(outlined(&picture(&rig.control), 1, 16, 118, 58, ACCENT));
    assert_eq!(rig.lit(), [pad(0), step(0), step(1), track(0)]);

    // Step 1 shows the page that is shown already, and step 3 is dark.
    rig.tap(110, Button::Step(0));
    rig.tap(120, Button::Step(2));
    rig.step(130);
    assert_eq!(rig.control.view.page(view::Screen::Settings), 0);
    assert!(shows(&rig.control, &tiles(&SETTINGS_HEADER, &shown)));

    rig.let_go(200, Button::Page);
    rig.step(201);
    assert!(shows(&rig.control, &playing("On")));
    assert_eq!(rig.lit(), [pad(0), track(0)]);
}

#[test]
fn velocity_flips_with_ok_and_moves_with_minus_plus_and_encoder_1() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 7);
    rig.step(10);
    assert_eq!(rig.velocity(), 1);

    rig.tap(100, Button::Ok);
    rig.step(110);
    assert_eq!(rig.velocity(), 0);
    rig.tap(200, Button::Plus);
    rig.step(210);
    assert_eq!(rig.velocity(), 1);
    rig.tap(300, Button::Plus);
    rig.step(310);
    assert_eq!(rig.velocity(), 1);
    rig.turn(400, 0, -1);
    rig.step(410);
    assert_eq!(rig.velocity(), 0);
    assert!(shows(&rig.control, &playing("Off")));

    // CANCEL does nothing on a page, and neither does an encoder that holds no item.
    rig.tap(500, Button::Cancel);
    rig.turn(510, 1, 5);
    rig.tap(520, Button::Push(3));
    rig.turn(530, VOLUME, 5);
    rig.step(540);
    assert_eq!(rig.velocity(), 0);

    // With SHIFT held a counted value still moves a whole click.
    rig.press(600, Button::Shift);
    rig.turn(610, 0, 1);
    rig.step(620);
    assert_eq!(rig.velocity(), 1);
    rig.tap(620, Button::Minus);
    rig.step(630);
    assert_eq!(rig.velocity(), 0);
}

#[test]
fn shift_with_ok_or_an_encoder_push_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 7);
    rig.press(100, Button::Shift);
    rig.tap(110, Button::Ok);
    rig.step(120);
    assert_eq!(rig.velocity(), 1);
    rig.tap(120, Button::Push(0));
    rig.step(130);
    assert_eq!(rig.velocity(), 1);

    // Without SHIFT a push is OK on its encoder's item.
    rig.let_go(200, Button::Shift);
    rig.tap(210, Button::Push(0));
    rig.step(220);
    assert_eq!(rig.velocity(), 0);
}

#[test]
fn menu_or_page_ends_the_repeats_of_held_arrows_minus_and_plus() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 7);
    // - turns Velocity off at its press and OK on again. MENU takes the held down and -, so
    // neither repeats once MENU is let go.
    rig.press(1_000, Button::Down);
    rig.press(1_000, Button::Minus);
    rig.tap(2_000, Button::Ok);
    rig.tap(3_000, Button::Menu);
    rig.step(100_000);
    assert_eq!(rig.velocity(), 1);
    assert_eq!(rig.control.buttons.next_repeat(), None);

    // Their releases do nothing, and a new press acts again.
    rig.let_go(100_000, Button::Down);
    rig.let_go(100_000, Button::Minus);
    rig.press(100_010, Button::Minus);
    rig.step(100_020);
    assert_eq!(rig.velocity(), 0);
    assert_eq!(
        rig.control.buttons.next_repeat(),
        Some((100_010 + REPEAT_DELAY, Button::Minus))
    );
    rig.let_go(100_020, Button::Minus);

    // + turns it on at its press and OK off again. PAGE takes the held down and +.
    rig.press(200_000, Button::Down);
    rig.press(200_000, Button::Plus);
    rig.tap(201_000, Button::Ok);
    rig.tap(202_000, Button::Page);
    rig.step(300_000);
    assert_eq!(rig.velocity(), 0);
    assert_eq!(rig.control.buttons.next_repeat(), None);
}

#[test]
fn a_message_stays_until_a_later_button_press() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let mut text = Label::new();
    text.push_str("Pool full");
    rig.menu(0, 7);
    rig.press(90, Button::Shift);
    rig.press(100, Button::Plus);
    rig.step(101);
    // The press at 100 shows a message, as New synth on a full pool does.
    rig.control.message = Some(HeaderMessage {
        text,
        color: RECORD,
        name: (0, 0),
    });

    // Releases, a second press of a held button, pads, MIDI notes, turns and the volume keep it.
    rig.let_go(110, Button::Plus);
    rig.press(120, Button::Shift);
    rig.let_go(130, Button::Shift);
    rig.hit(140, 4, 100);
    rig.release(150, 4);
    rig.turn(160, 0, -1);
    rig.note_on(170, 60, 100);
    rig.note_off(180, 60);
    rig.turn(190, VOLUME, 3);
    rig.step(200);
    assert_eq!(rig.velocity(), 0);
    assert!(shows(
        &rig.control,
        &drawn(
            &SETTINGS_HEADER,
            Some(("Pool full", RECORD)),
            |screen| {
                draw_item(screen, 2, 17, 160, &velocity("Off"), true, None);
                draw_cursor(screen, 2, 17, 160, 17);
            },
            &[Some(velocity("Off")), None, None, None],
        )
    ));

    // A later press clears it and still acts.
    rig.tap(200, Button::Ok);
    rig.step(300);
    assert_eq!(rig.control.message, None);
    assert_eq!(rig.velocity(), 1);
    assert!(shows(&rig.control, &playing("On")));
}

#[test]
fn the_settings_page_matches_its_geometry() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 7);
    rig.step(10);
    let screen = picture(&rig.control);

    assert!(shows(&rig.control, &playing("On")));
    // The header: "Settings" from x 4, then "Playing" and "T1", then the dim "1" and "Pads".
    assert_eq!(span(&screen, 0..=479, 1..=13, ACCENT), Some((4, 50)));
    assert_eq!(span(&screen, 0..=479, 1..=13, TEXT), Some((57, 114)));
    assert_eq!(span(&screen, 0..=479, 1..=13, DIM), Some((121, 154)));
    // Item 1 at (2, 17): the dim digit and name, the value ending 3 pixels inside, the faint
    // track and the cursor 1 pixel outside.
    assert_eq!(span(&screen, 2..=15, 17..=29, DIM), Some((5, 9)));
    assert_eq!(span(&screen, 10..=100, 17..=29, DIM).map(|s| s.0), Some(16));
    assert_eq!(span(&screen, 2..=161, 17..=29, TEXT), Some((148, 158)));
    assert!(filled(&screen, 5..=158, 31..=32, FAINT));
    assert!(outlined(&screen, 1, 16, 162, 19, ACCENT));
    assert!(filled(&screen, 0..=479, 36..=252, BACKGROUND));
    // Strip cell 1: the name from x 4, the value ending at 117 and the faint track under them.
    assert_eq!(span(&screen, 1..=120, 258..=264, DIM).map(|s| s.0), Some(4));
    assert_eq!(span(&screen, 1..=120, 258..=264, TEXT), Some((107, 117)));
    assert!(filled(&screen, 4..=117, 269..=270, FAINT));
    assert!(filled(&screen, 121..=478, 254..=271, BACKGROUND));
}

#[test]
fn a_release_at_the_sample_of_a_repeat_comes_before_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 7);
    // - turns Velocity off at its press and at each repeat, and OK turns it on in between.
    rig.press(1_000, Button::Minus);
    rig.tap(2_000, Button::Ok);
    rig.let_go(1_000 + REPEAT_DELAY, Button::Minus);
    rig.step(50_000);
    assert_eq!(rig.velocity(), 1);

    // A sample later the repeat comes first.
    rig.press(50_000, Button::Minus);
    rig.tap(51_000, Button::Ok);
    rig.let_go(50_000 + REPEAT_DELAY + 1, Button::Minus);
    rig.step(100_000);
    assert_eq!(rig.velocity(), 0);
}

#[test]
fn new_synth_and_copy_tell_the_audio_part() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Down);
    rig.tap(25, Button::Down);
    rig.tap(30, Button::Ok);
    rig.step(40);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            30,
            MessageKind::NewSound {
                sound: SoundNumber(1)
            }
        )]
    );

    // Copy on the Pad page.
    rig.tap(50, Button::Down);
    rig.tap(60, Button::Ok);
    rig.step(70);
    assert_eq!(
        rig.sent(),
        [message(
            1,
            60,
            MessageKind::CopySound {
                sound: SoundNumber(2),
                of: SoundNumber(1)
            }
        )]
    );

    // A full pool refuses both New synth and Copy, and sends nothing.
    for _ in 2..1_024 {
        rig.control.project.pool.new_synth().unwrap();
    }
    rig.tap(80, Button::Ok);
    rig.tap(90, Button::Up);
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Up);
    rig.tap(120, Button::Up);
    rig.tap(130, Button::Ok);
    rig.step(140);
    assert_eq!(rig.control.project.pool.sounds().len(), 1_024);
    assert_eq!(
        rig.control.message.map(|message| message.color),
        Some(RECORD)
    );
    assert_eq!(rig.sent(), []);
}

#[test]
fn a_turn_changes_the_selected_sound_and_sends_its_value() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    let item = ItemDef {
        kind: ItemKind::Param(CUTOFF.id),
        encoder: None,
    };

    rig.control.change(item, -10, 4_800, &mut rig.producer);

    assert_eq!(
        rig.control
            .project
            .pool
            .get(sound)
            .unwrap()
            .value(CUTOFF.id),
        60_415
    );
    assert_eq!(
        rig.sent(),
        [message(
            0,
            4_800,
            MessageKind::SetParam {
                target: Target::Sound(sound),
                id: CUTOFF.id,
                value: 60_415
            }
        )]
    );
}

#[test]
fn a_value_at_its_end_sends_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    let item = ItemDef {
        kind: ItemKind::Param(CUTOFF.id),
        encoder: None,
    };

    rig.control.change(item, 1, 100, &mut rig.producer);

    assert_eq!(
        rig.control
            .project
            .pool
            .get(sound)
            .unwrap()
            .value(CUTOFF.id),
        65_535
    );
    assert_eq!(rig.sent(), []);
}

fn volume(value: i32) -> MessageKind {
    MessageKind::SetParam {
        target: Target::Device,
        id: OUTPUT_VOLUME.id,
        value,
    }
}

#[test]
fn the_volume_encoder_sets_the_output_volume_everywhere() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 2);
    // With SHIFT held the click stays whole.
    rig.press(10, Button::Shift);
    rig.turn(20, VOLUME, -3);
    rig.let_go(30, Button::Shift);
    // Under MENU.
    rig.press(40, Button::Menu);
    rig.turn(50, VOLUME, -3);
    rig.let_go(60, Button::Menu);
    // With the sound picker open.
    rig.tap(70, Button::Ok);
    rig.turn(80, VOLUME, -3);
    rig.step(100);

    assert!(rig.control.view.picker.is_some());
    assert_eq!(
        rig.sent(),
        [
            message(0, 20, volume(45_875 - 1_536)),
            message(1, 50, volume(45_875 - 2 * 1_536)),
            message(2, 80, volume(45_875 - 3 * 1_536)),
        ]
    );
    assert_eq!(
        rig.control.settings.get(OUTPUT_VOLUME.id),
        45_875 - 3 * 1_536
    );
}

/// A reply to request `number` with nothing to report.
fn done(number: u32) -> Reply {
    Reply {
        number,
        status: Status::Done,
        value: 0,
    }
}

#[test]
fn a_request_is_given_once_and_the_next_waits_for_its_reply() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.request = Some(Request::Free);

    // The start-up sent requests 0 and 1.
    assert_eq!(rig.control.take_request(), Some((2, Request::Free)));
    assert_eq!(rig.control.take_request(), None);

    rig.control.request = Some(Request::Commit);
    assert_eq!(rig.control.take_request(), None);
    // A reply to another request changes nothing.
    assert_eq!(rig.control.queue_reply(100, done(3)), Ok(()));
    assert_eq!(rig.control.queue_reply(200, done(2)), Ok(()));
    rig.step(200);
    assert_eq!(rig.control.take_request(), None);
    rig.step(201);
    assert_eq!(rig.control.take_request(), Some((3, Request::Commit)));
    assert_eq!(rig.control.take_request(), None);
}

#[test]
fn a_reply_goes_before_an_input_of_the_same_sample() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.control.request = Some(Request::Free);
    // The start-up sent requests 0 and 1.
    assert_eq!(rig.control.take_request(), Some((2, Request::Free)));
    rig.control.request = Some(Request::Commit);
    rig.fill_the_message_queue();
    // Room for one event only: an event after the hit waits.
    rig.consumer.pop();
    rig.hit(1_000, 0, 80);
    assert_eq!(rig.control.queue_reply(1_000, done(2)), Ok(()));

    rig.step(u64::MAX);

    assert_eq!(rig.control.take_request(), Some((3, Request::Commit)));
    assert_eq!(
        rig.sent().last(),
        Some(&message(0, 1_000, note_on(0, 0, sound, 60, 80)))
    );
}

#[test]
fn the_control_part_hears_when_its_awaited_message_applied() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.hit(10, 0, 100);
    rig.step(64);
    rig.control
        .send(64, MessageKind::UseTable { version: 1 }, &mut rig.producer);
    let awaited = Some((1, MessageKind::UseTable { version: 1 }));
    assert!(rig.control.awaited.contains(&awaited));

    // The hit's report is not awaited, so it is no event at 32.
    rig.control.applied(0, 32);
    rig.control.applied(1, 96);
    assert!(!rig.step(96));
    assert!(rig.control.awaited.contains(&awaited));

    assert!(rig.step(97));
    assert!(!rig.control.awaited.contains(&awaited));
}
