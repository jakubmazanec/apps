//! The NOTE panel: OK on a cell with notes opens it over STEP or ROLL, and its four items edit the
//! cell's notes as the NOTE strip edits a held step's (Workflow B, Look).

use super::pattern::{count, entered, fill_until, notes_in, put, versions};
use super::roll::{at_cell, on_t2, row, taps};
use super::step_view::note_strip;
use super::timing::playing_4_bars;
use super::*;
use crate::control::step_view::place_of;
use crate::project::FOUR_FOUR;
use crate::store::note::Note;
use crate::ui::layout::rect;
use view::{NotePanel, StepCursor};

/// A note of `sound` at `pitch` and velocity 100 in sixteenth `step` of bar `bar` (from 0).
fn soft(bar: u16, step: u16, sound: SoundNumber, pitch: u8) -> Note {
    Note {
        bar,
        velocity: 100,
        ..entered(step, sound, pitch)
    }
}

/// A rig on T2's STEP, as `on_t2` makes it, with a chord of Bass at C3 and E3 at velocity 100 in
/// sixteenth 3 of bar 1 and the cursor on it, in Bass's lane.
fn chord(queue: &Queue<Message, MESSAGE_QUEUE>) -> (Rig<'_>, [SoundNumber; 3]) {
    let (mut rig, sounds) = on_t2(queue);
    put(
        &mut rig,
        0,
        1,
        &[soft(0, 3, sounds[0], 48), soft(0, 3, sounds[0], 52)],
    );
    rig.control.view.steps = StepCursor { bar: 0, step: 3 };
    (rig, sounds)
}

/// Whether the control part draws the strip as these items and the NOTE panel as the same items
/// unnumbered, in a box over whatever lies under it with the cursor on item `cursor`.
fn panel_shows(rig: &Rig<'_>, items: &[Option<ItemView>; 4], cursor: i32) -> bool {
    let mut expected = Screen::new();
    expected.outline_rect(rect(178, 96, 124, 77), LINE);
    for (y, item) in (99..).step_by(18).zip(items) {
        draw_item(&mut expected, 181, y, 118, &item.unwrap(), false, None);
    }
    draw_cursor(&mut expected, 181, 99 + 18 * cursor, 118, 17);
    draw_strip(&mut expected, items);
    let actual = picture(&rig.control);
    let shows = |x, y| actual.pixel(x, y) == expected.pixel(x, y);
    (178..302).all(|x| (96..173).all(|y| shows(x, y)))
        && (0..WIDTH).all(|x| (STRIP_LINE as usize..HEIGHT).all(|y| shows(x, y)))
}

/// The chord's items: C3 to E3 at velocity 100, a sixteenth long, `position` from its cell.
fn chord_items(position: &str) -> [Option<ItemView<'_>>; 4] {
    note_strip(
        ("C3–E3", Bar::Track),
        ("100", Bar::Fill(100, 127)),
        "1/16",
        position,
    )
}

#[test]
fn ok_on_a_cell_with_notes_opens_the_panel_on_pitch() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = chord(&queue);
    let before = rig.control.track_tree();

    // - is held from before OK: it stops repeating once the panel opens, where it would lower the
    // pitch.
    rig.press(100, Button::Minus);
    rig.tap(200, Button::Ok);
    rig.let_go(200 + REPEAT_DELAY + 5 * REPEAT_EVERY, Button::Minus);
    rig.step(200 + REPEAT_DELAY + 10 * REPEAT_EVERY);

    assert_eq!(
        rig.control.view.note_panel,
        Some(NotePanel {
            item: 0,
            from: StepCursor { bar: 0, step: 3 }
        })
    );
    assert_eq!(rig.control.track_tree(), before);
    assert_eq!(
        notes_in(&rig, before),
        [soft(0, 3, bass, 48), soft(0, 3, bass, 52)]
    );
    assert_eq!(count(&rig, bass), 2);
    assert_eq!(versions(&mut rig), []);

    // ROLL at E3: OK opens it on that cell, which holds E3 alone.
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = chord(&queue);
    at_cell(&mut rig, 52, 3);
    let before = rig.control.track_tree();

    rig.tap(100, Button::Ok);
    rig.step(110);

    assert_eq!(
        rig.control.view.note_panel,
        Some(NotePanel {
            item: 0,
            from: StepCursor { bar: 0, step: 3 }
        })
    );
    assert_eq!(
        rig.control.held_values.map(|held| held.pitch),
        Some((52, 52))
    );
    assert_eq!(rig.control.track_tree(), before);
    assert_eq!(count(&rig, bass), 2);
    assert_eq!(versions(&mut rig), []);
}

#[test]
fn the_panel_shows_its_cells_notes() {
    let queue = Queue::new();
    let (mut rig, _) = chord(&queue);

    rig.tap(100, Button::Ok);
    rig.step(110);

    assert!(panel_shows(&rig, &chord_items("+0"), 0));

    // ROLL at E3.
    let queue = Queue::new();
    let (mut rig, _) = chord(&queue);
    at_cell(&mut rig, 52, 3);

    rig.tap(100, Button::Ok);
    rig.step(110);

    assert!(panel_shows(
        &rig,
        &note_strip(
            ("E3", Bar::Fill(52, 127)),
            ("100", Bar::Fill(100, 127)),
            "1/16",
            "+0"
        ),
        0
    ));
}

#[test]
fn the_arrows_minus_plus_and_the_encoders_edit_it() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = chord(&queue);
    rig.tap(100, Button::Ok);
    rig.step(110);
    let item = |rig: &Rig<'_>| rig.control.view.note_panel.unwrap().item;
    let values = |rig: &Rig<'_>| -> Vec<(u8, u32)> {
        notes_in(rig, rig.control.track_tree())
            .iter()
            .map(|note| (note.velocity, note.length))
            .collect()
    };

    // Down twice: Length, where + adds a sixteenth and SHIFT + - takes a fine click off.
    let at = taps(&mut rig, 200, Button::Down, false, 2);
    assert_eq!(item(&rig), 2);
    let at = taps(&mut rig, at, Button::Plus, false, 1);
    assert_eq!(values(&rig), [(100, 960), (100, 960)]);
    let at = taps(&mut rig, at, Button::Minus, true, 1);
    assert_eq!(values(&rig), [(100, 930), (100, 930)]);
    assert_eq!(versions(&mut rig).len(), 2);

    // Down past Position stays on Position, and up past Pitch on Pitch.
    let at = taps(&mut rig, at, Button::Down, false, 2);
    assert_eq!(item(&rig), 3);
    let at = taps(&mut rig, at, Button::Up, false, 4);
    assert_eq!(item(&rig), 0);

    // Left, right and SHIFT + down do nothing.
    let view = rig.control.view;
    let tree = rig.control.track_tree();
    let at = taps(&mut rig, at, Button::Left, false, 1);
    let at = taps(&mut rig, at, Button::Right, false, 1);
    let at = taps(&mut rig, at, Button::Down, true, 1);
    assert_eq!(rig.control.view, view);
    assert_eq!(rig.control.track_tree(), tree);

    // Encoder 2 changes Velocity and puts the panel's cursor on it.
    rig.turn(at, 1, 5);
    rig.step(at + 10);
    assert_eq!(values(&rig), [(105, 930), (105, 930)]);
    assert_eq!(item(&rig), 1);
    versions(&mut rig);

    // - held: a click at its press, after 400 ms another and then one every 50 ms.
    let at = at + 100;
    rig.press(at, Button::Minus);
    rig.step(at + REPEAT_DELAY);
    assert_eq!(values(&rig), [(104, 930), (104, 930)]);
    rig.step(at + REPEAT_DELAY + 1);
    assert_eq!(values(&rig), [(103, 930), (103, 930)]);
    rig.step(at + REPEAT_DELAY + REPEAT_EVERY + 1);
    assert_eq!(values(&rig), [(102, 930), (102, 930)]);
    rig.let_go(at + REPEAT_DELAY + REPEAT_EVERY + 2, Button::Minus);
    rig.step(at + REPEAT_DELAY + 3 * REPEAT_EVERY);
    assert_eq!(values(&rig), [(102, 930), (102, 930)]);
    assert_eq!(versions(&mut rig).len(), 3);
    assert_eq!(count(&rig, bass), 2);
}

#[test]
fn position_carries_the_cell_and_the_view_with_the_notes() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    let notes = |bar, step| [soft(bar, step, bass, 48), soft(bar, step, bass, 52)];
    put(&mut rig, 0, 1, &notes(0, 15));
    rig.control.view.steps = StepCursor { bar: 0, step: 15 };
    rig.tap(100, Button::Ok);
    let at = taps(&mut rig, 200, Button::Down, false, 3);

    // From bar 1's last sixteenth into bar 2's first, the cursor with them.
    let at = taps(&mut rig, at, Button::Plus, false, 1);
    assert_eq!(notes_in(&rig, rig.control.track_tree()), notes(1, 0));
    assert_eq!(rig.control.view.steps, StepCursor { bar: 1, step: 0 });
    assert!(panel_shows(&rig, &chord_items("+1"), 3));

    // Back twice: the same notes, one before the cell the panel opened on.
    taps(&mut rig, at, Button::Minus, false, 2);
    assert_eq!(notes_in(&rig, rig.control.track_tree()), notes(0, 14));
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 14 });
    assert!(panel_shows(&rig, &chord_items("\u{2212}1"), 3));
    assert_eq!(count(&rig, bass), 2);

    // Onto the view's last column: the view moves a beat.
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    let last = rig.control.step_columns().1 - 1;
    let before = place_of(last - 1, FOUR_FOUR).unwrap();
    let notes = |at: StepCursor| {
        [
            soft(at.bar, u16::from(at.step), bass, 48),
            soft(at.bar, u16::from(at.step), bass, 52),
        ]
    };
    put(&mut rig, 0, 1, &notes(before));
    rig.control.view.steps = before;
    rig.tap(100, Button::Ok);
    rig.turn(200, 3, 1);
    rig.step(210);
    let on_last = place_of(last, FOUR_FOUR).unwrap();
    assert_eq!(notes_in(&rig, rig.control.track_tree()), notes(on_last));
    assert_eq!(rig.control.view.steps, on_last);
    assert_eq!(rig.control.view.step_view.first_cell, 4);

    // A turn past the pattern's last sixteenth stops there.
    rig.turn(300, 3, 20);
    rig.step(310);
    let end = StepCursor { bar: 3, step: 15 };
    assert_eq!(notes_in(&rig, rig.control.track_tree()), notes(end));
    assert_eq!(rig.control.view.steps, end);
    assert_eq!(
        rig.control.held_values.map(|held| held.position),
        Some((10, 10))
    );
    assert_eq!(count(&rig, bass), 2);
}

#[test]
fn pitch_on_roll_carries_the_row_and_stops_at_the_ends() {
    // E3 under a top row of F#3: 3 up is G3, and the top row moves up to keep it on screen with a
    // row above it, as an arrow up there would.
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    put(&mut rig, 0, 1, &[entered(3, bass, 52)]);
    at_cell(&mut rig, 52, 3);
    rig.control.view.roll.top = 54;
    rig.tap(100, Button::Ok);
    rig.turn(200, 0, 3);
    rig.step(210);
    assert_eq!(
        notes_in(&rig, rig.control.track_tree()),
        [entered(3, bass, 55)]
    );
    assert_eq!(row(&rig), (55, 56));
    assert_eq!(rig.control.view.note_panel.unwrap().item, 0);

    // F#9 up 5 stops at G9, and C#-1 down 5 at C-1, the row with it.
    for (pitch, clicks, to, top) in [(126, 5, 127, 127), (1, -5, 0, 15)] {
        let queue = Queue::new();
        let (mut rig, [bass, ..]) = on_t2(&queue);
        put(&mut rig, 0, 1, &[entered(3, bass, pitch)]);
        at_cell(&mut rig, pitch, 3);
        rig.tap(100, Button::Ok);
        rig.turn(200, 0, clicks);
        rig.step(210);
        assert_eq!(
            notes_in(&rig, rig.control.track_tree()),
            [entered(3, bass, to)],
            "from {pitch}"
        );
        assert_eq!(row(&rig), (to, top), "from {pitch}");
    }
}

#[test]
fn a_moved_note_replaces_the_one_it_lands_on() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = on_t2(&queue);
    let moved = soft(0, 3, bass, 52);
    put(&mut rig, 0, 1, &[moved, entered(3, bass, 53)]);
    at_cell(&mut rig, 52, 3);
    rig.tap(100, Button::Ok);

    taps(&mut rig, 200, Button::Plus, false, 1);

    assert_eq!(
        notes_in(&rig, rig.control.track_tree()),
        [Note { pitch: 53, ..moved }]
    );
    assert_eq!(count(&rig, bass), 1);
    assert_eq!(row(&rig).0, 53);
}

#[test]
fn cancel_closes_the_panel_on_its_cell() {
    let queue = Queue::new();
    let (mut rig, [bass, ..]) = chord(&queue);
    rig.tap(100, Button::Ok);
    rig.turn(200, 3, 2);
    rig.step(210);
    let moved = [soft(0, 5, bass, 48), soft(0, 5, bass, 52)];
    assert_eq!(notes_in(&rig, rig.control.track_tree()), moved);
    versions(&mut rig);
    let view = rig.control.view;

    // SHIFT + CANCEL is taken: nothing changes and the panel stays.
    rig.press(300, Button::Shift);
    rig.tap(310, Button::Cancel);
    rig.let_go(320, Button::Shift);
    rig.step(330);
    assert_eq!(rig.control.view, view);
    assert_eq!(notes_in(&rig, rig.control.track_tree()), moved);

    // A tap closes it with the cursor on the cell the notes moved to, and removes none.
    rig.tap(400, Button::Cancel);
    rig.step(410);
    assert_eq!(rig.control.view.note_panel, None);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 0, step: 5 });
    assert_eq!(notes_in(&rig, rig.control.track_tree()), moved);
    assert_eq!(count(&rig, bass), 2);
    assert_eq!(versions(&mut rig), []);
}

#[test]
fn the_panel_stops_following_and_play_follows_once_it_closes() {
    // Bar 2 starts at sample 96,100 and bar 4 at 288,100. STEP's 55 columns show bar 4's eighth
    // sixteenth, cell 55, only once the view moves a beat.
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(7, syn_1, 60)]);
    rig.menu(120, 0);
    rig.step(130);
    rig.control.view.steps.step = 7;
    assert!(rig.control.view.following);

    rig.tap(1_000, Button::Ok);
    rig.step(1_010);
    assert!(!rig.control.view.following);
    assert!(rig.control.view.note_panel.is_some());

    // The music in bar 2: the cursor and the step buttons stay on bar 1, and the panel edits it.
    let at_1 = StepCursor { bar: 0, step: 7 };
    rig.step(100_000);
    assert_eq!(rig.control.cursor_at(100_000), at_1);
    assert!(rig.lit().contains(&step(7)));
    rig.turn(100_100, 1, -10);
    rig.step(100_110);
    assert_eq!(
        notes_in(&rig, rig.control.track_tree()),
        [Note {
            velocity: 117,
            ..entered(7, syn_1, 60)
        }]
    );

    // PLAY follows again, and bar 1 stays while the panel is open, the view too as bar 4 plays.
    rig.tap(100_200, Button::Play);
    rig.step(100_210);
    assert!(rig.control.view.following);
    assert_eq!(rig.control.cursor_at(100_210), at_1);
    rig.step(288_200);
    assert_eq!(rig.control.cursor_at(288_200), at_1);
    assert_eq!(rig.control.view.step_view.first_cell, 0);
    assert!(rig.control.view.note_panel.is_some());

    // CANCEL: the cursor is in the bar playing, and the view moves to show it.
    rig.tap(288_300, Button::Cancel);
    rig.step(288_310);
    assert_eq!(rig.control.view.note_panel, None);
    assert_eq!(
        rig.control.cursor_at(288_310),
        StepCursor { bar: 3, step: 7 }
    );
    assert_eq!(rig.control.view.step_view.first_cell, 4);
}

#[test]
fn the_panel_takes_the_controls_a_picker_takes() {
    let queue = Queue::new();
    let (mut rig, _) = chord(&queue);
    rig.tap(100, Button::Ok);
    // The panel's cursor on Length, where OK would put it back on Pitch by opening it again.
    let at = taps(&mut rig, 200, Button::Down, false, 2);
    let view = rig.control.view;
    let tree = rig.control.track_tree();
    rig.sent();

    for (sample, button) in (at..).step_by(100).zip([
        Button::T3,
        Button::Menu,
        Button::Page,
        Button::Roll,
        Button::PadsKeys,
        Button::Tempo,
        Button::Copy,
        Button::Step(0),
        Button::Push(0),
        Button::Ok,
    ]) {
        rig.tap(sample, button);
    }
    rig.step(at + 2_000);

    assert_eq!(rig.control.view, view);
    assert_eq!(rig.control.project.track, 1);
    assert_eq!(rig.track().mode, PadMode::Pads);
    assert_eq!(rig.control.settings.get(METRONOME.id), 0);
    assert_eq!(rig.control.track_tree(), tree);
    assert_eq!(rig.sent(), []);
    assert_eq!(versions(&mut rig), []);

    // PLAY, STOP and REC act, and SHIFT + T1 mutes T1, the panel staying open.
    rig.tap(10_000, Button::Play);
    rig.step(10_010);
    assert!(rig.control.player.run().is_some());
    rig.tap(20_000, Button::Stop);
    rig.step(20_010);
    assert!(rig.control.player.run().is_none());
    rig.tap(30_000, Button::Rec);
    rig.step(30_010);
    assert!(matches!(rig.control.rec, Rec::Armed(_)));
    rig.press(40_000, Button::Shift);
    rig.tap(40_010, Button::T1);
    rig.let_go(40_020, Button::Shift);
    rig.step(40_030);
    assert!(rig.control.project.tracks[0].muted());
    assert_eq!(rig.control.view.note_panel, view.note_panel);
}

#[test]
fn a_pad_sounds_but_selects_and_edits_nothing_while_the_panel_is_open() {
    let queue = Queue::new();
    let (mut rig, [bass, sub, _]) = on_t2(&queue);
    // The chord, with step 1 held on Bass's C4 in sixteenth 0 before OK.
    let notes = [
        entered(0, bass, 60),
        soft(0, 3, bass, 48),
        soft(0, 3, bass, 52),
    ];
    put(&mut rig, 0, 1, &notes);
    rig.control.view.steps = StepCursor { bar: 0, step: 3 };
    rig.press(50, Button::Step(0));
    rig.tap(100, Button::Ok);
    rig.step(110);
    rig.sent();
    let view = rig.control.view;

    // Pad 2 sounds Sub, which it neither selects nor adds under the held step.
    rig.hit(200, 1, 100);
    rig.release(205, 1);
    rig.step(210);
    let sent = rig.sent();
    assert!(matches!(
        sent[0].kind,
        MessageKind::NoteOn { sound, .. } if sound == sub
    ));
    assert_eq!(rig.track().selected_sound, Some(bass));
    assert_eq!(rig.control.view, view);
    assert_eq!(notes_in(&rig, rig.control.track_tree()), notes);
    assert_eq!(versions(&mut rig), []);

    // The panel's values are its cell's, not the held step's.
    assert!(panel_shows(&rig, &chord_items("+0"), 0));

    // While recording the hit is recorded.
    rig.control.settings.set(COUNT_IN.id, 0);
    rig.press(1_000, Button::Rec);
    rig.press(1_000, Button::Play);
    rig.let_go(1_001, Button::Rec);
    rig.let_go(1_001, Button::Play);
    rig.step(1_002);
    assert_eq!(rig.control.rec, Rec::On);
    rig.hit(6_000, 1, 100);
    rig.release(7_000, 1);
    rig.step(7_128);
    assert!(
        notes_in(&rig, rig.control.track_tree())
            .iter()
            .any(|note| note.sound == sub)
    );
    assert_eq!(rig.track().selected_sound, Some(bass));
}

#[test]
fn a_turn_in_the_panel_under_the_reserve_changes_nothing() {
    let queue = Queue::new();
    let (mut rig, _) = chord(&queue);
    rig.tap(100, Button::Ok);
    let at = taps(&mut rig, 200, Button::Down, false, 1);
    fill_until(&rig, RESERVE - 1);
    let before = rig.control.track_tree();

    taps(&mut rig, at, Button::Plus, false, 1);

    assert_eq!(rig.control.track_tree(), before);
    assert_eq!(versions(&mut rig), []);
    let message = rig.control.message.unwrap();
    assert_eq!(message.text.as_str(), "Not enough memory");
    assert_eq!(message.color, RECORD);
}

#[test]
fn the_panel_draws_a_box_with_its_four_items_and_the_cursor() {
    let queue = Queue::new();
    let (mut rig, _) = chord(&queue);

    rig.tap(100, Button::Ok);
    rig.step(110);

    let screen = picture(&rig.control);
    assert!(outlined(&screen, 178, 96, 124, 77, LINE));
    assert!(outlined(&screen, 180, 98, 120, 19, ACCENT));
    // Black inside, over STEP's lane lines, which show outside it.
    assert!(filled(&screen, 179..=179, 97..=171, BACKGROUND));
    assert!(filled(&screen, 181..=298, 170..=171, BACKGROUND));
    assert_eq!(screen.pixel(177, 100), FAINT);
    // The items unnumbered from (181, 99) 18 px apart; the strip shows the same four.
    assert!(panel_shows(&rig, &chord_items("+0"), 0));
}
