# Groovebox ROLL and the NOTE Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 2 of 4 for Milestone 4 ("Play it in"). Plan 1 was recording, plan 3 is undo and plan 4 erasing,
clearing and copying. This plan is written against `1ea91089`: plan 1 and the owner's answers to its
open points, built and not pushed.

**Goal:** ROLL shows every note of the current track as a piano roll, one row per pitch, each sound
in its own colour with the selected sound bright on top. Its cursor adds and removes notes of the
selected sound as STEP's does, and OK on a cell with notes, on STEP or on ROLL, opens the NOTE
panel: a box over the screen whose Pitch, Velocity, Length and Position edit that cell's notes.

**Architecture:**

- **ROLL is STEP with other rows.** It shares STEP's grid drawing (`draw_step`), the shared cursor's
  bar and sixteenth and the view's first cell. Its own state is the cursor's pitch, the top row
  shown and which track and sound it last centred on (`RollView`).
- **ROLL's notes are pixels.** The control part draws without the note memory, so `step` notes what
  the main area shows, as it notes STEP's cells today. ROLL's notes are a colour for every pixel of
  every shown row; they take the place of STEP's cells in one `ShownNotes`, since only one of the
  two screens shows at a time and the working memory has about 10 KB left.
- **The NOTE panel is the NOTE strip on one cell.** `summary` and `turn_held` read and change "the
  edited cells": the held steps as today, or the panel's cell, which is the step cursor's cell (and
  on ROLL its pitch). The panel's cursor is one of four items; it is a second level that takes the
  controls as a picker does.

**Tech Stack:** as before: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md) is the main spec: "STEP and ROLL"
  (the view, the cursor, following, markings), "ROLL", "The cursor on cells", "The NOTE panel", "The
  NOTE strip", "Controls and bindings", "Testing".
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "Pickers and questions" (the
  rule the panel follows), "STEP and ROLL", "An empty pad".
- [Look](../specs/2026-11-07-groovebox-look-design.md): "Colour" (the sound colours), "STEP" (the
  grid and how a note is drawn), "ROLL", "Shared parts" (the NOTE panel), "The strip", "The lights";
  `roll.png`, `note-panel.png`, `note-strip.png`.
- The Look rig's `drawRoll`, `shade`, `soundColour` and `drawNotePanel`, the drawing code of the
  approved pictures (outside the repo by the owner's choice):
  `C:\Users\Jakub\AppData\Local\Temp\claude\D--projects-apps\acb4db09-8c01-482d-9418-b85e6f948e54\scratchpad\redraw\rig\groovebox-screens.html`.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Open points for
  planning" ("An encoder whose item is not on the screen", "An empty pad selected").
- The EP-133 has no piano roll and no note panel, so its guide decides nothing here.

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point                                  | Answer (2026-11-26)                                                                                                                                                                                                                    |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Notes outside C0–B8                    | ROLL has a row for every pitch a note can have, C−1 (0) to G9 (127), 128 rows, so every note shows and can be edited there. KEYS mode still plays C0–B8. A sample's Root note and the NOTE strip's Pitch already reach the whole range |
| 2   | ROLL → STEP → ROLL with the same sound | ROLL comes back on the row you left. It centres on the selected sound's notes only the first time it shows that sound: on its first showing, or after another sound or track was selected (a pad hit, T1–T4, POOL)                     |
| 3   | The NOTE panel while the view follows  | Opening the panel stops following, as moving the cursor into another bar does. The cell, the view and the step buttons stay on that bar while the music plays on; PLAY follows again as usual                                          |

### Settled by the specs, the pictures, the rig or the code

| #   | Point                   | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | The screen              | `Screen::Roll`, second in `Screen::ALL`, named "Roll". MENU + 2 and the ROLL button show it (Workflow A's screen table); ROLL while ROLL shows changes nothing. Leaving SAMPLES for ROLL stops the preview, as MENU + step does. Under MENU or PAGE, and with a picker, a question or the NOTE panel open, ROLL is taken, as today. The ROLL light is on while ROLL is the screen (Look). The header names the screen only, as on STEP; PAGE and the encoders use SOUND's pages (`paged`), and the strip is the selected sound's page, empty with no selected sound                                                                                                                                      |
| S2  | An encoder off screen   | The overview's open point: on ROLL as on STEP, a turn changes its item and puts SOUND's page cursor on it (`reach`, as built for STEP); ROLL's own cursor stays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S3  | Rows                    | Answer 1. Row 0 at the top is pitch 127 (G9), down to pitch 0 (C−1); 16 rows show, as STEP's 16 lanes (Look's "17 rows" contradicts `roll.png` and the rig, which show 16). Each row's name is Root note's format ("C4", "C#4", "C−1"), sharps dim and the others in the text colour, 3 px from the screen's edge. The names column is 3 + the widest name, "C#−1", + 3 = 29 px whatever rows show, as STEP counts lanes scrolled away, so 55 columns and the grid's left line at x 38. Separators run as STEP's: faint, and in the line grey between each B and the C above it (`roll.png` and the rig: Look's "a brighter line above each C")                                                          |
| S4  | The cursor              | ROLL's row is its own (`RollView::pitch`). Up and down move a semitone, SHIFT 12, stopping at G9 and C−1. Left, right and SHIFT + left or right move the shared bar and sixteenth exactly as on STEP, following included. The view's first cell is STEP's (`StepView::first_cell`), kept with the shown screen's columns, so switching keeps the cell at the left edge where it can. The top row is kept as STEP's first lane is: one row at a time, a jump in one go (`kept` with step 1)                                                                                                                                                                                                               |
| S5  | Where it centres        | Answer 2. `RollView::shows` is the (track, selected sound) the row was last put on. Whenever ROLL shows and they differ, with a selected sound the row goes to the middle of its notes on the current track of the current pattern: halfway between the lowest and highest pitch, rounded down; with none, its unchanged pitch (C4 for a synth, Root note for a sample). The top row then puts the cursor on the 8th of the 16 rows, as near as the ends allow: `top = (pitch + 7).clamp(15, 127)`. Keys in KEYS mode select nothing, so they never move it                                                                                                                                              |
| S6  | An empty pad            | The overview's open point. With no selected sound ROLL keeps its row (`shows` takes `None`, and the next sound selected centres), every note is dim, OK and CANCEL do nothing and the strip is empty (Workflow A: "the strip under STEP and ROLL is empty")                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| S7  | A note on ROLL          | STEP's rule (Look, "Notes"), as a full block: its start and end each at 60 ticks a pixel, rounded half up, from the line at the left of their cell; its first pixel 2 px right of its start's line and its last 2 px left of its end's line, never fewer than 5 px; rows +1 to +11 of its 13 px row; no tail and no count. Its end is the end tick's own bar and sixteenth, so a note over dark cells ends where the next bar shows it. A note that starts before the first shown cell runs from the grid's left line; nothing passes the grid's end, as on STEP. The other sounds' notes first in key order, then the selected sound's on top                                                           |
| S8  | Colours                 | Look: a sound's hue is its number less 1, modulo 12. The selected sound's notes at 100 and up are the hue × 1, 60 to 99 × 0.72 and below 60 × 0.48; every other sound's × 0.32. Each channel is `(c × k + 50) / 100` with k 100, 72, 48 or 32 (the rig's `shade` over black). `PALETTE` gains them as entries `11 + 4 × hue + shade`, the shades in that order: 48 entries, 59 in all                                                                                                                                                                                                                                                                                                                    |
| S9  | ROLL's pixels           | `step` notes ROLL's notes as a `Color` for each pixel from the grid's left line to its closing line (441) of each of the 16 rows, the background where none is. They share one `ShownNotes` with STEP's `Mark`s: about 7 KB either way, nothing added. Notes that start before the view are found by reading the track from its first note (`shortcut:` comment, see S7)                                                                                                                                                                                                                                                                                                                                 |
| S10 | Cells on ROLL           | A cell is one pitch: OK on a cell where the selected sound has no note of the row's pitch starting in its sixteenth adds a step-entered note there at that pitch (480 ticks, velocity 127, no curve), other sounds' notes there notwithstanding; with fewer than `RESERVE` blocks free "Not enough memory" shows in red. A CANCEL tap removes the selected sound's notes of the row's pitch that start in the sixteenth CANCEL showed at its press; a tap cannot change the row. − and + do nothing on a cell. SHIFT + CANCEL is taken on ROLL, as on STEP, kept free for undo                                                                                                                           |
| S11 | Opening the panel       | OK on a cell with notes opens it: on STEP where the selected sound has notes starting in the cell's sixteenth (any pitch), on ROLL those of the row's pitch. It opens on Pitch and takes the held arrows, − and + (`end_held_repeats`). The step cursor takes the cell as shown and following stops (answer 3). While it is open the shown bar ignores following, so PLAY or SHIFT + PLAY there act on the music as usual and the following they turn on takes the view once the panel closes                                                                                                                                                                                                            |
| S12 | Controls in the panel   | Up and down move its cursor, stopping at Pitch and Position; SHIFT + up or down, left and right do nothing (a page of one column). − and + change the item by a click, a fine one while SHIFT is held, and repeat while held. An encoder turn changes its item and puts the panel's cursor on it. OK and an encoder push do nothing (as on the NOTE strip's items). A CANCEL tap closes it, the cursor staying on the cell; SHIFT + CANCEL is taken. Everything else as with a picker open (Workflow A): PLAY, STOP, REC, SHIFT + T1–T4 and the volume act; pads and keys sound and record but neither select nor move anything; T1–T4, MENU, PAGE, ROLL, PADS/KEYS, TEMPO, COPY and the steps are taken |
| S13 | The panel's values      | The NOTE strip's: the same ranges, clicks and stops (Workflow B and plan 1's S18), and Position counted in grid steps from the cell it opened on, "+0" at first. The panel stands for the cell its notes moved to ("the edit follows the note"): Position moves the step cursor with them, the view scrolling to keep it, and Pitch on ROLL moves the row with them, so every turn edits the same notes. While it is open the held steps do not count, and a pad hit does not edit them                                                                                                                                                                                                                  |
| S14 | Drawing the panel       | A box as the question's: 124 × 77 px at x 178, centred in the main area by the question's own rule (y 96, 1 px under `note-panel.png`'s 95), filled black with a 1 px outline in the line grey; four items 118 px wide from (181, 99), 18 px apart, with no encoder numbers (Look gives them to a page's items; `note-panel.png` has none). Bars as the NOTE strip's: a single Pitch or Velocity filled by its value out of 127, otherwise the bare track (`note-panel.png`'s filled Length and Position bars predate that rule). The cursor's outline around its item; the cell's outline stays where it shows under the box. The strip shows the same four items                                       |
| S15 | Old pictures and sounds | MENU's tiles gain Roll on step 2, so every frame with MENU held changes. Nothing else that is drawn changes, and no sound does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### Overview open points this plan settles

Task 1 writes these into the specs they belong to and takes them out of the overview's "Open points
for planning": "An encoder whose item is not on the screen" (S2) and "An empty pad selected" (S6; OK
on STEP already does nothing there).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Code under the
  `harness` feature and `cfg(test)` may use `std`.
- Time: 1,920 ticks a beat, 480 a sixteenth, 7,680 a whole note; 8 px a sixteenth, 60 ticks a pixel.
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds; about 10 KB are
  left. This plan adds a few dozen bytes (`RollView`, the panel, `ShownNotes`' tag). If the device
  outgrows the budget, report the size and stop: the budget is the owner's.
- Note memory rules as before: the audio part never waits and never writes note memory; a block is
  taken only while `step`'s room rules hold (`RESERVE`); removals may use the reserve. An event
  publishes each track at most once.
- Look's rules as before (13 px rows, the cursor 1 px outside, mixed case, "…" for what does not
  fit). Colours are the palette's named entries.

## Review Focus

The five cases the specs imply but the rules above do not test, most likely first. Each has its test
in the task named.

1. **A long note on ROLL that started left of the view, or crosses a short bar's dark cells**: it
   shows from the grid's left line, and ends where its end's bar shows it, not 8 px a sixteenth past
   its start (Task 3, `a_note_reaching_in_from_the_left_and_one_over_dark_cells`).
2. **Position in the panel carrying the notes past the view's edge or into another bar**: the view
   scrolls with the cell, and the next turn still edits the same notes (Task 5,
   `position_carries_the_cell_and_the_view_with_the_notes`).
3. **PLAY pressed while the panel is open and the music plays**: the panel keeps editing its cell,
   the cell stays put, and following takes the view when the panel closes (Task 5,
   `the_panel_stops_following_and_play_follows_once_it_closes`).
4. **ROLL with an empty pad, or with a sound that has no notes**: an empty pad leaves the row, and a
   sound without notes opens at its unchanged pitch, a sample's Root note included (Task 2,
   `a_sound_without_notes_opens_at_its_unchanged_pitch`, `an_empty_pad_leaves_roll_on_its_row`).
5. **Notes at C−1 and G9**: their rows exist, the arrows stop there, and the panel's Pitch stops at
   0 and 127 with the row following (Tasks 2 and 5, `the_rows_run_from_g9_down_to_c_minus_1`,
   `pitch_on_roll_carries_the_row_and_stops_at_the_ends`).

## Not in this plan

- The panel's clicks as one undo action, and SHIFT + CANCEL with it open: plan 3.
- CANCEL or COPY held with a pad: plan 4.
- Remembering ROLL's row and view in the project file: Milestone 5 (Project model).
- A grid other than 1/16: later (Workflow B, "Scope"). Cells stay a sixteenth.
- STEP drawing the tail of a note that starts left of its view: STEP draws only the notes that start
  in its shown cells, as built; ROLL draws them (S7). Raised with the owner, not changed here.

## Shared formats

### Screens and the view (`src/control/view.rs`)

- `Screen::Roll`, after `Step` in `Screen::ALL`; `name` "Roll"; `paged` gives `Sound` for `Step` and
  `Roll`.
- `pub struct RollView { pub pitch: u8, pub top: u8, pub shows: (u8, Option<SoundNumber>) }`: the
  cursor's pitch, the pitch of the top row shown and the (track, sound) last centred on (S5).
  `View::new` gives pitch 60, top 67, shows `(0, None)`.
- `pub struct NotePanel { pub item: usize, pub from: StepCursor }`: the panel's cursor, 0 (Pitch) to
  3 (Position), and the cell it opened on, from which Position counts (S13).
- `View` gains `pub roll: RollView` and `pub note_panel: Option<NotePanel>`.

### ROLL (`src/control/roll.rs`, new)

- `pub const ROLL_NAMES: i32 = 29;`, `pub const ROLL_COLUMNS: u32 = 55;`,
  `pub const ROLL_PIXELS: usize = 441;` (S3, S9). ROLL shows `LANES_SHOWN` rows.
- `Control::columns(&self) -> u32`: the shown screen's columns, `ROLL_COLUMNS` on ROLL and
  `step_columns().1` elsewhere. `keep_step_view` and `music_x` use it, and `music_x` answers on ROLL
  too.
- `Control::keep_roll_view(&mut self, store: &Store<'_>)`: while ROLL shows, centres (S5) when
  `shows` differs, then keeps the cursor's row on screen (S4). `step` calls it wherever it calls
  `keep_step_view`.

### Drawing (`src/ui/step.rs`, `src/palette.rs`, `src/control/mod.rs`)

- `LaneView` gains `pub line_above: bool` (the line grey above the row instead of faint);
  `StepPicture::first_extra` goes. STEP sets it on its first extra lane, ROLL on each B row under a
  C.
- `pub enum GridNotes<'a> { Marks(&'a [[Option<Mark>; GRID_CELLS]]), Pixels(&'a [[Color; ROLL_PIXELS]]) }`
  takes the place of `StepPicture::marks`; `draw_step` draws a `Pixels` row's pixels on its rows +1
  to +11.
- `pub const fn sound_color(sound: SoundNumber, velocity: u8, selected: bool) -> Color` (S8).
- `enum ShownNotes { Step([[Option<Mark>; GRID_CELLS]; LANES_SHOWN]), Roll([[Color; ROLL_PIXELS]; LANES_SHOWN]) }`
  takes the place of `Control::marks`.

### Cells and the panel (`src/control/steps.rs`, `src/control/held.rs`, `src/control/mod.rs`)

- `remove_notes(place, pitch: Option<u8>, sample, versions, store) -> bool` and
  `enter_note(place, pitch: Option<u8>, sample, versions, store)`: `Some(pitch)` is ROLL's cell,
  which removes only that pitch and enters at it; `None` is today's behaviour (steps and STEP).
- `ok_on_cell(&mut self, sample, versions, store)`: OK on a STEP or ROLL cell (S10, S11).
- `edited(&self) -> ([Option<(StepCursor, StepCursor)>; STEPS as usize], Option<u8>)`: the cells the
  NOTE strip or panel edits, each with where its notes lie now and where they lay when it started,
  and ROLL's pitch for the panel. The panel's cell while it is open, else the held steps
  (`held_steps`, a step sharing an earlier one's place left out). `summary` and `turn_held` read it.
- `nudge(button, sample, messages, versions, store)`: gains the queues and the store, for the
  panel's − and + and their repeats.

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `control/view.rs`, `control/pages.rs` (`MENU`, `pages`), `control/roll.rs` (create),
  `control/step_view.rs` (`keep_step_view`, `music_x`), `control/mod.rs` (the ROLL button, `nudge`,
  `lights`, `step`): Task 2.
- `palette.rs`, `ui/step.rs`, `control/roll.rs`, `control/draw.rs`, `control/mod.rs` (`ShownNotes`):
  Task 3.
- `control/steps.rs`, `control/mod.rs` (OK, CANCEL, SHIFT + CANCEL): Task 4.
- `control/held.rs`, `control/view.rs`, `control/mod.rs` (`press`, `release`, `nudge`, `reach`,
  `encoder_items`, `hit`, `shown_bar`), `control/draw.rs`: Task 5.
- Tests: `control/tests/roll.rs` (create, Tasks 2 to 4), `control/tests/panel.rs` (create, Task 5),
  `control/tests.rs` (`mod roll; mod panel;`), `control/tests/step_view.rs` (OK on notes now opens
  the panel), `control/view.rs`' and `ui/tiles.rs`' MENU tests.

**`packages/groovebox-core/scenes/`:** create `roll.scene`; re-bless every scene that holds MENU
(Task 6).

**`apps/groovebox/`:** `source/gallery/states.ts`, `tests/gallery.test.ts` (Task 6).

**Repo root:** `.changeset/groovebox-roll-and-note-panel.md`: create (Task 6). The specs: modify
(Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-05-groovebox-workflow-b-design.md`, `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Overview:** "Open points for planning" loses the two points above.
- **Workflow B:** "ROLL": rows C−1 to G9, every pitch a note can have, with KEYS mode still C0 to B8
  (answer 1); "Where the view opens": answer 2 and S5's middle; an empty pad (S6). "The cursor on
  cells": ROLL's OK and CANCEL at the row's pitch (S10). "The NOTE panel": answer 3 and S11 to S13.
  "Testing": "ROLL's rows covering every pitch from C−1 to G9".
- **Look:** "ROLL": 16 rows; the names column and separators of S3; notes by S7; S8's shades.
  "Colour": the palette's 48 sound entries (S8). "Shared parts", the NOTE panel: S14, and that
  `note-panel.png` sits 1 px higher and fills Length's and Position's bars, which the text
  overrules.

- [ ] **Step 1: Edit the three specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the groovebox ROLL and NOTE panel decisions in the specs"`

---

### Task 2: The ROLL screen and its cursor

**Files:**

- Create: `src/control/roll.rs`, `src/control/tests/roll.rs`.
- Modify: `src/control/view.rs`, `src/control/pages.rs`, `src/control/step_view.rs`,
  `src/control/mod.rs`, `src/control/tests.rs`, the MENU tests in `src/control/view.rs`,
  `src/ui/tiles.rs` and `src/control/tests/pattern.rs` ("step 2 is ROLL's, which does not exist
  yet").

**Interfaces:**

- **Consumes:** `kept`, `cell_of`, `place_of`, `cells` (`step_view.rs`); `Sound::unchanged_pitch`.
- **Produces:** `Screen::Roll`, `RollView`, `ROLL_NAMES`, `ROLL_COLUMNS`, `ROLL_PIXELS`,
  `Control::columns`, `Control::keep_roll_view` (Shared formats).

- [ ] **Step 1: Write the failing tests**

  In `control/tests/roll.rs`, on the factory project's T2 (Bass on pad 1, Sub on pad 2, Acid on pad
  3), 4/4, 4 bars unless said. Notes go in with KEYS mode and the step buttons, or straight into the
  track's tree as `step_view.rs`' tests put them.

```rust
#[test] fn menu_2_and_the_roll_button_show_roll() {
    // MENU + 2: ROLL, its tile current; ROLL from SOUND: ROLL; ROLL again: ROLL. The ROLL light is
    // on only while ROLL shows. From SAMPLES with a preview playing, ROLL stops the preview
    // (`StopPreview` sent). Under MENU, and with the sound picker open, ROLL is taken: the screen
    // stays
}
#[test] fn roll_uses_sounds_pages_as_step_does() {
    // PAGE + 3 on ROLL shows SOUND's Filter page under it: `encoder_items` are Filter's; encoder 2
    // turned on ROLL changes Cutoff and SOUND's Filter cursor goes to Cutoff; `view.roll` is
    // unchanged (S2). With an empty pad selected the encoders hold nothing
}
#[test] fn the_rows_run_from_g9_down_to_c_minus_1() {
    // Review Focus 5: from pitch 60, up 67 times: 127 and a 68th up stays; SHIFT + down from 127:
    // 115; down to 0 and one more: 0; SHIFT + down from 5: 0. The top row is kept on screen by one
    // row a move (top 127 at pitch 127, top 15 at pitch 0), and SHIFT jumps it in one go
}
#[test] fn left_and_right_move_the_shared_cursor() {
    // on ROLL right 5 times: `view.steps` step 5; STEP shows the same bar and sixteenth; on ROLL an
    // arrow into bar 2 while following stops following, as on STEP
}
#[test] fn the_first_cell_is_shared_and_kept_with_each_screens_columns() {
    // 8 bars, STEP's labels 12 characters wide (49 columns): the cursor on cell 60, STEP's first
    // cell kept; ROLL keeps that first cell (55 columns, the cursor already shows); the cursor
    // moved to cell 110 on ROLL; back on STEP the first cell is kept for STEP's 49 columns
}
#[test] fn roll_opens_on_the_middle_of_the_selected_sounds_notes() {
    // Bass with notes at 36, 43 and 48 and Sub at 70: ROLL shows pitch 42, top 49
}
#[test] fn a_sound_without_notes_opens_at_its_unchanged_pitch() {
    // Review Focus 4: Sub without notes: 60, top 67; a sample sound with Root note 3: pitch 3, top
    // 15; with Root note 125: 125, top 127
}
#[test] fn roll_comes_back_on_the_row_it_left_with_the_same_sound() {
    // answer 2: ROLL on Bass, down 10 rows; MENU + 1, MENU + 2: the same pitch and top
}
#[test] fn another_sound_or_track_centres_roll_again() {
    // on ROLL: pad 2 (Sub) in PADS mode: Sub's middle; pad 2 again: down 3 rows first, the row
    // stays; T3: T3's selected sound's middle; KEYS mode keys: the row stays; POOL selects Bass,
    // then MENU + 2: Bass's middle
}
#[test] fn an_empty_pad_leaves_roll_on_its_row() {
    // Review Focus 4: on ROLL at pitch 50, pad 12 (empty) hit in PADS mode: pitch 50; then pad 1:
    // Bass's middle
}
#[test] fn the_header_names_roll_only() {
    // "Roll", "T2", "Bass", "Pads" on the left, the transport on the right
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run, from `packages/groovebox-core`: `cargo test -p groovebox-core --lib -- roll`. Expected: the
  new tests FAIL (no `Screen::Roll`).

- [ ] **Step 3: Implement S1 to S6**

  `MENU[1]` is `Screen::Roll`, `pages` gives it none. The ROLL button joins the arms that change the
  screen in `press`; `lights` lights `Lights::ROLL` on ROLL. `nudge` moves `view.roll.pitch` on ROLL
  as S4 says, and takes ROLL's left and right through STEP's code. `keep_step_view` keeps the first
  cell with `columns()`; `keep_roll_view` centres by S5, reading the track's tree from its first
  note for the sound's lowest and highest pitch, and keeps the top row with
  `top = 127 - kept(127 - pitch, 127 - top, 16, 1, 128)`. A unit test in `roll.rs` checks that
  `ROLL_NAMES` is 3 + `text::width("C#\u{2212}1")` + 3 and `ROLL_COLUMNS`
  `(WIDTH - 2 - ROLL_NAMES - 2) / CELL`.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, with the MENU tests now counting Roll's
  tile.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox ROLL screen and its cursor"`

---

### Task 3: ROLL's picture

**Files:**

- Modify: `src/palette.rs`, `src/ui/step.rs`, `src/control/roll.rs`, `src/control/mod.rs`
  (`ShownNotes`, `step`), `src/control/draw.rs`, `src/control/step_view.rs` (`music_x`),
  `src/control/tests/roll.rs`, `src/control/tests/step_view.rs` (`step_picture` builds
  `LaneView::line_above` and `GridNotes::Marks`).

**Interfaces:**

- **Consumes:** `RollView`, `ROLL_*`, `columns` (Task 2); `cell_of`, `grid_left`.
- **Produces:** `sound_color`, `LaneView::line_above`, `GridNotes`, `ShownNotes` (Shared formats).

- [ ] **Step 1: Write the failing tests**

  `palette.rs`:

```rust
#[test] fn the_sound_colours_are_four_shades_of_twelve_hues() {
    // PALETTE[11] = [0xe0, 0x60, 0x7a]; PALETTE[11 + 4 * 6 + 1] = [80, 101, 174] (#6f8cf2 × 0.72);
    // PALETTE[11 + 4 * 11 + 3] = [64, 51, 40] (#c9a07e × 0.32); PALETTE[59..] all black.
    // sound_color(SoundNumber(7), 100, true) is index 35, (7, 99, true) 36, (7, 59, true) 37,
    // (7, 127, false) 38; SoundNumber(13) has SoundNumber(1)'s hue
}
```

`ui/step.rs`, beside today's tests (`first_extra`'s test becomes `line_above`'s):

```rust
#[test] fn a_row_marked_line_above_has_the_line_grey_above_it() {
    // rows 0, 5 and 9 marked: line grey above 5 and 9, none above 0, faint above the others
}
#[test] fn pixels_fill_their_rows_inner_eleven_lines() {
    // GridNotes::Pixels with row 1's pixels 2 to 6 a sound colour: x grid_left + 2 to + 6, y 32 to
    // 42 in it; nothing on rows 31 and 43
}
```

`control/tests/roll.rs`, ROLL on T2 at 120 BPM, the view at cell 0 unless said; bars and steps count
from 0, as `Note` and `StepCursor` do:

```rust
#[test] fn roll_draws_its_names_rows_and_octave_lines() {
    // top 67: "G4" in the text colour at (4, 17), "F#4" dim on the next row; the grid's left line
    // at x 38 and its closing line at 478; the line grey above the B3 row (under C4), faint between
    // the others; the shown bar tinted as on STEP
}
#[test] fn a_note_is_a_block_from_its_start_to_its_end_in_its_sounds_colour() {
    // Bass (number 7) at bar 0 place 0, 960 ticks, velocity 127, pitch 60: x 40 to 52, y +1 to +11
    // of C4's row, sound_color(7, 127, true); a 10-tick note at place 480: x 48 to 52, 5 px; a
    // note at place 30: from x 41
}
#[test] fn other_sounds_are_dim_and_the_selected_sound_is_drawn_last() {
    // Sub and Bass on the same row and cell: the overlap in Bass's colour, Sub's other pixels in
    // sound_color(8, _, false); with Sub selected the other way round
}
#[test] fn a_note_reaching_in_from_the_left_and_one_over_dark_cells() {
    // Review Focus 1: a 2-bar note from bar 0 with the view's first cell 16: from x 38 to 164.
    // In 3/4 a note at bar 0 place 4_800 (step 10) of 1_440 ticks ends at bar 1 place 480: x 120
    // to 172, over the dark cells
}
#[test] fn nothing_passes_the_grids_end() {
    // 1 bar: a 2-bar note stops 2 px before x 166, the closing line; at the 55th column of a
    // longer pattern a note ends at x 476
}
#[test] fn the_cursor_and_the_music_line_show_on_roll() {
    // the cursor outline on its cell 1 px outside, its row from the top; while playing the music
    // line moves a pixel every 60 ticks and redraws
}
#[test] fn roll_redraws_when_a_note_goes_in() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- roll palette ui::step`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement S3, S7, S8 and S9**

  `step` fills `ShownNotes::Roll` while ROLL shows and asks for a redraw, as it fills
  `ShownNotes::Step` for STEP; each note's x comes from `cell_of` of its start's and its end's bar
  and sixteenth plus the rounded ticks into each. The comment on the read from the first note:
  `// shortcut: reads every note before the view to find the ones that reach into it; keep each track's longest note if the device's redraw time matters.`
  `draw` gives ROLL's rows to `draw_step` with `GridNotes::Pixels`, the names by
  `param::format(&ROOT_NOTE, ..)`, no row selected and the cursor at `top - pitch`.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, STEP's pictures unchanged.

- [ ] **Step 5: Commit**

  `git commit -m "Draw the groovebox ROLL with each sound in its colour"`

---

### Task 4: Adding and removing notes on ROLL

**Files:**

- Modify: `src/control/steps.rs`, `src/control/mod.rs` (`press`, `release`),
  `src/control/tests/roll.rs`.

**Interfaces:**

- **Consumes:** `Screen::Roll`, `RollView` (Task 2).
- **Produces:** `remove_notes` and `enter_note` with `pitch: Option<u8>`, `ok_on_cell` (Shared
  formats). Task 5 makes `ok_on_cell` open the panel on a cell with notes.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn ok_on_an_empty_roll_cell_adds_a_note_at_its_pitch() {
    // Bass selected, ROLL at pitch 43, step 3: OK adds Note { bar 0, place 1_440, length 480,
    // pitch 43, velocity 127, sound Bass }, counted, one version; KEYS mode does not change the
    // pitch. A Sub note of pitch 43 there does not make the cell full
}
#[test] fn ok_on_a_cell_with_the_sounds_notes_adds_nothing() {
    // a Bass note at pitch 43 in the sixteenth, starting at place 1_500: OK adds nothing (Task 5
    // opens the panel)
}
#[test] fn cancel_on_roll_removes_the_sounds_notes_of_its_pitch_only() {
    // Bass at 43 and 46 and Sub at 43 in step 3: CANCEL tapped at pitch 43 leaves Bass 46 and Sub
    // 43; on the cell CANCEL showed at its press, when following moved the bar before the release
}
#[test] fn ok_and_cancel_do_nothing_on_roll_with_an_empty_pad() {}
#[test] fn shift_cancel_is_taken_on_roll() {
    // as `shift_and_cancel_remove_nothing_on_step`
}
#[test] fn ok_on_roll_under_the_reserve_says_not_enough_memory() {
    // fill_until(RESERVE - 1): no note, "Not enough memory" in red; CANCEL still removes
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- roll`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement S10**

  `tap_step` passes `None`; ROLL's OK and CANCEL pass `Some(view.roll.pitch)`. The SHIFT + CANCEL
  arm and the CANCEL release arm cover `Screen::Step | Screen::Roll`.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add and remove groovebox notes from ROLL's cells"`

---

### Task 5: The NOTE panel

**Files:**

- Create: `src/control/tests/panel.rs`.
- Modify: `src/control/view.rs` (`NotePanel`), `src/control/held.rs` (`edited`, `summary`,
  `turn_held`), `src/control/steps.rs` (`ok_on_cell`), `src/control/mod.rs` (`press`, `release`,
  `nudge`, `reach`, `encoder_items`, `hit`, `shown_bar`, the repeat event), `src/control/draw.rs`,
  `src/control/tests.rs`, `src/control/tests/step_view.rs`
  (`ok_on_an_empty_cell_enters_and_on_notes_does_nothing` becomes "opens the panel").

**Interfaces:**

- **Consumes:** `ok_on_cell`, `enter_note` (Task 4); `RollView` (Task 2); `Held`, `NOTE`,
  `write_length`; `draw_item`, `draw_cursor`, `draw_question`'s centring.
- **Produces:** `NotePanel`, `edited` (Shared formats). Plan 3 makes the panel's clicks one undo
  action.

- [ ] **Step 1: Write the failing tests**

  On T2 with Bass selected, 4 bars, notes put in the track's tree; STEP's cursor on Bass's lane.

```rust
#[test] fn ok_on_a_cell_with_notes_opens_the_panel_on_pitch() {
    // STEP: a chord of Bass at 48 and 52 in step 3; OK: the panel open, item 0, from bar 0 step 3;
    // nothing added. ROLL at pitch 52: OK opens it on that cell
}
#[test] fn the_panel_shows_its_cells_notes() {
    // STEP: Pitch "C3–E3", Velocity "100", Length "1/16", Position "+0" in the panel and in the
    // strip; ROLL at 52: Pitch "E3" alone, its bar filled by 52 out of 127
}
#[test] fn the_arrows_minus_plus_and_the_encoders_edit_it() {
    // down twice: Length; + : both notes 960 ticks; SHIFT + -: 930; up past Pitch stays on Pitch;
    // left and right do nothing; encoder 2 turned +5: velocity 105 and the panel's cursor on
    // Velocity; - held repeats after 400 ms every 50 ms, a click each
}
#[test] fn position_carries_the_cell_and_the_view_with_the_notes() {
    // Review Focus 2: on STEP at bar 1 step 15, Position + : the notes at bar 2 step 0, the step
    // cursor there, "+1"; at the view's last column the view moves a beat; - twice: bar 1 step 14,
    // "-1"; the same notes each time, and a turn past the pattern's last sixteenth stops there
}
#[test] fn pitch_on_roll_carries_the_row_and_stops_at_the_ends() {
    // Review Focus 5: ROLL at 52: Pitch +3: the note at 55, `view.roll.pitch` 55, the row kept on
    // screen; a note at 126: +5 stops at 127, the row 127; a note at 1: -5 stops at 0
}
#[test] fn a_moved_note_replaces_the_one_it_lands_on() {
    // ROLL: Bass 52 and 53 at place 1_440; Pitch + on 52: one note at 53, counted once
}
#[test] fn cancel_closes_the_panel_on_its_cell() {
    // after Position +2, CANCEL tapped: the panel closed, the cursor on the moved cell, no note
    // removed; SHIFT + CANCEL in the panel: taken, nothing changes, the panel stays
}
#[test] fn the_panel_stops_following_and_play_follows_once_it_closes() {
    // Review Focus 3: playing and following, OK on a note's cell in bar 1: following off; the music
    // reaches bar 2: the cursor, the view and the step buttons stay on bar 1, the panel edits bar
    // 1; PLAY: following on, still bar 1 while open; CANCEL: the cursor's bar is the bar playing
}
#[test] fn the_panel_takes_the_controls_a_picker_takes() {
    // T3, MENU, PAGE, ROLL, PADS/KEYS, TEMPO, COPY, a step and an encoder push: nothing changes, the
    // panel stays; PLAY, STOP, REC act; SHIFT + T1 mutes T1; OK does nothing
}
#[test] fn a_pad_sounds_but_selects_and_edits_nothing_while_the_panel_is_open() {
    // PADS: pad 2 sends NoteOn and Bass stays selected, the cursor stays; a step held before OK,
    // then a pad: no note added under it; the panel's values are the cell's, not the step's; while
    // recording the hit is recorded
}
#[test] fn a_turn_in_the_panel_under_the_reserve_changes_nothing() {
    // fill_until(RESERVE - 1): + on Velocity changes nothing and says "Not enough memory" in red
}
#[test] fn the_panel_draws_a_box_with_its_four_items_and_the_cursor() {
    // a box 124 x 77 at (178, 96) in the line grey, black inside; the items from (181, 99) 18 px
    // apart drawn as `draw_item` draws them unnumbered; the cursor outline around Pitch at
    // (180, 98, 120, 19); the strip shows the same four items
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- panel step_view`. Expected: the new tests FAIL, and
  the changed STEP test.

- [ ] **Step 3: Implement S11 to S14**

  `ok_on_cell` opens the panel where `enter_note` would find the sound's notes. `edited` gives the
  panel's cell while it is open; `turn_held` moves `view.steps` after Position and `view.roll.pitch`
  after Pitch on ROLL, where it moves `held` for steps. `press` treats an open panel as an open
  picker except for the arrows, − and +, which go to `nudge`; `release` closes it on a CANCEL tap
  before any other CANCEL arm. `shown_bar` ignores following while it is open. `hit`'s "open"
  includes it. `draw` draws it after the main area, where the question is drawn.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox NOTE panel on STEP and ROLL"`

---

### Task 6: The scene, the gallery, the changeset and a look

**Files:**

- Create: `scenes/roll.scene`, `.changeset/groovebox-roll-and-note-panel.md`.
- Modify: the fingerprints and frames of every scene that holds MENU (re-blessed),
  `apps/groovebox/source/gallery/states.ts`, `apps/groovebox/tests/gallery.test.ts`.

**What the scene does** (Workflow B's gallery "STEP and ROLL", "the NOTE strip and panel"; through
the panel only, each frame named in the scene's comments):

- `roll.scene`: T2; KEYS mode on Bass and a bass line entered with the steps across two bars, Sub
  and Acid notes the same way, one Acid note 2 bars long; PADS mode, pad 1; ROLL (frame: ROLL on T2
  with Bass bright and Sub and Acid dim, beside `roll.png`); down and OK on an empty cell, CANCEL on
  a note; OK on a Bass note (frame: the NOTE panel on ROLL); Pitch + and Velocity − with encoder 2;
  CANCEL; MENU + 1, OK on Bass's chord (frame: the NOTE panel on STEP, beside `note-panel.png`);
  CANCEL; PATTERN's Signature 5/4 and MENU + 2, right into bar 2 (frame: ROLL in 5/4 with its short
  page, the 2-bar note reaching in from the left).

- [ ] **Step 1: Write the scene**
- [ ] **Step 2: Build and re-bless**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift -- --test-threads=1`. Expected: PASS: every scene
  plays the same natively and in both `.wasm` builds. No earlier scene's `expect-audio` changes;
  list the earlier frames that changed, which are the frames with MENU held (S15), and stop and
  report any other. The core builds within the working memory budget.

- [ ] **Step 3: The gallery**

  `states.ts` gains "ROLL on T2 with Bass selected" (`roll.png`), "The NOTE panel on ROLL", "The
  NOTE panel on STEP" (`note-panel.png`) and "ROLL in 5/4"; changed frames keep their titles.
  `gallery.test.ts` lists `roll` among the scenes whose every frame has a state.

  Run, from `apps/groovebox`: `npx vitest run tests/gallery.test.ts`,
  `npx eslint source/gallery/states.ts tests/gallery.test.ts`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: The changeset**

```markdown
---
'groovebox': minor
'groovebox-core': minor
---

Added ROLL to the groovebox, a piano roll of the current track with each sound in its own colour,
and the NOTE panel, which edits a cell's notes from STEP or ROLL.
```

- [ ] **Step 5: Run clippy and commit**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: no warnings.

  `git commit -m "Add the groovebox ROLL scene and re-bless the scenes"`

- [ ] **Step 6: The owner looks**

  Ask the owner to open the gallery and the app: each new frame beside its approved picture; ROLL
  with a bass line, chords and drums; the panel on STEP and on ROLL while the music plays. Values
  are tuning: change what the owner chooses, re-bless as in Step 2 and commit; nothing changed: no
  commit.
