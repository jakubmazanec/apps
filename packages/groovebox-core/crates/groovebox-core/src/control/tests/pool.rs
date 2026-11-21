//! POOL: Remove unused and the sounds of the pool, the library meter and the cursor's moves.

use super::library::{meter, row};
use super::pattern::{count, entered, notes_in, put, versions};
use super::sample_sounds::{KICK, delete_kick, library, sample_on};
use super::sound::{names, sound_header};
use super::*;
use crate::budget;
use crate::font::ADVANCE;
use crate::library::FileId;
use crate::library::wav::{self, Encoding};
use crate::project::pool::{Engine, Sample};
use crate::sample_ram::BLOCK;
use crate::storage::Path;
use crate::store::Tree;
use crate::ui::layout::{ROW_WIDTH, TEXT_INSET};
use crate::ui::list::{Row, draw_rows};
use crate::ui::question::draw_question;
use crate::ui::test_pixels::MOVED;
use crate::ui::text;
use crate::ui::tiles::{PadTile, draw_pad_tiles};
use std::format;
use std::string::String;
use view::{Cursor, Picker, Question};

/// POOL on T1 in PADS mode with `sound` in the header: Remove unused and then `rows`, with the
/// cursor where POOL's view has it, and the library meter above an empty strip.
fn pool(rig: &Rig<'_>, sound: (&str, Color), rows: &[Row]) -> Screen {
    pool_saying(rig, sound, None, rows)
}

/// `pool` with `message` on the right of the header.
fn pool_saying(
    rig: &Rig<'_>,
    sound: (&str, Color),
    message: Option<(&str, Color)>,
    rows: &[Row],
) -> Screen {
    let cursor = rig.control.view.pool.cursor;
    let used = rig.control.library.used();
    let value = name::meter(used, budget::SAMPLE_RAM as u64);
    let rows: Vec<Row> = [row("Remove unused", None)]
        .into_iter()
        .chain(rows.iter().copied())
        .collect();
    drawn(
        &[("Pool", ACCENT), ("T1", TEXT), sound, ("Pads", DIM)],
        message,
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

/// `pool` under the question of these `lines`.
fn asking(rig: &Rig<'_>, sound: (&str, Color), rows: &[Row], lines: &[(&str, Color)]) -> Screen {
    let mut screen = pool(rig, sound, rows);
    draw_question(&mut screen, lines);
    screen
}

fn delete(sound: SoundNumber) -> MessageKind {
    MessageKind::DeleteSound { sound }
}

/// The row of a missing sound named `name`, with `label`.
fn missing<'a>(name: &'a str, label: &'a str) -> Row<'a> {
    Row {
        left: name,
        right: Some(label),
        alert: true,
    }
}

/// Syn 1 on pads 1 and 12 and Syn 2 on pad 2 of T1, Syn 3 on pad 1 of T2 and Syn 4 on no pad,
/// with T1 current and its pad 1 selected.
fn four_synths(rig: &mut Rig<'_>) -> [SoundNumber; 4] {
    let syn_1 = rig.synth_on(0);
    rig.control.project.put(11, Some(syn_1));
    let syn_2 = rig.synth_on(1);
    rig.control.project.track = 1;
    let syn_3 = rig.synth_on(0);
    rig.control.project.track = 0;
    [
        syn_1,
        syn_2,
        syn_3,
        rig.control.project.pool.new_synth().unwrap(),
    ]
}

/// POOL's rows of `four_synths` on T1, after Remove unused.
fn four_rows() -> [Row<'static>; 4] {
    [
        row("Syn 1", Some("synth  pads 1, 12")),
        row("Syn 2", Some("synth  pad 2")),
        row("Syn 3", Some("synth  no pad")),
        row("Syn 4", Some("synth  no pad, no notes")),
    ]
}

#[test]
fn menu_6_shows_pool_with_remove_unused_and_every_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    four_synths(&mut rig);

    rig.menu(10, 5);
    rig.step(20);

    assert_eq!(rig.control.view.screen, view::Screen::Pool);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 1", TEXT), &four_rows())
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
    rig.applied(forget.number, 90);
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
fn a_row_of_a_sound_with_notes_on_no_pad_says_no_pad() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.control.project.pool.new_synth().unwrap();
    put(&mut rig, 0, 1, &[entered(0, synth, 60)]);

    rig.menu(10, 5);
    rig.step(20);

    assert!(shows(
        &rig.control,
        &pool(&rig, ("1", DIM), &[row("Syn 1", Some("synth  no pad"))])
    ));
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
    // The header keeps 52 characters of the name and a "…" short of the transport.
    let cut = format!("{}…", "y".repeat(52));
    assert!(shows(
        &rig.control,
        &pool(&rig, (&cut, RECORD), &[missing(&long, &label)])
    ));

    // On all 12 pads the rest of the label passes half the row alone, and the name keeps its "…".
    for pad in 1..12 {
        rig.control.project.put(pad, Some(sound));
    }

    let label = "sample  missing …  pads 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12";
    assert!(shows(
        &rig.control,
        &pool(&rig, (&cut, RECORD), &[missing(&long, label)])
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
    // Moving onto a sound selects it.
    assert!(shows(&rig.control, &pool(&rig, ("Syn 40", TEXT), &rows)));
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
    // The header keeps 52 characters of the name and a "…" short of the transport.
    let cut = format!("{}…", &long[..52]);
    assert!(shows(
        &rig.control,
        &drawn(
            &[("Pool", ACCENT), ("T1", TEXT), (&cut, TEXT), ("Pads", DIM)],
            None,
            |screen| {
                draw_rows(screen, 17, 15, &rows, 0, Some(1), MOVED);
                draw_item(screen, 2, 235, 476, &meter("0.0 of 64 MB", 0), false, None);
            },
            &[None; 4],
        )
    ));
}

#[test]
fn pool_opens_on_the_selected_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    four_synths(&mut rig);
    rig.control.project.tracks[0].select(1);

    rig.menu(10, 5);
    rig.step(20);

    assert_eq!(rig.control.view.pool.cursor.item, 2);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 2", TEXT), &four_rows())
    ));

    // It lands there every time POOL opens, also after its cursor was moved onto Remove unused.
    rig.tap(30, Button::Left);
    rig.menu(40, 0);
    rig.menu(50, 5);
    rig.step(60);

    assert_eq!(rig.control.view.pool.cursor.item, 2);
}

#[test]
fn pool_opens_on_remove_unused_while_an_empty_pad_is_selected() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Down);
    rig.menu(30, 0);
    rig.hit(40, 2, 100);
    rig.release(50, 2);

    rig.menu(60, 5);
    rig.step(70);

    assert_eq!(rig.control.view.pool.cursor.item, 0);
    assert!(shows(&rig.control, &pool(&rig, ("3", DIM), &four_rows())));
}

#[test]
fn moving_onto_a_sound_selects_it_and_its_first_pad() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.control.project.put(11, Some(syn_1));
    rig.control.project.tracks[0].select(11);
    rig.menu(10, 5);

    // Down on the last row moves nothing, so pad 12 stays selected.
    rig.tap(20, Button::Down);
    rig.step(30);
    assert_eq!(rig.track().selected_pad, Some(11));

    rig.tap(40, Button::Up);
    rig.tap(50, Button::Down);
    rig.step(60);

    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert!(shows(
        &rig.control,
        &pool(
            &rig,
            ("Syn 1", TEXT),
            &[row("Syn 1", Some("synth  pads 1, 12"))]
        )
    ));
    assert_eq!(rig.lit(), [pad(0), track(0)]);
    assert_eq!(rig.sent(), []);
}

#[test]
fn moving_onto_a_sound_on_no_pad_leaves_no_pad_selected() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [.., syn_4] = four_synths(&mut rig);
    rig.menu(10, 5);
    for sample in [20, 30, 40] {
        rig.tap(sample, Button::Down);
    }

    rig.step(50);

    assert_eq!(rig.track().selected_pad, None);
    assert_eq!(rig.track().selected_sound, Some(syn_4));
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 4", TEXT), &four_rows())
    ));
    assert_eq!(rig.lit(), [track(0)]);

    // SOUND's Pad page holds Engine alone, on encoder 3, and the pads picture marks no pad.
    rig.menu(60, 2);
    rig.step(70);
    let pads = names(&[(0, "Syn 1"), (1, "Syn 2"), (11, "Syn 1")]);
    assert!(shows(
        &rig.control,
        &drawn(
            &sound_header(("Syn 4", TEXT)),
            None,
            |screen| {
                draw_item(screen, 2, 17, 160, &engine("Synth"), true, None);
                draw_cursor(screen, 2, 17, 160, 17);
                draw_pad_tiles(
                    screen,
                    &core::array::from_fn(|pad| PadTile {
                        name: pads[pad],
                        selected: false,
                    }),
                    0,
                );
            },
            &[None, None, Some(engine("Synth")), None],
        )
    ));

    // PAGE lights all six of SOUND's pages.
    rig.press(80, Button::Page);
    rig.step(81);
    assert_eq!(
        rig.lit(),
        [
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
fn keys_mode_plays_a_sound_selected_on_no_pad() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [.., syn_4] = four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Right);
    rig.tap(30, Button::PadsKeys);

    rig.hit(40, 4, 100);
    rig.step(50);

    assert_eq!(rig.sent(), [message(0, 40, note_on(0, 0, syn_4, 64, 100))]);
}

#[test]
fn moving_onto_remove_unused_keeps_the_selection_and_the_cursor_stays() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [_, syn_2, ..] = four_synths(&mut rig);
    rig.control.project.tracks[0].select(1);
    rig.menu(10, 5);
    rig.step(20);
    assert_eq!(rig.control.view.pool.cursor.item, 2);

    rig.tap(30, Button::Left);
    rig.step(40);

    assert_eq!(rig.control.view.pool.cursor.item, 0);
    assert_eq!(rig.track().selected_sound, Some(syn_2));
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 2", TEXT), &four_rows())
    ));

    // Another event leaves it there, as the selection stays.
    rig.tap(50, Button::Cancel);
    rig.step(60);

    assert_eq!(rig.control.view.pool.cursor.item, 0);
}

#[test]
fn a_pad_hit_on_pool_moves_the_cursor_to_its_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, syn_2, ..] = four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Right);

    // From Syn 4, which is on no pad, a hit on pad 2 selects that pad again.
    rig.hit(30, 1, 100);
    rig.step(40);

    assert_eq!(rig.track().selected_pad, Some(1));
    assert_eq!(rig.track().selected_sound, Some(syn_2));
    assert_eq!(rig.control.view.pool.cursor.item, 2);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 2", TEXT), &four_rows())
    ));

    // From Remove unused alike.
    rig.tap(50, Button::Left);
    rig.hit(60, 11, 100);
    rig.step(70);

    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert_eq!(rig.control.view.pool.cursor.item, 1);

    // A hit on an empty pad moves it to Remove unused.
    rig.hit(80, 2, 100);
    rig.step(90);

    assert_eq!(rig.control.view.pool.cursor.item, 0);
    assert!(shows(&rig.control, &pool(&rig, ("3", DIM), &four_rows())));
}

#[test]
fn a_track_button_on_pool_moves_the_cursor_to_that_tracks_selection() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, _, syn_3, _] = four_synths(&mut rig);
    rig.menu(10, 5);

    // T2's pad 1 holds Syn 3.
    rig.tap(20, Button::T2);
    rig.step(30);
    assert_eq!(rig.track().selected_sound, Some(syn_3));
    assert_eq!(rig.control.view.pool.cursor.item, 3);

    // T3's pad 1 is empty.
    rig.tap(40, Button::T3);
    rig.step(50);
    assert_eq!(rig.control.view.pool.cursor.item, 0);

    rig.tap(60, Button::T1);
    rig.step(70);
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert_eq!(rig.control.view.pool.cursor.item, 1);
}

#[test]
fn following_a_sound_far_down_scrolls_it_into_view() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    for _ in 0..40 {
        rig.control.project.pool.new_synth().unwrap();
    }
    let syn_40 = rig.control.project.pool.sounds()[39].number;
    rig.control.project.put(0, Some(syn_40));
    rig.control.project.tracks[0].select(1);
    rig.menu(10, 5);

    rig.hit(20, 0, 100);
    rig.step(30);

    assert_eq!(
        rig.control.view.pool.cursor,
        Cursor {
            item: 40,
            scroll: 26
        }
    );
}

#[test]
fn every_pad_hit_and_track_button_lands_a_parked_cursor_on_the_selection() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, ..] = four_synths(&mut rig);
    rig.control.project.tracks[2].put(0, Some(syn_1));
    rig.menu(10, 5);
    let park = |rig: &mut Rig<'_>, sample: u64| {
        rig.tap(sample, Button::Left);
        rig.step(sample + 2);
        assert_eq!(rig.control.view.pool.cursor.item, 0, "parked at {sample}");
    };

    // A hit on the selected pad 1, then on pad 12, which holds the same Syn 1.
    for (sample, pad) in [(100, 0), (200, 11)] {
        park(&mut rig, sample);
        rig.hit(sample + 10, pad, 100);
        rig.release(sample + 20, pad);
        rig.step(sample + 30);

        assert_eq!(rig.track().selected_pad, Some(pad));
        assert_eq!(rig.control.view.pool.cursor.item, 1, "pad {pad}");
        assert!(shows(
            &rig.control,
            &pool(&rig, ("Syn 1", TEXT), &four_rows())
        ));
    }

    // T1 on T1, then T3, whose pad 1 holds Syn 1 too.
    for (sample, button, track) in [(300, Button::T1, 0), (400, Button::T3, 2)] {
        park(&mut rig, sample);
        rig.tap(sample + 10, button);
        rig.step(sample + 20);

        assert_eq!(rig.control.project.track, track);
        assert_eq!(rig.track().selected_sound, Some(syn_1));
        assert_eq!(rig.control.view.pool.cursor.item, 1, "{button:?}");
    }
}

#[test]
fn ok_on_a_sound_opens_its_delete_picker() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, ..] = four_synths(&mut rig);
    rig.menu(10, 5);

    rig.tap(20, Button::Ok);
    rig.step(30);

    assert_eq!(
        rig.control.view.picker,
        Some((Picker::DeleteSound(syn_1), Cursor { item: 0, scroll: 0 }))
    );
    assert!(shows(
        &rig.control,
        &drawn(
            &[
                ("Pool", ACCENT),
                ("T1", TEXT),
                ("Syn 1", TEXT),
                ("Pads", DIM)
            ],
            None,
            |screen| {
                draw_rows(screen, 17, 16, &[row("Delete", None)], 0, Some(0), 0);
            },
            &[None; 4],
        )
    ));

    rig.tap(40, Button::Cancel);
    rig.step(50);

    assert_eq!(rig.control.view.picker, None);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 1", TEXT), &four_rows())
    ));
}

#[test]
fn a_hit_while_pools_picker_is_open_moves_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, syn_2, ..] = four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Ok);

    // Pad 2 sounds but does not select, and T1 to T4 do nothing.
    rig.hit(30, 1, 100);
    rig.release(40, 1);
    for (sample, button) in [
        (50, Button::T1),
        (60, Button::T2),
        (70, Button::T3),
        (80, Button::T4),
    ] {
        rig.tap(sample, button);
    }
    rig.step(90);

    assert_eq!(
        rig.sent(),
        [
            message(0, 30, note_on(0, 0, syn_2, 60, 100)),
            message(1, 40, note_off(0))
        ]
    );
    assert_eq!(rig.control.project.track, 0);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert_eq!(rig.control.view.pool.cursor.item, 1);
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::DeleteSound(syn_1), Cursor { item: 0, scroll: 0 }))
    );
}

#[test]
fn the_delete_question_counts_the_pads_on_every_track() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, ..] = four_synths(&mut rig);
    rig.control.project.tracks[1].put(2, Some(syn_1));
    rig.menu(10, 5);

    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Ok);
    rig.step(40);

    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteSound(syn_1))
    );
    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 1", TEXT),
            &four_rows(),
            &[
                ("Delete Syn 1?", TEXT),
                ("On 3 pads", DIM),
                ("OK deletes, Cancel keeps", DIM),
            ]
        )
    ));

    // Syn 2 is on pad 2 alone.
    rig.tap(50, Button::Cancel);
    rig.tap(60, Button::Down);
    rig.tap(70, Button::Ok);
    rig.tap(80, Button::Ok);
    rig.step(90);

    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 2", TEXT),
            &four_rows(),
            &[
                ("Delete Syn 2?", TEXT),
                ("On 1 pad", DIM),
                ("OK deletes, Cancel keeps", DIM),
            ]
        )
    ));
}

#[test]
fn the_delete_question_of_an_unused_sound_has_no_count() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Right);

    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Ok);
    rig.step(50);

    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 4", TEXT),
            &four_rows(),
            &[("Delete Syn 4?", TEXT), ("OK deletes, Cancel keeps", DIM)]
        )
    ));
}

#[test]
fn the_delete_question_counts_pads_and_notes() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, syn_2, _, syn_4] = four_synths(&mut rig);
    let pitches = |sound| {
        (0..24)
            .map(|pitch| entered(0, sound, pitch))
            .collect::<Vec<_>>()
    };
    put(&mut rig, 0, 0, &pitches(syn_1));
    put(&mut rig, 0, 2, &[entered(0, syn_2, 60)]);
    put(&mut rig, 1, 3, &pitches(syn_4));
    let mut rows = four_rows();
    rows[3] = row("Syn 4", Some("synth  no pad"));
    rig.menu(10, 5);

    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Ok);
    rig.step(40);

    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 1", TEXT),
            &rows,
            &[
                ("Delete Syn 1?", TEXT),
                ("On 2 pads, 24 notes", DIM),
                ("OK deletes, Cancel keeps", DIM),
            ]
        )
    ));

    rig.tap(50, Button::Cancel);
    rig.tap(60, Button::Down);
    rig.tap(70, Button::Ok);
    rig.tap(80, Button::Ok);
    rig.step(90);

    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 2", TEXT),
            &rows,
            &[
                ("Delete Syn 2?", TEXT),
                ("On 1 pad, 1 note", DIM),
                ("OK deletes, Cancel keeps", DIM),
            ]
        )
    ));

    // Syn 4 is on no pad: a part whose count is 0 is left out.
    rig.tap(100, Button::Cancel);
    rig.tap(110, Button::Right);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Ok);
    rig.step(140);

    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 4", TEXT),
            &rows,
            &[
                ("Delete Syn 4?", TEXT),
                ("24 notes", DIM),
                ("OK deletes, Cancel keeps", DIM),
            ]
        )
    ));
}

#[test]
fn ok_deletes_the_sound_and_lands_on_the_row_above() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    rig.control.project.tracks[1].put(0, Some(syn_2));
    rig.menu(10, 5);
    rig.tap(20, Button::Down);
    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Ok);

    rig.tap(50, Button::Ok);
    rig.step(60);

    assert_eq!(rig.sent(), [message(0, 50, delete(syn_2))]);
    assert_eq!(rig.control.view.question, None);
    assert_eq!(rig.track().pads[1], None);
    assert_eq!(rig.control.project.tracks[1].pads[0], None);
    assert_eq!(rig.control.view.pool.cursor.item, 1);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 1", TEXT), &[row("Syn 1", Some("synth  pad 1"))])
    ));
}

#[test]
fn deleting_a_sound_removes_its_notes_from_every_track() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    put(
        &mut rig,
        0,
        0,
        &[
            entered(0, syn_1, 60),
            entered(0, syn_2, 60),
            entered(4, syn_1, 64),
        ],
    );
    put(
        &mut rig,
        0,
        2,
        &[entered(8, syn_1, 60), entered(9, syn_2, 62)],
    );
    // Pattern 2 is not current, so its track changes without a version.
    put(
        &mut rig,
        1,
        1,
        &[entered(2, syn_1, 60), entered(3, syn_2, 62)],
    );
    rig.menu(10, 5);
    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Ok);

    rig.tap(40, Button::Ok);
    rig.step(50);

    let [t1, t2, t3, t4] = rig.control.project.patterns[0].tracks;
    assert_eq!(
        versions(&mut rig),
        [
            Version {
                number: 0,
                moment: 40 + 1_024,
                track: 0,
                tree: t1
            },
            Version {
                number: 1,
                moment: 40 + 1_024,
                track: 2,
                tree: t3
            }
        ]
    );
    // At the input's sample, so the audio part forgets the sound before the versions apply (S22).
    assert_eq!(rig.sent(), [message(2, 40, delete(syn_1))]);
    assert_eq!(notes_in(&rig, t1), [entered(0, syn_2, 60)]);
    assert_eq!(notes_in(&rig, t3), [entered(9, syn_2, 62)]);
    assert_eq!((t2, t4), (Tree(None), Tree(None)));
    assert_eq!(
        notes_in(&rig, rig.control.project.patterns[1].tracks[1]),
        [entered(3, syn_2, 62)]
    );
    assert_eq!(count(&rig, syn_2), 3);
    assert!(rig.control.project.pool.get(syn_1).is_none());
}

#[test]
fn a_deleted_sounds_note_off_still_goes_out() {
    for keys in [false, true] {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        let syn_1 = rig.synth_on(0);
        if keys {
            rig.tap(1, Button::PadsKeys);
        }
        rig.hit(5, 0, 100);
        rig.menu(10, 5);
        rig.tap(20, Button::Ok);
        rig.tap(30, Button::Ok);
        rig.tap(40, Button::Ok);

        rig.release(50, 0);
        rig.step(60);

        assert_eq!(
            rig.sent(),
            [
                message(0, 5, note_on(0, 0, syn_1, 60, 100)),
                message(1, 40, delete(syn_1)),
                message(2, 50, note_off(0))
            ],
            "keys: {keys}"
        );
    }
}

#[test]
fn cancel_keeps_the_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Ok);

    rig.tap(40, Button::Cancel);
    rig.step(50);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.question, None);
    assert_eq!(rig.control.project.pool.sounds().len(), 4);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 1", TEXT), &four_rows())
    ));
}

#[test]
fn deleting_the_first_sound_lands_on_remove_unused() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, ..] = four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Ok);

    rig.tap(40, Button::Ok);
    rig.step(50);

    assert_eq!(rig.sent(), [message(0, 40, delete(syn_1))]);
    assert_eq!(rig.control.view.pool.cursor.item, 0);
    // The track keeps the empty pad the delete left.
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, None);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("1", DIM), &four_rows()[1..])
    ));
}

#[test]
fn a_track_that_selected_the_deleted_sound_on_no_pad_goes_back_to_pad_1() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [_, _, syn_3, syn_4] = four_synths(&mut rig);
    rig.menu(10, 5);
    // T2 selects Syn 4, which is on none of its pads, and so does T1.
    rig.tap(20, Button::T2);
    rig.tap(30, Button::Down);
    rig.tap(40, Button::T1);
    rig.tap(50, Button::Right);
    rig.step(60);
    assert_eq!(rig.control.project.tracks[1].selected_pad, None);
    assert_eq!(rig.control.project.tracks[1].selected_sound, Some(syn_4));

    rig.tap(70, Button::Ok);
    rig.tap(80, Button::Ok);
    rig.tap(90, Button::Ok);
    rig.step(100);

    assert_eq!(rig.sent(), [message(0, 90, delete(syn_4))]);
    // T2's pad 1 holds Syn 3.
    assert_eq!(rig.control.project.tracks[1].selected_pad, Some(0));
    assert_eq!(rig.control.project.tracks[1].selected_sound, Some(syn_3));
    // On T1 the cursor goes to Syn 3, the row above, and selects it on no pad.
    assert_eq!(rig.control.view.pool.cursor.item, 3);
    assert_eq!(rig.track().selected_pad, None);
    assert_eq!(rig.track().selected_sound, Some(syn_3));
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 3", TEXT), &four_rows()[..3])
    ));
}

#[test]
fn deleting_the_first_sound_selected_on_no_pad_lands_on_pad_1s_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.control.project.pool.new_synth().unwrap();
    let syn_2 = rig.synth_on(0);
    rig.menu(10, 5);
    // Syn 1, on no pad, is selected on POOL.
    rig.tap(20, Button::Up);
    rig.step(25);
    assert_eq!(rig.track().selected_pad, None);
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Ok);

    rig.tap(50, Button::Ok);
    rig.step(60);

    assert_eq!(rig.sent(), [message(0, 50, delete(syn_1))]);
    assert_eq!(rig.control.view.pool.cursor.item, 1);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_2));
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 2", TEXT), &[row("Syn 2", Some("synth  pad 1"))])
    ));
}

#[test]
fn remove_unused_asks_with_the_count_and_removes_every_unused_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.control.project.pool.new_synth().unwrap();
    rig.control.project.tracks[1].put(0, Some(syn_2));
    let syn_3 = rig.control.project.pool.new_synth().unwrap();
    let syn_4 = rig.control.project.pool.new_synth().unwrap();
    rig.menu(10, 5);
    rig.tap(20, Button::Left);

    rig.tap(30, Button::Ok);
    rig.step(40);

    let rows = [
        row("Syn 1", Some("synth  pad 1")),
        row("Syn 2", Some("synth  no pad")),
        row("Syn 3", Some("synth  no pad, no notes")),
        row("Syn 4", Some("synth  no pad, no notes")),
    ];
    assert_eq!(rig.control.view.question, Some(Question::RemoveUnused));
    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 1", TEXT),
            &rows,
            &[
                ("Remove 2 unused sounds?", TEXT),
                ("OK removes, Cancel keeps", DIM)
            ]
        )
    ));

    rig.tap(50, Button::Ok);
    rig.step(60);

    assert_eq!(
        rig.sent(),
        [message(0, 50, delete(syn_3)), message(1, 50, delete(syn_4))]
    );
    assert_eq!(rig.control.view.question, None);
    assert_eq!(rig.control.view.pool.cursor.item, 0);
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 1", TEXT), &rows[..2])
    ));
}

#[test]
fn remove_unused_keeps_a_sound_with_notes() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.control.project.pool.new_synth().unwrap();
    let syn_3 = rig.control.project.pool.new_synth().unwrap();
    put(&mut rig, 1, 3, &[entered(0, syn_2, 60)]);
    rig.menu(10, 5);
    rig.tap(20, Button::Left);

    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Ok);
    rig.step(50);

    assert_eq!(rig.sent(), [message(0, 40, delete(syn_3))]);
    assert_eq!(versions(&mut rig), []);
    assert!(
        rig.control
            .project
            .pool
            .sounds()
            .iter()
            .map(|sound| sound.number)
            .eq([syn_1, syn_2])
    );
}

#[test]
fn remove_unused_with_one_unused_sound_says_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    four_synths(&mut rig);
    rig.menu(10, 5);
    rig.tap(20, Button::Left);

    rig.tap(30, Button::Ok);
    rig.step(40);

    assert!(shows(
        &rig.control,
        &asking(
            &rig,
            ("Syn 1", TEXT),
            &four_rows(),
            &[
                ("Remove 1 unused sound?", TEXT),
                ("OK removes, Cancel keeps", DIM)
            ]
        )
    ));
}

#[test]
fn remove_unused_with_none_unused_says_so_in_the_header() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(10, 5);
    rig.tap(20, Button::Left);

    rig.tap(30, Button::Ok);
    rig.step(40);

    let rows = [row("Syn 1", Some("synth  pad 1"))];
    assert_eq!(rig.control.view.question, None);
    assert!(shows(
        &rig.control,
        &pool_saying(
            &rig,
            ("Syn 1", TEXT),
            Some(("No unused sounds", ACCENT)),
            &rows
        )
    ));

    // The next button press clears it.
    rig.tap(50, Button::Cancel);
    rig.step(60);

    assert!(shows(&rig.control, &pool(&rig, ("Syn 1", TEXT), &rows)));
}

#[test]
fn remove_unused_removes_a_sound_selected_on_no_pad_and_the_cursor_follows_pad_1() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [syn_1, .., syn_4] = four_synths(&mut rig);
    rig.menu(10, 5);
    // Syn 4, on no pad, stays selected on Remove unused.
    rig.tap(20, Button::Right);
    rig.tap(30, Button::Left);

    rig.tap(40, Button::Ok);
    rig.tap(50, Button::Ok);
    rig.step(60);

    assert_eq!(rig.sent(), [message(0, 50, delete(syn_4))]);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert_eq!(rig.control.view.pool.cursor.item, 1);
    assert!(shows(
        &rig.control,
        &pool(&rig, ("Syn 1", TEXT), &four_rows()[..3])
    ));
}

#[test]
fn remove_unused_on_a_full_pool_sends_every_delete_before_the_next_new_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    while rig.control.project.pool.new_synth().is_ok() {}
    rig.menu(10, 5);
    rig.tap(20, Button::Left);
    rig.tap(30, Button::Ok);
    rig.tap(40, Button::Ok);
    // SOUND's Sound item opens the sound picker on Syn 1, and Up highlights New synth.
    rig.menu(50, 2);
    rig.tap(60, Button::Ok);
    rig.tap(70, Button::Up);
    rig.tap(80, Button::Ok);

    // The audio part empties the queue before each step.
    rig.step(100);
    let mut sent = rig.sent();
    assert!(sent.len() < 1_023);
    while rig.control.unsent.peek().is_some() {
        // No event is handled while a delete waits, so MENU + 2 waits too.
        assert_eq!(rig.control.view.screen, view::Screen::Pool);
        rig.step(100);
        sent.extend(rig.sent());
    }
    rig.step(100);
    sent.extend(rig.sent());

    let mut expected: Vec<Message> = (2..=1_024)
        .zip(0..)
        .map(|(sound, number)| message(number, 40, delete(SoundNumber(sound))))
        .collect();
    expected.push(message(
        1_023,
        80,
        MessageKind::NewSound {
            sound: SoundNumber(1_025),
        },
    ));
    assert_eq!(sent, expected);
}
