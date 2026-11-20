# Groovebox Timing and Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 2 of 4 for Milestone 3 ("A looping pattern"). Plan 1 is playing a pattern
(`2026-11-19-groovebox-playing-a-pattern.md`), plan 3 the STEP view, plan 4 mix, mute and track
effects. This plan is written against plan 1's interfaces, so plan 1 is built first.

**Goal:** Tempo, the metronome, signatures and lengths. Tempo moves 1 BPM a click and 0.1 with
SHIFT, at once even while playing, on PATTERN's Timing page and on the timing strip, which holding
TEMPO shows on every screen. A tap of TEMPO turns the metronome on or off; it clicks every beat
while the pattern plays, the bar's first beat higher. LENGTH and SIGNATURE on PATTERN's Bars page
open pickers, ask before they delete notes and, while playing, take hold at the next bar line. While
playing, the step buttons and the header follow the bar that plays, and PLAY while playing follows
again.

**Architecture:**

- **Both sequencers keep a meter:** from a bar line on, the pattern's length and signature. A meter
  or tempo change while playing waits for its tick (a bar line, or the first tick after the input)
  and then takes over. At most one of each kind waits; a later one replaces it. The sequencers also
  give the beats.
- **The control part's player reaches each event's sample before the event,** so what an event reads
  of the music depends on the inputs alone, never on the host's batches.
- **The click** is a small voice in the audio part. Beats start it while METRONOME is on, and it
  joins the mix before the soft clipper at METRONOME LEVEL, beside the preview.
- **A length or signature change** changes the project's record at once and sends the meter. The
  notes it no longer fits are removed before the next event, one bar's range at a time, so it never
  needs more than the reserve of note memory.
- **Following** is worked out, not stored: while it is on and the music plays, the cursor's bar is
  the bar playing.

**Tech Stack:** as before: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md) is the main spec: "Bars, time
  signatures and the grid", "Transport and tempo" (Tempo, The TEMPO button, Metronome), "Following
  the music", "The PATTERN screen" (TIMING, BARS), "Controls and bindings", "What the header gains".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "Big edits" (a length or
  signature change), "Undo, the clipboard and running out of memory" (counting memory), "Device
  settings".
- [Sound](../specs/2026-11-03-groovebox-sound-design.md): "Mixing and master" (the click).
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "Musical time", "Parameters".
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "Velocity and pressure"
  (SETTINGS).
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header" (the metronome icon), "The
  strip" (the timing strip), "The lights" (TEMPO), "The other screens" (SETTINGS, PATTERN);
  `timing-strip.png`, `menu-held.png` and the Look rig's `drawHeader` and `metronomeIcon`.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- The EP-133 guide's text saved for plan 1:
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\9118a0fc-20da-4a21-9883-27f2a051918e\scratchpad\ep133txt\`
  (tempo 40 to 399 BPM; a pattern 1 bar long to start with, changed one bar at a time up to 99; the
  metronome "record only" by default, its volume on the tempo screen). It settles none of the points
  below.

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point         | Answer                                                                         |
| --- | ------------- | ------------------------------------------------------------------------------ |
| 1   | LENGTH's list | 1, 2, 4, 8, 16, 32 and 64 bars (2026-11-20; the EP-133 has every length to 99) |

### Settled by the specs, the pictures or the code

| #   | Point                  | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | The TEMPO entry        | The master list's first project entry: ID 100, "Tempo", 3,000 to 30,000 hundredths of a BPM, default 12,000, kept in plan 1's `Project.tempo`. A new curve, `Curve::Tempo`: 100 a click and 10 with SHIFT (Workflow B), stopping at the ends; shown with one decimal, rounded half up ("120.0"); its bar fills by its place in 30 to 300 (`timing-strip.png`)                                                                                                                                                                                                                                                                                                                                                                                                   |
| S2  | A tempo change         | At once (Workflow B). While playing the music goes on at the new tempo from the first tick after the input: `Run { anchor: run.sample(t), tick: t, tempo }`, sent as `Tempo { run }`. Notes sounding keep their end (Project model); notes not yet started follow the new tempo. While stopped only the project changes, and the next PLAY carries it                                                                                                                                                                                                                                                                                                                                                                                                           |
| S3  | GRID                   | An item, "Grid" and "1/16" over the bare track, that turns, − and + and OK leave alone (Workflow B: "GRID shows 1/16 and does nothing"). It becomes an entry of the master list when it can change; until then there is nothing to store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| S4  | The PATTERN screen     | MENU + 9, tile "9 Pattern" (`menu-held.png`), header "Pattern Timing" or "Pattern Bars". Timing (PAGE + 1): Tempo on encoder 1, Grid on 2. Bars (PAGE + 2): Length on 1, Signature on 2. Swing and Quantize join Timing, and the Patterns page joins the screen, when swing, recording and the pattern list are built                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S5  | The TEMPO button       | Held and not taken: the encoders hold Timing's items on every screen and the strip shows them; letting go brings back what was there (Workflow B). A turn moves the value; the cursor moves to the item where the screen shows the Timing page and stays everywhere else, as the item is not there to move to. With a picker or question open the encoders hold nothing, as always. A tap (`Release::Tap`) flips METRONOME. TEMPO is taken with a picker or question open (built) and under MENU or PAGE, as COPY is                                                                                                                                                                                                                                            |
| S6  | The metronome settings | Device entries: METRONOME (ID 3, a switch, Off: Workflow B) and METRONOME LEVEL (ID 4, a level in percent, 512 a click, gliding over 128 samples as Volume does; default `METRONOME_LEVEL_DEFAULT`, 32,768 to start, tuned by ear: Workflow B). SETTINGS' Playing page: Velocity, Metronome, Metronome level on encoders 1 to 3; Count-in joins with the count-in (Milestone 4)                                                                                                                                                                                                                                                                                                                                                                                 |
| S7  | The beats              | While playing: every 1,920 ticks in x/4 and every 960 in x/8, counted from each bar's start, the bar's first beat marked (Workflow B). At one sample, ends come first, then the beat, then starts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| S8  | The click              | Each beat starts it while METRONOME is on: a sine from phase 0 at 1,000 Hz, at 2,000 Hz on a bar's first beat, its gain falling by `CLICK_DECAY` every sample (a 5 ms time constant), 1,440 samples (30 ms) long; a new beat restarts it. It joins after the tracks and before the soft clipper at METRONOME LEVEL, beside the preview (Sound); the output volume follows. STOP lets it finish; STOP while stopped silences it within the chunk. Sound and level are starting values that the owner tunes by ear in Task 10                                                                                                                                                                                                                                     |
| S9  | The metronome shows    | TEMPO lit while METRONOME is on (Look). The header's transport ends with the metronome icon: dim, 7 px wide on the capitals' rows 4 to 10, 6 px after the tempo, ending at x 475 (the rig's `metronomeIcon` and its order). Milestone 4's record dot goes between them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S10 | LENGTH                 | "Length", "1 bar" or "4 bars" over the bare track. OK, or a push of its encoder, opens a picker of "1 bar", "2 bars", "4 bars" to "64 bars" (answer 1) on the current length; turns, − and + do nothing (Workflow B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S11 | SIGNATURE              | "Signature", "7/8" over the bare track; opened as LENGTH is. The picker lists 1/4 to 16/4, then 1/8 to 16/8, opening on the current one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| S12 | A choice               | The current value changes nothing. Otherwise the notes the choice no longer fits are counted over the four tracks: for LENGTH those of the current pattern in bars past the new length, for SIGNATURE those of every pattern past each bar's new end. None: it applies at once. Some: the question "Delete 24 notes?" ("Delete 1 note?") with "OK deletes, Cancel keeps" and no count line (Workflow B; Look's questions). OK applies; a tap of CANCEL keeps everything                                                                                                                                                                                                                                                                                         |
| S13 | Applying a change      | The project's record changes at once, so the step buttons, taps and the header use it at once. A cursor bar past the new length goes to the last bar, a cursor step past the new bar's end to its last sixteenth. Lengthening adds empty bars (Workflow B). Both sequencers get the `Meter`: while stopped they take it at once; while playing it takes hold at the bar line `next_bar_line(sample + EDIT_LEAD)` names, so the bar under the music keeps its length (Project model), with the bar after the one ending there, or bar 1 when that is past the new length                                                                                                                                                                                         |
| S14 | Two changes in a bar   | A change while another waits for its bar line takes that same bar line and replaces it, so at most one meter waits. The audio part may then get it a little late: a meter whose bar line has passed takes over at once from where the music is, and starts nothing that already started                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| S15 | Removing what goes     | Before the next event (the Project model's "background", which waits for undo from Milestone 4 on). Track by track of each pattern the change touches: one removal per bar's tail (SIGNATURE) or one of the bars past the end (LENGTH), each copying only its two edge paths. Another pattern's tree is swapped at once. The current pattern's is published (plan 1's `edit`) when its track is done, or sooner when fewer than `RESERVE` blocks are ready, and the step waits for reports there. While any is left the step handles no event (as POOL's S17). Live blocks never grow, so it never needs more than the reserve and never waits for good (Project model: length and signature changes only ever free memory). `Sound.notes` drops with each note |
| S16 | Following              | PLAY, SHIFT + PLAY (also a jump: it starts the music from the cursor's bar) and PLAY while playing follow (Workflow B). While following and playing, the cursor's bar is the bar playing at that sample, or the last bar while a bar past a new shorter length plays out; the step buttons, their lights and the header's first bar number use it. STOP leaves the cursor on the bar that played. PLAY while playing sends nothing. Nothing ends following in this plan: plan 3's arrows do                                                                                                                                                                                                                                                                     |
| S17 | A step's tap           | Acts on the bar shown when the step went down (`Buttons::pressed_at`), so a bar line between press and release never moves the note into the next bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S18 | Long and short bars    | Plan 1's step rules with signatures: 3/4 leaves steps 13 to 16 dark and doing nothing; 5/4 is a page of 16 and one of 4; 16/4 is four pages (Workflow B). No control in this plan moves the cursor's step to a later page; plan 3's arrows do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S19 | The player             | The control part's `player` advances to each event's sample before the event, as well as to `until` after the events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S20 | Messages               | `Tempo { run }` and `Meter { meter }`; `MAX_MESSAGES_PER_EVENT` stays 9 and `MAX_VERSIONS_PER_EVENT` 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Overview open points this plan settles

Task 1 writes these into the specs they belong to and takes them out of the overview's "Open points
for planning": "LENGTH limits" for the pattern's list (answer 1; a note's shortest and longest stay
open for plan 3) and "An encoder whose item is not on the screen" for TEMPO (S5; the NOTE strip's
part stays open for plan 3, ROLL's for Milestone 4).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Float functions come
  from `libm`; no fused multiply-add; no logic depends on pointer size. Code under the `harness`
  feature and `cfg(test)` may use `std`.
- 48 kHz; the core's own 32-sample chunks; every message applies at the first chunk start at or
  after its sample; the output does not depend on the host's batch size.
- Time: 1,920 ticks a beat; `sample = anchor + (tick − anchor_tick) × 150_000 / tempo` in 64-bit
  integers, rounded down, tempo in hundredths of a BPM (Foundation). At 120 BPM a tick is 12.5
  samples, a sixteenth 6,000 samples and a 4/4 bar 96,000.
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds; plan 1 ends near
  2,015,000 bytes and this plan adds well under a kilobyte. If it outgrows the budget, report the
  size and stop: the budget is the owner's.
- Plan 1's note memory rules hold: the audio part never waits and never writes note memory; the
  control part writes only blocks no version it sent can reach.
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
  - From Task 2 on, frames of existing scenes change (SETTINGS' items, MENU's tile 9); Task 10
    re-blesses every scene once. Tasks 2 to 9 do not run the drift tests.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **Deleted notes coming back.** A shrink followed by a lengthening must not bring back what the
   shrink deleted, also when the second choice follows the first at once. Pinned in Task 8
   (`lengthening_after_a_shrink_brings_nothing_back`).
2. **The bar under the music.** A change while playing must leave the playing bar's length alone, a
   shorter length must wrap at the bar line, a second change in the bar must take the first one's
   bar line, and a late meter must start nothing twice. Pinned in Task 3
   (`a_meter_takes_over_at_its_bar_line`, `a_late_meter_takes_over_where_the_music_is`) and Task 7
   (`a_second_change_in_the_bar_takes_the_same_bar_line`).
3. **A tempo change over a sounding note.** The note keeps its end; notes not yet started move; none
   starts twice when the change comes late. Pinned in Task 3
   (`a_tempo_change_keeps_sounding_ends_and_moves_the_rest`,
   `a_late_tempo_change_starts_nothing_twice`).
4. **Note memory nearly full during a removal.** The removal must publish, wait for reports and
   finish; it must never take a block that is not ready, and never stop the device for good. Pinned
   in Task 8 (`a_removal_short_of_ready_blocks_publishes_and_waits`).
5. **TEMPO's tap and the cursor.** A TEMPO press with a turn, or held long, must leave the metronome
   alone; a turn under TEMPO on another page must not move that page's cursor. Pinned in Task 6
   (`a_long_press_or_a_turn_under_tempo_leaves_the_metronome`,
   `a_turn_under_tempo_moves_the_tempo_and_leaves_the_pages_cursor`).

## Not in this plan

- **Plan 3 (the STEP view):** STEP's grid, lanes and markings; the arrows, and with them the end of
  following and the way to a later page of a long bar; the NOTE strip; the cursor on cells.
- **Plan 4:** mutes, levels, MIX, effects; the delay following the tempo; STOP while stopped
  clearing effect memory.
- **Milestone 4:** QUANTIZE, recording, the count-in and COUNT-IN, REC and the record dot, undo (the
  removal then waits for undo to move on), "Can't undo. Clear?".
- **Milestone 5:** patterns past 16, the Patterns page, switching, a fresh pattern taking the length
  of the one before, "changed", saving the tempo, the signature and the device settings.
- **Later:** SWING, a changeable GRID, hidden notes, signatures per pattern.

## Shared formats

### Entries (`src/param/mod.rs`)

```rust
Curve::Tempo   // 100 a click, 10 a fine one; shown with one decimal

pub const METRONOME_LEVEL_DEFAULT: i32 = 32_768;   // tuned by ear (S8)
pub const METRONOME: Entry;        // ID 3, "Metronome", Device, Switch, default 0
pub const METRONOME_LEVEL: Entry;  // ID 4, "Metronome level", Device, Level, Percent, click 512, glide 128
pub const TEMPO: Entry;            // ID 100, "Tempo", Project, 3_000..=30_000, default 12_000, Tempo, Unit::None, click 0
// ENTRIES, in ID order: VELOCITY, OUTPUT_VOLUME, METRONOME, METRONOME_LEVEL, TEMPO, MODE, ...
```

### The sequencer (`src/sequencer.rs`)

```rust
/// From run tick `tick`, the start of bar `bar`, the pattern loops `bars` bars of `signature`.
/// Copy, Eq.
pub struct Meter { pub tick: u64, pub bar: u16, pub bars: u16, pub signature: Signature }

Event::Beat { first: bool }
```

### Messages (`src/message.rs`)

```rust
MessageKind::Tempo { run: Run }        // S2, while playing
MessageKind::Meter { meter: Meter }    // S13
```

### Changes (`src/control/bars.rs`)

```rust
/// A choice of LENGTH or SIGNATURE. Copy, Eq.
pub enum Change { Length(u16), Signature(Signature) }
pub const LENGTHS: [u16; 7] = [1, 2, 4, 8, 16, 32, 64];
```

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `param/mod.rs`: modify (Task 2). `project/settings.rs`: its tests (Task 2).
- `sequencer.rs`: modify (Task 3).
- `message.rs`, `audio/mod.rs`: modify; `audio/click.rs`: create (Task 4).
- `control/view.rs`, `control/pages.rs`, `control/mod.rs`, `control/draw.rs`: modify (Tasks 2, 5 to
  9). `control/bars.rs`: create (Tasks 7, 8). Plan 1's `control/transport.rs` and
  `control/steps.rs`, and `control/buttons.rs`: modify (Task 9). `control/tests/timing.rs`: create
  (Task 5); `control/tests.rs`: modify (the module and the rig's helpers).
- `ui/frame.rs`: modify (Task 6).

**`packages/groovebox-core/scenes/`:** create `bars.scene` and `metronome.scene`, modify
`worst-case.scene`, re-bless all (Task 10).

**`apps/groovebox/`:** `source/gallery/states.ts`, `tests/gallery.test.ts`: modify (Task 10).

**Repo root:** `.changeset/groovebox-timing-and-bars.md`: create (Task 10). The specs: modify (Task
1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-05-groovebox-workflow-b-design.md`, `2026-11-06-groovebox-project-model-design.md`,
  `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Overview:** "Open points for planning" as listed above.
- **Workflow B:** "The grid": S3. "Changing the signature or the length": LENGTH's list (answer 1),
  SIGNATURE's list (S11), S12's current value and question, S14. "The TEMPO button": S5's cursor
  rule and TEMPO under MENU or PAGE. "Metronome": S7's order, S8's starting sound and S6's starting
  level, both tuned by ear. "Following the music": S16 (SHIFT + PLAY follows; a bar past a shorter
  length shows the last bar), S17.
- **Project model:** "Big edits": S13's bar line from the input plus the edit lead, S14, and S15's
  removal before the next event until undo exists.
- **Look:** "The header": S9's icon. "The other screens": PATTERN's Timing page holds Tempo and Grid
  until Swing and Quantize are built, its Bars page Length and Signature (S4); SETTINGS' Playing
  page holds Velocity, Metronome and Metronome level until Count-in is built (S6).

- [ ] **Step 1: Edit the four specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the timing and bars decisions in the groovebox specs"`

---

### Task 2: Tempo and metronome entries

**Files:**

- Modify: `src/param/mod.rs` (the entries, `Curve::Tempo` in `check`, `moved`, `real` and `format`),
  `src/control/pages.rs` (SETTINGS' Playing page), `src/project/settings.rs` (tests). Control tests
  that spell the Playing page's items gain the two new ones.

**Interfaces:**

- **Produces:** `Curve::Tempo`, `TEMPO`, `METRONOME`, `METRONOME_LEVEL`, `METRONOME_LEVEL_DEFAULT`
  (Shared formats). `check` takes a tempo entry with no click and no choices. `moved` on a tempo
  moves 100 a click or 10 a fine one, held within its range; `format` writes hundredths as tenths,
  rounded half up ("120.0"); `real` gives the value.

- [ ] **Step 1: Write the failing tests**

```rust
// param/mod.rs
#[test] fn tempo_moves_1_bpm_a_click_and_0_1_with_shift_within_30_and_300() {
    assert_eq!(moved(&TEMPO, 12_000, 1, false), 12_100);
    assert_eq!(moved(&TEMPO, 12_000, -3, true), 11_970);
    assert_eq!(moved(&TEMPO, 29_950, 1, false), 30_000);
    assert_eq!(moved(&TEMPO, 3_005, -1, true), 3_000);
}
#[test] fn tempo_shows_one_decimal() { /* 12_000 "120.0", 3_000 "30.0", 30_000 "300.0", 12_345 "123.5", 12_344 "123.4" */ }
#[test] fn the_list_refuses_a_tempo_with_a_click_or_choices() {}

// project/settings.rs
#[test] fn the_metronome_starts_off_at_its_level() {
    let settings = DeviceSettings::new();
    assert_eq!(settings.get(METRONOME.id), 0);
    assert_eq!(settings.get(METRONOME_LEVEL.id), METRONOME_LEVEL_DEFAULT);
}

// control/pages.rs
#[test] fn settings_playing_holds_velocity_metronome_and_its_level() { /* items Velocity, Metronome, Metronome level on encoders 0, 1, 2 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib param project::settings control::pages`. Expected: FAIL
  to compile.

- [ ] **Step 3: Implement the entries and the page**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox tempo and metronome settings"`

---

### Task 3: Meters, tempo changes and beats in the sequencer

**Files:**

- Modify: `src/sequencer.rs`.

**Interfaces:**

- **Consumes:** plan 1's `Sequencer`, `Run`, `Event`, `Sounding`, `NoteReader`, `Key`;
  `project::Signature` with `bar_ticks`.
- **Produces:** `Meter`, `Event::Beat` (Shared formats). On `Sequencer`:
  - `pub fn meter(&mut self, meter: Meter, notes: &NoteReader)`: stopped, the pattern takes `bars`
    and `signature` at once. Playing, it waits for `meter.tick`, replacing a waiting meter, and then
    every track goes on from `Key::at(meter.bar, 0)`. One whose tick has passed takes over at once
    from where the music is: nothing before that point starts (S14).
  - `pub fn retime(&mut self, run: Run)`: playing, `run` takes over at `run.tick`, replacing a
    waiting run; one whose tick has passed takes over at once, and notes and beats already given are
    not given again. Stopped, nothing.
  - `pub fn retimed(&self, sample: u64, tempo: u32) -> Run`: the run that goes on at `tempo` from
    the first tick after `sample`, counting a waiting run (S2).
  - `pub fn next_bar_line(&self, sample: u64) -> (u64, u16)`: playing, the tick of the bar line
    where a change from `sample` takes hold, and the bar that ends there: a waiting meter's tick,
    else the first bar line whose sample is `sample` or later.
  - `play` takes a waiting meter at once and drops a waiting run; tick 0 of its run is the start of
    bar 0, as in plan 1. `stop` takes a waiting meter at once and drops a waiting run.
  - `advance`: a waiting change takes over at its tick in order with the events; beats as in S7; a
    note past its bar's end or the pattern's in the meter in force is skipped.
  - `at` counts a waiting meter and run.

- [ ] **Step 1: Write the failing tests**

  As in plan 1: trees on a boxed `NoteRam`, "step k" a note at place `k × 480` of length 480, sound
  1, pitch 60, track 0; runs at 120 BPM from 0. A meter "4 bars of 4/4" is set while stopped before
  the play.

```rust
#[test] fn beats_come_every_quarter_in_4_4_and_every_eighth_in_7_8() {
    /* 4/4: Beat { first: true } at 0, Beat { first: false } at 24_000, 48_000 and 72_000, first again at 96_000;
       7/8: beats every 12_000, first at 0 and 84_000 */
}
#[test] fn retimed_goes_on_from_the_first_tick_after() {
    /* retimed(3_000, 6_000) == Run { anchor: 3_012, tick: 241, tempo: 6_000 } */
}
#[test] fn a_tempo_change_keeps_sounding_ends_and_moves_the_rest() {
    /* steps 0 and 4 of length 960; at 3_000 retime(retimed(3_000, 6_000)): End(step 0) at 12_000 as begun,
       Start(step 4) at 44_987, not 24_000 */
}
#[test] fn a_late_tempo_change_starts_nothing_twice() {
    /* steps 0, 4 and 8; advance(30_000); then retime(Run { anchor: 3_012, tick: 241, tempo: 6_000 }):
       step 4 does not start again, step 8 starts at 92_987 */
}
#[test] fn a_meter_takes_over_at_its_bar_line() {
    /* 4 bars of 4/4; at 50_000 meter(Meter { tick: 7_680, bar: 1, bars: 4, signature: 3/4 }):
       bar 0's note at place 5_760 starts at 72_000; bar 1 starts at 96_000, bar 2 at 168_000;
       bar 1's note at place 5_760 never starts */
}
#[test] fn a_shorter_length_wraps_to_bar_1_at_the_bar_line() {
    /* 4 bars, in bar index 2; meter(Meter { tick: 23_040, bar: 0, bars: 2, .. }): step 0 of bar 0 starts at 288_000 */
}
#[test] fn a_later_meter_replaces_a_waiting_one() { /* 3/4 then 7/8, both for tick 7_680: bar 2 starts at 96_000 + 84_000 */ }
#[test] fn a_late_meter_takes_over_where_the_music_is() {
    /* advance(100_000), then the meter of tick 7_680: bar 1's step 0, started at 96_000, does not start again;
       its step 4 starts at 120_000 */
}
#[test] fn while_stopped_a_meter_applies_at_once() { /* 3/4 while stopped, then play from 0: bar 1 starts at 72_000 */ }
#[test] fn play_takes_a_waiting_meter_at_once() {
    /* a 3/4 meter waiting for 7_680; play(Run { anchor: 50_000, tick: 0, tempo: 12_000 }): bar 1 starts at 122_000 */
}
#[test] fn notes_past_the_bar_or_the_length_of_the_meter_are_skipped() { /* 3/4: place 5_760 never starts; 2 bars: bar 2 never starts */ }
#[test] fn next_bar_line_and_at_count_a_waiting_change() {
    /* 4 bars of 4/4 from 0: next_bar_line(51_024) == (7_680, 0), next_bar_line(96_524) == (15_360, 1);
       with a meter waiting at 7_680: next_bar_line(96_524) == (7_680, 0); at(100_000) in its bar 1 */
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib sequencer`. Expected: FAIL to compile.

- [ ] **Step 3: Implement meters, `retime` and the beats**

  Keep the run and the meter in force and at most one waiting of each; map a tick to a sample with
  the waiting run from its tick on. A takeover re-seeks the tracks; it never moves a track's cursor
  back past a note it started.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib sequencer`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Give the groovebox sequencer meters, tempo changes and beats"`

---

### Task 4: The click and the audio part's tempo and meter

**Files:**

- Create: `src/audio/click.rs`. Modify: `src/message.rs`, `src/audio/mod.rs`.

**Interfaces:**

- **Consumes:** Task 3's `Meter`, `Event::Beat`, `meter`, `retime`; Task 2's `METRONOME`,
  `METRONOME_LEVEL`.
- **Produces:** the messages (Shared formats). `pub struct Click` with `pub const fn new() -> Self`,
  `pub fn start(&mut self, first: bool)`, `pub fn silence(&mut self)` and
  `pub fn render(&mut self, out: &mut [f32; CHUNK])` (adds its mono samples); the constants
  `CLICK_HZ` (1,000.0), `FIRST_HZ` (2,000.0), `CLICK_FRAMES` (1,440) and `CLICK_DECAY` (e^(−1/240)
  as a literal) (S8).
- In `Audio`: `Tempo` is `sequencer.retime(run)` and `Meter` is `sequencer.meter(meter, notes)`;
  `SetParam` on the device's `METRONOME` turns the clicks on or off and on `METRONOME_LEVEL` glides
  the click's level; a `Beat` starts the click while it is on; `Silence` silences it. The click
  times the level's gain (`param::real`) joins the sum the soft clipper takes, beside the preview.

- [ ] **Step 1: Write the failing tests**

```rust
// audio/click.rs
#[test] fn a_click_is_a_falling_sine_of_30_ms() {
    /* start(false): sample 0 is 0.0, it crosses zero every 24 samples, each peak lower than the one before,
       silence from sample 1_440 on */
}
#[test] fn the_first_beat_clicks_at_2_000_hz() { /* zero crossings every 12 samples */ }

// audio/mod.rs
#[test] fn while_the_metronome_is_on_each_beat_clicks() {
    /* SetParam METRONOME 1, Play on an empty pattern at 0: sound from 0, 24_000, 48_000; silence from 1_440 to 24_000 */
}
#[test] fn off_or_stopped_nothing_clicks() { /* METRONOME 0 while playing; METRONOME 1 while stopped: silence */ }
#[test] fn the_click_joins_before_the_soft_clipper_at_its_level() {
    /* at level 65_535 the output is soft_clip(click) times the volume's gain; at 32_768 the click enters at a quarter */
}
#[test] fn stop_lets_a_click_finish_and_silence_cuts_it() {
    /* a click from 0: Stop at 100 leaves it sounding to 1_440; Silence at 100 fades it over the chunk at 128, silent from 160 on */
}
#[test] fn a_tempo_message_moves_the_notes_not_yet_started() {}
#[test] fn a_meter_message_takes_hold_at_its_bar_line() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the click and the messages**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Click the groovebox metronome and take tempo and meter changes"`

---

### Task 5: The PATTERN screen's Timing page and the tempo

**Files:**

- Modify: `src/control/view.rs` (`Screen::Pattern`), `src/control/pages.rs` (`MENU[8]`, `TIMING`,
  `ItemKind::Grid`), `src/control/mod.rs` (the project scope in `value` and `set`; the step's
  player, S19), `src/control/draw.rs` (Grid's item). Create: `src/control/tests/timing.rs`.

**Interfaces:**

- **Consumes:** Task 2's `TEMPO`; Task 3's `retimed`, `retime`; Task 4's `Tempo`.
- **Produces:**
  - `Screen::Pattern`, named "Pattern", between `Settings` and `Samples` in the enum and in `ALL`;
    `paged()` is itself.
  - `pub(super) const TIMING: PageDef` ("Timing": `TEMPO` on encoder 0, `ItemKind::Grid` on 1) and
    the Bars page's place after it (Task 7 fills it).
  - `value(TEMPO.id)` reads `project.tempo`. `set(TEMPO.id, ..)` stores it and, while the player
    plays, sends `Tempo { run: player.retimed(sample, value) }` and gives the player the same
    `retime`; a project value sends no `SetParam`.
  - `step` advances the `player` to each event's sample before handling it (S19).

- [ ] **Step 1: Write the failing tests** (`control/tests/timing.rs`)

```rust
#[test] fn menu_9_shows_pattern_timing_with_tempo_and_grid() {
    /* header "Pattern Timing"; items "Tempo" "120.0" with its bar filled 9_000 of 27_000, "Grid" "1/16" bare;
       the strip's cells 1 and 2 the same */
}
#[test] fn the_tempo_moves_1_bpm_a_click_and_0_1_with_shift() { /* encoder 1 +1: "121.0" here and in the header; SHIFT −3: "120.7"; − and + too */ }
#[test] fn grid_changes_with_nothing() { /* turns, −, + and OK: "1/16", nothing sent */ }
#[test] fn a_tempo_change_while_playing_goes_on_from_the_next_tick() {
    /* PLAY at 0; encoder 1 +1 at 3_000: sent [Tempo { run: Run { anchor: 3_012, tick: 241, tempo: 12_100 } } at 3_000] */
}
#[test] fn a_tempo_change_while_stopped_sends_nothing_and_play_carries_it() {
    /* then PLAY at 9_600: Play { run: Run { anchor: 9_600, tick: 0, tempo: 12_100 } } */
}
#[test] fn an_event_reads_the_music_at_its_own_sample() {
    /* two tempo turns 600 samples apart sent in one step, and the same turns in two steps: the same runs */
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::timing`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the screen, the page, the tempo and the player's steps**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS; tests that spell MENU's tiles gain "9
  Pattern".

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox PATTERN screen and its tempo"`

---

### Task 6: The TEMPO button and what shows the metronome

**Files:**

- Modify: `src/control/mod.rs` (`press`, `release`, `encoder_items`, `reach`, `lights`),
  `src/control/draw.rs` (the header), `src/ui/frame.rs`, `src/control/tests/timing.rs`.

**Interfaces:**

- **Consumes:** Task 5's `TIMING`; Task 2's `METRONOME`.
- **Produces:**
  - `draw_header(canvas, left: &[Piece], right: &[Piece], metronome: bool)`: with `metronome` the
    icon ends the right group (S9) and the pieces end 13 px earlier. Plan 1's cut of a long sound's
    name keeps 6 px from wherever the group starts.
  - `encoder_items()` gives `TIMING`'s items while `buttons.first_held(&[Button::Tempo])` is some
    and no picker or question is open; `reach` moves the cursor only when they are the shown page's
    items (S5).
  - A TEMPO `Release::Tap` sets `METRONOME` to the other value through `set`; TEMPO is taken under
    MENU or PAGE; `lights` lights `Lights::TEMPO` while `METRONOME` is 1.

- [ ] **Step 1: Write the failing tests**

```rust
// ui/frame.rs
#[test] fn the_metronome_icon_ends_the_transport() {
    /* right "P1", "1/1", "120.0" with the metronome, in DIM: x 472 on rows 4 and 5; x 471 and 473 on rows 6 and 7;
       x 470 and 474 on rows 8 and 9; x 469 to 475 on row 10; "120.0" ends at x 462 */
}

// control/tests/timing.rs
#[test] fn holding_tempo_shows_the_timing_strip_and_letting_go_brings_the_old_one_back() {
    /* STEP with a synth selected: cells Tempo, Grid, empty, empty; after the release SOUND's Pad page's cells */
}
#[test] fn a_turn_under_tempo_moves_the_tempo_and_leaves_the_pages_cursor() {
    /* SOUND's Filter page with the cursor on Resonance: encoder 1 under TEMPO, "121.0", the cursor stays */
}
#[test] fn on_the_timing_page_a_turn_under_tempo_moves_the_cursor_as_usual() {}
#[test] fn a_tap_of_tempo_turns_the_metronome_on_and_off() {
    /* sent SetParam { target: Device, id: METRONOME.id, value: 1 }; TEMPO lit; the icon in the header;
       SETTINGS shows Metronome On; a second tap: 0, unlit, no icon */
}
#[test] fn a_long_press_or_a_turn_under_tempo_leaves_the_metronome() { /* a release HOLD after the press; a turn of encoder 1 meanwhile */ }
#[test] fn tempo_does_nothing_under_menu_page_a_picker_or_a_question() { /* no strip change, no SetParam at the release */ }
#[test] fn with_a_picker_open_under_tempo_the_encoders_hold_nothing() {
    /* TEMPO held, OK on Engine opens its picker: the strip is empty and a turn sends nothing */
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib ui::frame control::tests::timing`. Expected: FAIL.

- [ ] **Step 3: Implement the button, the strip, the light and the icon**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Show the groovebox timing strip and switch the metronome with TEMPO"`

---

### Task 7: LENGTH and SIGNATURE

**Files:**

- Create: `src/control/bars.rs`. Modify: `src/control/pages.rs` (the Bars page, `ItemKind::Length`,
  `ItemKind::Signature`), `src/control/view.rs` (`Picker::Length`, `Picker::Signature`,
  `Question::DeleteNotes`), `src/control/mod.rs` (`use_item`, OK in the pickers and on the
  question), `src/control/draw.rs` (the items, the rows, the question),
  `src/control/tests/timing.rs`.

**Interfaces:**

- **Consumes:** Task 3's `Meter`, `next_bar_line`, `meter`; Task 4's `Meter` message; plan 1's
  `Pattern`, `Signature`, `View.steps`, `budget::EDIT_LEAD`, `NoteReader::notes`.
- **Produces:**
  - `Change`, `LENGTHS` (Shared formats); the signature picker's row `r` is `r % 16 + 1` beats over
    4 for `r < 16` and over 8 after (S11).
  - `Question::DeleteNotes { count: u32, change: Change }`.
  - `fn doomed(&self, change: Change, store: &Store<'_>) -> u32`: the notes the change no longer
    fits (S12).
  - `fn reshape(&mut self, change: Change, sample: u64, messages, store)`: S13: the project's
    record, the cursor, `Meter` to the audio part and the same `meter` to the player. While playing
    the meter's bar line and the bar that ends there come from
    `player.next_bar_line(sample + EDIT_LEAD)`, and its `bar` is the next one, or 0 when that is not
    below the new length. Task 8 adds the removal.

- [ ] **Step 1: Write the failing tests**

  "Steps 13 and 15" are notes of the synth on pad 1 entered with plan 1's taps.

```rust
#[test] fn the_bars_page_holds_length_and_signature_and_turns_leave_them() {
    /* PAGE + 2: "Pattern Bars"; "Length" "1 bar", "Signature" "4/4"; turns, − and + send nothing */
}
#[test] fn ok_on_length_opens_its_list_on_the_current_length() {
    /* rows "1 bar", "2 bars", "4 bars", "8 bars", "16 bars", "32 bars", "64 bars"; highlight on row 0; the push of encoder 1 too */
}
#[test] fn the_signature_list_runs_through_x_4_then_x_8() { /* 32 rows; "4/4" highlighted on row 3; row 16 "1/8"; row 31 "16/8" */ }
#[test] fn a_choice_that_deletes_nothing_applies_at_once() {
    /* "4 bars": sent Meter { meter: Meter { tick: 0, bar: 0, bars: 4, signature: 4/4 } }; "4 bars"; header "1/4" */
}
#[test] fn choosing_the_current_value_changes_nothing() {}
#[test] fn a_choice_that_would_delete_notes_asks_first() {
    /* steps 13 and 15, then "3/4": "Delete 2 notes?" and "OK deletes, Cancel keeps"; CANCEL: still 4/4, nothing sent;
       again and OK: "3/4" and its Meter */
}
#[test] fn one_note_asks_for_1_note() { /* "Delete 1 note?" */ }
#[test] fn a_signature_change_counts_the_notes_of_every_pattern() { /* a note past 3/4 put into pattern 2 counts */ }
#[test] fn a_length_change_counts_the_current_patterns_bars_past_the_end() {}
#[test] fn while_playing_a_change_takes_hold_at_the_next_bar_line() {
    /* 4 bars playing from 0: "3/4" at 50_000 sends Meter { tick: 7_680, bar: 1, bars: 4, signature: 3/4 };
       chosen at 95_500 instead: tick 15_360, bar 2 */
}
#[test] fn a_shorter_length_while_playing_wraps_to_bar_1_at_the_next_bar_line() {
    /* in bar 3 at 200_000: "2 bars" sends Meter { tick: 23_040, bar: 0, bars: 2, .. } */
}
#[test] fn a_longer_length_while_playing_goes_on_to_the_next_bar() { /* in bar 4 of 4 at 300_000: "8 bars": tick 30_720, bar 4 */ }
#[test] fn a_second_change_in_the_bar_takes_the_same_bar_line() {
    /* "3/4" at 50_000, then "2 bars" at 95_500: the second Meter { tick: 7_680, bar: 1, bars: 2, signature: 3/4 } */
}
#[test] fn the_cursor_stays_inside_the_new_bar_and_length() { /* steps.bar 3 and "2 bars": 1; steps.step 14 and "3/4": 11 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::timing`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the page, the pickers, the question and `reshape`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Change the groovebox pattern length and time signature"`

---

### Task 8: Removing what a change no longer fits

**Files:**

- Modify: `src/control/bars.rs`, `src/control/mod.rs` (`step` runs the removal),
  `src/control/tests/timing.rs`.

**Interfaces:**

- **Consumes:** Task 7's `Change`, `reshape`; plan 1's `Store::remove`, `hold`, `release`, `ready`,
  `RESERVE`, `edit`, `Sound.notes`, `MAX_VERSIONS_PER_EVENT`.
- **Produces:**
  - `Control.trim: Option<Trim>`, set by `reshape`, where `struct Trim` holds the change, its
    sample, the pattern, track and bar it has reached and its latest tree.
  - In `step`, after the unsent `DeleteSound`s and before any event: while `trim` is some and the
    version queue has room for `MAX_VERSIONS_PER_EVENT`, the next removal. Before each, when
    `store.ready() < RESERVE`, its latest tree is committed (`edit`) and the step stops. While it is
    some, the step handles no event (S15).
  - The ranges: `Length(bars)`: `Key::at(bars, 0)..Key::MAX` once per track of the current pattern.
    `Signature(signature)`: per track of each pattern, for every bar `b` below its length,
    `Key::at(b, signature.bar_ticks())..Key::at(b + 1, 0)`. `take` counts each note off its sound's
    `notes`. The job holds its latest tree and lets go of each one it replaces with `after` none.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn the_notes_a_change_no_longer_fits_are_gone_before_the_next_event() {
    /* steps 1, 13 and 15, "3/4" with OK: the tree holds step 1 only, Sound.notes == 1; steps 13 to 16 dark */
}
#[test] fn a_length_change_removes_every_bar_past_the_end_on_every_track() {}
#[test] fn a_signature_change_removes_each_bars_tail_in_every_pattern() { /* patterns 1 and 2, bars 1 and 3 */ }
#[test] fn lengthening_after_a_shrink_brings_nothing_back() {
    /* "3/4" then "4/4" at the next sample: steps 13 and 15 dark and in no tree; the same with "1 bar" then "4 bars" */
}
#[test] fn a_sound_left_with_no_notes_is_unused() {}
#[test] fn each_current_track_is_published_once_when_memory_is_plenty() { /* one version per track that changed */ }
#[test] fn a_removal_short_of_ready_blocks_publishes_and_waits() {
    /* fewer than RESERVE ready by hand, the rest waiting on a version: the removal publishes what it has and no event is
       handled; after `applied` for the waiting versions it finishes and the next event follows */
}
#[test] fn note_memory_falls_after_a_change_that_deletes() { /* the Dev page's "Note memory" value drops */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::timing`. Expected: FAIL.

- [ ] **Step 3: Implement the removal**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Remove the groovebox notes a length or signature change no longer fits"`

---

### Task 9: Following the music, and long and short bars

**Files:**

- Modify: `src/control/view.rs` (`View.following`), `src/control/buttons.rs` (`pressed_at`), plan
  1's `src/control/transport.rs` (PLAY, SHIFT + PLAY, STOP) and `src/control/steps.rs` (the tap's
  bar), `src/control/mod.rs` (`shown_bar`, `lights`, `step_notes`), `src/control/draw.rs` (the
  header's bar), `src/control/tests/timing.rs`.

**Interfaces:**

- **Consumes:** plan 1's `View.steps`, `player`, `tap_step`, `transport`; Task 3's `at`.
- **Produces:**
  - `View.following: bool`, false in a new view.
  - `Buttons::pressed_at(&self, button: Button) -> Option<u64>`: the sample of the button's press
    while it is held.
  - `fn shown_bar(&self, sample: u64) -> u16` (S16): with `following` and the player playing, the
    bar `player.at(sample)` names, at most the pattern's last bar; otherwise `view.steps.bar`.
    `tap_step` uses it at the step's `pressed_at` (S17); the step lights, `step_notes` and the
    header's first bar number at `now`.
  - PLAY and SHIFT + PLAY set `following`, playing or not; STOP while playing first stores
    `shown_bar(sample)` in `view.steps.bar`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn while_playing_the_steps_and_the_header_follow_the_bar() {
    /* 4 bars, notes at bar 0 step 0 and bar 1 step 4; PLAY: at 103_000 step 5 lit, step 1 dark, step 2 lit for the
       music and the header "2/4 ▶2" */
}
#[test] fn stop_leaves_the_cursor_on_the_bar_that_played() { /* STOP at 200_000: "3/4"; SHIFT + PLAY then sends Run tick 15_360 */ }
#[test] fn shift_play_follows_from_the_cursors_bar() {}
#[test] fn play_while_playing_follows_again_and_sends_nothing() {
    /* following set false and steps.bar 0 by hand while bar 3 plays: PLAY sends nothing; header "3/4 ▶3" */
}
#[test] fn a_tap_lands_in_the_bar_shown_when_the_step_went_down() {
    /* press step 5 at 95_000 (bar 1), release at 97_000 (bar 2 plays): the note is at bar 0, place 1_920 */
}
#[test] fn a_bar_playing_past_a_shorter_length_shows_the_last_bar() {
    /* bar 3 of 4 plays, "2 bars": header "2/2 ▶3" until 288_000, then "1/2 ▶1" */
}
#[test] fn in_3_4_and_7_8_the_steps_past_the_bar_are_dark_and_do_nothing() {}
#[test] fn a_5_4_bar_goes_on_over_a_short_second_page() {
    /* steps.step 17 by hand: a tap of button 2 adds place 8_160; buttons 5 to 16 dark and do nothing;
       the music's step lights on that page while it plays there */
}
#[test] fn a_16_4_bar_takes_four_pages() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::timing`. Expected: FAIL.

- [ ] **Step 3: Implement following and the tap's bar**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Follow the music on the groovebox step buttons"`

---

### Task 10: Scenes, the worst case, the gallery, the changeset and a listen

**Files:**

- Create: `scenes/bars.scene`, `scenes/metronome.scene`, `.changeset/groovebox-timing-and-bars.md`.
- Modify: `scenes/worst-case.scene`, every scene's fingerprints and frames (re-blessed),
  `apps/groovebox/source/gallery/states.ts`, `apps/groovebox/tests/gallery.test.ts`.

**What the scenes do:**

- **`bars`** (Workflow B's drift scene "a signature change"): New synth on pad 1 through the panel;
  taps of steps 1, 5, 9, 13 and 15; MENU + 9, PAGE + 2, Length "4 bars"; PLAY and two bars; in bar
  2, Signature "3/4" with its question and OK; the bar line; in bar 3, Length "2 bars", which wraps
  at the next bar line; STOP and STOP. Frames: the Bars page, the Length picker, the question,
  playing in 3/4 ("3/4 ▶3"), after the wrap, after STOP.
- **`metronome`** (Workflow B's "the metronome"; Sound's "the metronome click and the sample preview
  over a loud mix"): a tap of TEMPO; a loud chord of MIDI notes; PLAY; the sample picker open on a
  previewing file; TEMPO held with encoder 1 turned, with and without SHIFT; Signature "7/8" for
  eighths; STOP while a click rings; STOP. Frames: the timing strip, SETTINGS' Playing page with
  Metronome On, the header with the icon, PATTERN's Timing page.
- **`worst-case`:** the metronome on before its busiest batches.

- [ ] **Step 1: Write the two scenes and extend `worst-case.scene`**
- [ ] **Step 2: Build and re-bless**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift -- --test-threads=1`. Expected: PASS: every scene
  plays the same natively and in both `.wasm` builds. A recorded browser scene whose `expect-audio`
  no longer matches gets the core's new fingerprint; say so in the commit.

- [ ] **Step 3: Check the operation count**

  Run: `cargo test -p groovebox-drift --test operations -- --nocapture`. Expected: PASS within
  `worst_batch_operations`; note the busiest batch. Over the budget: report and stop.

- [ ] **Step 4: The gallery**

  `states.ts` gains the frames of `bars` and `metronome` ("Pattern Bars", "Length picker", "Delete 2
  notes?", "Header playing in 3/4", "Timing strip", "Settings Playing with the metronome", "Header
  with the metronome", "Pattern Timing"), and `gallery.test.ts` lists both scenes among those whose
  every frame has a state.

  Run, from `apps/groovebox`: `npx vitest run tests/gallery.test.ts`,
  `npx eslint source/gallery/states.ts tests/gallery.test.ts`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: The changeset**

```markdown
---
'groovebox': minor
---

Added tempo, the metronome, time signatures and pattern lengths to the groovebox, with the PATTERN
screen's Timing and Bars pages, the timing strip under TEMPO and step buttons that follow the music.
```

- [ ] **Step 6: Run clippy and commit**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: no warnings.

  `git commit -m "Add the groovebox bars and metronome scenes and re-bless the scenes"`

- [ ] **Step 7: The owner listens**

  Ask the owner to run the app and listen to the click at 120 BPM in 4/4 and 7/8, alone and over a
  beat, and to its level. Change `CLICK_HZ`, `FIRST_HZ`, `CLICK_FRAMES`, `CLICK_DECAY` and
  `METRONOME_LEVEL_DEFAULT` as the owner chooses, re-bless as in Step 2 and commit with
  `git commit -m "Tune the groovebox metronome click by ear"`. Nothing changed: no commit.
