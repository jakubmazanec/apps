//! STEP's lanes and the notes each track's sounds have: the data under STEP's main area.

use super::pattern::{count, entered, put};
use super::timing::{choose, on_bars};
use super::*;
use crate::control::lanes::Lane;

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
