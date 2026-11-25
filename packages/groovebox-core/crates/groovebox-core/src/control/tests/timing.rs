//! The PATTERN screen's Timing page, the tempo, TEMPO and the metronome; its Bars page with LENGTH
//! and SIGNATURE; the removal of the notes they no longer fit; following the music; long and short
//! bars on the step buttons.

use super::library::row;
use super::pattern::{count, entered, fill_until, notes_in, put, versions};
use super::*;
use crate::project::{FOUR_FOUR, Signature};
use crate::sequencer::{Meter, Run};
use crate::store::Tree;
use crate::store::note::Note;
use crate::ui::layout::{HEADER_LINE, STRIP_LINE, rect};
use crate::ui::list::{Row, draw_rows};
use crate::ui::question::draw_question;
use std::format;
use std::string::String;
use view::StepCursor;

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
    alert: false,
};

/// Quantize as the Timing page and the strip show it, on its default.
const QUANTIZE_ON: ItemView = ItemView {
    encoder: Some(4),
    name: "Quantize",
    value: "On",
    bar: Bar::Track,
    alert: false,
};

/// The Timing page's items in the strip's cells: Tempo at `tempo`, its bar filled `filled` of
/// 27,000, then Grid, an empty cell and Quantize.
pub(super) fn timing_cells(tempo: &str, filled: u64) -> [Option<ItemView<'_>>; 4] {
    [
        Some(ItemView {
            encoder: Some(1),
            name: "Tempo",
            value: tempo,
            bar: Bar::Fill(filled, 27_000),
            alert: false,
        }),
        Some(GRID),
        None,
        Some(QUANTIZE_ON),
    ]
}

/// PATTERN's Timing page of a stopped new project, with Tempo at `tempo` here, in the header and
/// in the strip, its bar filled `filled` of 27,000 and the cursor on item `cursor`.
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
    draw_header(&mut screen, &left, &right, false, "");
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
        "",
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

/// The project's tempo set to `value` while stopped.
fn set_tempo(value: i32) -> MessageKind {
    MessageKind::SetParam {
        target: Target::Project,
        id: TEMPO.id,
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
    // While stopped each change sends the tempo to the project, for the delays (S14).
    assert_eq!(
        rig.sent(),
        [
            message(0, 100, set_tempo(12_100)),
            message(1, 210, set_tempo(12_070)),
            message(2, 300, set_tempo(12_080)),
            message(3, 410, set_tempo(11_980)),
        ]
    );
}

#[test]
fn the_timing_page_holds_quantize_on_encoder_4() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 8);
    rig.step(10);
    assert!(shows(&rig.control, &timing("120.0", 9_000, 0)));
    assert!(strip_shows(&rig.control, &timing_cells("120.0", 9_000)));
    assert!(rig.control.project.quantize);

    rig.turn(100, 3, -1);
    rig.step(110);
    assert!(!rig.control.project.quantize);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            100,
            MessageKind::SetParam {
                target: Target::Project,
                id: QUANTIZE.id,
                value: 0
            }
        )]
    );
    assert_eq!(rig.control.cursor(view::Screen::Pattern).item, 2);

    rig.tap(200, Button::Ok);
    rig.step(210);
    assert!(rig.control.project.quantize);
}

#[test]
fn holding_tempo_shows_quantize_in_the_fourth_cell() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let [tempo, grid, ..] = timing_cells("120.0", 9_000);

    rig.press(100, Button::Tempo);
    rig.step(110);

    assert!(strip_shows(
        &rig.control,
        &[tempo, grid, None, Some(QUANTIZE_ON)]
    ));
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
fn a_tempo_change_while_stopped_sends_the_tempo_and_play_carries_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(0, 8);
    rig.turn(100, 0, 1);
    rig.step(110);
    assert_eq!(rig.sent(), [message(0, 100, set_tempo(12_100))]);
    assert_eq!(rig.control.project.tempo, 12_100);

    rig.tap(9_600, Button::Play);
    rig.step(9_728);

    let run = Run {
        anchor: 9_600,
        tick: 0,
        tempo: 12_100,
    };
    assert_eq!(rig.sent(), [message(1, 9_600, MessageKind::Play { run })]);
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
    assert!(shows_frame(
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
    assert!(shows_frame(
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
    // Mode, which encoder 1 holds on the Filter page, stays, and a stopped tempo sends only the
    // tempo, for the delays.
    assert_eq!(rig.sent(), [message(0, 110, set_tempo(12_100))]);
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
    assert!(shows_frame(
        &rig.control,
        &with_the_metronome(drawn(&STEP_HEADER, None, |_| {}, &[None; 4]), &STEP_HEADER)
    ));

    rig.menu(200, 7);
    rig.step(210);
    assert!(shows(
        &rig.control,
        &with_the_metronome(
            playing_under(None, "On", "On", "1 bar", 0),
            &SETTINGS_HEADER
        )
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

    // The turn moved the tempo, which while stopped sends only the tempo, for the delays.
    assert_eq!(rig.control.project.tempo, 12_100);
    assert_eq!(rig.sent(), [message(0, 30_010, set_tempo(12_100))]);
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

/// The selected pad's piece of the header: pad 1 empty, or Syn 1 on it.
const PAD_1: (&str, Color) = ("1", DIM);
const SYN_1: (&str, Color) = ("Syn 1", TEXT);

const THREE_FOUR: Signature = Signature { beats: 3, unit: 4 };

/// The header of PATTERN's Bars page on T1 in PADS mode with `sound` selected, with `bar` as the
/// transport's bar ("1/4" or "2/4 ▶3"), at 120 BPM.
fn bars_header(sound: (&str, Color), bar: &str) -> Screen {
    let [left, right]: [Vec<Piece>; 2] = [
        &[
            ("Pattern", ACCENT),
            ("Bars", TEXT),
            ("T1", TEXT),
            sound,
            ("Pads", DIM),
        ][..],
        &[("P1", TEXT), (bar, TEXT), ("120.0", TEXT)],
    ]
    .map(|pieces| {
        pieces
            .iter()
            .map(|&(text, color)| Piece { text, color })
            .collect()
    });
    let mut screen = Screen::new();
    draw_header(&mut screen, &left, &right, false, "");
    screen
}

/// Whether the control part draws the header of PATTERN's Bars page with `sound` selected and
/// `bar` as the transport's bar.
fn bars_header_shows(control: &Control, sound: (&str, Color), bar: &str) -> bool {
    let rows = WIDTH * (HEADER_LINE as usize + 1);
    picture(control).pixels()[..rows] == bars_header(sound, bar).pixels()[..rows]
}

/// PATTERN's Bars page of a stopped project with `sound` selected and the cursor on item `cursor`,
/// with Length at `length` and Signature at `signature`: the strip shows both, or while `question`
/// is open it is empty and the question shows over the page.
fn bars_page(
    sound: (&str, Color),
    length: &str,
    signature: &str,
    cursor: i32,
    question: Option<&str>,
) -> Screen {
    let items = [
        ItemView {
            encoder: Some(1),
            name: "Length",
            value: length,
            bar: Bar::Track,
            alert: false,
        },
        ItemView {
            encoder: Some(2),
            name: "Signature",
            value: signature,
            bar: Bar::Track,
            alert: false,
        },
    ];
    let mut screen = bars_header(sound, &format!("1/{}", length.split(' ').next().unwrap()));
    for (y, item) in (17..).step_by(18).zip(&items) {
        draw_item(&mut screen, 2, y, 160, item, true, None);
    }
    draw_cursor(&mut screen, 2, 17 + 18 * cursor, 160, 17);
    match question {
        None => draw_strip(&mut screen, &[Some(items[0]), Some(items[1]), None, None]),
        Some(question) => {
            draw_strip(&mut screen, &[None; 4]);
            draw_question(
                &mut screen,
                &[(question, TEXT), ("OK deletes, Cancel keeps", DIM)],
            );
        }
    }
    screen
}

/// A new project's PATTERN Bars page under a picker of `rows`, which shows row `scroll` first,
/// with its highlight on row `item`, over an empty strip.
fn bars_picker(rows: &[&str], scroll: usize, item: usize) -> Screen {
    let mut screen = bars_header(PAD_1, "1/1");
    let rows: Vec<Row> = rows.iter().map(|left| row(left, None)).collect();
    draw_rows(&mut screen, 17, 16, &rows, scroll, Some(item), 0);
    draw_strip(&mut screen, &[None; 4]);
    screen
}

/// Opens PATTERN's Bars page with MENU + 9 and PAGE + 2, from `sample` to 13 samples later.
pub(super) fn on_bars(rig: &mut Rig<'_>, sample: u64) {
    rig.menu(sample, 8);
    rig.page(sample + 10, 1);
}

/// On the Bars page, opens the picker of encoder `encoder`'s item with its push, moves its
/// highlight with `moves` and chooses with OK at `sample`, the taps 10 samples apart.
pub(super) fn choose(rig: &mut Rig<'_>, sample: u64, encoder: u8, moves: &[Button]) {
    let first = sample - 10 * (moves.len() as u64 + 1);
    rig.tap(first, Button::Push(encoder));
    for (at, &button) in (first + 10..).step_by(10).zip(moves) {
        rig.tap(at, button);
    }
    rig.tap(sample, Button::Ok);
}

/// A rig on PATTERN's Bars page whose pattern of 4 bars of 4/4, chosen there, plays from bar 1 at
/// sample 100: its bar lines are at 96,100 and every 96,000 samples on. Its messages are taken.
pub(super) fn playing_4_bars(queue: &Queue<Message, MESSAGE_QUEUE>) -> Rig<'_> {
    let mut rig = Rig::new(queue);
    on_bars(&mut rig, 0);
    choose(&mut rig, 60, 0, &[Button::Down, Button::Down]);
    rig.tap(100, Button::Play);
    rig.step(110);
    assert_eq!(rig.sent().len(), 2);
    rig
}

/// The bar the control part's own sequencer has the music in at `sample`, once stepped there.
fn bar_at(rig: &mut Rig<'_>, sample: u64) -> Option<u16> {
    rig.step(sample);
    rig.control.player.at(sample).map(|(bar, _)| bar)
}

/// A `Meter` from tick `tick`, the start of bar `bar`, of `bars` bars of `signature`.
fn meter(tick: u64, bar: u16, bars: u16, signature: Signature) -> MessageKind {
    MessageKind::Meter {
        meter: Meter {
            tick,
            bar,
            bars,
            signature,
        },
    }
}

#[test]
fn the_bars_page_holds_length_and_signature_and_turns_leave_them() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    rig.step(20);
    assert!(shows(
        &rig.control,
        &bars_page(PAD_1, "1 bar", "4/4", 0, None)
    ));

    // A turn of encoder 2 puts the cursor on Signature.
    rig.turn(100, 0, 3);
    rig.turn(110, 1, -2);
    rig.tap(120, Button::Minus);
    rig.tap(130, Button::Plus);
    rig.step(200);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.picker, None);
    assert!(shows(
        &rig.control,
        &bars_page(PAD_1, "1 bar", "4/4", 1, None)
    ));
}

#[test]
fn ok_on_length_opens_its_list_on_the_current_length() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    rig.tap(100, Button::Ok);
    rig.step(110);

    let opened = Some((Picker::Length, Cursor { item: 0, scroll: 0 }));
    assert_eq!(rig.control.view.picker, opened);
    assert!(shows(
        &rig.control,
        &bars_picker(
            &[
                "1 bar", "2 bars", "4 bars", "8 bars", "16 bars", "32 bars", "64 bars"
            ],
            0,
            0
        )
    ));

    // The push of encoder 1 opens it too.
    rig.tap(200, Button::Cancel);
    rig.tap(300, Button::Push(0));
    rig.step(310);
    assert_eq!(rig.control.view.picker, opened);
    assert_eq!(rig.sent(), []);

    // On 4 bars once the pattern has them.
    rig.tap(400, Button::Down);
    rig.tap(410, Button::Down);
    rig.tap(420, Button::Ok);
    rig.tap(500, Button::Ok);
    rig.step(510);
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Length, Cursor { item: 2, scroll: 0 }))
    );
}

#[test]
fn the_signature_list_runs_through_x_4_then_x_8() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    rig.tap(100, Button::Push(1));
    rig.step(110);

    let rows: Vec<String> = [4, 8]
        .into_iter()
        .flat_map(|unit| (1..=16).map(move |beats| format!("{beats}/{unit}")))
        .collect();
    let rows: Vec<&str> = rows.iter().map(String::as_str).collect();
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Signature, Cursor { item: 3, scroll: 0 }))
    );
    assert!(shows(&rig.control, &bars_picker(&rows, 0, 3)));

    // Right moves a picker page of 16 rows, and the 32nd row is the last.
    rig.tap(200, Button::Right);
    rig.tap(210, Button::Right);
    rig.tap(220, Button::Down);
    rig.step(230);
    assert_eq!(
        rig.control.view.picker,
        Some((
            Picker::Signature,
            Cursor {
                item: 31,
                scroll: 16
            }
        ))
    );
    // Row 16 "1/8" on top, row 31 "16/8" under the highlight.
    assert!(shows(&rig.control, &bars_picker(&rows, 16, 31)));
}

#[test]
fn a_choice_that_deletes_nothing_applies_at_once() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);

    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.step(110);

    assert_eq!(rig.sent(), [message(0, 100, meter(0, 0, 4, FOUR_FOUR))]);
    assert_eq!(rig.control.project.patterns[0].bars, 4);
    assert_eq!(rig.control.view.picker, None);
    assert!(shows(
        &rig.control,
        &bars_page(PAD_1, "4 bars", "4/4", 0, None)
    ));

    // 7/8, four rows into x/8.
    choose(
        &mut rig,
        200,
        1,
        &[Button::Right, Button::Down, Button::Down, Button::Down],
    );
    rig.step(210);

    let seven_eight = Signature { beats: 7, unit: 8 };
    assert_eq!(rig.sent(), [message(1, 200, meter(0, 0, 4, seven_eight))]);
    assert_eq!(rig.control.project.signature, seven_eight);
    assert!(shows(
        &rig.control,
        &bars_page(PAD_1, "4 bars", "7/8", 1, None)
    ));
}

#[test]
fn choosing_the_current_value_changes_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);

    choose(&mut rig, 100, 0, &[]);
    choose(&mut rig, 200, 1, &[]);
    rig.step(210);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.control.view.question, None);
    assert!(shows(
        &rig.control,
        &bars_page(PAD_1, "1 bar", "4/4", 1, None)
    ));
}

#[test]
fn a_choice_that_would_delete_notes_asks_first() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.tap(0, Button::Step(12));
    rig.tap(10, Button::Step(14));
    on_bars(&mut rig, 20);

    // 3/4, the row above 4/4.
    choose(&mut rig, 100, 1, &[Button::Up]);
    rig.step(110);

    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteNotes {
            count: 2,
            change: Change::Signature(THREE_FOUR)
        })
    );
    assert!(shows(
        &rig.control,
        &bars_page(SYN_1, "1 bar", "4/4", 1, Some("Delete 2 notes?"))
    ));
    // The strip is empty while the question is open (Look).
    assert!(strip_shows(&rig.control, &[None; 4]));

    rig.tap(200, Button::Cancel);
    rig.step(210);
    assert_eq!(rig.control.view.question, None);
    assert_eq!(rig.control.project.signature, FOUR_FOUR);
    assert_eq!(rig.sent(), []);
    assert!(shows(
        &rig.control,
        &bars_page(SYN_1, "1 bar", "4/4", 1, None)
    ));

    choose(&mut rig, 300, 1, &[Button::Up]);
    rig.tap(400, Button::Ok);
    rig.step(410);

    assert_eq!(rig.control.view.question, None);
    assert_eq!(rig.control.project.signature, THREE_FOUR);
    // The two taps' versions took numbers 0 and 1.
    assert_eq!(rig.sent(), [message(2, 400, meter(0, 0, 1, THREE_FOUR))]);
    assert!(shows(
        &rig.control,
        &bars_page(SYN_1, "1 bar", "3/4", 1, None)
    ));
}

#[test]
fn one_note_asks_for_1_note() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.tap(0, Button::Step(12));
    on_bars(&mut rig, 20);

    choose(&mut rig, 100, 1, &[Button::Up]);
    rig.step(110);

    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteNotes {
            count: 1,
            change: Change::Signature(THREE_FOUR)
        })
    );
    assert!(shows(
        &rig.control,
        &bars_page(SYN_1, "1 bar", "4/4", 1, Some("Delete 1 note?"))
    ));
}

#[test]
fn a_signature_change_counts_the_notes_of_every_pattern() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    // By hand, as no control reaches another pattern before Milestone 5: pattern 2 of 2 bars, with
    // a note past 3/4 on track 4 in each bar and one inside it.
    rig.control.project.patterns[1].bars = 2;
    put(
        &mut rig,
        1,
        3,
        &[
            entered(11, synth, 60),
            entered(12, synth, 60),
            Note {
                bar: 1,
                ..entered(15, synth, 60)
            },
        ],
    );
    on_bars(&mut rig, 0);

    choose(&mut rig, 100, 1, &[Button::Up]);
    rig.step(110);

    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteNotes {
            count: 2,
            change: Change::Signature(THREE_FOUR)
        })
    );
}

#[test]
fn a_length_change_counts_the_current_patterns_bars_past_the_end() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.step(110);
    rig.sent();
    // By hand, as a tap reaches bar 1 only in this plan: notes in bars 2 to 4 of pattern 1 on
    // tracks 1 and 3, and one in bar 4 of pattern 2.
    let in_bar = |bar| Note {
        bar,
        ..entered(0, synth, 60)
    };
    put(&mut rig, 0, 0, &[in_bar(1), in_bar(2), in_bar(3)]);
    put(&mut rig, 0, 2, &[in_bar(3)]);
    put(&mut rig, 1, 0, &[in_bar(3)]);

    // 2 bars, the row above 4 bars.
    choose(&mut rig, 200, 0, &[Button::Up]);
    rig.step(210);

    assert_eq!(
        rig.control.view.question,
        Some(Question::DeleteNotes {
            count: 3,
            change: Change::Length(2)
        })
    );
    assert_eq!(rig.sent(), []);
}

#[test]
fn while_playing_a_change_takes_hold_at_the_next_bar_line() {
    for (sample, tick, bar, line) in [(50_000, 7_680, 1, 96_100), (95_500, 15_360, 2, 192_100)] {
        let queue = Queue::new();
        let mut rig = playing_4_bars(&queue);

        choose(&mut rig, sample, 1, &[Button::Up]);
        rig.step(sample + 10);

        assert_eq!(
            rig.sent(),
            [message(2, sample, meter(tick, bar, 4, THREE_FOUR))],
            "{sample}"
        );
        assert_eq!(rig.control.project.signature, THREE_FOUR, "{sample}");
        // The control part's own sequencer takes the same meter: a bar of 3/4, 72,000 samples,
        // follows the bar line.
        assert_eq!(bar_at(&mut rig, line + 71_999), Some(bar), "{sample}");
        assert_eq!(bar_at(&mut rig, line + 72_000), Some(bar + 1), "{sample}");
    }
}

#[test]
fn a_shorter_length_while_playing_wraps_to_bar_1_at_the_next_bar_line() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);

    // In bar 3: 2 bars, the row above 4 bars.
    choose(&mut rig, 200_000, 0, &[Button::Up]);
    rig.step(200_010);

    assert_eq!(
        rig.sent(),
        [message(2, 200_000, meter(23_040, 0, 2, FOUR_FOUR))]
    );
    // The header has the new length at once, and bar 3 plays out, then bar 1.
    assert!(bars_header_shows(&rig.control, PAD_1, "2/2 ▶3"));
    assert_eq!(bar_at(&mut rig, 288_099), Some(2));
    assert_eq!(bar_at(&mut rig, 288_100), Some(0));
}

#[test]
fn a_longer_length_while_playing_goes_on_to_the_next_bar() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);

    // In bar 4: 8 bars, the row below 4 bars.
    choose(&mut rig, 300_000, 0, &[Button::Down]);
    rig.step(300_010);

    assert_eq!(
        rig.sent(),
        [message(2, 300_000, meter(30_720, 4, 8, FOUR_FOUR))]
    );
    assert_eq!(bar_at(&mut rig, 384_099), Some(3));
    assert_eq!(bar_at(&mut rig, 384_100), Some(4));
}

#[test]
fn a_second_change_in_the_bar_takes_the_same_bar_line() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);

    choose(&mut rig, 50_000, 1, &[Button::Up]);
    choose(&mut rig, 95_500, 0, &[Button::Up]);
    rig.step(95_510);

    assert_eq!(
        rig.sent(),
        [
            message(2, 50_000, meter(7_680, 1, 4, THREE_FOUR)),
            message(3, 95_500, meter(7_680, 1, 2, THREE_FOUR))
        ]
    );
    // The second replaced the first: from the bar line 2 bars of 3/4 loop.
    assert_eq!(bar_at(&mut rig, 96_100), Some(1));
    assert_eq!(bar_at(&mut rig, 168_100), Some(0));
}

#[test]
fn the_cursor_stays_inside_the_new_bar_and_length() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.tap(200, Button::Step(14));
    rig.step(210);
    // By hand, as no control moves the cursor's bar before plan 3's arrows.
    rig.control.view.steps.bar = 3;

    // 2 bars.
    choose(&mut rig, 300, 0, &[Button::Up]);
    rig.step(310);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 1, step: 14 });

    // 3/4.
    choose(&mut rig, 400, 1, &[Button::Up]);
    rig.step(410);
    assert_eq!(rig.control.view.steps, StepCursor { bar: 1, step: 11 });
}

/// The tree of track `track` of pattern `pattern`, both from 0.
fn tree(rig: &Rig<'_>, pattern: usize, track: usize) -> Tree {
    rig.control.project.patterns[pattern].tracks[track]
}

#[test]
fn the_notes_a_change_no_longer_fits_are_gone_before_the_next_event() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    rig.tap(0, Button::Step(0));
    rig.tap(10, Button::Step(12));
    rig.tap(20, Button::Step(14));
    on_bars(&mut rig, 30);
    choose(&mut rig, 100, 1, &[Button::Up]);
    rig.step(110);
    versions(&mut rig);

    rig.tap(200, Button::Ok);
    // The next event: STOP while stopped.
    rig.tap(202, Button::Stop);
    rig.step(300);

    // The taps' versions took numbers 0 to 2 and the `Meter` 3: the removal's version comes
    // before STOP's `Silence`.
    assert_eq!(
        rig.sent(),
        [
            message(3, 200, meter(0, 0, 1, THREE_FOUR)),
            message(5, 202, MessageKind::Silence)
        ]
    );
    let tree = tree(&rig, 0, 0);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 4,
            moment: 200 + 1_024,
            track: 0,
            tree
        }]
    );
    assert_eq!(notes_in(&rig, tree), [entered(0, synth, 60)]);
    assert_eq!(count(&rig, synth), 1);
    assert_eq!(rig.lit(), [pad(0), step(0), track(0)]);
}

#[test]
fn a_length_change_removes_every_bar_past_the_end_on_every_track() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.step(110);
    // By hand, as a tap reaches bar 1 only in this plan: a note in each of bars 1 to 4 on tracks
    // 1, 2 and 4, and one in bar 4 of pattern 2, which a length leaves alone.
    let in_bar = |bar| Note {
        bar,
        ..entered(0, synth, 60)
    };
    for track in [0, 1, 3] {
        put(
            &mut rig,
            0,
            track,
            &[in_bar(0), in_bar(1), in_bar(2), in_bar(3)],
        );
    }
    put(&mut rig, 1, 0, &[in_bar(3)]);

    // 2 bars, the row above 4 bars.
    choose(&mut rig, 200, 0, &[Button::Up]);
    rig.tap(300, Button::Ok);
    rig.step(310);

    for track in [0, 1, 3] {
        assert_eq!(
            notes_in(&rig, tree(&rig, 0, track)),
            [in_bar(0), in_bar(1)],
            "track {}",
            track + 1
        );
    }
    assert_eq!(tree(&rig, 0, 2), Tree(None));
    assert_eq!(notes_in(&rig, tree(&rig, 1, 0)), [in_bar(3)]);
    assert_eq!(count(&rig, synth), 3 * 2 + 1);
}

#[test]
fn a_signature_change_removes_each_bars_tail_in_every_pattern() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.step(110);
    // By hand, as no control reaches another pattern before Milestone 5: in bars 1 and 3 of
    // pattern 1 on track 1 and of pattern 2, of 4 bars too, on track 4, a note past 3/4 and one
    // inside it.
    rig.control.project.patterns[1].bars = 4;
    let at = |bar, sixteenth| Note {
        bar,
        ..entered(sixteenth, synth, 60)
    };
    put(&mut rig, 0, 0, &[at(0, 4), at(0, 12), at(2, 11), at(2, 15)]);
    put(&mut rig, 1, 3, &[at(0, 0), at(0, 13), at(2, 11), at(2, 12)]);

    choose(&mut rig, 200, 1, &[Button::Up]);
    rig.tap(300, Button::Ok);
    rig.step(310);

    assert_eq!(notes_in(&rig, tree(&rig, 0, 0)), [at(0, 4), at(2, 11)]);
    assert_eq!(notes_in(&rig, tree(&rig, 1, 3)), [at(0, 0), at(2, 11)]);
    assert_eq!(count(&rig, synth), 4);
}

#[test]
fn lengthening_after_a_shrink_brings_nothing_back() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    rig.tap(0, Button::Step(12));
    rig.tap(10, Button::Step(14));
    // By hand, the same notes on track 2 and on track 4 of pattern 2, which the removal reaches
    // last.
    let tail = [entered(12, synth, 60), entered(14, synth, 60)];
    put(&mut rig, 0, 1, &tail);
    put(&mut rig, 1, 3, &tail);
    on_bars(&mut rig, 20);
    choose(&mut rig, 100, 1, &[Button::Up]);

    // OK on "Delete 6 notes?", then 4/4 from the next sample: the push of encoder 2, Down and OK.
    rig.tap(200, Button::Ok);
    rig.tap(201, Button::Push(1));
    rig.tap(202, Button::Down);
    rig.tap(203, Button::Ok);
    rig.step(300);

    assert_eq!(rig.control.project.signature, FOUR_FOUR);
    for (pattern, track) in [(0, 0), (0, 1), (1, 3)] {
        assert_eq!(tree(&rig, pattern, track), Tree(None), "{pattern} {track}");
    }
    assert_eq!(count(&rig, synth), 0);
    // Steps 13 and 15 stay dark.
    assert_eq!(rig.lit(), [pad(0), track(0)]);

    // The same with 1 bar, then 4 bars.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.step(110);
    let in_bar = |bar| Note {
        bar,
        ..entered(0, synth, 60)
    };
    put(&mut rig, 0, 0, &[in_bar(0), in_bar(1), in_bar(3)]);
    put(&mut rig, 0, 2, &[in_bar(2)]);
    choose(&mut rig, 200, 0, &[Button::Up, Button::Up]);

    rig.tap(300, Button::Ok);
    rig.tap(301, Button::Push(0));
    rig.tap(302, Button::Down);
    rig.tap(303, Button::Down);
    rig.tap(304, Button::Ok);
    rig.step(400);

    assert_eq!(rig.control.project.patterns[0].bars, 4);
    assert_eq!(notes_in(&rig, tree(&rig, 0, 0)), [in_bar(0)]);
    assert_eq!(tree(&rig, 0, 2), Tree(None));
    assert_eq!(count(&rig, synth), 1);
}

#[test]
fn a_sound_left_with_no_notes_is_unused() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // A synth on no pad, whose only notes are past 3/4.
    let synth = rig.control.project.pool.new_synth().unwrap();
    put(
        &mut rig,
        0,
        0,
        &[entered(12, synth, 60), entered(15, synth, 60)],
    );
    on_bars(&mut rig, 0);
    rig.step(20);
    assert_eq!(rig.control.project.unused().collect::<Vec<_>>(), []);

    choose(&mut rig, 100, 1, &[Button::Up]);
    rig.tap(200, Button::Ok);
    rig.step(210);

    assert_eq!(count(&rig, synth), 0);
    assert_eq!(rig.control.project.unused().collect::<Vec<_>>(), [synth]);
}

#[test]
fn each_current_track_is_published_once_when_memory_is_plenty() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 0, &[Button::Down, Button::Down]);
    rig.step(110);
    rig.sent();
    // By hand: a note past 3/4 in each of the 4 bars of tracks 1 and 3, and on track 2 notes
    // inside the bars only.
    let at = |bar, sixteenth| Note {
        bar,
        ..entered(sixteenth, synth, 60)
    };
    put(
        &mut rig,
        0,
        0,
        &[at(0, 0), at(0, 13), at(1, 12), at(2, 15), at(3, 14)],
    );
    put(&mut rig, 0, 1, &[at(1, 0), at(3, 11)]);
    put(
        &mut rig,
        0,
        2,
        &[at(0, 13), at(1, 12), at(2, 15), at(3, 14)],
    );

    choose(&mut rig, 200, 1, &[Button::Up]);
    rig.tap(300, Button::Ok);
    rig.step(310);

    // The first `Meter` took number 0.
    assert_eq!(rig.sent(), [message(1, 300, meter(0, 0, 4, THREE_FOUR))]);
    assert_eq!(
        versions(&mut rig),
        [
            Version {
                number: 2,
                moment: 300 + 1_024,
                track: 0,
                tree: tree(&rig, 0, 0)
            },
            Version {
                number: 3,
                moment: 300 + 1_024,
                track: 2,
                tree: Tree(None)
            }
        ]
    );
    assert_eq!(notes_in(&rig, tree(&rig, 0, 0)), [at(0, 0)]);
    assert_eq!(notes_in(&rig, tree(&rig, 0, 1)), [at(1, 0), at(3, 11)]);
}

#[test]
fn a_removal_short_of_ready_blocks_publishes_and_waits() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    // 2 bars, the row below 1 bar.
    choose(&mut rig, 60, 0, &[Button::Down]);
    rig.tap(100, Button::Step(12));
    rig.tap(110, Button::Step(14));
    rig.step(120);
    // By hand, as no control moves the cursor's bar before plan 3's arrows.
    rig.control.view.steps.bar = 1;
    rig.tap(200, Button::Step(12));
    rig.tap(210, Button::Step(14));
    rig.step(220);
    rig.sent();
    versions(&mut rig);
    for number in 1..=4 {
        rig.applied(number, 1_300);
    }
    // Nothing waits, and by hand exactly `RESERVE` blocks are free: the first removal, which
    // copies the track's leaf, leaves fewer.
    fill_until(&rig, RESERVE);
    choose(&mut rig, 300, 1, &[Button::Up]);
    rig.tap(400, Button::Ok);
    // The next event: STOP while stopped.
    rig.tap(500, Button::Stop);

    rig.step(600);

    // Bar 1's tail is gone and published while bar 2's waits: fewer than `RESERVE` blocks are
    // ready and the old leaf waits for version 6. STOP is not handled.
    assert_eq!(rig.sent(), [message(5, 400, meter(0, 0, 2, THREE_FOUR))]);
    let bar_2 = |sixteenth| Note {
        bar: 1,
        ..entered(sixteenth, synth, 60)
    };
    let tree = tree(&rig, 0, 0);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 6,
            moment: 400 + 1_024,
            track: 0,
            tree
        }]
    );
    assert_eq!(notes_in(&rig, tree), [bar_2(12), bar_2(14)]);
    rig.step(700);
    assert_eq!(rig.sent(), []);
    assert_eq!(versions(&mut rig), []);

    rig.applied(6, 1_500);
    rig.step(800);

    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 7,
            moment: 400 + 1_024,
            track: 0,
            tree: Tree(None)
        }]
    );
    assert_eq!(rig.sent(), [message(8, 500, MessageKind::Silence)]);
    assert_eq!(count(&rig, synth), 0);
}

#[test]
fn a_removal_sends_the_same_whenever_the_reports_come() {
    /// The versions, each with its notes in place of its tree, whose blocks may differ, and the
    /// messages of 3/4 chosen over 2 bars of tails that taps entered, with exactly `RESERVE`
    /// blocks ready by hand while the trees before the taps' versions 2 to 4 wait. Their reports
    /// come before the step that runs the removal or after it.
    fn sent(reported_first: bool) -> (Vec<(Version, Vec<Note>)>, Vec<Message>) {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.synth_on(0);
        on_bars(&mut rig, 0);
        choose(&mut rig, 60, 0, &[Button::Down]);
        rig.tap(100, Button::Step(12));
        rig.tap(110, Button::Step(14));
        rig.step(120);
        rig.control.view.steps.bar = 1;
        rig.tap(200, Button::Step(12));
        rig.tap(210, Button::Step(14));
        rig.step(220);
        versions(&mut rig);
        fill_until(&rig, RESERVE);
        choose(&mut rig, 300, 1, &[Button::Up]);
        rig.step(310);
        rig.sent();
        rig.tap(400, Button::Ok);
        rig.tap(500, Button::Stop);
        let (mut versions_sent, mut messages) = (Vec::new(), Vec::new());
        for until in [600, 700] {
            if reported_first == (until == 600) {
                for number in 1..=4 {
                    rig.applied(number, 1_300);
                }
            }
            rig.step(until);
            for version in versions(&mut rig) {
                versions_sent.push((
                    Version {
                        tree: Tree(None),
                        ..version
                    },
                    notes_in(&rig, version.tree),
                ));
            }
            messages.extend(rig.sent());
        }
        (versions_sent, messages)
    }

    assert_eq!(sent(false), sent(true));
}

#[test]
fn a_removal_short_of_ready_blocks_with_none_waiting_goes_on() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.tap(0, Button::Step(12));
    rig.tap(10, Button::Step(14));
    rig.step(20);
    versions(&mut rig);
    rig.applied(0, 1_100);
    rig.applied(1, 1_100);
    // Nothing waits, and fewer than `RESERVE` blocks are ready, as an insert may leave them: there
    // is no report to wait for.
    fill_until(&rig, RESERVE - 1);
    on_bars(&mut rig, 30);
    choose(&mut rig, 100, 1, &[Button::Up]);
    rig.tap(200, Button::Ok);
    rig.tap(202, Button::Stop);

    rig.step(300);

    // The removal uses the reserve and publishes at once, then waits for that version's report.
    assert_eq!(rig.sent(), [message(2, 200, meter(0, 0, 1, THREE_FOUR))]);
    assert_eq!(
        versions(&mut rig),
        [Version {
            number: 3,
            moment: 200 + 1_024,
            track: 0,
            tree: Tree(None)
        }]
    );

    rig.applied(3, 1_300);
    rig.step(400);
    assert_eq!(rig.sent(), [message(4, 202, MessageKind::Silence)]);
}

#[test]
fn note_memory_falls_after_a_change_that_deletes() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    on_bars(&mut rig, 0);
    // 2 bars, the row below 1 bar.
    choose(&mut rig, 60, 0, &[Button::Down]);
    for step in 0..16 {
        rig.tap(100 + 10 * u64::from(step), Button::Step(step));
    }
    rig.step(300);
    // By hand, as no control moves the cursor's bar before plan 3's arrows.
    rig.control.view.steps.bar = 1;
    for step in 0..16 {
        rig.tap(300 + 10 * u64::from(step), Button::Step(step));
    }
    rig.step(500);
    // 32 notes pass a leaf's 31: two leaves of 16 and their root, which the Dev page shows.
    assert_eq!(rig.control.note_memory, 3 * 520);

    // 1 bar, the row above 2 bars.
    choose(&mut rig, 600, 0, &[Button::Up]);
    rig.tap(700, Button::Ok);
    rig.step(710);

    // Bar 1's leaf alone.
    assert_eq!(rig.control.note_memory, 520);
}

/// A `Play` of a run from tick `tick` anchored at `anchor`, at 120 BPM.
fn play_from(anchor: u64, tick: u64) -> MessageKind {
    MessageKind::Play {
        run: Run {
            anchor,
            tick,
            tempo: 12_000,
        },
    }
}

#[test]
fn while_playing_the_steps_and_the_header_follow_the_bar() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);
    let synth = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[
            entered(0, synth, 60),
            Note {
                bar: 1,
                ..entered(4, synth, 60)
            },
        ],
    );

    // Bar 1's note in step 1, and the music in step 2.
    rig.step(10_000);
    assert_eq!(
        rig.lit(),
        [pad(0), step(0), step(1), track(0), Lights::PLAY]
    );
    assert!(bars_header_shows(&rig.control, SYN_1, "1/4 ▶1"));

    // Bar 2's note in step 5, and the music in step 2 again.
    rig.step(103_000);
    assert_eq!(
        rig.lit(),
        [pad(0), step(1), step(4), track(0), Lights::PLAY]
    );
    assert!(bars_header_shows(&rig.control, SYN_1, "2/4 ▶2"));
}

#[test]
fn stop_leaves_the_cursor_on_the_bar_that_played() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);

    rig.tap(200_000, Button::Stop);
    rig.step(200_010);
    assert_eq!(rig.control.view.steps.bar, 2);
    assert!(bars_header_shows(&rig.control, PAD_1, "3/4"));

    rig.press(300_000, Button::Shift);
    rig.tap(300_010, Button::Play);
    rig.step(300_020);
    assert_eq!(
        rig.sent(),
        [
            message(2, 200_000, MessageKind::Stop),
            message(3, 300_010, play_from(300_010, 15_360))
        ]
    );
}

#[test]
fn shift_play_follows_from_the_cursors_bar() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    on_bars(&mut rig, 0);
    choose(&mut rig, 60, 0, &[Button::Down, Button::Down]);
    rig.step(70);
    rig.sent();
    // By hand, as no control moves the cursor's bar before plan 3's arrows.
    rig.control.view.steps.bar = 2;

    rig.press(100, Button::Shift);
    rig.tap(110, Button::Play);
    rig.step(120);
    assert_eq!(rig.sent(), [message(1, 110, play_from(110, 15_360))]);
    assert!(rig.control.view.following);
    assert!(bars_header_shows(&rig.control, PAD_1, "3/4 ▶3"));
    rig.step(110 + 96_000);
    assert!(bars_header_shows(&rig.control, PAD_1, "4/4 ▶4"));

    // While playing it jumps to the start of the bar the buttons show, and follows from there.
    rig.tap(150_000, Button::Play);
    rig.step(150_010);
    assert_eq!(
        rig.sent(),
        [message(2, 150_000, play_from(150_000, 23_040))]
    );
    rig.step(150_000 + 96_000);
    assert!(bars_header_shows(&rig.control, PAD_1, "1/4 ▶1"));
}

#[test]
fn play_while_playing_follows_again_and_sends_nothing() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);
    rig.step(200_000);
    // By hand, rather than with an arrow into another bar, which ends following.
    rig.control.view.following = false;
    rig.control.view.steps.bar = 0;
    assert!(bars_header_shows(&rig.control, PAD_1, "1/4 ▶3"));

    rig.tap(200_100, Button::Play);
    rig.step(200_200);

    assert_eq!(rig.sent(), []);
    assert!(rig.control.view.following);
    assert!(bars_header_shows(&rig.control, PAD_1, "3/4 ▶3"));
}

#[test]
fn a_tap_lands_in_the_bar_shown_when_the_step_went_down() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);
    let synth = rig.synth_on(0);

    // Down in bar 1, up once bar 2 plays.
    rig.press(95_000, Button::Step(4));
    rig.let_go(97_000, Button::Step(4));
    rig.step(97_010);

    assert_eq!(notes_in(&rig, tree(&rig, 0, 0)), [entered(4, synth, 60)]);
    assert_eq!(entered(4, synth, 60).place, 1_920);
}

#[test]
fn a_meter_taking_hold_between_a_steps_press_and_release_keeps_the_tap_in_its_bar() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);
    let synth = rig.synth_on(0);
    // 3/4 in bar 1 takes hold at the bar line at 96,100.
    choose(&mut rig, 50_000, 1, &[Button::Up]);

    rig.press(96_000, Button::Step(4));
    rig.let_go(96_200, Button::Step(4));
    rig.step(96_210);

    assert_eq!(notes_in(&rig, tree(&rig, 0, 0)), [entered(4, synth, 60)]);
}

#[test]
fn a_bar_playing_past_a_shorter_length_shows_the_last_bar() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);

    // In bar 3: 2 bars, the row above 4 bars.
    choose(&mut rig, 200_000, 0, &[Button::Up]);
    rig.step(288_000);
    assert!(bars_header_shows(&rig.control, PAD_1, "2/2 ▶3"));

    rig.step(288_100);
    assert!(bars_header_shows(&rig.control, PAD_1, "1/2 ▶1"));
}

#[test]
fn the_header_redraws_when_the_playing_bar_changes() {
    let queue = Queue::new();
    let mut rig = playing_4_bars(&queue);

    for until in (128..=96_000).step_by(128) {
        assert!(!rig.step(until), "step to {until}");
    }
    assert!(rig.step(96_128));
    assert!(bars_header_shows(&rig.control, PAD_1, "2/4 ▶2"));
}

#[test]
fn in_3_4_and_7_8_the_steps_past_the_bar_are_dark_and_do_nothing() {
    for (moves, sixteenths) in [
        (&[Button::Up][..], 12),
        (
            &[Button::Right, Button::Down, Button::Down, Button::Down][..],
            14,
        ),
    ] {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        rig.synth_on(0);
        on_bars(&mut rig, 0);
        choose(&mut rig, 100, 1, moves);
        for button in sixteenths..16 {
            rig.tap(200 + 10 * u64::from(button), Button::Step(button));
        }
        rig.step(400);
        assert_eq!(versions(&mut rig), [], "{sixteenths}");
        assert_eq!(rig.control.view.steps.step, 0, "{sixteenths}");
        assert_eq!(rig.lit(), [pad(0), track(0)], "{sixteenths}");

        // The music lights the bar's last step, then bar 1's first.
        rig.tap(1_000, Button::Play);
        let last = u32::from(sixteenths) - 1;
        rig.step(1_000 + 6_000 * u64::from(last));
        assert_eq!(
            rig.lit(),
            [pad(0), step(last), track(0), Lights::PLAY],
            "{sixteenths}"
        );
        rig.step(1_000 + 6_000 * u64::from(sixteenths));
        assert_eq!(
            rig.lit(),
            [pad(0), step(0), track(0), Lights::PLAY],
            "{sixteenths}"
        );
    }
}

#[test]
fn a_5_4_bar_goes_on_over_a_short_second_page() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 100, 1, &[Button::Down]);
    rig.step(110);
    // By hand, as no control moves the cursor to a later page before plan 3's arrows.
    rig.control.view.steps.step = 17;

    rig.tap(200, Button::Step(1));
    for button in 4..16 {
        rig.tap(300 + 10 * u64::from(button), Button::Step(button));
    }
    rig.step(500);

    assert_eq!(notes_in(&rig, tree(&rig, 0, 0)), [entered(17, synth, 60)]);
    assert_eq!(entered(17, synth, 60).place, 8_160);
    assert_eq!(rig.control.view.steps.step, 17);
    assert_eq!(rig.lit(), [pad(0), step(1), track(0)]);

    // On the first page the music lights nothing here, and on the second its step.
    rig.tap(1_000, Button::Play);
    rig.step(1_000 + 6_000 * 5);
    assert_eq!(rig.lit(), [pad(0), step(1), track(0), Lights::PLAY]);
    rig.step(1_000 + 6_000 * 18);
    assert_eq!(
        rig.lit(),
        [pad(0), step(1), step(2), track(0), Lights::PLAY]
    );
}

#[test]
fn a_16_4_bar_takes_four_pages() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let synth = rig.synth_on(0);
    on_bars(&mut rig, 0);
    choose(&mut rig, 200, 1, &[Button::Down; 12]);
    rig.step(210);
    assert_eq!(
        rig.control.project.signature,
        Signature { beats: 16, unit: 4 }
    );

    // By hand, as no control moves the cursor to a later page before plan 3's arrows.
    for page in 0..4 {
        rig.control.view.steps.step = page * 16;
        rig.tap(300 + 10 * u64::from(page), Button::Step(15));
        rig.step(305 + 10 * u64::from(page));
    }

    assert_eq!(
        notes_in(&rig, tree(&rig, 0, 0)),
        [15, 31, 47, 63].map(|sixteenth| entered(sixteenth, synth, 60))
    );
    assert_eq!(rig.control.view.steps.step, 63);
    assert_eq!(rig.lit(), [pad(0), step(15), track(0)]);

    // The music in sixteenth 51 lights step 3 of the fourth page.
    rig.tap(1_000, Button::Play);
    rig.step(1_000 + 6_000 * 50);
    assert_eq!(
        rig.lit(),
        [pad(0), step(2), step(15), track(0), Lights::PLAY]
    );
}
