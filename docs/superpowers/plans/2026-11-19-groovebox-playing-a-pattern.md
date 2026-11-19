# Groovebox Playing a Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 1 of 4 for Milestone 3 ("A looping pattern"). Plan 2 is timing and bars, plan 3 the STEP view,
plan 4 mix, mute and track effects (the owner's split, 2026-11-19).

**Goal:** A pattern plays and loops. The step buttons enter and remove the selected sound's notes in
the bar the cursor is in; PLAY starts the pattern from bar 1, SHIFT + PLAY from the cursor's bar,
STOP stops it and a second STOP silences everything. The steps light the selected sound's notes with
the step under the music flipped, the pads light while the pattern plays their notes, PLAY lights
while playing, and the header shows the pattern, the bar and the tempo. Notes live in the note
store: copy-on-write blocks the audio part plays from published versions. A sound with notes is
used, its DELETE question counts its notes, and deleting it removes them.

**Architecture:**

- **Note memory** is 8 MB beside the sample RAM, outside working memory: blocks of 512 bytes plus
  the control part's bookkeeping for them (a count of holders per block, the free blocks and the
  blocks waiting for a report). The audio part only reads blocks.
- **The tree:** each track of each pattern keeps its notes in a B+ tree of blocks, ordered by bar,
  place, sound and pitch. An edit copies the blocks on its path and returns a new tree; old trees
  stay readable, and unchanged blocks are shared.
- **Versions** travel in their own queue: "track T plays this tree from this moment". The moment is
  the input's sample plus `EDIT_LEAD`, so a version never holds back a pad's `NoteOn` in the message
  queue. Blocks the audio part let go of are reused only after its report.
- **One `Sequencer`** walks the trees in time, starts notes, ends them after their length and loops.
  The audio part runs it to play; the control part runs its own copy, fed the same transport and
  versions, to light the pads and steps and to show the playing bar. Nothing on screen comes from a
  report.
- **The audio part knows each sound's engine** (`SoundEngine`), since sequencer notes come from no
  input that could carry it.

**Tech Stack:** as before: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md) is the main spec: "Bars, time
  signatures and the grid" (the step buttons, the grid), "Transport and tempo" (PLAY and STOP),
  "Entering and editing notes" (the step buttons, what a step-entered note gets), "Controls and
  bindings".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "The project and its
  parts" (a note, used), "Deleting a sound in use", "The note store", "Undo, the clipboard and
  running out of memory" (counting memory).
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "How the core runs", "Musical
  time", "Budget profile".
- [Sound](../specs/2026-11-03-groovebox-sound-design.md): "Voices" (STOP while stopped).
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "Pickers and questions" (what
  works while one is open).
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header", "The lights", "The other
  screens" (the Dev page); `step-stopped.png`, `step-playing.png`.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- The EP-133 research for this plan (Teenage Engineering's written guide only; it settles none of
  the points below):
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\9118a0fc-20da-4a21-9883-27f2a051918e\scratchpad\ep133-playing-a-pattern.md`.

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point                   | Answer                                                                                             |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Milestone 3's plans     | Four: playing a pattern; timing and bars; the STEP view; mix, mute and track effects (2026-11-19)  |
| 2   | Steps with an empty pad | Both rules hold together: no note lights, and the step under the music still lights while it plays |

### Settled by the specs, the pictures or the code

| #   | Point                       | Settled                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | A step-entered note         | The current pattern and track; bar: the cursor's; place: the first 1/16 grid position in the step's sixteenth, `sixteenth × 480`; length 480 (one grid step); velocity 127; no pressure curve (Workflow B)                                                                                                                                                                                                         |
| S2  | Its pitch                   | PADS mode: where the sound plays unchanged, the Root note of a sample sound and 60 (C4) for a synth, as a pad hit (`hit`). KEYS mode: the track's `last_key`, or the C of its octave (`key_pitch(0)`) while it is none (built in `Track::last_key`)                                                                                                                                                                |
| S3  | A tap on a lit step         | Removes every note of the selected sound that starts in that sixteenth, whatever its pitch (Workflow B: "the selected sound's notes in that sixteenth")                                                                                                                                                                                                                                                            |
| S4  | When a step acts            | On release, and only as a `Release::Tap`: short, with no other control used meanwhile. A long press alone does nothing; the NOTE strip comes with plan 3. Taken at the press: under MENU or PAGE and with a picker or question open (built), and with SHIFT held, as SHIFT + step is Milestone 5's pattern switch. A step past the bar's end does nothing (none in 4/4)                                            |
| S5  | The cursor                  | STEP and ROLL's shared bar and step exist from this plan: bar 1, step 1 in a new project. A step's tap moves the cursor's step to it (Workflow B: "Pressing a step moves the cursor to that step"). The step buttons show the page of the cursor's step in the cursor's bar. Plan 3 adds the arrows and the rows                                                                                                   |
| S6  | The step lights             | On the shown page: lit where the selected sound has a note starting in the step's sixteenth; while playing, the step whose sixteenth holds the music, in the shown bar and page, flipped; steps past the bar's end off. With no selected sound only the music's step lights (answer 2). While MENU or PAGE is held the tiles' steps, as built                                                                      |
| S7  | PLAY                        | Starts the current pattern from bar 1: tick 0 of the run is the press's sample, with no lead, so PLAY answers as fast as a pad. Notes due before the audio part applies the message start in the chunk it applies. While playing PLAY changes nothing; following comes with plan 2, where patterns grow past one bar                                                                                               |
| S8  | SHIFT + PLAY                | From the start of the cursor's bar (bar 1 in this plan); while playing it jumps there at once, with a new run anchored at the press. With a picker or question open it does nothing: PLAY, STOP and REC work there and "every other combination" waits (Workflow A)                                                                                                                                                |
| S9  | STOP                        | While playing: the pattern stops and its sounding notes get their `NoteOff`, so they fade with their own release; held pads and keys sound on, and so does the preview (Sound lists STOP while stopped, not the first STOP, among what stops it). While stopped: every voice fades within one chunk and the preview stops (Sound). Effect memory is cleared from plan 4                                            |
| S10 | PLAY's light                | Lit while playing (Look)                                                                                                                                                                                                                                                                                                                                                                                           |
| S11 | The header's transport      | While no message shows, from the left: "P1", the cursor's bar over the pattern's length ("1/1", "1/1 ▶1" while playing, the playing bar after ▶), the tempo with one decimal ("120.0"), 6 px apart, the last ending at x 475 (`step-stopped.png`, `step-playing.png` and the Look rig's `drawHeader`). Look's text calls the order "right to left"; the pictures and the rig put the tempo last                    |
| S12 | A long sound name           | While the transport shows, the sound's name in the header loses its end to "…" when the left group would come closer than 6 px to it (Look: names are shortened with "…" only when they do not fit). With a message the message is fitted as built                                                                                                                                                                 |
| S13 | Pads lit by the pattern     | Every pad of the current track whose sound has a note of the current track sounding: from its start to its end; a sound on two pads lights both. In KEYS mode the key of each sounding note of the selected sound in the shown octave (Look's lights). The control part works them out from its own sequencer                                                                                                      |
| S14 | Sounding notes              | A started note keeps its own end, its start plus its length in samples at that moment (Project model). At one sample ends go before starts, so touching notes of a Mono sound restart and only overlapping ones glide (Workflow B)                                                                                                                                                                                 |
| S15 | The loop                    | At the pattern's end the next pass starts at bar 1 with no gap; a note ringing over the loop point keeps its end. Notes past the end of their bar or of the pattern are skipped (Project model; nothing makes one before plan 2)                                                                                                                                                                                   |
| S16 | Tempo and signature         | 120.00 BPM and 4/4 in every project until plan 2 makes them changeable (Workflow B's values for a new project); patterns 1 to 16 exist, 1 bar long and empty; pattern 1 is current                                                                                                                                                                                                                                 |
| S17 | Note memory                 | `note_ram = 8_000_000` in `budget.toml`, beside the sample RAM: 15,384 blocks of 512 bytes, each with 8 bytes of bookkeeping (Project model: "slow external RAM, like the samples"). Patterns' records stay in working memory until Milestone 5 makes patterns unlimited                                                                                                                                           |
| S18 | Versions                    | `VERSION_QUEUE = 64`. The moment is the input's sample plus `EDIT_LEAD`, 1,024 samples (21 ms: the spike measured deliveries up to 512 samples late, plus one control step), and never earlier than the moment before it. The audio part switches at the first chunk start at or after the moment, or at a replay's recorded sample, and reports it. With the queue full the step handles no event (Project model) |
| S19 | Memory decisions            | Blocks wait after a release until the audio part reports the version that let go of them; decisions count them free at once, so they depend only on the inputs (Project model). While fewer than `RESERVE` (256) blocks are ready and some wait, the step handles no event. A tap that would leave fewer than `RESERVE` free adds nothing and shows "Not enough memory" in red; removals may use the reserve       |
| S20 | What the audio part reports | Only `Applied`, now for versions too. The playhead, the lights and the header come from the control part's own sequencer, so every frame is a pure function of the inputs                                                                                                                                                                                                                                          |
| S21 | Used, and DELETE            | A sound with a note in any pattern is used (Project model). The question's count line: "On 2 pads, 24 notes"; a part whose count is 0 is left out ("24 notes", "On 1 pad"), "1 note" for one, no line when nothing uses the sound. OK removes its notes from every pattern and track as well                                                                                                                       |
| S22 | A deleted sound's notes     | The sequencer starts no note of a sound the audio part does not hold, so a version that still has them, in the chunks before the version that removes them, plays nothing and never panics                                                                                                                                                                                                                         |
| S23 | Each sound's engine         | `SoundEngine { sound, engine }` goes out whenever what a sound plays changes: New sample, ENGINE, the Sample item, a relink. `ForgetSample` sets every sound of the file to no file itself; `CopySound` copies it. `MAX_MESSAGES_PER_EVENT` becomes 9                                                                                                                                                              |
| S24 | Sequencer notes             | `NoteId`s with the top bit set, counted by the sequencer; the control part's stay below. At most `SOUNDING` (128) at once: a note that finds the table full first ends the one that ends soonest. The audio part's held keys grow to `PADS + 128 + SOUNDING`                                                                                                                                                       |
| S25 | The Dev page                | A "Note memory" item under Library: "0.0 of 8 MB" and its bar, counting 520 bytes for each block in use, in the library meter's format (Look: the Dev page has library and note memory)                                                                                                                                                                                                                            |
| S26 | Reports                     | `REPORT_QUEUE = MESSAGE_QUEUE + VERSION_QUEUE`, so no report is ever dropped: a dropped version report would leave its blocks waiting for good                                                                                                                                                                                                                                                                     |

### Overview open points this plan settles

Task 1 removes these from the overview's "Open points for planning" and writes each answer into the
spec it belongs to: "The first STOP and the preview" (S9), "SHIFT + PLAY in a picker or question"
(S8), "Edit lead" (S18), "Numbers not yet set" (S18, S19: no reserve for versions in flight is kept;
the step waits for their reports instead), "What the audio part reports" (S20). "Effect memory and
note pool" keeps only the effect memory (S17).

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
  integers, rounded down, tempo in hundredths of a BPM (Foundation). At 120 BPM a sixteenth is 6,000
  samples and a 4/4 bar 96,000.
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds; the device is at
  1,984,024 bytes before this plan and should end near 2,015,000. If it outgrows the budget, report
  the size and stop: the budget is the owner's.
- The audio part never waits and never writes note memory. It reads only blocks of trees a version
  gave it, until the control part hears the report of the version that replaced them; the control
  part writes only blocks no version it sent can reach.
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
    with `-- --test-threads=1` (the parallel run runs the machine out of memory).
  - From Task 5 on, the drift fingerprints change (new messages, then the header); Task 11
    re-blesses every scene once. Tasks 5 to 10 do not run the drift tests.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **A block reused while the audio part may still read it.** Blocks of a released tree must stay
   taken until the version that replaced it is reported, also when two edits on one track are in
   flight at once. Pinned in Task 2 (`waiting_blocks_stay_taken_until_their_version_is_reported`)
   and Task 7 (`two_quick_taps_free_the_first_trees_blocks_only_after_both_reports`).
2. **A late PLAY or version.** A `Play` the audio part applies chunks after its anchor must start
   every note it missed in that first chunk, none twice; a switch must not start again a note that
   started in the old tree. Pinned in Task 4
   (`a_late_play_starts_the_notes_it_missed_in_its_first_chunk`, `a_switch_starts_no_note_twice`)
   and Task 5 (`play_anchors_at_its_run_not_at_its_chunk`).
3. **A deleted sound's notes in a playing version.** Between `DeleteSound` and the version that
   removes the notes, the sequencer must start nothing of the sound and never reach `Sounds::values`
   for it. Pinned in Task 5 (`notes_of_a_deleted_sound_start_nothing`).
4. **Notes at one sample.** A note ending where the next of a Mono sound starts must restart it, not
   glide, and a note over the loop point keeps its end. Pinned in Task 4
   (`at_one_sample_ends_go_before_starts`, `a_note_over_the_loop_point_keeps_its_end`).
5. **A step tap that must do nothing.** SHIFT + step, a step under a picker, a long press and a tap
   with an empty pad must add or remove no note and send no version. Pinned in Task 7
   (`shift_menu_page_or_a_picker_take_the_step`, `a_long_press_or_a_used_hold_does_nothing`,
   `with_an_empty_pad_a_tap_does_nothing`).

## Not in this plan

- **Plan 2 (timing and bars):** the TEMPO item, button and light, the timing strip, the metronome,
  signatures and lengths with their questions, a length or signature change while playing, the short
  second page of a long bar in use, following the music and PLAY while playing following again.
- **Plan 3 (the STEP view):** STEP's grid, lanes and markings; the cursor on cells, its arrows and
  rows; OK and CANCEL on cells; the NOTE strip; a held step with pads or keys.
- **Plan 4:** mutes and their marks, track and master levels, MIX, effects, and STOP while stopped
  clearing effect memory.
- **Milestone 4:** recording, the count-in, REC and its light, quantize, undo, erasing, copying,
  pressure curves, UNDO LOST and FULL, the give-way order when note memory runs out.
- **Milestone 5:** SHIFT + step and switching patterns, patterns past 16, their records in note
  memory with internal numbers, "changed" flags and note counts, saving.

## Shared formats

### Budget

```toml
# budget.toml gains:
note_ram = 8_000_000   # the note memory beside the sample RAM: blocks and their bookkeeping
edit_lead = 1_024      # samples from an edit's input to the moment its version plays
```

### Note memory (`src/store/mod.rs`)

```rust
pub const BLOCK: usize = 512;
/// Each block costs its 512 bytes and 8 of bookkeeping.
pub const NOTE_BLOCKS: usize = budget::NOTE_RAM / (BLOCK + 8);   // 15,384
pub const RESERVE: usize = 256;
pub type Block = u16;
/// A tree's root, or none for an empty tree. Copy.
pub struct Tree(pub Option<Block>);
```

`NoteRam` holds the blocks (one `UnsafeCell`) and the control side's books (another): a count of
holders per block (`u16`), the taken bits, and the waiting blocks as a ring of `u16` with a ring of
`(version number, count)` groups, `VERSION_QUEUE` long.
`const _: () = assert!(size_of::<NoteRam>() <= budget::NOTE_RAM)`. A host keeps it beside the device
like the `SampleRam`.

A block: byte 0 its level (0 a leaf, the height above the leaves for an index), byte 1 its count,
bytes 2 and 3 spare. A leaf holds up to 31 notes from byte 4; an index up to 42 entries of 12 bytes
from byte 4: the first key of the child's subtree (bar `u16`, place `u16`, sound `u32`, pitch `u8`,
a spare byte) and the child `u16`. Every block but the root holds at least a quarter: 8 notes or 11
children.

### A note (`src/store/note.rs`), 16 bytes, little-endian

| Bytes | Field                                                                     |
| ----- | ------------------------------------------------------------------------- |
| 0–1   | bar, from 0                                                               |
| 2–3   | place: ticks from the bar's start; bit 15 spare, 0                        |
| 4–7   | length in ticks; bit 31 spare, 0                                          |
| 8–11  | sound number                                                              |
| 12    | pitch, 0 to 127                                                           |
| 13    | velocity, 1 to 127                                                        |
| 14–15 | pressure curve: bits 0 to 13 a block, `0x3FFF` none; bits 14 and 15 spare |

```rust
pub struct Note { pub bar: u16, pub place: u16, pub length: u32, pub sound: SoundNumber,
                  pub pitch: u8, pub velocity: u8, pub curve: Option<Block> }
/// Ordered by bar, then place, then sound, then pitch (Project model). Ord derived in this order.
pub struct Key { pub bar: u16, pub place: u16, pub sound: SoundNumber, pub pitch: u8 }
impl Key { pub const fn at(bar: u16, place: u16) -> Self /* sound 0, pitch 0 */; pub const MAX: Self; }
```

### Messages (`src/message.rs`)

```rust
pub const REPORT_QUEUE: usize = MESSAGE_QUEUE + VERSION_QUEUE;   // S26
pub const MAX_MESSAGES_PER_EVENT: usize = 9;                       // S23
pub const VERSION_QUEUE: usize = 64;
/// The most versions one event sends: one for each track of the current pattern.
pub const MAX_VERSIONS_PER_EVENT: usize = 4;

/// Track `track` of the current pattern plays `tree` from the first chunk start at or after
/// `moment`. Numbered from the messages' count.
pub struct Version { pub number: u32, pub moment: u64, pub track: u8, pub tree: Tree }

MessageKind::Play { run: Run }          // start, or jump while playing (S7, S8)
MessageKind::Stop                       // S9, while playing
MessageKind::Silence                    // S9, STOP while stopped
MessageKind::SoundEngine { sound: SoundNumber, engine: NoteEngine }   // S23
```

### The sequencer (`src/sequencer.rs`)

```rust
pub const SOUNDING: usize = 128;
/// Sample `anchor` is tick `tick` of the run, counted from bar 1 of the first pass, at `tempo`
/// hundredths of a BPM.
pub struct Run { pub anchor: u64, pub tick: u64, pub tempo: u32 }
impl Run {
    pub fn sample(&self, tick: u64) -> u64;            // Foundation's formula
    pub fn first_tick_after(&self, sample: u64) -> u64; // the first tick whose sample is later
}
pub struct Sounding { pub id: NoteId, pub end: u64, pub track: u8, pub sound: SoundNumber, pub pitch: u8 }
pub enum Event { Start { id: NoteId, track: u8, note: Note }, End(Sounding) }
```

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `store/mod.rs`, `store/note.rs`, `store/tree.rs`: create (Tasks 2, 3). `sequencer.rs`: create
  (Task 4). `lib.rs`: modify (the modules).
- `message.rs`, `device.rs`, `audio/mod.rs`, `audio/sounds.rs`, `audio/voices.rs`: modify (Task 5).
- `project/mod.rs`, `project/pool.rs`: modify (Tasks 6, 7, 10).
- `control/mod.rs`, `control/view.rs`, `control/pool.rs`, `control/samples.rs`, `control/draw.rs`,
  `control/pages.rs`, `control/tests.rs`: modify. `control/transport.rs`, `control/steps.rs`,
  `control/tests/pattern.rs`: create.
- `ui/frame.rs`: modify (Task 9).

**`packages/groovebox-core/`:** `budget.toml`: modify. `crates/groovebox-browser/src/lib.rs`,
`crates/groovebox-browser/build.rs`, `crates/groovebox-drift/src/native.rs` and every other place
that builds a `SampleRam` beside a device: modify (Tasks 5 and 6). `scenes/`: create `steps`, modify
`worst-case`, re-bless all (Task 11).

**`apps/groovebox/`:** `source/gallery/states.ts`, `tests/gallery.test.ts`: modify (Task 11).

**Repo root:** `.changeset/groovebox-playing-a-pattern.md`: create. The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-05-groovebox-workflow-b-design.md`, `2026-11-06-groovebox-project-model-design.md`,
  `2026-11-02-groovebox-foundation-design.md`, `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Overview:** "How part 1 is designed" names Milestone 3's four plans (answer 1); "Open points for
  planning" as listed above.
- **Workflow B:** "The step buttons": answer 2 replaces "with no selected sound they are all dark"
  with "with no selected sound no note lights; the step under the music still does". "PLAY and
  STOP": S7 (tick 0 at the press), S8's picker rule, S9's preview. "What a step-entered note gets":
  S1, S3.
- **Project model:** "The note store": S17's sizes and bookkeeping, S18's queue, lead and order of
  moments, S19, S20 (reports drive memory reuse only), S22. "Deleting a sound in use": S21's count
  line.
- **Foundation:** "Budget profile": `note_ram` and `edit_lead` (S17, S18); "How they talk": versions
  have their own queue.
- **Look:** "The header": the transport's order from the left (S11) and S12; "The other screens":
  the Dev page's "Note memory" (S25).

- [ ] **Step 1: Edit the five specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the pattern playback decisions in the groovebox specs"`

---

### Task 2: Note memory and its books

**Files:**

- Create: `src/store/mod.rs`. Modify: `src/lib.rs`, `budget.toml`. The device and the hosts take the
  note memory when its readers come: the audio side in Task 5, the control side in Task 6.

**Interfaces:**

- **Produces:** `BLOCK`, `NOTE_BLOCKS`, `RESERVE`, `Block`, `Tree` (Shared formats);
  `budget::NOTE_RAM`, `budget::EDIT_LEAD`.
- `pub struct NoteRam`: `pub const fn new() -> Self`;
  `#[cfg(any(test, feature = "harness"))] pub fn boxed() -> Box<Self>` (zeroed on the heap, as
  `SampleRam::boxed`); `pub unsafe fn store(&self) -> Store<'_>` (safety: one store at a time, on
  the control side); `pub unsafe fn reader(&self) -> NoteReader<'_>` (safety: the reader reads only
  blocks of trees a version gave it, until the report that lets go of them reaches the control
  side).
- `pub struct Store<'a>`, the control side's handle:
  - `pub fn take(&mut self) -> Block`: the lowest ready block, zeroed, held by nobody yet. Panics
    when none is ready; callers keep to S19.
  - `pub fn hold(&mut self, tree: Tree)`: one more holder of its root.
  - `pub fn release(&mut self, tree: Tree, after: Option<u32>)`: one holder fewer; a block whose
    holders reach 0 lets go of its children the same way and is free at once with `after` none, or
    waits until `applied(after)` with `after` some.
  - `pub fn applied(&mut self, number: u32)`: the oldest waiting group, when its number is `number`,
    is free.
  - `pub fn free(&self) -> usize` (ready and waiting, for decisions),
    `pub fn ready(&self) -> usize`, `pub fn waiting(&self) -> bool`, `pub fn used(&self) -> u64`
    (`(NOTE_BLOCKS − free) × 520` bytes, S25).
  - `pub(crate)` raw block access for the tree: `block(&self, b) -> &[u8; BLOCK]`,
    `block_mut(&mut self, b) -> &mut [u8; BLOCK]`, `children(&self, b)` (an index block's children).
- `pub struct NoteReader<'a>`: `block(&self, b) -> &[u8; BLOCK]` for the tree's reading side.

- [ ] **Step 1: Write the failing tests**

  Leaves and index blocks are built by hand in the format of "Shared formats".

```rust
#[test] fn note_memory_fits_its_budget() {
    assert_eq!(NOTE_BLOCKS, 15_384);
    assert!(core::mem::size_of::<NoteRam>() <= budget::NOTE_RAM);
}
#[test] fn blocks_are_taken_lowest_first() { /* take ×3 → 0, 1, 2; release block 1's tree → next take is 1 */ }
#[test] fn a_released_tree_lets_go_of_its_children() {
    /* index 0 → leaves 1, 2; hold(Tree(Some(0))); release(.., None): free() and ready() back to NOTE_BLOCKS */
}
#[test] fn a_shared_block_is_freed_with_its_last_holder() {
    /* index 0 → leaves 1, 2; index 3 → leaves 1, 4; hold both; release 0: only 0 and 2 free; release 3: all */
}
#[test] fn waiting_blocks_stay_taken_until_their_version_is_reported() {
    /* release(tree of 3 blocks, Some(7)): free() == NOTE_BLOCKS, ready() == NOTE_BLOCKS − 3, waiting();
       applied(6): unchanged; applied(7): ready() == NOTE_BLOCKS, !waiting() */
}
#[test] fn groups_free_in_their_order() { /* release(a, Some(3)), release(b, Some(5)); applied(5) frees nothing; applied(3) frees a; applied(5) frees b */ }
#[test] fn used_counts_520_bytes_a_block() { /* nothing taken: 0; 2 taken: 1_040 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib store`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `NoteRam`, `Store` and `NoteReader`**

  Raw access follows `SampleRam`: a pointer per block, never a reference to the whole array, so the
  audio side's reads of one block and the control side's writes of another never alias.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib store`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox note memory beside the sample RAM"`

---

### Task 3: Notes and the tree

**Files:**

- Create: `src/store/note.rs`, `src/store/tree.rs`.

**Interfaces:**

- **Consumes:** Task 2's `Store`, `NoteReader`, `Block`, `Tree`.
- **Produces:** `Note`, `Key` (Shared formats); `Note::key(&self) -> Key`.
- On `Store`:
  - `pub fn insert(&mut self, tree: Tree, note: Note) -> (Tree, Option<Note>)`: a new tree with the
    note, replacing and returning a note of the same key. `tree` stays as it was.
  - `pub fn remove(&mut self, tree: Tree, from: Key, to: Key, take: impl FnMut(&Note) -> bool) -> Tree`:
    a new tree without the notes in `from..to` for which `take` is true, each copied leaf touched
    once. A removal that removes nothing returns `tree` and copies nothing.
  - Both copy only the blocks on the way to what changed; the new blocks are held by their parents,
    and the new root by nobody until a `hold`. A split or a block left under a quarter is fixed in
    the same edit, by moving entries from a neighbour or merging with it; a root index of one child
    gives way to it.
- On `NoteReader` (and `Store::reader`):
  - `pub struct Cursor`: `Copy`, no borrow: a path of `(Block, u8)` from the root, at most 6 deep.
  - `pub fn seek(&self, tree: Tree, from: Key) -> Cursor`: at the first note whose key is `from` or
    later.
  - `pub fn peek(&self, cursor: &Cursor) -> Option<Note>`,
    `pub fn advance(&self, cursor: &mut Cursor)`.
  - `pub fn notes(&self, tree: Tree, from: Key) -> impl Iterator<Item = Note> + '_`.

- [ ] **Step 1: Write the failing tests**

  A test PRNG (xorshift, seeded) drives a plain reference: a sorted `Vec<Note>`. After every edit
  the test checks the invariants: notes in key order, every leaf at the same depth, every block but
  the root at least a quarter full, and the books: every taken block reachable from a held root, the
  holders of each block equal to its parents plus its holds.

```rust
#[test] fn a_note_reads_back_from_its_16_bytes() { /* every field at its limits; curve None as 0x3FFF; spare bits 0 */ }
#[test] fn keys_order_by_bar_place_sound_then_pitch() {}
#[test] fn a_tree_matches_a_sorted_list_through_random_edits() {
    /* 20_000 edits from seed 1: inserts over 40 bars × 16 places × 6 sounds × 4 pitches, so keys
       collide, and removals of random ranges with a random sound filter; each new tree held and the
       old one released (None); notes(tree, Key::at(0, 0)) == the reference after each edit */
}
#[test] fn an_insert_of_a_taken_key_replaces_and_gives_back_the_old_note() {}
#[test] fn old_trees_stay_as_they_were() { /* hold v1; v2 = insert(v1, ..); remove from v2; v1 still reads its notes */ }
#[test] fn a_removal_that_removes_nothing_copies_nothing() { /* same Tree back; ready() unchanged */ }
#[test] fn an_edit_copies_only_its_path() { /* 3_000 notes; one insert takes at most depth + 2 blocks */ }
#[test] fn seek_stops_at_the_first_key_at_or_after() { /* notes at bars 0, 2, 5: seek(Key::at(1, 0)) peeks bar 2 */ }
#[test] fn removing_every_note_gives_an_empty_tree_and_frees_every_block() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib store`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the note format and the tree**

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib store`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox note tree"`

---

### Task 4: Time and the sequencer

**Files:**

- Create: `src/sequencer.rs`. Modify: `src/lib.rs`, `src/project/mod.rs` (`Signature`).

**Interfaces:**

- **Consumes:** Task 3's `NoteReader`, `Cursor`, `Note`, `Key`, `Tree`.
- **Produces:** `Run`, `Sounding`, `Event`, `SOUNDING` (Shared formats).
- `project`: `pub struct Signature { pub beats: u8, pub unit: u8 }` (`Copy`),
  `pub const FOUR_FOUR: Signature`, `pub fn bar_ticks(&self) -> u32` (`beats × 7_680 / unit`),
  `pub fn sixteenths(&self) -> u32` (`bar_ticks / 480`).
- `pub struct Sequencer`, one per part:
  - `pub const fn new() -> Self`: stopped, a pattern of 1 bar of 4/4, every track's tree empty.
  - `pub fn play(&mut self, run: Run, notes: &NoteReader)`: plays from `run`, starting or jumping;
    every note whose sample is `run.anchor` or later is due. Notes sounding keep sounding.
  - `pub fn stop(&mut self, out: impl FnMut(Event))`: an `End` for every sounding note, then
    stopped.
  - `pub fn switch(&mut self, track: u8, tree: Tree, notes: &NoteReader)`: the track plays `tree`
    from its first note not yet due, so no note starts twice.
  - `pub fn advance(&mut self, until: u64, notes: &NoteReader, out: impl FnMut(Event))`: every event
    due by `until`, in sample order, ends before starts at one sample (S14), tracks in order at one
    sample; then nothing at `until` or before is due again. A note past its bar's end or the
    pattern's is skipped and the pattern loops (S15). Each start takes the next `NoteId` with the
    top bit set (S24) and its end is `run.sample(start tick + length)`; a full table first ends the
    sounding note that ends soonest.
  - `pub fn run(&self) -> Option<Run>`, `pub fn sounding(&self) -> impl Iterator<Item = &Sounding>`.
  - `pub fn at(&self, sample: u64) -> Option<(u16, u32)>`: while playing, the bar and the place in
    it where the music is at `sample`: the tick before `first_tick_after(sample)`, within the
    pattern.

- [ ] **Step 1: Write the failing tests**

  Trees are built with Task 3's `Store` on a boxed `NoteRam`. "Step k" is a note at bar 0, place
  `k × 480`, length 480, of sound 1 at pitch 60 on track 0. Runs are at 120 BPM:
  `Run { anchor: 0, tick: 0, tempo: 12_000 }` unless said.

```rust
#[test] fn ticks_become_samples_rounded_down() {
    let run = Run { anchor: 1_000, tick: 0, tempo: 12_000 };
    assert_eq!([run.sample(0), run.sample(1), run.sample(2), run.sample(480)], [1_000, 1_012, 1_025, 7_000]);
    assert_eq!(run.first_tick_after(999), 0);
    assert_eq!(run.first_tick_after(1_000), 1);
    assert_eq!(run.first_tick_after(1_012), 2);
    assert_eq!(run.first_tick_after(6_999), 480);
}
#[test] fn a_bar_of_4_4_is_7_680_ticks_and_7_8_is_6_720() {}
#[test] fn notes_start_at_their_sample_and_end_after_their_length() {
    /* steps 0 and 4: advance(0) → Start(step 0); advance(5_999) → nothing; advance(6_000) → End(step 0);
       advance(24_000) → Start(step 4) */
}
#[test] fn the_pattern_loops_with_no_gap() { /* step 0: Starts at 0, 96_000 and 192_000 */ }
#[test] fn at_one_sample_ends_go_before_starts() { /* steps 0 and 1: at 6_000 End(step 0) then Start(step 1) */ }
#[test] fn a_note_over_the_loop_point_keeps_its_end() { /* step 15 of length 960: Start at 90_000, End at 102_000, Start again at 186_000 */ }
#[test] fn a_late_play_starts_the_notes_it_missed_in_its_first_chunk() {
    /* steps 0 and 1; first advance(7_000) → Start(0), End(0), Start(1), in that order; then nothing until 12_000 */
}
#[test] fn a_switch_starts_no_note_twice() {
    /* steps 0 and 8; advance(10_000); switch to steps 0, 4, 8 → advance(48_000) gives Start(4) at its turn and
       Start(8), never step 0 again */
}
#[test] fn a_jump_starts_from_its_run() { /* playing from 0; play(Run { anchor: 30_000, tick: 1_920, tempo: 12_000 }) → step 4 starts at 30_000 */ }
#[test] fn stop_ends_every_sounding_note() {}
#[test] fn notes_past_their_bar_or_the_pattern_are_skipped() { /* place 7_680 and bar 1 never start */ }
#[test] fn a_full_table_ends_the_note_that_ends_soonest() { /* 129 notes at place 0, pitches 0..=128 with lengths 1_000 + pitch: the 129th start is after End(pitch 0) */ }
#[test] fn sequencer_ids_have_the_top_bit_set() {}
#[test] fn at_gives_the_bar_and_place_of_the_music() { /* at(6_000) == Some((0, 480)); at(96_000 + 12) == Some((0, 0)); stopped: None */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib sequencer`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `Run`, `Signature` and the `Sequencer`**

  Each track keeps a `Cursor` and its pass; `advance` merges the tracks' next starts with the
  sounding table's ends by sample. Guard the wrap: a tree with no note inside the pattern wraps no
  more than once per `advance`.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib sequencer`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox sequencer"`

---

### Task 5: The audio part plays versions

**Files:**

- Modify: `src/message.rs`, `src/device.rs` (the version queue, its consumer on the audio side;
  `audio_side` takes `&NoteRam` after `&SampleRam`, and `AudioSide::render` reads through its
  reader), `src/audio/mod.rs`, `src/audio/sounds.rs`, `src/audio/voices.rs`, `src/control/mod.rs`
  (`send_values` and `hit`), `src/control/samples.rs`; `crates/groovebox-browser/src/lib.rs`
  (`static NOTE_RAM: NoteRam`; `APPLIED` follows `REPORT_QUEUE`),
  `crates/groovebox-browser/build.rs` (the memory adds `NOTE_RAM`), the drift crate (`native.rs` and
  every other place that builds a `SampleRam` beside a device builds a `NoteRam` too).

**Interfaces:**

- **Consumes:** Task 4's `Sequencer`, `Run`, `Event`; Task 2's `NoteReader`.
- **Produces:** the messages, `Version`, `VERSION_QUEUE`, `MAX_VERSIONS_PER_EVENT` (Shared formats).
- `Audio::render(&mut self, left, right, readers: &[Reader<'_>; 2], notes: &NoteReader<'_>, messages: &mut Consumer<'_, Message, MESSAGE_QUEUE>, versions: &mut Consumer<'_, Version, VERSION_QUEUE>, reports: &mut Producer<'_, Report, REPORT_QUEUE>)`.
  At each chunk start: the due messages, then the versions whose moment is due (`switch`, reported
  `Applied` like a message), then `sequencer.advance(chunk start)`: a `Start` of a sound it holds is
  `voices.note_on` with the sound's engine, any other `Start` is dropped (S22); an `End` is
  `voices.note_off`. Then the voices render.
  - `Play { run }` is `sequencer.play`; `Stop` is `sequencer.stop` into `note_off`s; `Silence` fades
    every voice that is not idle (`Voices::silence(&mut self, fades)`) and stops the preview;
    `SoundEngine` is `Sounds::set_engine`.
- `Sounds`: `pub fn holds(&self, sound) -> bool`, `pub fn engine(&self, sound) -> NoteEngine`,
  `pub fn set_engine(&mut self, sound, engine)`, `pub fn forget(&mut self, file: FileId)` (every
  sound of the file plays no file). `add` starts a sound at `NoteEngine::Synth`; `CopySound` copies
  the engine with the values.
- `Voices`: `HELD = PADS + 128 + SOUNDING`; `pub fn silence(&mut self, fades)`.
- Control: `fn note_engine(&self, sound: &Sound) -> NoteEngine` (what `hit` sends, now shared);
  `send_values(sound, before_values, before_engine, sample, messages)` also sends `SoundEngine` when
  `note_engine` differs from `before_engine`; New sample's `before_engine` is `Synth`, the new
  sound's start in the audio part.

- [ ] **Step 1: Write the failing tests**

  The audio rig gains a boxed `NoteRam`, its `Store` for building trees and a version queue.

```rust
// audio/mod.rs
#[test] fn play_starts_the_trees_notes_at_their_samples() {
    /* sound 1 synth; version track 0 = steps 0 and 4 at moment 0; Play { run: Run { anchor: 0, .. } } at 0:
       sound from chunk 0, silence from about 6_000 + release, sound again from chunk 24_000 */
}
#[test] fn a_version_applies_at_its_moment_and_is_reported() { /* moment 4_000 → Applied { number, sample: 4_000 } */ }
#[test] fn play_anchors_at_its_run_not_at_its_chunk() {
    /* render 128; then Play { run: anchor 50 } at 50: step 0 starts at chunk 128, step 1 at chunk 6_080 */
}
#[test] fn stop_releases_the_patterns_notes_and_keeps_a_held_pad() {}
#[test] fn silence_fades_every_voice_within_a_chunk_and_stops_the_preview() {}
#[test] fn notes_of_a_deleted_sound_start_nothing() { /* DeleteSound, then the tree still has its notes: silence, no panic */ }
#[test] fn a_forgotten_file_plays_no_pattern_note() { /* SoundEngine(file 0), ForgetSample(file 0): the next pattern note reads nothing */ }
#[test] fn a_copied_sound_plays_its_originals_engine() {}

// control/tests.rs
#[test] fn a_new_sample_sound_tells_the_audio_part_its_file() { /* … NewSound, its values, SoundEngine { engine: Sample(Some(..)) } */ }
#[test] fn engine_to_synth_tells_the_audio_part() {}
#[test] fn choosing_the_sounds_own_file_sends_nothing() {}
#[test] fn a_relink_tells_the_audio_part_the_file() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio control`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the messages, the version queue and the audio part's sequencer**

  `MAX_MESSAGES_PER_EVENT` 9; tests that spell the old messages of an event gain the `SoundEngine`.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`, the clippy command and `node build.js`. Expected: PASS;
  the module builds with the larger memory.

- [ ] **Step 5: Commit**

  `git commit -m "Play groovebox note versions in the audio part"`

---

### Task 6: Patterns, PLAY and STOP

**Files:**

- Create: `src/control/transport.rs`. Modify: `src/project/mod.rs`, `src/control/mod.rs`,
  `src/control/view.rs`, `src/device.rs` (`control_side` takes `&NoteRam` after `&SampleRam`;
  `ControlSide::step` hands the control part the version producer and the `Store`; reports go to
  `applied` with the `Store`), the browser and drift crates' calls of `control_side`,
  `src/control/tests.rs` (the rig's step), `src/control/tests/pattern.rs`.

**Interfaces:**

- **Consumes:** Task 5's messages and queue; Task 4's `Sequencer`, `Run`, `Signature`.
- **Produces, `project`:** `pub struct Pattern { pub bars: u16, pub tracks: [Tree; 4] }`;
  `Project.patterns: [Pattern; 16]` (1 bar, empty), `Project.pattern: u8` (0, shown "P1"),
  `Project.tempo: u32` (`NEW_TEMPO = 12_000`), `Project.signature: Signature` (`FOUR_FOUR`) (S16).
- **Produces, `view`:** `pub struct StepCursor { pub bar: u16, pub step: u8 }` (`step` counts
  sixteenths from the bar's start), `View.steps: StepCursor` (bar 0, step 0) (S5).
- **Produces, control:**
  - `Control::step(&mut self, until, messages, versions: &mut Producer<'_, Version, VERSION_QUEUE>, io, tables, ram, store: &mut Store<'_>) -> bool`;
    an event is handled only while `versions.free() >= MAX_VERSIONS_PER_EVENT` and not while
    `store.ready() < RESERVE && store.waiting()` (S18, S19). After the events the control part's own
    `player: Sequencer` advances to `until`, dropping its events but keeping its sounding table.
  - `Control::applied(&mut self, number, sample, store: &mut Store<'_>)`: also
    `store.applied(number)`.
  - `fn stamped(&mut self, number: u32, sample: u64) -> u64`: the replay record's sample for
    `number`, or `sample`; `send` uses it, and so does Task 7's `publish`.
  - PLAY, SHIFT + PLAY and STOP at their press (S7 to S9): `Play { run }` with
    `Run { anchor: sample, tick: bar × bar_ticks, tempo: project.tempo }`, `Stop`, or `Silence` (and
    `previewing` false); the `player` gets the same `play` or `stop`. With a picker or question open
    PLAY and STOP act and SHIFT + PLAY is taken.
  - `lights`: `Lights::PLAY` while `player.run()` is some (S10).

- [ ] **Step 1: Write the failing tests** (`control/tests/pattern.rs`)

```rust
#[test] fn a_new_project_has_16_empty_one_bar_patterns_at_120_in_4_4() {}
#[test] fn play_starts_bar_1_at_the_press_and_lights() {
    /* press play at 9_600: sent [Play { run: Run { anchor: 9_600, tick: 0, tempo: 12_000 } } at 9_600]; lit has PLAY */
}
#[test] fn play_while_playing_sends_nothing() {}
#[test] fn shift_play_starts_from_the_cursors_bar_and_jumps_while_playing() { /* tick 0 in this plan; the jump's anchor is its own press */ }
#[test] fn stop_while_playing_stops_and_the_preview_plays_on() { /* sent [Stop]; previewing stays true; PLAY unlit */ }
#[test] fn stop_while_stopped_silences_everything() { /* sent [Silence]; previewing false */ }
#[test] fn with_a_picker_open_play_and_stop_act_and_shift_play_waits() {}
#[test] fn play_and_stop_act_while_menu_is_held() {}
#[test] fn an_event_waits_while_the_version_queue_is_full() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::pattern`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the patterns, the cursor, the transport and the step's new rules**

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Start and stop groovebox patterns"`

---

### Task 7: Steps enter and remove notes

**Files:**

- Create: `src/control/steps.rs`. Modify: `src/control/mod.rs` (`press` takes a step under SHIFT;
  `release` hands a step's `Tap` to `tap_step`; `lights`), `src/project/pool.rs`
  (`Sound.notes: u32`), `src/control/tests/pattern.rs`.

**Interfaces:**

- **Consumes:** Task 6's `Pattern`, `StepCursor`, `stamped`, `player`; Task 3's `insert`, `remove`.
- **Produces:**
  - `Sound.notes: u32`: the sound's notes in every pattern, kept by every edit.
  - `fn publish(&mut self, track: u8, tree: Tree, sample: u64, versions, store)`: for the current
    pattern only. The moment is `max(sample + EDIT_LEAD, the previous moment)`, then `stamped`; the
    tree gets a hold for the audio part, and the tree the audio part held before is released with
    `after` this version's number; `player.switch` follows at once.
  - `fn edit(&mut self, pattern, track, tree: Tree, sample, versions, store)`: the pattern's track
    takes the tree (hold the new, release the old with `after` none) and the current pattern's is
    published.
  - `fn tap_step(&mut self, button: u8, sample: u64, versions, store)` (S1 to S5): the sixteenth is
    `page × 16 + button` of the cursor's bar, nothing past the bar's end; the cursor's step goes
    there; with a selected sound, the sound's notes in
    `Key::at(bar, sixteenth × 480)..Key::at(bar, (sixteenth + 1) × 480)` are removed if there are
    any, else S1's note is inserted, unless `store.free() < RESERVE` (S19): then "Not enough memory"
    in `RECORD`.
  - `step_notes: u16`, worked out at the end of each step: which steps of the shown page start a
    note of the selected sound. `lights` uses it with `player.at(self.now)` (S6).

- [ ] **Step 1: Write the failing tests**

  A synth on pad 1 (`synth_on(0)`) unless said. A tap is a press and a release one sample later.

```rust
#[test] fn a_tap_on_an_unlit_step_adds_the_selected_sounds_note_when_let_go() {
    /* tap step 5 at 9_600: nothing at the press; at the release one Version { track: 0, moment: 9_601 + 1_024 }
       whose tree holds Note { bar: 0, place: 1_920, length: 480, sound, pitch: 60, velocity: 127, curve: None };
       Sound.notes == 1 */
}
#[test] fn a_sample_sound_steps_at_its_root_note() {}
#[test] fn in_keys_mode_a_tap_adds_the_last_key_or_the_c_of_the_octave() { /* none played: 60; after key E4 (64): 64; octave 5 after it: still 64 */ }
#[test] fn a_short_tap_on_a_lit_step_removes_every_note_of_the_sound_in_it() { /* two pitches in KEYS mode, another sound kept */ }
#[test] fn a_long_press_or_a_used_hold_does_nothing() { /* release after HOLD; a pad hit while held */ }
#[test] fn shift_menu_page_or_a_picker_take_the_step() {}
#[test] fn with_an_empty_pad_a_tap_does_nothing() { /* no version; the cursor's step still moves */ }
#[test] fn a_tap_moves_the_cursors_step() {}
#[test] fn the_steps_light_the_sounds_notes_and_the_music_flips_its_step() {
    /* notes at steps 1 and 5; PLAY: at the sample of step 1 it is dark, at step 2 steps 1, 2 and 5 lit;
       empty pad selected: only the music's step lit */
}
#[test] fn moments_never_go_backward_and_take_replay_records() {}
#[test] fn two_quick_taps_free_the_first_trees_blocks_only_after_both_reports() {}
#[test] fn the_step_waits_for_reports_while_the_reserve_waits() {}
#[test] fn a_tap_without_room_says_not_enough_memory() { /* fill the store's free blocks below RESERVE by hand */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::pattern`. Expected: FAIL.

- [ ] **Step 3: Implement the taps, `edit`, `publish` and the step lights**

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Enter and remove groovebox notes with the steps"`

---

### Task 8: Pads light with the pattern

**Files:**

- Modify: `src/control/mod.rs` (`lights`), `src/control/tests/pattern.rs`.

**Interfaces:**

- **Consumes:** Task 6's `player`, its sounding table at `now`.
- **Produces:** S13 in `lights`, after the held pads and the selection, as built.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_pad_lights_while_its_pattern_note_sounds() { /* pad 3's sound at step 0: lit at 0..6_000, dark after; pad 1 stays lit as selected */ }
#[test] fn a_sound_on_two_pads_lights_both() {}
#[test] fn in_keys_mode_the_key_of_a_sounding_pitch_lights() { /* pitch 64 in octave 4: pad 5 lit; pitch 76: none */ }
#[test] fn notes_of_another_track_light_nothing() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::pattern`. Expected: FAIL.

- [ ] **Step 3: Implement the lights**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Light groovebox pads while the pattern plays them"`

---

### Task 9: The header's transport and the note memory meter

**Files:**

- Modify: `src/ui/frame.rs`, `src/control/draw.rs`, `src/control/pages.rs`, the control tests'
  shared picture helpers (`drawn`, `STEP_HEADER` and the others that build a header), the frame
  tests.

**Interfaces:**

- **Consumes:** Task 6's `player`, `Project.pattern`, `patterns`, `tempo`, `View.steps`; Task 2's
  `Store::used`, cached by `step` as `note_memory: u64`.
- **Produces:**
  - `draw_header(canvas, left: &[Piece], right: &[Piece])`: the right pieces in their order, the
    last ending at `HEADER_RIGHT`, `PIECE_GAP` apart. A message is one piece.
  - `fn transport(&self, out: &mut [Label<24>; 3])`: "P1", "1/1" or "1/1 ▶1", "120.0" (S11).
  - S12's cut of the sound's name.
  - `pages.rs`: `NOTE_METER: ItemDef` (`ItemKind::NoteMeter`, no encoder) after `LIBRARY_METER` on
    the Dev page, drawn as the library meter with the name "Note memory" and
    `name::meter(note_memory, NOTE_RAM)` (S25).

- [ ] **Step 1: Write the failing tests**

```rust
// ui/frame.rs
#[test] fn right_pieces_end_at_the_right_edge_6_pixels_apart() { /* "P1", "1/1", "120.0": spans end at 475 */ }

// control/tests/pattern.rs
#[test] fn the_header_shows_the_pattern_the_bar_and_the_tempo() { /* stopped: pieces "P1", "1/1", "120.0" */ }
#[test] fn while_playing_the_bar_names_the_playing_bar() { /* "1/1 ▶1" */ }
#[test] fn a_message_replaces_the_transport() {}
#[test] fn a_long_sound_name_stops_short_of_the_transport() { /* a 40-character name ends in "…" ≥ 6 px left of "P1" */ }
#[test] fn the_dev_page_shows_note_memory() { /* "Note memory", "0.0 of 8 MB"; after many taps the value grows */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib ui::frame control`. Expected: FAIL.

- [ ] **Step 3: Implement the transport, the cut and the meter**

  Every expected picture that has a header gains the stopped transport through the shared helpers;
  "Loading library" keeps its header alone.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Show the groovebox transport in the header"`

---

### Task 10: POOL with notes

**Files:**

- Modify: `src/project/mod.rs` (`is_used`), `src/control/pool.rs` (`delete_sound`),
  `src/control/draw.rs` (the count line), `src/control/tests/pool.rs`, `src/project` tests.

**Interfaces:**

- **Consumes:** Task 7's `Sound.notes`, `edit`; Task 3's `remove`.
- **Produces:**
  - `Project::is_used`: a pad of any track holds the sound, or `notes > 0` (S21). `unused`, Remove
    unused and the POOL row follow it.
  - `delete_sound(sound, sample, versions, store)`: before the sound leaves the pool, every
    pattern's every track loses the sound's notes (`remove` over `Key::at(0, 0)..Key::MAX`), each
    changed track through `edit`; then the `DeleteSound` goes out as built (S17 of the POOL plan),
    before the versions apply (S22). An event that deletes a sound needs `MAX_VERSIONS_PER_EVENT`
    free, as any event.
  - The count line (S21).

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_sound_with_notes_is_used() {}
#[test] fn the_delete_question_counts_pads_and_notes() { /* "On 2 pads, 24 notes"; "24 notes"; "On 1 pad, 1 note"; none */ }
#[test] fn deleting_a_sound_removes_its_notes_from_every_track() { /* notes on T1 and T3: two versions, both trees without them, the other sound's notes kept */ }
#[test] fn remove_unused_keeps_a_sound_with_notes() {}
#[test] fn a_row_of_a_sound_with_notes_on_no_pad_says_no_pad() { /* "synth  no pad" */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib project control::tests::pool`. Expected: FAIL.

- [ ] **Step 3: Implement used, the delete and the count line**

  A removal that needs more blocks than are ready panics with a `shortcut:` comment: "a delete whose
  copies need more blocks than are free panics; Milestone 4's give-way order replaces it". It takes
  thousands of notes of one sound spread through a nearly full note memory.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Count and delete groovebox notes with their sound"`

---

### Task 11: Scenes, the worst case, the gallery and the changeset

**Files:**

- Create: `scenes/steps.scene`, `.changeset/groovebox-playing-a-pattern.md`.
- Modify: `scenes/worst-case.scene`, every scene's fingerprints and frames (re-blessed),
  `apps/groovebox/source/gallery/states.ts`, `apps/groovebox/tests/gallery.test.ts`.

**What the scenes do:**

- **`steps`** (Workflow B's drift scene "a beat entered by steps from an empty project"): New synth
  on pad 1 through the panel, taps of steps 1, 5, 9 and 13, PLAY, two passes, a tap of step 3 while
  playing, SHIFT + PLAY, STOP, PLAY, STOP and STOP. Frames: stopped with the notes entered, playing
  in the first pass, after the last STOP.
- **`worst-case`:** before its 32 MIDI notes, taps of steps 1 to 16 for the sample sound and PLAY,
  so the sequencer starts notes during the busiest batches.

- [ ] **Step 1: Write `steps.scene` and extend `worst-case.scene`**
- [ ] **Step 2: Build and re-bless**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift -- --test-threads=1`. Expected: PASS: every scene
  plays the same natively and in both `.wasm` builds. A recorded browser scene whose `expect-audio`
  no longer matches gets the core's new fingerprint, as `browser-library.scene` did before; say so
  in the commit.

- [ ] **Step 3: Check the operation count**

  Run: `cargo test -p groovebox-drift --test operations -- --nocapture`. Expected: PASS within
  `worst_batch_operations`; note the busiest batch. Over the budget: report and stop.

- [ ] **Step 4: The gallery**

  `states.ts` gains the `steps` frames ("Header stopped: P1 1/1 120.0", "Header playing: 1/1 ▶1",
  "Header after STOP"; STEP's grid comes with plan 3), and `gallery.test.ts` lists `steps` among the
  scenes whose every frame has a state.

  Run, from `apps/groovebox`: `npx vitest run tests/gallery.test.ts`,
  `npx eslint source/gallery/states.ts tests/gallery.test.ts`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: The changeset**

```markdown
---
'groovebox': minor
---

Added pattern playback to the groovebox: PLAY and STOP, a looping pattern, notes entered and removed
with the step buttons, and the transport in the header.
```

- [ ] **Step 6: Run clippy and commit**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: no warnings.

  `git commit -m "Add the groovebox steps scene and re-bless the scenes"`
