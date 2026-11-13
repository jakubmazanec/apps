# Groovebox Screens and Pads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 2 of 3 for Milestone 1 ("Make a sound"). Plan 1
([foundation](./2026-11-10-groovebox-foundation.md)) is built. Plan 3 is Sound. It comes after this
plan, because only this plan's PAD page can make a sound and only its encoders can set a value
(owner's decision of 2026-11-13, below).

**Goal:** The core gets the device's whole control surface and its first screens. You open the app
and see the panel in its true proportions with the screen inside it, and every control answers to
the mouse, the computer keyboard and MIDI. On STEP, SOUND and SETTINGS you move the cursor, use MENU
and PAGE, make Syn 1 on a pad from the sound picker, copy it, switch PADS and KEYS, change octaves
and tracks and flip VELOCITY. Pads send note messages and light up. Nothing sounds until plan 3
builds the voices.

**Architecture:**

- **Core** (`packages/groovebox-core/crates/groovebox-core`): new modules `font` (monogram, compiled
  by `build.rs`), `label` (fixed-size text), `ui` (text and the drawn parts, measured from Look's
  pictures), `param` (the master list), `project` (pool, tracks, device settings) and `lights`. Plan
  1's one-file control part becomes the `control` module: button timing, notes, screens, pages, the
  sound picker and drawing. `tone.rs` is deleted; the audio part renders silence and takes note
  messages.
- **Browser crate:** one input export for every input kind and a lights pointer.
- **Drift harness:** the full scene grammar, applied reports in every outcome, new scenes and the
  gallery's frames.
- **Shell** (`apps/groovebox`): pure input maps (keys, MIDI, knobs, holders), the panel drawn in
  true proportions from a table in millimetres, pointer handling, focus loss, MIDI access, Save
  picture and a gallery route.

**Tech Stack:** as plan 1: Rust 1.99.1, `libm`, `png` 0.18 (now also a build dependency of the core,
for the font), `wasmtime` in the drift crate; TypeScript, React Router 8, Vite, Vitest (node and
Playwright Chromium browser mode), Web MIDI.

**Spec:**

- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md) and
  [Look](../specs/2026-11-07-groovebox-look-design.md) are the main specs.
- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md): "When a button acts" and
  "Bindings".
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "Parameters" and "Bindings,
  panel layout, colours and pages".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): what a track and a sound
  hold, device settings, and what a new project opens on.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): Milestones and "Open
  points for planning".
- [Sound](../specs/2026-11-03-groovebox-sound-design.md): the order of SOUND's pages.
- Look's pictures in `docs/superpowers/specs/2026-11-07-groovebox-look/`.

## Decisions for this plan

The owner answered every open point on 2026-11-13. Task 1 writes the answers into the specs.

### The rule

Everything is built in its final state, as the later plans expect it. Nothing temporary is built,
and nothing the final version does not have. A part of the final design that needs a later feature
comes with that feature: the shell maps every control now, and each control's action is bound when
its feature is built. The app may be unusable in between.

### Plan order and Milestone 1

- Plans 2 and 3 are swapped. This plan (screens and pads) comes first; Sound follows. Every Sound
  drift scene then reaches its sound and its values by the final route: MENU + 3, the PAD page, New
  synth, PAGE + step, the encoders.
- Milestone 1 therefore also holds the pool in memory, the four tracks with their pads, selection,
  T1–T4, PADS and KEYS modes, the octave, the PAD page with its sound picker and Copy, and SETTINGS'
  Playing page with VELOCITY.
- Plan 1's `tone.rs` is deleted here. Pads send the final note messages, which nothing plays until
  plan 3. The app is silent until then.
- No `SetParam` input exists for tests: encoder turns are the final way to set a value.

### Settled by the specs, the pictures or the rule

| #   | Point                                | Settled                                                                                                                                                               |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | The first screen                     | A new project opens on STEP (Project model). STEP's grid is Milestone 3's: here STEP shows its header and strip over an empty main area                               |
| S2  | Tiles and lights under MENU and PAGE | Only screens and pages that exist (Look): STEP, SOUND and SETTINGS here; each later plan adds its own                                                                 |
| S3  | The sound picker                     | Empty, New synth, then the pool. New sample and the PAD page's Engine come with the sample engine (Milestone 2)                                                       |
| S4  | Pad tiles                            | The pad's number and its sound's name; an empty pad only its number; the selected pad in the accent (`sound-pad.png`)                                                 |
| S5  | The header on STEP                   | The screen's name only, no page name (`step-stopped.png`)                                                                                                             |
| S6  | The picker's first highlight         | The pad's current entry (`picker-sound.png`)                                                                                                                          |
| S7  | A synth sound in PADS mode           | Plays C4 (Workflow B, "What a step-entered note gets")                                                                                                                |
| S8  | Free SHIFT combinations              | SHIFT + OK, SHIFT + an encoder push and SHIFT + T1–T4 (mute comes with Milestone 3) do nothing, as answer 6 decided for SHIFT + arrows. Pads always play (Workflow B) |
| S9  | A control held by two sources        | The shell sends one press when the first source (a key, a pointer) takes it and one release when the last lets go, so the core sees one physical control              |

### The owner's answers

| #   | Point                             | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                             | The shell maps every control (mouse, keys, MIDI including aftertouch) in this plan. Inputs without a bound action reach the core, enter the session log and do nothing. COPY on the PAD page and SETTINGS with VELOCITY are in                                                                                                                                                                                                                                                                     |
| 2   | Pool size                         | 1,024 sounds per project, in working memory; `pool_sounds = 1_024` in `budget.toml`. When full, New synth and Copy change nothing, the picker closes as on any choice, no number is used up, and the header shows "Pool full" in red                                                                                                                                                                                                                                                               |
| 3   | Sound names                       | A name is a base plus a number. The base of a synth is "Syn"; of a sample, the file's name without ".wav"; a trailing space and digits count as the number. A synth always carries a number (Syn 1); the first sound of a file none (Kick). Every later sound of a base takes the highest number of that base in the pool, plus one; an unnumbered name counts as 1. The base is shortened at a character boundary so the name fits 64 bytes. Nothing extra is stored                              |
| 4a  | When a combination acts           | When its second control goes down. That control's release does nothing. Letting go of the modifier only ends it (MENU and PAGE hide their tiles; PADS/KEYS does not switch the mode; SHIFT nothing). The combination repeats while the modifier stays down. An arrow under PADS/KEYS does not repeat. PADS/KEYS + ▲ or ▼ in PADS mode does nothing but still counts as another control used                                                                                                        |
| 4b  | Other controls under MENU or PAGE | Steps switch; a dark step does nothing, its release too. Pads play and select; T1–T4, SHIFT + T1–T4, PLAY, STOP, REC, TEMPO and the volume act as usual. The arrows, OK, CANCEL, − and +, encoders 1–4 (turn and push), ROLL, PADS/KEYS and COPY are dropped. Of MENU and PAGE the first pressed counts; the other works only after its own release and a new press. A screen without pages: 16 empty tiles, no step lit, every step does nothing. One page: one tile                              |
| 5   | Hold and repeat                   | `HOLD` 14,400 samples (300 ms), `REPEAT_DELAY` 19,200 (400 ms), `REPEAT_EVERY` 2,400 (50 ms). The arrows and − and + share them. Each repeat reads SHIFT at its own moment                                                                                                                                                                                                                                                                                                                         |
| 6   | The cursor                        | ▲ ▼ move one item and stop at the ends; ◀ ▶ do nothing on a one-column page and move along a row of tiles. In a picker ▲ ▼ and − + move one row and ◀ ▶ one picker page of 16 rows, stopping at the ends. SHIFT + arrows do nothing outside STEP and ROLL. Each page remembers its cursor until the project closes, not saved. An item that vanishes moves the cursor to the nearest item above, where it stays                                                                                    |
| 7   | Encoders on STEP                  | They act in full: a turn changes the value and moves the remembered cursor of SOUND's page to the item, and STEP stays; a push is OK on the item, so a picker opens over STEP's main area and Copy runs                                                                                                                                                                                                                                                                                            |
| 8   | Fine clicks                       | A smooth entry's click size must divide by 16, checked when the core builds; a fine click is a sixteenth. The volume encoder ignores SHIFT                                                                                                                                                                                                                                                                                                                                                         |
| 9   | Pad lights                        | A pad is lit when it is the selected pad (pad 1 in KEYS mode) or one of its notes is on: from hit to release, and from a sequencer note's start to its end in Milestone 3. The control part works it out; a lit pad does not blink                                                                                                                                                                                                                                                                 |
| 10  | MIDI notes and the octave         | The core gains note inputs. PADS mode: note _n_ hits pad _n_ mod 12; each note is its own hit, and a pad is lit while any of its notes is on. KEYS mode: a note plays its own pitch within C0 to B8 (MIDI 12 to 119), other notes are ignored, the octave does not move, the note's pad lights when it is in the pads' octave, and it counts as the last key played                                                                                                                                |
| 11  | MIDI details                      | Every input on every channel, including devices plugged in later. CC 20–23 turn encoders 1–4; CC 7 the volume. A constant per number in the shell sets absolute (default) or relative (1–63 up, 65–127 down by 128 − value). Absolute: the difference from the last value is that many clicks; the first value only sets the reference. MIDI is asked for at the "Click to start" gesture; if refused, the line beside the screen says "MIDI not allowed". A note-on with velocity 0 is a note-off |
| 12  | Computer keys                     | By position (`KeyboardEvent.code`): pads Z S X D C V G B H N J M (C to B); steps 1–8 and Q–I; T1–T4 O P [ ]; PADS/KEYS \; ROLL K, MENU L, PAGE ;, COPY '; SHIFT either Shift; PLAY Space; REC , STOP . TEMPO /; OK Enter; CANCEL Escape; − and = plus the numpad's − and +; arrows on the arrow keys. No encoder keys. Free: A, F, 9, 0, `, Tab. A key with Ctrl, Alt or Meta held is ignored; only mapped keys lose their browser default; key repeat is ignored                                  |
| 13  | Encoders by mouse                 | Pointer capture; each 4 CSS px up from the press point is a click right, down a click left, no acceleration. A release after less than 4 px and no click is a push (press and release at the release's moment); the volume knob has none. The wheel adds up: 100 px of pixel delta or 3 lines is one click                                                                                                                                                                                         |
| 14  | Letting a pad go                  | A pad or a key on the panel is held from mouse down to mouse up wherever the pointer goes; a key from key down to key up. Velocity 127, no pressure                                                                                                                                                                                                                                                                                                                                                |
| 15  | Touch                             | Pointer Events tracked per `pointerId`, so each finger is its own pointer; `touch-action: none` on the panel. Nothing else touch-specific                                                                                                                                                                                                                                                                                                                                                          |
| 16  | Losing focus                      | On `blur` or when the page is hidden, the shell sends an ordinary release for every control a key or a pointer holds (a drag ends, no push). MIDI notes stay                                                                                                                                                                                                                                                                                                                                       |
| 17  | The panel in the browser          | True proportions: 1 screen pixel is 0.198 mm, so the panel is 1,622 × 647 screen pixels. One whole zoom for the whole panel, the largest that fits the window; below zoom 1 the page scrolls                                                                                                                                                                                                                                                                                                       |
| 18  | Header messages                   | A message stays until a later press of a button (the 22 function buttons, a step, an encoder push); the press that caused it does not count, and the clearing press still acts. Pads, MIDI notes, turns and the volume do not clear it. Progress stays while its work runs, then its result shows. A new message replaces the shown one. Nothing times out                                                                                                                                         |
| 19  | SETTINGS' first page              | "Playing": header "Settings Playing", tiles "1 Playing" and "2 Dev"                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 20  | Parameter IDs                     | `ParamId(u16)`, one flat space, never reused, in blocks: device 1–99 (Velocity = 1), project 100–199, track 200–299, the shared voice chain 1000–1999, one block of 1,000 per engine from 2000, one block of 1,000 per effect type from 10000. The sound, layer, track and slot are never part of an ID. A build check keeps IDs unique and in their blocks                                                                                                                                        |
| 21  | PNG export                        | A "Save picture" button beside "Save session" saves the shown frame through the core's palette at 4× (1,920 × 1,088) as `screen-<audio sample>.png`                                                                                                                                                                                                                                                                                                                                                |
| E   | The master-list entry             | ID, name, short name, scope (device, project, track, sound; pattern comes with the first pattern value), lowest, highest and default value, curve, display unit, click size (0 for counted values), list choices with permanent keys, glide time in samples (0 = changes exactly at T) and "can be modulated". No step or note scope and no "can be locked per step" (Workflow B designed them out)                                                                                                |

### Overview open points this plan settles

Task 1 removes these from the overview's "Open points for planning" and writes each answer into the
spec it belongs to:

- On the device: "When a combination acts" (4a); "MENU or PAGE held with other controls" and "MENU
  or PAGE held + a dark step" (4b); "SHIFT + arrows outside STEP and ROLL" (6); "An encoder whose
  item is not on the screen" (7); "Held − and +" (5); "How long a header message stays" (18); "The
  header on STEP and ROLL" (S5); "Pad tiles on the Pad page" (S4). "Two hold buttons at once" keeps
  only CANCEL and COPY, which Milestone 4 settles.
- Sound and settings: "Fine clicks" (8).
- Inside the core: "Pad lights" (9); "Master-list entry" (E). "Fixed table sizes" keeps library
  files, projects and queue entries.
- Browser shell: all eight points (10, 11, 12, 13, 14, 15, 16, and "Starting sound", settled by plan
  1 and answer 11).

## Global Constraints

- **The rule above:** no temporary code, no stand-in, nothing the final version does not have.
- Chromium only. Bit-identical: the same inputs give the same audio, frames, lights and messages in
  every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Functions such as
  `sinf` come from `libm`; no fused multiply-add; no logic depends on pointer size.
- 48 kHz; the core's own 32-sample chunks.
- Display 480 × 272, 8-bit indexed, two buffers. Drawing operations: fill a rectangle, horizontal
  and vertical 1-pixel lines, an outlined rectangle and a glyph. Nothing is doubled.
- A frame depends only on the core's state, never on how many frames were drawn before.
- Every control event is applied at its exact sample. Repeats are made at their exact samples by the
  control part, so the step size never changes a result.
- Look's rules: monogram, 7 px capitals, 6 px per character; a 13 px text row with 3 px above the
  capitals; text ink starts 3 px inside its box; a text is 6 × characters − 1 px wide; pieces of a
  row are 6 px apart; mixed case; full names, shortened with "…" only when they do not fit; the
  cursor is an accent outline 1 px outside the item.
- The colours are plan 1's palette entries: `BACKGROUND`, `TEXT`, `DIM`, `FAINT`, `LINE`, `ACCENT`,
  `RECORD`. The sound colours come with ROLL.
- Abstract controls (Foundation): 22 function buttons, 16 steps, 4 encoders with push switches, the
  volume encoder, 12 pads with velocity 1–127 and pressure 0–127, plus this plan's MIDI note inputs.
  Pads 0–11, steps 0–15, encoders 0–4 (4 is the volume) in code.
- GPL-3.0-or-later; dependencies GPL-compatible. monogram is CC0.
- Repo rules (as plan 1):
  - Never hand-edit files with a Carson "DO NOT EDIT" header.
  - Never remove comments.
  - Inline variables and functions used only once.
  - No em-dashes and no Oxford commas in copy, docs or commits.
  - Commit messages: imperative sentence case, no prefixes. Never mention Claude, Claude Code or
    Anthropic in commits, PRs or files.
  - Never use `git stash`; compare with `git show <rev>:<path>`.
- Run only the focused tests and checks a task names; CI runs the full suite.
  - Rust: from `packages/groovebox-core`, `cargo test -p <crate> ...` and
    `cargo clippy --workspace --all-targets -- --deny warnings`.
  - Drift tests need both `.wasm` builds first: `node build.js && node build.js --fallback`.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>`
    (expected: 0 errors) and `npm run typecheck`.

## Review Focus

1. **Repeats and the step size.** Holding ▼ in the picker across many batches must move the
   highlight on exactly the same samples whether the control part steps every 128 samples or every
   4,096. Pinned in Task 10 (`the_result_does_not_depend_on_the_step_size`).
2. **A combination's own presses.** A step pressed under MENU and let go after MENU, or PADS/KEYS
   let go after ▲, must never fire its own tap later. Pinned in Task 7
   (`a_consumed_press_never_taps`) and Task 9
   (`the_step_pressed_under_menu_does_nothing_when_let_go`).
3. **Playing with the picker open.** Pads and MIDI notes must sound but not select; T1, MENU and
   PADS/KEYS must not close the picker or act later. Pinned in Task 10
   (`with_the_picker_open_pads_sound_but_do_not_select_and_menu_waits`).
4. **Focus lost mid-combination, and two sources on one control.** MENU held on the keyboard when
   the window loses focus must leave no tiles; a pad held by a key and the mouse must send one hit
   and one release. Pinned in Task 12 (`Holders` tests) and Task 13 (`blur lets go of a held MENU`).
5. **The 1,024th sound.** New synth and Copy on a full pool must refuse, use no number, close the
   picker and keep "Pool full" through the press that caused it. Pinned in Task 5
   (`a_full_pool_refuses_and_uses_no_number`) and Task 10
   (`pool_full_shows_until_the_next_button_press`).

## Not in this plan

- **Plan 3 (Sound):** the synth engine, the shared chain, 32 voices, the master path and the volume
  encoder's action (output volume), SOUND's engine, filter, filter-envelope, volume-envelope and
  voice pages with their entries, the display maths of smooth values (Hz, dB, %, note names), and
  `SetParam` messages. Its open points: the parameter table, mono note priority, the seed, the
  timing of a taken voice and the operation count. (IDs are settled here.)
- **Milestone 2:** storage, the library, NEW SAMPLE and the sample picker, the Engine item, POOL and
  a sound selected there, SAMPLES, the Dev page.
- **Milestone 3:** STEP's grid, cursor and arrows, transport, the metronome items on SETTINGS, mute,
  MIX, FX, PATTERN, the step lights for notes and the header's transport group.
- **Milestone 4:** ROLL, recording (pressure is stored then), CANCEL and COPY held with pads, undo.
- **Milestone 5:** saving the view and the device settings, PROJECT.

**Known and not a bug:** plan 1's spike found that Chrome drives an exactly silent output from a
timer after about 30 s, at about 69 % of real time (the owner decided on 2026-11-10 to take no
action). The app is silent after this plan, so the control part steps a little slower after half a
minute.

## Shared formats

### Buttons

The core's `Button::code`, the browser export and the shell's `BUTTONS` use these codes; scenes use
the names.

| Code | Name        | Code  | Name                          | Code  | Name               |
| ---- | ----------- | ----- | ----------------------------- | ----- | ------------------ |
| 0–3  | `t1`–`t4`   | 10    | `rec`                         | 18    | `ok`               |
| 4    | `pads-keys` | 11    | `play`                        | 19    | `cancel`           |
| 5    | `roll`      | 12    | `stop`                        | 20    | `minus`            |
| 6    | `menu`      | 13    | `tempo`                       | 21    | `plus`             |
| 7    | `page`      | 14–17 | `up`, `down`, `left`, `right` | 32–47 | `step-1`–`step-16` |
| 8    | `copy`      |       |                               | 48–51 | `push-1`–`push-4`  |
| 9    | `shift`     |       |                               |       |                    |

### Inputs

`control_queue_input(sample: u64, kind: u32, a: u32, b: u32) -> u32` returns 1 when queued, 0 when
the queue is full (try again after a step) and 2 for a kind or code it does not know (dropped).
Kinds 0 and 1 are plan 1's, unchanged.

| Kind | Input            | `a`         | `b`                                      | Scene line                                                |
| ---- | ---------------- | ----------- | ---------------------------------------- | --------------------------------------------------------- |
| 0    | pad hit          | pad 0–11    | velocity 1–127                           | `input <s> pad-hit <pad> <velocity>`                      |
| 1    | pad release      | pad         |                                          | `input <s> pad-release <pad>`                             |
| 2    | pad pressure     | pad         | pressure 0–127                           | `input <s> pad-pressure <pad> <pressure>`                 |
| 3    | button press     | button code |                                          | `input <s> press <button>`                                |
| 4    | button release   | button code |                                          | `input <s> release <button>`                              |
| 5    | encoder turn     | encoder 0–4 | clicks −127 to 127, not 0, as `i32` bits | `input <s> turn <encoder-1…encoder-4 or volume> <clicks>` |
| 6    | MIDI note on     | note 0–127  | velocity 1–127                           | `input <s> note-on <note> <velocity>`                     |
| 7    | MIDI note off    | note        |                                          | `input <s> note-off <note>`                               |
| 8    | note pressure    | note        | pressure                                 | `input <s> note-pressure <note> <pressure>`               |
| 9    | channel pressure | pressure    |                                          | `input <s> channel-pressure <pressure>`                   |

The scene header stays `groovebox-scene 1`; every plan 1 line keeps its meaning.

### Lights

`lights_pointer()` gives the address of a `u64` the control side stores after every step. Bit _n_ on
means lit.

| Bits  | Light      | Bits | Light     |
| ----- | ---------- | ---- | --------- |
| 0–11  | pads 1–12  | 32   | PADS/KEYS |
| 12–27 | steps 1–16 | 33   | ROLL      |
| 28–31 | T1–T4      | 34   | REC       |
|       |            | 35   | PLAY      |
|       |            | 36   | TEMPO     |

### Screen geometry

Measured from Look's pictures; every task that draws uses these numbers (`ui/layout.rs`).

| Part             | Numbers                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header           | text row y 1–13, ink from x 4; the right group's ink ends at x 475; a `LINE` row at y 14 across x 0–479                                                                                                                                       |
| Main area        | y 15–252                                                                                                                                                                                                                                      |
| Strip            | a `LINE` row at y 253 across x 0–479; cells (x, width) (1, 120), (121, 120), (241, 119), (360, 119); items at y 254                                                                                                                           |
| Item             | 17 px: text row at +0, the 2 px bar at +14 and +15 from x + 3 to x + width − 4 (`FAINT` track, `ACCENT` fill from the left); name `DIM` at x + 3, value `TEXT` with its ink ending at x + width − 4                                           |
| Page             | items at x 2, 160 wide, the first at y 17, every 18 px; 13 fit; an encoder's digit `DIM` at x + 3 and the name 6 px after it                                                                                                                  |
| Pad tiles        | 4 × 3 tiles of 78 × 78 at x 164 + 79 × column, y 16 + 79 × row; number at (x + 3, y + 3), name on the row at y + 17; outline `LINE`, the selected pad's outline and text `ACCENT`, a number `DIM`                                             |
| MENU, PAGE tiles | 4 × 4 tiles of 118 × 58 at x 1 + 119 × column, y 16 + 59 × row; number at (x + 3, y + 3), name ink from x + 20; current: outline and text `ACCENT`; existing: outline `LINE`, number `DIM`, name `TEXT`; empty: outline `FAINT`, number `DIM` |
| Picker rows      | x 2–477, the first at y 17, every 14 px, 16 visible; text ink from x 5; a right label `DIM` ending at x 474                                                                                                                                   |
| Cursor           | an `ACCENT` outline 1 px outside: a page item at (1, y − 1, 162, 19), a picker row at (1, y − 1, 478, 15)                                                                                                                                     |

### The panel

`panel.png` is drawn at 4 px per mm with the panel's top-left corner at pixel (24, 52). Measured
rectangles in mm from the panel's top-left (x, y, width, height):

| Controls                                 | Rectangles                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Panel                                    | 321 × 128, face `#d6d6d2`, page around it `#f0f0ec`                                         |
| Volume knob, label "VOL" under it        | (8, 8, 22, 22), `#2b2b2b` with an `#ff7a2f` mark at the top                                 |
| Display module / picture                 | (87.75, 8, 105.5, 67.2) `#161616` / (93, 14.75, 95.04, 53.86): exactly the 480 × 272 screen |
| Encoders 1–4, labels "1"–"4" under them  | (216 + 25k, 8, 22, 22), as the volume knob                                                  |
| T1, T2, T3, T4, PADS/KEYS (label "PADS") | (241 + 15k, 48, 12, 12)                                                                     |
| ROLL, MENU, PAGE, COPY, SHIFT            | (241 + 15k, 63, 12, 12)                                                                     |
| REC, PLAY, STOP, TEMPO                   | (8 + 15k, 63, 12, 12)                                                                       |
| Steps 1–16                               | (8 + 15k, 80, 12, 10)                                                                       |
| −, ▲, +, OK                              | (253 + 15k, 80, 12, 18)                                                                     |
| ◀, ▼, ▶, CANCEL                          | (253 + 15k, 100, 12, 18)                                                                    |
| Pads 1–12                                | (8 + 20k, 100, 17, 17), `#2b2b2b`                                                           |

Keys are `#ecece8` with a `#969692` border and dark bold labels; a lit control is `#ffaa82`.
Positions become screen pixels by `Math.round(mm / 0.198)`; the display picture is placed at its
rounded position and is exactly 480 × 272.

## File structure

**`packages/groovebox-core/`:**

- `budget.toml`: modify. Add `pool_sounds = 1_024`.
- `crates/groovebox-core/`:
  - `Cargo.toml`: modify. `[build-dependencies] png = "0.18"`.
  - `build.rs`: modify. Also compile the font into `$OUT_DIR/font.rs`.
  - `font/monogram.fnt`, `font/monogram_0.png`: create, from commit `517abc56`
    (`apps/foam/public/`), byte-identical. `font/README.md`: the font's name, its author datagoblin,
    CC0 and its source.
  - `src/font.rs`, `src/label.rs`, `src/lights.rs`, `src/param.rs`: create.
  - `src/ui/`: `mod.rs`, `layout.rs`, `text.rs`, `item.rs`, `tiles.rs`, `list.rs`, `frame.rs`:
    create.
  - `src/project/`: `mod.rs`, `pool.rs`, `name.rs`, `track.rs`, `settings.rs`: create.
  - `src/control/`: `mod.rs` (replaces `src/control.rs`), `buttons.rs`, `notes.rs`, `view.rs`,
    `pages.rs`, `draw.rs`: create.
  - `src/input.rs`, `src/message.rs`, `src/queue.rs`, `src/audio.rs`, `src/device.rs`,
    `src/screen.rs`, `src/lib.rs`: modify. `src/tone.rs`: delete.
- `crates/groovebox-browser/src/lib.rs`: modify.
- `crates/groovebox-drift/`: `src/scene.rs`, `src/runner.rs`, `src/native.rs`, `src/wasm.rs`,
  `src/play.rs`, `tests/drift.rs`: modify. `tests/gallery.rs`: create.
- `scenes/`: delete `tone.*`; re-bless `browser-session`, `late`, `silence`; create
  `menu-and-pages`, `new-synth`, `picker-while-playing`, `midi` and `gallery/` (font and palette
  pictures).

**`apps/groovebox/`:**

- `source/shell/`: `protocol.ts`, `keyboard.ts`, `session.ts`, `present.ts`, `control.worker.ts`,
  `shell.ts`: modify. `midi.ts`, `knob.ts`, `holders.ts`, `lights.ts`, `panelLayout.ts`, `panel.ts`,
  `picture.ts`: create.
- `source/routes/_index.tsx`: modify. `source/routes/gallery.tsx`, `source/gallery/states.ts`:
  create.
- `tests/`: `keyboard.test.ts`, `session.test.ts`, `present.test.ts`, `shell.browser.test.ts`:
  modify. `midi.test.ts`, `knob.test.ts`, `holders.test.ts`, `lights.test.ts`,
  `panelLayout.test.ts`, `picture.test.ts`, `gallery.test.ts`: create.

**Repo root:** `.changeset/groovebox-screens-and-pads.md`: create. The five specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only. Every answer above goes into the spec that owns its subject, stated as the current design
(no "changed on" wording).

**Files:**

- Modify: `docs/superpowers/specs/2026-11-02-groovebox-foundation-design.md`,
  `2026-10-26-groovebox-core-browser-design.md`, `2026-11-03-groovebox-workflow-a-design.md`,
  `2026-11-05-groovebox-workflow-b-design.md`, `2026-11-07-groovebox-look-design.md`, all in
  `docs/superpowers/specs/`.

**What each spec gains:**

- **Foundation, "Parameters":** item 1 lists the entry as in answer E; item 3 gains the ID blocks of
  answer 20. "Bindings, panel layout, colours and pages" gains the MIDI note inputs of answer 10,
  mapped by the core because the pad mode lives there. "Budget profile" gains the pool of 1,024
  sounds.
- **Overview:** "Milestones" lists the new Milestone 1 (foundation; screens and pads; Sound) and
  takes the pool, creating synth sounds, track selection, pad mappings and PADS mode out of
  Milestone 2, which keeps storage, the library, the sample engine and preview, NEW SAMPLE and the
  sample picker, the Engine item, POOL and SAMPLES. "Open points for planning" loses the points
  listed under "Overview open points this plan settles" and narrows the two named there.
- **Workflow A:** "Names are automatic" gains answer 3 and "Making sounds" the pool limit and "Pool
  full" (answer 2). "On every screen" gains answer 6. "Encoders" gains answers 7 and 8. "Actions and
  bindings" gains answers 4a and 4b and S8.
- **Workflow B, "When a button acts":** the three constants with the values of answer 5, still tuned
  by hand.
- **Look:** "The header" gains answer 18; "The lights" answer 9; "The other screens", SETTINGS, the
  page name of answer 19; "The browser shell" replaces its "(my call)" bullets with answers 10 to
  17, 21 and S9.

- [ ] **Step 1: Edit the five specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting. Read the overview's "Open points for planning": none of the settled points is
  left.

- [ ] **Step 3: Commit**

  `git commit -m "Record the screens and pads decisions in the groovebox specs"`

---

### Task 2: The font and text

**Files:**

- Create: `font/monogram.fnt`, `font/monogram_0.png` (with
  `git show 517abc56:apps/foam/public/monogram.fnt > ...`, the same for the PNG), `font/README.md`,
  `src/font.rs`, `src/label.rs`, `src/ui/mod.rs`, `src/ui/text.rs`, all in `crates/groovebox-core/`.
- Modify: `Cargo.toml`, `build.rs`, `src/screen.rs`, `src/lib.rs`.

**Interfaces:**

- **`build.rs`** keeps `budget.rs` and adds `font.rs`. It reads every
  `<char id x y width height xoffset yoffset xadvance .../>` line of the `.fnt` (plain string
  parsing, no XML crate) and the PNG's alpha (ink where alpha > 0), and writes
  `pub static GLYPHS: [Glyph; 577]` sorted by code point. It fails the build on a glyph wider than 8
  px, a glyph reaching below row 11, an `xadvance` other than 6 or a count other than 577.
  `cargo:rerun-if-changed` for both files.
- **`font.rs`:**
  `pub struct Glyph { pub code: u32, pub x: i8, pub y: i8, pub width: u8, pub height: u8, pub rows: [u8; 12] }`
  (`x`, `y` are the offsets; bit 7 of a row is the leftmost column);
  `pub fn glyph(c: char) -> &'static Glyph`, by binary search, `?` for a missing character;
  `pub const ADVANCE: i32 = 6;`.
- **`screen.rs`:** `Canvas` gains
  `fn glyph(&mut self, x: i32, y: i32, glyph: &Glyph, color: Color)`, a default method that fills
  each run of ink, with (x, y) the top-left of the glyph's 6 × 12 cell.
- **`label.rs`:** `pub struct Label<const N: usize>` (UTF-8, at most `N` bytes, `Copy`, compares by
  content) with `new()`, `as_str()`, `push_str()` that stops at the last whole character that fits,
  and `core::fmt::Write`.
- **`ui/text.rs`:**
  - `pub fn width(text: &str) -> i32`: 6 × characters − 1, 0 for "".
  - `pub fn draw(canvas: &mut impl Canvas, x: i32, row: i32, text: &str, color: Color)`: the first
    glyph's cell at (x, row), so capitals land on rows row + 3 to row + 9.
  - `pub struct Fitted<'a> { pub text: &'a str, pub ellipsis: bool }` and
    `pub fn fit(text: &str, max: i32) -> Fitted<'_>`: the whole text when it fits, otherwise the
    longest prefix of whole characters that leaves room for "…".
  - `pub fn draw_fitted(canvas, x, row, fitted: Fitted, color)` and
    `pub fn draw_right(canvas, right: i32, row, text, color)` (ink ends at `right`).

- [ ] **Step 1: Write the failing tests**

```rust
// font.rs
#[test] fn every_czech_letter_and_symbol_has_its_own_glyph() {
    // for c in "ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž←↑→↓▲▶▼◀•…": glyph(c).code == c as u32
}
#[test] fn a_missing_character_draws_as_a_question_mark() { /* glyph('\u{4e00}').code == '?' as u32 */ }
// ui/text.rs
#[test] fn text_width_is_six_per_character_minus_one() { /* "Sound" 29, "T1" 11, "" 0, "Říkanka" 41 */ }
#[test] fn capitals_sit_three_pixels_into_a_row() {
    // draw "H" at (4, 1) on a Screen: TEXT pixels only on rows 4..=10, the first at x 4
}
#[test] fn fit_shortens_with_an_ellipsis_only_when_needed() {
    // fit("Kick", 71) == Fitted { text: "Kick", ellipsis: false }
    // fit("Žluťoučký kůň", 71) == Fitted { text: "Žluťoučký k", ellipsis: true }  (Look's example, 12 characters)
}
// label.rs
#[test] fn push_str_stops_at_a_whole_character() { /* Label<5> after push_str("Žluť") holds "Žlu" (4 bytes; ť would make 6) */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib font label ui::text`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the font build, `font.rs`, `Canvas::glyph`, `label.rs` and `ui/text.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib font label ui::text`. Expected: PASS. Then
  `cargo build -p groovebox-core --release --target thumbv7em-none-eabihf`. Expected: builds.

- [ ] **Step 5: Commit**

  `git commit -m "Add the monogram font to the groovebox core"`

---

### Task 3: The drawn parts

**Files:**

- Create: `src/ui/layout.rs`, `src/ui/item.rs`, `src/ui/tiles.rs`, `src/ui/list.rs`,
  `src/ui/frame.rs` in `crates/groovebox-core/`.

**Interfaces:**

- **Consumes:** Task 2's `ui::text`.
- **`layout.rs`:** the "Screen geometry" table as `pub const`s (`HEADER_ROW`, `HEADER_LINE`,
  `TEXT_X`, `HEADER_RIGHT`, `PIECE_GAP`, `MAIN_TOP`, `MAIN_BOTTOM`, `STRIP_LINE`, `STRIP_ITEM`,
  `STRIP_CELLS: [(i32, i32); 4]`, `ITEM_HEIGHT`, `ITEM_PITCH`, `PAGE_X`, `PAGE_WIDTH`, `PAGE_FIRST`,
  `PAGE_VISIBLE`, `PAD_TILE_*`, `TILE_*`, `ROW_*`, `LIST_VISIBLE`).
- **`item.rs`:** `pub enum Bar { Track, Fill(u16) }` (the fill's share of the bar, 0 to 65,535,
  rounded down to pixels);
  `pub struct ItemView<'a> { pub encoder: Option<u8>, pub name: &'a str, pub value: &'a str, pub bar: Bar }`;
  `pub fn draw_item(canvas, x: i32, y: i32, width: i32, item: &ItemView, numbered: bool)`, where
  `numbered` draws the encoder's digit before the name (a page) or not (the strip); the name is
  shortened with "…" to keep the whole value and 6 px between them;
  `pub fn draw_cursor(canvas, x: i32, y: i32, width: i32, height: i32)` outlines 1 px outside.
- **`tiles.rs`:** `pub enum TileState { Current, Exists, Empty }`;
  `pub struct Tile<'a> { pub name: Option<&'a str>, pub state: TileState }`;
  `pub fn draw_tiles(canvas, tiles: &[Tile; 16])`, numbered 1 to 16;
  `pub struct PadTile<'a> { pub name: Option<&'a str>, pub selected: bool }`;
  `pub fn draw_pad_tiles(canvas, pads: &[PadTile; 12])`.
- **`list.rs`:** `pub struct Row<'a> { pub left: &'a str, pub right: Option<&'a str> }`;
  `pub fn draw_rows(canvas, rows: &[Row], first: usize, cursor: Option<usize>)`, drawing rows
  `first..first + 16`.
- **`frame.rs`:** `pub struct Piece<'a> { pub text: &'a str, pub color: Color }`;
  `pub fn draw_header(canvas, left: &[Piece], right: Option<Piece>)` with the line;
  `pub fn draw_strip(canvas, cells: &[Option<ItemView>; 4])` with the line; an empty cell draws
  nothing.

- [ ] **Step 1: Write the failing tests**

  Each draws on a fresh `Screen` and checks pixels measured from the named picture.

```rust
#[test] fn the_header_matches_sound_pad_png() {
    // pieces Sound ACCENT, Pad TEXT, T1 TEXT, Snare TEXT, Pads DIM:
    // LINE at (0, 14) and (479, 14); the first ink of each piece at x 4, 39, 62, 79, 114 on rows 4..=10
}
#[test] fn the_strip_matches_sound_filter_png() {
    // STRIP_LINE row LINE across; cell 1 with Bar::Fill(65_535): ACCENT on (4..=117, 269..=270);
    // cell 2 with Bar::Track: FAINT on (124..=237, 269); cell 3 empty: nothing below the line
}
#[test] fn a_page_item_matches_sound_pad_png() {
    // ItemView { encoder: Some(1), name: "Sound", value: "Snare", bar: Track } at (2, 17, 160), numbered:
    // FAINT on (5..=158, 31..=32); the value's ink ends at x 158; the digit's ink starts at x 5, DIM
    // draw_cursor(2, 17, 160, 17): ACCENT at (1, 16), (162, 16), (1, 34), (162, 34); BACKGROUND at (0, 16)
}
#[test] fn the_menu_tiles_match_menu_held_png() {
    // tile 1 Current: ACCENT outline (1..=118, 16..=73); tile 2 Exists: LINE at (120, 16);
    // tile 11 Empty: FAINT at (239, 134); tile 2's number ink from x 123, name ink from x 140
}
#[test] fn the_pad_tiles_match_sound_pad_png() {
    // tile 2 selected: ACCENT at (243, 16) and its text ACCENT; tile 10 empty: number only, DIM, no second row
}
#[test] fn the_rows_and_cursor_match_picker_sound_png() {
    // rows first 0, cursor Some(4): ACCENT outline (1..=478, 72..=86); row 4's text ink from x 5; right label ink ends at x 474, DIM
}
#[test] fn a_long_name_gives_way_to_the_value() { /* name "Sample", value "Hat open take3" in a 119 px strip cell: the name reads "Sam…" (Look's example), the value whole; "Envelope amount" with "+40" fits whole, as in sound-filter.png */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib ui`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the five modules**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib ui`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Draw the parts of the groovebox screens"`

---

### Task 4: The master list

**Files:**

- Create: `src/param.rs` in `crates/groovebox-core/`. Modify: `src/lib.rs`.

**Interfaces:**

- `pub struct ParamId(pub u16)` (`Copy`, `Eq`, `Ord`).
- `pub enum Scope { Device, Project, Track, Sound }`.
- `pub enum Curve { Switch }` and `pub enum Unit { None }`. Plan 3 adds the curves and units its
  entries need, with their display maths.
- `pub struct Choice { pub key: u16, pub label: &'static str }` (for named lists; plan 3's first
  list entry uses it).
- `pub struct Entry { pub id: ParamId, pub name: &'static str, pub short: &'static str, pub scope: Scope, pub low: i32, pub high: i32, pub default: i32, pub curve: Curve, pub unit: Unit, pub click: u32, pub glide: u32, pub modulated: bool }`.
  `click` 0 means a counted value; `glide` 0 means it changes exactly at T.
- `pub const VELOCITY: Entry`: ID 1, "Velocity", `Device`, 0 to 1, default 1, `Switch`, `None`,
  click 0, glide 0, not modulated. `pub const ENTRIES: &[Entry] = &[VELOCITY];`
- `pub const fn check(entries: &[Entry]) -> Result<(), &'static str>`: IDs unique; each ID in its
  scope's block (device 1–99, project 100–199, track 200–299 or from 10000, sound 1000–9999); low ≤
  default ≤ high; a smooth entry (click > 0) runs 0 to 65,535 and its click divides by 16; a switch
  runs 0 to 1. `const _: () = assert!(check(ENTRIES).is_ok());`
- `pub fn entry(id: ParamId) -> &'static Entry`.
- `pub fn moved(entry: &Entry, value: i32, clicks: i32, fine: bool) -> i32`: counted values move 1
  per click with or without `fine`; smooth ones `click`, or `click / 16` when `fine`; both stop at
  `low` and `high`.
- `pub fn format(entry: &Entry, value: i32, out: &mut Label<16>)`: a switch reads "Off" or "On".

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn velocity_is_a_device_switch_numbered_1_and_on() { /* VELOCITY.id == ParamId(1), scope Device, default 1, entry(ParamId(1)).name == "Velocity" */ }
#[test] fn counted_values_move_one_per_click_and_stop_at_the_ends() { /* moved(&VELOCITY, 0, 1, false) == 1; (1, 1) == 1; (1, -5) == 0; fine changes nothing */ }
#[test] fn smooth_values_move_by_the_click_or_a_sixteenth_with_shift() {
    // a test Entry, click 512, 0..=65_535: moved(e, 0, 1, false) == 512; moved(e, 0, 1, true) == 32;
    // moved(e, 65_500, 1, false) == 65_535; moved(e, 100, -1, false) == 0
}
#[test] fn switches_read_off_and_on() { /* format(&VELOCITY, 0) "Off", 1 "On" */ }
#[test] fn check_refuses_what_the_rules_forbid() {
    // Err for: a click of 700; two entries with ID 1; a device entry with ID 100; a sound entry with ID 50;
    // a smooth entry from 0 to 1,000; default above high
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib param`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `param.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib param`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox master list of parameters"`

---

### Task 5: The project in memory

**Files:**

- Create: `src/project/mod.rs`, `pool.rs`, `name.rs`, `track.rs`, `settings.rs` in
  `crates/groovebox-core/`. Modify: `budget.toml`, `src/lib.rs`.

**Interfaces:**

- **Consumes:** `Label` (Task 2), `param` (Task 4).
- **`budget.toml`:** `pool_sounds = 1_024`.
- **`pool.rs`:**
  - `pub struct SoundNumber(pub u32)`: from 1, never reused while the project lives.
  - `pub enum Engine { Synth }`. Milestone 2 adds `Sample`.
  - `pub struct Sound { pub number: SoundNumber, pub name: Label<64>, pub engine: Engine, pub values: [i32; SOUND_VALUES] }`,
    where `SOUND_VALUES` counts the `Sound`-scope entries (0 now). A new sound takes every entry's
    default.
  - `pub struct Pool`: `[Sound; budget::POOL_SOUNDS]` kept in number order without gaps, a length
    and the next number. `pub const fn new() -> Self`;
    `pub fn new_synth(&mut self) -> Result<SoundNumber, PoolFull>`;
    `pub fn copy(&mut self, of: SoundNumber) -> Result<SoundNumber, PoolFull>` (same engine and
    values, its own name and number); `pub fn get(&self, number: SoundNumber) -> Option<&Sound>`;
    `pub fn sounds(&self) -> &[Sound]`. A refusal leaves the pool and the next number untouched.
- **`name.rs`:** `pub fn split(name: &str) -> (&str, u32)` (base and number; an unnumbered name is
  number 1) and `pub fn next_name(pool: &Pool, base: &str, numbered: bool) -> Label<64>`, answer 3.
- **`track.rs`:** `pub enum PadMode { Pads, Keys }`;
  `pub struct Track { pub pads: [Option<SoundNumber>; 12], pub selected_pad: Option<u8>, pub selected_sound: Option<SoundNumber>, pub mode: PadMode, pub octave: u8 }`;
  `Track::new()` selects pad 0, `Pads`, octave 4; `pub fn key_pitch(&self, pad: u8) -> u8` is 12 ×
  (octave + 1) + pad. Octaves run 0 to 8 (C0 to C8). When `selected_pad` is `Some(p)`,
  `selected_sound` is `pads[p]`.
- **`settings.rs`:** `pub struct DeviceSettings` holding one value per `Device` entry, from the
  defaults; `pub fn get(&self, id: ParamId) -> i32`,
  `pub fn set(&mut self, id: ParamId, value: i32)`.
- **`mod.rs`:** `pub struct Project { pub pool: Pool, pub tracks: [Track; 4], pub track: u8 }`;
  `Project::new()`; `pub fn put(&mut self, pad: u8, sound: Option<SoundNumber>)` on the current
  track, keeping the selection rule; `pub fn pads_using(&self, sound: SoundNumber) -> usize` over
  all four tracks.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn names_follow_the_owners_table() {
    // empty pool: next_name(pool, "Syn", true) == "Syn 1"
    // pool Syn 1, Syn 2: copy of Syn 1 is named "Syn 3"
    // pool Kick: next_name(pool, "Kick", false) == "Kick 2"; pool Kick, Kick 2: copy of Kick 2 is "Kick 3"
    // pool Syn 1, Syn 2 (Syn 3 never made or removed): next "Syn 3"
    // split("Hat open 12") == ("Hat open", 12); split("Kick") == ("Kick", 1)
}
#[test] fn a_long_base_is_shortened_to_fit_64_bytes() { /* a base of 70 bytes ending in multibyte letters gives a valid name of at most 64 bytes ending in " 2" */ }
#[test] fn numbers_are_never_reused() { /* new_synth, new_synth, copy(1) give 1, 2, 3 */ }
#[test] fn a_full_pool_refuses_and_uses_no_number() {
    // 1,024 new_synth calls succeed; the next new_synth and copy(SoundNumber(1)) return Err(PoolFull);
    // sounds().len() == 1_024 and the last number is 1_024
}
#[test] fn a_new_project_has_pad_1_selected_on_every_track_in_pads_mode_at_c4() {}
#[test] fn key_pitches_run_from_c0_to_b8() { /* octave 4 pad 0 == 60; octave 0 pad 0 == 12; octave 8 pad 11 == 119 */ }
#[test] fn copy_counts_pads_on_every_track() { /* one sound on T1 pads 1 and 3 and T2 pad 5: pads_using == 3 */ }
#[test] fn putting_a_sound_on_the_selected_pad_selects_it() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib project`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the project modules and the budget entry**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib project`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox project in memory"`

---

### Task 6: Every input, end to end

The core, the browser crate and the drift harness learn every input of "Shared formats". Plan 1's
control part only gains an arm that leaves the new inputs unhandled; Task 8 replaces it.

**Files:**

- Modify: `crates/groovebox-core/src/input.rs`, `src/control.rs`;
  `crates/groovebox-browser/src/lib.rs`; `crates/groovebox-drift/src/scene.rs`, `src/wasm.rs`;
  `apps/groovebox/source/shell/control.worker.ts` (a returned 2 drops the input).
- Create: `scenes/inputs.scene`, one input of each kind, with its fingerprints.

**Interfaces:**

- **`input.rs`:**
  `pub enum Button { T1, T2, T3, T4, PadsKeys, Roll, Menu, Page, Copy, Shift, Rec, Play, Stop, Tempo, Up, Down, Left, Right, Ok, Cancel, Minus, Plus, Step(u8), Push(u8) }`
  with `pub const fn code(self) -> u8` and `pub const fn from_code(code: u8) -> Option<Button>` (the
  table's codes). `pub enum Input` gains `ButtonPress { button }`, `ButtonRelease { button }`,
  `EncoderTurn { encoder: u8, clicks: i8 }`, `PadPressure { pad, pressure }`,
  `NoteOn { note, velocity }`, `NoteOff { note }`, `NotePressure { note, pressure }`,
  `ChannelPressure { pressure }`.
  `pub const STEPS: u8 = 16; pub const ENCODERS: u8 = 5; pub const VOLUME: u8 = 4;`
- **Browser crate:** `control_queue_input(sample: u64, kind: u32, a: u32, b: u32) -> u32` as in
  "Inputs".
- **`scene.rs`:** parses every scene line of "Inputs" with the button names, checking ranges (pads,
  steps, encoders, notes 0–127, velocity 1–127, pressure 0–127, clicks not 0 and within −127 to
  127). `pub fn button_name(button: Button) -> &'static str` and its inverse live here.
- **`wasm.rs`:** encodes every `Input` as kind, `a`, `b`.

- [ ] **Step 1: Write the failing tests**

```rust
// input.rs
#[test] fn every_button_code_round_trips() { /* for code in 0..=255: from_code(code).map(code) == Some(code) or None; 22 + 16 + 4 = 42 codes are Some */ }
// scene.rs
#[test] fn every_input_line_parses() { /* one line of each kind of the table parses to its Input */ }
#[test] fn bad_input_lines_name_their_line() { /* "press step-17", "turn encoder-1 0", "note-on 128 1", "pad-pressure 0 128" each give an Err naming the line */ }
```

`scenes/inputs.scene` holds one input of each kind; the existing
`every_scene_plays_the_same_in_every_build` then proves every kind reaches all three builds alike.

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib input` and `cargo test -p groovebox-drift --lib`.
  Expected: FAIL to compile.

- [ ] **Step 3: Implement**

  In `control.rs` the match on `stamped.input` gains `_ => None`, so the new inputs are handled and
  send nothing.

- [ ] **Step 4: Run them to verify they pass**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-core --lib` and
  `cargo test -p groovebox-drift`. Expected: PASS; the blessed scenes are unchanged.

- [ ] **Step 5: Commit**

  `git commit -m "Carry every groovebox input from the browser to the core"`

---

### Task 7: Button timing

**Files:**

- Create: `src/control/buttons.rs` in `crates/groovebox-core/` (with `src/control.rs` moved to
  `src/control/mod.rs`, unchanged otherwise).

**Interfaces:**

- `pub const HOLD: u64 = 14_400; pub const REPEAT_DELAY: u64 = 19_200; pub const REPEAT_EVERY: u64 = 2_400;`
- `pub enum Release { Tap, Long, Taken, NotHeld }`.
- `pub struct Buttons` with `pub const fn new() -> Self` and:
  - `press(&mut self, button: Button, sample: u64)`: marks every other held button as used. The
    arrows, `Minus` and `Plus` start repeating at `sample + REPEAT_DELAY`.
  - `release(&mut self, button: Button, sample: u64) -> Release`: `Tap` when it was held for less
    than `HOLD`, nothing else was used meanwhile and no combination took it; `Taken` when a
    combination took it; `Long` otherwise.
  - `used(&mut self)`: an encoder turn or a pad hit marks every held button as used. MIDI notes and
    pressure do not count (they are not controls).
  - `take(&mut self, button: Button)`: a combination took this press, so it neither taps nor
    repeats.
  - `is_held(&self, button: Button) -> bool`.
  - `first_held(&self, of: &[Button]) -> Option<Button>`: the earliest pressed of these that is held
    and not taken.
  - `next_repeat(&self) -> Option<(u64, Button)>`: the earliest due repeat; equal samples by button
    code. `repeated(&mut self, button: Button)` moves it on by `REPEAT_EVERY`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_short_press_alone_taps() { /* press PadsKeys 0, release 14_399 → Tap; press 0, release 14_400 → Long */ }
#[test] fn another_control_spoils_the_tap() { /* press PadsKeys, press Up, release PadsKeys → Long; press Cancel, used(), release → Long */ }
#[test] fn a_consumed_press_never_taps() { /* press Menu 0, press Step(2) 10, take(Step(2)), release Menu 20, release Step(2) 30 → Taken */ }
#[test] fn held_arrows_repeat_after_400_ms_every_50_ms() { /* press Down 1_000: next_repeat == (20_200, Down); repeated → 22_600 */ }
#[test] fn a_taken_arrow_does_not_repeat() { /* press Up, take(Up): next_repeat == None */ }
#[test] fn the_first_held_modifier_counts() { /* press Page 0, press Menu 5, take(Menu): first_held([Menu, Page]) == Some(Page); release Page: first_held == None until Menu is pressed again */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::buttons`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `buttons.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Time groovebox button taps, holds and repeats"`

---

### Task 8: Pads, notes, selection and lights

The control part is rebuilt on the project. It plays notes from pads and MIDI, selects tracks, pads
and modes, keeps the octave, works out the lights and draws STEP. The audio part becomes silent.

**Files:**

- Create: `src/control/notes.rs`, `src/control/view.rs`, `src/control/draw.rs`, `src/lights.rs` in
  `crates/groovebox-core/`.
- Modify: `src/control/mod.rs`, `src/message.rs`, `src/queue.rs`, `src/audio.rs`, `src/device.rs`,
  `src/lib.rs`; the browser crate; the drift crate's `runner.rs`, `native.rs`, `wasm.rs`, `play.rs`
  and `tests/drift.rs`.
- Delete: `src/tone.rs`, `scenes/tone.scene`, `scenes/tone.fingerprints`, `scenes/tone/`.
- Re-bless: `scenes/browser-session`, `scenes/late`, `scenes/silence`.

**Interfaces:**

- **Consumes:** Tasks 2 to 7.
- **`message.rs`:** `pub struct NoteId(pub u32)`;
  `MessageKind::{NoteOn { note: NoteId, track: u8, sound: SoundNumber, pitch: u8, velocity: u8 }, NoteOff { note: NoteId }}`;
  `pub const MAX_MESSAGES_PER_EVENT: usize = 1;`. Note IDs count up from 0 and are never reused.
- **`queue.rs`:** `Producer::free(&self) -> usize`, how many pushes would succeed now. It is safe
  against the consumer, which only ever makes room.
- **`audio.rs`:** applies and reports messages at chunk starts as before, does nothing else with
  them and renders zeros. Plan 3's voices take the notes.
- **`lights.rs`:** `pub struct Lights(pub u64)` with the bit positions of "Lights" as constants.
- **`control/mod.rs`:** `Control` holds the input and replay rings and message numbering (as plan
  1), `Project`, `DeviceSettings`, `Buttons`, `Notes` and `View`. `step(until, messages) -> bool`:
  - Handles queued inputs before `until` and the due repeats in sample order; on equal samples the
    input goes first.
  - Handles an event only when `messages.free() >= MAX_MESSAGES_PER_EVENT`; otherwise it stops and
    leaves the rest for a later step, as plan 1 did with a full queue.
  - Returns true on the first step and whenever it handled an event.
  - `pub fn lights(&self) -> Lights`.
- **What this task binds:**
  - T1–T4 select the track, unless SHIFT is held (S8).
  - PADS/KEYS: a `Tap` switches the current track's mode. PADS/KEYS held + ▲ or ▼ moves the octave
    in KEYS mode, stopping at 0 and 8; in PADS mode it does nothing; either way the arrow is taken
    and PADS/KEYS is used (answer 4a).
  - A pad hit marks buttons used.
    - **PADS mode:** it selects the pad and its sound, and when the pad has a sound sends `NoteOn`
      at pitch 60 (S7).
    - **KEYS mode:** it plays the selected sound at `key_pitch(pad)`, and nothing when there is
      none.
    - **Velocity:** the hit's when VELOCITY is on, 127 when it is off.
    - **Release:** the pad's release sends `NoteOff` for the note its hit started, whatever changed
      since (octave, mode, track).
  - MIDI notes follow answer 10. In PADS mode a note is a hit of pad _n_ mod 12 (selecting as a pad
    does) with its own `NoteId`; its note-off ends that note.
  - Pressure inputs and every other button do nothing yet.
- **`notes.rs`:** `Notes` holds the notes that are on, each with its source (`Pad(u8)` or
  `Midi(u8)`), `NoteId`, track, PADS-mode pad and pitch; at most 12 + 128 at once.
- **Lights (answer 9):**
  - **Pads, PADS mode:** the selected pad, plus pads with a note on in the current track.
  - **Pads, KEYS mode:** pad 1, plus pads whose pitch is in the current octave with a note on in the
    current track.
  - **Others:** T_n for the current track; PADS/KEYS in KEYS mode.
- **`view.rs`:** `pub enum Screen { Step, Sound, Settings }`, starting on `Step`. Task 9 fills in
  the rest.
- **`draw.rs`, STEP:**
  - The header pieces are "Step" `ACCENT`, "T1" `TEXT`, the selected sound's name `TEXT` (or the
    selected pad's number `DIM` when that pad is empty), and "Pads" or "Keys C4" `DIM`.
  - The main area is empty and so is the strip.
- **`device.rs`:** `lights: AtomicU64`, stored with Release after every step;
  `pub fn lights_pointer(&self) -> *const AtomicU64`.
- **Browser crate:** `pub extern "C" fn lights_pointer() -> u32`.
- **Drift:**
  - `Runner` gains `fn take_applied(&mut self) -> Vec<(u32, u64)>`, the reports of the last step
    (`NativeRunner` takes them from the control side, `WasmRunner` reads the stash `control_step`
    filled), and `fn lights(&mut self) -> u64`, read through `lights_pointer`.
  - `Outcome` gains `applied: Vec<(u32, u64)>` and `lights: Vec<(u64, u64)>`, the lights after each
    captured frame's step; the builds must agree on both.
  - `applied_records_steer_late_messages` now compares `applied`, since the audio is silent.

- [ ] **Step 1: Write the failing tests**

```rust
// control
#[test] fn a_new_project_draws_step_t1_pad_1_pads() { /* header pieces "Step", "T1", "1" DIM, "Pads" DIM; the main area and strip BACKGROUND */ }
#[test] fn a_hit_on_an_empty_pad_selects_it_and_sends_nothing() {}
#[test] fn pads_mode_plays_the_pads_sound_at_c4_and_selects_it() { /* project.put(2, Some(n)); hit pad 2 velocity 90 → NoteOn { note: NoteId(0), track: 0, sound: n, pitch: 60, velocity: 90 } */ }
#[test] fn keys_mode_plays_the_selected_sound_at_the_keys_pitch() { /* octave 4, pad 4 → pitch 64; no selected sound → nothing */ }
#[test] fn a_release_ends_the_note_its_hit_started() { /* hit pad 0 in KEYS, PadsKeys + Up, release pad 0 → NoteOff { note: NoteId(0) } */ }
#[test] fn pads_keys_taps_switch_the_mode_and_long_presses_do_not() {}
#[test] fn pads_keys_with_an_arrow_moves_the_octave_between_c0_and_c8() { /* 5 × Up from 4 stops at 8; header "Keys C8"; letting go switches nothing; in PADS mode Up changes nothing and letting go still switches nothing */ }
#[test] fn each_track_keeps_its_mode_octave_and_selection() {}
#[test] fn shift_with_a_track_button_does_nothing() {}
#[test] fn velocity_off_plays_every_hit_at_127() { /* settings.set(VELOCITY.id, 0); hit at 40 → velocity 127 */ }
#[test] fn midi_notes_fold_onto_pads_in_pads_mode() { /* note-on 48 and 60 → two NoteOns from pad 0; pad 0 lit until both note-offs */ }
#[test] fn midi_notes_play_their_own_pitch_in_keys_mode() { /* note 40 → pitch 40, no pad lit at octave 4; note 11 and 120 ignored, their note-offs too */ }
#[test] fn the_lights_follow_answer_9() { /* PADS: selected pad + held pads; KEYS: pad 1 + sounding keys; T1; PADS/KEYS in KEYS mode */ }
#[test] fn an_event_waits_while_the_message_queue_is_full() { /* fill the queue; a hit stays queued, the next step after one pop sends it with its own sample */ }
#[test] fn replay_records_still_set_the_message_sample() {}
// audio
#[test] fn the_audio_part_is_silent_and_reports_note_messages() {}
// device
#[test] fn the_lights_reach_the_lights_word_after_a_step() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib`. Expected: FAIL to compile.

- [ ] **Step 3: Implement, delete `tone.rs` and the tone scene**
- [ ] **Step 4: Run them to verify they pass, then re-bless**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS. Then
  `node build.js && node build.js --fallback` and `cargo test -p groovebox-drift` with
  `GROOVEBOX_BLESS=1`; open the new frames of `browser-session` and check they show the STEP header.
  Run `cargo test -p groovebox-drift` again without it. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Play groovebox notes from pads and MIDI and light the pads"`

---

### Task 9: Screens, pages, the cursor and MENU and PAGE

**Files:**

- Create: `src/control/pages.rs` in `crates/groovebox-core/`.
- Modify: `src/control/mod.rs`, `src/control/view.rs`, `src/control/draw.rs`.

**Interfaces:**

- **`pages.rs`:**
  - `pub enum ItemKind { Param(ParamId) }` (Task 10 adds the PAD page's items) and
    `pub struct ItemDef { pub kind: ItemKind, pub encoder: Option<u8> }`.
  - `pub struct PageDef { pub name: &'static str, pub items: &'static [ItemDef] }`.
  - `pub fn pages(screen: Screen) -> &'static [PageDef]`: STEP none (PAGE there acts on SOUND's
    pages); SETTINGS `[Playing: Velocity on encoder 1]`.
  - The MENU tiles list the existing screens: 1 Step and 8 Settings (Task 10 adds 3 Sound).
- **`view.rs`:**
  - The current screen and each screen's page.
  - Each page's cursor and scroll (answer 6), remembered while the control part lives.
    `pub fn scrolled(cursor: usize, scroll: usize, visible: usize) -> usize` keeps the cursor on
    screen, moving the column one item when the cursor passes the last fully visible one (Look);
    pages and the picker share it.
  - The overlay from `Buttons::first_held(&[Menu, Page])`.
  - `pub fn page_tiles(pages: &[PageDef], current: usize) -> [Tile; 16]`: a tile per page, the
    current one `Current`, the rest `Empty`; no pages gives 16 empty tiles (answer 4b).
- **Behaviour, all from the answers:**
  - **MENU + step and PAGE + step** act at the step's press, and the step is taken (4a).
  - **Under MENU or PAGE** inputs are routed per 4b. The header reads "Menu" in the accent while
    MENU is held, with no page name; it is unchanged while PAGE is held. The strip is empty.
  - **Steps lit under MENU or PAGE:** the existing screens' steps, or the current screen's pages
    (S2).
  - **The cursor:**
    - ▲ ▼ move it and stop at the ends; ◀ ▶ do nothing on one-column pages.
    - Held arrows repeat (Task 7), and each repeat is the same move.
    - On STEP the arrows are Milestone 3's and do nothing here.
    - SHIFT + arrows do nothing outside STEP.
  - **OK** on a switch flips it.
  - **− and +** move the value under the cursor with `param::moved`, `fine` while SHIFT is held, and
    repeat.
  - **Encoders 1–4:**
    - A turn moves their item and puts the page's cursor on it. SHIFT makes it fine, counted values
      excepted.
    - A push is OK on the item.
    - A turn or push of an encoder that holds nothing does nothing.
  - SHIFT + OK and SHIFT + an encoder push do nothing (S8). CANCEL does nothing on a page.
  - **A header message** (`Option<(Label<32>, Color, u64)>`, with the sample it was shown at) clears
    on a later button press, per answer 18. Task 10 shows the first one.
- **`draw.rs`:**
  - The header is the screen's name in `ACCENT`; the page's name in `TEXT` on screens with pages;
    track, sound and mode as in Task 8; the message on the right.
  - Below it come the page's items (numbered, with the cursor) or the tiles under MENU or PAGE, and
    the strip.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn menu_with_step_8_shows_settings_at_the_steps_press() { /* press Menu 0, press Step(7) 100: screen Settings at once; tiles while Menu held; release Menu: page shown */ }
#[test] fn the_step_pressed_under_menu_does_nothing_when_let_go() { /* release Menu first, then Step(7): nothing more happens */ }
#[test] fn menu_let_go_alone_changes_nothing() {}
#[test] fn a_dark_step_under_menu_does_nothing() { /* step 2 (ROLL does not exist yet) */ }
#[test] fn the_first_of_menu_and_page_counts() {}
#[test] fn under_menu_pads_play_and_select_and_the_rest_is_dropped() { /* a hit selects pad 3; Down, Ok, Minus, an encoder turn change nothing, also after Menu is let go */ }
#[test] fn page_on_settings_shows_one_tile_and_lights_step_1() {}
#[test] fn no_pages_give_16_empty_tiles() { /* page_tiles(&[], 0): every tile Empty */ }
#[test] fn scrolling_keeps_the_cursor_on_screen_one_item_at_a_time() { /* visible 13: scrolled(12, 0, 13) == 0; scrolled(13, 0, 13) == 1; scrolled(0, 5, 13) == 0 */ }
#[test] fn velocity_flips_with_ok_and_moves_with_minus_plus_and_encoder_1() { /* On → Ok → Off; Plus → On; Plus again stays On; encoder 1 −1 → Off; strip cell 1 reads "Velocity Off" */ }
#[test] fn shift_with_ok_or_an_encoder_push_does_nothing() {}
#[test] fn a_message_stays_until_a_later_button_press() { /* show a message at sample 100 from a press at 100; a pad hit and a turn keep it; a press at 200 clears it and still acts */ }
#[test] fn the_settings_page_matches_its_geometry() { /* header "Settings Playing T1 1 Pads"; item 1 at (2, 17) "1 Velocity On" with the cursor; strip cell 1 "Velocity On" with a FAINT track */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox screens, pages and cursor"`

---

### Task 10: SOUND's PAD page and the sound picker

**Files:**

- Modify: `src/control/pages.rs`, `src/control/view.rs`, `src/control/mod.rs`, `src/control/draw.rs`
  in `crates/groovebox-core/`.

**Interfaces:**

- **SOUND** is MENU + 3, with one page, **Pad** (Sound's starting pages come with plan 3, after it):
  - `ItemKind::PadSound` on encoder 1: the pad's sound's name or "Empty". OK opens the picker; turns
    and − + do nothing.
  - `ItemKind::PadCopy` on encoder 2: "on 1 pad" or "on _n_ pads" from `pads_using`. OK makes the
    copy; turns and − + do nothing.
  - **An empty selected pad** shows only `PadSound`, so encoder 2 holds nothing (Workflow A).
  - **The picture** is the current track's pad tiles (S4).
  - The MENU tiles gain 3 Sound. PAGE on SOUND, and on STEP, shows "1 Pad".
- **The picker:**
  - **Rows:** "Empty", "New synth", then each pool sound with "synth" as its right label. It opens
    on the pad's current entry (S6) and scrolls so the highlight stays on screen, a row at a time.
  - **Keys:** ▲ ▼, − and + move one row; ◀ ▶ move 16 rows. All stop at the ends and repeat.
  - **OK:**
    - Empty clears the pad; the sound stays in the pool and the track has no selected sound.
    - New synth puts `pool.new_synth()` on the pad and selects it.
    - A pool sound goes on the pad, shared.
    - Every choice closes the picker.
  - **CANCEL:** a `Tap` closes it without choosing.
  - **While it is open (Workflow A):**
    - Pads and MIDI notes sound but do not select.
    - PLAY, STOP, REC, SHIFT + T1–T4 and the volume keep their (still empty) bindings.
    - Every other control, encoders included, is dropped and does not close it.
    - The strip is empty and the header is SOUND's.
- **Pool full** (answer 2): New synth or Copy on a full pool closes the picker or leaves the page as
  it was, uses no number, and shows "Pool full" in `RECORD` on the header's right, kept through the
  press that caused it.
- **On STEP** (answer 7):
  - The strip shows the encoders' items of SOUND's current page, or nothing while the selected pad
    is empty.
  - A turn acts on them and moves SOUND's remembered cursor.
  - A push opens the picker over STEP's main area (choosing returns to STEP) or runs Copy.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn new_synth_on_an_empty_pad_makes_syn_1_and_selects_it() { /* MENU+3, Ok, Down, Ok: header "Sound Pad T1 Syn 1 Pads"; tile 1 shows "1" and "Syn 1" */ }
#[test] fn the_picker_opens_on_the_pads_current_entry() {}
#[test] fn a_pool_sound_is_shared_and_copy_counts_its_pads() { /* Syn 1 on pads 1 and 2 → "on 2 pads"; Copy on pad 2 → pad 2 plays "Syn 2", pad 1 "on 1 pad" */ }
#[test] fn empty_clears_the_pad_and_keeps_the_sound() {}
#[test] fn an_empty_pad_shows_only_the_sound_item() { /* the cursor on Copy moves to Sound and stays there when the pad gets a sound */ }
#[test] fn cancel_closes_the_picker_on_a_short_release_only() {}
#[test] fn with_the_picker_open_pads_sound_but_do_not_select_and_menu_waits() { /* pad 4 hit: NoteOn sent, pad 1 still selected; Menu press, T2, PadsKeys tap: nothing, picker still open, also after release */ }
#[test] fn held_down_moves_the_highlight_after_400_ms_every_50_ms() { /* 30 pool sounds; Down held 0..=30_000: highlight moves at 0, 19_200, 21_600, 24_000, 26_400, 28_800 */ }
#[test] fn the_result_does_not_depend_on_the_step_size() { /* the same inputs stepped every 128 and every 4_096 samples: equal messages, lights and final frame */ }
#[test] fn pool_full_shows_until_the_next_button_press() { /* a pool of 1,024: Ok on New synth closes the picker, pad empty, "Pool full" in RECORD; a pad hit keeps it; Down clears it and moves */ }
#[test] fn encoders_on_step_act_on_sounds_page() { /* on STEP with Syn 1 selected: push 1 opens the picker over STEP; Ok on Empty returns to STEP; push 2 copies; SOUND's remembered cursor is on Copy */ }
#[test] fn the_pad_page_and_picker_match_their_geometry() { /* item rows at y 17 and 35; tiles at x 164; picker rows at y 17 + 14k with the cursor outline */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`, then
  `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

  `git commit -m "Make groovebox synth sounds from the PAD page"`

---

### Task 11: Drift scenes and the gallery's frames

**Files:**

- Create: `scenes/menu-and-pages.scene`, `scenes/new-synth.scene`,
  `scenes/picker-while-playing.scene`, `scenes/midi.scene` (with their fingerprints and frames) and
  `crates/groovebox-drift/tests/gallery.rs` (with `scenes/gallery.fingerprints`,
  `scenes/gallery/font.png` and `scenes/gallery/palette.png`).

**The scenes** (Workflow A: "drift scenes that drive the panel only"):

- **`menu-and-pages`:** MENU held over STEP (frame); step 8; PAGE held on SETTINGS (frame); Velocity
  turned with encoder 1 and flipped with OK (frame).
- **`new-synth`:** from an empty project, MENU + 3 (frame); OK, the picker (frame); New synth
  (frame); push 2 copies; PADS mode hits on pads 1 and 2; PADS/KEYS tapped; PADS/KEYS + ▲ twice;
  KEYS hits; T2 (frame); STEP with the strip (frame).
- **`picker-while-playing`:** the picker open while pads are hit and MENU, T2 and PADS/KEYS are
  pressed (frames before and after).
- **`midi`:** note-ons and note-offs in both modes, two notes on one pad, notes outside C0 to B8.

**The gallery pictures:** `gallery.rs` draws two pictures with the core's own drawing code into a
`Screen` and handles them like scene frames (written on the first run or with `GROOVEBOX_BLESS=1`,
compared with their fingerprints otherwise):

- `font.png`: every glyph in rows, in code-point order;
- `palette.png`: every named palette entry as a swatch.

- [ ] **Step 1: Write the scenes and `gallery.rs`**
- [ ] **Step 2: Bless and compare by eye**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-drift` with
  `GROOVEBOX_BLESS=1`. Open each new frame beside Look's picture of the same state (`menu-held.png`,
  `page-held.png`, `sound-pad.png`, `picker-sound.png`, `font.png`, `palette.png`). In every part
  both show, they must match pixel for pixel (Look's pictures carry other sounds and a transport
  group; those parts differ). Fix the code, not the pictures, and bless again.

- [ ] **Step 3: Run without blessing**

  Run: `cargo test -p groovebox-drift`. Expected: PASS.

- [ ] **Step 4: Commit**

  `git commit -m "Add the groovebox panel scenes and gallery pictures"`

---

### Task 12: The shell's input maps

Pure TypeScript, tested in node.

**Files:**

- Modify: `source/shell/protocol.ts`, `keyboard.ts`, `session.ts`, `present.ts` in
  `apps/groovebox/`.
- Create: `source/shell/midi.ts`, `knob.ts`, `holders.ts`, `lights.ts`, `panelLayout.ts`.
- Tests: `tests/keyboard.test.ts`, `session.test.ts`, `present.test.ts` (modify); `midi.test.ts`,
  `knob.test.ts`, `holders.test.ts`, `lights.test.ts`, `panelLayout.test.ts` (create).

**Interfaces:**

- **`protocol.ts`:**
  - `type ButtonName` (the scene names) and `const BUTTONS: Record<ButtonName, number>` (the codes).
  - `type ShellInput`, one member per row of "Inputs", for example
    `{kind: 'press'; button: ButtonName}` and `{kind: 'turn'; encoder: number; clicks: number}`.
  - `function coreArguments(input: ShellInput): [kind: number, a: number, b: number]`.
  - `CoreAddresses` gains `lights`.
- **`keyboard.ts`:**
  `keyToInput(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'type' | 'ctrlKey' | 'altKey' | 'metaKey'>): ShellInput | null`,
  per answer 12; pads and keys hit at velocity 127.
- **`midi.ts`:**
  - `const KNOBS: ReadonlyMap<number, {encoder: number; kind: 'absolute' | 'relative'}>` (answer
    11).
  - `function createMidiMapper(knobs = KNOBS): (data: Uint8Array) => ShellInput[]`, covering notes,
    note-on velocity 0, poly and channel pressure, and knobs (absolute deltas from a remembered last
    value, relative two's complement). Every other message gives `[]`.
- **`knob.ts`:**
  - `PIXELS_PER_CLICK = 4`.
  - `function dragClicks(startY: number, y: number): number` (up is positive, toward zero).
  - `function wheelClicks(rest: number, event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): {clicks: number; rest: number}`
    (100 px or 3 lines per click; down is negative).
  - `function isPush(maxMovement: number, clicks: number): boolean`.
- **`holders.ts`:** `class Holders` with `press(control: string, source: string): boolean` (true for
  the first source), `release(control, source): boolean` (true for the last) and
  `releaseAll(): string[]`, the controls it held (S9, answer 16).
- **`lights.ts`:**
  `decodeLights(word: bigint): {pads: boolean[]; steps: boolean[]; tracks: boolean[]; padsKeys: boolean; roll: boolean; rec: boolean; play: boolean; tempo: boolean}`.
- **`session.ts`:** `SessionLog.input` writes every kind's scene line.
- **`panelLayout.ts`:**
  - `PANEL_MM = {width: 321, height: 128}`; `MM_PER_PIXEL = 0.198`.
  - `const CONTROLS: ReadonlyArray<{control: ButtonName | 'volume' | `encoder-${number}` |
    `pad-${number}`; shape: 'key' | 'knob' | 'pad'; x; y; width; height; label: string}>`
    from "The panel".
  - `DISPLAY` holds the module and the picture.
  - `function toScreenPixels(mm: number): number`.
- **`present.ts`:** `fitScreen` gives way to
  `fitPanel(viewport: {width: number; height: number}, devicePixelRatio: number): {zoom; cssWidth; cssHeight; exact}`,
  the whole panel at the largest whole zoom of 1,622 × 647 screen pixels in device pixels, at least
  1 (answer 17).

- [ ] **Step 1: Write the failing tests**

```ts
// keyboard.test.ts
test('the pads follow piano order', () => {
  /* KeyZ pad 0, KeyS pad 1, KeyX pad 2 … KeyM pad 11, each velocity 127 */
});
test('every function key maps by position', () => {
  /* KeyL down → press menu; Semicolon → page; Backslash → pads-keys; Comma → rec; Slash → tempo; Space → play; Enter → ok; Escape → cancel; Minus, Equal, NumpadSubtract, NumpadAdd → minus, plus; Digit1 → step-1; KeyI → step-16; KeyO → t1; BracketRight → t4 */
});
test('a key with ctrl, alt or meta, a repeat or a free key gives null', () => {});
// midi.test.ts
test('notes, velocity 0, pressure on any channel', () => {});
test('an absolute knob turns by its change and its first value only sets the reference', () => {
  /* CC 20: 70 → [], 74 → turn encoder 0 +4, 72 → −2 */
});
test('a relative knob turns by its two’s complement step', () => {
  /* 3 → +3, 125 → −3 */
});
test('CC 7 turns the volume and other numbers do nothing', () => {});
// knob.test.ts
test('4 px per click, up is positive', () => {
  /* dragClicks(100, 91) == 2; (100, 103) == 0; (100, 108) == -2 */
});
test('the wheel adds up 100 px or 3 lines per click', () => {
  /* three deltas of -40 px give +1 click on the third with rest -20 */
});
test('a release without movement and clicks is a push', () => {});
// holders.test.ts
test('two sources on one control press once and release once', () => {});
test('releaseAll returns every held control', () => {});
// lights.test.ts
test('bits map to the lights table', () => {
  /* bit 0 pad 1, bit 27 step 16, bit 31 T4, bit 32 PADS/KEYS */
});
// session.test.ts
test('every input kind writes its scene line', () => {});
// present.test.ts
test('the panel takes the largest whole zoom that fits', () => {
  /* css 1920 × 1000 at ratio 1 → zoom 1; css 1920 × 1000 at 2 → zoom 2, css 1622 × 647; 1366 × 700 at 1 → zoom 1; 1920 × 1000 at 1.25 → zoom 1, exact false */
});
// panelLayout.test.ts
test('the display picture is exactly 480 × 272 screen pixels', () => {});
test('every control lies inside the panel and no two overlap', () => {});
```

- [ ] **Step 2: Run them to verify they fail**

  Run:
  `npx vitest run tests/keyboard.test.ts tests/midi.test.ts tests/knob.test.ts tests/holders.test.ts tests/lights.test.ts tests/session.test.ts tests/present.test.ts tests/panelLayout.test.ts`
  in `apps/groovebox`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: the same command, then `npx eslint` on the changed files and `npm run typecheck`. Expected:
  PASS, 0 errors.

- [ ] **Step 5: Commit**

  `git commit -m "Map keys, MIDI and knobs to groovebox controls"`

---

### Task 13: The panel in the browser

**Files:**

- Create: `source/shell/panel.ts`, `source/shell/picture.ts`, `tests/picture.test.ts` in
  `apps/groovebox/`.
- Modify: `source/shell/shell.ts`, `source/shell/control.worker.ts`, `source/routes/_index.tsx`,
  `tests/shell.browser.test.ts`.

**Interfaces:**

- **Consumes:** Task 12's modules and Task 8's `lights_pointer`.
- **`panel.ts`:**
  `buildPanel(container: HTMLElement, zoom: number, devicePixelRatio: number): {canvas: HTMLCanvasElement; lights: Map<string, Element>; dispose(): void}`.
  - It draws every control of `CONTROLS` as absolutely positioned elements at whole device pixels,
    with labels and the knob mark (static).
  - The screen canvas goes at the display picture.
  - It sets `touch-action: none` on the panel.
- **Pointer handling in `shell.ts`:**
  - One state per `pointerId`, with pointer capture.
  - Keys and pads go through `Holders` (answers 14 and 15).
  - Knobs drag and wheel by `knob.ts`; a push is sent on release (answer 13).
- **Focus:** `blur` and `visibilitychange` (hidden) send a release for every control in
  `Holders.releaseAll()` (answer 16).
- **MIDI:**
  - At the start gesture, `navigator.requestMIDIAccess()`; every input, now and on `statechange`,
    feeds `createMidiMapper()`.
  - A refusal sets the status line to "MIDI not allowed".
- **Lights:** each animation frame reads the lights word and sets each light element's lit state.
- **The worker** queues every `ShellInput` with `coreArguments`, logs it with `SessionLog` and
  reports `lights` in `CoreAddresses`.
- **`picture.ts`:**
  `pictureBlob(pixels: Uint8Array, palette: Uint8Array, scale = 4): Promise<Blob>`, 1,920 × 1,088 by
  default, through an `OffscreenCanvas`. "Save picture" saves the shown frame as
  `screen-<audio position>.png` (answer 21).
- **`_index.tsx`:** the panel container, and under it one row holding the status line, the scale
  note, Save session and Save picture. `fitPanel` gets the window minus that row's height, and runs
  again on resize and on a display-scale change, as plan 1's `fit` does.

- [ ] **Step 1: Write the failing tests**

```ts
// picture.test.ts (browser)
test('a picture is 1920 × 1088 and each screen pixel a 4 × 4 block', async () => {});
// shell.browser.test.ts
test('the panel fills the window at a whole zoom with the screen in its picture', async () => {});
test('L held and a click on step 8 shows SETTINGS', async () => {
  /* header pixels read "Settings" in ACCENT */
});
test('a pad clicked on the panel lights while the mouse is down, wherever it moves', async () => {});
test('a drag on encoder 1 over SETTINGS turns Velocity off', async () => {});
test('a click on encoder 1 without movement is a push', async () => {});
test('blur lets go of a held MENU', async () => {
  /* L down, window blur: tiles gone, no key-up needed */
});
test('a key and the mouse on one pad send one hit and one release', async () => {});
test('Save picture downloads screen-<position>.png', async () => {});
test('two quick clicks start one audio graph', async () => {}); // plan 1's, adapted to the new page
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `npx vitest run tests/picture.test.ts tests/shell.browser.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: the same command, `npx eslint` on the changed files and `npm run typecheck`. Expected: PASS,
  0 errors. Then run `npm run develop` in `apps/groovebox` and check the page by hand at 100 %:
  - MENU + 3, OK, New synth;
  - pads light;
  - PADS/KEYS and the octave;
  - a MIDI controller if one is connected.

- [ ] **Step 5: Commit**

  `git commit -m "Draw the groovebox panel and drive it from mouse, keys and MIDI"`

---

### Task 14: The screen gallery

**Files:**

- Create: `source/routes/gallery.tsx`, `source/gallery/states.ts`, `tests/gallery.test.ts` in
  `apps/groovebox/`.

**Interfaces:**

- **`states.ts`:** `const STATES: ReadonlyArray<{title: string; frame: string; approved?: string}>`,
  one per frame of Task 11's scenes and the two gallery pictures. `frame` is a path under
  `packages/groovebox-core/scenes/` and `approved` a file name in Look's picture folder.
- **`gallery.tsx`** (`/gallery`):
  - Every state's frame at 2 CSS pixels per screen pixel, `image-rendering: pixelated`, its title
    above, and Look's picture beside it when there is one.
  - Files are found with `import.meta.glob` (eager, `?url`).

- [ ] **Step 1: Write the failing test**

```ts
test('every gallery state points at files that exist', () => {
  /* each frame under scenes/ and each approved picture under the look folder exists */
});
```

- [ ] **Step 2: Run it to verify it fails**

  Run: `npx vitest run tests/gallery.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run it to verify it passes**

  Run: the same command, `npx eslint` on the changed files and `npm run typecheck`. Expected: PASS,
  0 errors. Open `/gallery` in the development server and check every image shows.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox screen gallery"`

---

### Task 15: Changeset and the last checks

**Files:**

- Create: `.changeset/groovebox-screens-and-pads.md`: `'groovebox': minor` and
  `'groovebox-core': minor`, "Added the panel, the first screens and the pads of the groovebox."

- [ ] **Step 1: Write the changeset**
- [ ] **Step 2: Run the package checks once**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings` and `npm test` in
  `packages/groovebox-core`; `npm run lint` and `npm run typecheck` in `apps/groovebox`. Expected:
  all pass, and `git status --porcelain` is empty afterwards.

- [ ] **Step 3: Commit**

  `git commit -m "Add a changeset for the groovebox screens and pads"`
