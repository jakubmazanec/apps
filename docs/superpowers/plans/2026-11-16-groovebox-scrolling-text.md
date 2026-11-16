# Groovebox Scrolling Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

The small plan that follows Milestone 1's three plans. Plans 1
([foundation](./2026-11-10-groovebox-foundation.md)), 2
([screens and pads](./2026-11-13-groovebox-screens-and-pads.md)) and 3
([sound](./2026-11-15-groovebox-sound.md)) are built.

**Goal:** A text under the cursor that does not fit its box scrolls in place: it holds still at its
start for about a second, then glides left a pixel at a time and comes round after a gap, again and
again, the box never changing. Every other text that does not fit stays shortened with "…".

**Architecture:**

- `ui/text.rs` gains `draw_in`: whole when the text fits, shortened with "…" when it is not under
  the cursor, otherwise scrolled and cut at the box's edges through a small clipping canvas. The
  timing constants live beside it.
- The four widgets that shorten text today (`draw_item`, `draw_rows`, `draw_tiles`,
  `draw_pad_tiles`) draw through `draw_in` and say whether something of theirs scrolls. The strip
  never scrolls.
- `Control` remembers when the cursor last landed on something new (`focus`, `landed`) and the
  sample of the latest step (`now`); `draw` passes `now - landed` to the widgets. `step` also asks
  for a redraw each time a scrolling text has moved a pixel's time on.
- A drift scene records the scroll on the Synth page's "Oscillator 2 fine tune"; the gallery shows
  its frames.

**Tech Stack:** as plan 3: Rust 1.99.1 (`no_std` core), `wasmtime` in the drift crate; TypeScript
only for the gallery's list of states.

**Spec:**

- [Look](../specs/2026-11-07-groovebox-look-design.md): "The font" (full names, shortening, the wish
  for scrolling text), "The rules every screen is drawn by", "Testing".
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "How part 1 is designed"
  (the scrolling text plan after Sound).
- [Sound](../specs/2026-11-03-groovebox-sound-design.md): "Second oscillator" (the long names).
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): the cursor, pickers, the strip
  never a cursor target.
- The EP-133 research, Teenage Engineering's written guide only:
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\a61d3b5d-fed6-4e4e-8039-5b1622b7ea0b\scratchpad\ep133-text-research.md`.
  Its one line on long text (OS 2.5 notes): "Long sample names scroll in a continuous loop when
  holding pad in SOUND."

## Decisions for this plan

The owner answered every open point on 2026-11-16. Task 1 writes the answers into the specs.

### The rule

As plans 2 and 3: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have.

### The owner's answers

| #   | Point        | Answer                                                                                                                                                                                                                       |
| --- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What scrolls | Only the text under the cursor: the item, picker row or tile it is on, and the selected pad's tile on the Pad page. Every other text that does not fit stays shortened with "…". One thing moves at a time, as on the EP-133 |
| 2   | Motion       | A loop, as on the EP-133: the text moves left; after its last letter comes a gap, then its first letter again, round and round while the cursor stays on it                                                                  |
| 3   | Step         | One pixel at a time: the text glides                                                                                                                                                                                         |
| 4   | Pauses       | Every round: the text first shows from its first letter and holds still for about a second, then loops; each time its first letter comes back to the start it holds still again                                              |

### Settled by the specs, the answers or the rule

| #   | Point                      | Settled                                                                                                                                                                                                                                                                                        |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | The box                    | The same room the text has today: an item's name up to 6 px before its whole value, a row's text up to 6 px before its label, a tile's or a pad's name to its inset. A scrolling text is cut at both edges, mid-letter where it falls, with no "…" (Look: its box never changing)              |
| S2  | MENU and PAGE tiles        | The current tile counts as the one you are on (answer 1). No tile name overflows today; the rule holds for later pages                                                                                                                                                                         |
| S3  | The strip                  | Never scrolls: it is never a cursor target (Workflow A), so its copy of an item stays shortened while the page's copy scrolls (answer 1)                                                                                                                                                       |
| S4  | When it starts again       | Whenever the cursor lands on something new: another item, row, page, screen or track, a picker opening or closing, MENU or PAGE held or let go, another pad selected or another sound on it. Turning a value, playing and the music do not restart it; a value that grows only narrows the box |
| S5  | The clock                  | The device's own sample clock: the scroll is a function of the samples since the cursor landed, so a replay and every build scroll the same (Foundation: integers for time, bit-identical frames)                                                                                              |
| S6  | The numbers                | Starting numbers, tuned by eye (answer 4: "about a second"): the pause 48,000 samples (1 s), one pixel every 1,600 samples (30 px a second), the gap 18 px (three letters)                                                                                                                     |
| S7  | When the screen is redrawn | As now on every event, and while a text scrolls each time one pixel's time has passed. Nothing is redrawn on time alone while nothing scrolls                                                                                                                                                  |
| S8  | Two texts on the Pad page  | The cursor's item and the selected pad's tile may both scroll (answer 1). They share one clock, so they start and pause together                                                                                                                                                               |

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs give the same audio, frames, lights and reports in
  every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Integers for time and
  the screen.
- Look's rules as in plans 2 and 3: monogram, 6 px per character, 13 px rows, items 17 px, the
  cursor 1 px outside, mixed case, full names. The colours are the palette's named entries.
- The working memory stays within `budget.toml`'s 1 MB, checked when the core builds.
- Repo rules (as plans 1 to 3): never hand-edit Carson "DO NOT EDIT" files; never remove comments;
  inline variables and functions used only once; no em-dashes and no Oxford commas in copy, docs or
  commits; commit messages in imperative sentence case without prefixes; never mention Claude,
  Claude Code or Anthropic; never use `git stash`.
- Run only the focused tests and checks a task names; CI runs the full suite.
  - Rust: from `packages/groovebox-core`, `cargo test -p groovebox-core <filter>` and
    `cargo clippy --workspace --all-targets -- --deny warnings`.
  - Drift tests need both `.wasm` builds first: `node build.js && node build.js --fallback`.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **The scroll counts from the press, not from the step.** A step that handles a press long after
   it happened (a slow worker, a replay) must show the scroll as far on as the press's own sample
   says. Pinned in Task 3 (`landing_counts_from_the_press_not_the_step`).
2. **A value that grows under a scrolling name.** Fine tune going from "+0" to "+10" narrows the
   name's box; the name keeps moving at the same place in its loop and never draws over the value.
   Pinned in Task 3 (`a_value_change_keeps_the_name_moving_within_its_new_room`).
3. **A long picker row with a label.** The row's text scrolls only up to 6 px before "synth"; the
   label stays put. Pinned in Task 3 (`the_row_under_the_cursor_scrolls_up_to_its_label`).
4. **Nothing to scroll.** With every text fitting, the screen is never redrawn on time alone, so the
   device does no work while you look at it. Pinned in Task 4
   (`nothing_redraws_on_time_alone_when_nothing_scrolls`).
5. **A text that fits exactly.** A text exactly as wide as its box is drawn whole and never moves,
   under the cursor or not. Pinned in Task 2 (`a_text_that_fits_is_drawn_whole_and_never_moves`).

## Not in this plan

- **STEP's names column** and the selected sound's inverted name: Milestone 3 decides with the grid
  whether the name of the lane the cursor is in counts as "under the cursor". Until then the column
  shortens with "…" (Look, "my call: 12").
- **The header:** its pieces are sized to their text and have no box; a sound name too long for the
  header is a Milestone 2 point (sample names).
- **Long names in scenes:** sound names are "Syn N" until Milestone 2 brings sample names, so the
  picker rows and the tiles scroll in unit tests only; the drift scene uses "Oscillator 2 fine
  tune".
- **Blink speeds** (overview, "Open points"): their own point, not settled here.

---

### Task 1: Record the scrolling text decisions in the specs

**Files:**

- Modify: `docs/superpowers/specs/2026-11-07-groovebox-look-design.md` (the "Font" row of "Decisions
  at a glance", line 38; "The font", lines 105-111; "Testing", line 465)
- Modify: `docs/superpowers/specs/2026-10-26-groovebox-core-browser-design.md` (lines 82-86)
- Modify: `docs/superpowers/specs/2026-11-03-groovebox-sound-design.md` (lines 110-113)

- [ ] **Step 1: Look, "Decisions at a glance".** The Font row ends "…; mixed case; full names; a
      name that does not fit scrolls under the cursor and is shortened with "…" elsewhere". Keep the
      table's columns aligned.

- [ ] **Step 2: Look, "The font".** Replace the paragraph from "**Full names**" to "…shortened with
      "…"." with this text:

```markdown
**Full names** **(owner's choice)**, never abbreviations: Resonance, Envelope amount. A text that
does not fit the space it has scrolls in place while the cursor is on it, its box never changing
**(owner's choice, 2026-11-16)**:

- **What scrolls:** only the text under the cursor: the item, picker row or tile it is on, the
  current tile while MENU or PAGE is held, and the selected pad's tile on the Pad page. The EP-133
  too scrolls only one name, that of the pad you hold. The strip is never a cursor target, so it
  never scrolls.
- **How:** in a loop, as on the EP-133. The text shows from its first letter and holds still for
  about a second, then glides left a pixel at a time; after its last letter come a gap and its first
  letter again, which holds still once more at the start. It is cut at the edges of its box,
  mid-letter where it falls, with no "…".
- **When:** it starts when the cursor lands on the text and starts again whenever the cursor lands
  on something new. Turning a value, playing and the music do not restart it.
- **Numbers (my call, tuned by eye):** the pause 1 s, 30 pixels a second, the gap 18 pixels (three
  letters), counted on the device's sample clock, so a replay scrolls the same.

Every other text that does not fit is shortened with "…": a long value keeps its label short ("Sam…"
next to a long file name), and a sound name longer than 12 characters is shortened in the names
column of STEP ("Žluťoučký k…") **(my call: 12)**.
```

- [ ] **Step 3: Look, "Testing".** In "Ordinary tests", after "shortening with "…";" add "scrolling
      text: only under the cursor, the pause, a pixel at a time, the loop and its gap, the cut at
      the box's edges;".

- [ ] **Step 4: The overview.** In "Milestone 1 is planned in three plans", replace "It is designed
      then, starting from the EP-133; until it is built, text is shortened with "…" (Look)." with
      "It was designed on 2026-11-16, starting from the EP-133; Look, "The font", holds the design."

- [ ] **Step 5: Sound, "Second oscillator".** Replace "a name that does not fit is shortened with
      "…" as Look says, until scrolling text replaces that." with "a name that does not fit scrolls
      under the cursor and is shortened with "…" elsewhere, as Look says."

- [ ] **Step 6: Check.** `git diff --stat` shows the three spec files only, and
      `grep -n "until scrolling text\|designed then, starting" docs/superpowers/specs/*.md` finds
      nothing.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-11-07-groovebox-look-design.md docs/superpowers/specs/2026-10-26-groovebox-core-browser-design.md docs/superpowers/specs/2026-11-03-groovebox-sound-design.md
git commit -m "Record the scrolling text decisions in the groovebox specs"
```

---

### Task 2: Draw a text in its box, scrolled or shortened

**Files:**

- Modify: `packages/groovebox-core/crates/groovebox-core/src/ui/text.rs`

**Interfaces:**

- Produces:
  - `pub const SCROLL_PAUSE: u64 = 48_000;` samples a scrolling text holds still at its start each
    round.
  - `pub const SCROLL_PIXEL: u64 = 1_600;` samples per pixel it moves.
  - `pub const SCROLL_GAP: i32 = 18;` pixels between its last letter's ink and its first letter
    coming round.
  - `pub fn draw_in(canvas: &mut impl Canvas, x: i32, row: i32, room: i32, text: &str, scroll: Option<u64>, color: Color) -> bool`:
    draws `text` with its first cell at (`x`, `row`) in the `room` pixels from `x`. A text at most
    `room` wide is drawn whole. A wider one is drawn as `draw_fitted(fit(text, room))` when `scroll`
    is `None`; when it is `Some(elapsed)`, `elapsed` samples after the cursor landed, it is drawn
    scrolled and cut to columns `x` to `x + room - 1`. Returns whether it scrolls.

- [ ] **Step 1: Write the failing tests** in `text.rs`'s test module. "Kicks" is 29 px wide, so in a
      23 px room its loop is 29 + 18 = 47 px and one round lasts `SCROLL_PAUSE + 47 * SCROLL_PIXEL`.
      A test helper `fn scrolled_by(offset: i32) -> Screen` draws "Kicks" at `10 - offset` and at
      `10 - offset + 47` on a fresh screen and blanks every column outside 10 to 32; each scroll
      test compares the whole screen with it.

```rust
#[test] fn a_text_that_fits_is_drawn_whole_and_never_moves() {
    // draw_in(&mut s, 10, 0, 23, "Kick", Some(SCROLL_PAUSE + 5 * SCROLL_PIXEL), TEXT) == false
    // and s equals draw(&mut e, 10, 0, "Kick", TEXT); the same with scroll None
}
#[test] fn a_text_not_under_the_cursor_is_shortened() {
    // draw_in(&mut s, 10, 0, 23, "Kicks", None, TEXT) == false and s equals
    // draw_fitted(&mut e, 10, 0, fit("Kicks", 23), TEXT)
}
#[test] fn a_scrolling_text_holds_still_at_its_start_for_the_pause() {
    // at Some(0) and Some(SCROLL_PAUSE + SCROLL_PIXEL - 1): returns true, s equals scrolled_by(0):
    // "Kick" from column 10, no "…", no ink outside columns 10 to 32
}
#[test] fn then_it_moves_a_pixel_each_pixel_time() {
    // Some(SCROLL_PAUSE + 5 * SCROLL_PIXEL) equals scrolled_by(5)
}
#[test] fn after_its_end_and_the_gap_it_comes_round_and_pauses_again() {
    // Some(SCROLL_PAUSE + 41 * SCROLL_PIXEL) equals scrolled_by(41): the first letter back 6 px
    // into the box; Some(SCROLL_PAUSE + 47 * SCROLL_PIXEL) equals scrolled_by(0), the next round's
    // pause; Some(2 * SCROLL_PAUSE + 48 * SCROLL_PIXEL) equals scrolled_by(1)
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cargo test -p groovebox-core ui::text` (from `packages/groovebox-core`) Expected: FAIL to
compile: `draw_in`, `SCROLL_PAUSE`, `SCROLL_PIXEL` and `SCROLL_GAP` not found.

- [ ] **Step 3: Implement** the constants and `draw_in` in `text.rs`. The offset for `elapsed` is

```rust
// The loop is the text and the gap; each round holds still for the pause, then moves through it.
let period = width(text) + SCROLL_GAP;
let offset = ((elapsed % (SCROLL_PAUSE + period as u64 * SCROLL_PIXEL))
    .saturating_sub(SCROLL_PAUSE) / SCROLL_PIXEL) as i32;
```

and the text is drawn at `x - offset` and at `x - offset + period`. Cut it with a private
`struct Clip<'a, C> { canvas: &'a mut C, left: i32, right: i32 }` whose `Canvas::fill_rect` passes
on only the part of the rectangle in columns `left` to `right - 1`; the trait's own `glyph` and
`hline` reach it through `fill_rect`, so `draw` cuts glyphs mid-letter for free.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cargo test -p groovebox-core ui::text` Expected: PASS, the existing `fit` tests included.

- [ ] **Step 5: Lint**

Run: `cargo clippy --workspace --all-targets -- --deny warnings` Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add packages/groovebox-core/crates/groovebox-core/src/ui/text.rs
git commit -m "Scroll groovebox text in its box"
```

---

### Task 3: Scroll the text under the cursor

**Files:**

- Modify: `packages/groovebox-core/crates/groovebox-core/src/ui/item.rs`
- Modify: `packages/groovebox-core/crates/groovebox-core/src/ui/list.rs`
- Modify: `packages/groovebox-core/crates/groovebox-core/src/ui/tiles.rs`
- Modify: `packages/groovebox-core/crates/groovebox-core/src/ui/frame.rs` (`draw_strip` passes
  `None`)
- Modify: `packages/groovebox-core/crates/groovebox-core/src/control/mod.rs`
- Modify: `packages/groovebox-core/crates/groovebox-core/src/control/draw.rs`
- Modify: `packages/groovebox-core/crates/groovebox-core/src/control/tests.rs` and
  `control/tests/sound.rs` (the existing calls of the four widgets gain `None` or `0`)

**Interfaces:**

- Consumes: `text::draw_in`, `SCROLL_PAUSE`, `SCROLL_PIXEL` (Task 2).
- Produces:
  - `pub fn draw_item(canvas, x, y, width, item: &ItemView, numbered: bool, scroll: Option<u64>) -> bool`:
    the name goes through `draw_in` with its room as today; the value is always whole.
  - `pub fn draw_rows(canvas, rows: &[Row], first: usize, cursor: Option<usize>, elapsed: u64) -> bool`:
    the cursor's row scrolls with `elapsed`, the others are shortened.
  - `pub fn draw_tiles(canvas, tiles: &[Tile; 16], elapsed: u64) -> bool`: the `Current` tile
    scrolls.
  - `pub fn draw_pad_tiles(canvas, pads: &[PadTile; 12], elapsed: u64) -> bool`: the selected pad
    scrolls.
  - Each returns whether one of its texts scrolls. `draw_strip` keeps its signature and passes
    `None`.
  - `Control` gains `now: u64` (the `until` of the latest `step`), `landed: u64` (the sample of the
    event after which the cursor last landed on something new) and `focus: Option<Focus>`, `None`
    until the first event. `Focus` is a private `#[derive(Clone, Copy, PartialEq, Eq)]` struct of
    what the scrolling texts depend on (S4): the overlay (`overlay()`), the screen, the shown page
    of `screen.paged()` and that page's cursor item, the picker's highlighted row, the current
    track, its selected pad and its selected sound. `step` works it out after each event, where it
    already keeps the cursors, and when it differs from `focus` stores it and sets `landed` to that
    event's sample (the input's or the repeat's). `step` sets `now = until` at its end.
  - `Control::draw` passes `self.now - self.landed` as the elapsed time: `Some` of it to the
    cursor's item only, and to the rows, tiles and pad tiles.

- [ ] **Step 1: Write the failing widget tests.** `LONG` is a 100-character test constant:
      `"Žluťoučký kůň úpěl ďábelské ódy, Žluťoučký kůň úpěl ďábelské ódy, Žluťoučký kůň úpěl ďábelské ódy"`.
      `MOVED` is `SCROLL_PAUSE + 30 * SCROLL_PIXEL`.

```rust
// item.rs
#[test] fn the_name_under_the_cursor_scrolls_and_the_value_stays() {
    // draw_item(s, 2, 143, 160, "Oscillator 2 fine tune" / "+0" / Fill(32_767), true, Some(MOVED))
    // == true; the value's columns 148..=158 equal the None picture's; DIM ink of the name row
    // (143..=155) only in columns 16..=141; the None picture still reads "Oscillator 2 fine tu…"
    // and returns false
}
#[test] fn a_name_that_fits_does_not_scroll() {
    // "Cutoff" / "64%" with Some(MOVED) == false and equals the None picture
}
// list.rs
#[test] fn the_row_under_the_cursor_scrolls_up_to_its_label() {
    // rows [LONG with Some("synth"), LONG with Some("synth")], first 0, cursor Some(0), MOVED:
    // returns true; row 0's TEXT ink only in columns 5..=439 (6 px before "synth"); "synth" at the
    // same columns as with no cursor; row 1 equals its shortened picture with "…"
}
// tiles.rs
#[test] fn only_the_current_tile_scrolls() {
    // tile 0 Current and tile 1 Exists, both named "Filter envelope 2" (101 px in a 95 px room),
    // elapsed MOVED: returns true; tile 0's ACCENT name ink only in columns 21..=115; tile 1 reads
    // "Filter envelope…"; with every name fitting it returns false
}
#[test] fn only_the_selected_pad_scrolls() {
    // pads 0 (selected) and 1 named "Hat open take3" (83 px in 72), elapsed MOVED: returns true;
    // pad 0's ACCENT name ink only in columns 167..=238; pad 1 reads "Hat open ta…"
}
```

- [ ] **Step 2: Write the failing control tests** in `control/tests/sound.rs`. `on_fine_tune(rig)`
      is a helper: `synth_on(0)`, `menu(0, 2)`, `page(10, 1)` and taps of DOWN at 20, 22 … 32, so
      the cursor lands on item 8, "Oscillator 2 fine tune", at sample 32. `item_8(elapsed)` draws
      the expected item as the existing `oscillator_2_names_give_way_to_their_values` does, with
      `Some(elapsed)`; each test compares columns 2..=161, rows 143..=159.

```rust
#[test] fn the_name_under_the_cursor_holds_still_then_scrolls() {
    // step(32 + 24_000): equals item_8(0); step(32 + MOVED): equals item_8(MOVED)
}
#[test] fn landing_counts_from_the_press_not_the_step() {
    // only one step, at 32 + SCROLL_PAUSE + 7 * SCROLL_PIXEL, after every input: equals
    // item_8(SCROLL_PAUSE + 7 * SCROLL_PIXEL)
}
#[test] fn leaving_the_name_shortens_it_and_coming_back_starts_it_again() {
    // tap UP at 32 + MOVED: item 8 reads "Oscillator 2 fine tu…" again; tap DOWN at t = 32 +
    // MOVED + 100; step(t + 1_000): equals item_8(0)
}
#[test] fn a_pad_hit_does_not_restart_the_scroll() {
    // hit and release pad 1 (already selected) at 32 + SCROLL_PAUSE; step(32 + MOVED): equals
    // item_8(MOVED)
}
#[test] fn a_value_change_keeps_the_name_moving_within_its_new_room() {
    // ten taps of PLUS from 32 + SCROLL_PAUSE, 2 samples apart: the value reads "+10"; step(32 +
    // MOVED): rows 143..=155 equal draw_item(name, "+10", …, Some(MOVED)); DIM ink of the name row
    // only in columns 16..=135
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `cargo test -p groovebox-core -- ui:: control::` Expected: FAIL to compile on the new
parameters, then the control tests FAIL on the pictures.

- [ ] **Step 4: Implement** the widget parameters (each name through `draw_in`, returning the `||`
      of what scrolls), `draw_strip`'s `None`, the existing tests' extra arguments, and `Control`'s
      `now`, `landed` and `focus` as the Interfaces say. In `Control::draw` the items take
      `(index == cursor.item).then_some(elapsed)`; the picker's rows, the tiles and the pad tiles
      take `elapsed`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cargo test -p groovebox-core -- ui:: control::` Expected: PASS, every existing test included
(their names all fit or are off the cursor).

- [ ] **Step 6: Lint**

Run: `cargo clippy --workspace --all-targets -- --deny warnings` Expected: no warnings.

- [ ] **Step 7: Commit**

```bash
git add packages/groovebox-core/crates/groovebox-core/src/ui packages/groovebox-core/crates/groovebox-core/src/control
git commit -m "Scroll the groovebox text under the cursor"
```

---

### Task 4: Redraw while a text scrolls

**Files:**

- Modify: `packages/groovebox-core/crates/groovebox-core/src/control/mod.rs`
- Modify: `packages/groovebox-core/crates/groovebox-core/src/control/draw.rs`
- Test: `control/tests.rs` and `control/tests/sound.rs`

**Interfaces:**

- Consumes: the widgets' `bool` returns and `now`, `landed` (Task 3); `SCROLL_PIXEL` (Task 2).
- Produces: `Control` gains `scrolling: core::cell::Cell<bool>`, which `draw` (still `&self`) sets
  to whether any widget scrolled. `step` returns `true` also when `scrolling` is set and
  `(until - landed) / SCROLL_PIXEL` differs from `(now - landed) / SCROLL_PIXEL` for the `now` of
  the step before (saturating where `landed` is newer). Its doc comment names the new case.

- [ ] **Step 1: Write the failing tests**

```rust
// control/tests.rs
#[test] fn nothing_redraws_on_time_alone_when_nothing_scrolls() {
    // a new rig: step(128) == true and a draw, then steps every 128 samples up to 200_064 all
    // return false
}
// control/tests/sound.rs
#[test] fn a_scrolling_name_redraws_once_per_pixel_it_moves() {
    // on_fine_tune; step(32 + SCROLL_PAUSE) and draw once (picture) so that `scrolling` is set;
    // then steps at 32 + SCROLL_PAUSE + 128 * k for k in 1..=125: exactly 10 return true, each
    // followed by a draw, as Device::step does
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cargo test -p groovebox-core redraw` Expected:
`a_scrolling_name_redraws_once_per_pixel_it_moves` FAILS (0 redraws);
`nothing_redraws_on_time_alone_when_nothing_scrolls` passes already and must keep passing.

- [ ] **Step 3: Implement** `scrolling` and the extra redraw case as the Interfaces say. Mark the
      known limit in the code:
      `// shortcut: a scrolling text also redraws each pixel time during     its pause, an identical picture; compare offsets if the hardware's redraw cost matters.`

- [ ] **Step 4: Run the tests to see them pass**

Run: `cargo test -p groovebox-core redraw` then `cargo test -p groovebox-core device` Expected:
PASS, `step_redraws_on_the_first_step_and_after_an_event` and
`a_step_without_a_change_does_not_flip` included.

- [ ] **Step 5: Lint**

Run: `cargo clippy --workspace --all-targets -- --deny warnings` Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add packages/groovebox-core/crates/groovebox-core/src/control
git commit -m "Redraw the groovebox screen while a text scrolls"
```

---

### Task 5: The scrolling text scene, the gallery and the changeset

**Files:**

- Create: `packages/groovebox-core/scenes/scrolling-text.scene` and, by blessing, its
  `.fingerprints` and `scrolling-text/frame-*.png`
- Modify: `apps/groovebox/source/gallery/states.ts`
- Create: `.changeset/groovebox-scrolling-text.md`

**Interfaces:**

- Consumes: everything above, through the panel's own inputs.

- [ ] **Step 1: Write the scene.** Lines 1 to 17 of `synth-pages.scene` (Syn 1 on pad 1, then PAGE +
      step 2 for the Synth page, released at 24000), then:

```text
# Down seven times to item 8, Oscillator 2 fine tune, too long beside its value: the last press at
# 44800 is where the scroll starts.
input 25600 press down
input 27200 release down
… the same at 28800, 32000, 35200, 38400, 41600 and 44800, each released 1600 later …
# Holding still at its start: "Oscillator 2 fine tun", cut at the box, no "…".
frame 69120
# 30 pixels on: the name has moved five letters left.
frame 140800
# 140 pixels on: the name has gone round; a 9 pixel gap, then the name again from its first letter.
frame 316800
# The next round: holding still at its start again, the same picture as at 69120.
frame 340992
# Up to item 7: item 8 reads "Oscillator 2 fine tu…" again and Oscillator 2 interval fits.
input 345600 press up
input 347200 release up
frame 352000
end 355200
```

Every frame sits on a multiple of 128, as in every scene.

- [ ] **Step 2: Record the frames**

Run (from `packages/groovebox-core`): `node build.js && node build.js --fallback`, then
`GROOVEBOX_BLESS=1 cargo test -p groovebox-drift --test drift` Expected: PASS, the three builds
agree; `scenes/scrolling-text/` holds five PNGs.

- [ ] **Step 3: Check the frames by eye** against the scene's comments: at 69120 the name starts at
      its first letter and stops at the box with no "…"; at 140800 it starts with "lator 2"; at
      316800 the box starts with a 9 pixel gap, then "Oscillator"; 340992 looks like 69120; at
      352000 item 8 reads "Oscillator 2 fine tu…" with the cursor on item 7. The value "+0" never
      moves. Every other drift frame is unchanged:
      `git status --short packages/groovebox-core/scenes` lists only the new files.

- [ ] **Step 4: Run the drift test unblessed**

Run: `cargo test -p groovebox-drift --test drift` Expected: PASS.

- [ ] **Step 5: Add the gallery states** after "SOUND Voice page" in `states.ts`, none with an
      approved picture:

```ts
{title: 'SOUND Synth page, Oscillator 2 fine tune holding still', frame: 'scrolling-text/frame-69120.png'},
{title: 'SOUND Synth page, Oscillator 2 fine tune scrolled 30 pixels', frame: 'scrolling-text/frame-140800.png'},
{title: 'SOUND Synth page, Oscillator 2 fine tune coming round', frame: 'scrolling-text/frame-316800.png'},
{title: 'SOUND Synth page, Oscillator 2 fine tune shortened after the cursor left', frame: 'scrolling-text/frame-352000.png'},
```

Run (from `apps/groovebox`): `npx vitest run tests/gallery.test.ts`,
`npx eslint source/gallery/states.ts` and `npm run typecheck` Expected: PASS, no lint errors (let
the formatter wrap the lines as the file does).

- [ ] **Step 6: Add the changeset** `.changeset/groovebox-scrolling-text.md`:

```markdown
---
'groovebox': minor
'groovebox-core': minor
---

Made the groovebox text under the cursor scroll in place when it does not fit.
```

- [ ] **Step 7: Commit**

```bash
git add packages/groovebox-core/scenes apps/groovebox/source/gallery/states.ts .changeset/groovebox-scrolling-text.md
git commit -m "Add the groovebox scrolling text scene and gallery states"
```
