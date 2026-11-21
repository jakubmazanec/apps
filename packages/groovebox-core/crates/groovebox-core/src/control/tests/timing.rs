//! The PATTERN screen's Timing page, the tempo, TEMPO and the metronome.

use super::*;
use crate::sequencer::Run;
use crate::ui::layout::{HEADER_LINE, STRIP_LINE, rect};
use std::format;
use std::string::String;

/// The header of PATTERN's Timing page on T1 in PADS mode with pad 1 empty.
const TIMING_HEADER: [(&str, Color); 5] = [
    ("Pattern", ACCENT),
    ("Timing", TEXT),
    ("T1", TEXT),
    ("1", DIM),
    ("Pads", DIM),
];

/// Grid as the Timing page and the strip show it.
const GRID: ItemView = ItemView {
    encoder: Some(2),
    name: "Grid",
    value: "1/16",
    bar: Bar::Track,
};

/// The Timing page's items in the strip's cells: Tempo at `tempo`, its bar filled `filled` of
/// 27,000, then Grid.
fn timing_cells(tempo: &str, filled: u64) -> [Option<ItemView<'_>>; 4] {
    [
        Some(ItemView {
            encoder: Some(1),
            name: "Tempo",
            value: tempo,
            bar: Bar::Fill(filled, 27_000),
        }),
        Some(GRID),
        None,
        None,
    ]
}

/// PATTERN's Timing page of a stopped new project, with Tempo at `tempo`, its bar filled `filled`
/// of 27,000, here, in the header and in the strip, and the cursor on item `cursor`.
fn timing(tempo: &str, filled: u64, cursor: i32) -> Screen {
    let cells = timing_cells(tempo, filled);
    let [left, right]: [Vec<Piece>; 2] = [
        &TIMING_HEADER[..],
        &[("P1", TEXT), ("1/1", TEXT), (tempo, TEXT)],
    ]
    .map(|pieces| {
        pieces
            .iter()
            .map(|&(text, color)| Piece { text, color })
            .collect()
    });
    let mut screen = Screen::new();
    draw_header(&mut screen, &left, &right, false);
    for (y, item) in (17..).step_by(18).zip(cells.iter().flatten()) {
        draw_item(&mut screen, 2, y, 160, item, true, None);
    }
    draw_cursor(&mut screen, 2, 17 + 18 * cursor, 160, 17);
    draw_strip(&mut screen, &cells);
    screen
}

/// `screen` with its header of these pieces drawn again with the metronome on: a new project's
/// stopped transport, then the metronome's icon.
fn with_the_metronome(mut screen: Screen, header: &[(&str, Color)]) -> Screen {
    screen.fill_rect(rect(0, 0, WIDTH as i32, HEADER_LINE), BACKGROUND);
    draw_header(
        &mut screen,
        &header
            .iter()
            .map(|&(text, color)| Piece { text, color })
            .collect::<Vec<_>>(),
        &["P1", "1/1", "120.0"].map(|text| Piece { text, color: TEXT }),
        true,
    );
    screen
}

/// Whether the control part draws the strip with these cells.
fn strip_shows(control: &Control, cells: &[Option<ItemView>; 4]) -> bool {
    let mut expected = Screen::new();
    draw_strip(&mut expected, cells);
    let strip = WIDTH * STRIP_LINE as usize;
    picture(control).pixels()[strip..] == expected.pixels()[strip..]
}

/// The metronome switched to `value`.
fn metronome(value: i32) -> MessageKind {
    MessageKind::SetParam {
        target: Target::Device,
        id: METRONOME.id,
        value,
    }
}

/// A `Tempo` that goes on at `tempo` from tick `tick` at sample `anchor`.
fn tempo(anchor: u64, tick: u64, tempo: u32) -> MessageKind {
    MessageKind::Tempo {
        run: Run {
            anchor,
            tick,
            tempo,
        },
    }
}

#[test]
fn menu_9_shows_pattern_timing_with_tempo_and_grid() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.press(0, Button::Menu);
    rig.tap(10, Button::Step(8));
    rig.step(20);

    assert_eq!(
        menu_tiles(view::Screen::Pattern)[8],
        Tile {
            name: Some("Pattern"),
            state: TileState::Current
        }
    );
    assert!(shows(
        &rig.control,
        &tiles(&MENU_HEADER, &menu_tiles(view::Screen::Pattern))
    ));

    rig.let_go(30, Button::Menu);
    rig.step(40);
    assert_eq!(rig.control.view.screen, view::Screen::Pattern);
    assert!(shows(&rig.control, &timing("120.0", 9_000, 0)));
}

#[test]
fn the_tempo_moves_1_bpm_a_click_and_0_1_with_shift() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 8);
    rig.turn(100, 0, 1);
    rig.step(110);
    assert_eq!(rig.control.project.tempo, 12_100);
    assert!(shows(&rig.control, &timing("121.0", 9_100, 0)));

    rig.press(200, Button::Shift);
    rig.turn(210, 0, -3);
    rig.step(220);
    assert_eq!(rig.control.project.tempo, 12_070);
    assert!(shows(&rig.control, &timing("120.7", 9_070, 0)));

    // - and + move it the same way: by a fine click while SHIFT is held, else by a whole one.
    rig.tap(300, Button::Plus);
    rig.step(310);
    assert_eq!(rig.control.project.tempo, 12_080);
    rig.let_go(400, Button::Shift);
    rig.tap(410, Button::Minus);
    rig.step(420);
    assert_eq!(rig.control.project.tempo, 11_980);
    assert!(shows(&rig.control, &timing("119.8", 8_980, 0)));
    // A project value sends no `SetParam`, and while stopped nothing at all.
    assert_eq!(rig.sent(), []);
}

#[test]
fn grid_changes_with_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 8);
    // A turn of encoder 2 puts the cursor on Grid.
    rig.turn(100, 1, 3);
    rig.turn(110, 1, -2);
    rig.tap(120, Button::Minus);
    rig.tap(130, Button::Plus);
    rig.tap(140, Button::Ok);
    rig.tap(150, Button::Push(1));
    rig.step(200);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.project.tempo, 12_000);
    assert!(shows(&rig.control, &timing("120.0", 9_000, 1)));
}

#[test]
fn a_tempo_change_while_playing_goes_on_from_the_next_tick() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.tap(0, Button::Play);
    rig.menu(10, 8);
    rig.step(20);
    rig.sent();

    rig.turn(3_000, 0, 1);
    rig.step(3_128);

    // At 120 BPM tick 240 is at sample 3,000, so the first tick after it is 241, at 3,012.5
    // rounded down.
    assert_eq!(rig.sent(), [message(1, 3_000, tempo(3_012, 241, 12_100))]);
    // The control part's own sequencer goes on at the same run.
    assert_eq!(
        rig.control.player.run(),
        Some(Run {
            anchor: 3_012,
            tick: 241,
            tempo: 12_100
        })
    );
}

#[test]
fn a_tempo_change_while_stopped_sends_nothing_and_play_carries_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 8);
    rig.turn(100, 0, 1);
    rig.step(110);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.project.tempo, 12_100);

    rig.tap(9_600, Button::Play);
    rig.step(9_728);

    let run = Run {
        anchor: 9_600,
        tick: 0,
        tempo: 12_100,
    };
    assert_eq!(rig.sent(), [message(0, 9_600, MessageKind::Play { run })]);
    assert_eq!(rig.control.player.run(), Some(run));
}

#[test]
fn an_event_reads_the_music_at_its_own_sample() {
    /// The messages of PLAY at 0 and of two tempo turns at 3,000 and 3,600, stepped to each of
    /// `untils` in turn.
    fn sent(untils: &[u64]) -> Vec<Message> {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.tap(0, Button::Play);
        rig.menu(10, 8);
        rig.turn(3_000, 0, 1);
        rig.turn(3_600, 0, 1);
        untils
            .iter()
            .flat_map(|&until| {
                rig.step(until);
                rig.sent()
            })
            .collect()
    }

    let expected = [
        message(
            0,
            0,
            MessageKind::Play {
                run: Run {
                    anchor: 0,
                    tick: 0,
                    tempo: 12_000,
                },
            },
        ),
        message(1, 3_000, tempo(3_012, 241, 12_100)),
        // At 121 BPM the first tick after 3,600 is 289, 48 ticks or 595 samples after 241.
        message(2, 3_600, tempo(3_607, 289, 12_200)),
    ];
    assert_eq!(sent(&[9_600]), expected);
    assert_eq!(sent(&[3_300, 9_600]), expected);
}

#[test]
fn holding_tempo_shows_the_timing_strip_and_letting_go_brings_the_old_one_back() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);

    rig.press(100, Button::Tempo);
    rig.step(110);
    assert!(shows(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            None,
            |_| {},
            &timing_cells("120.0", 9_000)
        )
    ));

    // A long press, which leaves the metronome off.
    rig.let_go(100 + HOLD, Button::Tempo);
    rig.step(100 + HOLD + 10);
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
fn holding_tempo_shows_the_timing_strip_on_pool_and_samples_too() {
    for step in [5, 9] {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.menu(0, step);

        rig.press(100, Button::Tempo);
        rig.turn(110, 0, 1);
        rig.step(120);

        assert_eq!(rig.control.project.tempo, 12_100, "MENU + {}", step + 1);
        assert!(
            strip_shows(&rig.control, &timing_cells("121.0", 9_100)),
            "MENU + {}",
            step + 1
        );
    }
}

#[test]
fn a_turn_under_tempo_moves_the_tempo_and_leaves_the_pages_cursor() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    // SOUND's Filter page, where down twice puts the cursor on Resonance.
    rig.menu(0, 2);
    rig.page(10, 2);
    rig.tap(20, Button::Down);
    rig.tap(30, Button::Down);

    rig.press(100, Button::Tempo);
    rig.turn(110, 0, 1);
    rig.step(120);

    assert_eq!(rig.control.project.tempo, 12_100);
    assert!(strip_shows(&rig.control, &timing_cells("121.0", 9_100)));
    // Mode, which encoder 1 holds on the Filter page, stays, and a stopped tempo sends nothing.
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.page(view::Screen::Sound), 2);
    assert_eq!(rig.control.cursor(view::Screen::Sound).item, 2);

    rig.let_go(200, Button::Tempo);
    rig.step(210);
    assert_eq!(rig.control.cursor(view::Screen::Sound).item, 2);
    assert_eq!(rig.sent(), []);
}

#[test]
fn on_the_timing_page_a_turn_under_tempo_moves_the_cursor_as_usual() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 8);
    // A turn of encoder 2 puts the cursor on Grid.
    rig.turn(10, 1, 1);

    rig.press(100, Button::Tempo);
    rig.turn(110, 0, 1);
    rig.step(120);

    assert!(shows(&rig.control, &timing("121.0", 9_100, 0)));
}

#[test]
fn a_tap_of_tempo_turns_the_metronome_on_and_off() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.tap(100, Button::Tempo);
    rig.step(110);
    assert_eq!(rig.sent(), [message(0, 101, metronome(1))]);
    assert!(rig.lit().contains(&Lights::TEMPO));
    assert!(shows(
        &rig.control,
        &with_the_metronome(drawn(&STEP_HEADER, None, |_| {}, &[None; 4]), &STEP_HEADER)
    ));

    rig.menu(200, 7);
    rig.step(210);
    assert!(shows(
        &rig.control,
        &with_the_metronome(playing_under(None, "On", "On"), &SETTINGS_HEADER)
    ));

    rig.tap(300, Button::Tempo);
    rig.step(310);
    assert_eq!(rig.sent(), [message(1, 301, metronome(0))]);
    assert!(!rig.lit().contains(&Lights::TEMPO));
    assert!(shows(&rig.control, &playing("On")));
}

#[test]
fn a_long_press_or_a_turn_under_tempo_leaves_the_metronome() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.press(100, Button::Tempo);
    rig.let_go(100 + HOLD, Button::Tempo);
    // However short the press, a turn of encoder 1 meanwhile.
    rig.press(30_000, Button::Tempo);
    rig.turn(30_010, 0, 1);
    rig.let_go(30_020, Button::Tempo);
    rig.step(30_100);

    // The turn moved the tempo, which sends nothing while stopped.
    assert_eq!(rig.control.project.tempo, 12_100);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.settings.get(METRONOME.id), 0);
    assert!(!rig.lit().contains(&Lights::TEMPO));
}

#[test]
fn tempo_does_nothing_with_a_picker_or_a_question_open() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    // The push of encoder 3 opens the Engine picker.
    rig.tap(10, Button::Push(2));

    rig.press(100, Button::Tempo);
    rig.step(110);
    assert!(rig.control.view.picker.is_some());
    assert!(strip_shows(&rig.control, &[None; 4]));
    // CANCEL closes the picker while TEMPO is still held, whose press stays dropped.
    rig.tap(200, Button::Cancel);
    rig.step(210);
    assert_eq!(rig.control.view.picker, None);
    assert!(strip_shows(
        &rig.control,
        &[
            Some(sound("Syn 1")),
            Some(copy("on 1 pad")),
            Some(engine("Synth")),
            None
        ]
    ));
    rig.let_go(300, Button::Tempo);

    // POOL's Remove unused asks about the synth no pad holds.
    rig.control.project.pool.new_synth().unwrap();
    rig.menu(400, 5);
    rig.tap(410, Button::Left);
    rig.tap(420, Button::Ok);
    rig.tap(500, Button::Tempo);
    rig.step(510);
    assert_eq!(rig.control.view.question, Some(Question::RemoveUnused));
    assert!(strip_shows(&rig.control, &[None; 4]));

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.settings.get(METRONOME.id), 0);
}

#[test]
fn under_menu_or_page_a_tap_of_tempo_switches_the_metronome() {
    for overlay in [Button::Menu, Button::Page] {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.press(100, overlay);

        rig.press(110, Button::Tempo);
        rig.step(120);
        // The encoders stay dropped, so the strip stays empty.
        assert!(strip_shows(&rig.control, &[None; 4]), "{overlay:?}");

        rig.let_go(130, Button::Tempo);
        rig.step(140);
        assert_eq!(rig.sent(), [message(0, 130, metronome(1))], "{overlay:?}");
        assert!(rig.lit().contains(&Lights::TEMPO), "{overlay:?}");
    }
}

#[test]
fn with_a_picker_open_under_tempo_the_encoders_hold_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.menu(0, 2);
    // Down twice puts the cursor on Engine.
    rig.tap(10, Button::Down);
    rig.tap(20, Button::Down);

    rig.press(100, Button::Tempo);
    rig.tap(110, Button::Ok);
    rig.turn(120, 0, 1);
    rig.step(130);

    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Engine, Cursor { item: 1, scroll: 0 }))
    );
    assert!(strip_shows(&rig.control, &[None; 4]));
    assert_eq!(rig.control.project.tempo, 12_000);
    assert_eq!(rig.sent(), []);
}

#[test]
fn with_a_question_open_under_tempo_the_encoders_hold_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // A synth no pad holds, which POOL's Remove unused asks about.
    rig.control.project.pool.new_synth().unwrap();
    rig.menu(0, 5);
    rig.tap(10, Button::Left);

    rig.press(100, Button::Tempo);
    rig.tap(110, Button::Ok);
    rig.turn(120, 0, 1);
    rig.step(130);

    assert_eq!(rig.control.view.question, Some(Question::RemoveUnused));
    assert!(strip_shows(&rig.control, &[None; 4]));
    assert_eq!(rig.control.project.tempo, 12_000);
    assert_eq!(rig.sent(), []);
}

#[test]
fn a_message_replaces_the_metronome_icon_with_the_transport() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.settings.set(METRONOME.id, 1);
    // POOL's Remove unused says "No unused sounds" in the accent.
    rig.menu(0, 5);
    rig.tap(10, Button::Left);
    rig.tap(20, Button::Ok);

    rig.step(30);

    let screen = picture(&rig.control);
    assert_eq!(span(&screen, 300..=479, 4..=10, ACCENT), Some((381, 475)));
    assert_eq!(span(&screen, 463..=479, 0..=13, DIM), None);
}

#[test]
fn a_long_sound_name_stops_short_of_the_metronome() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    let long: String = ('a'..='z').cycle().take(40).collect();
    let name = &mut rig.control.project.pool.get_mut(synth).unwrap().name;
    *name = Label::new();
    name.push_str(&long);
    rig.control.settings.set(METRONOME.id, 1);
    // SOUND's Volume envelope page, whose name is among the longest.
    rig.menu(10, 2);
    rig.page(20, 4);

    rig.step(30);

    // The icon and its gap take 13 pixels: 33 characters and the "…" bring "Pads" to x 382, 11
    // pixels left of "P1"; one more character would bring it 5 pixels from it.
    let cut = format!("{}…", &long[..33]);
    let header = with_the_metronome(
        Screen::new(),
        &[
            ("Sound", ACCENT),
            ("Volume envelope", TEXT),
            ("T1", TEXT),
            (&cut, TEXT),
            ("Pads", DIM),
        ],
    );
    let rows = WIDTH * (HEADER_LINE as usize + 1);
    assert!(picture(&rig.control).pixels()[..rows] == header.pixels()[..rows]);
    assert_eq!(span(&header, 300..=393, 4..=10, DIM), Some((360, 382)));
    assert_eq!(span(&header, 383..=405, 4..=10, TEXT), Some((394, 404)));
}
