//! ROLL: its screen, its cursor and the row it keeps (Workflow B).

use super::library::converted_with;
use super::pattern::{entered, put};
use super::timing::playing_4_bars;
use super::*;
use crate::param::ROOT_NOTE;
use crate::project::pool::{Engine, Sample};
use crate::storage::Path;
use view::StepCursor;

/// Names `sound`.
fn named(rig: &mut Rig<'_>, sound: SoundNumber, name: &str) {
    let label = &mut rig.control.project.pool.get_mut(sound).unwrap().name;
    *label = Label::new();
    label.push_str(name);
}

/// A rig on T2 with three new synths named as the factory project's T2 sounds: Bass on pad 1, Sub
/// on pad 2 and Acid on pad 3, in 4 bars of 4/4. Bass is selected.
fn on_t2(queue: &Queue<Message, MESSAGE_QUEUE>) -> (Rig<'_>, [SoundNumber; 3]) {
    let mut rig = Rig::new(queue);
    rig.control.project.track = 1;
    rig.control.project.patterns[0].bars = 4;
    let sounds = [("Bass", 0), ("Sub", 1), ("Acid", 2)].map(|(name, pad)| {
        let sound = rig.synth_on(pad);
        named(&mut rig, sound, name);
        sound
    });
    (rig, sounds)
}

/// What the control part draws on T2 with Bass selected, stopped in 4 bars: the header's pieces
/// `left`, then `main` and the strip's cells.
fn t2_drawn(
    left: &[(&str, Color)],
    main: impl FnOnce(&mut Screen),
    strip: &[Option<ItemView>; 4],
) -> Screen {
    let left: Vec<Piece> = left
        .iter()
        .map(|&(text, color)| Piece { text, color })
        .collect();
    let right = ["P1", "1/4", "120.0"].map(|text| Piece { text, color: TEXT });
    let mut screen = Screen::new();
    draw_header(&mut screen, &left, &right, None, false, "");
    main(&mut screen);
    draw_strip(&mut screen, strip);
    screen
}

/// Bass's notes at C2, G2 and C3, which put ROLL's row on F#2.
fn bass_notes(rig: &mut Rig<'_>, bass: SoundNumber) {
    put(
        rig,
        0,
        1,
        &[
            entered(0, bass, 36),
            entered(1, bass, 43),
            entered(2, bass, 48),
        ],
    );
}

/// ROLL's row and its top row.
fn row(rig: &Rig<'_>) -> (u8, u8) {
    let roll = rig.control.view.roll;
    (roll.pitch, roll.top)
}

/// Taps `button` `times` times from `sample` on, 10 samples apart and each with SHIFT held when
/// `shift`, and steps after each. Gives the sample the next tap may start at.
fn taps(rig: &mut Rig<'_>, mut sample: u64, button: Button, shift: bool, times: u64) -> u64 {
    for _ in 0..times {
        if shift {
            rig.press(sample, Button::Shift);
        }
        rig.tap(sample + 1, button);
        if shift {
            rig.let_go(sample + 3, Button::Shift);
        }
        rig.step(sample + 5);
        sample += 10;
    }
    sample
}

/// Hits and releases pad `pad` (0 to 11) at `sample` and steps.
fn hit(rig: &mut Rig<'_>, sample: u64, pad: u8) {
    rig.hit(sample, pad, 100);
    rig.release(sample + 5, pad);
    rig.step(sample + 10);
}

/// Makes `sound` a sample sound whose file is missing, with Root note `root`.
fn sampled(rig: &mut Rig<'_>, sound: SoundNumber, root: i32) {
    let mut path = Path::new();
    path.push_str("samples/roll.wav");
    let sound = rig.control.project.pool.get_mut(sound).unwrap();
    sound.engine = Engine::Sample(Sample::Missing(path));
    sound.set(ROOT_NOTE.id, root);
}

#[test]
fn menu_2_and_the_roll_button_show_roll() {
    let queue = Queue::new();
    let (mut rig, _) = on_t2(&queue);
    let roll = view::Screen::Roll;

    // MENU + 2 shows ROLL, whose tile is the current one, and lights the ROLL light.
    rig.press(0, Button::Menu);
    rig.press(10, Button::Step(1));
    rig.step(11);
    assert_eq!(rig.control.view.screen, roll);
    assert!(shows(
        &rig.control,
        &t2_drawn(
            &[
                ("Menu", ACCENT),
                ("T2", TEXT),
                ("Bass", TEXT),
                ("Pads", DIM)
            ],
            |screen| {
                draw_tiles(screen, &menu_tiles(roll), 0);
            },
            &[None; 4],
        )
    ));
    rig.let_go(20, Button::Step(1));
    rig.let_go(30, Button::Menu);
    rig.step(31);
    assert_eq!(rig.lit(), [pad(0), track(1), Lights::ROLL]);

    // SOUND turns the light off, and the ROLL button shows ROLL again, which it keeps showing.
    rig.menu(100, 2);
    rig.step(110);
    assert_eq!(rig.control.view.screen, view::Screen::Sound);
    assert_eq!(rig.lit(), [pad(0), track(1)]);
    for at in [200, 300] {
        rig.tap(at, Button::Roll);
        rig.step(at + 10);
        assert_eq!(rig.control.view.screen, roll);
        assert_eq!(rig.lit(), [pad(0), track(1), Lights::ROLL]);
    }

    // Under MENU, and with the sound picker open, ROLL is taken.
    rig.menu(400, 2);
    rig.press(500, Button::Menu);
    rig.tap(510, Button::Roll);
    rig.let_go(520, Button::Menu);
    rig.step(530);
    assert_eq!(rig.control.view.screen, view::Screen::Sound);
    rig.tap(600, Button::Ok);
    rig.tap(610, Button::Roll);
    rig.step(620);
    assert_eq!(rig.control.view.screen, view::Screen::Sound);
    assert!(matches!(rig.control.view.picker, Some((Picker::Sound, _))));
}

#[test]
fn the_roll_button_stops_the_preview_it_leaves_samples_with() {
    let queue = Queue::new();
    let file = || converted_with(4_800, 1, 60, None);
    let mut rig = Rig::with_files(
        &queue,
        &[("samples/a.wav", file()), ("samples/b.wav", file())],
    );
    rig.open();
    // MENU + 10 shows SAMPLES, where a Down starts b.wav's preview.
    rig.menu(10, 9);
    rig.tap(20, Button::Down);
    rig.step(30);
    assert_eq!(rig.sent().len(), 1);

    rig.tap(100, Button::Roll);
    rig.step(110);

    assert_eq!(rig.control.view.screen, view::Screen::Roll);
    assert_eq!(rig.sent(), [message(1, 100, MessageKind::StopPreview)]);
}

#[test]
fn roll_uses_sounds_pages_as_step_does() {
    let queue = Queue::new();
    let (mut rig, _) = on_t2(&queue);
    rig.menu(0, 1);
    rig.page(10, 2);
    rig.step(20);
    let sound = view::Screen::Sound;
    let rolled = rig.control.view.roll;

    // PAGE + 3 on ROLL shows SOUND's Filter page under it: the encoders hold its items.
    assert_eq!(rig.control.view.screen, view::Screen::Roll);
    assert_eq!(rig.control.view.page(sound), 2);
    assert_eq!(rig.control.encoder_items(), rig.control.items(sound));
    assert_eq!(
        rig.control.encoder_items()[1].kind,
        ItemKind::Param(CUTOFF.id)
    );
    assert_eq!(rig.control.cursor(sound).item, 0);

    // Encoder 2 changes Cutoff and moves SOUND's cursor onto it, and ROLL's row stays.
    let cutoff = rig.control.value(CUTOFF.id);
    rig.turn(30, 1, -5);
    rig.step(40);
    assert_ne!(rig.control.value(CUTOFF.id), cutoff);
    assert_eq!(rig.control.cursor(sound).item, 1);
    assert_eq!(rig.control.view.roll, rolled);
    assert_eq!(rig.control.view.screen, view::Screen::Roll);

    // An empty pad has no page to hold.
    hit(&mut rig, 100, 11);
    rig.sent();
    assert_eq!(rig.control.encoder_items(), []);
    rig.turn(130, 1, 5);
    rig.step(140);
    assert_eq!(rig.sent(), []);
}

#[test]
fn the_rows_run_from_g9_down_to_c_minus_1() {
    let queue = Queue::new();
    let (mut rig, _) = on_t2(&queue);
    rig.menu(0, 1);
    rig.step(10);
    assert_eq!(row(&rig), (60, 67));

    // Up 67 times from C4 reaches G9. The top row follows one row a move once the cursor
    // reaches it, and stops at G9.
    let mut at = 100;
    for pitch in 61..=127u8 {
        at = taps(&mut rig, at, Button::Up, false, 1);
        assert_eq!(row(&rig), (pitch, (pitch + 1).clamp(67, 127)));
    }
    at = taps(&mut rig, at, Button::Up, false, 1);
    assert_eq!(row(&rig), (127, 127));

    // SHIFT + down is an octave; the top row jumps in one go to keep the cursor on screen.
    at = taps(&mut rig, at, Button::Down, true, 1);
    assert_eq!(row(&rig), (115, 127));
    at = taps(&mut rig, at, Button::Down, true, 1);
    assert_eq!(row(&rig), (103, 117));

    // Down to C-1 stops there, with its row at the bottom.
    at = taps(&mut rig, at, Button::Down, true, 8);
    assert_eq!(row(&rig).0, 7);
    at = taps(&mut rig, at, Button::Down, false, 7);
    assert_eq!(row(&rig), (0, 15));
    at = taps(&mut rig, at, Button::Down, false, 1);
    assert_eq!(row(&rig), (0, 15));

    // SHIFT + down from C#-1 + 4 stops at C-1 as well.
    at = taps(&mut rig, at, Button::Up, false, 5);
    assert_eq!(row(&rig), (5, 15));
    taps(&mut rig, at, Button::Down, true, 1);
    assert_eq!(row(&rig), (0, 15));
}

#[test]
fn left_and_right_move_the_shared_cursor() {
    let queue = Queue::new();
    let (mut rig, _) = on_t2(&queue);
    rig.menu(0, 1);
    rig.step(10);

    taps(&mut rig, 100, Button::Right, false, 5);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 5 });

    // STEP shows the same bar and sixteenth.
    rig.menu(1_000, 0);
    rig.step(1_010);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert_eq!(rig.control.cursor_at(1_010), StepCursor { bar: 0, step: 5 });

    // An arrow on ROLL into bar 2 stops following, as it does on STEP.
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);
    rig.menu(120, 1);
    rig.step(200_000);
    assert_eq!(rig.control.view.screen, view::Screen::Roll);
    assert!(rig.control.view.following);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 0 });

    // Bar 3 plays, so left from its first sixteenth is bar 2's last.
    taps(&mut rig, 200_100, Button::Left, false, 1);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 1, step: 15 });
    assert!(!rig.control.view.following);
}

#[test]
fn the_first_cell_is_shared_and_kept_with_each_screens_columns() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    // A label of 12 characters leaves STEP 49 columns, and ROLL has 55.
    named(&mut rig, bass, "Žluťoučký kůň");
    rig.control.project.patterns[0].bars = 8;
    assert_eq!(rig.control.step_columns(), (77, 49));

    // On STEP the cursor on cell 60 moves the view a beat at a time to 16.
    rig.control.view.steps = StepCursor { bar: 3, step: 12 };
    rig.step(10);
    assert_eq!(rig.control.view.step_view.first_cell, 16);

    // ROLL keeps that first cell, as the cursor shows on it already.
    rig.menu(20, 1);
    rig.step(30);
    assert_eq!(rig.control.view.screen, view::Screen::Roll);
    assert_eq!(rig.control.view.step_view.first_cell, 16);

    // The cursor on cell 110 moves it for ROLL's 55 columns: cell 110 is the 51st.
    rig.control.view.steps = StepCursor { bar: 6, step: 14 };
    rig.step(40);
    assert_eq!(rig.control.view.step_view.first_cell, 60);

    // Back on STEP the first cell is kept for its 49 columns, 64 to 112.
    rig.menu(50, 0);
    rig.step(60);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert_eq!(rig.control.view.step_view.first_cell, 64);
}

#[test]
fn roll_opens_on_the_middle_of_the_selected_sounds_notes() {
    let queue = Queue::new();
    let (mut rig, [bass, sub, _]) = on_t2(&queue);
    // Sub's note at F#4 does not count: the selected sound is Bass.
    put(
        &mut rig,
        0,
        1,
        &[
            entered(0, bass, 36),
            entered(1, bass, 43),
            entered(2, bass, 48),
            entered(3, sub, 70),
        ],
    );

    rig.menu(0, 1);
    rig.step(10);

    // Halfway between C2 and C3 is F#2, and the top row is 7 above it.
    assert_eq!(row(&rig), (42, 49));
}

#[test]
fn a_sound_without_notes_opens_at_its_unchanged_pitch() {
    let queue = Queue::new();
    let (mut rig, [bass, _, acid]) = on_t2(&queue);
    bass_notes(&mut rig, bass);
    rig.menu(0, 1);
    rig.step(10);
    assert_eq!(row(&rig), (42, 49));

    // Sub has no notes: a synth's unchanged pitch is C4.
    hit(&mut rig, 100, 1);
    assert_eq!(row(&rig), (60, 67));

    // A sample sound's is its Root note, with the top row held at the bottom.
    sampled(&mut rig, acid, 3);
    hit(&mut rig, 200, 2);
    assert_eq!(row(&rig), (3, 15));

    // And at the top.
    sampled(&mut rig, acid, 125);
    hit(&mut rig, 300, 1);
    hit(&mut rig, 400, 2);
    assert_eq!(row(&rig), (125, 127));
}

#[test]
fn roll_comes_back_on_the_row_it_left_with_the_same_sound() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    bass_notes(&mut rig, bass);
    rig.menu(0, 1);
    rig.step(10);
    assert_eq!(row(&rig), (42, 49));

    let at = taps(&mut rig, 100, Button::Down, false, 10);
    let left = row(&rig);
    assert_eq!(left.0, 32);

    rig.menu(at, 0);
    rig.menu(at + 100, 1);
    rig.step(at + 200);

    assert_eq!(rig.control.view.screen, view::Screen::Roll);
    assert_eq!(row(&rig), left);
}

#[test]
fn another_sound_or_track_centres_roll_again() {
    let queue = Queue::new();
    let (mut rig, [bass, sub, _]) = on_t2(&queue);
    put(
        &mut rig,
        0,
        1,
        &[
            entered(0, bass, 36),
            entered(1, bass, 43),
            entered(2, bass, 48),
            entered(3, sub, 50),
            entered(4, sub, 54),
        ],
    );
    rig.control.project.track = 2;
    let lead = rig.synth_on(0);
    rig.control.project.track = 1;
    put(
        &mut rig,
        0,
        2,
        &[entered(0, lead, 60), entered(1, lead, 72)],
    );
    rig.menu(0, 1);
    rig.step(10);
    assert_eq!(row(&rig), (42, 49));

    // Pad 2 puts Sub's middle, F#3, on the row.
    hit(&mut rig, 100, 1);
    assert_eq!(row(&rig), (52, 59));

    // Pad 2 again selects what is selected: the row stays where the cursor moved it.
    taps(&mut rig, 200, Button::Down, false, 3);
    assert_eq!(row(&rig), (49, 59));
    hit(&mut rig, 300, 1);
    assert_eq!(row(&rig), (49, 59));

    // T3's selected sound is Lead.
    rig.tap(400, Button::T3);
    rig.step(410);
    assert_eq!(row(&rig), (66, 73));

    // A key in KEYS mode selects nothing.
    rig.tap(500, Button::PadsKeys);
    hit(&mut rig, 510, 4);
    assert_eq!(row(&rig), (66, 73));

    // T2 has Sub selected, and POOL selects Bass there.
    rig.tap(600, Button::T2);
    rig.step(610);
    assert_eq!(row(&rig), (52, 59));
    rig.menu(700, 5);
    rig.tap(710, Button::Up);
    rig.step(720);
    assert_eq!(rig.track().selected_sound, Some(bass));
    assert_eq!(row(&rig), (52, 59));
    rig.menu(800, 1);
    rig.step(810);
    assert_eq!(row(&rig), (42, 49));
}

#[test]
fn an_empty_pad_leaves_roll_on_its_row() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    bass_notes(&mut rig, bass);
    rig.menu(0, 1);
    rig.step(10);
    rig.control.view.roll.pitch = 50;
    rig.control.view.roll.top = 57;

    // Pad 12 is empty: it selects no sound, and the row stays.
    hit(&mut rig, 100, 11);
    assert_eq!(rig.track().selected_sound, None);
    assert_eq!(row(&rig), (50, 57));

    // The next sound selected centres.
    hit(&mut rig, 200, 0);
    assert_eq!(row(&rig), (42, 49));
}

#[test]
fn the_header_names_roll_only() {
    let queue = Queue::new();
    let (mut rig, _) = on_t2(&queue);
    rig.menu(0, 1);
    rig.step(10);

    // The strip is the selected sound's page, SOUND's Pad page, which the header does not name.
    assert!(shows_frame(
        &rig.control,
        &t2_drawn(
            &[
                ("Roll", ACCENT),
                ("T2", TEXT),
                ("Bass", TEXT),
                ("Pads", DIM)
            ],
            |_| {},
            &[
                Some(sound("Bass")),
                Some(copy("on 1 pad")),
                Some(engine("Synth")),
                None
            ],
        )
    ));
}
