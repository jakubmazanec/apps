# Groovebox STEP View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 3 of 4 for Milestone 3 ("A looping pattern"). Plan 1 is playing a pattern
(`2026-11-19-groovebox-playing-a-pattern.md`), plan 2 timing and bars
(`2026-11-20-groovebox-timing-and-bars.md`), plan 4 mix, mute and track effects. This plan is
written against plan 2's code, which is built.

**Goal:** STEP shows the pattern: a lane for each pad of the current track and for each sound that
has notes on it but sits on no pad, their notes in pages of 16 cells as the step buttons show them,
the bar lines, beats, dark cells, the shown page, the music and the cursor. The arrows move the
cursor over the cells and the lanes, select the lane's sound, scroll the view and stop following. OK
adds a note on an empty cell and CANCEL removes a cell's notes. Holding steps shows the NOTE strip,
whose encoders change the held notes' pitch, velocity, length and position, and pads or keys hit
under a held step add or remove their sound or pitch there.

**Architecture:**

- **The cursor's lane is the selection's.** Lanes are worked out from the current track's pads, the
  pool and a count of each sound's notes on each track of the current pattern. The selected pad's
  lane, or the selected sound's extra lane, is the cursor's lane, so pads, T1 to T4 and POOL move it
  with no state of their own; STEP keeps only its view (first column, first lane).
- **The view is in cells.** Each bar takes as many pages of 16 cells as its sixteenths need; a cell
  past a bar's end is dark. The cursor's cell comes from its bar (the bar playing while following)
  and its sixteenth. After every event and every step the view moves by whole beats, or rows, to
  keep the cursor's cell off the screen's edges.
- **The picture reads a cache.** `draw` has no note memory, so `step` notes what the visible cells
  hold (`Mark`s) and what the held steps' notes are (`Held`), as it already notes `step_notes`.
  Decisions during events read the note memory itself.
- **Held steps keep where their notes are.** Each step remembers the bar and sixteenth it showed at
  its press; POSITION moves that place with the notes, so the edit follows them. A turn removes the
  held notes from the track's tree and inserts the changed ones read from the old tree, which the
  track still holds, so no buffer is needed.

**Tech Stack:** as before: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md) is the main spec: "STEP and ROLL"
  (The view, The cursor, Following the music, Markings on both screens), "STEP" (Lanes, Cells),
  "Entering and editing notes" (The step buttons, What a step-entered note gets, The NOTE strip, The
  cursor on cells, Note values), "Controls and bindings", "Testing".
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The rules every screen is drawn by",
  "Colour", "The strip", "STEP"; `step-stopped.png`, `step-playing.png`, `step-7-8.png`,
  `step-5-4.png`, `note-strip.png`.
- The Look rig's `drawStep` and `drawNoteStrip`, the drawing code of the approved pictures (outside
  the repo by the owner's choice):
  `C:\Users\Jakub\AppData\Local\Temp\claude\D--projects-apps\acb4db09-8c01-482d-9418-b85e6f948e54\scratchpad\redraw\rig\groovebox-screens.html`.
  S4 to S7 copy its geometry.
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "What every screen shows" (the
  strip under STEP), "An empty pad", "POOL".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "Counting memory" (step
  entry under the reserve).
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- Research for answer 5, with every URL:
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\b1af03b2-77a0-4f55-ab53-520818956f2b\scratchpad\note-length-research.md`.
  The EP-133 guide (saved for plan 1 under
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\9118a0fc-20da-4a21-9883-27f2a051918e\scratchpad\ep133txt\`)
  gives a note's duration from one tick to one bar, changed for all notes of a step together.

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point                                     | Answer (2026-11-22)                                                                                                                                                                          |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A selected sound on no pad, with no notes | It gets an extra lane at once, with the cursor on it and its name selected. It stays once it has notes; with none it goes when another lane is selected                                      |
| 2   | An empty pad selected (overview)          | Its dim number shows as selected, in the accent block with black text, so the block always marks the cursor's lane                                                                           |
| 3   | A note's LENGTH limits (overview)         | From one SHIFT click (30 ticks, a sixteenth of a step) to one bar, as on the EP-133                                                                                                          |
| 4   | Counted or smooth (overview)              | PITCH one semitone a click and VELOCITY one a click, with SHIFT too, as every counted value                                                                                                  |
| 5   | How LENGTH reads                          | The shortened fraction of a whole note: 1/16, 1/8, 3/16, 1/4 to 1/1, 2/1 in an 8/4 bar; lengths between steps in 256ths (17/256). Keeps `note-strip.png`, and triplet grids later stay exact |

### Settled by the specs, the pictures, the rig or the code

| #   | Point                    | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Lanes                    | The 12 pad lanes in pad order, then the extra lanes in pool order: every sound on none of the track's pads with notes on the current pattern's track, and the selected sound while it sits on none of them (answer 1). `Sound.on_tracks` counts each sound's notes on each track of the current pattern, beside `Sound.notes`; every note added or removed goes through `counted`. Milestone 5 recounts it when the pattern changes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S2  | The cursor's lane        | The selected pad's lane, or the selected sound's extra lane (Workflow B: up and down select the lane's sound; a pad hit and T1 to T4 move the cursor to the selection). It has no state of its own: STEP keeps only its first lane and first column (Workflow B: STEP keeps its own row)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3  | Labels                   | A pad lane: its sound's name, red when the sample is missing; "= pad 1" dim when an earlier pad holds the same sound (a copy lane: its notes show in that first lane, Workflow B); an empty pad's number, dim. An extra lane: its sound's name, red when missing. A label past 12 characters ends in "…" (71 px, `text::fit`) and never scrolls. The accent block with the label in the background colour marks the cursor's lane, so also a selected copy lane's "= pad 1" and a selected empty pad's number (answer 2)                                                                                                                                                                                                                                                                                                                                       |
| S4  | Columns                  | The names column is 3 px, the widest label of all the track's lanes (those scrolled away too, so the grid never moves while the view scrolls), 3 px. The grid takes `columns = (480 - 2 - names - 2) / 8` whole cells and ends at x 478: its left line is at `478 - 8 * columns` (the rig's `cells` and `gridX`). A new project's labels "1" to "12" make the column 17 px, 57 cells from x 22; 12-character names make 49. At most 58 (`GRID_CELLS`). Lanes are 13 px with 1 px gaps from y 17, lane `k` at `17 + 14 * k`; 16 fit (`LANES_SHOWN`)                                                                                                                                                                                                                                                                                                             |
| S5  | The grid                 | A bar takes `pages * 16` cells, `pages = ceil(sixteenths / 16)`; its cells from its sixteenths on are dark. Over the shown lanes' height (the rig's `blockH`): dark cells filled faint, the cells of the page the step buttons show tinted (`SHOWN`). At each shown cell's left edge and at the edge after the last shown cell, a line by what starts there: line grey at a bar's start, faint at a beat (every 4 cells in x/4, 2 in x/8) or a page start of a used cell, none elsewhere (none on a dark cell). Lane separators faint above each lane but the first, line grey above the first extra lane, from x 1 to the grid's right end. Nothing past the pattern's end: the line where its next bar would start closes the grid (Look: no fills except where they carry meaning)                                                                          |
| S6  | Notes on STEP            | A cell shows the notes of its lane's sound that start in its sixteenth (none on a copy lane or an empty pad's lane): a 5 by 11 px block at the cell's left line + 2, the lane's top + 1, in the grey of the loudest (soft below 60, mid 60 to 99, loud 100 and up); a 2 px tail from the block's right edge at the lane's top + 5, `(longest - 480) * 8 / 480` px long rounded down, cut at the grid's last shown cell; a count from 2 to 9 as a digit in the background colour, centred on the block; 10 and more show none, as in the rig (two digits do not fit). The off-grid shift comes with recording (Milestone 4): nothing makes such a note before it                                                                                                                                                                                                |
| S7  | The music and the cursor | While playing, a 1 px text-colour line over the shown lanes at `x = left line of the music's cell + (ticks into its sixteenth) * 8 / 480`, rounded down, where the music is (`player.at`) and only when that cell shows; `step` redraws when that x changes while STEP shows, as it does for the header's bars. The cursor: an accent outline 9 by 15 px from the cell's left line and the lane's top - 1 (the rig), shown only when its cell and lane show                                                                                                                                                                                                                                                                                                                                                                                                    |
| S8  | Keeping the cursor shown | After every event and at the end of every step (following moves the cursor's bar with no event): when the cursor's cell is on or past the last shown column and cells follow, the view moves right by whole beats until the cell is before the last column; when it is on or before the first column and cells precede, left by whole beats until it is after it. Lanes the same, one lane at a time. The view never starts before the first cell or lane and never ends past the last (a pattern narrower than the grid starts at its first cell). A jump moves it in one go, by as many beats or lanes as it needs                                                                                                                                                                                                                                           |
| S9  | The arrows on STEP       | Left and right: one sixteenth (the grid step), over dark cells into the next or previous bar, stopping at the pattern's first and last sixteenth. SHIFT + left or right: 16 cells, a page, to the same place on that page or its last sixteenth where it is shorter; a jump that would leave the pattern does nothing. Up and down: one lane, SHIFT 12, stopping at the first and last lane; a pad lane is selected as a pad hit selects it (`Track::select`), an extra lane's sound on no pad (`Track::select_sound`). An arrow starts from the cursor as shown at its press (the bar playing while following and playing); one that moves it into another bar stops following, and the cursor keeps that bar. Repeats and PADS/KEYS + up or down are built                                                                                                   |
| S10 | OK on a cell             | On STEP with no picker or question: on the cursor's cell (the bar shown at the press, its sixteenth, its lane) with no note of the lane's sound starting there, the note a step's tap enters (pitch by pad mode, velocity 127, a sixteenth, no curve), refused under the reserve with "Not enough memory" in red. With notes there it does nothing until the NOTE panel (Milestone 4); on an empty pad's lane nothing                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S11 | CANCEL on a cell         | A tap of CANCEL on STEP with no picker or question removes the notes of the lane's sound that start in the cell the cursor showed at CANCEL's press (as a step's tap, plan 2's S17), whatever their pitch; a removal may use the reserve. An empty cell: nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| S12 | Held steps and the strip | A held step is a step held and not taken whose sixteenth, the one it showed at its press (`pressed`), lies inside the bar. While one is held the strip is the NOTE strip, from the press, unless TEMPO was pressed before it (the first pressed counts, as MENU and PAGE). Its items are PITCH, VELOCITY, LENGTH and POSITION on encoders 1 to 4, for the selected sound's notes in the held steps' sixteenths; with none, or no selected sound, the strip is empty. A turn changes them and moves no cursor (the overview's "encoder whose item is not on the screen", as plan 2's S5 for TEMPO); a push does nothing. Letting go brings back the sound's page                                                                                                                                                                                                |
| S13 | The NOTE strip's values  | PITCH by the Root note's names (`Curve::Count`, `Unit::Note`: "C3"), 0 to 127; VELOCITY 1 to 127; both one a click, SHIFT too (answer 4). LENGTH 30 ticks to the signature's bar (answer 3), 480 a click, 30 with SHIFT, written as answer 5: 480 "1/16", 1,440 "3/16", 510 "17/256", 7,680 "1/1", 15,360 "2/1". POSITION: how many grid steps the notes lie from the sixteenth their step showed at its press, "+0", "+1", "−2" (the parameters' minus, U+2212), one a click, SHIFT too. Where held notes differ, the lowest and highest joined by an en dash: "C3–E3", "60–100", "1/16–1/8", "−1–+2". Bars: a single PITCH or VELOCITY fills by its place (value of 127); a range, LENGTH and POSITION show the bare track (`note-strip.png`)                                                                                                                |
| S14 | A turn on held notes     | Every held note moves by the same amount. VELOCITY and LENGTH stop note by note at their ends, as on Maschine (research). PITCH and POSITION move the notes together and stop where the first reaches its end, so no two held notes land on one key, where one would replace the other. POSITION moves through the bars' grid positions in order, over dark cells, between the pattern's first and last; each held step then stands for the sixteenth its notes moved to and edits every note of the sound there (Workflow B: the edit follows the note). A moved note replaces a note of the same sound and pitch where it lands, as recording replaces notes in the same place (Workflow B, "Testing"). Under the reserve a turn changes nothing and says "Not enough memory" in red (step entry, Project model)                                             |
| S15 | A held step and a hit    | With no picker or question open, a pad hit or a key under held steps adds or removes on each held step on its own: in PADS mode the pad's sound (its notes in the sixteenth removed, or a note at its unchanged pitch added), in KEYS mode the selected sound at the key's pitch (its notes of that pitch removed, or one added); an add is a step-entered note, refused under the reserve with "Not enough memory" while removals on the other held steps go ahead. All of it is one new tree and one version, as an event sends at most `MAX_VERSIONS_PER_EVENT` (4). The pad or key sounds as usual, selects nothing and moves no cursor; a key is still the last key played, as every key is. An empty pad, or KEYS mode with no selected sound, sounds nothing and adds nothing. The step's release is then no tap (built: a hit marks held buttons used) |
| S16 | Where a step acts        | A step's tap acts on the bar and sixteenth it showed at its press (`pressed`, which takes the place of `pressed_bars`); the cursor still moves to it at the tap (plan 1's S5). A step pressed past the bar's end does nothing, also held                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S17 | Old pictures             | Tests that drew STEP over an empty main area compare the picture outside the main area (`shows_frame`); STEP's own tests check the main area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Overview open points this plan settles

Task 1 writes these into the specs they belong to and takes them out of the overview's "Open points
for planning": "A note's LENGTH limits" (answer 3), "Counted or smooth" (answer 4), the STEP part of
"An empty pad selected" (answer 2; what OK does and where ROLL opens stay for Milestone 4) and the
NOTE strip's part of "An encoder whose item is not on the screen" (S12; ROLL's stays for Milestone
4).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Float functions come
  from `libm`; no fused multiply-add; no logic depends on pointer size. Code under the `harness`
  feature and `cfg(test)` may use `std`.
- 48 kHz; the core's own 32-sample chunks. Time: 1,920 ticks a beat, 480 a sixteenth, 7,680 a whole
  note; a bar is `Signature::bar_ticks`.
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds. Plan 2 ended at
  2,020,472 bytes; this plan adds about 22 KB (`Sound.on_tracks` is 16 bytes for each of 1,024
  sounds, the marks about 6 KB). If it outgrows the budget, report the size and stop: the budget is
  the owner's.
- Note memory rules as before: the audio part never waits and never writes note memory; the control
  part writes only blocks no version it sent can reach; a new tree is held before the one it
  replaces is let go (`next_removal`'s order).
- Look's rules as before (monogram, 13 px rows, the cursor 1 px outside, mixed case, "…" for what
  does not fit). Colours are the palette's named entries.
- Repo rules (as before): never hand-edit Carson "DO NOT EDIT" files; never remove comments; inline
  variables and functions used only once; no em-dashes and no Oxford commas in copy, docs or
  commits; commit messages in imperative sentence case without prefixes; never mention Claude,
  Claude Code or Anthropic; never use `git stash`; no new dependency.
- Run only the focused tests and checks a task names; CI runs the full suite.
  - Rust: from `packages/groovebox-core`, `cargo test -p <crate> ...` and
    `cargo clippy --workspace --all-targets -- --deny warnings`.
  - Drift tests need both `.wasm` builds first: `node build.js && node build.js --fallback`, and run
    with `-- --test-threads=1`.
  - From Task 4 on, every scene's STEP frames change; Task 8 re-blesses every scene once. Tasks 2 to
    7 do not run the drift tests.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **A lane that comes or goes under the cursor.** Removing the last note of an extra lane's sound,
   swapping a pad's sound, deleting a sound on POOL, T1 to T4 and a sound selected on POOL must
   leave the cursor on the selection's lane and the view showing it. Pinned in Task 2
   (`the_cursor_follows_the_selection_when_lanes_come_and_go`) and Task 3
   (`the_view_keeps_the_cursor_after_a_lane_goes`).
2. **Moving neighbouring held steps.** POSITION on held steps 1 and 2 must move each note once,
   never let a held note replace another held note, and replace only an outside note of the same
   sound and pitch, its counts dropping. Pinned in Task 6
   (`moving_neighbouring_held_steps_moves_each_note_once`, `a_moved_note_replaces_one_it_lands_on`).
3. **Arrows while following.** An arrow while playing starts from the bar playing; one into another
   bar stops following and keeps that bar; up, down and a move within the bar keep following; the
   view goes along at each bar line. Pinned in Task 5 (`an_arrow_starts_from_the_bar_playing`,
   `an_arrow_into_another_bar_stops_following`) and Task 3
   (`following_moves_the_view_at_the_bar_line`).
4. **Long and short bars.** No arrow lands on a dark cell; 5/4's page jumps keep the place or take
   the short page's last sixteenth; 16/4's four pages; the view stops at the pattern's end. Pinned
   in Task 5 (`left_and_right_skip_dark_cells_and_stop_at_the_ends`,
   `shift_jumps_a_page_and_takes_the_short_pages_last_sixteenth`) and Task 3
   (`the_view_stops_at_the_patterns_end`).
5. **Note memory nearly full.** OK, a hit under a held step that adds and a NOTE strip turn must
   refuse with "Not enough memory" under the reserve and change nothing, while CANCEL and removing
   hits still work. Pinned in Task 5 (`ok_and_cancel_under_the_reserve`) and Task 6
   (`a_turn_under_the_reserve_changes_nothing`) and Task 7
   (`a_hit_under_a_held_step_removes_but_does_not_add_under_the_reserve`).

## Not in this plan

- **Plan 4:** mutes and their header mark, levels, MIX, effects.
- **Milestone 4:** ROLL; the NOTE panel and OK on a cell with notes; CANCEL or COPY held with a pad,
  a key, a track or a step, and two hold buttons at once; recording, quantize and notes off the grid
  (their shift on STEP and their POSITION); undo.
- **Milestone 5:** recounting `Sound.on_tracks` when the pattern changes; SHIFT + step and its
  lights; saving the view.
- **Later:** a changeable GRID (cells of other widths, dark buttons for coarse grids).

## Shared formats

### Counts (`src/project/pool.rs`)

```rust
pub struct Sound {
    // ...as before, then:
    /// Its notes on each track of the current pattern (S1).
    pub on_tracks: [u32; 4],
}
```

### Lanes (`src/control/lanes.rs`, new)

```rust
/// A lane of STEP (S1). Copy, Eq, Debug.
pub enum Lane { Pad(u8), Extra(SoundNumber) }

impl Control {
    /// The current track's lanes: its 12 pads, then its extra lanes in pool order.
    pub(super) fn lanes(&self) -> impl Iterator<Item = Lane> + '_;
    /// The cursor's lane, counted from 0 (S2).
    pub(super) fn cursor_lane(&self) -> usize;
    /// The sound whose notes a lane shows and enters: a pad's sound or the extra lane's.
    pub(super) fn lane_sound(&self, lane: Lane) -> Option<SoundNumber>;
    /// The earlier pad holding the same sound, for a copy lane.
    pub(super) fn copy_of(&self, pad: u8) -> Option<u8>;
    /// `change` notes of `sound` were added (or removed, below 0) on `track` of `pattern`.
    pub(super) fn counted(&mut self, pattern: u8, track: u8, sound: SoundNumber, change: i32);
}
```

### The view (`src/control/step_view.rs`, new; `src/control/view.rs`)

```rust
pub const LANES_SHOWN: usize = 16;
pub const GRID_CELLS: usize = 58;

/// STEP's view (S8): the first column and the first lane it shows. In `View` as `step_view`. Copy,
/// Eq.
pub struct StepView { pub first_cell: u32, pub first_lane: usize }

/// The cell of `place`: (bar * pages + sixteenth / 16) * 16 + sixteenth % 16.
pub fn cell_of(place: StepCursor, signature: Signature) -> u32;
/// The place of a cell, none for a dark one.
pub fn place_of(cell: u32, signature: Signature) -> Option<StepCursor>;
/// A pattern's cells: bars * pages * 16.
pub fn cells(bars: u16, signature: Signature) -> u32;
/// The first shown index once `cursor` must show, `visible` showing from `first`, moving `by`
/// at a time within `total` (S8).
pub fn kept(cursor: u32, first: u32, visible: u32, by: u32, total: u32) -> u32;

impl Control {
    /// The names column's width and the grid's columns (S4).
    pub(super) fn step_columns(&self) -> (i32, u32);
    /// Moves STEP's view so the cursor's cell at `sample` shows (S8).
    pub(super) fn keep_step_view(&mut self, sample: u64);
}
```

`StepCursor` (plan 1) is the place type: `{ bar: u16, step: u8 }`, the step being the sixteenth from
the bar's start.

### The picture (`src/ui/step.rs`, new)

```rust
/// What a cell shows (S6). Copy, Eq, Debug.
pub struct Mark { pub velocity: u8, pub count: u8, pub tail: u16 }

pub struct LaneView<'a> { pub label: &'a str, pub color: Color, pub selected: bool }

/// STEP's main area as `draw_step` draws it.
pub struct StepPicture<'a> {
    pub lanes: &'a [LaneView<'a>],        // the shown ones, at most LANES_SHOWN
    pub names: i32,                        // the names column's width
    pub columns: u32,
    pub first_cell: u32,
    pub cells: u32,                        // the pattern's
    pub signature: Signature,
    pub shown_page: u32,                   // the page the step buttons show, counted over the pattern
    pub first_extra: Option<usize>,        // the shown index of the first extra lane
    pub marks: &'a [[Option<Mark>; GRID_CELLS]],
    pub cursor: Option<(usize, u32)>,      // shown lane and column
    pub music: Option<i32>,                // the line's x
}

pub fn draw_step(canvas: &mut impl Canvas, picture: &StepPicture);
```

### Held steps (`src/control/held.rs`, new; `src/control/pages.rs`)

```rust
ItemKind::NotePitch, ItemKind::NoteVelocity, ItemKind::NoteLength, ItemKind::NotePosition
pub(super) const NOTE: [ItemDef; 4];   // on encoders 0 to 3

/// The held steps' notes as the strip shows them (S13): lowest and highest. Copy, Eq.
pub struct Held { pub pitch: (u8, u8), pub velocity: (u8, u8), pub length: (u32, u32), pub position: (i32, i32) }

impl Control {
    /// The held steps (S12), each with where its notes lie now.
    pub(super) fn held_steps(&self) -> impl Iterator<Item = (u8, StepCursor)> + '_;
    /// A turn of `clicks` on a NOTE item (S13, S14).
    pub(super) fn turn_held(&mut self, kind: ItemKind, clicks: i32, sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>, store: &mut Store<'_>);
    /// A hit under held steps (S15): `sound` at `pitch`, or `None` for an empty pad.
    pub(super) fn toggle_held(&mut self, sound: Option<SoundNumber>, pitch: u8, sample: u64,
        versions: &mut Producer<'_, Version, VERSION_QUEUE>, store: &mut Store<'_>);
}

/// A length as answer 5 writes it.
pub fn write_length(ticks: u32, out: &mut impl core::fmt::Write) -> core::fmt::Result;
```

### One cell's notes (`src/control/steps.rs`)

```rust
impl Control {
    /// `tree` without the notes of `sound` that start in the sixteenth of `place`, of `pitch` or of
    /// every pitch, and how many went, each off its counts.
    pub(super) fn cleared(&mut self, tree: Tree, place: StepCursor, sound: SoundNumber,
        pitch: Option<u8>, store: &mut Store<'_>) -> (Tree, u32);
    /// `tree` with a step-entered note of `sound` at `pitch` at the start of the sixteenth of
    /// `place` (a sixteenth long, velocity 127, no curve), counted.
    pub(super) fn added(&mut self, tree: Tree, place: StepCursor, sound: SoundNumber, pitch: u8,
        store: &mut Store<'_>) -> Tree;
    /// The pitch a step-entered note of `sound` gets: unchanged in PADS mode, the last key or the
    /// octave's C in KEYS mode.
    pub(super) fn entry_pitch(&self, sound: &Sound) -> u8;
}
```

Both hold the tree they make before letting go of the one they got, unless that one is the track's
(the order of `next_removal`). The caller checks the reserve before an add, chains them into one
tree, passes it to `edit` once and then lets go of it, as `next_removal` does. `tap_step`, OK,
CANCEL and `toggle_held` all use them.

`Control` gains `pressed: [StepCursor; 16]` (in place of `pressed_bars`), `held: [StepCursor; 16]`,
`cancel_at: StepCursor`, `marks: [[Option<Mark>; GRID_CELLS]; LANES_SHOWN]` and
`held_values: Option<Held>`.

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `project/pool.rs`: modify (Task 2).
- `control/lanes.rs`: create (Task 2). `control/step_view.rs`: create (Task 3). `control/held.rs`:
  create (Tasks 6, 7). `ui/step.rs`: create (Task 4); `ui/mod.rs`: modify.
- `control/mod.rs`, `control/view.rs`, `control/draw.rs`, `control/steps.rs`, `control/bars.rs`,
  `control/pool.rs`, `control/pages.rs`: modify (Tasks 2 to 7).
- `control/tests/step_view.rs`: create (Task 2 on); `control/tests.rs`, `control/tests/pattern.rs`:
  modify (the module, `shows_frame`, `put` counting).

**`packages/groovebox-core/scenes/`:** create `step-view.scene`, re-bless all (Task 8).

**`apps/groovebox/`:** `source/gallery/states.ts`, `tests/gallery.test.ts`: modify (Task 8).

**Repo root:** `.changeset/groovebox-step-view.md`: create (Task 8). The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-05-groovebox-workflow-b-design.md`, `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Overview:** "Open points for planning" as listed above.
- **Workflow B:** "Lanes": answer 1, S1's count per track and S3's copy lane. "The cursor": S2, S8,
  S9. "The cursor on cells": S10, S11. "The step buttons": S15, S16. "The NOTE strip": S12 to S14
  with answers 3 to 5.
- **Look:** "STEP": S3's block (answer 2), S4's widest label of all lanes, S5's end of the grid,
  S6's count of 10 and more. "The strip": S13's ranges and bars.

- [ ] **Step 1: Edit the three specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the STEP view decisions in the groovebox specs"`

---

### Task 2: Lanes and each track's note counts

**Files:**

- Modify: `src/project/pool.rs` (`on_tracks`, zero in `UNUSED`, `new_synth`, `new_sample` and
  `copy`), `src/control/steps.rs` and `src/control/bars.rs` (their counting goes through `counted`),
  `src/control/mod.rs` (`mod lanes`), `src/control/tests.rs` (`mod step_view`),
  `src/control/tests/pattern.rs` (`put` counts through `counted`).
- Create: `src/control/lanes.rs`, `src/control/tests/step_view.rs`.

**Interfaces:**

- **Produces:** `Sound.on_tracks`, `Lane`, `lanes`, `cursor_lane`, `lane_sound`, `copy_of`,
  `counted` (Shared formats). `counted` changes `notes` always and `on_tracks[track]` when `pattern`
  is the current one.

- [ ] **Step 1: Write the failing tests**

```rust
// project/pool.rs
#[test] fn a_copy_has_no_notes_on_any_track() {
    // a sound with notes 3 and on_tracks [1, 2, 0, 0]; its copy has 0 and [0; 4]
}

// control/tests/step_view.rs
#[test] fn a_new_track_has_12_empty_pad_lanes_and_the_cursor_on_pad_1() {
    // lanes() == [Pad(0) .. Pad(11)], cursor_lane() == 0, lane_sound(Pad(3)) == None
}
#[test] fn a_sound_on_two_pads_has_a_copy_lane() {
    // Syn 1 on pads 1 and 12: copy_of(11) == Some(0), copy_of(0) == None
}
#[test] fn a_sound_with_notes_on_no_pad_has_an_extra_lane_in_pool_order() {
    // Syn 1, Syn 2, Syn 3 made; Syn 3 then Syn 1 get a tap of step 1 on pad 1, each swapped off
    // the pad (sound picker) for Syn 2: lanes() ends [Extra(Syn 1), Extra(Syn 3)]; on T2 there are
    // none; on_tracks of Syn 1 == [1, 0, 0, 0]
}
#[test] fn the_selected_sound_on_no_pad_has_a_lane_until_another_is_selected() {
    // answer 1: Syn 1 on no pad, no notes, selected on POOL: lanes() ends [Extra(Syn 1)] and
    // cursor_lane() == 12; a hit of pad 1 selects it: no extra lane, cursor_lane() == 0
}
#[test] fn counts_follow_taps_trims_and_deletes() {
    // taps of steps 1 and 5 on Syn 1: notes 2, on_tracks[0] 2; a tap of step 5 again: 1;
    // LENGTH 4 bars, a tap in bar 3, LENGTH 1 bar and OK: back to 1; POOL DELETE of Syn 1: gone
}
#[test] fn the_cursor_follows_the_selection_when_lanes_come_and_go() {
    // Review Focus 1: Syn 1 with notes on no pad (lane 12), Syn 2 with one note on no pad (lane
    // 13) selected on POOL: cursor_lane() == 13; a tap of step 1 removes Syn 2's note and Syn 2
    // keeps its lane, being selected; T2 then T1: cursor_lane() is the selection's each time;
    // POOL DELETE of Syn 1: cursor_lane() == 12, Syn 2's lane
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib project::pool control::tests::step_view`. Expected: FAIL
  to compile.

- [ ] **Step 3: Implement `on_tracks`, `counted` and the lanes**

  `lanes` chains `Lane::Pad(0..12)` with the pool's sounds that sit on none of the track's pads and
  have `on_tracks[track] > 0` or are the track's selected sound with no selected pad. `cursor_lane`
  is `selected_pad` or 12 plus the selected sound's place among the extra lanes.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Count each groovebox sound's notes per track and work out STEP's lanes"`

---

### Task 3: The view in cells

**Files:**

- Create: `src/control/step_view.rs`.
- Modify: `src/control/view.rs` (`View.step_view: StepView`, starting at 0 and 0),
  `src/control/mod.rs` (`mod step_view`; `step` calls `keep_step_view(sample)` after each event,
  beside `keep_cursor`, and `keep_step_view(until)` before it returns),
  `src/control/tests/step_view.rs`.

**Interfaces:**

- **Consumes:** Task 2's `lanes` and `cursor_lane`; plan 2's `shown_bar`.
- **Produces:** `cell_of`, `place_of`, `cells`, `kept`, `LANES_SHOWN`, `GRID_CELLS`, `StepView`,
  `step_columns`, `keep_step_view` (Shared formats). `kept` for columns takes `by` = the beat in
  cells, for lanes 1.

- [ ] **Step 1: Write the failing tests**

```rust
// control/step_view.rs
#[test] fn cells_count_pages_of_16_and_dark_cells() {
    let five_four = Signature { beats: 5, unit: 4 };
    assert_eq!(cell_of(StepCursor { bar: 1, step: 3 }, five_four), 35);
    assert_eq!(cell_of(StepCursor { bar: 0, step: 19 }, five_four), 19);
    assert_eq!(place_of(20, five_four), None);   // the short page's dark cells
    assert_eq!(place_of(32, five_four), Some(StepCursor { bar: 1, step: 0 }));
    assert_eq!(cells(4, five_four), 128);
    assert_eq!(cells(2, Signature { beats: 16, unit: 4 }), 128);
    assert_eq!(place_of(12, Signature { beats: 3, unit: 4 }), None);
}
#[test] fn the_view_moves_a_beat_when_the_cursor_reaches_an_edge() {
    assert_eq!(kept(47, 0, 49, 4, 64), 0);
    assert_eq!(kept(48, 0, 49, 4, 64), 4);    // on the last column: one beat
    assert_eq!(kept(4, 4, 49, 4, 64), 0);     // on the first, cells before: one beat back
    assert_eq!(kept(60, 0, 49, 4, 64), 15);   // a jump, held at the end
    assert_eq!(kept(63, 15, 49, 4, 64), 15);  // the last cell may sit on the last column
    assert_eq!(kept(10, 0, 57, 4, 16), 0);    // a pattern narrower than the grid
    assert_eq!(kept(15, 0, 16, 1, 20), 1);    // lanes, one at a time
}

// control/tests/step_view.rs
#[test] fn the_columns_follow_the_widest_label() {
    // a new project: step_columns() == (17, 57); a sound named "Žluťoučký kůň" on pad 2: (77, 49)
}
#[test] fn the_view_stops_at_the_patterns_end() {
    // Review Focus 4: 4/4, 4 bars (64 cells), 57 columns: the cursor set to (3, 15), cell 63, and
    // a step: view.step_view.first_cell == 64 - 57; in 5/4 with 4 bars the cursor on (3, 19), cell
    // 115: 60, its last page's dark cells past the screen
}
#[test] fn following_moves_the_view_at_the_bar_line() {
    // Review Focus 3: 4 bars, a sound named "Žluťoučký kůň" on pad 2 (49 columns), PLAY: first_cell
    // 0; stepped past bar 4's line (3 * 96,000 samples after PLAY at 120 BPM) the cursor's cell is
    // 48, the last column, and first_cell becomes 4; with 57 columns it stays 0
}
#[test] fn the_view_keeps_the_cursor_after_a_lane_goes() {
    // Review Focus 1: 20 extra lanes, the cursor on the last (view.step_view.first_lane 16);
    // deleting the sounds of 10 of them on POOL and coming back: first_lane keeps the cursor's
    // lane shown
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::step_view control::tests::step_view`. Expected:
  FAIL to compile.

- [ ] **Step 3: Implement the cells, `kept`, the columns and `keep_step_view`**

  `kept` moves `first` right by `ceil((cursor - (first + visible - 2)) / by)` steps of `by` when
  `cursor >= first + visible - 1` and `first + visible < total`, left by
  `ceil((first + 1 - cursor) / by)` steps when `cursor <= first` and `first > 0`, then holds it in
  `0..=total.saturating_sub(visible)`. `keep_step_view` uses the cursor's cell at `sample`
  (`shown_bar(sample)`, `view.steps.step`), the beat (`4` for x/4, `2` for x/8) and the lane count.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Keep the groovebox STEP cursor on screen in a view of cells"`

---

### Task 4: Drawing STEP

**Files:**

- Create: `src/ui/step.rs`.
- Modify: `src/ui/mod.rs`, `src/control/draw.rs` (STEP's main area, its doc comment),
  `src/control/mod.rs` (`marks`, worked out in `step` when it returns `true`; `step` also returns
  `true` when the music line's x changed while STEP shows, S7), `src/control/tests.rs`
  (`shows_frame(control, expected)`: the rows above `MAIN_TOP` and from `STRIP_LINE` on match; S17:
  the tests that drew STEP over an empty main area use it), `src/control/tests/step_view.rs`.

**Interfaces:**

- **Consumes:** Tasks 2 and 3; `text::fit`, `palette`'s named colours.
- **Produces:** `Mark`, `LaneView`, `StepPicture`, `draw_step` (Shared formats). `marks` holds the
  shown lanes' cells from `view.step_view`, row by shown lane and column by shown cell.

- [ ] **Step 1: Write the failing tests**

```rust
// ui/step.rs: pixels of draw_step on a Screen, against S4 to S7
#[test] fn a_note_is_a_block_in_its_velocitys_grey() {
    // names 17, 57 columns: a Mark { velocity: 100, count: 1, tail: 0 } in lane 0, column 0 fills
    // x 24..29, y 18..29 with NOTE_LOUD; velocity 59 is NOTE_SOFT, 60 NOTE_MID
}
#[test] fn a_long_note_has_a_tail_and_a_chord_its_count() {
    // tail 8: x 29..37 at y 22..24; count 3: the glyph "3" in BACKGROUND on the block; count 10:
    // no digit
}
#[test] fn dark_cells_the_shown_page_and_the_lines() {
    // 3/4, 2 bars, 57 columns from x 22, shown page 1: cells 12 to 15 FAINT, 16 to 27 SHOWN;
    // LINE at x 22, 150 and 278 (closing the grid); FAINT at 54, 86, 182 and 214 (beats); none at
    // x 118 (a dark cell) and nothing right of x 278
}
#[test] fn labels_the_selected_block_and_the_extra_lanes_line() {
    // a selected label: ACCENT from x 1, 3 + width + 3 wide, 13 high, text in BACKGROUND;
    // first_extra 12: LINE across y 184, FAINT across y 170
}
#[test] fn the_cursor_outline_and_the_music_line() {
    // cursor (1, 2): ACCENT outline 9 by 15 from (38, 30); music Some(41): TEXT at x 41 over the
    // lanes' height
}

// control/tests/step_view.rs
#[test] fn a_new_project_draws_12_empty_lanes_with_pad_1_selected() {
    // shows(): the header, draw_step of labels "1" to "12" dim, "1" selected (answer 2), 57
    // columns, 1 bar, shown page 0, the cursor at (0, 0) and the empty strip
}
#[test] fn lanes_show_names_copies_missing_sounds_and_notes() {
    // Syn 1 on pads 1 and 12, a missing sample sound on no pad with a note: labels "Syn 1",
    // "= pad 1" dim, the missing name RECORD after the extra lanes' line; taps of steps 1 and 2 on
    // Syn 1 and LENGTH set on a note by `put`: marks[0][0] and [0][1] as S6
}
#[test] fn the_music_line_redraws_as_it_moves() {
    // 120 BPM, a sixteenth is 6,000 samples and 8 px: after PLAY, step() to 750 samples later is
    // true (x moved 1 px), 100 more is false; on SOUND it is false
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib ui::step control::tests::step_view`. Expected: FAIL to
  compile.

- [ ] **Step 3: Implement `draw_step`, the marks and STEP's main area**

  `step` works out `marks` from the current track's tree over the shown cells' bars, matching each
  note's sound to the shown lanes' sounds (a copy lane and an empty pad's lane match none). `draw`
  builds the labels (a `Label` per shown lane), `first_extra`, the shown page
  (`cell_of(shown_bar, step) / 16`), the cursor (`cursor_lane`, the cursor's cell, when shown) and
  the music line, and calls `draw_step` where it drew nothing before.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Draw the groovebox STEP view with its lanes, grid, notes and cursor"`

---

### Task 5: The arrows, OK and CANCEL on STEP

**Files:**

- Modify: `src/control/mod.rs` (`nudge` on STEP; `press`: OK on STEP, CANCEL's `cancel_at` and a
  step's `pressed`; `release`: CANCEL's tap on STEP), `src/control/steps.rs` (`tap_step` reads
  `pressed`; the entry and removal of one cell shared with OK, CANCEL and Task 7),
  `src/control/tests/step_view.rs`.

**Interfaces:**

- **Consumes:** Tasks 2 and 3; `Track::select`, `Track::select_sound`.
- **Produces:** `Control::pressed: [StepCursor; 16]`; `cleared`, `added` and `entry_pitch` (Shared
  formats, "One cell's notes"), which `tap_step` now uses too; Task 7 uses them.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn left_and_right_skip_dark_cells_and_stop_at_the_ends() {
    // Review Focus 4: 3/4, 2 bars: right from (0, 11) lands on (1, 0); left from (0, 0) and right
    // from (1, 11) stay; held right repeats over the bar line
}
#[test] fn shift_jumps_a_page_and_takes_the_short_pages_last_sixteenth() {
    // 5/4, 2 bars: SHIFT + right from (0, 10) to (0, 19), again to (1, 3); SHIFT + left back to
    // (0, 19); from (1, 3) SHIFT + right does nothing; 16/4: four jumps cross one bar
}
#[test] fn up_and_down_select_the_lanes_sound() {
    // Syn 1 on pad 1, pad 2 empty, Syn 2 extra: down selects pad 2 (no sound; header "2" dim),
    // SHIFT + down from lane 1 lands on lane 12 (the last), selecting Syn 2 on no pad; up at lane
    // 0 stays; PADS/KEYS + up still moves the octave
}
#[test] fn an_arrow_starts_from_the_bar_playing() {
    // Review Focus 3: 4 bars, PLAY, in bar 3 a right arrow: view.steps == (2, 1), following
}
#[test] fn an_arrow_into_another_bar_stops_following() {
    // in bar 3 at step 0 a left arrow: (1, 15), following false, the header's first number "2"
    // past the next bar line; up and down keep following
}
#[test] fn ok_on_an_empty_cell_enters_and_on_notes_does_nothing() {
    // Syn 1 on pad 1, the cursor on (0, 4): OK enters a note at place 1,920, pitch 60, 127, 480,
    // published; OK again changes nothing; KEYS mode after key D4: pitch 62; an empty pad's lane:
    // nothing
}
#[test] fn cancel_removes_the_cells_notes_when_let_go() {
    // two notes of Syn 1 at (0, 4), pitches 60 and 64: a CANCEL tap removes both; a long CANCEL
    // removes nothing; a picker open: CANCEL closes it and removes nothing
}
#[test] fn ok_and_cancel_under_the_reserve() {
    // Review Focus 5: fill_until(RESERVE - 1): OK says "Not enough memory" in RECORD and enters
    // nothing; CANCEL still removes
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::step_view`. Expected: FAIL.

- [ ] **Step 3: Implement S9 to S11 and S16**

  `nudge` on STEP (no picker) starts from `StepCursor { bar: shown_bar(sample), step }`, sets
  `view.steps` to the result and clears `view.following` when the bar changed. Up and down select
  through the lane (`Lane::Pad` with `select`, `Lane::Extra` with `select_sound`).

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Move the groovebox STEP cursor with the arrows and act on cells with OK and CANCEL"`

---

### Task 6: The NOTE strip

**Files:**

- Create: `src/control/held.rs`.
- Modify: `src/control/pages.rs` (the four `ItemKind`s, `NOTE`), `src/control/mod.rs`
  (`encoder_items`: the first pressed of TEMPO and the held steps decides; the encoder turn sends
  NOTE items to `turn_held`; `change` leaves them alone; `held_values` worked out in `step` when it
  returns `true`; `press` sets `held[step] = pressed[step]`), `src/control/draw.rs` (`item_view` of
  the NOTE items from `held_values`, the strip empty while it is `None`),
  `src/control/tests/step_view.rs`.

**Interfaces:**

- **Consumes:** Task 5's `pressed`; `counted`; `param::format` of `ROOT_NOTE` for names.
- **Produces:** `NOTE`, `Held`, `held_steps`, `turn_held`, `write_length` (Shared formats).
  `turn_held` first removes the held notes from the track's tree (one `remove` per held step,
  filtered by the selected sound), then inserts each changed note read from the old tree with a
  `Cursor` (`seek`, `peek`, `advance`), holding each new tree before letting go of the one it
  replaces; each note an insert gives back goes off its counts; the result goes through `edit`.

- [ ] **Step 1: Write the failing tests**

```rust
// control/held.rs
#[test] fn lengths_read_as_shortened_fractions_of_a_whole_note() {
    // 480 "1/16", 960 "1/8", 1_440 "3/16", 510 "17/256", 30 "1/256", 7_680 "1/1", 15_360 "2/1"
}

// control/tests/step_view.rs
#[test] fn holding_a_step_shows_its_notes_on_the_note_strip() {
    // a chord of Syn 1 at step 1, pitches 48 and 52, velocity 127: while step 1 is held the strip
    // is Pitch "C3–E3" (track), Velocity "127" (Fill 127 of 127), Length "1/16" (track),
    // Position "+0" (track); letting go brings back the sound's page; an empty held step: an empty
    // strip; TEMPO pressed first: the timing strip
}
#[test] fn velocity_and_length_stop_note_by_note() {
    // velocities 120 and 60, +10: 127 and 70; lengths 480 and 7_200 in 4/4, +2: 1_440 and 7_680;
    // SHIFT -1: 1_410 and 7_650; down to 30 each
}
#[test] fn pitch_and_position_move_together_and_stop_at_the_first_end() {
    // pitches 120 and 125, +5: 122 and 127 (+2 only); positions at bar 0 steps 0 and 1 held
    // together, -3: nothing moves
}
#[test] fn moving_neighbouring_held_steps_moves_each_note_once() {
    // Review Focus 2: notes at steps 1 and 2, both held, POSITION +1: notes at steps 2 and 3, two
    // in all, Position "+1"; in 3/4 with 2 bars, notes at steps 11 and 12 held, +1: at bar 1 step
    // 12 and bar 2 step 1
}
#[test] fn a_moved_note_replaces_one_it_lands_on() {
    // Syn 1 pitch 60 at steps 1 and 3, step 1 held, +2: one note, at step 3; notes and
    // on_tracks[0] drop to 1; a note of pitch 62 at step 3 instead stays and joins the held step
}
#[test] fn the_edit_follows_the_note() {
    // step 1 held, POSITION +1, then OK on the cell (0, 0) enters a note at step 1, then VELOCITY
    // -10: the moved note at step 2 changes, the new one at step 1 does not
}
#[test] fn a_turn_under_the_reserve_changes_nothing() {
    // Review Focus 5: fill_until(RESERVE - 1): "Not enough memory" in RECORD, the notes unchanged,
    // no version sent
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::held control::tests::step_view`. Expected: FAIL
  to compile.

- [ ] **Step 3: Implement the NOTE strip (S12 to S14)**

  POSITION's place moves through `bar * sixteenths + step` grid positions; a held step's `held`
  moves by the same number. Its value is `held` minus `pressed` in grid positions.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Edit held groovebox steps' notes on the NOTE strip"`

---

### Task 7: Pads and keys under a held step

**Files:**

- Modify: `src/control/held.rs` (`toggle_held`), `src/control/mod.rs` (`hit` takes the version queue
  and the store, and under held steps with no picker or question open neither selects nor lands
  POOL's cursor and calls `toggle_held`; `input` passes them), `src/control/tests/step_view.rs`.

**Interfaces:**

- **Consumes:** `cleared`, `added` and `entry_pitch` (Task 5), `held_steps` (Task 6).
- **Produces:** `toggle_held` (Shared formats): for each held step, `cleared` of the sound (at
  `pitch` in KEYS mode, every pitch in PADS mode), and `added` where it removed nothing and the
  reserve allows; one tree, one `edit`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_pad_under_a_held_step_adds_or_removes_its_sound_there() {
    // Syn 1 on pad 1 selected, Syn 2 on pad 2: step 1 held, pad 2 hit: Syn 2's note at step 1,
    // NoteOn sent, pad 1 still selected and the cursor on lane 0; again: removed; the step's
    // release enters nothing for Syn 1
}
#[test] fn a_key_under_a_held_step_adds_or_removes_its_pitch() {
    // KEYS mode, Syn 1: steps 1 and 3 held, keys C4 and E4: both steps get both pitches; E4 again
    // removes E4 from both; last_key is E4
}
#[test] fn each_held_step_toggles_on_its_own() {
    // Syn 2 at step 1 only, steps 1 and 3 held, pad 2: removed at 1, added at 3
}
#[test] fn an_empty_pad_or_a_picker_under_a_held_step_adds_nothing() {
    // step 1 held: a hit of empty pad 3 sends nothing and changes no note; KEYS mode with pad 3
    // selected (no sound): a key adds nothing; on SOUND with step 1 held, OK on the Pad page's
    // Sound opens the sound picker, and a hit of pad 2 then only plays
}
#[test] fn a_hit_under_a_held_step_removes_but_does_not_add_under_the_reserve() {
    // Review Focus 5: Syn 2 at step 1 only, steps 1 and 3 held, fill_until(RESERVE - 1), pad 2:
    // removed at 1, nothing at 3, "Not enough memory" in RECORD, one version sent
}
#[test] fn sixteen_held_steps_send_one_version() {
    // every step of a 4/4 bar held, pad 2: 16 notes added, one version (MAX_VERSIONS_PER_EVENT)
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::step_view`. Expected: FAIL.

- [ ] **Step 3: Implement S15**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`, then
  `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

  `git commit -m "Add and remove sounds and pitches with pads and keys under held groovebox steps"`

---

### Task 8: The scene, the gallery, the changeset and a look

**Files:**

- Create: `scenes/step-view.scene`, `.changeset/groovebox-step-view.md`.
- Modify: every scene's fingerprints and frames (re-blessed),
  `apps/groovebox/source/gallery/states.ts`, `apps/groovebox/tests/gallery.test.ts`.

**What the scene does** (Workflow B's drift scene "a beat entered by steps from an empty project" is
`steps.scene`, built; this one drives the view through the panel only): Syn 1 on pad 1, Syn 2 on pad
2 and on pad 12 (a copy lane); a beat entered with steps and with OK on cells after the arrows; a
chord of three keys under a held step in KEYS mode; LENGTH 4 bars; a note lengthened to 3/16 and
moved +1 on the NOTE strip (frame while held); Syn 1 swapped off pad 1 for a new Syn 3, so Syn 1's
notes take an extra lane; PLAY and the view following over bar 3 (frame); a left arrow stopping
following (frame); STOP (frame, the stopped view); SIGNATURE 3/4, then 7/8, then 5/4 with SHIFT +
right onto the short page (a frame each). Each frame named in the scene's comments.

- [ ] **Step 1: Write `step-view.scene`**
- [ ] **Step 2: Build and re-bless**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift -- --test-threads=1`. Expected: PASS: every scene
  plays the same natively and in both `.wasm` builds. Audio fingerprints do not change (this plan
  changes no sound); a scene whose `expect-audio` changes is a bug: stop and report.

- [ ] **Step 3: The gallery**

  `states.ts` gains the new frames: "STEP stopped" (`step-stopped.png`), "STEP following"
  (`step-playing.png`), "STEP after an arrow stopped following", "NOTE strip" (`note-strip.png`),
  "STEP in 3/4", "STEP in 7/8" (`step-7-8.png`), "STEP in 5/4 on its short page" (`step-5-4.png`);
  the states whose STEP frames changed keep their titles. `gallery.test.ts` lists `step-view` among
  the scenes whose every frame has a state.

  Run, from `apps/groovebox`: `npx vitest run tests/gallery.test.ts`,
  `npx eslint source/gallery/states.ts tests/gallery.test.ts`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: The changeset**

```markdown
---
'groovebox': minor
---

Added the groovebox STEP view: lanes for every pad and for sounds with notes on no pad, the
pattern's notes in pages of 16 with the music and the cursor, arrows that select lanes and scroll,
OK and CANCEL on cells, the NOTE strip for held steps and pads or keys that add notes to a held
step.
```

- [ ] **Step 5: Run clippy and commit**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: no warnings.

  `git commit -m "Add the groovebox STEP view scene and re-bless the scenes"`

- [ ] **Step 6: The owner looks**

  Ask the owner to open the gallery and the app: each new frame beside its approved picture, and the
  view while entering a beat, following and editing a held step. Change what the owner chooses,
  re-bless as in Step 2 and commit; nothing changed: no commit.
