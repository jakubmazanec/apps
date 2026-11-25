//! REC: arming while stopped, the count-in after PLAY and dropping in and out while playing, with
//! the record dot and REC's light that show them, and the notes recorded. At 120 BPM in 4/4 a beat
//! is 24,000 samples, a bar 96,000 and a tick 12.5.

use super::pattern::{count, entered, fill_until, notes_in, put, ready, versions};
use super::timing::{choose, on_bars};
use super::*;
use crate::sequencer::Run;
use crate::store::note::Note;
use crate::store::{Tree, curve};
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

/// A rig on T4 with a synth on pad 1 and COUNT-IN off, whose pattern of `bars` bars of 4/4 plays
/// from 0 at 120 BPM with REC on, after REC and PLAY at 0. Its messages are taken.
#[allow(unsafe_code)]
fn recording(queue: &Queue<Message, MESSAGE_QUEUE>, bars: u16) -> (Rig<'_>, SoundNumber) {
    let mut rig = Rig::new(queue);
    rig.control.project.track = 3;
    let synth = rig.synth_on(0);
    rig.control.settings.set(COUNT_IN.id, 0);
    // SAFETY: the store lives while no step runs.
    rig.control
        .reshape(Change::Length(bars), 0, &mut rig.producer, &unsafe {
            rig.notes.store()
        });
    rig.press(0, Button::Rec);
    rig.press(0, Button::Play);
    rig.let_go(1, Button::Rec);
    rig.let_go(1, Button::Play);
    rig.step(2);
    assert_eq!(rig.control.rec, Rec::On);
    rig.sent();
    (rig, synth)
}

/// The notes of T4.
fn on_t4(rig: &Rig<'_>) -> Vec<Note> {
    notes_in(rig, rig.control.project.patterns[0].tracks[3])
}

/// A note of `sound` at C4 with velocity 100 in bar 1, as a hit records it.
fn played(place: u16, length: u32, sound: SoundNumber) -> Note {
    Note {
        bar: 0,
        place,
        length,
        sound,
        pitch: 60,
        velocity: 100,
        curve: None,
    }
}

/// A hit of pad 1 at `hit` with velocity 100 and its release at `release`, stepped past.
fn hit_and_release(rig: &mut Rig<'_>, hit: u64, release: u64) {
    rig.hit(hit, 0, 100);
    rig.release(release, 0);
    rig.step(release + 128);
}

/// The track and the moment of every version sent.
fn moments(rig: &mut Rig<'_>) -> Vec<(u8, u64)> {
    versions(rig)
        .iter()
        .map(|version| (version.track, version.moment))
        .collect()
}

/// The header's message and its colour.
fn said<'a>(rig: &'a Rig<'_>) -> Option<(&'a str, Color)> {
    rig.control
        .message
        .as_ref()
        .map(|message| (message.text.as_str(), message.color))
}

#[test]
fn a_hit_goes_in_at_its_release_snapped_to_the_nearest_sixteenth() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);

    // Sample 5,900 is tick 472, nearer 480 than 0.
    rig.hit(5_900, 0, 100);
    rig.step(8_000);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);

    // Sample 9,000 is tick 720.
    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(moments(&mut rig), [(3, 9_000 + 1_024)]);
    assert_eq!(on_t4(&rig), [played(480, 248, synth)]);
    assert_eq!(count(&rig, synth), 1);
}

#[test]
fn the_output_delay_moves_the_snap() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    // Tick 728 snaps to 960.
    hit_and_release(&mut rig, 9_100, 10_000);
    assert_eq!(on_t4(&rig), [played(960, 72, synth)]);

    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.queue(10, Input::OutputDelay { samples: 1_200 });
    // Sample 7,900 is tick 632, which snaps to 480.
    hit_and_release(&mut rig, 9_100, 10_000);
    assert_eq!(on_t4(&rig), [played(480, 72, synth)]);
}

#[test]
fn quantize_off_keeps_the_hit_where_it_was_played_less_the_delay() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.control.project.quantize = false;
    rig.queue(10, Input::OutputDelay { samples: 1_200 });

    // Samples 5,900 and 7,800 are ticks 472 and 624.
    hit_and_release(&mut rig, 7_100, 9_000);

    assert_eq!(on_t4(&rig), [played(472, 152, synth)]);
}

#[test]
fn a_hit_just_before_the_loop_restarts_lands_on_bar_1() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);

    // Tick 7,600 snaps to 7,680, the next pass's start at sample 96,000.
    hit_and_release(&mut rig, 95_000, 97_000);

    assert_eq!(on_t4(&rig), [played(0, 160, synth)]);
    let [(3, moment)] = moments(&mut rig)[..] else {
        panic!("one version of T4");
    };
    assert!(moment >= 96_001, "moment {moment}");
}

#[test]
fn a_note_snapped_forward_is_not_played_again_in_its_pass() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);

    // Tick 248 snaps to 480, at sample 6,000.
    hit_and_release(&mut rig, 3_100, 3_200);

    assert_eq!(on_t4(&rig), [played(480, 8, synth)]);
    assert_eq!(moments(&mut rig), [(3, 6_001)]);
}

#[test]
fn a_note_held_over_the_loop_point_keeps_its_length_up_to_the_patterns() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 2);
    // Ticks 11,520 and 19,200: bar 2's middle, held a bar into the next pass.
    hit_and_release(&mut rig, 144_000, 240_000);
    assert_eq!(
        on_t4(&rig),
        [Note {
            bar: 1,
            ..played(3_840, 7_680, synth)
        }]
    );

    // Held 16,000 ticks, more than the pattern's 7,680.
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    hit_and_release(&mut rig, 0, 200_000);
    assert_eq!(on_t4(&rig), [played(0, 7_680, synth)]);
}

#[test]
fn the_same_sound_pitch_and_start_replaces_the_old_note() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);

    hit_and_release(&mut rig, 6_000, 7_000);
    rig.hit(102_000, 0, 50);
    rig.release(103_000, 0);
    rig.step(103_128);

    assert_eq!(
        on_t4(&rig),
        [Note {
            velocity: 50,
            ..played(480, 80, synth)
        }]
    );
    assert_eq!(count(&rig, synth), 1);
}

#[test]
fn overdub_keeps_what_is_there() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    put(&mut rig, 0, 3, &[entered(0, synth, 60)]);

    // Step 5 starts at tick 1,920, sample 24,000.
    hit_and_release(&mut rig, 24_000, 25_000);

    assert_eq!(
        on_t4(&rig),
        [entered(0, synth, 60), played(1_920, 80, synth)]
    );
    assert_eq!(count(&rig, synth), 2);
}

#[test]
fn keys_mode_and_midi_record_the_selected_sound_at_their_pitch() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);

    rig.tap(1_000, Button::PadsKeys);
    rig.hit(6_000, 4, 100);
    rig.release(7_000, 4);
    rig.note_on(12_000, 67, 100);
    rig.note_off(13_000, 67);
    rig.tap(14_000, Button::PadsKeys);
    rig.note_on(18_000, 60, 100);
    rig.note_off(19_000, 60);
    rig.step(19_128);

    assert_eq!(
        on_t4(&rig),
        [
            Note {
                pitch: 64,
                ..played(480, 80, synth)
            },
            Note {
                pitch: 67,
                ..played(960, 80, synth)
            },
            played(1_440, 80, synth)
        ]
    );
}

#[test]
fn velocity_off_records_127() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.control.settings.set(VELOCITY.id, 0);

    hit_and_release(&mut rig, 6_000, 7_000);

    assert_eq!(
        on_t4(&rig),
        [Note {
            velocity: 127,
            ..played(480, 80, synth)
        }]
    );
}

#[test]
fn a_hit_from_before_rec_is_not_recorded_even_held_into_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.project.track = 3;
    rig.synth_on(0);
    rig.tap(0, Button::Play);
    rig.hit(1_000, 0, 100);
    rig.tap(2_000, Button::Rec);

    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(rig.control.rec, Rec::On);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);
}

#[test]
fn hits_during_the_count_in_are_not_recorded_but_an_early_first_hit_is() {
    /// A rig on T4 with a synth on pad 1, armed with REC at 0 whose PLAY at 0 counts in: the
    /// pattern starts at 96,000. Its messages are taken.
    fn counting_in_on_t4(queue: &Queue<Message, MESSAGE_QUEUE>) -> (Rig<'_>, SoundNumber) {
        let mut rig = Rig::new(queue);
        rig.control.project.track = 3;
        let synth = rig.synth_on(0);
        rig.press(0, Button::Rec);
        rig.press(0, Button::Play);
        rig.let_go(1, Button::Rec);
        rig.let_go(1, Button::Play);
        rig.step(2);
        assert!(rig.control.player.counting_in(2));
        rig.sent();
        (rig, synth)
    }

    let queue = Queue::new();
    let (mut rig, synth) = counting_in_on_t4(&queue);
    hit_and_release(&mut rig, 50_000, 51_000);
    assert_eq!(
        rig.sent(),
        [
            message(1, 50_000, note_on(0, 3, synth, 60, 100)),
            message(2, 51_000, note_off(0))
        ]
    );
    assert_eq!(versions(&mut rig), []);
    // Tick 7,600 snaps onto the first beat, tick 7,680.
    hit_and_release(&mut rig, 95_000, 97_000);
    assert_eq!(on_t4(&rig), [played(0, 160, synth)]);

    let queue = Queue::new();
    let (mut rig, _) = counting_in_on_t4(&queue);
    rig.control.project.quantize = false;
    hit_and_release(&mut rig, 95_000, 97_000);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);

    let queue = Queue::new();
    let (mut rig, _) = counting_in_on_t4(&queue);
    rig.hit(50_000, 0, 100);
    rig.tap(60_000, Button::Stop);
    rig.release(70_000, 0);
    rig.step(70_128);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);
}

#[test]
fn rec_off_stop_and_a_jump_end_the_held_notes_there() {
    for button in [Button::Rec, Button::Stop, Button::Play] {
        let queue = Queue::new();
        let (mut rig, synth) = recording(&queue, 1);
        rig.hit(10_000, 0, 100);
        // SHIFT + PLAY jumps.
        if button == Button::Play {
            rig.press(19_990, Button::Shift);
        }

        rig.tap(20_000, button);
        rig.step(20_128);

        // Ticks 800, which snaps to 960, and 1,600.
        assert_eq!(on_t4(&rig), [played(960, 800, synth)], "{button:?}");
        assert_eq!(versions(&mut rig).len(), 1, "{button:?}");
        rig.release(30_000, 0);
        rig.step(30_128);
        assert_eq!(versions(&mut rig), [], "{button:?}");
        assert_eq!(on_t4(&rig), [played(960, 800, synth)], "{button:?}");
    }
}

#[test]
fn held_notes_on_two_tracks_end_with_one_version_each() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    let [syn_2, syn_3] = [1, 2].map(|pad| rig.synth_on(pad));
    let on_t1 = rig.control.project.pool.new_synth().unwrap();
    // Pad 12, as each pad has one note on at a time.
    rig.control.project.tracks[0].put(11, Some(on_t1));
    rig.tap(1_000, Button::T1);
    rig.hit(6_000, 11, 100);
    rig.tap(7_000, Button::T4);
    for pad in 0..3 {
        rig.hit(12_000 + u64::from(pad), pad, 100);
    }

    rig.tap(20_000, Button::Stop);
    rig.step(20_128);

    assert_eq!(
        versions(&mut rig)
            .iter()
            .map(|version| version.track)
            .collect::<Vec<_>>(),
        [0, 3]
    );
    assert_eq!(
        notes_in(&rig, rig.control.project.patterns[0].tracks[0]),
        [played(480, 1_120, on_t1)]
    );
    assert_eq!(
        on_t4(&rig),
        [synth, syn_2, syn_3].map(|sound| played(960, 640, sound))
    );
}

#[test]
fn a_held_note_keeps_its_track_when_t1_to_t4_switch() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    let on_t3 = rig.control.project.pool.new_synth().unwrap();
    rig.control.project.tracks[2].put(0, Some(on_t3));
    rig.hit(6_000, 0, 100);
    rig.tap(7_000, Button::T3);

    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(on_t4(&rig), [played(480, 240, synth)]);
    hit_and_release(&mut rig, 12_000, 13_000);
    assert_eq!(
        notes_in(&rig, rig.control.project.patterns[0].tracks[2]),
        [played(960, 80, on_t3)]
    );
    assert_eq!(on_t4(&rig), [played(480, 240, synth)]);
}

#[test]
fn under_a_held_step_a_hit_is_not_recorded_and_with_a_picker_open_it_is() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.press(1_000, Button::Step(0));
    hit_and_release(&mut rig, 6_000, 7_000);
    rig.let_go(8_000, Button::Step(0));
    rig.step(8_128);
    // The hit toggled the held step's note in, as without REC.
    assert_eq!(on_t4(&rig), [entered(0, synth, 60)]);

    // The Pad page's sound picker.
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.menu(1_000, 2);
    rig.tap(1_010, Button::Ok);
    rig.step(1_100);
    assert!(matches!(rig.control.view.picker, Some((Picker::Sound, _))));
    hit_and_release(&mut rig, 6_000, 7_000);
    assert_eq!(on_t4(&rig), [played(480, 80, synth)]);
}

#[test]
#[allow(unsafe_code)]
fn a_full_pass_stores_nothing_more_and_says_full() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.hit(6_000, 0, 100);
    rig.step(6_128);
    fill_until(&rig, RESERVE);
    // SAFETY: the store lives while no step runs.
    let block = unsafe { rig.notes.store() }.take();

    rig.release(7_000, 0);
    rig.step(7_128);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);
    assert_eq!(said(&rig), Some(("Full", RECORD)));
    rig.tap(8_000, Button::Right);
    rig.step(8_128);
    assert_eq!(said(&rig), None);

    // SAFETY: as above. The block goes back, so the note memory has room again.
    let mut store = unsafe { rig.notes.store() };
    store.hold(Tree(Some(block)));
    store.release(Tree(Some(block)), None);
    rig.sent();
    rig.hit(12_000, 0, 100);
    rig.step(12_128);
    assert_eq!(
        rig.sent(),
        [message(4, 12_000, note_on(1, 3, synth, 60, 100))]
    );
    assert_eq!(said(&rig), Some(("Full", RECORD)));
    rig.release(13_000, 0);
    rig.step(13_128);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);

    rig.tap(20_000, Button::Rec);
    rig.tap(21_000, Button::Rec);
    hit_and_release(&mut rig, 24_000, 25_000);
    assert_eq!(on_t4(&rig), [played(1_920, 80, synth)]);
}

#[test]
fn a_held_note_whose_sound_is_deleted_is_dropped() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.hit(6_000, 0, 100);
    // POOL opens on the selected Syn 1, whose DELETE's question OK answers.
    rig.menu(6_100, 5);
    rig.tap(6_200, Button::Ok);
    rig.tap(6_300, Button::Ok);
    rig.tap(6_400, Button::Ok);
    rig.step(6_500);
    assert!(rig.control.project.pool.get(synth).is_none());

    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);
}

#[test]
fn a_held_note_past_a_new_shorter_length_is_dropped() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 4);
    // Tick 24,000: bar 4.
    rig.hit(300_000, 0, 100);
    rig.step(300_128);
    on_bars(&mut rig, 310_000);
    choose(&mut rig, 310_100, 0, &[Button::Up]);
    rig.step(310_200);
    assert_eq!(rig.control.project.patterns[0].bars, 2);

    // Past the bar line at 384,000, where bar 1 follows bar 4.
    rig.release(400_000, 0);
    rig.step(400_128);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);
    assert_eq!(count(&rig, synth), 0);
    assert_eq!(
        rig.control.project.pool.get(synth).unwrap().on_tracks,
        [0; 4]
    );
}

#[test]
fn the_note_strip_never_moves_a_note_against_the_turn() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.project.track = 3;
    let synth = rig.synth_on(0);
    put(
        &mut rig,
        0,
        3,
        &[
            Note {
                length: 15_360,
                ..entered(0, synth, 60)
            },
            Note {
                length: 10,
                ..entered(1, synth, 60)
            },
        ],
    );
    let lengths =
        |rig: &Rig<'_>| -> Vec<u32> { on_t4(rig).iter().map(|note| note.length).collect() };

    // LENGTH is encoder 3, 480 ticks a click.
    rig.press(10, Button::Step(0));
    rig.turn(20, 2, 1);
    rig.step(30);
    assert_eq!(lengths(&rig), [15_360, 10]);
    rig.turn(40, 2, -1);
    rig.step(50);
    assert_eq!(lengths(&rig), [14_880, 10]);
    rig.let_go(60, Button::Step(0));

    rig.press(70, Button::Step(1));
    rig.turn(80, 2, -1);
    rig.step(90);
    assert_eq!(lengths(&rig), [14_880, 10]);
    rig.turn(100, 2, 1);
    rig.step(110);
    assert_eq!(lengths(&rig), [14_880, 490]);
}

/// The points of the curve of `note`.
#[allow(unsafe_code)]
fn points_of(rig: &Rig<'_>, note: &Note) -> Vec<(u16, u8)> {
    // SAFETY: the reader lives while no step runs.
    curve::points(unsafe { rig.notes.reader() }.block(note.curve.expect("a curve"))).collect()
}

#[test]
fn pressure_while_recording_goes_into_the_notes_curve() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.tap(1_000, Button::PadsKeys);

    // Ticks 480, 500, 560 and 720.
    rig.note_on(6_000, 60, 100);
    rig.queue(
        6_250,
        Input::NotePressure {
            note: 60,
            pressure: 40,
        },
    );
    rig.queue(
        7_000,
        Input::NotePressure {
            note: 60,
            pressure: 45,
        },
    );
    rig.note_off(9_000, 60);
    rig.step(9_128);

    let [note] = on_t4(&rig)[..] else {
        panic!("one note on T4");
    };
    assert_eq!(
        note,
        Note {
            curve: note.curve,
            ..played(480, 240, synth)
        }
    );
    assert_eq!(points_of(&rig, &note), [(20, 40), (60, 45)]);
}

#[test]
fn channel_pressure_reaches_every_held_recorded_note() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    let syn_2 = rig.synth_on(1);

    // Ticks 480 and 520, which snaps to 480, then 560 and 720.
    rig.hit(6_000, 0, 100);
    rig.hit(6_500, 1, 100);
    rig.queue(7_000, Input::ChannelPressure { pressure: 50 });
    rig.release(9_000, 0);
    rig.release(9_000, 1);
    rig.step(9_128);

    let notes = on_t4(&rig);
    assert_eq!(
        notes,
        [
            Note {
                curve: notes[0].curve,
                ..played(480, 240, synth)
            },
            Note {
                curve: notes[1].curve,
                ..played(480, 200, syn_2)
            }
        ]
    );
    assert_eq!(points_of(&rig, &notes[0]), [(80, 50)]);
    assert_eq!(points_of(&rig, &notes[1]), [(40, 50)]);
}

#[test]
#[allow(unsafe_code)]
fn without_room_a_note_is_kept_without_its_curve() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.hit(6_000, 0, 100);
    rig.step(6_128);
    fill_until(&rig, RESERVE + 1);
    // SAFETY: the store lives while no step runs.
    let block = unsafe { rig.notes.store() }.take();

    rig.queue(
        6_250,
        Input::PadPressure {
            pad: 0,
            pressure: 40,
        },
    );
    rig.step(6_378);
    assert_eq!(ready(&rig), RESERVE);
    // SAFETY: as above. With room again a later pressure starts no curve either, as a curve starts
    // only at the first.
    unsafe { rig.notes.store() }.give_back(block);
    rig.queue(
        7_000,
        Input::PadPressure {
            pad: 0,
            pressure: 60,
        },
    );
    rig.step(7_128);
    assert_eq!(ready(&rig), RESERVE + 1);
    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(on_t4(&rig), [played(480, 240, synth)]);
}

#[test]
fn a_note_short_of_room_only_by_its_curve_is_kept_without_it() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.hit(6_000, 0, 100);
    rig.queue(
        6_250,
        Input::PadPressure {
            pad: 0,
            pressure: 40,
        },
    );
    rig.step(6_378);
    // Giving back the curve's block leaves `RESERVE` free.
    fill_until(&rig, RESERVE - 1);

    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(on_t4(&rig), [played(480, 240, synth)]);
    assert_eq!(said(&rig), None);
    assert_eq!(count(&rig, synth), 1);
}

#[test]
fn a_dropped_note_gives_its_curve_back() {
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    let before = ready(&rig);
    rig.hit(6_000, 0, 100);
    rig.queue(
        6_050,
        Input::PadPressure {
            pad: 0,
            pressure: 40,
        },
    );
    // POOL opens on the selected Syn 1, whose DELETE's question OK answers.
    rig.menu(6_100, 5);
    rig.tap(6_200, Button::Ok);
    rig.tap(6_300, Button::Ok);
    rig.tap(6_400, Button::Ok);
    rig.step(6_500);
    assert!(rig.control.project.pool.get(synth).is_none());
    assert_eq!(ready(&rig), before - 1);

    rig.release(9_000, 0);
    rig.step(9_128);

    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_t4(&rig), []);
    assert_eq!(ready(&rig), before);
}

#[test]
fn pressure_without_a_recorded_note_does_nothing() {
    /// Pressure from pad 1, MIDI note 60 and the channel at `sample`, stepped past: no block is
    /// taken and nothing is sent.
    fn presses_nothing(rig: &mut Rig<'_>, sample: u64) {
        let before = ready(rig);
        rig.queue(
            sample,
            Input::PadPressure {
                pad: 0,
                pressure: 40,
            },
        );
        rig.queue(
            sample,
            Input::NotePressure {
                note: 60,
                pressure: 40,
            },
        );
        rig.queue(sample, Input::ChannelPressure { pressure: 40 });
        rig.step(sample + 128);
        assert_eq!(ready(rig), before);
        assert_eq!(rig.sent(), []);
        assert_eq!(versions(rig), []);
    }

    // Stopped with no note on.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.project.track = 3;
    rig.synth_on(0);
    presses_nothing(&mut rig, 1_000);

    // Notes played while playing without REC.
    rig.tap(2_000, Button::Play);
    rig.hit(3_000, 0, 100);
    rig.note_on(3_000, 60, 100);
    rig.step(3_128);
    assert_eq!(rig.sent().len(), 3);
    presses_nothing(&mut rig, 4_000);

    // A recorded note still held after STOP ended its take.
    let queue = Queue::new();
    let (mut rig, synth) = recording(&queue, 1);
    rig.hit(6_000, 0, 100);
    rig.tap(9_000, Button::Stop);
    rig.step(9_128);
    rig.sent();
    versions(&mut rig);
    presses_nothing(&mut rig, 10_000);
    assert_eq!(on_t4(&rig), [played(480, 240, synth)]);
}
