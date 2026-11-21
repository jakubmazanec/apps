//! The PATTERN screen's Timing page and the tempo.

use super::*;
use crate::sequencer::Run;

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

/// PATTERN's Timing page of a stopped new project, with Tempo at `tempo`, its bar filled `filled`
/// of 27,000, here, in the header and in the strip, and the cursor on item `cursor`.
fn timing(tempo: &str, filled: u64, cursor: i32) -> Screen {
    let items = [
        ItemView {
            encoder: Some(1),
            name: "Tempo",
            value: tempo,
            bar: Bar::Fill(filled, 27_000),
        },
        GRID,
    ];
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
    draw_header(&mut screen, &left, &right);
    for (y, item) in (17..).step_by(18).zip(&items) {
        draw_item(&mut screen, 2, y, 160, item, true, None);
    }
    draw_cursor(&mut screen, 2, 17 + 18 * cursor, 160, 17);
    draw_strip(&mut screen, &[Some(items[0]), Some(items[1]), None, None]);
    screen
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
