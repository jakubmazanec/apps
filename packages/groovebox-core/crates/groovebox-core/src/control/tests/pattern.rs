//! Patterns, PLAY, SHIFT + PLAY and STOP, and the steps that enter and remove notes.

use super::library::{converted_with, meter};
use super::sample_sounds::{KICK, library, sample_on};
use super::*;
use crate::project::{FOUR_FOUR, Pattern, Signature};
use crate::sequencer::{Run, Sounding};
use crate::store::note::{Key, Note};
use crate::store::{NOTE_BLOCKS, Tree};
use crate::ui::layout::HEADER_LINE;
use std::format;
use std::string::String;
use view::{Picker, StepCursor};

/// A `Play` of the current pattern from bar 1, anchored at `anchor`, at 120 BPM.
fn play(anchor: u64) -> MessageKind {
    MessageKind::Play {
        run: Run {
            anchor,
            tick: 0,
            tempo: 12_000,
        },
    }
}

/// A rig whose own sequencer plays two notes of sound 1 on track 1, each a bar long: one from bar
/// 1's start and one from its tenth sixteenth, 54,000 samples later at 120 BPM.
#[allow(unsafe_code)]
fn two_notes(queue: &Queue<Message, MESSAGE_QUEUE>) -> Rig<'_> {
    let mut rig = Rig::new(queue);
    // SAFETY: the store lives while no step runs, and the rig has no audio part.
    let mut store = unsafe { rig.notes.store() };
    let tree = [0, 4_320].into_iter().fold(Tree(None), |tree, place| {
        let note = Note {
            bar: 0,
            place,
            length: 7_680,
            sound: SoundNumber(1),
            pitch: 60,
            velocity: 127,
            curve: None,
        };
        store.insert(tree, note).0
    });
    rig.control.player.switch(0, tree, &store.reader());
    rig
}

/// The notes that the control part's own sequencer has sounding.
fn sounding(rig: &Rig<'_>) -> Vec<Sounding> {
    rig.control.player.sounding().copied().collect()
}

/// Takes every version that was sent.
#[allow(unsafe_code)]
pub(super) fn versions(rig: &mut Rig<'_>) -> Vec<Version> {
    // SAFETY: the rig has no audio part, so this is the only consumer.
    let mut versions = unsafe { rig.versions.consumer() };
    core::iter::from_fn(|| versions.pop()).collect()
}

/// The notes of `tree`.
#[allow(unsafe_code)]
pub(super) fn notes_in(rig: &Rig<'_>, tree: Tree) -> Vec<Note> {
    // SAFETY: the reader lives while no step runs.
    unsafe { rig.notes.reader() }
        .notes(tree, Key::at(0, 0))
        .collect()
}

/// The tree of track 1 of pattern 1.
fn track_1(rig: &Rig<'_>) -> Tree {
    rig.control.project.patterns[0].tracks[0]
}

/// How many notes `sound` has in every pattern.
pub(super) fn count(rig: &Rig<'_>, sound: SoundNumber) -> u32 {
    rig.control.project.pool.get(sound).unwrap().notes
}

/// A note of `sound` at `pitch` as a tap enters it in sixteenth `sixteenth` of bar 1.
pub(super) fn entered(sixteenth: u16, sound: SoundNumber, pitch: u8) -> Note {
    Note {
        bar: 0,
        place: sixteenth * 480,
        length: 480,
        sound,
        pitch,
        velocity: 127,
        curve: None,
    }
}

/// Puts a tree of `notes` on track `track` of pattern `pattern`, both from 0, by hand and counts
/// them in their sounds.
#[allow(unsafe_code)]
pub(super) fn put(rig: &mut Rig<'_>, pattern: usize, track: usize, notes: &[Note]) {
    // SAFETY: the store lives while no step runs.
    let mut store = unsafe { rig.notes.store() };
    let tree = notes
        .iter()
        .fold(Tree(None), |tree, &note| store.insert(tree, note).0);
    store.hold(tree);
    rig.control.project.patterns[pattern].tracks[track] = tree;
    for note in notes {
        rig.control.project.pool.get_mut(note.sound).unwrap().notes += 1;
    }
}

/// How many blocks of the note memory are ready.
#[allow(unsafe_code)]
fn ready(rig: &Rig<'_>) -> usize {
    // SAFETY: the store lives while no step runs.
    unsafe { rig.notes.store() }.ready()
}

/// Takes blocks of the note memory by hand until `ready` are ready.
#[allow(unsafe_code)]
fn fill_until(rig: &Rig<'_>, ready: usize) {
    // SAFETY: the store lives while no step runs.
    let mut store = unsafe { rig.notes.store() };
    while store.ready() > ready {
        store.take();
    }
}

/// A rig on SAMPLES, which MENU + 10 opened from sample 10 to 13, whose preview plays b.wav from
/// sample 20, where the cursor moved down onto it from a.wav.
fn previewing(queue: &Queue<Message, MESSAGE_QUEUE>) -> Rig<'_> {
    let file = || converted_with(4_800, 1, 60, None);
    let mut rig = Rig::with_files(
        queue,
        &[("samples/a.wav", file()), ("samples/b.wav", file())],
    );
    rig.open();
    rig.menu(10, 9);
    rig.tap(20, Button::Down);
    rig.step(30);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            20,
            MessageKind::Preview {
                sample: SampleFile {
                    file: FileId(1),
                    frames: 4_800,
                    stereo: false
                }
            }
        )]
    );
    rig
}

#[test]
fn a_new_project_has_16_empty_one_bar_patterns_at_120_in_4_4() {
    let queue = Queue::new();
    let rig = Rig::new(&queue);
    let project = &rig.control.project;

    assert_eq!(
        project.patterns,
        [Pattern {
            bars: 1,
            tracks: [Tree(None); 4]
        }; 16]
    );
    assert_eq!(
        (project.pattern, project.tempo, project.signature),
        (0, 12_000, FOUR_FOUR)
    );
    // STEP and ROLL's cursor is on bar 1, step 1 (S5).
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 0 });
}

#[test]
fn play_starts_bar_1_at_the_press_and_lights() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.step(128);
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    rig.press(9_600, Button::Play);
    rig.step(9_728);

    assert_eq!(rig.sent(), [message(0, 9_600, play(9_600))]);
    // The empty pad 1 lights no note, and the music's step 1 still lights (answer 2).
    assert_eq!(rig.lit(), [pad(0), step(0), track(0), Lights::PLAY]);
}

#[test]
fn play_while_playing_sends_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(9_600, Button::Play);
    rig.step(9_728);
    rig.sent();

    rig.tap(20_000, Button::Play);
    rig.step(20_128);

    assert_eq!(rig.sent(), []);
    assert_eq!(
        rig.control.player.run(),
        Some(Run {
            anchor: 9_600,
            tick: 0,
            tempo: 12_000
        })
    );
}

#[test]
fn shift_play_starts_from_the_cursors_bar_and_jumps_while_playing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(100, Button::Shift);
    rig.tap(9_600, Button::Play);
    rig.tap(30_000, Button::Play);

    rig.step(30_128);

    // The cursor is on bar 1 in this plan, so both runs start at tick 0. The jump's run is
    // anchored at its own press.
    assert_eq!(
        rig.sent(),
        [
            message(0, 9_600, play(9_600)),
            message(1, 30_000, play(30_000))
        ]
    );
    assert_eq!(
        rig.control.player.run(),
        Some(Run {
            anchor: 30_000,
            tick: 0,
            tempo: 12_000
        })
    );
}

#[test]
fn stop_while_playing_stops_and_the_preview_plays_on() {
    let queue = Queue::new();
    let mut rig = previewing(&queue);
    rig.tap(9_600, Button::Play);
    rig.step(9_728);
    assert_eq!(rig.sent(), [message(1, 9_600, play(9_600))]);

    rig.tap(20_000, Button::Stop);
    rig.step(20_128);

    assert_eq!(rig.sent(), [message(2, 20_000, MessageKind::Stop)]);
    assert!(rig.control.previewing);
    assert_eq!(rig.control.player.run(), None);
    assert_eq!(rig.lit(), [pad(0), track(0)]);
}

#[test]
fn stop_while_stopped_silences_everything() {
    let queue = Queue::new();
    let mut rig = previewing(&queue);

    rig.tap(9_600, Button::Stop);
    rig.step(9_728);

    assert_eq!(rig.sent(), [message(1, 9_600, MessageKind::Silence)]);
    assert!(!rig.control.previewing);
}

#[test]
fn with_a_picker_open_play_and_stop_act_and_shift_play_waits() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // The sound picker of the empty pad 1, from SOUND's Pad page.
    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.press(30, Button::Shift);
    rig.tap(40, Button::Play);
    rig.let_go(50, Button::Shift);
    rig.tap(9_600, Button::Play);
    rig.press(9_700, Button::Shift);
    rig.tap(20_000, Button::Play);
    rig.let_go(20_100, Button::Shift);
    rig.tap(30_000, Button::Stop);

    rig.step(30_128);

    assert_eq!(
        rig.sent(),
        [
            message(0, 9_600, play(9_600)),
            message(1, 30_000, MessageKind::Stop)
        ]
    );
    assert!(matches!(rig.control.view.picker, Some((Picker::Sound, _))));
}

#[test]
fn play_and_stop_act_while_menu_is_held() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(10, Button::Menu);
    rig.tap(9_600, Button::Play);
    rig.tap(20_000, Button::Stop);
    rig.tap(30_000, Button::Stop);

    rig.step(30_128);

    assert_eq!(
        rig.sent(),
        [
            message(0, 9_600, play(9_600)),
            message(1, 20_000, MessageKind::Stop),
            message(2, 30_000, MessageKind::Silence)
        ]
    );
    assert_eq!(rig.control.overlay(), Some(Button::Menu));
}

#[test]
#[allow(unsafe_code)]
fn an_event_waits_while_the_version_queue_is_full() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // SAFETY: the producer lives while no step runs, and the rig takes its own only for a step.
    let mut versions = unsafe { rig.versions.producer() };
    while versions.free() >= MAX_VERSIONS_PER_EVENT {
        versions
            .push(Version {
                number: u32::MAX,
                moment: 0,
                track: 0,
                tree: Tree(None),
            })
            .unwrap();
    }
    rig.tap(9_600, Button::Play);

    rig.step(9_728);
    assert_eq!(rig.sent(), []);

    // SAFETY: the rig has no audio part, so this is the only consumer.
    unsafe { rig.versions.consumer() }.pop();
    rig.step(9_856);
    assert_eq!(rig.sent(), [message(0, 9_600, play(9_600))]);
}

#[test]
fn shift_stop_does_nothing_playing_or_stopped() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(10, Button::Shift);
    rig.tap(20, Button::Stop);
    rig.let_go(30, Button::Shift);
    rig.tap(9_600, Button::Play);
    rig.press(9_700, Button::Shift);
    rig.tap(20_000, Button::Stop);

    rig.step(20_128);

    assert_eq!(rig.sent(), [message(0, 9_600, play(9_600))]);
    assert!(rig.control.player.run().is_some());
}

#[test]
fn the_player_ends_alike_whether_the_events_come_in_one_step_or_several() {
    let (one_queue, several_queue) = (Queue::new(), Queue::new());
    let (mut one, mut several) = (two_notes(&one_queue), two_notes(&several_queue));
    for rig in [&mut one, &mut several] {
        rig.tap(1_000, Button::Play);
        rig.press(40_000, Button::Shift);
        rig.tap(50_000, Button::Play);
    }

    one.step(60_000);
    for until in [30_000, 45_000, 60_000] {
        several.step(until);
    }

    // The jump at 50,000 keeps the first run's note of bar 1's start, which sounds from 1,000.
    assert_eq!(sounding(&one), sounding(&several));
    assert!(
        sounding(&one)
            .iter()
            .map(|note| note.end)
            .eq([97_000, 146_000])
    );
}

#[test]
fn a_full_queue_leaves_the_player_at_the_last_event_it_handled() {
    let (room_queue, full_queue) = (Queue::new(), Queue::new());
    let (mut room, mut full) = (two_notes(&room_queue), two_notes(&full_queue));
    // Room for one event's messages: PLAY's goes out, and the jump waits for the next step.
    while full.producer.free() > MAX_MESSAGES_PER_EVENT {
        full.producer
            .push(message(u32::MAX, 0, MessageKind::StopPreview))
            .unwrap();
    }
    for rig in [&mut room, &mut full] {
        rig.tap(1_000, Button::Play);
        rig.press(40_000, Button::Shift);
        rig.tap(50_000, Button::Play);
        rig.step(60_000);
    }
    assert_eq!(full.sent().last(), Some(&message(0, 1_000, play(1_000))));

    room.step(70_000);
    full.step(70_000);

    assert_eq!(full.sent(), [message(1, 50_000, play(50_000))]);
    // The first run's note at 55,000 never starts: the jump at 50,000 came before it.
    assert_eq!(sounding(&full), sounding(&room));
    assert!(
        sounding(&full)
            .iter()
            .map(|note| note.end)
            .eq([97_000, 146_000])
    );
}

#[test]
fn a_tap_on_an_unlit_step_adds_the_selected_sounds_note_when_let_go() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);

    rig.press(9_600, Button::Step(4));
    rig.step(9_601);
    assert_eq!(versions(&mut rig), []);

    rig.let_go(9_601, Button::Step(4));
    rig.step(9_700);

    let tree = track_1(&rig);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 0,
            moment: 9_601 + 1_024,
            track: 0,
            tree
        }]
    );
    assert_eq!(notes_in(&rig, tree), [entered(4, synth, 60)]);
    assert_eq!(count(&rig, synth), 1);
    assert_eq!(rig.sent(), []);
}

#[test]
fn a_sample_sound_steps_at_its_root_note() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    // kick.wav's root note is 48.
    let kick = sample_on(&mut rig, 0, KICK.file);

    rig.tap(9_600, Button::Step(0));
    rig.step(9_700);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(0, kick, 48)]);
}

#[test]
fn in_keys_mode_a_tap_adds_the_last_key_or_the_c_of_the_octave() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    // No key was played yet: the C of octave 4.
    rig.tap(100, Button::Step(0));
    // E4.
    rig.hit(200, 4, 100);
    rig.release(300, 4);
    rig.tap(400, Button::Step(1));
    // Octave 5 keeps the last key.
    rig.press(500, Button::PadsKeys);
    rig.tap(510, Button::Up);
    rig.let_go(520, Button::PadsKeys);
    rig.tap(600, Button::Step(2));

    rig.step(700);

    assert_eq!(rig.track().octave, 5);
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [
            entered(0, synth, 60),
            entered(1, synth, 64),
            entered(2, synth, 64)
        ]
    );
}

#[test]
fn a_short_tap_on_a_lit_step_removes_every_note_of_the_sound_in_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    let other = rig.synth_on(1);
    // By hand, as a tap enters one note at a time: two pitches of the selected sound and a note of
    // another in the third sixteenth.
    put(
        &mut rig,
        0,
        0,
        &[
            entered(2, synth, 64),
            entered(2, synth, 67),
            entered(2, other, 60),
        ],
    );
    rig.tap(0, Button::PadsKeys);

    rig.tap(100, Button::Step(2));
    rig.step(200);

    let tree = track_1(&rig);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 0,
            moment: 101 + 1_024,
            track: 0,
            tree
        }]
    );
    assert_eq!(notes_in(&rig, tree), [entered(2, other, 60)]);
    assert_eq!((count(&rig, synth), count(&rig, other)), (0, 1));
}

#[test]
fn a_long_press_or_a_used_hold_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.press(100, Button::Step(4));
    rig.let_go(100 + HOLD, Button::Step(4));
    rig.press(20_000, Button::Step(4));
    rig.hit(20_010, 0, 100);
    rig.release(20_020, 0);
    rig.let_go(20_030, Button::Step(4));

    rig.step(30_000);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(track_1(&rig), Tree(None));
    assert_eq!(rig.control.view.steps.step, 0);

    // A short tap of the same step adds its note.
    rig.tap(30_000, Button::Step(4));
    rig.step(30_100);
    assert_eq!(versions(&mut rig).len(), 1);
}

#[test]
fn shift_menu_page_or_a_picker_take_the_step() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.press(100, Button::Shift);
    rig.tap(110, Button::Step(4));
    rig.let_go(120, Button::Shift);
    // Under MENU step 2 is ROLL's, which does not exist yet; under PAGE step 1 shows the page
    // shown already.
    rig.menu(200, 1);
    rig.page(300, 0);
    // The sound picker, from SOUND's Pad page.
    rig.menu(400, 2);
    rig.tap(410, Button::Ok);
    rig.tap(420, Button::Step(4));
    rig.tap(430, Button::Cancel);

    rig.step(500);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(track_1(&rig), Tree(None));
    assert_eq!(rig.control.view.steps.step, 0);
    assert_eq!(rig.control.view.picker, None);

    // A tap on its own adds the note.
    rig.tap(600, Button::Step(4));
    rig.step(700);
    assert_eq!(versions(&mut rig).len(), 1);
}

#[test]
fn with_an_empty_pad_a_tap_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.tap(100, Button::Step(4));
    rig.step(200);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(track_1(&rig), Tree(None));
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 4 });
}

#[test]
fn a_tap_moves_the_cursors_step() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);

    rig.tap(100, Button::Step(8));
    rig.step(200);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 8 });

    rig.tap(300, Button::Step(2));
    rig.step(400);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 2 });
}

#[test]
fn the_steps_light_the_sounds_notes_and_the_music_flips_its_step() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.tap(100, Button::Step(0));
    rig.tap(200, Button::Step(4));
    rig.step(300);
    assert_eq!(rig.lit(), [pad(0), step(0), step(4), track(0)]);

    rig.press(9_600, Button::Play);
    // The music is in step 1, which it darkens.
    rig.step(9_601);
    assert_eq!(rig.lit(), [pad(0), step(4), track(0), Lights::PLAY]);
    // Then in step 2, which it lights.
    rig.step(9_600 + 6_000);
    assert_eq!(
        rig.lit(),
        [pad(0), step(0), step(1), step(4), track(0), Lights::PLAY]
    );

    // With an empty pad selected only the music's step lights.
    rig.hit(16_000, 5, 100);
    rig.release(16_010, 5);
    rig.step(16_100);
    assert_eq!(rig.lit(), [pad(5), step(1), track(0), Lights::PLAY]);
}

#[test]
fn a_pad_lights_while_its_pattern_note_sounds() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.synth_on(2);
    // Pad 3's note in step 1, with pad 1 selected again.
    rig.hit(100, 2, 100);
    rig.release(110, 2);
    rig.tap(120, Button::Step(0));
    rig.hit(130, 0, 100);
    rig.release(140, 0);
    rig.press(9_600, Button::Play);

    rig.step(9_601);
    assert_eq!(rig.lit(), [pad(0), pad(2), step(0), track(0), Lights::PLAY]);
    // The note, a sixteenth long, sounds until sample 15,600.
    rig.step(15_599);
    assert_eq!(rig.lit(), [pad(0), pad(2), step(0), track(0), Lights::PLAY]);
    rig.step(15_600);
    assert_eq!(rig.lit(), [pad(0), step(1), track(0), Lights::PLAY]);
}

#[test]
fn a_sound_on_two_pads_lights_both() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    let twice = rig.synth_on(2);
    rig.control.project.put(6, Some(twice));
    rig.hit(100, 2, 100);
    rig.release(110, 2);
    rig.tap(120, Button::Step(0));
    rig.hit(130, 0, 100);
    rig.release(140, 0);
    rig.press(9_600, Button::Play);

    rig.step(9_601);

    assert_eq!(
        rig.lit(),
        [pad(0), pad(2), pad(6), step(0), track(0), Lights::PLAY]
    );
}

#[test]
fn in_keys_mode_the_key_of_a_sounding_pitch_lights() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    // E4 in step 1 and E5 in step 2, with octave 4 shown again.
    rig.hit(100, 4, 100);
    rig.release(110, 4);
    rig.tap(120, Button::Step(0));
    rig.press(200, Button::PadsKeys);
    rig.tap(210, Button::Up);
    rig.let_go(220, Button::PadsKeys);
    rig.hit(300, 4, 100);
    rig.release(310, 4);
    rig.tap(320, Button::Step(1));
    rig.press(400, Button::PadsKeys);
    rig.tap(410, Button::Down);
    rig.let_go(420, Button::PadsKeys);
    rig.press(9_600, Button::Play);

    rig.step(9_601);
    assert_eq!(rig.track().octave, 4);
    assert_eq!(
        rig.lit(),
        [
            pad(0),
            pad(4),
            step(1),
            track(0),
            Lights::PADS_KEYS,
            Lights::PLAY
        ]
    );
    // Pitch 76 is in octave 5, so no key of octave 4 lights.
    rig.step(15_601);
    assert_eq!(
        rig.lit(),
        [pad(0), step(0), track(0), Lights::PADS_KEYS, Lights::PLAY]
    );
}

#[test]
fn notes_of_another_track_light_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    let shared = rig.synth_on(2);
    rig.tap(10, Button::T2);
    rig.step(20);
    rig.control.project.put(0, Some(shared));
    rig.tap(30, Button::Step(0));
    rig.tap(40, Button::T1);
    rig.press(9_600, Button::Play);

    rig.step(9_601);

    // T2's note sounds, and its sound sits on T1's pad 3.
    assert_eq!(
        sounding(&rig)
            .iter()
            .map(|note| note.track)
            .collect::<Vec<_>>(),
        [1]
    );
    assert_eq!(rig.lit(), [pad(0), step(0), track(0), Lights::PLAY]);
}

#[test]
fn a_step_past_the_bars_end_stays_dark_and_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    // A bar of 3/4 has 12 sixteenths. By hand: nothing makes a signature or a note past the bar's
    // end before plan 2.
    rig.control.project.signature = Signature { beats: 3, unit: 4 };
    put(
        &mut rig,
        0,
        0,
        &[entered(11, synth, 60), entered(12, synth, 60)],
    );

    rig.tap(100, Button::Step(12));
    rig.step(200);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(rig.control.view.steps.step, 0);
    assert_eq!(rig.lit(), [pad(0), step(11), track(0)]);
}

#[test]
fn moments_never_go_backward_and_take_replay_records() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    // The recorded session applied version 0 late, at 50,000.
    assert_eq!(rig.control.replay_applied(0, 50_000), Ok(()));
    rig.tap(9_600, Button::Step(0));
    rig.tap(20_000, Button::Step(1));
    rig.tap(60_000, Button::Step(2));

    rig.step(60_100);

    assert_eq!(
        versions(&mut rig)
            .iter()
            .map(|version| (version.number, version.moment))
            .collect::<Vec<_>>(),
        [(0, 50_000), (1, 50_000), (2, 60_001 + 1_024)]
    );
}

#[test]
#[allow(unsafe_code)]
fn two_quick_taps_free_the_first_trees_blocks_only_after_both_reports() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.tap(100, Button::Step(0));
    rig.step(150);
    let first = track_1(&rig);
    rig.tap(200, Button::Step(1));
    rig.step(300);
    // Each tree is one block, and both versions are in flight.
    assert_eq!(versions(&mut rig).len(), 2);
    assert_eq!(ready(&rig), NOTE_BLOCKS - 2);

    rig.applied(0, 1_152);
    assert_eq!(ready(&rig), NOTE_BLOCKS - 2);

    rig.applied(1, 1_248);
    assert_eq!(ready(&rig), NOTE_BLOCKS - 1);
    // SAFETY: the store lives while no step runs.
    assert_eq!(Tree(Some(unsafe { rig.notes.store() }.take())), first);
}

#[test]
fn the_step_waits_for_reports_while_the_reserve_waits() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    rig.tap(100, Button::Step(0));
    rig.tap(200, Button::Step(1));
    rig.step(300);
    versions(&mut rig);
    // The first tree's block waits for version 1's report, and one block fewer than the reserve is
    // ready.
    fill_until(&rig, RESERVE - 1);

    rig.tap(400, Button::Step(2));
    rig.step(500);
    assert_eq!(versions(&mut rig), []);

    // Version 0 let go of no block.
    rig.applied(0, 1_152);
    rig.step(600);
    assert_eq!(versions(&mut rig), []);

    rig.applied(1, 1_248);
    rig.step(700);
    let tree = track_1(&rig);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 2,
            moment: 401 + 1_024,
            track: 0,
            tree
        }]
    );
    assert_eq!(
        notes_in(&rig, tree),
        [
            entered(0, synth, 60),
            entered(1, synth, 60),
            entered(2, synth, 60)
        ]
    );
}

#[test]
fn a_tap_without_room_says_not_enough_memory() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    rig.tap(100, Button::Step(0));
    rig.step(200);
    let one = track_1(&rig);
    versions(&mut rig);
    // No block waits, so the free blocks are the ready ones.
    fill_until(&rig, RESERVE - 1);

    rig.tap(300, Button::Step(4));
    rig.step(400);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(track_1(&rig), one);
    assert_eq!(count(&rig, synth), 1);
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            Some(("Not enough memory", RECORD)),
            |_| {},
            &[
                Some(sound("Syn 1")),
                Some(copy("on 1 pad")),
                Some(engine("Synth")),
                None
            ],
        )
    ));

    // A removal may use the reserve.
    rig.tap(500, Button::Step(0));
    rig.step(600);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 1,
            moment: 501 + 1_024,
            track: 0,
            tree: Tree(None)
        }]
    );
    assert_eq!(count(&rig, synth), 0);
}

#[test]
fn the_header_shows_the_pattern_the_bar_and_the_tempo() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.step(128);

    assert!(shows_step(&rig.control, &STEP_HEADER));
    // step-stopped.png: "P1", "1/1" and "120.0" 6 pixels apart, the tempo ending at x 475.
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 300..=420, 4..=10, TEXT), Some((407, 417)));
    assert_eq!(span(&screen, 421..=443, 4..=10, TEXT), Some((424, 440)));
    assert_eq!(span(&screen, 444..=479, 4..=10, TEXT), Some((447, 475)));
}

#[test]
fn while_playing_the_bar_names_the_playing_bar() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(9_600, Button::Play);

    rig.step(9_728);

    let mut expected = Screen::new();
    draw_header(
        &mut expected,
        &STEP_HEADER.map(|(text, color)| Piece { text, color }),
        &["P1", "1/1 ▶1", "120.0"].map(|text| Piece { text, color: TEXT }),
    );
    draw_strip(&mut expected, &[None; 4]);
    assert!(shows(&rig.control, &expected));

    rig.press(20_000, Button::Stop);
    rig.step(20_128);
    assert!(shows_step(&rig.control, &STEP_HEADER));
}

#[test]
fn a_message_replaces_the_transport() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    fill_until(&rig, RESERVE - 1);

    rig.tap(100, Button::Step(0));
    rig.step(200);

    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 0..=479, 4..=10, RECORD), Some((375, 475)));
    // Of the bright texts only "T1" and "Syn 1" show.
    assert_eq!(span(&screen, 0..=479, 4..=10, TEXT), Some((33, 78)));

    // STOP clears the message, and the transport is back.
    rig.tap(300, Button::Stop);
    rig.step(400);
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            None,
            |_| {},
            &[
                Some(sound("Syn 1")),
                Some(copy("on 1 pad")),
                Some(engine("Synth")),
                None
            ],
        )
    ));
}

#[test]
fn a_long_sound_name_stops_short_of_the_transport() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    let long: String = ('a'..='z').cycle().take(40).collect();
    let name = &mut rig.control.project.pool.get_mut(synth).unwrap().name;
    *name = Label::new();
    name.push_str(&long);
    // SOUND's Volume envelope page, whose name is among the longest.
    rig.menu(10, 2);
    rig.page(20, 4);

    rig.step(30);

    // 36 characters and the "…" bring "Pads" to x 400, 6 pixels left of "P1"; one more character
    // would bring it closer.
    let cut = format!("{}…", &long[..36]);
    let header = drawn(
        &[
            ("Sound", ACCENT),
            ("Volume envelope", TEXT),
            ("T1", TEXT),
            (&cut, TEXT),
            ("Pads", DIM),
        ],
        None,
        |_| {},
        &[None; 4],
    );
    let rows = WIDTH * (HEADER_LINE as usize + 1);
    assert!(picture(&rig.control).pixels()[..rows] == header.pixels()[..rows]);
    assert_eq!(span(&header, 300..=479, 4..=10, DIM), Some((378, 400)));
    assert_eq!(span(&header, 401..=420, 4..=10, TEXT), Some((407, 417)));
}

#[test]
fn the_dev_page_shows_note_memory() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 7);
    rig.page(20, 1);

    rig.step(30);

    let note_memory = ItemView {
        encoder: None,
        name: "Note memory",
        value: "0.0 of 8 MB",
        bar: Bar::Fill(0, 8_000_000),
    };
    assert!(shows(
        &rig.control,
        &drawn(
            &[
                ("Settings", ACCENT),
                ("Dev", TEXT),
                ("T1", TEXT),
                ("1", DIM),
                ("Pads", DIM),
            ],
            None,
            |screen| {
                draw_item(screen, 2, 17, 160, &meter("0.0 of 64 MB", 0), true, None);
                draw_cursor(screen, 2, 17, 160, 17);
                draw_item(screen, 2, 35, 160, &note_memory, true, None);
            },
            &[None; 4],
        )
    ));

    // A tree's first note takes a block of 512 bytes and 8 of bookkeeping.
    rig.synth_on(0);
    let other = rig.synth_on(1);
    rig.tap(100, Button::Step(0));
    rig.step(200);
    assert_eq!(rig.control.note_memory, 520);

    // 32 notes of two sounds pass a leaf's 31: two leaves and their root.
    for step in 1..16 {
        rig.tap(200 + 10 * u64::from(step), Button::Step(step));
    }
    rig.hit(400, 1, 100);
    rig.release(410, 1);
    rig.step(500);
    for step in 0..16 {
        rig.tap(500 + 10 * u64::from(step), Button::Step(step));
    }
    rig.step(700);
    assert_eq!(count(&rig, other), 16);
    assert_eq!(rig.control.note_memory, 3 * 520);
}
