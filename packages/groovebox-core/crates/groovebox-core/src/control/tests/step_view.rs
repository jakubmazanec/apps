//! STEP's lanes and the notes each track's sounds have, its view of them (the data under STEP's
//! main area) and the arrows, OK and CANCEL that move its cursor and act on its cells.

use super::pattern::{count, entered, fill_until, notes_in, put, ready, versions};
use super::timing::{choose, on_bars, playing_4_bars, timing_cells};
use super::*;
use crate::control::lanes::Lane;
use crate::control::step_view::{GRID_CELLS, LANES_SHOWN};
use crate::control::view::StepCursor;
use crate::project::pool::{Engine, Sample};
use crate::project::{FOUR_FOUR, Signature};
use crate::storage::Path;
use crate::store::note::Note;
use crate::store::{NOTE_BLOCKS, Tree};
use crate::ui::step::{LaneView, Mark, StepPicture, draw_step};

/// The current track's lanes.
fn lanes(rig: &Rig<'_>) -> Vec<Lane> {
    rig.control.lanes().collect()
}

/// The sound's notes on each track of the current pattern.
fn on_tracks(rig: &Rig<'_>, sound: SoundNumber) -> [u32; 4] {
    rig.control.project.pool.get(sound).unwrap().on_tracks
}

#[test]
fn a_new_track_has_12_empty_pad_lanes_and_the_cursor_on_pad_1() {
    let queue = Queue::new();
    let rig = Rig::new(&queue);

    assert_eq!(lanes(&rig), (0..12).map(Lane::Pad).collect::<Vec<_>>());
    assert_eq!(rig.control.cursor_lane(), 0);
    assert_eq!(rig.control.lane_sound(Lane::Pad(3)), None);
}

#[test]
fn a_sound_on_two_pads_has_a_copy_lane() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.control.project.put(11, Some(syn_1));

    assert_eq!(rig.control.copy_of(11), Some(0));
    assert_eq!(rig.control.copy_of(0), None);
    assert_eq!(rig.control.copy_of(5), None);
    assert_eq!(rig.control.lane_sound(Lane::Pad(11)), Some(syn_1));
    assert_eq!(lanes(&rig).len(), 12);
}

#[test]
fn a_sound_with_notes_on_no_pad_has_an_extra_lane_in_pool_order() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let pool = &mut rig.control.project.pool;
    let [syn_1, syn_2, syn_3] = [(); 3].map(|()| pool.new_synth().unwrap());
    rig.control.project.put(0, Some(syn_3));
    // A tap of step 1 enters Syn 3's note, and the Pad page's sound picker swaps Syn 2 in for it
    // (the picker opens on Syn 3, the row below Syn 2).
    rig.tap(0, Button::Step(0));
    rig.menu(10, 2);
    rig.tap(20, Button::Ok);
    rig.tap(30, Button::Up);
    rig.tap(40, Button::Ok);
    rig.menu(50, 0);
    rig.step(60);
    rig.control.project.put(0, Some(syn_1));
    // The same for Syn 1, whose row is above Syn 2's.
    rig.tap(70, Button::Step(0));
    rig.menu(80, 2);
    rig.tap(90, Button::Ok);
    rig.tap(100, Button::Down);
    rig.tap(110, Button::Ok);
    rig.menu(120, 0);

    rig.step(130);

    assert_eq!(rig.track().pads[0], Some(syn_2));
    assert_eq!(lanes(&rig)[12..], [Lane::Extra(syn_1), Lane::Extra(syn_3)]);
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);
    assert_eq!(on_tracks(&rig, syn_3), [1, 0, 0, 0]);
    // The other tracks have no notes of them.
    rig.tap(140, Button::T2);
    rig.step(150);
    assert_eq!(lanes(&rig).len(), 12);
}

#[test]
fn the_selected_sound_on_no_pad_has_a_lane_until_another_is_selected() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.control.project.pool.new_synth().unwrap();
    // On POOL, Down moves from Remove unused onto Syn 1 and selects it.
    rig.menu(10, 5);
    rig.tap(20, Button::Down);

    rig.step(30);

    assert_eq!(rig.track().selected_pad, None);
    assert_eq!(lanes(&rig)[12..], [Lane::Extra(syn_1)]);
    assert_eq!(rig.control.cursor_lane(), 12);

    rig.hit(40, 0, 100);
    rig.release(50, 0);
    rig.step(60);

    assert_eq!(lanes(&rig).len(), 12);
    assert_eq!(rig.control.cursor_lane(), 0);
}

#[test]
fn counts_follow_taps_trims_and_deletes() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.tap(0, Button::Step(0));
    rig.tap(10, Button::Step(4));
    rig.step(20);
    assert_eq!(count(&rig, syn_1), 2);
    assert_eq!(on_tracks(&rig, syn_1), [2, 0, 0, 0]);

    rig.tap(30, Button::Step(4));
    rig.step(40);
    assert_eq!(count(&rig, syn_1), 1);
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);

    // LENGTH 4 bars, a tap of step 1 in bar 3 on STEP, LENGTH 1 bar and OK on the question.
    on_bars(&mut rig, 100);
    choose(&mut rig, 200, 0, &[Button::Down, Button::Down]);
    rig.menu(210, 0);
    rig.step(220);
    rig.control.view.steps.bar = 2;
    rig.tap(230, Button::Step(0));
    rig.step(240);
    assert_eq!(count(&rig, syn_1), 2);
    assert_eq!(on_tracks(&rig, syn_1), [2, 0, 0, 0]);
    on_bars(&mut rig, 300);
    choose(&mut rig, 400, 0, &[Button::Up, Button::Up]);
    rig.tap(410, Button::Ok);
    rig.step(420);
    assert_eq!(count(&rig, syn_1), 1);
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);

    // POOL's DELETE of Syn 1: the row opens its picker and its question.
    rig.menu(500, 5);
    rig.tap(510, Button::Ok);
    rig.tap(520, Button::Ok);
    rig.tap(530, Button::Ok);
    rig.step(540);
    assert!(rig.control.project.pool.get(syn_1).is_none());
}

#[test]
fn the_cursor_follows_the_selection_when_lanes_come_and_go() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let pool = &mut rig.control.project.pool;
    let [syn_1, syn_2] = [(); 2].map(|()| pool.new_synth().unwrap());
    put(
        &mut rig,
        0,
        0,
        &[entered(4, syn_1, 60), entered(0, syn_2, 60)],
    );
    // Syn 2, the second row of POOL, is selected on no pad.
    rig.menu(10, 5);
    rig.tap(20, Button::Down);
    rig.tap(30, Button::Down);
    rig.menu(40, 0);
    rig.step(50);
    assert_eq!(lanes(&rig)[12..], [Lane::Extra(syn_1), Lane::Extra(syn_2)]);
    assert_eq!(rig.control.cursor_lane(), 13);

    // A tap of step 1 removes Syn 2's only note, and its selection keeps its lane.
    rig.tap(60, Button::Step(0));
    rig.step(70);
    assert_eq!(on_tracks(&rig, syn_2), [0; 4]);
    assert_eq!(lanes(&rig)[12..], [Lane::Extra(syn_1), Lane::Extra(syn_2)]);
    assert_eq!(rig.control.cursor_lane(), 13);

    // T2 has pad 1 selected and no extra lane, and T1 has the selection again.
    rig.tap(80, Button::T2);
    rig.step(90);
    assert_eq!(rig.control.cursor_lane(), 0);
    assert_eq!(lanes(&rig).len(), 12);
    rig.tap(100, Button::T1);
    rig.step(110);
    assert_eq!(rig.control.cursor_lane(), 13);

    // T2 selects Syn 1 on POOL and deletes it: T1's selection is the first extra lane now.
    rig.tap(120, Button::T2);
    rig.menu(130, 5);
    rig.tap(140, Button::Down);
    rig.tap(150, Button::Ok);
    rig.tap(160, Button::Ok);
    rig.tap(170, Button::Ok);
    rig.tap(180, Button::T1);
    rig.menu(190, 0);
    rig.step(200);
    assert!(rig.control.project.pool.get(syn_1).is_none());
    assert_eq!(lanes(&rig)[12..], [Lane::Extra(syn_2)]);
    assert_eq!(rig.control.cursor_lane(), 12);
}

/// Names `sound`.
fn named(rig: &mut Rig<'_>, sound: SoundNumber, name: &str) {
    let label = &mut rig.control.project.pool.get_mut(sound).unwrap().name;
    *label = Label::new();
    label.push_str(name);
}

#[test]
fn the_columns_follow_the_widest_label() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    assert_eq!(rig.control.step_columns(), (17, 57));

    // Pad 12's "= pad 2" is 41 px wide.
    let syn_1 = rig.synth_on(1);
    rig.control.project.put(11, Some(syn_1));
    assert_eq!(rig.control.step_columns(), (47, 53));

    // A name of 13 characters ends in "…" at 12, 71 px.
    named(&mut rig, syn_1, "Žluťoučký kůň");
    assert_eq!(rig.control.step_columns(), (77, 49));
}

#[test]
fn the_view_stops_at_the_patterns_end() {
    // 4/4 and 5/4, 4 bars each: the cursor on the last cell of the last bar, and on the last
    // sixteenth of 5/4's last bar, whose dark cells then lie past the screen.
    for (signature, cursor, first_cell) in [
        (&[][..], StepCursor { bar: 3, step: 15 }, 64 - 57),
        (&[Button::Down][..], StepCursor { bar: 3, step: 19 }, 60),
    ] {
        let queue = Queue::new();
        let mut rig = Rig::new(&queue);
        on_bars(&mut rig, 0);
        choose(&mut rig, 60, 0, &[Button::Down, Button::Down]);
        choose(&mut rig, 160, 1, signature);
        rig.step(170);
        assert_eq!(rig.control.view.step_view.first_cell, 0);

        rig.control.view.steps = cursor;
        rig.step(180);

        assert_eq!(rig.control.view.step_view.first_cell, first_cell);
    }
}

#[test]
fn following_moves_the_view_at_the_bar_line() {
    // The 13 character name makes 49 columns, whose last is cell 48, bar 4's first; with 57
    // columns that cell shows without a move.
    for (name, first_cell) in [(Some("Žluťoučký kůň"), 4), (None, 0)] {
        let queue = Queue::new();
        let mut rig = playing_4_bars(&queue);
        let syn_1 = rig.synth_on(1);
        if let Some(name) = name {
            named(&mut rig, syn_1, name);
        }

        // PLAY at 100 puts bar 4's line at 288,100.
        rig.step(288_000);
        assert_eq!(rig.control.view.step_view.first_cell, 0);

        rig.step(288_200);
        assert_eq!(rig.control.shown_bar(288_200), 3);
        assert_eq!(rig.control.view.step_view.first_cell, first_cell);
    }
}

#[test]
fn the_view_keeps_the_cursor_after_a_lane_goes() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let sounds = [(); 20].map(|()| rig.control.project.pool.new_synth().unwrap());
    let notes = sounds.map(|sound| entered(sound.0 as u16 - 1, sound, 60));
    put(&mut rig, 0, 0, &notes);
    // Syn 20 is selected on no pad: the last of 20 extra lanes, shown from lane 16.
    rig.control.project.tracks[0].select_sound(sounds[19]);
    rig.step(10);
    assert_eq!(rig.control.cursor_lane(), 31);
    assert_eq!(rig.control.view.step_view.first_lane, 16);

    // On T2, POOL deletes the first 10 sounds one after the other: a Down selects the first
    // sound, and OK, OK and OK delete it, which sends the cursor back to Remove unused.
    rig.tap(20, Button::T2);
    rig.menu(30, 5);
    for at in (100..).step_by(100).take(10) {
        for (ago, button) in [Button::Down, Button::Ok, Button::Ok, Button::Ok]
            .into_iter()
            .enumerate()
        {
            rig.tap(at + 10 * ago as u64, button);
        }
        rig.step(at + 50);
    }
    rig.tap(1_100, Button::T1);
    rig.menu(1_110, 0);
    rig.step(1_120);

    assert_eq!(lanes(&rig).len(), 22);
    assert_eq!(rig.control.cursor_lane(), 21);
    assert_eq!(rig.control.view.step_view.first_lane, 22 - LANES_SHOWN);
}

/// STEP of a new project on T1 under `strip`, with these lanes, drawn by `draw_step`: 57 columns,
/// 1 bar, the cursor at (`cursor`), the header `header` and `marks`.
fn step_picture(
    header: &[(&str, Color)],
    names: i32,
    labels: &[(&str, Color)],
    first_extra: Option<usize>,
    marks: &[[Option<Mark>; GRID_CELLS]],
    cursor: (usize, u32),
    strip: &[Option<ItemView>; 4],
) -> Screen {
    let lanes: Vec<LaneView> = labels
        .iter()
        .enumerate()
        .map(|(lane, &(label, color))| LaneView {
            label,
            color,
            selected: lane == cursor.0,
        })
        .collect();
    drawn(
        header,
        None,
        |screen| {
            draw_step(
                screen,
                &StepPicture {
                    lanes: &lanes,
                    names,
                    columns: (480 - 2 - names as u32 - 2) / 8,
                    first_cell: 0,
                    cells: 16,
                    signature: FOUR_FOUR,
                    shown_page: 0,
                    first_extra,
                    marks,
                    cursor: Some(cursor),
                    music: None,
                },
            );
        },
        strip,
    )
}

#[test]
fn a_new_project_draws_12_empty_lanes_with_pad_1_selected() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);

    rig.step(128);

    let labels = [
        "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
    ]
    .map(|pad| (pad, DIM));
    assert!(shows(
        &rig.control,
        &step_picture(
            &STEP_HEADER,
            17,
            &labels,
            None,
            &[[None; GRID_CELLS]; 12],
            (0, 0),
            &[None; 4],
        )
    ));
}

#[test]
fn lanes_show_names_copies_missing_sounds_and_notes() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.control.project.put(11, Some(syn_1));
    // A sound of a missing sample that sits on no pad: a note of 3 sixteenths at velocity 59 in
    // sixteenth 4, by hand, as `put` replaces the track's notes.
    let kick = rig.control.project.pool.new_synth().unwrap();
    named(&mut rig, kick, "kick");
    let mut path = Path::new();
    path.push_str("samples/kick.wav");
    rig.control.project.pool.get_mut(kick).unwrap().engine = Engine::Sample(Sample::Missing(path));
    let long = Note {
        length: 1_440,
        velocity: 59,
        ..entered(3, kick, 60)
    };
    put(&mut rig, 0, 0, &[long]);
    // Taps of steps 1 and 2 enter Syn 1's notes in the first two sixteenths.
    rig.tap(10, Button::Step(0));
    rig.tap(20, Button::Step(1));

    rig.step(30);

    let mut labels = [
        "Syn 1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "= pad 1", "kick",
    ]
    .map(|label| (label, DIM));
    labels[0].1 = TEXT;
    labels[12].1 = RECORD;
    let mut marks = [[None; GRID_CELLS]; 13];
    marks[0][0] = Some(Mark {
        velocity: 127,
        count: 1,
        tail: 0,
    });
    marks[0][1] = marks[0][0];
    // 1,440 ticks are 2 sixteenths more than the block, 16 px.
    marks[12][3] = Some(Mark {
        velocity: 59,
        count: 1,
        tail: 16,
    });
    assert_eq!(rig.control.marks[..13], marks);
    assert!(
        rig.control.marks[13..]
            .iter()
            .flatten()
            .all(Option::is_none)
    );
    assert!(shows(
        &rig.control,
        &step_picture(
            &step_header("Syn 1"),
            47,
            &labels,
            Some(12),
            &marks,
            (0, 1),
            &[
                Some(sound("Syn 1")),
                Some(copy("on 2 pads")),
                Some(engine("Synth")),
                None
            ],
        )
    ));
}

#[test]
fn a_cell_shows_its_loudest_note_its_longest_tail_and_how_many_there_are() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.control.project.pool.new_synth().unwrap();
    // A chord of 3 of Syn 1 in sixteenth 3 and a note of Syn 2, which sits on no pad, in the same
    // sixteenth.
    let chord = |pitch, velocity, length| Note {
        velocity,
        length,
        ..entered(2, syn_1, pitch)
    };
    put(
        &mut rig,
        0,
        0,
        &[
            chord(60, 40, 480),
            chord(64, 99, 960),
            chord(67, 70, 700),
            entered(2, syn_2, 60),
        ],
    );

    // A tap of T1, the track it is on, is an event that makes the control part note the cells.
    rig.tap(10, Button::T1);

    assert!(rig.step(20));
    assert_eq!(
        rig.control.marks[0][2],
        Some(Mark {
            velocity: 99,
            count: 3,
            // 960 ticks are 8 px past a sixteenth's 8 px, 700 are 3.
            tail: 8,
        })
    );
    // Syn 2 has no pad: its lane is the first extra lane, 13th.
    assert_eq!(
        rig.control.marks[12][2],
        Some(Mark {
            velocity: 127,
            count: 1,
            tail: 0,
        })
    );
}

#[test]
fn the_marks_start_at_the_views_first_cell() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.control.project.patterns[0].bars = 4;
    // The cursor in bar 3 and the view from cell 9, the furthest it can start with the 55 columns
    // that "Syn 1" leaves of 64 cells: the notes at cells 3, 9, 16 and 63, the first before the
    // view.
    rig.control.view.steps = StepCursor { bar: 2, step: 0 };
    rig.control.view.step_view.first_cell = 9;
    let at = |bar, sixteenth| Note {
        bar,
        ..entered(sixteenth, syn_1, 60)
    };
    put(&mut rig, 0, 0, &[at(0, 3), at(0, 9), at(1, 0), at(3, 15)]);

    rig.tap(10, Button::T1);
    rig.step(20);

    assert_eq!(rig.control.view.step_view.first_cell, 9);
    let marked: Vec<_> = (0..GRID_CELLS)
        .filter(|&column| rig.control.marks[0][column].is_some())
        .collect();
    assert_eq!(marked, [0, 7, 54]);
}

#[test]
fn the_music_line_redraws_as_it_moves() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    // 120 BPM: a sixteenth is 6,000 samples and 8 px, so the line moves a pixel every 750.
    rig.tap(100, Button::Play);
    assert!(rig.step(200));
    assert_eq!(rig.control.music_x(200), Some(22));

    assert!(rig.step(950));
    assert_eq!(rig.control.music_x(950), Some(23));
    assert!(!rig.step(1_050));

    // The line shows on STEP only.
    rig.menu(1_100, 2);
    assert!(rig.step(1_200));
    assert_eq!(rig.control.music_x(1_200), None);
    assert!(!rig.step(2_000));
}

/// A rig on STEP whose pattern has `bars` bars of `signature` and whose cursor is at `at`.
fn shaped(
    queue: &Queue<Message, MESSAGE_QUEUE>,
    bars: u16,
    signature: Signature,
    at: StepCursor,
) -> Rig<'_> {
    let mut rig = Rig::new(queue);
    rig.control.project.patterns[0].bars = bars;
    rig.control.project.signature = signature;
    rig.control.view.steps = at;
    rig
}

fn place(bar: u16, step: u8) -> StepCursor {
    StepCursor { bar, step }
}

/// Where the cursor is after a tap of `button` at `sample`, with SHIFT held when `shift`.
fn arrow(rig: &mut Rig<'_>, sample: u64, button: Button, shift: bool) -> StepCursor {
    if shift {
        rig.press(sample, Button::Shift);
    }
    rig.tap(sample + 1, button);
    if shift {
        rig.let_go(sample + 3, Button::Shift);
    }
    rig.step(sample + 10);
    rig.control.view.steps
}

/// The tree of track 1 of pattern 1.
fn track_1(rig: &Rig<'_>) -> Tree {
    rig.control.project.patterns[0].tracks[0]
}

/// `playing_4_bars`, with STEP shown again.
fn playing_on_step(queue: &Queue<Message, MESSAGE_QUEUE>) -> Rig<'_> {
    let mut rig = playing_4_bars(queue);
    rig.menu(120, 0);
    rig.step(130);
    rig
}

#[test]
fn left_and_right_skip_dark_cells_and_stop_at_the_ends() {
    let queue = Queue::new();
    // 3/4 has 12 sixteenths: cells 12 to 15 of each bar are dark.
    let mut rig = shaped(&queue, 2, Signature { beats: 3, unit: 4 }, place(0, 11));

    assert_eq!(arrow(&mut rig, 100, Button::Right, false), place(1, 0));
    assert_eq!(arrow(&mut rig, 200, Button::Left, false), place(0, 11));
    // The pattern's first and last sixteenth hold the cursor.
    rig.control.view.steps = place(0, 0);
    assert_eq!(arrow(&mut rig, 300, Button::Left, false), place(0, 0));
    rig.control.view.steps = place(1, 11);
    assert_eq!(arrow(&mut rig, 400, Button::Right, false), place(1, 11));

    // The press of a held right moves from (0, 9) to (0, 10), and its repeats on to (0, 11), over
    // the bar line to (1, 0) and to (1, 1).
    rig.control.view.steps = place(0, 9);
    rig.press(1_000, Button::Right);
    rig.step(1_000 + REPEAT_DELAY + 2 * REPEAT_EVERY + 1);
    assert_eq!(rig.control.view.steps, place(1, 1));
}

#[test]
fn shift_jumps_a_page_and_takes_the_short_pages_last_sixteenth() {
    let queue = Queue::new();
    // 5/4 has 20 sixteenths: a bar takes 2 pages and 32 cells, the second with 4 lit.
    let mut rig = shaped(&queue, 2, Signature { beats: 5, unit: 4 }, place(0, 10));

    assert_eq!(arrow(&mut rig, 100, Button::Right, true), place(0, 19));
    assert_eq!(arrow(&mut rig, 200, Button::Right, true), place(1, 3));
    assert_eq!(arrow(&mut rig, 300, Button::Left, true), place(0, 19));
    // Cell 3 of the first page has no page before it.
    rig.control.view.steps = place(0, 3);
    assert_eq!(arrow(&mut rig, 400, Button::Left, true), place(0, 3));
    // From (1, 3) a page on is (1, 19), the last lit cell; a page past it leaves the pattern.
    rig.control.view.steps = place(1, 3);
    assert_eq!(arrow(&mut rig, 500, Button::Right, true), place(1, 19));
    assert_eq!(arrow(&mut rig, 600, Button::Right, true), place(1, 19));
    // A page back from (1, 5) is cell 21 of bar 1's second page: dark, so its last sixteenth.
    rig.control.view.steps = place(1, 5);
    assert_eq!(arrow(&mut rig, 700, Button::Left, true), place(0, 19));

    // 16/4 has 64 sixteenths: four jumps cross one bar.
    let queue = Queue::new();
    let mut rig = shaped(&queue, 2, Signature { beats: 16, unit: 4 }, place(0, 0));
    for (at, expected) in [
        (100, place(0, 16)),
        (200, place(0, 32)),
        (300, place(0, 48)),
    ] {
        assert_eq!(arrow(&mut rig, at, Button::Right, true), expected);
    }
    assert_eq!(arrow(&mut rig, 400, Button::Right, true), place(1, 0));
}

#[test]
fn up_and_down_select_the_lanes_sound() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.control.project.pool.new_synth().unwrap();
    // Syn 2 sits on no pad and has a note: the 13th lane.
    put(&mut rig, 0, 0, &[entered(0, syn_2, 60)]);
    rig.step(10);
    assert_eq!(rig.control.cursor_lane(), 0);

    // Up at the first lane stays on it.
    rig.tap(20, Button::Up);
    rig.step(30);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_1));

    // Down selects the empty pad 2.
    rig.tap(40, Button::Down);
    rig.step(50);
    assert_eq!(rig.track().selected_pad, Some(1));
    assert_eq!(rig.track().selected_sound, None);
    assert_eq!(rig.control.cursor_lane(), 1);
    assert!(shows_step(
        &rig.control,
        &[("Step", ACCENT), ("T1", TEXT), ("2", DIM), ("Pads", DIM)]
    ));

    // SHIFT + down is 12 lanes, held at the last: Syn 2 on no pad.
    rig.press(60, Button::Shift);
    rig.tap(61, Button::Down);
    rig.let_go(63, Button::Shift);
    rig.step(70);
    assert_eq!(rig.track().selected_pad, None);
    assert_eq!(rig.track().selected_sound, Some(syn_2));
    assert_eq!(rig.control.cursor_lane(), 12);

    // Up goes back to pad 12, and SHIFT + up to pad 1.
    rig.tap(80, Button::Up);
    rig.step(90);
    assert_eq!(rig.track().selected_pad, Some(11));
    assert_eq!(rig.control.cursor_lane(), 11);
    rig.press(100, Button::Shift);
    rig.tap(101, Button::Up);
    rig.let_go(103, Button::Shift);
    rig.step(110);
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.control.cursor_lane(), 0);

    // PADS/KEYS + up still moves the octave in KEYS mode.
    rig.tap(120, Button::PadsKeys);
    rig.press(130, Button::PadsKeys);
    rig.tap(131, Button::Up);
    rig.let_go(133, Button::PadsKeys);
    rig.step(140);
    assert_eq!(rig.track().octave, 5);
    assert_eq!(rig.control.cursor_lane(), 0);
}

#[test]
fn an_arrow_starts_from_the_bar_playing() {
    let queue = Queue::new();
    let mut rig = playing_on_step(&queue);

    // Bar 3 plays from sample 192,100, and the cursor was in bar 1.
    rig.step(200_000);
    assert!(rig.control.view.following);
    assert_eq!(rig.control.view.steps, place(0, 0));

    assert_eq!(arrow(&mut rig, 200_100, Button::Right, false), place(2, 1));
    assert!(rig.control.view.following);
}

#[test]
fn an_arrow_into_another_bar_stops_following() {
    let queue = Queue::new();
    let mut rig = playing_on_step(&queue);
    rig.step(200_000);

    // Left from bar 3's first sixteenth is bar 2's last.
    assert_eq!(arrow(&mut rig, 200_100, Button::Left, false), place(1, 15));
    assert!(!rig.control.view.following);

    // The next bar line, at 288,100, leaves the buttons and the header on bar 2.
    rig.step(290_000);
    assert_eq!(rig.control.shown_bar(290_000), 1);
    let mut expected = Screen::new();
    draw_header(
        &mut expected,
        &STEP_HEADER.map(|(text, color)| Piece { text, color }),
        &["P1", "2/4 ▶4", "120.0"].map(|text| Piece { text, color: TEXT }),
        false,
    );
    draw_strip(&mut expected, &[None; 4]);
    assert!(shows_frame(&rig.control, &expected));

    // Up and down move no cursor and keep following.
    let queue = Queue::new();
    let mut rig = playing_on_step(&queue);
    rig.step(200_000);
    rig.tap(200_100, Button::Down);
    rig.tap(200_200, Button::Up);
    rig.step(200_300);
    assert!(rig.control.view.following);
}

#[test]
fn ok_on_an_empty_cell_enters_and_on_notes_does_nothing() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 1, FOUR_FOUR, place(0, 4));
    let syn_1 = rig.synth_on(0);

    rig.tap(10, Button::Ok);
    rig.step(20);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(4, syn_1, 60)]);
    let sent = versions(&mut rig);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].tree, track_1(&rig));
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);

    // The cell has a note now.
    rig.tap(30, Button::Ok);
    rig.step(40);
    assert_eq!(notes_in(&rig, track_1(&rig)).len(), 1);
    assert_eq!(versions(&mut rig), []);

    // In KEYS mode the last key sets the pitch: D4 on pad 3.
    rig.tap(50, Button::PadsKeys);
    rig.hit(60, 2, 100);
    rig.release(70, 2);
    rig.control.view.steps = place(0, 8);
    rig.tap(80, Button::Ok);
    rig.step(90);
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [entered(4, syn_1, 60), entered(8, syn_1, 62)]
    );

    // An empty pad's lane has no sound to enter.
    rig.tap(100, Button::Down);
    rig.control.view.steps = place(0, 12);
    rig.tap(110, Button::Ok);
    rig.step(120);
    assert_eq!(notes_in(&rig, track_1(&rig)).len(), 2);
    assert_eq!(count(&rig, syn_1), 2);
}

#[test]
fn cancel_removes_the_cells_notes_when_let_go() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 1, FOUR_FOUR, place(0, 4));
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(4, syn_1, 60), entered(4, syn_1, 64)],
    );
    rig.step(10);

    // A long CANCEL removes nothing.
    rig.press(100, Button::Cancel);
    rig.let_go(100 + HOLD, Button::Cancel);
    rig.step(200 + HOLD);
    assert_eq!(count(&rig, syn_1), 2);

    // A tap closes the Sound picker, which a push of encoder 1 opens, and removes nothing.
    rig.tap(300 + HOLD, Button::Push(0));
    rig.step(310 + HOLD);
    assert!(rig.control.view.picker.is_some());
    rig.tap(400 + HOLD, Button::Cancel);
    rig.step(410 + HOLD);
    assert!(rig.control.view.picker.is_none());
    assert_eq!(count(&rig, syn_1), 2);
    assert_eq!(versions(&mut rig), []);

    // With the picker closed a tap removes both notes, whatever their pitch, when it is let go.
    rig.press(500 + HOLD, Button::Cancel);
    rig.step(510 + HOLD);
    assert_eq!(count(&rig, syn_1), 2);
    rig.let_go(520 + HOLD, Button::Cancel);
    rig.step(530 + HOLD);
    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(count(&rig, syn_1), 0);
    assert_eq!(on_tracks(&rig, syn_1), [0; 4]);
    assert_eq!(versions(&mut rig).len(), 1);

    // An empty cell: nothing.
    rig.tap(600 + HOLD, Button::Cancel);
    rig.step(610 + HOLD);
    assert_eq!(versions(&mut rig), []);
}

#[test]
fn shift_and_cancel_remove_nothing_on_step() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 1, FOUR_FOUR, place(0, 4));
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(4, syn_1, 60)]);
    rig.step(10);

    // SHIFT + CANCEL stays free for Milestone 4's undo, whichever button goes up first.
    rig.press(100, Button::Shift);
    rig.tap(110, Button::Cancel);
    rig.let_go(120, Button::Shift);
    rig.press(200, Button::Shift);
    rig.press(210, Button::Cancel);
    rig.let_go(220, Button::Shift);
    rig.let_go(230, Button::Cancel);
    rig.step(300);
    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(4, syn_1, 60)]);
    assert_eq!(versions(&mut rig), []);

    // It still closes a picker.
    rig.tap(400, Button::Push(0));
    rig.press(410, Button::Shift);
    rig.tap(420, Button::Cancel);
    rig.let_go(430, Button::Shift);
    rig.step(500);
    assert!(rig.control.view.picker.is_none());
    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(4, syn_1, 60)]);
}

#[test]
fn cancel_acts_on_the_cell_it_showed_at_its_press() {
    let queue = Queue::new();
    let mut rig = playing_on_step(&queue);
    let syn_1 = rig.synth_on(0);
    // A note in the first sixteenth of bars 1 and 2.
    let in_bar_2 = Note {
        bar: 1,
        ..entered(0, syn_1, 60)
    };
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60), in_bar_2]);

    // Bar 2 starts at sample 96,100: CANCEL goes down in bar 1 and up in bar 2.
    rig.press(96_000, Button::Cancel);
    rig.let_go(96_200, Button::Cancel);
    rig.step(96_300);

    assert_eq!(notes_in(&rig, track_1(&rig)), [in_bar_2]);
}

#[test]
fn ok_and_cancel_let_go_of_the_trees_they_replace() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 1, FOUR_FOUR, place(0, 4));
    rig.synth_on(0);

    // OK in sixteenths 5 and 9, CANCEL in the 5th and OK in the 13th: two notes, in one block, are
    // left, and every tree that each version replaced is free once its report is heard.
    rig.tap(10, Button::Ok);
    rig.step(20);
    rig.control.view.steps = place(0, 8);
    rig.tap(30, Button::Ok);
    rig.step(40);
    rig.control.view.steps = place(0, 4);
    rig.tap(50, Button::Cancel);
    rig.step(60);
    rig.control.view.steps = place(0, 12);
    rig.tap(70, Button::Ok);
    rig.step(80);
    assert_eq!(versions(&mut rig).len(), 4);

    for number in 0..4 {
        rig.applied(number, 100 + u64::from(number));
    }
    assert_eq!(ready(&rig), NOTE_BLOCKS - 1);
}

#[test]
#[allow(unsafe_code)]
fn cleared_and_added_chain_into_one_tree_and_one_version() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 1, FOUR_FOUR, place(0, 0));
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(4, syn_1, 60), entered(8, syn_1, 60)],
    );
    let ready_before = ready(&rig);

    // SAFETY: as in `Rig::step`, the version producer and the store live only for this block.
    let (mut sent, mut store) = unsafe { (rig.versions.producer(), rig.notes.store()) };
    let (tree, removed) = rig
        .control
        .cleared(track_1(&rig), place(0, 4), syn_1, None, &mut store);
    let tree = rig.control.added(tree, place(0, 5), syn_1, 64, &mut store);
    rig.control.edit(0, 0, tree, 10, &mut sent, &mut store);
    store.release(tree, None);

    assert_eq!(removed, 1);
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [entered(5, syn_1, 64), entered(8, syn_1, 60)]
    );
    assert_eq!(on_tracks(&rig, syn_1), [2, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 1);
    // The final tree's block took the place of the first tree's, and the tree between them is free.
    assert_eq!(ready(&rig), ready_before);
}

#[test]
fn a_step_acts_on_the_place_it_showed_at_its_press() {
    let queue = Queue::new();
    // 5/4: the second page of a bar shows sixteenths 16 to 19, and its steps 5 to 16 are dark.
    let mut rig = shaped(&queue, 2, Signature { beats: 5, unit: 4 }, place(1, 17));
    let syn_1 = rig.synth_on(0);

    rig.press(10, Button::Step(2));
    rig.step(15);
    assert_eq!(rig.control.pressed[2], place(1, 18));
    rig.let_go(20, Button::Step(2));
    rig.step(30);
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [Note {
            bar: 1,
            ..entered(18, syn_1, 60)
        }]
    );
    assert_eq!(rig.control.view.steps, place(1, 18));

    // Step 5 is past the bar's end.
    rig.tap(40, Button::Step(5));
    rig.step(50);
    assert_eq!(notes_in(&rig, track_1(&rig)).len(), 1);
    assert_eq!(rig.control.view.steps, place(1, 18));
}

#[test]
fn ok_and_cancel_under_the_reserve() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 1, FOUR_FOUR, place(0, 2));
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(4, syn_1, 60), entered(9, syn_1, 60)],
    );
    rig.step(10);
    fill_until(&rig, RESERVE - 1);
    let before = track_1(&rig);

    rig.tap(100, Button::Ok);
    rig.step(110);

    assert_eq!(track_1(&rig), before);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(count(&rig, syn_1), 2);
    assert!(shows_frame(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            Some(("Not enough memory", RECORD)),
            |_| {},
            &[
                Some(sound("Syn 1")),
                Some(copy("on 1 pad")),
                Some(engine("Synth")),
                None
            ],
        )
    ));

    // A removal may use the reserve.
    rig.control.view.steps = place(0, 4);
    rig.tap(200, Button::Cancel);
    rig.step(210);
    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(9, syn_1, 60)]);
    assert_eq!(count(&rig, syn_1), 1);
    assert_eq!(versions(&mut rig).len(), 1);
}

/// The NOTE strip's cells: Pitch and Velocity showing these values over these bars, then Length and
/// Position over the bare track (S13).
fn note_strip<'a>(
    pitch: (&'a str, Bar),
    velocity: (&'a str, Bar),
    length: &'a str,
    position: &'a str,
) -> [Option<ItemView<'a>>; 4] {
    let mut encoder = 0;
    [
        ("Pitch", pitch),
        ("Velocity", velocity),
        ("Length", (length, Bar::Track)),
        ("Position", (position, Bar::Track)),
    ]
    .map(|(name, (value, bar))| {
        encoder += 1;
        Some(ItemView {
            encoder: Some(encoder),
            name,
            value,
            bar,
        })
    })
}

/// Whether the control part draws STEP's frame with Syn 1 selected, no message and these cells in
/// the strip.
fn strip_shows(rig: &Rig<'_>, cells: &[Option<ItemView>; 4]) -> bool {
    shows_frame(
        &rig.control,
        &drawn(&step_header("Syn 1"), None, |_| {}, cells),
    )
}

#[test]
fn holding_a_step_shows_its_notes_on_the_note_strip() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(0, syn_1, 48), entered(0, syn_1, 52)],
    );
    let chord = note_strip(
        ("C3–E3", Bar::Track),
        ("127", Bar::Fill(127, 127)),
        "1/16",
        "+0",
    );

    rig.press(10, Button::Step(0));
    rig.step(20);
    assert!(strip_shows(&rig, &chord));

    // A long press, which keeps the notes.
    rig.let_go(10 + HOLD, Button::Step(0));
    rig.step(20 + HOLD);
    assert!(strip_shows(
        &rig,
        &[
            Some(sound("Syn 1")),
            Some(copy("on 1 pad")),
            Some(engine("Synth")),
            None
        ]
    ));
    assert_eq!(notes_in(&rig, track_1(&rig)).len(), 2);

    // A held step with no notes of the sound: an empty strip.
    rig.press(30_000, Button::Step(5));
    rig.step(30_010);
    assert!(strip_shows(&rig, &[None; 4]));
    rig.let_go(30_000 + HOLD, Button::Step(5));

    // The first pressed of TEMPO and the held steps counts.
    rig.press(60_000, Button::Tempo);
    rig.press(60_010, Button::Step(0));
    rig.step(60_020);
    assert!(strip_shows(&rig, &timing_cells("120.0", 9_000)));
    rig.let_go(60_030, Button::Tempo);
    rig.let_go(60_010 + HOLD, Button::Step(0));
    rig.press(90_000, Button::Step(0));
    rig.press(90_010, Button::Tempo);
    rig.step(90_020);
    assert!(strip_shows(&rig, &chord));
}

#[test]
fn velocity_and_length_stop_note_by_note() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let chord = |pitch, velocity, length| Note {
        velocity,
        length,
        ..entered(0, syn_1, pitch)
    };
    put(&mut rig, 0, 0, &[chord(60, 120, 480), chord(64, 60, 7_200)]);
    let values = |rig: &Rig<'_>| -> Vec<(u8, u32)> {
        notes_in(rig, track_1(rig))
            .iter()
            .map(|note| (note.velocity, note.length))
            .collect()
    };
    rig.press(10, Button::Step(0));

    rig.turn(20, 1, 10);
    rig.step(30);
    assert_eq!(values(&rig), [(127, 480), (70, 7_200)]);

    // A bar of 4/4 is 7,680 ticks.
    rig.turn(40, 2, 2);
    rig.step(50);
    assert_eq!(values(&rig), [(127, 1_440), (70, 7_680)]);

    rig.press(60, Button::Shift);
    rig.turn(61, 2, -1);
    rig.let_go(62, Button::Shift);
    rig.step(70);
    assert_eq!(values(&rig), [(127, 1_410), (70, 7_650)]);

    rig.turn(80, 2, -20);
    rig.step(90);
    assert_eq!(values(&rig), [(127, 30), (70, 30)]);
    assert_eq!(versions(&mut rig).len(), 4);

    // Both at their end: nothing changes and nothing is sent.
    rig.turn(100, 2, -1);
    rig.step(110);
    assert_eq!(values(&rig), [(127, 30), (70, 30)]);
    assert_eq!(versions(&mut rig), []);
}

#[test]
fn pitch_and_position_move_together_and_stop_at_the_first_end() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(0, syn_1, 120), entered(0, syn_1, 125)],
    );

    rig.press(10, Button::Step(0));
    rig.turn(20, 0, 5);
    rig.step(30);

    // Only 2 of the 5 clicks, as far as 127.
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [entered(0, syn_1, 122), entered(0, syn_1, 127)]
    );

    // Notes in sixteenths 1 and 2, both held: 3 clicks back pass the pattern's start.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let notes = [entered(0, syn_1, 60), entered(1, syn_1, 60)];
    put(&mut rig, 0, 0, &notes);
    rig.press(10, Button::Step(0));
    rig.press(11, Button::Step(1));

    rig.turn(20, 3, -3);
    rig.step(30);

    assert_eq!(notes_in(&rig, track_1(&rig)), notes);
    assert_eq!(versions(&mut rig), []);

    // 20 clicks on stop where the second reaches the last sixteenth: 14.
    rig.turn(40, 3, 20);
    rig.step(50);
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [entered(14, syn_1, 60), entered(15, syn_1, 60)]
    );
}

#[test]
fn moving_neighbouring_held_steps_moves_each_note_once() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(0, syn_1, 60), entered(1, syn_1, 60)],
    );
    rig.press(10, Button::Step(0));
    rig.press(11, Button::Step(1));

    rig.turn(20, 3, 1);
    rig.step(30);

    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [entered(1, syn_1, 60), entered(2, syn_1, 60)]
    );
    assert_eq!(count(&rig, syn_1), 2);
    assert_eq!(on_tracks(&rig, syn_1), [2, 0, 0, 0]);
    assert!(strip_shows(
        &rig,
        &note_strip(
            ("C4", Bar::Fill(60, 127)),
            ("127", Bar::Fill(127, 127)),
            "1/16",
            "+1"
        )
    ));

    // 3/4 has 12 sixteenths: a note in bar 1's last moves into bar 2's first.
    let queue = Queue::new();
    let mut rig = shaped(&queue, 2, Signature { beats: 3, unit: 4 }, place(0, 0));
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(10, syn_1, 60), entered(11, syn_1, 60)],
    );
    rig.press(10, Button::Step(10));
    rig.press(11, Button::Step(11));

    rig.turn(20, 3, 1);
    rig.step(30);

    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [
            entered(11, syn_1, 60),
            Note {
                bar: 1,
                ..entered(0, syn_1, 60)
            }
        ]
    );
    assert_eq!(rig.control.held[10..12], [place(0, 11), place(1, 0)]);
}

#[test]
fn held_steps_on_one_sixteenth_edit_its_notes_once() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(1, syn_1, 60)]);
    // Steps 1 and 2 held, a note in step 2's sixteenth only.
    rig.press(10, Button::Step(0));
    rig.press(11, Button::Step(1));

    // Step 1 stands for the pattern's first sixteenth, so nothing moves back.
    rig.turn(20, 3, -1);
    rig.step(30);
    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(1, syn_1, 60)]);
    assert_eq!(versions(&mut rig), []);

    // Both held steps move, the one without notes too.
    rig.turn(40, 3, 1);
    rig.step(50);
    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(2, syn_1, 60)]);
    assert_eq!(rig.control.held[..2], [place(0, 1), place(0, 2)]);

    // Step 3 pressed where the note lies now stands for it too: the note changes once and reads
    // one position, step 2's.
    rig.press(60, Button::Step(2));
    rig.turn(70, 1, -10);
    rig.step(80);
    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [Note {
            velocity: 117,
            ..entered(2, syn_1, 60)
        }]
    );
    assert_eq!(count(&rig, syn_1), 1);
    assert!(strip_shows(
        &rig,
        &note_strip(
            ("C4", Bar::Fill(60, 127)),
            ("117", Bar::Fill(117, 127)),
            "1/16",
            "+1"
        )
    ));
}

/// Chooses 1 bar for a pattern of 2 on PATTERN's Bars page, where OK opens the Length picker and up
/// is 1 bar, from sample 30 to 80, the held steps staying held.
fn shorten_to_1_bar(rig: &mut Rig<'_>) {
    on_bars(rig, 30);
    rig.tap(50, Button::Ok);
    rig.tap(60, Button::Up);
    rig.tap(70, Button::Ok);
    rig.step(80);
    assert_eq!(rig.control.project.patterns[0].bars, 1);
    versions(rig);
}

#[test]
fn a_held_step_past_a_shortened_patterns_end_no_longer_counts() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 2, FOUR_FOUR, place(0, 0));
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60)]);
    // Step 1 held on its note in bar 1, step 3 on nothing in bar 2 (PAGE + step 2 opens the Bars
    // page).
    rig.press(10, Button::Step(0));
    rig.step(15);
    rig.control.view.steps.bar = 1;
    rig.press(20, Button::Step(2));
    shorten_to_1_bar(&mut rig);

    rig.turn(90, 3, 1);
    rig.step(100);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(1, syn_1, 60)]);
    assert_eq!(rig.control.held[0], place(0, 1));
    assert_eq!(versions(&mut rig).len(), 1);
}

#[test]
fn a_hit_under_a_step_held_past_a_shortened_patterns_end_adds_no_note() {
    let queue = Queue::new();
    let mut rig = shaped(&queue, 2, FOUR_FOUR, place(1, 0));
    rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    rig.press(20, Button::Step(2));
    shorten_to_1_bar(&mut rig);

    rig.hit(90, 1, 100);
    rig.step(100);

    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(count(&rig, syn_2), 0);
    assert_eq!(on_tracks(&rig, syn_2), [0; 4]);
    assert_eq!(versions(&mut rig), []);
}

#[test]
fn a_hit_under_a_step_held_past_a_narrowed_bars_end_adds_no_note() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60)]);
    // POSITION moves step 1 and its note to the 15th sixteenth, which 3/4 has no room for.
    rig.press(10, Button::Step(0));
    rig.turn(20, 3, 14);
    rig.step(30);
    assert_eq!(rig.control.held[0], place(0, 14));
    // On PATTERN's Bars page, the held step keeping the encoders for the NOTE strip, down and OK
    // open the Signature picker, where up is 3/4, and OK answers the question.
    on_bars(&mut rig, 100);
    for (sample, button) in [
        (200, Button::Down),
        (210, Button::Ok),
        (220, Button::Up),
        (230, Button::Ok),
        (300, Button::Ok),
    ] {
        rig.tap(sample, button);
    }
    rig.step(310);
    assert_eq!(
        rig.control.project.signature,
        Signature { beats: 3, unit: 4 }
    );
    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    versions(&mut rig);

    rig.hit(400, 1, 100);
    rig.step(410);

    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(count(&rig, syn_2), 0);
    assert_eq!(versions(&mut rig), []);
}

#[test]
fn the_strip_shows_a_length_range_whole() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    // Taps of steps 1 and 2 enter a sixteenth each.
    rig.tap(10, Button::Step(0));
    rig.tap(20, Button::Step(1));
    let shorter = |rig: &mut Rig<'_>, sample, step, clicks| {
        rig.press(sample, Button::Step(step));
        rig.press(sample + 1, Button::Shift);
        rig.turn(sample + 2, 2, clicks);
        rig.let_go(sample + 3, Button::Shift);
        rig.let_go(sample + 4, Button::Step(step));
    };
    // Step 1 alone at 450 ticks and step 2 alone at 390.
    shorter(&mut rig, 100, 0, -1);
    shorter(&mut rig, 200, 1, -3);

    // Both, 6 sixteenths longer: 3,330 and 3,270 ticks.
    rig.press(300, Button::Step(0));
    rig.press(301, Button::Step(1));
    rig.turn(310, 2, 6);
    rig.step(320);

    let lengths: Vec<u32> = notes_in(&rig, track_1(&rig))
        .iter()
        .map(|note| note.length)
        .collect();
    assert_eq!(lengths, [3_330, 3_270]);
    assert!(strip_shows(
        &rig,
        &note_strip(
            ("C4", Bar::Fill(60, 127)),
            ("127", Bar::Fill(127, 127)),
            "109/256–111/256",
            "+0"
        )
    ));
}

#[test]
fn a_moved_note_replaces_one_it_lands_on() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let outside = Note {
        velocity: 50,
        ..entered(2, syn_1, 60)
    };
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60), outside]);
    let ready_before = ready(&rig);
    rig.press(10, Button::Step(0));

    rig.turn(20, 3, 2);
    rig.step(30);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(2, syn_1, 60)]);
    assert_eq!(count(&rig, syn_1), 1);
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);
    // The new tree's one block takes the old one's place once the version is heard, and the trees
    // between them are free.
    assert_eq!(versions(&mut rig).len(), 1);
    rig.applied(0, 40);
    assert_eq!(ready(&rig), ready_before);

    // A note of another pitch stays, and the held step edits it with the moved one.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(
        &mut rig,
        0,
        0,
        &[entered(0, syn_1, 60), entered(2, syn_1, 62)],
    );
    rig.press(10, Button::Step(0));

    rig.turn(20, 3, 2);
    rig.turn(30, 1, -10);
    rig.step(40);

    let soft = |pitch| Note {
        velocity: 117,
        ..entered(2, syn_1, pitch)
    };
    assert_eq!(notes_in(&rig, track_1(&rig)), [soft(60), soft(62)]);
    assert_eq!(count(&rig, syn_1), 2);
}

#[test]
fn the_edit_follows_the_note() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60)]);
    rig.press(10, Button::Step(0));

    rig.turn(20, 3, 1);
    // OK on the cursor's cell (0, 0), empty now.
    rig.tap(30, Button::Ok);
    rig.turn(40, 1, -10);
    rig.step(50);

    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [
            entered(0, syn_1, 60),
            Note {
                velocity: 117,
                ..entered(1, syn_1, 60)
            }
        ]
    );
    assert_eq!(rig.control.held[0], place(0, 1));
}

#[test]
fn a_turn_under_the_reserve_changes_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60)]);
    rig.press(10, Button::Step(0));
    rig.step(20);
    fill_until(&rig, RESERVE - 1);
    let before = track_1(&rig);

    rig.turn(30, 1, -10);
    rig.step(40);

    assert_eq!(track_1(&rig), before);
    assert_eq!(notes_in(&rig, before), [entered(0, syn_1, 60)]);
    assert_eq!(versions(&mut rig), []);
    assert!(shows_frame(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            Some(("Not enough memory", RECORD)),
            |_| {},
            &note_strip(
                ("C4", Bar::Fill(60, 127)),
                ("127", Bar::Fill(127, 127)),
                "1/16",
                "+0"
            ),
        )
    ));
}

#[test]
fn a_pad_under_a_held_step_adds_or_removes_its_sound_there() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    rig.press(10, Button::Step(0));

    rig.hit(20, 1, 90);
    rig.release(25, 1);
    rig.step(30);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(0, syn_2, 60)]);
    assert_eq!(on_tracks(&rig, syn_2), [1, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 1);
    // It sounds as usual and selects nothing.
    assert_eq!(
        rig.sent(),
        [
            message(0, 20, note_on(0, 0, syn_2, 60, 90)),
            message(2, 25, note_off(0))
        ]
    );
    assert_eq!(rig.track().selected_pad, Some(0));
    assert_eq!(rig.track().selected_sound, Some(syn_1));
    assert_eq!(rig.control.cursor_lane(), 0);

    rig.hit(40, 1, 90);
    rig.step(50);

    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(on_tracks(&rig, syn_2), [0; 4]);
    assert_eq!(versions(&mut rig).len(), 1);

    // The step's release is no tap, so it enters nothing for Syn 1.
    rig.let_go(60, Button::Step(0));
    rig.step(70);
    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(on_tracks(&rig, syn_1), [0; 4]);
}

#[test]
fn a_key_under_a_held_step_adds_or_removes_its_pitch() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    // Steps 1 and 3 held, then C4 and E4.
    rig.press(10, Button::Step(0));
    rig.press(11, Button::Step(2));
    rig.hit(20, 0, 100);
    rig.release(21, 0);
    rig.hit(30, 4, 100);
    rig.release(31, 4);
    rig.step(40);

    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [
            entered(0, syn_1, 60),
            entered(0, syn_1, 64),
            entered(2, syn_1, 60),
            entered(2, syn_1, 64)
        ]
    );
    assert_eq!(on_tracks(&rig, syn_1), [4, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 2);

    // E4 again removes E4 from both steps and keeps C4.
    rig.hit(50, 4, 100);
    rig.release(51, 4);
    rig.step(60);

    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        [entered(0, syn_1, 60), entered(2, syn_1, 60)]
    );
    assert_eq!(on_tracks(&rig, syn_1), [2, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 1);
    assert_eq!(rig.track().last_key, Some(64));
    assert_eq!(rig.track().selected_pad, Some(0));
}

#[test]
fn each_held_step_toggles_on_its_own() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    put(&mut rig, 0, 0, &[entered(0, syn_2, 60)]);
    rig.press(10, Button::Step(0));
    rig.press(11, Button::Step(2));

    rig.hit(20, 1, 100);
    rig.step(30);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(2, syn_2, 60)]);
    assert_eq!(count(&rig, syn_2), 1);
    assert_eq!(on_tracks(&rig, syn_2), [1, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 1);
}

#[test]
fn held_steps_on_one_sixteenth_toggle_it_once() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    put(&mut rig, 0, 0, &[entered(0, syn_1, 60)]);
    // POSITION moves the note onto the second sixteenth, and step 2, pressed after the move, stands
    // for it as step 1 does.
    rig.press(10, Button::Step(0));
    rig.turn(20, 3, 1);
    rig.press(30, Button::Step(1));
    rig.step(40);
    assert_eq!(rig.control.held[..2], [place(0, 1), place(0, 1)]);
    versions(&mut rig);

    rig.hit(50, 0, 100);
    rig.release(51, 0);
    rig.step(60);

    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(on_tracks(&rig, syn_1), [0; 4]);
    assert_eq!(versions(&mut rig).len(), 1);

    rig.hit(70, 0, 100);
    rig.step(80);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(1, syn_1, 60)]);
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 1);
}

#[test]
fn an_empty_pad_or_a_picker_under_a_held_step_adds_nothing() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.synth_on(1);

    // An empty pad sounds nothing and selects nothing, and the step's release enters nothing.
    rig.press(10, Button::Step(0));
    rig.hit(20, 2, 100);
    rig.release(30, 2);
    rig.let_go(40, Button::Step(0));
    rig.step(50);
    assert_eq!(rig.sent(), []);
    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(rig.track().selected_pad, Some(0));

    // KEYS mode with the empty pad 3 selected: a key is the last key and adds nothing.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    rig.hit(10, 2, 100);
    rig.release(20, 2);
    rig.tap(30, Button::PadsKeys);
    rig.press(40, Button::Step(0));
    rig.hit(50, 0, 100);
    rig.release(60, 0);
    rig.let_go(70, Button::Step(0));
    rig.step(80);
    assert_eq!(rig.track().selected_sound, None);
    assert_eq!(rig.track().last_key, Some(60));
    assert_eq!(rig.sent(), []);
    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(versions(&mut rig), []);

    // With the sound picker open a hit only plays.
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    rig.menu(0, 2);
    rig.press(10, Button::Step(0));
    rig.tap(20, Button::Ok);
    rig.hit(30, 1, 100);
    rig.step(40);
    assert!(matches!(rig.control.view.picker, Some((Picker::Sound, _))));
    assert_eq!(rig.sent(), [message(0, 30, note_on(0, 0, syn_2, 60, 100))]);
    assert_eq!(notes_in(&rig, track_1(&rig)), []);
    assert_eq!(versions(&mut rig), []);
    assert_eq!(rig.track().selected_pad, Some(0));
}

#[test]
fn a_hit_under_a_held_step_removes_but_does_not_add_under_the_reserve() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    // Syn 1's note shares Syn 2's block, so the removal copies it.
    put(
        &mut rig,
        0,
        0,
        &[entered(0, syn_2, 60), entered(8, syn_1, 60)],
    );
    rig.press(10, Button::Step(0));
    rig.press(11, Button::Step(2));
    rig.step(20);
    fill_until(&rig, RESERVE - 1);

    rig.hit(30, 1, 100);
    rig.step(40);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(8, syn_1, 60)]);
    assert_eq!(on_tracks(&rig, syn_2), [0; 4]);
    assert_eq!(versions(&mut rig).len(), 1);
    assert!(shows_frame(
        &rig.control,
        &drawn(
            &step_header("Syn 1"),
            Some(("Not enough memory", RECORD)),
            |_| {},
            &[None; 4],
        )
    ));
}

#[test]
fn sixteen_held_steps_send_one_version() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    rig.synth_on(0);
    let syn_2 = rig.synth_on(1);
    for step in 0..16 {
        rig.press(10 + u64::from(step), Button::Step(step));
    }

    rig.hit(30, 1, 100);
    rig.step(40);

    assert_eq!(
        notes_in(&rig, track_1(&rig)),
        (0..16).map(|at| entered(at, syn_2, 60)).collect::<Vec<_>>()
    );
    assert_eq!(on_tracks(&rig, syn_2), [16, 0, 0, 0]);
    let sent = versions(&mut rig);
    assert_eq!(sent.len(), 1);
    assert!(sent.len() <= MAX_VERSIONS_PER_EVENT);
    // Every tree between the track's and the final one is free, and the final one has one block.
    rig.applied(sent[0].number, 50);
    assert_eq!(ready(&rig), NOTE_BLOCKS - 1);
}

#[test]
fn a_midi_key_under_a_held_step_spoils_the_steps_tap() {
    let queue = Queue::new();
    let mut rig = Rig::new(&queue);
    let syn_1 = rig.synth_on(0);
    rig.tap(0, Button::PadsKeys);
    rig.press(10, Button::Step(0));
    rig.note_on(20, 60, 100);
    rig.note_off(30, 60);
    // A quick release, within HOLD.
    rig.let_go(40, Button::Step(0));

    rig.step(50);

    assert_eq!(notes_in(&rig, track_1(&rig)), [entered(0, syn_1, 60)]);
    assert_eq!(on_tracks(&rig, syn_1), [1, 0, 0, 0]);
    assert_eq!(versions(&mut rig).len(), 1);
}
