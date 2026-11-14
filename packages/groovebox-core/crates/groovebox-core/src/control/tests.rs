use super::buttons::{HOLD, REPEAT_DELAY, REPEAT_EVERY};
use super::*;
use crate::message::NoteId;
use crate::palette::{ACCENT, BACKGROUND, DIM, LINE, TEXT};
use crate::project::pool::SoundNumber;
use crate::queue::{Consumer, Queue};
use crate::screen::{Canvas, Color, HEIGHT, Rect, Screen, WIDTH};
use crate::ui::frame::{Piece, draw_header, draw_strip};
use crate::ui::test_pixels::{filled, span};
use std::vec::Vec;

struct Rig<'a> {
    control: Control,
    producer: Producer<'a, Message, MESSAGE_QUEUE>,
    consumer: Consumer<'a, Message, MESSAGE_QUEUE>,
}

impl<'a> Rig<'a> {
    #[allow(unsafe_code)]
    fn new(messages: &'a Queue<Message, MESSAGE_QUEUE>) -> Self {
        // SAFETY: each rig takes one producer and one consumer from its own queue.
        unsafe {
            Self {
                control: Control::new(),
                producer: messages.producer(),
                consumer: messages.consumer(),
            }
        }
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

    fn step(&mut self, until: u64) -> bool {
        self.control.step(until, &mut self.producer)
    }

    /// Takes every message that was sent.
    fn sent(&mut self) -> Vec<Message> {
        core::iter::from_fn(|| self.consumer.pop()).collect()
    }

    fn track(&self) -> &Track {
        &self.control.project.tracks[usize::from(self.control.project.track)]
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

    /// Sends `MESSAGE_QUEUE` messages by hitting and releasing pad 1, which must hold a sound,
    /// and leaves them in the queue.
    fn fill_the_message_queue(&mut self) {
        for round in 0..MESSAGE_QUEUE / INPUT_QUEUE {
            for pair in 0..INPUT_QUEUE / 2 {
                let sample = (round * INPUT_QUEUE + 2 * pair) as u64;
                self.hit(sample, 0, 100);
                self.release(sample + 1, 0);
            }
            self.step(u64::MAX);
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

fn picture(control: &Control) -> Screen {
    let mut screen = Screen::new();
    control.draw(&mut screen);
    screen
}

/// Whether the control part draws STEP with these header pieces over an empty main area and an
/// empty strip.
fn shows_step(control: &Control, pieces: &[(&str, Color)]) -> bool {
    let pieces: Vec<Piece> = pieces
        .iter()
        .map(|&(text, color)| Piece { text, color })
        .collect();
    let mut expected = Screen::new();
    draw_header(&mut expected, &pieces, None);
    draw_strip(&mut expected, &[None; 4]);
    picture(control).pixels() == expected.pixels()
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
    let sound = rig.synth_on(2);
    rig.hit(10, 2, 90);

    rig.step(128);

    assert_eq!(rig.sent(), [message(0, 10, note_on(0, 0, sound, 60, 90))]);
    assert_eq!(rig.track().selected_pad, Some(2));
    assert_eq!(rig.track().selected_sound, Some(sound));
    assert!(shows_step(
        &rig.control,
        &[
            ("Step", ACCENT),
            ("T1", TEXT),
            ("Syn 1", TEXT),
            ("Pads", DIM)
        ]
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
    rig.press(600, Button::PadsKeys);
    rig.tap(610, Button::Up);
    rig.let_go(620, Button::PadsKeys);
    rig.step(640);
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);
    rig.note_on(700, 75, 100);
    rig.step(768);
    assert_eq!(rig.lit(), [pad(0), pad(3), track(0), Lights::PADS_KEYS]);

    // Another track's notes light nothing.
    rig.tap(800, Button::T2);
    rig.step(896);
    assert_eq!(rig.lit(), [pad(0), track(1)]);
    rig.release(900, 3);
    rig.note_off(910, 75);
    rig.tap(920, Button::T1);
    rig.step(1_024);
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PADS_KEYS]);
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
    assert_eq!(sent.len(), MESSAGE_QUEUE - 1);
    assert_eq!(
        sent.last(),
        Some(&message(256, 1_000, note_on(128, 0, sound, 60, 80)))
    );
}

#[test]
fn a_stalled_step_keeps_the_replay_record_of_the_message_it_waits_to_send() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    rig.fill_the_message_queue();
    assert_eq!(rig.control.replay_applied(256, 9_000), Ok(()));
    rig.hit(1_000, 0, 90);

    rig.step(u64::MAX);
    rig.sent();
    rig.step(u64::MAX);

    assert_eq!(
        rig.sent(),
        [message(256, 9_000, note_on(128, 0, sound, 60, 90))]
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
    let mut rig = Rig::new(&queue);

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
