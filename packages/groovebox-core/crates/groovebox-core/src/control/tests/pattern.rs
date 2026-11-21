//! Patterns, PLAY, SHIFT + PLAY and STOP.

use super::library::converted_with;
use super::*;
use crate::project::{FOUR_FOUR, Pattern};
use crate::sequencer::Run;
use crate::store::Tree;
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
    assert_eq!(rig.lit(), [pad(0), track(0), Lights::PLAY]);
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
