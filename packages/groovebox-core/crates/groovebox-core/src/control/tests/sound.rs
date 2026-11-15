//! SOUND's pages and the sound picker.

use super::*;
use crate::param::{
    ATTACK, CHOKE_GROUP, CUTOFF, DECAY, ENVELOPE_AMOUNT, FILTER_ATTACK, FILTER_DECAY,
    FILTER_RELEASE, FILTER_SUSTAIN, FILTER_TYPE, FILTER_VELOCITY, FINE_TUNE, GLIDE, GLIDE_TIME, HP,
    KEY_FOLLOW, LEVEL, LP_12, MODE, NOISE_LEVEL, OSCILLATOR_2_FINE_TUNE, OSCILLATOR_2_INTERVAL,
    OSCILLATOR_2_LEVEL, PAN, PLAY_MODE, PULSE, RELEASE, RESONANCE, SHAPE, SPREAD, SUB_LEVEL,
    SUPERSAW, SUSTAIN, TRANSPOSE, TRIGGER, VOLUME_VELOCITY, WAVE,
};
use crate::ui::layout::HEADER_LINE;
use crate::ui::list::{Row, draw_rows};
use crate::ui::tiles::{PadTile, draw_pad_tiles};
use core::ops::RangeInclusive;
use std::format;
use std::string::String;
use view::Cursor;

/// SOUND's header on T1 in PADS mode, with the sound as the header shows it.
fn sound_header(sound: (&str, Color)) -> [(&str, Color); 5] {
    [
        ("Sound", ACCENT),
        ("Pad", TEXT),
        ("T1", TEXT),
        sound,
        ("Pads", DIM),
    ]
}

/// The names of the sounds on the 12 pads: `pads` gives the pads that hold one.
fn names<'a>(pads: &[(usize, &'a str)]) -> [Option<&'a str>; 12] {
    let mut names = [None; 12];
    for &(pad, name) in pads {
        names[pad] = Some(name);
    }
    names
}

/// The Pad page under `header` and `message`: the `items` with the cursor on item `cursor`, the
/// pad tiles with these names and pad `selected` selected, and the strip repeating the items.
fn pad_page(
    header: &[(&str, Color)],
    message: Option<(&str, Color)>,
    items: &[ItemView],
    cursor: usize,
    pads: [Option<&str>; 12],
    selected: usize,
) -> Screen {
    let mut strip = [None; 4];
    for (cell, item) in strip.iter_mut().zip(items) {
        *cell = Some(*item);
    }
    drawn(
        header,
        message,
        |screen| {
            for (row, item) in items.iter().enumerate() {
                let y = 17 + 18 * row as i32;
                draw_item(screen, 2, y, 160, item, true);
                if row == cursor {
                    draw_cursor(screen, 2, y, 160, 17);
                }
            }
            draw_pad_tiles(
                screen,
                &core::array::from_fn(|pad| PadTile {
                    name: pads[pad],
                    selected: pad == selected,
                }),
            );
        },
        &strip,
    )
}

/// The names of `count` synths made one after another: Syn 1, Syn 2 and on.
fn synths(count: usize) -> Vec<String> {
    (1..=count).map(|number| format!("Syn {number}")).collect()
}

/// The sound picker's rows over a pool of synths with these names: Empty, New synth, then the
/// sounds.
fn rows(names: &[String]) -> Vec<Row<'_>> {
    [
        Row {
            left: "Empty",
            right: None,
        },
        Row {
            left: "New synth",
            right: None,
        },
    ]
    .into_iter()
    .chain(names.iter().map(|name| Row {
        left: name,
        right: Some("synth"),
    }))
    .collect()
}

/// The sound picker under `header`: `rows` from row `first`, the cursor on row `cursor` and an
/// empty strip.
fn picker(header: &[(&str, Color)], rows: &[Row], first: usize, cursor: usize) -> Screen {
    drawn(
        header,
        None,
        |screen| draw_rows(screen, rows, first, Some(cursor)),
        &[None; 4],
    )
}

/// Makes `count` synths in the pool, Syn 1 and on, which no pad holds.
fn fill(rig: &mut Rig<'_>, count: usize) {
    for _ in 0..count {
        rig.control.project.pool.new_synth().unwrap();
    }
}

fn sound_cursor(rig: &Rig<'_>) -> usize {
    rig.control.cursor(view::Screen::Sound).item
}

#[test]
fn new_synth_on_an_empty_pad_makes_syn_1_and_selects_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Down);
    rig.tap(30, Button::Ok);

    rig.step(40);

    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.control.project.pool.sounds().len(), 1);
    assert_eq!(rig.track().pads[0], Some(SoundNumber(1)));
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(SoundNumber(1)));
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad")],
            0,
            names(&[(0, "Syn 1")]),
            0,
        )
    ));
    // Tile 1 shows its number and the sound's name in the accent, on the capitals' rows.
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 165..=240, 22..=28, ACCENT), Some((167, 171)));
    assert_eq!(span(&screen, 165..=240, 36..=42, ACCENT), Some((167, 195)));
}

#[test]
fn the_picker_opens_on_the_pads_current_entry() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.control.project.put(0, Some(SoundNumber(3)));
    rig.control.project.put(2, Some(SoundNumber(25)));
    let names = synths(30);
    let rows = rows(&names);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);

    rig.step(20);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 4, scroll: 0 }));
    assert!(shows(
        &rig.control,
        &picker(&sound_header(("Syn 3", TEXT)), &rows, 0, 4)
    ));

    // On an empty pad it opens on Empty.
    rig.tap(30, Button::Cancel);
    rig.hit(40, 1, 100);
    rig.release(50, 1);
    rig.tap(60, Button::Ok);
    rig.step(70);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 0, scroll: 0 }));
    assert!(shows(
        &rig.control,
        &picker(&sound_header(("2", DIM)), &rows, 0, 0)
    ));

    // On Syn 25, row 27, it scrolls only as far as it must: the highlight is on the last row shown.
    rig.tap(80, Button::Cancel);
    rig.hit(90, 2, 100);
    rig.release(100, 2);
    rig.tap(110, Button::Ok);
    rig.step(120);
    assert_eq!(
        rig.control.view.picker,
        Some(Cursor {
            item: 26,
            scroll: 11
        })
    );
    assert!(shows(
        &rig.control,
        &picker(&sound_header(("Syn 25", TEXT)), &rows, 11, 26)
    ));
}

#[test]
fn a_pool_sound_is_shared_and_copy_counts_its_pads() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // New synth on pad 1, then pad 2 selected and Syn 1 chosen for it from the pool.
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Down);
    rig.tap(30, Button::Ok);
    rig.hit(40, 1, 100);
    rig.release(50, 1);
    rig.tap(60, Button::Ok);
    rig.tap(70, Button::Down);
    rig.tap(80, Button::Down);
    rig.tap(90, Button::Ok);

    rig.step(100);
    assert_eq!(rig.control.project.pool.sounds().len(), 1);
    assert_eq!(rig.track().pads[..2], [Some(SoundNumber(1)); 2]);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 2 pads")],
            0,
            names(&[(0, "Syn 1"), (1, "Syn 1")]),
            1,
        )
    ));

    // Copy gives pad 2 its own sound.
    rig.tap(100, Button::Down);
    rig.tap(110, Button::Ok);
    rig.step(120);
    assert_eq!(rig.control.project.pool.sounds().len(), 2);
    assert_eq!(rig.track().pads[1], Some(SoundNumber(2)));
    assert_eq!(rig.track().selected_sound, Some(SoundNumber(2)));
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 2", TEXT)),
            None,
            &[sound("Syn 2"), copy("on 1 pad")],
            1,
            names(&[(0, "Syn 1"), (1, "Syn 2")]),
            1,
        )
    ));

    // Pad 2 plays Syn 2, and pad 1 keeps Syn 1, now on 1 pad.
    rig.sent();
    rig.hit(200, 1, 100);
    rig.hit(210, 0, 100);
    rig.step(220);
    assert_eq!(
        rig.sent(),
        [
            message(2, 200, note_on(0, 0, SoundNumber(2), 60, 100)),
            message(3, 210, note_on(1, 0, SoundNumber(1), 60, 100)),
        ]
    );
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad")],
            1,
            names(&[(0, "Syn 1"), (1, "Syn 2")]),
            0,
        )
    ));
}

#[test]
fn empty_clears_the_pad_and_keeps_the_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Up);
    rig.tap(30, Button::Up);
    rig.tap(40, Button::Ok);

    rig.step(50);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], None);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, None);
    assert_eq!(
        rig.control.project.pool.get(syn_1).unwrap().name.as_str(),
        "Syn 1"
    );
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("1", DIM)),
            None,
            &[sound("Empty")],
            0,
            [None; 12],
            0,
        )
    ));

    // The sound is still in the picker.
    rig.tap(60, Button::Ok);
    rig.step(70);
    assert!(shows(
        &rig.control,
        &picker(&sound_header(("1", DIM)), &rows(&synths(1)), 0, 0)
    ));
}

#[test]
fn an_empty_pad_shows_only_the_sound_item() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.tap(10, Button::Down);
    rig.step(20);
    assert_eq!(sound_cursor(&rig), 1);

    // Pad 5 is empty: Copy vanishes and its cursor moves to Sound. Encoder 2 holds nothing.
    rig.hit(30, 4, 100);
    rig.release(40, 4);
    rig.turn(50, 1, 3);
    rig.tap(60, Button::Push(1));
    rig.step(70);
    assert_eq!(sound_cursor(&rig), 0);
    assert_eq!(rig.control.project.pool.sounds().len(), 1);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("5", DIM)),
            None,
            &[sound("Empty")],
            0,
            names(&[(0, "Syn 1")]),
            4,
        )
    ));

    // The cursor stays on Sound when the selected pad has a sound again.
    rig.hit(80, 0, 100);
    rig.release(90, 0);
    rig.step(100);
    assert_eq!(sound_cursor(&rig), 0);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad")],
            0,
            names(&[(0, "Syn 1")]),
            0,
        )
    ));
}

#[test]
fn up_and_down_move_over_the_pad_page_and_stop_at_its_ends() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    for (sample, button, item) in [
        (10, Button::Down, 1),
        (20, Button::Down, 1),
        (30, Button::Up, 0),
        (40, Button::Up, 0),
    ] {
        rig.tap(sample, button);
        rig.step(sample + 2);
        assert_eq!(sound_cursor(&rig), item, "at {sample}");
    }

    // SHIFT + down leaves the cursor. Each repeat reads SHIFT anew, so once SHIFT is let go the
    // held down moves it at its first repeat.
    rig.press(100, Button::Shift);
    rig.press(200, Button::Down);
    rig.let_go(1_000, Button::Shift);
    rig.step(200 + REPEAT_DELAY);
    assert_eq!(sound_cursor(&rig), 0);
    rig.step(200 + REPEAT_DELAY + 1);
    assert_eq!(sound_cursor(&rig), 1);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad")],
            1,
            names(&[(0, "Syn 1")]),
            0,
        )
    ));
    rig.let_go(30_000, Button::Down);

    // SHIFT + up leaves it on Copy.
    rig.press(30_100, Button::Shift);
    rig.tap(30_200, Button::Up);
    rig.step(30_300);
    assert_eq!(sound_cursor(&rig), 1);
}

#[test]
fn cancel_closes_the_picker_on_a_short_release_only() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Up);

    // Neither its press nor a long press closes it.
    rig.press(100, Button::Cancel);
    rig.step(101);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 1, scroll: 0 }));
    rig.let_go(100 + HOLD, Button::Cancel);
    rig.step(100 + HOLD + 1);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 1, scroll: 0 }));

    // Nor does a short one with another control used meanwhile.
    rig.press(20_000, Button::Cancel);
    rig.tap(20_010, Button::Down);
    rig.let_go(20_020, Button::Cancel);
    rig.step(20_030);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 2, scroll: 0 }));

    // A tap closes it without choosing.
    rig.tap(30_000, Button::Cancel);
    rig.step(30_010);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], Some(syn_1));
    assert_eq!(rig.control.project.pool.sounds().len(), 1);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad")],
            0,
            names(&[(0, "Syn 1")]),
            0,
        )
    ));
}

#[test]
fn with_the_picker_open_pads_sound_but_do_not_select_and_menu_waits() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let first = rig.synth_on(0);
    let fourth = rig.synth_on(3);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.step(20);
    let open = picture(&rig.control);
    assert!(shows(
        &rig.control,
        &picker(&sound_header(("Syn 1", TEXT)), &rows(&synths(2)), 0, 2)
    ));

    // Pad 4 and a MIDI note on pad 4 sound, and select nothing.
    rig.hit(100, 3, 90);
    rig.note_on(110, 63, 80);
    rig.step(120);
    assert_eq!(
        rig.sent(),
        [
            message(0, 100, note_on(0, 0, fourth, 60, 90)),
            message(1, 110, note_on(1, 0, fourth, 60, 80)),
        ]
    );
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(first));
    assert_eq!(rig.lit(), [pad(0), pad(3), track(0)]);
    assert!(shows(&rig.control, &open));
    rig.release(130, 3);
    rig.note_off(140, 63);

    // MENU, MENU + step 8, T2, PADS/KEYS, a turn and a push do nothing and leave it open. The turn
    // of encoder 2 leaves SOUND's cursor on Sound.
    rig.press(200, Button::Menu);
    rig.tap(210, Button::Step(7));
    rig.tap(220, Button::T2);
    rig.tap(230, Button::PadsKeys);
    rig.turn(240, 1, 1);
    rig.tap(250, Button::Push(1));
    rig.step(260);
    assert_eq!(
        rig.sent(),
        [message(2, 130, note_off(0)), message(3, 140, note_off(1))]
    );
    assert_eq!(rig.control.view.screen, view::Screen::Sound);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 2, scroll: 0 }));
    assert_eq!(rig.control.project.track, 0);
    assert_eq!(rig.track().mode, PadMode::Pads);
    assert_eq!(rig.control.project.pool.sounds().len(), 2);
    assert_eq!(sound_cursor(&rig), 0);
    assert_eq!(rig.lit(), [pad(0), track(0)]);
    assert!(shows(&rig.control, &open));

    // Once CANCEL has closed it, the MENU still held and the releases do nothing either.
    rig.tap(300, Button::Cancel);
    rig.tap(310, Button::Step(7));
    rig.let_go(320, Button::Menu);
    rig.step(330);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.control.view.screen, view::Screen::Sound);
    assert_eq!(rig.control.project.track, 0);
    assert_eq!(rig.track().mode, PadMode::Pads);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            None,
            &[sound("Syn 1"), copy("on 1 pad")],
            0,
            names(&[(0, "Syn 1"), (3, "Syn 2")]),
            0,
        )
    ));
}

#[test]
fn the_picker_keys_move_the_highlight_and_stop_at_the_ends() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    let check = |rig: &mut Rig<'_>, moves: &[(u64, Button, usize)]| {
        for &(sample, button, row) in moves {
            rig.tap(sample, button);
            rig.step(sample + 2);
            let highlight = rig.control.view.picker.map(|picker| picker.item);
            assert_eq!(highlight, Some(row), "{button:?} at {sample}");
        }
    };

    // Up, down, - and + move one row and left and right 16, all stopping at row 0 and row 31.
    check(
        &mut rig,
        &[
            (100, Button::Up, 0),
            (110, Button::Minus, 0),
            (120, Button::Left, 0),
            (130, Button::Plus, 1),
            (140, Button::Down, 2),
            (150, Button::Right, 18),
            (160, Button::Right, 31),
            (170, Button::Down, 31),
            (180, Button::Plus, 31),
            (190, Button::Left, 15),
            (200, Button::Minus, 14),
            (210, Button::Up, 13),
        ],
    );

    // With SHIFT held the arrows, - and + do nothing and OK chooses nothing.
    rig.press(300, Button::Shift);
    check(
        &mut rig,
        &[
            (310, Button::Up, 13),
            (320, Button::Down, 13),
            (330, Button::Left, 13),
            (340, Button::Right, 13),
            (350, Button::Minus, 13),
            (360, Button::Plus, 13),
            (370, Button::Ok, 13),
        ],
    );
    assert_eq!(rig.track().pads[0], None);
}

#[test]
fn shift_with_minus_or_plus_does_nothing_in_the_picker() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Plus);
    rig.tap(30, Button::Plus);
    let highlight = |rig: &Rig<'_>| rig.control.view.picker.map(|picker| picker.item);

    // SHIFT + - and SHIFT + + are taken at their press: they move nothing, do not repeat and do
    // nothing once SHIFT is let go.
    rig.press(100, Button::Shift);
    rig.press(110, Button::Plus);
    rig.press(120, Button::Minus);
    rig.let_go(1_000, Button::Shift);
    rig.step(120 + 3 * REPEAT_DELAY);
    assert_eq!(highlight(&rig), Some(2));
    assert_eq!(rig.control.buttons.next_repeat(), None);
    rig.let_go(70_000, Button::Plus);
    rig.let_go(70_000, Button::Minus);

    // A + held on its own moves a row and repeats. Each repeat reads SHIFT anew, so the repeats
    // while SHIFT is held do nothing and the first after it is let go moves a row.
    rig.press(100_000, Button::Plus);
    rig.press(110_000, Button::Shift);
    rig.let_go(122_000, Button::Shift);
    rig.step(100_001);
    assert_eq!(highlight(&rig), Some(3));
    rig.step(100_000 + REPEAT_DELAY + 2 * REPEAT_EVERY);
    assert_eq!(highlight(&rig), Some(3));
    rig.step(100_000 + REPEAT_DELAY + 2 * REPEAT_EVERY + 1);
    assert_eq!(highlight(&rig), Some(4));
}

#[test]
fn an_arrow_under_pads_keys_does_nothing_in_the_picker() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.control.project.put(0, Some(SoundNumber(20)));
    rig.tap(0, Button::PadsKeys);
    rig.menu(10, 2);
    // PADS/KEYS is held from before OK opens the picker on Syn 20, row 21, where every arrow
    // would move the highlight.
    rig.press(20, Button::PadsKeys);
    rig.tap(30, Button::Ok);
    rig.step(40);
    let open = picture(&rig.control);
    assert_eq!(rig.control.view.picker.map(|picker| picker.item), Some(21));

    // The arrows are taken at their press: in KEYS mode up and down leave the octave too, a held
    // down does not repeat, and letting go of PADS/KEYS first leaves it taken.
    for (sample, button) in [
        (100, Button::Up),
        (110, Button::Down),
        (120, Button::Left),
        (130, Button::Right),
    ] {
        rig.tap(sample, button);
    }
    rig.press(200, Button::Down);
    rig.let_go(300, Button::PadsKeys);
    rig.step(200 + 3 * REPEAT_DELAY);
    assert_eq!(rig.control.view.picker.map(|picker| picker.item), Some(21));
    assert_eq!(rig.control.buttons.next_repeat(), None);
    assert_eq!(rig.track().octave, 4);
    assert_eq!(rig.track().mode, PadMode::Keys);
    assert!(shows(&rig.control, &open));

    // A new press of down moves the highlight again.
    rig.let_go(70_000, Button::Down);
    rig.tap(70_100, Button::Down);
    rig.step(70_200);
    assert_eq!(rig.control.view.picker.map(|picker| picker.item), Some(22));
}

#[test]
fn an_arrow_under_pads_keys_pressed_in_the_picker_does_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Plus);
    let highlight = |rig: &Rig<'_>| rig.control.view.picker.map(|picker| picker.item);

    // PADS/KEYS pressed with the picker open is dropped, yet it is still held: an arrow under it
    // is taken at its press, does not repeat and stays taken once PADS/KEYS is let go.
    rig.press(100, Button::PadsKeys);
    for (sample, button) in [(110, Button::Up), (120, Button::Left), (130, Button::Right)] {
        rig.tap(sample, button);
    }
    rig.press(200, Button::Down);
    rig.let_go(300, Button::PadsKeys);
    rig.step(200 + 3 * REPEAT_DELAY);
    assert_eq!(highlight(&rig), Some(1));
    assert_eq!(rig.control.buttons.next_repeat(), None);
    assert_eq!(rig.track().mode, PadMode::Pads);
}

#[test]
fn opening_the_picker_ends_a_held_arrow() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.menu(0, 2);
    let highlight = |rig: &Rig<'_>| rig.control.view.picker.map(|picker| picker.item);

    // Down is held on the Pad page when OK opens the picker on Empty: it does not repeat into the
    // picker, which stays on the pad's entry until down is pressed again.
    rig.press(100, Button::Down);
    rig.tap(200, Button::Ok);
    rig.step(100 + 3 * REPEAT_DELAY);
    assert_eq!(highlight(&rig), Some(0));
    assert_eq!(rig.control.buttons.next_repeat(), None);
    rig.let_go(70_000, Button::Down);
    rig.tap(70_100, Button::Down);
    rig.step(70_200);
    assert_eq!(highlight(&rig), Some(1));
}

#[test]
fn closing_the_picker_ends_a_held_arrow() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.control.project.put(0, Some(SoundNumber(20)));
    rig.menu(0, 2);

    // Down held through the OK that chooses does not move the Pad page's cursor afterwards.
    rig.tap(100, Button::Ok);
    rig.press(200, Button::Down);
    rig.tap(300, Button::Ok);
    rig.step(200 + 3 * REPEAT_DELAY);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], Some(SoundNumber(21)));
    assert_eq!(sound_cursor(&rig), 0);
    assert_eq!(rig.control.buttons.next_repeat(), None);
    rig.let_go(70_000, Button::Down);

    // Nor through the tap of CANCEL that closes the picker without choosing.
    rig.tap(70_100, Button::Ok);
    rig.press(70_200, Button::Down);
    rig.tap(70_300, Button::Cancel);
    rig.step(70_200 + 3 * REPEAT_DELAY);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(sound_cursor(&rig), 0);
    assert_eq!(rig.control.buttons.next_repeat(), None);
}

#[test]
fn shift_with_an_arrow_does_nothing_in_the_picker_also_after_shift() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Plus);
    let highlight = |rig: &Rig<'_>| rig.control.view.picker.map(|picker| picker.item);

    // SHIFT + down is taken at its press like SHIFT + +: letting go of SHIFT first does not wake
    // the held down, which neither moves nor repeats until it is pressed again.
    rig.press(100, Button::Shift);
    rig.press(110, Button::Down);
    rig.let_go(1_000, Button::Shift);
    rig.step(110 + 3 * REPEAT_DELAY);
    assert_eq!(highlight(&rig), Some(1));
    assert_eq!(rig.control.buttons.next_repeat(), None);
    rig.let_go(70_000, Button::Down);
    rig.tap(70_100, Button::Down);
    rig.step(70_200);
    assert_eq!(highlight(&rig), Some(2));
}

#[test]
fn held_down_moves_the_highlight_after_400_ms_every_50_ms() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    // SOUND and its picker open at sample 0, where down goes down too.
    rig.press(0, Button::Menu);
    rig.press(0, Button::Step(2));
    rig.let_go(0, Button::Step(2));
    rig.let_go(0, Button::Menu);
    rig.press(0, Button::Ok);
    rig.let_go(0, Button::Ok);
    rig.press(0, Button::Down);
    rig.let_go(30_000, Button::Down);

    let mut moves = Vec::new();
    let mut shown = None;
    for sample in 0..=40_000 {
        rig.step(sample + 1);
        let highlight = rig.control.view.picker.map(|picker| picker.item);
        if highlight != shown {
            moves.push(sample);
            shown = highlight;
        }
    }

    assert_eq!(moves, [0, 19_200, 21_600, 24_000, 26_400, 28_800]);
    assert_eq!(shown, Some(6));
}

/// What a session with the picker gives when it is stepped every `every` samples up to 102,400.
struct Session {
    messages: Vec<Message>,
    /// The lights and the picker after every 4,096 samples.
    lights: Vec<Vec<u32>>,
    pickers: Vec<Option<Cursor>>,
    last: Screen,
}

fn picker_session(every: u64) -> Session {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 30);
    rig.control.project.put(3, Some(SoundNumber(4)));
    rig.menu(0, 2);
    rig.tap(100, Button::Ok);
    // Down held moves the highlight 18 rows, and pad 4 and a MIDI note play meanwhile, across the
    // lights taken at 32,768. Left goes back 16 rows and right held goes to the end, Syn 30, which
    // OK chooses.
    rig.press(1_000, Button::Down);
    rig.hit(30_000, 3, 100);
    rig.note_on(30_500, 15, 90);
    rig.release(33_000, 3);
    rig.note_off(33_500, 15);
    rig.let_go(60_000, Button::Down);
    rig.tap(61_000, Button::Left);
    rig.press(62_000, Button::Right);
    rig.let_go(90_000, Button::Right);
    rig.tap(95_000, Button::Ok);

    let mut lights = Vec::new();
    let mut pickers = Vec::new();
    for until in (every..=102_400).step_by(every as usize) {
        rig.step(until);
        if until % 4_096 == 0 {
            lights.push(rig.lit());
            pickers.push(rig.control.view.picker);
        }
    }
    Session {
        messages: rig.sent(),
        lights,
        pickers,
        last: picture(&rig.control),
    }
}

#[test]
fn the_result_does_not_depend_on_the_step_size() {
    let fine = picker_session(128);
    let coarse = picker_session(4_096);

    assert_eq!(fine.messages, coarse.messages);
    assert_eq!(fine.lights, coarse.lights);
    assert_eq!(fine.pickers, coarse.pickers);
    assert!(fine.last.pixels() == coarse.last.pixels());
    // The lights change in the session, so their comparison can fail: at 32,768 pad 4 is lit by
    // its hit and by the MIDI note.
    assert_eq!(coarse.lights[0], [pad(0), track(0)]);
    assert_eq!(coarse.lights[7], [pad(0), pad(3), track(0)]);

    // And it is what the inputs ask for.
    let fourth = SoundNumber(4);
    assert_eq!(
        coarse.messages,
        [
            message(0, 30_000, note_on(0, 0, fourth, 60, 100)),
            message(1, 30_500, note_on(1, 0, fourth, 60, 90)),
            message(2, 33_000, note_off(0)),
            message(3, 33_500, note_off(1)),
        ]
    );
    // By 57,344 down has moved the highlight 17 rows; by 61,440 it has moved 18 and left 16 back.
    assert_eq!(
        coarse.pickers[13],
        Some(Cursor {
            item: 17,
            scroll: 2
        })
    );
    assert_eq!(coarse.pickers[14], Some(Cursor { item: 2, scroll: 2 }));
    assert_eq!(
        coarse.pickers[21],
        Some(Cursor {
            item: 31,
            scroll: 16
        })
    );
    assert_eq!(coarse.pickers[23], None);
    assert!(
        coarse.last.pixels()
            == pad_page(
                &sound_header(("Syn 30", TEXT)),
                None,
                &[sound("Syn 30"), copy("on 1 pad")],
                0,
                names(&[(0, "Syn 30"), (3, "Syn 4")]),
                0,
            )
            .pixels()
    );
}

#[test]
fn pool_full_shows_until_the_next_button_press() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    fill(&mut rig, 1_024);
    rig.control.project.put(1, Some(SoundNumber(1)));
    let full = rig.control.project.pool.clone();
    let pool_full = Some(("Pool full", RECORD));

    // OK on New synth closes the picker and leaves the pad empty.
    rig.menu(0, 2);
    rig.tap(10, Button::Ok);
    rig.tap(20, Button::Down);
    rig.press(30, Button::Ok);
    rig.step(31);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], None);
    assert_eq!(rig.control.project.pool, full);
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("1", DIM)),
            pool_full,
            &[sound("Empty")],
            0,
            names(&[(1, "Syn 1")]),
            0,
        )
    ));

    // Its own release and a pad hit keep it.
    rig.let_go(40, Button::Ok);
    rig.hit(50, 1, 100);
    rig.release(60, 1);
    rig.step(70);
    assert_eq!(
        rig.sent(),
        [
            message(0, 50, note_on(0, 0, SoundNumber(1), 60, 100)),
            message(1, 60, note_off(0)),
        ]
    );
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            pool_full,
            &[sound("Syn 1"), copy("on 1 pad")],
            0,
            names(&[(1, "Syn 1")]),
            1,
        )
    ));

    // Down clears it and still moves the cursor.
    rig.tap(80, Button::Down);
    rig.step(90);
    assert_eq!(rig.control.message, None);
    assert_eq!(sound_cursor(&rig), 1);

    // Copy on the full pool refuses too, and leaves the page as it was.
    rig.tap(100, Button::Ok);
    rig.step(110);
    assert_eq!(rig.control.project.pool, full);
    assert_eq!(rig.track().pads[1], Some(SoundNumber(1)));
    assert!(shows(
        &rig.control,
        &pad_page(
            &sound_header(("Syn 1", TEXT)),
            pool_full,
            &[sound("Syn 1"), copy("on 1 pad")],
            1,
            names(&[(1, "Syn 1")]),
            1,
        )
    ));
}

#[test]
fn encoders_on_step_act_on_sounds_page() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let first = rig.synth_on(0);
    rig.step(10);
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            None,
            |_| {},
            &[Some(sound("Syn 1")), Some(copy("on 1 pad")), None, None],
        )
    ));

    // A turn of encoder 2 changes nothing but moves SOUND's remembered cursor to Copy.
    rig.turn(100, 1, 5);
    rig.step(110);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert_eq!(sound_cursor(&rig), 1);
    assert_eq!(rig.control.project.pool.sounds().len(), 1);

    // Push 1 opens the picker over STEP's main area on Syn 1, under STEP's header.
    rig.tap(200, Button::Push(0));
    rig.step(210);
    assert_eq!(rig.control.view.screen, view::Screen::Step);
    assert_eq!(rig.control.view.picker, Some(Cursor { item: 2, scroll: 0 }));
    assert_eq!(sound_cursor(&rig), 0);
    assert!(shows(
        &rig.control,
        &picker(&step_header("Syn 1"), &rows(&synths(1)), 0, 2)
    ));

    // OK chooses Syn 1 and STEP shows again.
    rig.tap(300, Button::Ok);
    rig.step(310);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], Some(first));
    assert_eq!(rig.control.project.pool.sounds().len(), 1);

    // Push 2 copies, and SOUND's remembered cursor is on Copy.
    rig.tap(400, Button::Push(1));
    rig.step(410);
    assert_eq!(rig.track().pads[0], Some(SoundNumber(2)));
    assert_eq!(sound_cursor(&rig), 1);
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 2"),
            None,
            |_| {},
            &[Some(sound("Syn 2")), Some(copy("on 1 pad")), None, None],
        )
    ));

    // Empty chosen from STEP: STEP shows again with an empty strip, as the encoders hold nothing
    // there while the selected pad is empty.
    rig.tap(500, Button::Push(0));
    for sample in [510, 520, 530] {
        rig.tap(sample, Button::Up);
    }
    rig.tap(540, Button::Ok);
    rig.step(550);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.track().pads[0], None);
    assert!(shows_step(&rig.control, &STEP_HEADER));

    rig.tap(600, Button::Push(1));
    rig.tap(610, Button::Push(0));
    rig.turn(620, 0, 1);
    rig.step(630);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.control.project.pool.sounds().len(), 2);
    assert!(shows_step(&rig.control, &STEP_HEADER));
}

#[test]
fn page_shows_the_pad_tile_on_sound_and_on_step() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Page);
    rig.step(1);

    let shown = page_tiles(pages(view::Screen::Sound, rig.track()), 0);
    assert_eq!(
        shown[0],
        Tile {
            name: Some("Pad"),
            state: TileState::Current
        }
    );
    assert!(shown[1..].iter().all(|tile| tile.state == TileState::Empty));
    assert!(shows(&rig.control, &tiles(&STEP_HEADER, &shown)));
    assert_eq!(rig.lit(), [pad(0), step(0), track(0)]);

    rig.let_go(10, Button::Page);
    rig.menu(20, 2);
    rig.press(30, Button::Page);
    rig.step(31);
    assert!(shows(
        &rig.control,
        &tiles(&sound_header(("1", DIM)), &shown)
    ));
    assert_eq!(rig.lit(), [pad(0), step(0), track(0)]);
}

#[test]
fn the_pad_page_and_picker_match_their_geometry() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.step(10);
    let screen = picture(&rig.control);

    // The header: "Sound" from x 4, then "Pad", "T1" and "Syn 1", then the dim "Pads".
    assert_eq!(span(&screen, 0..=479, 1..=13, ACCENT), Some((4, 32)));
    assert_eq!(span(&screen, 0..=479, 1..=13, TEXT), Some((39, 107)));
    assert_eq!(span(&screen, 0..=479, 1..=13, DIM), Some((114, 136)));
    // The items at y 17 and 35: the dim digits, the values ending 3 pixels inside, the faint
    // tracks and the cursor 1 pixel outside the first.
    assert_eq!(span(&screen, 2..=15, 17..=29, DIM), Some((5, 9)));
    assert_eq!(span(&screen, 2..=15, 35..=47, DIM), Some((5, 9)));
    assert_eq!(
        span(&screen, 2..=161, 17..=29, TEXT).map(|s| s.1),
        Some(158)
    );
    assert_eq!(
        span(&screen, 2..=161, 35..=47, TEXT).map(|s| s.1),
        Some(158)
    );
    assert!(filled(&screen, 5..=158, 31..=32, FAINT));
    assert!(filled(&screen, 5..=158, 49..=50, FAINT));
    assert!(outlined(&screen, 1, 16, 162, 19, ACCENT));
    assert!(filled(&screen, 2..=161, 54..=252, BACKGROUND));
    // The pad tiles from x 164 and y 16, 79 pixels apart: pad 1 selected, the others empty.
    assert!(outlined(&screen, 164, 16, 78, 78, ACCENT));
    assert!(outlined(&screen, 243, 16, 78, 78, FAINT));
    assert!(outlined(&screen, 401, 174, 78, 78, FAINT));
    assert!(filled(&screen, 163..=163, 15..=252, BACKGROUND));
    // The strip: Sound and Copy in cells 1 and 2.
    assert_eq!(
        span(&screen, 1..=120, 258..=264, TEXT).map(|s| s.1),
        Some(117)
    );
    assert_eq!(
        span(&screen, 121..=240, 258..=264, TEXT).map(|s| s.1),
        Some(237)
    );
    assert!(filled(&screen, 241..=478, 254..=271, BACKGROUND));

    // The picker: rows at y 17 + 14 k, the text from x 5 and the dim label ending at x 474, the
    // cursor on Syn 1 1 pixel outside its row, and an empty strip.
    rig.tap(20, Button::Ok);
    rig.step(30);
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 2..=477, 20..=26, TEXT), Some((5, 33)));
    assert_eq!(span(&screen, 2..=477, 34..=40, TEXT), Some((5, 57)));
    assert_eq!(span(&screen, 2..=300, 48..=54, TEXT), Some((5, 33)));
    assert_eq!(span(&screen, 300..=477, 48..=54, DIM), Some((446, 474)));
    assert!(outlined(&screen, 1, 44, 478, 15, ACCENT));
    assert!(filled(&screen, 0..=479, 59..=252, BACKGROUND));
    assert!(filled(&screen, 0..=479, 253..=253, LINE));
    assert!(filled(&screen, 0..=479, 254..=271, BACKGROUND));
}

/// Whether the control part draws these header pieces, whatever it draws below them.
fn shows_header(control: &Control, header: &[(&str, Color)]) -> bool {
    same(
        &picture(control),
        &drawn(header, None, |_| {}, &[None; 4]),
        0..=WIDTH - 1,
        0..=HEADER_LINE as usize,
    )
}

/// Whether `shown` and `expected` have the same pixels in `columns` and `rows`.
fn same(
    shown: &Screen,
    expected: &Screen,
    columns: RangeInclusive<usize>,
    rows: RangeInclusive<usize>,
) -> bool {
    rows.into_iter().all(|y| {
        columns
            .clone()
            .all(|x| shown.pixel(x, y) == expected.pixel(x, y))
    })
}

/// SOUND's header on T1 in PADS mode, on the page `page`, with the sound as the header shows it.
fn page_header<'a>(page: &'a str, sound: (&'a str, Color)) -> [(&'a str, Color); 5] {
    [
        ("Sound", ACCENT),
        (page, TEXT),
        ("T1", TEXT),
        sound,
        ("Pads", DIM),
    ]
}

/// The message that sets the entry `id` of `sound` to `value`.
fn set_param(sound: SoundNumber, id: ParamId, value: i32) -> MessageKind {
    MessageKind::SetParam {
        target: Target::Sound(sound),
        id,
        value,
    }
}

#[test]
fn sound_has_six_pages_while_the_pad_has_a_synth() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.press(10, Button::Page);
    rig.step(11);

    let names = [
        "Pad",
        "Synth",
        "Filter",
        "Filter envelope",
        "Volume envelope",
        "Voice",
    ];
    let shown: [Tile; 16] = core::array::from_fn(|at| Tile {
        name: names.get(at).copied(),
        state: match at {
            0 => TileState::Current,
            1..=5 => TileState::Exists,
            _ => TileState::Empty,
        },
    });
    assert!(shows(
        &rig.control,
        &tiles(&page_header("Pad", ("Syn 1", TEXT)), &shown)
    ));
    assert_eq!(
        rig.lit(),
        [
            pad(0),
            step(0),
            step(1),
            step(2),
            step(3),
            step(4),
            step(5),
            track(0)
        ]
    );
}

#[test]
fn each_page_holds_its_items_on_the_encoders() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    let pages: [(&str, &[(&str, ParamId)]); 5] = [
        (
            "Synth",
            &[
                ("Wave", WAVE.id),
                ("Shape", SHAPE.id),
                ("Spread", SPREAD.id),
                ("Sub level", SUB_LEVEL.id),
                ("Noise level", NOISE_LEVEL.id),
                ("Oscillator 2 level", OSCILLATOR_2_LEVEL.id),
                ("Oscillator 2 interval", OSCILLATOR_2_INTERVAL.id),
                ("Oscillator 2 fine tune", OSCILLATOR_2_FINE_TUNE.id),
            ],
        ),
        (
            "Filter",
            &[
                ("Mode", MODE.id),
                ("Cutoff", CUTOFF.id),
                ("Resonance", RESONANCE.id),
                ("Envelope amount", ENVELOPE_AMOUNT.id),
                ("Key follow", KEY_FOLLOW.id),
                ("Velocity amount", FILTER_VELOCITY.id),
                ("Type", FILTER_TYPE.id),
            ],
        ),
        (
            "Filter envelope",
            &[
                ("Attack", FILTER_ATTACK.id),
                ("Decay", FILTER_DECAY.id),
                ("Sustain", FILTER_SUSTAIN.id),
                ("Release", FILTER_RELEASE.id),
            ],
        ),
        (
            "Volume envelope",
            &[
                ("Attack", ATTACK.id),
                ("Decay", DECAY.id),
                ("Sustain", SUSTAIN.id),
                ("Release", RELEASE.id),
                ("Velocity amount", VOLUME_VELOCITY.id),
                ("Level", LEVEL.id),
                ("Pan", PAN.id),
            ],
        ),
        (
            "Voice",
            &[
                ("Play mode", PLAY_MODE.id),
                ("Glide time", GLIDE_TIME.id),
                ("Glide", GLIDE.id),
                ("Trigger", TRIGGER.id),
                ("Choke group", CHOKE_GROUP.id),
                ("Transpose", TRANSPOSE.id),
                ("Fine tune", FINE_TUNE.id),
            ],
        ),
    ];

    for (index, (page, items)) in (0..).zip(pages) {
        rig.page(100 * (index + 1), index as u8 + 1);
        rig.step(100 * (index + 1) + 10);

        let held = rig.control.items(view::Screen::Sound);
        let expected: Vec<ItemDef> = items
            .iter()
            .enumerate()
            .map(|(place, &(_, id))| ItemDef {
                kind: ItemKind::Param(id),
                encoder: (place < 4).then_some(place as u8),
            })
            .collect();
        assert_eq!(held, expected, "{page}");
        for (item, (name, _)) in held.iter().zip(items) {
            let ItemKind::Param(id) = item.kind else {
                panic!("{page}: {item:?}");
            };
            assert_eq!(param::entry(id).name, *name, "{page}");
        }
        assert!(
            shows_header(&rig.control, &page_header(page, ("Syn 1", TEXT))),
            "{page}"
        );
    }
}

#[test]
fn an_empty_pad_shows_only_the_pad_page_and_a_sound_brings_the_page_back() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.page(10, 2);

    // A stray hit on the empty pad 2: only the Pad page, with its one item.
    rig.hit(100, 1, 100);
    rig.release(110, 1);
    rig.step(120);
    assert!(shows(
        &rig.control,
        &pad_page(
            &page_header("Pad", ("2", DIM)),
            None,
            &[sound("Empty")],
            0,
            names(&[(0, "Syn 1")]),
            1,
        )
    ));
    let one: [Tile; 16] = core::array::from_fn(|at| Tile {
        name: (at == 0).then_some("Pad"),
        state: if at == 0 {
            TileState::Current
        } else {
            TileState::Empty
        },
    });
    rig.press(130, Button::Page);
    rig.step(131);
    assert!(shows(
        &rig.control,
        &tiles(&page_header("Pad", ("2", DIM)), &one)
    ));
    assert_eq!(rig.lit(), [pad(1), step(0), track(0)]);

    // PAGE + step 3 shows no page, and the remembered one stays.
    rig.tap(140, Button::Step(2));
    rig.let_go(150, Button::Page);
    rig.step(160);
    assert_eq!(rig.control.view.page(view::Screen::Sound), 2);
    assert!(shows_header(&rig.control, &page_header("Pad", ("2", DIM))));

    // Hit pad 1: its Filter page is back.
    rig.hit(200, 0, 100);
    rig.release(210, 0);
    rig.step(220);
    assert!(shows_header(
        &rig.control,
        &page_header("Filter", ("Syn 1", TEXT))
    ));
    assert_eq!(rig.control.items(view::Screen::Sound).len(), 7);
}

#[test]
fn lists_step_with_turns_and_minus_plus_and_ok_does_nothing_on_them() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.menu(0, 2);
    rig.page(10, 1);
    let wave = |rig: &Rig<'_>| rig.control.value(WAVE.id);
    rig.step(20);
    assert_eq!(wave(&rig), 0);

    rig.turn(30, 0, 1);
    rig.step(40);
    assert_eq!(wave(&rig), PULSE);
    rig.turn(50, 0, 10);
    rig.step(60);
    assert_eq!(wave(&rig), SUPERSAW);
    rig.sent();

    // OK and a push of encoder 1 change nothing and open nothing, and - and + move the list.
    rig.tap(100, Button::Ok);
    rig.tap(110, Button::Push(0));
    rig.step(120);
    assert_eq!(wave(&rig), SUPERSAW);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.control.view.screen, view::Screen::Sound);
    assert_eq!(rig.sent(), []);
    rig.tap(200, Button::Minus);
    rig.step(210);
    assert_eq!(wave(&rig), 3);
    rig.tap(220, Button::Plus);
    rig.step(230);
    assert_eq!(wave(&rig), SUPERSAW);
    assert_eq!(
        rig.sent(),
        [
            message(2, 200, set_param(syn_1, WAVE.id, 3)),
            message(3, 220, set_param(syn_1, WAVE.id, SUPERSAW)),
        ]
    );
}

#[test]
fn counts_ignore_shift_and_smooth_values_go_finer() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);

    // Voice: the cursor down to Transpose, then SHIFT + plus moves it one semitone.
    rig.page(10, 5);
    for at in 0..5 {
        rig.tap(100 + 10 * at, Button::Down);
    }
    rig.press(200, Button::Shift);
    rig.tap(210, Button::Plus);
    rig.let_go(220, Button::Shift);
    rig.step(230);
    assert_eq!(rig.control.value(TRANSPOSE.id), 1);
    let mut value = Label::new();
    param::format(&TRANSPOSE, rig.control.value(TRANSPOSE.id), &mut value);
    assert_eq!(value.as_str(), "+1");

    // Filter: SHIFT + encoder 2 down a fine click.
    rig.page(300, 2);
    rig.press(310, Button::Shift);
    rig.turn(320, 1, -1);
    rig.let_go(330, Button::Shift);
    rig.step(340);
    assert_eq!(rig.control.value(CUTOFF.id), 65_503);
}

#[test]
fn the_filter_page_matches_its_geometry() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.page(10, 2);
    rig.step(20);
    let screen = picture(&rig.control);

    assert!(shows_header(
        &rig.control,
        &page_header("Filter", ("Syn 1", TEXT))
    ));
    // Item 1, Mode, shows its list with the faint track only.
    assert_eq!(span(&screen, 2..=161, 17..=29, TEXT), Some((130, 158)));
    assert!(filled(&screen, 5..=158, 31..=32, FAINT));
    // Item 2 at (2, 35): the digit, the value and the full accent bar.
    assert_eq!(span(&screen, 2..=15, 35..=47, DIM), Some((5, 9)));
    assert_eq!(span(&screen, 2..=161, 35..=47, TEXT), Some((136, 158)));
    assert!(filled(&screen, 5..=158, 49..=50, ACCENT));
    let mut cutoff = Screen::new();
    draw_item(
        &mut cutoff,
        2,
        35,
        160,
        &ItemView {
            encoder: Some(2),
            name: "Cutoff",
            value: "100%",
            bar: Bar::Fill(65_535),
        },
        true,
    );
    assert!(same(&screen, &cutoff, 2..=161, 35..=51));

    let cell = |encoder, name, value, bar| {
        Some(ItemView {
            encoder: Some(encoder),
            name,
            value,
            bar,
        })
    };
    let strip = drawn(
        &[],
        None,
        |_| {},
        &[
            cell(1, "Mode", "LP 24", Bar::Track),
            cell(2, "Cutoff", "100%", Bar::Fill(65_535)),
            cell(3, "Resonance", "0%", Bar::Fill(0)),
            cell(4, "Envelope amount", "+0", Bar::Fill(32_768)),
        ],
    );
    assert!(same(&screen, &strip, 0..=WIDTH - 1, 253..=HEIGHT - 1));
}

#[test]
fn oscillator_2_names_give_way_to_their_values() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    rig.page(10, 1);
    rig.step(20);
    let screen = picture(&rig.control);

    // Item 8 at y 143 shows its whole value, "+0", and its name shortened to the room that is left:
    // 20 characters and "…", which the rule that shortens names gives for "Oscillator 2 fine tune"
    // beside "+0".
    assert_eq!(span(&screen, 2..=161, 143..=155, TEXT), Some((148, 158)));
    let mut expected = Screen::new();
    draw_item(
        &mut expected,
        2,
        143,
        160,
        &ItemView {
            encoder: None,
            name: "Oscillator 2 fine tu…",
            value: "+0",
            bar: Bar::Fill(32_767),
        },
        true,
    );
    assert!(same(&screen, &expected, 2..=161, 143..=159));
}

#[test]
fn the_strip_on_step_follows_sounds_shown_page() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.page(10, 4);
    rig.step(20);

    let cell = |encoder, name, value, bar| {
        Some(ItemView {
            encoder: Some(encoder),
            name,
            value,
            bar,
        })
    };
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            None,
            |_| {},
            &[
                cell(1, "Attack", "0 ms", Bar::Fill(0)),
                cell(2, "Decay", "300 ms", Bar::Fill(20_363)),
                cell(3, "Sustain", "100%", Bar::Fill(65_535)),
                cell(4, "Release", "100 ms", Bar::Fill(14_117)),
            ],
        )
    ));

    // With an empty pad selected the strip is empty, and the page is remembered.
    rig.hit(100, 1, 100);
    rig.release(110, 1);
    rig.step(120);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("2", DIM), ("Pads", DIM)]
    ));
    assert_eq!(rig.control.view.page(view::Screen::Sound), 4);
}

/// What SOUND shows on its page `page`, counted from the Pad page as 0 (step `page` under PAGE),
/// for a synth on pad 1 with the entries `values` set.
fn sound_page(page: u8, values: &[(ParamId, i32)]) -> Screen {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    for &(id, value) in values {
        rig.control
            .project
            .pool
            .get_mut(sound)
            .unwrap()
            .set(id, value);
    }
    rig.menu(0, 2);
    rig.page(10, page);
    rig.step(20);
    picture(&rig.control)
}

/// The first row of column `x` in the picture area that holds the shape in the text colour.
fn shape_row(screen: &Screen, x: usize) -> usize {
    (16..=251)
        .find(|&y| screen.pixel(x, y) == TEXT)
        .expect("the shape crosses the column")
}

#[test]
fn the_filter_curve_marks_the_cutoff_with_a_faint_line() {
    let screen = sound_page(2, &[(CUTOFF.id, 32_768)]);

    // At column 164 + round(0.5 × 314), from the top row to the bottom row, under the curve.
    assert!(filled(&screen, 321..=321, 130..=240, FAINT));
    assert!(filled(&screen, 320..=320, 130..=240, BACKGROUND));
    // Nothing lies outside the picture area, which is x 164 to 478 and y 16 to 251.
    assert!(filled(&screen, 163..=163, 15..=252, BACKGROUND));
    assert!(filled(&screen, 479..=479, 15..=252, BACKGROUND));
    assert!(filled(&screen, 164..=478, 15..=15, BACKGROUND));
    assert!(filled(&screen, 164..=478, 252..=252, BACKGROUND));
}

#[test]
fn low_pass_is_level_below_the_cutoff_and_falls_above_it() {
    let screen = sound_page(2, &[(MODE.id, LP_12), (CUTOFF.id, 16_384)]);

    assert!(shape_row(&screen, 170) < shape_row(&screen, 470));
}

#[test]
fn high_pass_rises_toward_the_cutoff() {
    let screen = sound_page(2, &[(MODE.id, HP), (CUTOFF.id, 49_151)]);

    assert!(shape_row(&screen, 170) > shape_row(&screen, 470));
}

#[test]
fn the_envelope_holds_at_the_sustain_level() {
    let screen = sound_page(4, &[(SUSTAIN.id, 39_321)]);

    // The hold lies between the decay's end at column 188 and the release's start at column 267.
    assert!(filled(&screen, 190..=265, 110..=110, TEXT));
    assert!(filled(&screen, 190..=265, 109..=109, BACKGROUND));
}

#[test]
fn the_envelope_marks_the_release_and_the_bottom_with_faint_lines() {
    let screen = sound_page(4, &[(SUSTAIN.id, 39_321)]);

    assert!(filled(&screen, 267..=267, 130..=249, FAINT));
    assert!(filled(&screen, 190..=265, 250..=250, FAINT));
    assert!(filled(&screen, 163..=163, 15..=252, BACKGROUND));
    assert!(filled(&screen, 479..=479, 15..=252, BACKGROUND));
    assert!(filled(&screen, 164..=478, 252..=252, BACKGROUND));
}

#[test]
fn a_zero_attack_rises_straight_up() {
    let screen = sound_page(4, &[(ATTACK.id, 0)]);

    assert!(filled(&screen, 164..=164, 17..=250, TEXT));
}
