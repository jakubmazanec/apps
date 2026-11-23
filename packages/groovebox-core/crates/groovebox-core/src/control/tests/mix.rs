//! Muting: SHIFT + T1 to T4, the header that names the muted tracks and their blinking buttons.

use super::*;

/// Track `track` (0 to 3) muted when `value` is 1, unmuted when it is 0.
fn mute(track: u8, value: i32) -> MessageKind {
    MessageKind::SetParam {
        target: Target::Track(track),
        id: MUTE.id,
        value,
    }
}

/// SHIFT + T3 in the state the rig is in: track 3's mute flips, that message alone goes out and
/// nothing else of the control part changes.
fn flips_track_3(rig: &mut Rig<'_>) {
    rig.step(500);
    assert_eq!(rig.sent(), []);
    let (mut tracks, view, overlay) = (
        rig.control.project.tracks,
        rig.control.view,
        rig.control.overlay(),
    );
    rig.press(1_000, Button::Shift);
    rig.tap(1_010, Button::T3);
    rig.let_go(1_020, Button::Shift);

    rig.step(1_100);

    tracks[2].set(MUTE.id, 1);
    assert_eq!(rig.sent(), [message(0, 1_010, mute(2, 1))]);
    assert_eq!(rig.control.project.tracks, tracks);
    assert_eq!(rig.control.project.track, 0);
    assert_eq!(rig.control.view, view);
    assert_eq!(rig.control.overlay(), overlay);
}

#[test]
fn shift_and_a_track_button_mutes_and_unmutes_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Shift);
    rig.tap(10, Button::T2);
    rig.let_go(20, Button::Shift);

    rig.step(128);

    assert_eq!(rig.sent(), [message(0, 10, mute(1, 1))]);
    assert!(rig.control.project.tracks[1].muted());
    assert_eq!(rig.control.project.track, 0);

    rig.press(200, Button::Shift);
    rig.tap(210, Button::T2);
    rig.let_go(220, Button::Shift);

    rig.step(256);

    assert_eq!(rig.sent(), [message(1, 210, mute(1, 0))]);
    assert!(!rig.control.project.tracks[1].muted());
    assert_eq!(rig.control.project.track, 0);
}

#[test]
fn muting_works_wherever_shift_and_a_track_button_can_be_pressed() {
    // The sound picker of the empty pad 1.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.step(30);
    assert!(matches!(rig.control.view.picker, Some((Picker::Sound, _))));
    flips_track_3(&mut rig);

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
    flips_track_3(&mut rig);

    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(10, Button::Menu);
    rig.step(20);
    assert_eq!(rig.control.overlay(), Some(Button::Menu));
    flips_track_3(&mut rig);

    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(10, Button::Page);
    rig.step(20);
    assert_eq!(rig.control.overlay(), Some(Button::Page));
    flips_track_3(&mut rig);

    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.press(10, Button::Step(0));
    rig.step(20);
    flips_track_3(&mut rig);
}

#[test]
fn the_header_names_the_muted_tracks_after_the_metronome() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.settings.set(METRONOME.id, 1);
    rig.press(0, Button::Shift);
    rig.tap(10, Button::T2);
    rig.tap(20, Button::T4);
    rig.let_go(30, Button::Shift);

    rig.step(128);

    let mut expected = Screen::new();
    draw_header(
        &mut expected,
        &STEP_HEADER.map(|(text, color)| Piece { text, color }),
        &["P1", "1/1", "120.0"].map(|text| Piece { text, color: TEXT }),
        true,
        "Mute 2 4",
    );
    draw_strip(&mut expected, &[None; 4]);
    assert!(shows_frame(&rig.control, &expected));
    // "Mute 2 4" ends at x 475 and the metronome's icon 6 pixels before it.
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 400..=479, 4..=10, DIM), Some((416, 475)));

    // A message takes the place of all of it.
    rig.control.say("Storage full. Not saved", RECORD);
    rig.step(256);
    assert!(shows_frame(
        &rig.control,
        &drawn(
            &STEP_HEADER,
            Some(("Storage full. Not saved", RECORD)),
            |_| {},
            &[None; 4]
        )
    ));
}

#[test]
fn a_muted_track_blinks_once_a_second() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    for track in [0, 2] {
        rig.control.project.tracks[track].set(MUTE.id, 1);
    }

    // Lit for half a second from sample 0, then dark for half a second, again and again; the
    // unmuted T2 never lights, though the muted T1 is the selected track.
    for (sample, lit) in [
        (0, true),
        (23_999, true),
        (24_000, false),
        (47_999, false),
        (48_000, true),
    ] {
        rig.step(sample);
        let expected: &[u32] = if lit {
            &[pad(0), track(0), track(2)]
        } else {
            &[pad(0)]
        };
        assert_eq!(rig.lit(), expected, "sample {sample}");
    }

    // Unmuted, the selected T1 is lit steadily and T3 goes on blinking.
    rig.press(60_000, Button::Shift);
    rig.tap(60_010, Button::T1);
    rig.let_go(60_020, Button::Shift);
    rig.step(72_000);
    assert_eq!(rig.lit(), [pad(0), track(0)]);
    rig.step(96_000);
    assert_eq!(rig.lit(), [pad(0), track(0), track(2)]);
}

#[test]
fn a_muted_tracks_pattern_lights_no_pad() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    // Syn 1's note in step 1, with the empty pad 2 selected again.
    rig.tap(100, Button::Step(0));
    rig.hit(110, 1, 100);
    rig.release(120, 1);
    rig.press(200, Button::Shift);
    rig.tap(210, Button::T1);
    rig.let_go(220, Button::Shift);
    rig.press(9_600, Button::Play);

    // At the note's sample, 9,600, pad 1 stays dark.
    rig.step(9_601);
    assert_eq!(rig.lit(), [pad(1), step(0), track(0), Lights::PLAY]);

    // Unmuted after it, the note is not caught up; the next pass, from sample 105,600, lights it.
    rig.press(12_000, Button::Shift);
    rig.tap(12_010, Button::T1);
    rig.let_go(12_020, Button::Shift);
    rig.step(13_000);
    assert_eq!(rig.lit(), [pad(1), step(0), track(0), Lights::PLAY]);
    rig.step(105_601);
    assert_eq!(rig.lit(), [pad(0), pad(1), step(0), track(0), Lights::PLAY]);
}
