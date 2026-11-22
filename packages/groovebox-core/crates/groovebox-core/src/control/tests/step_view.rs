//! STEP's lanes and the notes each track's sounds have, and its view of them: the data under STEP's
//! main area.

use super::pattern::{count, entered, put};
use super::timing::{choose, on_bars, playing_4_bars};
use super::*;
use crate::control::lanes::Lane;
use crate::control::step_view::{GRID_CELLS, LANES_SHOWN};
use crate::control::view::StepCursor;
use crate::project::FOUR_FOUR;
use crate::project::pool::{Engine, Sample};
use crate::storage::Path;
use crate::store::note::Note;
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
