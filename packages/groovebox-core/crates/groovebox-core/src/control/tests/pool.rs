//! POOL: Remove unused and the sounds of the pool, the library meter and the cursor's moves.

use super::library::{meter, row};
use super::sample_sounds::{KICK, delete_kick, library, sample_on};
use super::*;
use crate::budget;
use crate::font::ADVANCE;
use crate::library::FileId;
use crate::library::wav::{self, Encoding};
use crate::project::pool::{Engine, Sample};
use crate::sample_ram::BLOCK;
use crate::storage::Path;
use crate::ui::layout::{ROW_WIDTH, TEXT_INSET};
use crate::ui::list::{Row, draw_rows};
use crate::ui::test_pixels::MOVED;
use crate::ui::text;
use std::format;
use std::string::String;
use view::Cursor;

/// POOL on T1 in PADS mode with `sound` in the header: Remove unused and then `rows`, with the
/// cursor where POOL's view has it, and the library meter above an empty strip.
fn pool(rig: &Rig<'_>, sound: (&str, Color), rows: &[Row]) -> Screen {
    let cursor = rig.control.view.pool.cursor;
    let used = rig.control.library.used();
    let value = name::meter(used, budget::SAMPLE_RAM as u64);
    let rows: Vec<Row> = [row("Remove unused", None)]
        .into_iter()
        .chain(rows.iter().copied())
        .collect();
    drawn(
        &[("Pool", ACCENT), ("T1", TEXT), sound, ("Pads", DIM)],
        None,
        |screen| {
            draw_rows(screen, 17, 15, &rows, cursor.scroll, Some(cursor.item), 0);
            draw_item(
                screen,
                2,
                235,
                476,
                &meter(value.as_str(), used / BLOCK as u64),
                false,
                None,
            );
        },
        &[None; 4],
    )
}

/// The row of a missing sound named `name`, with `label`.
fn missing<'a>(name: &'a str, label: &'a str) -> Row<'a> {
    Row {
        left: name,
        right: Some(label),
        alert: true,
    }
}

#[test]
fn menu_6_shows_pool_with_remove_unused_and_every_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.control.project.put(11, Some(syn_1));
    rig.synth_on(1);
    rig.control.project.track = 1;
    rig.synth_on(0);
    rig.control.project.track = 0;
    rig.control.project.pool.new_synth().unwrap();

    rig.menu(10, 5);
    rig.step(20);

    assert_eq!(rig.control.view.screen, view::Screen::Pool);
    assert!(shows(
        &rig.control,
        &pool(
            &rig,
            ("Syn 1", TEXT),
            &[
                row("Syn 1", Some("synth  pads 1, 12")),
                row("Syn 2", Some("synth  pad 2")),
                row("Syn 3", Some("synth  no pad")),
                row("Syn 4", Some("synth  no pad, no notes")),
            ]
        )
    ));
    // The meter as on SAMPLES: its name from x 5 with its capitals on rows 238 to 244, its bar on
    // rows 249 and 250.
    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 2..=100, 238..=244, DIM), Some((5, 45)));
    assert_eq!(span(&screen, 0..=479, 249..=250, FAINT), Some((5, 474)));
}

#[test]
fn a_sample_sounds_row_shows_its_size() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    sample_on(&mut rig, 0, KICK.file);

    rig.menu(10, 5);
    rig.step(20);

    // kick.wav's size as SAMPLES shows it.
    assert!(shows(
        &rig.control,
        &pool(
            &rig,
            ("kick", TEXT),
            &[row("kick", Some("sample  pad 1  10 KB"))]
        )
    ));
}

#[test]
fn a_missing_sound_is_red_with_its_files_name() {
    let queue = Queue::new();
    let mut rig = Rig::with_files(&queue, &library());
    rig.open();
    sample_on(&mut rig, 0, KICK.file);
    let forget = delete_kick(&mut rig, 10);
    rig.control.applied(forget.number, 90);
    rig.settle(100);

    rig.menu(200, 5);
    rig.step(210);

    let kick = missing("kick", "sample  missing kick.wav  pad 1");
    assert!(shows(&rig.control, &pool(&rig, ("kick", RECORD), &[kick])));

    // A file start-up could not load reads the same, with its own name.
    let unloaded = Queue::new();
    let mut rig = Rig::with_files(
        &unloaded,
        &[(
            "samples/drums/kick.wav",
            wav::sine(440.0, 0.1, 44_100, Encoding::Int16, 1),
        )],
    );
    rig.open();
    assert!(!rig.control.library.file(FileId(0)).loaded);
    sample_on(&mut rig, 0, FileId(0));

    rig.menu(10, 5);
    rig.step(20);

    assert!(shows(&rig.control, &pool(&rig, ("kick", RECORD), &[kick])));
}

#[test]
fn a_long_missing_file_name_is_cut_to_keep_the_label_within_half_the_row() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sound = rig.synth_on(0);
    let long = "y".repeat(64);
    let mut path = Path::new();
    path.push_str(&format!("samples/{}.wav", "x".repeat(56)));
    let made = rig.control.project.pool.get_mut(sound).unwrap();
    made.engine = Engine::Sample(Sample::Missing(path));
    made.name = Label::new();
    made.name.push_str(&long);
    let half = (ROW_WIDTH - 2 * TEXT_INSET) / 2;

    rig.menu(10, 5);
    rig.step(20);

    // The 60 characters of the file's name keep 15 and a "…": one more would pass half the row.
    let label = format!("sample  missing {}…  pad 1", "x".repeat(15));
    assert!(text::width(&label) <= half);
    assert!(text::width(&label) + ADVANCE > half);
    assert!(shows(
        &rig.control,
        &pool(&rig, (&long, RECORD), &[missing(&long, &label)])
    ));

    // On all 12 pads the rest of the label passes half the row alone, and the name keeps its "…".
    for pad in 1..12 {
        rig.control.project.put(pad, Some(sound));
    }

    let label = "sample  missing …  pads 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12";
    assert!(shows(
        &rig.control,
        &pool(&rig, (&long, RECORD), &[missing(&long, label)])
    ));
}

#[test]
fn the_arrows_move_pools_cursor_and_left_and_right_jump_15_rows() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    for _ in 0..40 {
        rig.control.project.pool.new_synth().unwrap();
    }
    rig.menu(10, 5);
    let check = |rig: &mut Rig<'_>, moves: &[(u64, Button, usize)]| {
        for &(sample, button, row) in moves {
            rig.tap(sample, button);
            rig.step(sample + 2);
            let cursor = rig.control.view.pool.cursor.item;
            assert_eq!(cursor, row, "{button:?} at {sample}");
        }
    };

    // Up, down, - and + move one row and left and right 15, stopping at row 0 and at row 40.
    check(
        &mut rig,
        &[
            (100, Button::Up, 0),
            (110, Button::Down, 1),
            (120, Button::Right, 16),
            (130, Button::Left, 1),
            (140, Button::Up, 0),
            (150, Button::Left, 0),
            (160, Button::Plus, 1),
            (170, Button::Minus, 0),
        ],
    );

    // SHIFT + an arrow, - or + does nothing.
    rig.press(200, Button::Shift);
    check(
        &mut rig,
        &[
            (210, Button::Down, 0),
            (220, Button::Right, 0),
            (230, Button::Plus, 0),
        ],
    );
    rig.let_go(240, Button::Shift);

    check(
        &mut rig,
        &[
            (300, Button::Right, 15),
            (310, Button::Right, 30),
            (320, Button::Right, 40),
            (330, Button::Down, 40),
            (340, Button::Plus, 40),
        ],
    );
    // The rows move only as far as they must: Syn 40 came in at the bottom.
    assert_eq!(
        rig.control.view.pool.cursor,
        Cursor {
            item: 40,
            scroll: 26
        }
    );
    let names: Vec<String> = (1..=40).map(|number| format!("Syn {number}")).collect();
    let rows: Vec<Row> = names
        .iter()
        .map(|name| row(name, Some("synth  no pad, no notes")))
        .collect();
    assert!(shows(&rig.control, &pool(&rig, ("1", DIM), &rows)));
}

#[test]
fn the_encoders_and_cancel_do_nothing_on_pool() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(10, 5);
    rig.step(20);
    let (view, track, before) = (rig.control.view, *rig.track(), picture(&rig.control));

    for encoder in 0..4 {
        rig.turn(100 + 10 * u64::from(encoder), encoder, 1);
        rig.tap(105 + 10 * u64::from(encoder), Button::Push(encoder));
    }
    rig.tap(200, Button::Cancel);
    rig.step(300);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view, view);
    assert_eq!(*rig.track(), track);
    assert!(shows(&rig.control, &before));
}

#[test]
fn the_name_under_pools_cursor_scrolls_from_where_it_landed() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let long: String = ('a'..='z').cycle().take(64).collect();
    for _ in 0..2 {
        let sound = rig.control.project.pool.new_synth().unwrap();
        let name = &mut rig.control.project.pool.get_mut(sound).unwrap().name;
        *name = Label::new();
        name.push_str(&long);
    }
    rig.menu(10, 5);
    // The cursor lands on the first sound long after MENU was let go at 13.
    rig.tap(10_000, Button::Down);

    rig.step(10_000 + MOVED);

    let rows = [
        row("Remove unused", None),
        row(&long, Some("synth  no pad, no notes")),
        row(&long, Some("synth  no pad, no notes")),
    ];
    assert!(shows(
        &rig.control,
        &drawn(
            &[("Pool", ACCENT), ("T1", TEXT), ("1", DIM), ("Pads", DIM)],
            None,
            |screen| {
                draw_rows(screen, 17, 15, &rows, 0, Some(1), MOVED);
                draw_item(screen, 2, 235, 476, &meter("0.0 of 64 MB", 0), false, None);
            },
            &[None; 4],
        )
    ));
}
