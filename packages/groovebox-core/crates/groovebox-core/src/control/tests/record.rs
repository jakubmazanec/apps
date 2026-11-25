//! REC: arming while stopped, the count-in after PLAY, dropping in and out while playing, and the
//! record dot and REC's light that show it. At 120 BPM in 4/4 a beat is 24,000 samples and a bar
//! 96,000.

use super::timing::{choose, on_bars};
use super::*;
use crate::sequencer::Run;
use view::StepCursor;

/// A `Play` from tick `tick` anchored at `anchor`, at 120 BPM.
fn play(anchor: u64, tick: u64, count_in: bool) -> MessageKind {
    MessageKind::Play {
        run: Run {
            anchor,
            tick,
            tempo: 12_000,
        },
        count_in,
    }
}

fn rec_lit(rig: &Rig<'_>) -> bool {
    rig.lit().contains(&Lights::REC)
}

/// Whether the control part draws STEP's header of a new project with this transport and record
/// dot over an empty strip.
fn shows_header(control: &Control, transport: [&str; 3], record: Option<Color>) -> bool {
    let mut expected = Screen::new();
    draw_header(
        &mut expected,
        &STEP_HEADER.map(|(text, color)| Piece { text, color }),
        &transport.map(|text| Piece { text, color: TEXT }),
        record,
        false,
        "",
    );
    draw_strip(&mut expected, &[None; 4]);
    shows_frame(control, &expected)
}

/// A rig armed with REC at 0 whose PLAY at 1,000 counts in: the pattern starts at 97,000.
fn counting_in(queue: &Queue<Message, MESSAGE_QUEUE>) -> Rig<'_> {
    let mut rig = Rig::new(queue);
    rig.tap(0, Button::Rec);
    rig.tap(1_000, Button::Play);
    rig.step(1_128);
    assert_eq!(rig.sent(), [message(0, 1_000, play(1_000, 0, true))]);
    rig
}

#[test]
fn rec_while_stopped_arms_and_again_disarms() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::Rec);

    // From the press, lit for the first half of each beat.
    for (sample, lit) in [(1, true), (11_999, true), (12_000, false), (24_000, true)] {
        rig.step(sample);
        assert_eq!(rec_lit(&rig), lit, "sample {sample}");
        assert!(shows_header(
            &rig.control,
            ["P1", "1/1", "120.0"],
            Some(DIM)
        ));
    }
    assert_eq!(rig.sent(), []);

    rig.tap(30_000, Button::Rec);
    rig.step(30_128);
    assert!(shows_header(&rig.control, ["P1", "1/1", "120.0"], None));
    assert!(!rec_lit(&rig));
    assert_eq!(rig.sent(), []);
}

#[test]
fn an_armed_blink_follows_a_tempo_turn() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::Rec);
    rig.menu(10, 8);
    rig.turn(30_000, 0, -60);
    rig.step(30_128);
    assert_eq!(rig.control.project.tempo, 6_000);
    // Tick 2,400 is at sample 30,000, so the blink goes on at 60 BPM from tick 2,401, at 30,012.
    assert_eq!(
        rig.control.rec,
        Rec::Armed(Run {
            anchor: 30_012,
            tick: 2_401,
            tempo: 6_000
        })
    );

    // Tick 2,840 is 920 ticks into its beat and tick 2,920 1,000.
    rig.step(41_000);
    assert!(rec_lit(&rig));
    rig.step(43_000);
    assert!(!rec_lit(&rig));
}

#[test]
fn play_after_arming_counts_in_then_records() {
    let queue = Queue::new();
    let mut rig = counting_in(&queue);

    // The clicks' beats from 1,000, lit for the first half of each.
    for (sample, lit) in [
        (1_128, true),
        (12_999, true),
        (13_000, false),
        (25_000, true),
        (85_000, false),
        (96_999, false),
    ] {
        rig.step(sample);
        assert_eq!(rec_lit(&rig), lit, "sample {sample}");
    }
    assert!(shows_header(
        &rig.control,
        ["P1", "1/1 ▶1", "120.0"],
        Some(DIM)
    ));

    // The dot alone changes at the first beat, and the step redraws for it.
    assert!(rig.step(97_001));
    assert_eq!(rig.control.rec, Rec::On);
    assert!(shows_header(
        &rig.control,
        ["P1", "1/1 ▶1", "120.0"],
        Some(RECORD)
    ));
    assert!(rec_lit(&rig));
    rig.step(109_001);
    assert!(rec_lit(&rig));
}

#[test]
fn during_the_count_in_the_panel_stands_on_the_start_bar() {
    let queue = Queue::new();
    let mut rig = counting_in(&queue);

    rig.step(10_000);
    let lit = rig.lit();
    assert!(lit.contains(&Lights::PLAY));
    assert!(lit.contains(&step(0)));
    assert!(shows_header(
        &rig.control,
        ["P1", "1/1 ▶1", "120.0"],
        Some(DIM)
    ));
    // The left line of the first cell.
    assert_eq!(rig.control.music_x(10_000), Some(22));
    let first = picture(&rig.control);
    rig.step(90_000);
    assert_eq!(picture(&rig.control).pixels(), first.pixels());
    assert!(rig.lit().contains(&step(0)));

    // From the cursor in bar 3 of 4, PLAY counts in on bar 1.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    choose(&mut rig, 60, 0, &[Button::Down, Button::Down]);
    rig.menu(100, 0);
    rig.step(200);
    // By hand, the view as far right as it goes, which shows bar 3 but not bar 1's first cell.
    rig.control.view.steps = StepCursor { bar: 2, step: 0 };
    rig.control.view.step_view.first_cell = 7;
    rig.step(300);
    assert_eq!(rig.control.view.step_view.first_cell, 7);
    rig.tap(1_000, Button::Rec);
    rig.tap(2_000, Button::Play);

    rig.step(50_000);

    assert_eq!(rig.control.view.step_view.first_cell, 0);
    assert_eq!(rig.control.shown_bar(50_000), 0);
    assert!(rig.lit().contains(&step(0)));
    assert!(shows_header(
        &rig.control,
        ["P1", "1/4 ▶1", "120.0"],
        Some(DIM)
    ));
}

#[test]
fn with_count_in_off_play_after_arming_records_at_once() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.settings.set(COUNT_IN.id, 0);
    rig.tap(0, Button::Rec);
    rig.tap(1_000, Button::Play);

    rig.step(1_128);

    assert_eq!(rig.sent(), [message(0, 1_000, play(1_000, 0, false))]);
    assert_eq!(rig.control.rec, Rec::On);
    assert!(shows_header(
        &rig.control,
        ["P1", "1/1 ▶1", "120.0"],
        Some(RECORD)
    ));
    assert!(rec_lit(&rig));
}

#[test]
fn shift_play_after_arming_counts_in_from_the_cursors_bar() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    choose(&mut rig, 50, 0, &[Button::Down]);
    rig.step(100);
    rig.sent();
    rig.control.view.steps = StepCursor { bar: 1, step: 0 };
    rig.tap(1_000, Button::Rec);
    rig.press(1_500, Button::Shift);
    rig.tap(2_000, Button::Play);

    rig.step(2_128);

    assert_eq!(rig.sent(), [message(1, 2_000, play(2_000, 7_680, true))]);
    assert!(rig.control.player.counting_in(2_128));
}

#[test]
fn rec_during_the_count_in_drops_recording_and_again_puts_it_back() {
    let queue = Queue::new();
    let mut rig = counting_in(&queue);
    rig.tap(30_000, Button::Rec);
    rig.step(30_128);
    assert_eq!(rig.sent(), []);
    assert!(shows_header(&rig.control, ["P1", "1/1 ▶1", "120.0"], None));
    assert!(!rec_lit(&rig));

    // The clicks finish and the pattern starts on time without recording.
    rig.step(97_000);
    assert!(rig.control.player.run().is_some());
    assert!(!rig.control.player.counting_in(97_000));
    assert_eq!(rig.control.rec, Rec::Off);

    let queue = Queue::new();
    let mut rig = counting_in(&queue);
    rig.tap(30_000, Button::Rec);
    rig.tap(50_000, Button::Rec);
    rig.step(96_999);
    assert!(matches!(rig.control.rec, Rec::Armed(_)));
    assert!(shows_header(
        &rig.control,
        ["P1", "1/1 ▶1", "120.0"],
        Some(DIM)
    ));
    rig.step(97_000);
    assert_eq!(rig.control.rec, Rec::On);
    assert_eq!(rig.sent(), []);
}

#[test]
fn play_and_shift_play_during_the_count_in_do_nothing() {
    let queue = Queue::new();
    let mut rig = counting_in(&queue);
    // By hand, rather than with an arrow into another bar, which ends following.
    rig.control.view.following = false;
    let rec = rig.control.rec;

    rig.tap(10_000, Button::Play);
    rig.press(20_000, Button::Shift);
    rig.tap(20_010, Button::Play);
    rig.let_go(20_020, Button::Shift);
    rig.step(20_128);

    assert_eq!(rig.sent(), []);
    assert!(!rig.control.view.following);
    assert_eq!(rig.control.rec, rec);
    assert_eq!(
        rig.control.player.run(),
        Some(Run {
            anchor: 1_000,
            tick: 0,
            tempo: 12_000
        })
    );
    assert!(rig.control.player.counting_in(20_128));
}

#[test]
fn stop_during_the_count_in_ends_it_and_disarms() {
    let queue = Queue::new();
    let mut rig = counting_in(&queue);

    rig.tap(30_000, Button::Stop);
    rig.step(30_128);

    assert_eq!(rig.sent(), [message(1, 30_000, MessageKind::Stop)]);
    assert_eq!(rig.control.player.run(), None);
    assert_eq!(rig.control.rec, Rec::Off);
    assert!(!rec_lit(&rig));
    assert!(shows_header(&rig.control, ["P1", "1/1", "120.0"], None));
}

#[test]
fn rec_while_playing_drops_in_and_out() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::Play);
    rig.tap(10_000, Button::Rec);
    rig.step(10_128);
    assert_eq!(rig.sent(), [message(0, 0, play(0, 0, false))]);
    assert_eq!(rig.control.rec, Rec::On);
    assert!(shows_header(
        &rig.control,
        ["P1", "1/1 ▶1", "120.0"],
        Some(RECORD)
    ));
    assert!(rec_lit(&rig));

    rig.tap(20_000, Button::Rec);
    rig.step(20_128);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.rec, Rec::Off);
    assert!(shows_header(&rig.control, ["P1", "1/1 ▶1", "120.0"], None));
    assert!(!rec_lit(&rig));
    assert_eq!(
        rig.control.player.run(),
        Some(Run {
            anchor: 0,
            tick: 0,
            tempo: 12_000
        })
    );
}

#[test]
fn stop_ends_recording_and_disarms() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::Play);
    rig.tap(10_000, Button::Rec);
    rig.step(10_128);
    rig.sent();

    rig.tap(20_000, Button::Stop);
    rig.step(20_128);

    assert_eq!(rig.sent(), [message(1, 20_000, MessageKind::Stop)]);
    assert_eq!(rig.control.rec, Rec::Off);

    rig.tap(30_000, Button::Rec);
    rig.tap(40_000, Button::Stop);
    rig.step(40_128);

    assert_eq!(rig.sent(), [message(2, 40_000, MessageKind::Silence)]);
    assert_eq!(rig.control.rec, Rec::Off);
    assert!(!rec_lit(&rig));
}

#[test]
fn rec_acts_everywhere_and_shift_rec_does_nothing() {
    /// REC at 1,000 arms and at 2,000 disarms, sending nothing and leaving the view as it was.
    fn arms_and_disarms(rig: &mut Rig<'_>) {
        rig.step(500);
        assert_eq!(rig.sent(), []);
        let (view, overlay) = (rig.control.view, rig.control.overlay());
        rig.tap(1_000, Button::Rec);
        rig.step(1_100);
        assert!(matches!(rig.control.rec, Rec::Armed(_)));
        rig.tap(2_000, Button::Rec);
        rig.step(2_100);
        assert_eq!(rig.control.rec, Rec::Off);
        assert_eq!(rig.sent(), []);
        assert_eq!(rig.control.view, view);
        assert_eq!(rig.control.overlay(), overlay);
    }

    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(10, Button::Menu);
    rig.step(20);
    assert_eq!(rig.control.overlay(), Some(Button::Menu));
    arms_and_disarms(&mut rig);

    // The sound picker of the empty pad 1.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.step(30);
    assert!(matches!(rig.control.view.picker, Some((Picker::Sound, _))));
    arms_and_disarms(&mut rig);

    // POOL's question whether to delete Syn 1.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.menu(10, 5);
    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Ok);
    rig.step(40);
    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteSound(syn_1))
    );
    arms_and_disarms(&mut rig);

    // SHIFT + REC, stopped and playing.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(10, Button::Shift);
    rig.tap(20, Button::Rec);
    rig.let_go(30, Button::Shift);
    rig.tap(1_000, Button::Play);
    rig.press(2_000, Button::Shift);
    rig.tap(2_010, Button::Rec);
    rig.let_go(2_020, Button::Shift);

    rig.step(2_128);

    assert_eq!(rig.sent(), [message(0, 1_000, play(1_000, 0, false))]);
    assert_eq!(rig.control.rec, Rec::Off);
}

#[test]
fn rec_blinks_after_a_count_in_whose_step_stopped_early() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // Room for PLAY's event and no more, so the step stops after it.
    while rig.producer.free() > MAX_MESSAGES_PER_EVENT {
        rig.producer
            .push(message(u32::MAX, 0, MessageKind::StopPreview))
            .unwrap();
    }
    rig.tap(0, Button::Rec);
    rig.tap(1_000, Button::Play);

    rig.step(1_128);

    // The player waits at PLAY, before the first click, so REC waits dark.
    assert!(!rec_lit(&rig));
    rig.sent();
    rig.step(1_256);
    assert!(rec_lit(&rig));
}
