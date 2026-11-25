//! FX, MENU + 4: the Chain page with the current track's six slots, Type and Move, and a page for
//! each slot's effect.

use super::*;
use crate::param::{DELAY_LEVEL, DELAY_PING_PONG, DELAY_TIME, REVERB_LEVEL};
use crate::project::track::{Effect, Slot};
use crate::ui::list::{Row, draw_rows};
use crate::ui::tiles::draw_chain;
use std::format;

/// FX's header on T1 with pad 1 selected in PADS mode, on the page named `page`.
fn header(page: &str) -> [(&str, Color); 5] {
    [
        ("Fx", ACCENT),
        (page, TEXT),
        ("T1", TEXT),
        ("1", DIM),
        ("Pads", DIM),
    ]
}

/// A new track's slots as the tiles name them: the delay, the reverb and four empty slots.
const NEW_CHAIN: [Option<&str>; 6] = [Some("Delay"), Some("Reverb"), None, None, None, None];

/// FX's Chain page under `header`: the tiles named `names`, Type and Move for slot `slot` (0 to 5)
/// and the cursor on row `row`, 0 the tiles, 1 Type and 2 Move; the strip holds Type and Move.
fn chain(header: &[(&str, Color)], names: &[Option<&str>; 6], slot: usize, row: i32) -> Screen {
    let place = format!("{}", slot + 1);
    let items = [
        ItemView {
            encoder: Some(1),
            name: "Type",
            value: names[slot].unwrap_or("Empty"),
            bar: Bar::Track,
            alert: false,
        },
        ItemView {
            encoder: Some(2),
            name: "Move",
            value: &place,
            bar: Bar::Track,
            alert: false,
        },
    ];
    drawn(
        header,
        None,
        |screen| {
            draw_chain(screen, names, slot, row == 0);
            for (y, item) in (39..).step_by(18).zip(&items) {
                draw_item(screen, 2, y, 160, item, true, None);
            }
            if row > 0 {
                draw_cursor(screen, 2, 39 + 18 * (row - 1), 160, 17);
            }
        },
        &[Some(items[0]), Some(items[1]), None, None],
    )
}

/// The Type picker over FX's Chain page, with row `row` highlighted.
fn type_picker(row: usize) -> Screen {
    drawn(
        &header("Chain"),
        None,
        |screen| {
            draw_rows(
                screen,
                17,
                16,
                &["Empty", "Delay", "Reverb"].map(|left| Row {
                    left,
                    right: None,
                    alert: false,
                }),
                0,
                Some(row),
                0,
            );
        },
        &[None; 4],
    )
}

/// A new delay's items with Time reading `time`.
fn delay_items(time: &str) -> [ItemView<'_>; 5] {
    let smooth = |encoder, name, value, fill| ItemView {
        encoder,
        name,
        value,
        bar: Bar::Fill(fill, 65_535),
        alert: false,
    };
    [
        ItemView {
            encoder: Some(1),
            name: "Time",
            value: time,
            bar: Bar::Track,
            alert: false,
        },
        smooth(Some(2), "Feedback", "40%", 26_214),
        smooth(Some(3), "Tone", "50%", 32_768),
        ItemView {
            encoder: None,
            name: "Ping-pong",
            value: "Off",
            bar: Bar::Track,
            alert: false,
        },
        smooth(Some(4), "Level", "0%", 0),
    ]
}

/// FX's page of the delay in slot 1 with the header's tempo reading `tempo`: `items` with the
/// cursor on item `cursor`, and the strip with the four that the encoders hold.
fn delay_page(tempo: &str, items: &[ItemView; 5], cursor: i32) -> Screen {
    let mut screen = Screen::new();
    draw_header(
        &mut screen,
        &header("Delay").map(|(text, color)| Piece { text, color }),
        &["P1", "1/1", tempo].map(|text| Piece { text, color: TEXT }),
        None,
        false,
        "",
    );
    for (y, item) in (17..).step_by(18).zip(items) {
        draw_item(&mut screen, 2, y, 160, item, true, None);
    }
    draw_cursor(&mut screen, 2, 17 + 18 * cursor, 160, 17);
    draw_strip(
        &mut screen,
        &[
            Some(items[0]),
            Some(items[1]),
            Some(items[2]),
            Some(items[4]),
        ],
    );
    screen
}

#[test]
fn menu_4_shows_the_chain_of_the_current_track() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);

    rig.step(128);

    assert_eq!(rig.control.view.screen, view::Screen::Fx);
    assert_eq!(rig.sent(), []);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 0, 0)
    ));
    // S15: the tiles are 77 by 19 pixels from (2 + 79 s, 17), the chosen one's in the accent with
    // the cursor's outline 1 pixel outside it, a used slot's in the line grey and an empty one's
    // faint; a name starts 14 pixels in. Type and Move start at (2, 39), 18 pixels apart.
    let screen = picture(&rig.control);
    assert!(outlined(&screen, 2, 17, 77, 19, ACCENT));
    assert!(outlined(&screen, 1, 16, 79, 21, ACCENT));
    assert!(outlined(&screen, 81, 17, 77, 19, LINE));
    for slot in 2..6 {
        assert!(
            outlined(&screen, 2 + 79 * slot, 17, 77, 19, FAINT),
            "{slot}"
        );
    }
    assert_eq!(
        span(&screen, 82..=156, 18..=34, TEXT).map(|(first, _)| first),
        Some(95)
    );
    assert_eq!(span(&screen, 2..=161, 39..=51, DIM).map(|s| s.0), Some(5));
    assert_eq!(span(&screen, 2..=161, 57..=69, DIM).map(|s| s.0), Some(5));
}

#[test]
fn left_and_right_move_along_the_slots_and_up_and_down_between_rows() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.tap(100, Button::Right);

    rig.step(110);
    assert_eq!(rig.control.view.fx_slot, 1);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 1, 0)
    ));

    // Left stops at slot 1.
    rig.tap(200, Button::Left);
    rig.tap(210, Button::Left);
    rig.step(220);
    assert_eq!(rig.control.view.fx_slot, 0);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 0, 0)
    ));

    rig.tap(300, Button::Down);
    rig.step(310);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 0, 1)
    ));

    // Left and right do nothing on Move.
    rig.tap(400, Button::Down);
    rig.tap(410, Button::Left);
    rig.tap(420, Button::Right);
    rig.step(430);
    assert_eq!(rig.control.view.fx_slot, 0);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 0, 2)
    ));

    rig.tap(500, Button::Up);
    rig.tap(510, Button::Up);
    rig.step(520);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 0, 0)
    ));

    // Right stops at slot 6.
    for index in 0..6 {
        rig.tap(600 + 10 * index, Button::Right);
    }
    rig.step(700);
    assert_eq!(rig.control.view.fx_slot, 5);
    assert_eq!(rig.sent(), []);
}

#[test]
fn the_chosen_slot_stays_in_the_accent_on_every_row_and_the_outline_only_on_the_tiles() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.tap(100, Button::Right);
    rig.step(110);
    let screen = picture(&rig.control);
    assert!(outlined(&screen, 81, 17, 77, 19, ACCENT));
    assert!(outlined(&screen, 80, 16, 79, 21, ACCENT));
    assert!(outlined(&screen, 1, 38, 162, 19, BACKGROUND));

    // On Type, then on Move: slot 2's border, number and name stay in the accent, with no outline
    // outside the tile, and the cursor's outline is on the item.
    for (at, item) in [(200, 0), (300, 1)] {
        rig.tap(at, Button::Down);
        rig.step(at + 10);
        let screen = picture(&rig.control);
        assert!(outlined(&screen, 81, 17, 77, 19, ACCENT), "{item}");
        assert_eq!(
            span(&screen, 82..=156, 18..=34, ACCENT),
            Some((84, 94 + crate::ui::text::width("Reverb") as usize)),
            "{item}"
        );
        assert!(outlined(&screen, 80, 16, 79, 21, BACKGROUND), "{item}");
        assert!(
            outlined(&screen, 1, 38 + 18 * item, 162, 19, ACCENT),
            "{item}"
        );
    }
}

#[test]
fn ok_on_a_slot_opens_the_type_picker_on_its_type() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.tap(100, Button::Right);
    rig.tap(110, Button::Ok);

    rig.step(120);
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Effect, Cursor { item: 2, scroll: 0 }))
    );
    assert!(shows(&rig.control, &type_picker(2)));

    // Reverb is the last row.
    rig.tap(200, Button::Down);
    rig.step(210);
    assert!(shows(&rig.control, &type_picker(2)));

    rig.tap(300, Button::Up);
    rig.tap(310, Button::Ok);
    rig.step(320);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            310,
            MessageKind::SlotEffect {
                track: 0,
                slot: 1,
                effect: Effect::Delay
            }
        )]
    );
    assert_eq!(rig.track().slots[1], Slot::new(Effect::Delay));
    assert!(shows(
        &rig.control,
        &chain(
            &header("Chain"),
            &[Some("Delay"), Some("Delay"), None, None, None, None],
            1,
            0
        )
    ));

    // OK on Type opens it too, and choosing the type the slot holds changes nothing.
    rig.control.project.tracks[0].slots[1].set(DELAY_LEVEL.id, 512);
    rig.tap(400, Button::Down);
    rig.tap(410, Button::Ok);
    rig.step(420);
    assert_eq!(
        rig.control.view.picker,
        Some((Picker::Effect, Cursor { item: 1, scroll: 0 }))
    );
    rig.tap(500, Button::Ok);
    rig.step(510);
    assert_eq!(rig.control.view.picker, None);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.track().slots[1].value(DELAY_LEVEL.id), 512);
}

#[test]
fn turning_encoder_1_or_minus_and_plus_on_type_do_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    // On the tiles too.
    rig.tap(100, Button::Minus);
    rig.tap(110, Button::Plus);
    rig.turn(200, 0, 1);
    rig.turn(210, 0, -1);
    rig.step(220);
    // The turn puts the cursor on Type, as on any page.
    assert_eq!(rig.control.cursor(view::Screen::Fx).item, 1);

    rig.tap(300, Button::Minus);
    rig.tap(310, Button::Plus);
    rig.step(320);

    assert_eq!(rig.sent(), []);
    assert_eq!(rig.track().slots, Track::new().slots);
    assert_eq!(rig.control.view.picker, None);
    assert!(shows(
        &rig.control,
        &chain(&header("Chain"), &NEW_CHAIN, 0, 1)
    ));
}

#[test]
fn move_moves_the_effect_and_the_cursor_goes_with_it() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.control.project.tracks[0].slots[0].set(DELAY_LEVEL.id, 1_024);
    rig.menu(10, 3);
    rig.turn(100, 1, 2);

    rig.step(110);

    // One message for the turn, however many clicks (S3).
    assert_eq!(
        rig.sent(),
        [message(
            0,
            100,
            MessageKind::MoveSlot {
                track: 0,
                from: 0,
                to: 2
            }
        )]
    );
    assert_eq!(
        rig.track().slots.map(|slot| slot.effect),
        [
            Effect::Reverb,
            Effect::Empty,
            Effect::Delay,
            Effect::Empty,
            Effect::Empty,
            Effect::Empty
        ]
    );
    // The delay keeps its settings.
    assert_eq!(rig.track().slots[2].value(DELAY_LEVEL.id), 1_024);
    assert_eq!(rig.control.view.fx_slot, 2);
    let moved = [Some("Reverb"), None, Some("Delay"), None, None, None];
    assert!(shows(&rig.control, &chain(&header("Chain"), &moved, 2, 2)));

    rig.tap(200, Button::Up);
    rig.tap(210, Button::Up);
    rig.step(220);
    assert!(shows(&rig.control, &chain(&header("Chain"), &moved, 2, 0)));
}

#[test]
fn move_stops_at_the_ends() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.tap(100, Button::Down);
    rig.tap(110, Button::Down);
    rig.tap(120, Button::Minus);
    rig.step(130);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.fx_slot, 0);

    rig.tap(200, Button::Up);
    rig.tap(210, Button::Up);
    for index in 0..5 {
        rig.tap(300 + 10 * index, Button::Right);
    }
    rig.tap(400, Button::Down);
    rig.tap(410, Button::Down);
    rig.tap(420, Button::Plus);
    rig.step(430);
    assert_eq!(rig.sent(), []);
    assert_eq!(rig.control.view.fx_slot, 5);

    rig.tap(500, Button::Up);
    rig.tap(510, Button::Up);
    rig.tap(520, Button::Left);
    rig.turn(600, 1, 9);
    rig.step(610);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            600,
            MessageKind::MoveSlot {
                track: 0,
                from: 4,
                to: 5
            }
        )]
    );
    assert_eq!(rig.control.view.fx_slot, 5);
}

#[test]
fn page_on_fx_shows_chain_and_each_slots_type() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.press(100, Button::Page);
    rig.step(110);

    let names = ["Chain", "Delay", "Reverb", "–", "–", "–", "–"];
    let shown = |current| -> [Tile; 16] {
        core::array::from_fn(|at| Tile {
            name: names.get(at).copied(),
            state: match at {
                _ if at == current => TileState::Current,
                0..=6 => TileState::Exists,
                _ => TileState::Empty,
            },
        })
    };
    assert!(shows(&rig.control, &tiles(&header("Chain"), &shown(0))));
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
            step(6),
            track(0)
        ]
    );

    rig.tap(200, Button::Step(2));
    rig.step(210);
    assert!(shows(&rig.control, &tiles(&header("Reverb"), &shown(2))));
}

#[test]
fn a_delay_page_holds_time_feedback_tone_and_level_on_the_encoders() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.page(20, 1);

    rig.step(30);
    assert!(shows(
        &rig.control,
        &delay_page("120.0", &delay_items("1/8"), 0)
    ));

    rig.turn(100, 3, 1);
    rig.step(110);
    let slot_1 = Target::Slot { track: 0, slot: 0 };
    assert_eq!(
        rig.sent(),
        [message(
            0,
            100,
            MessageKind::SetParam {
                target: slot_1,
                id: DELAY_LEVEL.id,
                value: 512
            }
        )]
    );
    assert_eq!(rig.control.cursor(view::Screen::Fx).item, 4);

    rig.tap(200, Button::Up);
    rig.tap(210, Button::Ok);
    rig.step(220);
    assert_eq!(
        rig.sent(),
        [message(
            1,
            210,
            MessageKind::SetParam {
                target: slot_1,
                id: DELAY_PING_PONG.id,
                value: 1
            }
        )]
    );
    assert_eq!(rig.track().slots[0].value(DELAY_PING_PONG.id), 1);
}

#[test]
fn a_slots_page_sets_that_slot_while_the_cursor_is_on_slot_1() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.page(20, 2);
    assert_eq!(rig.control.view.fx_slot, 0);

    rig.turn(100, 3, 1);

    rig.step(110);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            100,
            MessageKind::SetParam {
                target: Target::Slot { track: 0, slot: 1 },
                id: REVERB_LEVEL.id,
                value: 512
            }
        )]
    );
}

#[test]
fn time_shows_the_value_in_use_when_it_does_not_fit() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.page(20, 1);
    rig.turn(100, 0, 9);

    rig.step(110);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            100,
            MessageKind::SetParam {
                target: Target::Slot { track: 0, slot: 0 },
                id: DELAY_TIME.id,
                value: 7_680
            }
        )]
    );
    assert!(shows(
        &rig.control,
        &delay_page("120.0", &delay_items("1/1"), 0)
    ));

    // At 60 BPM a whole note takes 4 seconds and the delay plays a half note, 2 seconds.
    rig.press(200, Button::Tempo);
    rig.turn(210, 0, -60);
    rig.let_go(220, Button::Tempo);
    rig.step(230);
    assert_eq!(rig.control.project.tempo, 6_000);
    assert!(shows(
        &rig.control,
        &delay_page("60.0", &delay_items("1/1 (1/2)"), 0)
    ));

    rig.press(300, Button::Tempo);
    rig.turn(310, 0, 60);
    rig.let_go(320, Button::Tempo);
    rig.step(330);
    assert!(shows(
        &rig.control,
        &delay_page("120.0", &delay_items("1/1"), 0)
    ));
}

#[test]
fn an_empty_slots_page_and_strip_are_empty() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.page(20, 3);
    rig.turn(100, 0, 1);

    rig.step(110);

    assert_eq!(rig.sent(), []);
    assert!(shows(
        &rig.control,
        &drawn(&header("–"), None, |_| {}, &[None; 4])
    ));
}

#[test]
fn each_track_has_its_own_chain() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.tap(100, Button::Right);
    rig.tap(110, Button::Right);
    rig.tap(120, Button::Ok);
    rig.tap(130, Button::Down);
    rig.tap(140, Button::Ok);

    rig.step(150);
    assert_eq!(
        rig.sent(),
        [message(
            0,
            140,
            MessageKind::SlotEffect {
                track: 0,
                slot: 2,
                effect: Effect::Delay
            }
        )]
    );
    let t1 = [
        Some("Delay"),
        Some("Reverb"),
        Some("Delay"),
        None,
        None,
        None,
    ];
    assert!(shows(&rig.control, &chain(&header("Chain"), &t1, 2, 0)));

    // T2's slot 3 is empty, and the cursor stays on slot 3.
    rig.tap(200, Button::T2);
    rig.step(210);
    assert_eq!(rig.control.view.fx_slot, 2);
    assert!(shows(
        &rig.control,
        &chain(
            &[
                ("Fx", ACCENT),
                ("Chain", TEXT),
                ("T2", TEXT),
                ("1", DIM),
                ("Pads", DIM)
            ],
            &NEW_CHAIN,
            2,
            0
        )
    ));

    rig.tap(300, Button::T1);
    rig.step(310);
    assert!(shows(&rig.control, &chain(&header("Chain"), &t1, 2, 0)));
}

#[test]
fn a_new_type_with_fewer_items_moves_the_cursor_up() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.menu(10, 3);
    rig.page(20, 1);
    for index in 0..4 {
        rig.tap(100 + 10 * index, Button::Down);
    }
    rig.step(150);
    assert_eq!(rig.control.view.cursor(view::Screen::Fx, 1).item, 4);

    rig.page(200, 0);
    rig.tap(300, Button::Ok);
    rig.tap(310, Button::Down);
    rig.tap(320, Button::Ok);
    rig.step(330);

    assert_eq!(
        rig.sent(),
        [message(
            0,
            320,
            MessageKind::SlotEffect {
                track: 0,
                slot: 0,
                effect: Effect::Reverb
            }
        )]
    );
    assert_eq!(rig.control.pages(view::Screen::Fx)[1].items.len(), 4);
    assert_eq!(rig.control.view.cursor(view::Screen::Fx, 1).item, 3);
}
