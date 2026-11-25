# Groovebox Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 1 of 4 for Milestone 4 ("Play it in"). Plan 2 is ROLL and the NOTE panel, plan 3 undo and plan
4 erasing, clearing and copying (answer 1). This plan is written against `37d75f99`: all of
Milestone 3, the pitch envelope and the factory project, built and pushed.

**Goal:** REC arms while stopped and drops in and out while playing. PLAY after arming counts in one
bar of clicks first. Every pad hit and MIDI note played while recording goes into the current track
as played: snapped to the nearest sixteenth with QUANTIZE on, kept where it was played with it off,
and corrected for the output delay in both cases. Overdub passes add to what is there, and a MIDI
controller's aftertouch is kept as each note's pressure curve.

**Architecture:**

- **The count-in is the bar before the start.** `Play` gains `count_in`. The run starts at the press
  and the pattern one bar later in the same ticks, so a tempo turn during the count-in moves the
  first beat the way it moves any beat. That bar clicks in both parts' sequencers whatever METRONOME
  says, no note starts in it and the music stands at the pattern's start (answer 2).
- **Recording belongs to the control part alone** (Foundation: "Notes are recorded by the control
  part"). A hit while recording carries a take on its entry in `Notes`: its tick less the output
  delay, its snapped start, its sound, pitch and velocity. Its release (or REC off, STOP or a jump)
  inserts the note into the track's tree like any other edit. The version's moment never comes
  before the note's start, so the audio part does not play again what the hit already played.
- **Ticks belong to the run.** The sequencer gains `tick_at`, `sample_at`, `snap` and `place`. Run
  ticks count on across passes, so a length over the loop point is a plain difference and a hit just
  before the loop restarts snaps into bar 1 of the next pass.
- **A pressure curve is a block of the note memory.** A leaf holds its notes' curves the way an
  index holds its children. Copies, undo and the clipboard then share them, and a removed note's
  curve goes with the last leaf that held it.
- **The output delay is an input.** The shell reports the browser's output delay whenever it
  changes, and every recorded time is its input's sample less the latest report. The session log
  keeps the reports, so replays match (Foundation: "the delay used is recorded with the input").

**Tech Stack:** as before: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the shell and the gallery. No new dependency.

**Spec:**

- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md) is the main spec: "Count-in",
  "Live recording" ("REC", "Recorded notes"), "STEP" ("Cells"), "The NOTE strip", "PLAY and STOP",
  "The TEMPO button", "Controls and bindings", "Testing".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "The note store"
  ("Recording", "One version per edit, at its own moment"), "Pressure curves", "Undo, the clipboard
  and running out of memory" (FULL; UNDO LOST comes with plan 3).
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "Musical time" ("Live playing":
  the output delay), "Parameters" (the ID blocks).
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "Pickers and questions" (pads
  are recorded with a picker open; PLAY, STOP and REC work there), "Velocity and pressure".
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header" (the record dot), "STEP" (notes
  off the grid), "SETTINGS" (Count-in), "PATTERN" (Timing), "The lights"; `step-playing.png`,
  `step-stopped.png`, `timing-strip.png`.
- The Look rig's `drawHeader` and `recIcon`, the drawing code of the approved pictures (outside the
  repo by the owner's choice):
  `C:\Users\Jakub\AppData\Local\Temp\claude\D--projects-apps\acb4db09-8c01-482d-9418-b85e6f948e54\scratchpad\redraw\rig\groovebox-screens.html`.
  S6 copies its geometry.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- The EP-133 guide (saved for M3 plan 1 under
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\9118a0fc-20da-4a21-9883-27f2a051918e\scratchpad\ep133txt\`):
  `play-and-record.txt` gives a four-beat count-in after REC then PLAY and says nothing of what
  shows during it; `functions.txt` has quantize and free time but not which step a loose note shows
  on; no blink rate anywhere.

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point                                    | Answer (2026-11-25)                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Milestone 4's plans                      | Four, in the overview's order: recording (REC, the count-in, quantize, overdub, notes with their velocity, length and pressure); ROLL and the NOTE panel; undo and redo for everything built by then, with UNDO LOST and the undo budget; erasing, clearing and copying, each with its undo |
| 2   | The count-in (overview: "REC during…")   | Only the clicks and REC show it. PLAY lights at the press; REC keeps blinking and the header's record dot stays dim; the screen, the music line and the step buttons stand still on the start bar. At the first beat REC turns steady, the dot red and the music line starts moving         |
| 3   | The fast blink (overview: "Blink speed") | With the beat: on for the first half of each beat at the current tempo, off for the second. The same speed later blinks a queued pattern (Milestone 5)                                                                                                                                      |
| 4   | A note off the grid                      | It belongs to the step whose sixteenth it starts in, as the built STEP view has it: a slightly early loose hit lights the step before the one aimed at, and its cell draws it 2 px right. Nothing is drawn left of centre                                                                   |

### Settled by the specs, the pictures, the rig or the code

| #   | Point                   | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Values and IDs          | Foundation's blocks: COUNT_IN 5 (device), a list of "Off" (key 0) and "1 bar" (key 1), starting at 1 bar (Workflow B), so a longer count-in can join later under the same ID; QUANTIZE 102 (project), a switch starting On (Workflow B). `Project::quantize: bool`. `value_of` and `set_on` pick QUANTIZE out by its ID under `Target::Project`, as TEMPO is picked out; its `SetParam` goes out as every change's does and the audio part ignores it                                                                                                                                                                                                                                                      |
| S2  | The items               | PATTERN's Timing page: Tempo (encoder 1), Grid (2), Quantize (4); encoder 3 holds nothing until Swing comes, so the timing strip's third cell stays empty (Look). SETTINGS' Playing page: Velocity, Metronome, Metronome level, Count-in on encoders 1 to 4 (Look). Count-in is a list: turns and − and + move it, OK does nothing. Quantize is a switch: OK flips it                                                                                                                                                                                                                                                                                                                                      |
| S3  | REC                     | Acts at its press (Workflow B), sends nothing and is the control part's alone: `Rec::Off`, `Armed` or `On`. Stopped: Off arms, Armed disarms. During the count-in: Armed turns Off and Off turns Armed again ("REC again before the first beat puts recording back"). Playing: Off turns On (a new pass) and On turns Off, ending the held takes (S11). It acts on every screen, under MENU or PAGE and with a picker or a question open, as PLAY and STOP do. SHIFT + REC is taken and does nothing (still free). STOP turns REC Off from any state                                                                                                                                                       |
| S4  | The count-in            | PLAY or SHIFT + PLAY while stopped, armed and COUNT-IN at 1 bar sends `Play { run, count_in: true }`: tick `run.tick` is the press, and the pattern starts one bar of the signature later, at bar `run.tick / bar_ticks`. Its beats are `Event::Beat { first, count_in: true }`, the first one high, and the audio part clicks them whatever METRONOME says. No note starts in that bar. With COUNT-IN Off, PLAY while armed turns REC On at the press. PLAY and SHIFT + PLAY during the count-in do nothing at all. A tempo turn retimes it as usual, so the first beat moves. A length or signature change during it takes hold at the pattern's start (`next_bar_line`)                                 |
| S5  | Armed turns On          | In `step`, after the player advances to each event's sample and at the end of the step, a REC armed while the player plays past its count-in turns On: the pass starts at the first beat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S6  | The record dot          | The rig's `recIcon`: 7 px wide, its rows 3, 5, 7, 7, 7, 5 and 3 px wide and centred, from `HEADER_ROW + 3`. In the right group it sits between the tempo and the metronome's icon, `PIECE_GAP` from each (the rig lays out Mute, the metronome, the dot, then the transport from the right). Dim while armed, the count-in included; `RECORD` while On; none while Off. It counts in the room that shortens a sound's name, and a message replaces it with the rest of the transport (Look)                                                                                                                                                                                                                |
| S7  | The REC light           | On: lit. Armed: on for the first half of each beat (answer 3), the beat as the signature counts it (a quarter in x/4, an eighth in x/8). While stopped the beats run at the current tempo from the press that armed REC: `Rec::Armed(Run)` anchors a run there, and a tempo turn while armed re-anchors it from the first tick after the turn, as `retimed` does. During the count-in they are the clicks' beats (`Sequencer::beat_on`). Off: dark                                                                                                                                                                                                                                                         |
| S8  | The output delay        | `Input::OutputDelay { samples }`, wire kind 11 with `a` the samples, scene word `output-delay`. The shell sends `round((baseLatency + outputLatency) × 48,000)` once audio runs and again whenever that number changes, checked on each animation frame it draws. The control part keeps the latest, also while the library still loads, 0 until one comes, so every scene and the device stay as they are until part 3 gives the device its own. Every recorded time is its input's sample less it, held at 0                                                                                                                                                                                             |
| S9  | What is recorded        | A pad hit or a MIDI note that plays a sound, while REC is On or Armed during the count-in, and not under a held step (Workflow B); with a picker or a question open it is recorded (Workflow A). Its sound, pitch and velocity are the ones the hit plays (VELOCITY off: 127), on the track and pattern current at the hit. A hit from before REC turned On is not recorded, even when it is still held after                                                                                                                                                                                                                                                                                              |
| S10 | Where it starts         | `tick_at` of the hit's sample less the delay. With QUANTIZE on, `snap` moves it to the nearest 1/16 grid position counted from the bar lines, the later one at exactly half (Workflow B: "a hit slightly early lands on the step it was aimed at"). `place` gives its bar and place, bar 1 of the next pass at the pattern's end. A start before the pattern's start (in the count-in) records nothing, so only a quantized hit snapped onto the first beat lands there (Workflow B)                                                                                                                                                                                                                       |
| S11 | Its length              | The tick at its end less the hit's tick before snapping (Workflow B: "the note moves, it does not stretch"), at least 1 tick and at most the pattern's length (bars × bar ticks when it ends). It ends at its release, or at REC turning Off, STOP or SHIFT + PLAY while recording: those end every held take at their press, each track publishing once, and the later release adds nothing. A jump starts a new run, whose ticks do not continue the old one's                                                                                                                                                                                                                                           |
| S12 | Going in                | `Store::insert` replaces a note of the same sound, pitch, bar and place, so overdub passes never double it. The sound's count goes up unless it replaced one. Before the `edit`, `moment` is raised to the start's sample in its pass plus 1, so a hit snapped forward is not played again in that pass (Project model). The control part's player takes the tree at once, as it takes every edit (the owner's 21 ms rule), so a very short tap snapped forward can light its pad again at its start without sounding                                                                                                                                                                                      |
| S13 | Dropped at the end      | Its sound has left the pool; its bar or place no longer fits the pattern (a length or signature change since the hit); or the pass is full (S14). A dropped take gives its curve block back                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S14 | Full                    | With fewer than `RESERVE` blocks free when a note would go in, nothing goes in, the pass is full and "Full" shows in red (Project model: FULL). For the rest of the pass each hit while recording shows "Full" again and records nothing. A press clears it as it clears every message. REC turning On starts a pass that is not full                                                                                                                                                                                                                                                                                                                                                                      |
| S15 | A pressure curve        | Byte 0 is `CURVE` (255), the kind no tree block has; bytes 1 and 2 the point count; 3 bytes a point from byte 4: the ticks since the point before (since the hit for the first), held at 65,535, then the value. 169 points fit. Taken at a recorded note's first pressure while more than `RESERVE` blocks are free; otherwise the note gets none (Project model: the curve gives way first). A point is kept when the value moved 2 or more, or the spacing, 60 ticks (1/32 of a beat), has passed since the last kept one. When the block is full, points 2, 4, 6 and so on go, each adding its ticks to the point after it, and the spacing doubles. Channel pressure reaches every held recorded note |
| S16 | Holding curves          | `Store::children` of a leaf gives its notes' curve blocks, and of a `CURVE` block nothing. `hold_new` and `release` then hold and free curves with the leaves that point at them. `Store::give_back` returns a block nobody holds: a dropped take's curve                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| S17 | Off-grid cells          | Answer 4. `Mark` gains `late`: true when no note of the cell starts on its sixteenth's first tick. A late cell's block starts 4 px right of the cell's left line instead of 2, and its tail moves with it. `step-playing.png`'s left-shifted note is older than answer 4                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S18 | The NOTE strip          | VELOCITY and LENGTH stop each note within a range that reaches its own value, `(old + by).clamp(low.min(old), high.max(old))`. A recorded note longer than a bar or shorter than 30 ticks then never moves against the turn; today's clamp would cut a 2-bar note to 1 bar on a turn up                                                                                                                                                                                                                                                                                                                                                                                                                    |
| S19 | Old pictures and sounds | The Timing page and the timing strip gain Quantize and the Playing page gains Count-in, so their frames change. No old scene arms REC, so no audio fingerprint changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Overview open points this plan settles

Task 1 writes these into the specs they belong to and takes them out of the overview's "Open points
for planning": "REC during the count-in" (answer 2) and "Blink speed of the fast blinks" (answer 3).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Code under the
  `harness` feature and `cfg(test)` may use `std`.
- 48 kHz; the core's own 32-sample chunks. Time: 1,920 ticks a beat, 480 a sixteenth, 7,680 a whole
  note; the sample of a tick is `anchor + (tick − run tick) × 150,000 / tempo` rounded down, and
  recording goes the other way with `first_tick_after`. At 120 BPM a tick is 12.5 samples and a
  sixteenth 6,000.
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds. This plan adds
  about 6 KB: a take on each of `Notes`' 140 entries. If the device outgrows the budget, report the
  size and stop: the budget is the owner's.
- Note memory rules as before: the audio part never waits and never writes note memory; a block is
  taken only while `step`'s room rules hold (`RESERVE`); removals may use the reserve.
- An event publishes each track at most once (`MAX_VERSIONS_PER_EVENT` stays 4).
- Look's rules as before (13 px rows, the cursor 1 px outside, mixed case, "…" for what does not
  fit). Colours are the palette's named entries.

## Review Focus

The five cases the specs imply but the rules above do not test, most likely first. Each has its test
in the task named.

1. **A pad held while REC turns Off, STOP comes or SHIFT + PLAY jumps**: the note ends there, and
   its release later adds nothing and leaves the earlier note as it was (Task 6,
   `rec_off_stop_and_a_jump_end_the_held_notes_there`).
2. **A held note whose sound POOL deletes before the release**: no note goes in, no count changes,
   nothing panics, and its curve block comes back (Tasks 6 and 8,
   `a_held_note_whose_sound_is_deleted_is_dropped`, `a_dropped_note_gives_its_curve_back`).
3. **A length change between the hit and the release** that leaves the note's bar past the end: the
   note is dropped, not inserted where the sequencer skips it and the count would be wrong (Task 6,
   `a_held_note_past_a_new_shorter_length_is_dropped`).
4. **The NOTE strip on recorded notes outside its ranges** (a 2-bar note, a 10-tick tap): a turn
   never moves a note against its direction (Task 6,
   `the_note_strip_never_moves_a_note_against_the_turn`).
5. **Pressure with nothing to receive it** (no note on, a note not recorded, after STOP) and a curve
   that fills its block: nothing panics, the full curve keeps its first and last points with every
   tick accounted for (Task 8, `pressure_without_a_recorded_note_does_nothing`,
   `a_full_curve_drops_every_second_point_and_doubles_the_spacing`).

## Not in this plan

- A recording pass as one undo action and UNDO LOST: plan 3.
- A pad under CANCEL or COPY that only points and is not recorded: plan 4, with those buttons.
- Recording across a pattern switch: Milestone 5. The take already keeps its pattern.
- Playing pressure: it waits for modulation (Workflow A). Editing it is not in version 1.
- The device's own output delay: part 3, with the hardware.
- A grid other than 1/16, swing, note repeat: later (Workflow B, "Scope").

## Shared formats

### Values (`src/param/mod.rs`, `src/project/mod.rs`)

- `pub const COUNT_IN: Entry`: ID 5, "Count-in", `Scope::Device`, 0 to 1, default 1, `Curve::List`,
  choices `choice(0, "Off")`, `choice(1, "1 bar")`, click 0, glide 0, not modulated. On `ENTRIES`
  after METRONOME_LEVEL.
- `pub const QUANTIZE: Entry`: ID 102, "Quantize", `Scope::Project`, `Curve::Switch`, default 1. On
  `ENTRIES` after MASTER_LEVEL.
- `Project::quantize: bool`, true in `Project::new`.

### Messages and the sequencer (`src/message.rs`, `src/sequencer.rs`)

- `MessageKind::Play { run: Run, count_in: bool }`.
- `Event::Beat { first: bool, count_in: bool }`.
- `Sequencer::play(&mut self, run: Run, count_in: bool, notes: &NoteReader<'_>)`: the latest meter
  takes over as `Meter { tick: run.tick + (one bar if count_in), bar: run.tick / bar_ticks, .. }`;
  without `count_in` that is today's behaviour. With it, the beats start at `run.tick` and the
  tracks at the meter's tick.
- `pub fn counting_in(&self, sample: u64) -> bool`: playing, and the tick at `sample` is before the
  meter in force's tick.
- `pub fn at(&self, sample: u64) -> Option<(u16, u32)>`: as today, and during the count-in the
  pattern's start, `(meter.bar, 0)` (answer 2: the music stands on the start bar).
- `pub fn tick_at(&self, sample: u64) -> u64`: playing, the last tick whose sample is `sample` or
  earlier, a waiting run counted; the run's tick for a sample before its anchor.
- `pub fn sample_at(&self, tick: u64) -> u64`: playing, the sample of `tick`, a waiting run counted.
- `pub fn snap(&self, tick: u64) -> u64`: the nearest multiple of 480 ticks from the tick of the
  meter that holds `tick`, or from the meter in force's for a tick in the count-in; the later one at
  exactly half.
- `pub fn place(&self, tick: u64) -> Option<(u16, u32)>`: the bar and place of `tick` in the
  pattern, counting waiting meters; `None` before the pattern's start.
- `pub fn beat_on(&self, sample: u64) -> bool`: playing and advanced to `sample`, whether it lies in
  the first half of the beat it is in, the count-in's beats included.
- `next_bar_line(&self, sample: u64) -> (u64, u16)` now returns the bar that starts at the line,
  which may equal the pattern's bars (the caller wraps it, as `reshape` does today with
  `ended + 1`). During the count-in it is the pattern's start and its bar.

### Recording in the control part (`src/control/record.rs`, new; `src/control/notes.rs`)

- `pub(super) enum Rec { Off, Armed(Run), On }`: `Armed`'s run anchors the stopped blink (S7).
- `Control` gains `rec: Rec`, `full: bool` (the pass stores nothing more, S14) and
  `output_delay: u64`.
- `pub struct Take { pub pattern: u8, pub sound: SoundNumber, pub velocity: u8, pub tick: u64, pub bar: u16, pub place: u16, pub due: u64, pub curve: Option<Curve> }`:
  `tick` the hit's run tick less the delay, `bar` and `place` its start (S10), `due` the sample of
  the start in its pass (S12).
- `notes::Note` gains `pub take: Option<Take>`. `Notes::start(source, track, pad, pitch, take)`
  takes it; `Notes::end(source) -> Option<Note>` gives the whole note;
  `Notes::take_mut(source) -> Option<&mut Take>`;
  `Notes::taken(&mut self) -> impl Iterator<Item = &mut Note>` gives every note on with a take.
- `Control` methods (all `pub(super)` in `record.rs`): `press_rec(sample, versions, store)` (S3);
  `count_in_over(sample)` (S5); `take(sound, velocity, sample) -> Option<Take>` (S9, S10, S14);
  `keep(note: notes::Note, sample, versions, store)` for one release;
  `end_takes(sample, versions, store)` for REC Off, STOP and a jump, publishing each track once;
  `pressure(source: Option<Source>, value, sample, store)` for one source or, with `None`, every
  held take (S15).
- `Control::end`, `Control::stop` and `Control::play` gain `versions` and `store`.

### Pressure curves (`src/store/curve.rs`, new; `src/store/mod.rs`)

- `pub const CURVE: u8 = 255`; `pub const POINTS: usize = 169`.
- `pub struct Curve` (the block and its recording state: the last kept value, its tick since the
  hit, the spacing). `Curve::start(store: &mut Store<'_>, ticks: u64, value: u8) -> Option<Self>`
  (S15); `Curve::point(&mut self, store: &mut Store<'_>, ticks: u64, value: u8)` with `ticks` since
  the hit; `Curve::block(&self) -> Block`.
- `pub fn points(block: &[u8; BLOCK]) -> impl Iterator<Item = (u16, u8)> + '_`.
- `Store::give_back(&mut self, b: Block)`: panics when someone holds `b`.

### Inputs (`src/input.rs`, the drift crate's `scene.rs`, the shell's `protocol.ts` and `session.ts`)

- `Input::OutputDelay { samples: u16 }`: kind 11, `a` the samples, `b` ignored; scene line
  `input <sample> output-delay <samples>`; `ShellInput` `{kind: 'output-delay'; samples: number}`.

### Drawing (`src/ui/frame.rs`, `src/ui/layout.rs`, `src/ui/step.rs`)

- `draw_header(canvas, left, right, record: Option<Color>, metronome: bool, mute: &str)`;
  `RECORD_WIDTH: i32 = 7` beside `METRONOME_WIDTH`.
- `Mark { velocity, count, tail, late: bool }`.

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `param/mod.rs`, `project/mod.rs`, `control/pages.rs`: modify (Task 2).
- `input.rs`: modify (Task 3).
- `message.rs`, `sequencer.rs`, `audio/mod.rs`, `control/bars.rs`: modify (Task 4).
- `control/record.rs`: create (Task 5); `control/mod.rs`, `control/transport.rs`, `control/draw.rs`,
  `ui/frame.rs`, `ui/layout.rs`: modify (Tasks 4 to 6).
- `control/notes.rs`, `control/held.rs`: modify (Task 6).
- `ui/step.rs`: modify (Task 7).
- `store/curve.rs`: create; `store/mod.rs`: modify (Task 8).
- Tests: `control/tests/record.rs`: create (Task 5); `control/tests.rs` (`mod record`),
  `control/tests/timing.rs`, `control/tests/pattern.rs` and every other test that builds a `Play` or
  calls `draw_header`: modify.

**`packages/groovebox-core/crates/groovebox-drift/src/scene.rs`:** modify (Task 3).

**`packages/groovebox-core/scenes/`:** create `record.scene` and `record-loose.scene`; re-bless all
(Task 9).

**`apps/groovebox/`:** `source/shell/protocol.ts`, `source/shell/session.ts`,
`source/shell/shell.ts`, `tests/protocol.test.ts`, `tests/session.test.ts`,
`tests/shell.browser.test.ts` (Task 3); `source/gallery/states.ts`, `tests/gallery.test.ts` (Task
9).

**Repo root:** `.changeset/groovebox-recording.md`: create (Task 9). The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-02-groovebox-foundation-design.md`, `2026-11-05-groovebox-workflow-b-design.md`,
  `2026-11-06-groovebox-project-model-design.md`, `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Overview:** "Milestone 4 is planned in four plans (decided)" under "How part 1 is designed"
  (answer 1). "Open points for planning" as listed above.
- **Foundation:** "Live playing": the output delay is an input of its own, sent whenever it changes;
  the browser shell reads it from the audio context; the device's comes with part 3 (S8).
- **Workflow B:** "Count-in": answer 2 and S4. "REC": S3 (under MENU or PAGE; SHIFT + REC still
  free). "Recorded notes": S9 to S14 (a hit from before REC is not recorded; the later position at
  exactly half; at least 1 tick; REC Off, STOP and a jump end held notes; the dropped cases; Full
  for the rest of the pass). "Cells": "drawn slightly off-centre" becomes answer 4. "The NOTE
  strip": S18.
- **Project model:** "Recording": S12's moment and S13. "Pressure curves": S15's block, S16.
- **Look:** "The header": S6. "The lights": answer 3 and S7. "STEP", "Notes": answer 4 and S17, and
  that `step-playing.png`'s left-shifted note is older. "SETTINGS" and "PATTERN": S2.

- [ ] **Step 1: Edit the five specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the groovebox recording decisions in the specs"`

---

### Task 2: Quantize and Count-in

**Files:**

- Modify: `src/param/mod.rs` (the two entries), `src/project/mod.rs` (`quantize`),
  `src/control/mod.rs` (`value_of`, `set_on`), `src/control/pages.rs` (`TIMING`, the Playing page),
  `src/control/tests/timing.rs` (its `timing` helper and strips gain Quantize), the SETTINGS tests
  that draw the Playing page.

**Interfaces:**

- **Produces:** `COUNT_IN`, `QUANTIZE`, `Project::quantize` (Shared formats).

- [ ] **Step 1: Write the failing tests**

```rust
// param/mod.rs
#[test] fn quantize_and_count_in_are_on_the_list() {
    // QUANTIZE: ID 102, Project, a switch, default 1; COUNT_IN: ID 5, Device, a list, default 1;
    // text(&COUNT_IN, 0) is "Off" and text(&COUNT_IN, 1) "1 bar"; `check(ENTRIES)` passes
}

// control/tests/timing.rs
#[test] fn the_timing_page_holds_quantize_on_encoder_4() {
    // MENU + 9: items Tempo, Grid, Quantize "On"; the strip's cells 1, 2 and 4 hold them, cell 3
    // empty; encoder 4 turned -1: sent [SetParam { Project, QUANTIZE.id, 0 }], project.quantize
    // false; the cursor on Quantize and OK: back to On
}
#[test] fn holding_tempo_shows_quantize_in_the_fourth_cell() {
    // TEMPO held on STEP: the strip is Tempo, Grid, an empty cell, Quantize (`timing-strip.png`)
}

// control/tests/sound.rs or wherever SETTINGS is tested
#[test] fn the_playing_page_holds_count_in_on_encoder_4() {
    // MENU + 8: Velocity, Metronome, Metronome level, Count-in "1 bar"; encoder 4 turned -1: "Off"
    // and SetParam { Device, COUNT_IN.id, 0 }; OK on it changes nothing
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- quantize count_in` from `packages/groovebox-core`.
  Expected: FAIL to compile (no `QUANTIZE`, `COUNT_IN`).

- [ ] **Step 3: Implement S1 and S2**
- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS once the tests that draw the Timing
  page, the timing strip or the Playing page show the new item; no other test changes.

- [ ] **Step 5: Commit**

  `git commit -m "Add Quantize to the groovebox Timing page and Count-in to its settings"`

---

### Task 3: The output delay

**Files:**

- Modify: `src/input.rs` (kind 11), `src/control/mod.rs` (`output_delay` kept from the input),
  `crates/groovebox-drift/src/scene.rs` (the scene word), `apps/groovebox/source/shell/protocol.ts`,
  `session.ts`, `shell.ts` (S8), their tests.

**Interfaces:**

- **Produces:** `Input::OutputDelay`, `Control::output_delay` (read by Task 6).

- [ ] **Step 1: Probe the browser**

  In Chromium (the dev server's page after "Click to start", in the devtools console), read
  `baseLatency` and `outputLatency` of the shell's audio context. Expected: both numbers, and
  `outputLatency` above 0 with sound going to a device. Note the two values in the task's report. If
  `outputLatency` is missing or stays 0, stop and report: S8 then needs the owner.

- [ ] **Step 2: Write the failing tests**

```rust
// input.rs
#[test] fn the_output_delay_round_trips_on_the_wire() {
    // from_wire(11, 1_200, 0) == Some(OutputDelay { samples: 1_200 }) and back; 65_536 is None
}
// groovebox-drift scene.rs
#[test] fn a_scene_reads_the_output_delay() { /* "input 64 output-delay 1200" */ }
// control/tests.rs
#[test] fn the_control_part_keeps_the_latest_output_delay() {
    // OutputDelay 1_200 at 0 then 900 at 10: output_delay 900, nothing sent; a PADS/KEYS press
    // before it and its release after still tap; a message showing stays
}
#[test] fn the_output_delay_is_kept_while_the_library_loads() {
    // an OutputDelay queued before start-up ends is kept, as the volume and a drop are: the shell
    // sends it once audio runs, which can be before the project opens
}
```

```ts
// tests/protocol.test.ts: coreArguments({kind: 'output-delay', samples: 1200}) is [11, 1200, 0]
// tests/session.test.ts: the line "output-delay 1200" among "every input kind writes its scene line"
// tests/shell.browser.test.ts: after the click that starts audio, a saved session holds one
// "output-delay" input line
```

- [ ] **Step 3: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- output_delay` and
  `cargo test -p groovebox-drift --lib -- output_delay`, then from `apps/groovebox`
  `npx vitest run tests/protocol.test.ts tests/session.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement S8**

  The output delay is no control: it clears no message, uses no held button and joins the volume and
  a drop among the inputs `step` takes before the project opens. The shell keeps the last value it
  sent and compares on each frame of its `present` loop once `context` exists, so a changed output
  (headphones plugged in) is sent again.

- [ ] **Step 5: Run them to verify they pass**

  Run the commands of Step 3, `npx vitest run --project browser tests/shell.browser.test.ts`,
  `npm run typecheck` and `npx eslint source/shell tests`. Expected: PASS.

- [ ] **Step 6: Commit**

  `git commit -m "Send the browser's output delay to the groovebox core as an input"`

---

### Task 4: The count-in and the ticks of the run

**Files:**

- Modify: `src/message.rs` (`Play`), `src/sequencer.rs` (Shared formats), `src/audio/mod.rs`
  (`Play`, the count-in's clicks), `src/control/transport.rs` and `src/control/bars.rs` (the new
  `play` and `next_bar_line`, `count_in: false` for now), the tests that build `Play` or call
  `next_bar_line`.

**Interfaces:**

- **Consumes:** nothing new.
- **Produces:** every sequencer function under "Messages and the sequencer"; the audio part clicking
  `Beat { count_in: true }`.

- [ ] **Step 1: Write the failing tests**

```rust
// sequencer.rs (120 BPM, 4/4, a run anchored at 0)
#[test] fn a_count_in_clicks_one_bar_before_the_pattern_starts() {
    // play(run, true): Beats with count_in at 0, 24_000, 48_000 and 72_000, `first` only at 0; a
    // note at bar 1's start starts at 96_000, with Beat { first: true, count_in: false } before it
}
#[test] fn no_note_starts_during_the_count_in() {
    // notes at every sixteenth of a 1-bar pattern: none starts before 96_000
}
#[test] fn the_music_stands_at_the_start_during_the_count_in() {
    // at(50_000) == Some((0, 0)); a run from bar 3 (tick 2 × 7_680) with count_in: at(50_000) ==
    // Some((2, 0)); counting_in(95_999) true, counting_in(96_000) false
}
#[test] fn a_tempo_turn_during_the_count_in_moves_the_first_beat() {
    // retime(retimed(48_000, 6_000)): the run goes on from tick 3_841 at 48_012, so the pattern
    // starts at 143_987
}
#[test] fn a_change_during_the_count_in_takes_hold_at_the_start() {
    // next_bar_line(10_000) == (7_680, 0); from bar 3: (3 × 7_680, 2)
}
#[test] fn next_bar_line_names_the_bar_that_starts_there() {
    // a 4-bar pattern playing bar 2: (2 × 7_680, 2); in the last bar: (4 × 7_680, 4), wrapped by
    // the caller
}
#[test] fn ticks_and_samples_of_the_run() {
    // tick_at(5_900) == 472, tick_at(6_000) == 480; a sample before the anchor gives run.tick;
    // sample_at(480) == 6_000; after a waiting run takes over, both use it
}
#[test] fn snap_goes_to_the_nearest_sixteenth_and_the_later_one_at_half() {
    // snap(239) == 0, snap(240) == 480, snap(7_600) == 7_680; after a 7/8 meter takes over at
    // tick 7_680, snap(7_680 + 250) == 7_680 + 480; in the count-in from bar 3, snap counts from
    // the start line
}
#[test] fn place_counts_on_across_passes() {
    // 1-bar pattern: place(7_680) == Some((0, 0)), place(8_160) == Some((0, 480)); in the
    // count-in place(100) == None
}
#[test] fn beat_on_is_the_first_half_of_each_beat() {
    // advanced to each sample: true at 0 and 11_999, false at 12_000, true at 24_000; the same
    // during a count-in; a 7/8 bar's beats are eighths
}

// audio/mod.rs
#[test] fn the_count_in_clicks_with_the_metronome_off() {
    // METRONOME 0, Play { count_in: true }: the output holds a high click at 0 and clicks at
    // 24_000, 48_000 and 72_000, and nothing from 96_000 on
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- sequencer:: audio::`. Expected: FAIL to compile (no
  `count_in`).

- [ ] **Step 3: Implement**

  `play` takes the meter at its tick and sets the beat to `run.tick` with a count-in. In `advance` a
  beat before the meter in force's tick is a count-in beat, first when it is one bar before that
  tick. `locate` is never handed a tick before its meter's: `at`, `place`, `snap` and
  `next_bar_line` treat count-in ticks themselves. The audio part clicks a beat when
  `metronome || count_in`; the control part's player still sends its events nowhere.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, with the earlier tests changed only
  where they build `Play` (`count_in: false`) or read `next_bar_line`.

- [ ] **Step 5: Commit**

  `git commit -m "Give the groovebox sequencer a count-in bar and the ticks of its run"`

---

### Task 5: REC and the count-in on the panel

**Files:**

- Create: `src/control/record.rs`, `src/control/tests/record.rs`.
- Modify: `src/control/mod.rs` (`rec`, `full`, `press` for REC, `count_in_over` in `step`, the REC
  light, `set_on` re-anchoring an armed run on a tempo turn), `src/control/transport.rs` (`play`
  with a count-in, nothing during it; `stop` turning REC Off), `src/control/draw.rs` and
  `src/ui/frame.rs`, `src/ui/layout.rs` (the dot), every caller of `draw_header`.

**Interfaces:**

- **Consumes:** `COUNT_IN` (Task 2); `Play { count_in }`, `counting_in`, `beat_on` (Task 4).
- **Produces:** `Rec`, `press_rec`, `count_in_over`, the new `draw_header`. `press_rec`, `play` and
  `stop` take `versions` and `store` from here on; Task 6 makes them end takes.

- [ ] **Step 1: Write the failing tests**

```rust
// ui/frame.rs
#[test] fn the_record_dot_sits_between_the_tempo_and_the_metronome() {
    // draw_header(.., Some(RECORD), true, "Mute 3"): the dot's seven rows in RECORD, 3, 5, 7, 7,
    // 7, 5 and 3 px wide and centred, from HEADER_ROW + 3, its right column PIECE_GAP left of the
    // icon; the tempo's last column PIECE_GAP left of the dot; Some(DIM) draws it dim
}

// control/tests/record.rs (120 BPM, 4/4)
#[test] fn rec_while_stopped_arms_and_again_disarms() {
    // tap REC at 0: the header's dot dim; REC lit at 0 and 11_999, dark at 12_000, lit at 24_000;
    // nothing sent; tap REC at 30_000: no dot, REC dark
}
#[test] fn an_armed_blink_follows_a_tempo_turn() {
    // armed at 0, TEMPO to 60 BPM at 30_000: lit at 41_000, dark at 43_000 (S7's re-anchoring)
}
#[test] fn play_after_arming_counts_in_then_records() {
    // COUNT-IN 1 bar, REC at 0, PLAY at 1_000: sent Play { anchor 1_000, tick 0, count_in: true };
    // at 96_999 the dot is dim and REC blinks with the clicks; at 97_001 the dot is red and REC
    // lit steadily (S5)
}
#[test] fn during_the_count_in_the_panel_stands_on_the_start_bar() {
    // answer 2: PLAY lit; the frames at 10_000 and 90_000 are the same; header "1/1 ▶1"; the
    // music's line at the start bar's first cell; step 1 flipped; with the cursor in bar 3 of 4
    // and PLAY, the view and the steps show bar 1
}
#[test] fn with_count_in_off_play_after_arming_records_at_once() {
    // COUNT-IN Off: Play { count_in: false } and the dot red from the press
}
#[test] fn shift_play_after_arming_counts_in_from_the_cursors_bar() {
    // cursor in bar 2 of 2: Play { tick 7_680, count_in: true }
}
#[test] fn rec_during_the_count_in_drops_recording_and_again_puts_it_back() {
    // REC at 30_000: no dot, REC dark, no message sent; at 97_000 playing, not recording; again
    // with REC at 30_000 and at 50_000: armed, and recording from 97_000
}
#[test] fn play_and_shift_play_during_the_count_in_do_nothing() {
    // sent nothing; following as it was
}
#[test] fn stop_during_the_count_in_ends_it_and_disarms() {
    // sent [Stop]; REC dark; no dot
}
#[test] fn rec_while_playing_drops_in_and_out() {
    // PLAY at 0 without arming, REC at 10_000: red dot, REC lit; REC at 20_000: no dot; nothing
    // sent for REC; the music plays on
}
#[test] fn stop_ends_recording_and_disarms() {
    // recording, STOP: sent [Stop], REC Off; armed and stopped, STOP: sent [Silence], REC Off
}
#[test] fn rec_acts_everywhere_and_shift_rec_does_nothing() {
    // under MENU, with the sound picker open and with POOL's DELETE question REC arms and
    // disarms; SHIFT + REC changes nothing
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- record`. Expected: FAIL to compile.

- [ ] **Step 3: Implement S3 to S7**

  REC goes in `press` beside PLAY and STOP, also under MENU or PAGE and with a picker or a question
  open; SHIFT + REC joins the SHIFT arm that takes OK, STOP and the pushes.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, the earlier tests changed only where
  they call `draw_header`.

- [ ] **Step 5: Commit**

  `git commit -m "Arm, count in and drop in and out of groovebox recording with REC"`

---

### Task 6: Recorded notes

**Files:**

- Modify: `src/control/record.rs` (`take`, `keep`, `end_takes`), `src/control/notes.rs` (the take),
  `src/control/mod.rs` (`hit` makes the take, `end` keeps it, `input` passes `OutputDelay` and the
  stores), `src/control/transport.rs` (STOP and a jump end the takes), `src/control/held.rs` (S18),
  `src/control/tests/record.rs`.

**Interfaces:**

- **Consumes:** `QUANTIZE` (Task 2), `output_delay` (Task 3), `tick_at`, `sample_at`, `snap`,
  `place` (Task 4), `Rec` and `press_rec` (Task 5).
- **Produces:** `Take` with `curve` always `None` until Task 8; `Notes::take_mut` and `taken` for
  Task 8.

- [ ] **Step 1: Write the failing tests**

  On T4, which the factory project leaves empty, with a synth on pad 1 (`synth_on(0)`, C4), 120 BPM,
  4/4, 1 bar unless said, REC and PLAY at 0 with COUNT-IN Off.

```rust
#[test] fn a_hit_goes_in_at_its_release_snapped_to_the_nearest_sixteenth() {
    // hit at 5_900 with velocity 100, release at 9_000: no version before the release; then one,
    // and T4 holds [Note { bar 0, place 480, length 248, pitch 60, velocity 100, curve None }];
    // the sound's count 1
}
#[test] fn the_output_delay_moves_the_snap() {
    // hit at 9_100: place 960; with OutputDelay 1_200 first: place 480
}
#[test] fn quantize_off_keeps_the_hit_where_it_was_played_less_the_delay() {
    // QUANTIZE Off, OutputDelay 1_200, hit at 7_100, release at 9_000: place 472, length 248
}
#[test] fn a_hit_just_before_the_loop_restarts_lands_on_bar_1() {
    // hit at 95_000, release at 97_000: bar 0, place 0; the version's moment is 96_001 or later
}
#[test] fn a_note_snapped_forward_is_not_played_again_in_its_pass() {
    // hit at 3_100, release at 3_200: the version's moment is 6_001
}
#[test] fn a_note_held_over_the_loop_point_keeps_its_length_up_to_the_patterns() {
    // 2 bars: hit at 144_000, release at 240_000: bar 1, length 7_680, over the loop; 1 bar: hit
    // at 0, release at 200_000: length 7_680
}
#[test] fn the_same_sound_pitch_and_start_replaces_the_old_note() {
    // hits at 6_000 (velocity 100) and 102_000 (velocity 50): one note, velocity 50; count 1
}
#[test] fn overdub_keeps_what_is_there() {
    // a step-entered note at step 1, then a hit at step 5: both
}
#[test] fn keys_mode_and_midi_record_the_selected_sound_at_their_pitch() {
    // KEYS: pad 5 records pitch 64; MIDI note 67 records 67; PADS: MIDI note 60 records pad 1's
    // sound at C4
}
#[test] fn velocity_off_records_127() {}
#[test] fn a_hit_from_before_rec_is_not_recorded_even_held_into_it() {
    // playing, hit at 1_000, REC at 2_000, release at 9_000: nothing
}
#[test] fn hits_during_the_count_in_are_not_recorded_but_an_early_first_hit_is() {
    // COUNT-IN 1 bar, REC, PLAY at 0: hit at 50_000 sounds and records nothing; hit at 95_000
    // records bar 0 place 0; with QUANTIZE Off the hit at 95_000 records nothing; a hit at 50_000
    // held while STOP ends the count-in records nothing
}
#[test] fn rec_off_stop_and_a_jump_end_the_held_notes_there() {
    // Review Focus 1: hit at 10_000; REC at 20_000: a note of length 800 at once; release at
    // 30_000 changes nothing. The same with STOP and with SHIFT + PLAY at 20_000
}
#[test] fn held_notes_on_two_tracks_end_with_one_version_each() {
    // hits on T1 and T4 held, three pads on T4; STOP: two versions
}
#[test] fn a_held_note_keeps_its_track_when_t1_to_t4_switch() {
    // a hit on T4, T3 while held, release: the note on T4; the next hit goes to T3
}
#[test] fn under_a_held_step_a_hit_is_not_recorded_and_with_a_picker_open_it_is() {}
#[test] fn a_full_pass_stores_nothing_more_and_says_full() {
    // fill_until(RESERVE - 1), release: nothing in, "Full" in red; a press clears it; the next hit
    // still sounds (NoteOn sent), shows "Full" and its release stores nothing even with room made;
    // REC off and on: stored
}
#[test] fn a_held_note_whose_sound_is_deleted_is_dropped() {
    // Review Focus 2: pad 1 held, POOL's DELETE of its sound, release: no note, no panic
}
#[test] fn a_held_note_past_a_new_shorter_length_is_dropped() {
    // Review Focus 3: 4 bars, hit in bar 4, LENGTH 2 bars while held, its bar line passed,
    // release: no note, counts as they were
}
#[test] fn the_note_strip_never_moves_a_note_against_the_turn() {
    // Review Focus 4: put a 15_360-tick note at step 1 and a 10-tick one at step 2; step 1 held,
    // LENGTH +1: 15_360; -1: 14_880; step 2 held, LENGTH -1: 10; +1: 490
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- record`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement S9 to S14 and S18**

  `hit` asks `take` once it knows the sound, the pitch and the velocity it plays. `keep` and
  `end_takes` insert through `Store::insert`, count with `counted` when nothing was replaced, raise
  `moment` (S12) and publish with `edit`; `end_takes` gathers the takes track by track first.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Record what the groovebox's pads and keys play while REC is on"`

---

### Task 7: Loose notes on STEP

**Files:**

- Modify: `src/ui/step.rs` (`Mark::late`, the shift), `src/control/mod.rs` (the marks), their tests.

**Interfaces:**

- **Produces:** `Mark::late` (S17).

- [ ] **Step 1: Write the failing tests**

```rust
// ui/step.rs
#[test] fn a_late_cell_draws_its_note_2_px_right() {
    // Mark { late: true, tail: 4, .. }: the block from the cell's left line + 4, 5 px wide, its
    // tail from the block's right edge; late false: from + 2, as before
}

// control/tests/step_view.rs
#[test] fn a_cell_is_late_when_none_of_its_notes_starts_on_its_step() {
    // put notes at places 490 and 970 + 480: their cells late; one at 960 beside 970: not late
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- late`. Expected: FAIL to compile.

- [ ] **Step 3: Implement S17**
- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, no earlier test changed.

- [ ] **Step 5: Commit**

  `git commit -m "Draw groovebox notes that start after their step 2 px right"`

---

### Task 8: Pressure curves

**Files:**

- Create: `src/store/curve.rs`.
- Modify: `src/store/mod.rs` (`children`, `give_back`, `mod curve`), `src/control/record.rs`
  (`pressure`; `keep` puts the curve on the note, a dropped take gives it back),
  `src/control/mod.rs` (`input` sends PadPressure, NotePressure and ChannelPressure to `pressure`),
  `src/control/tests/record.rs`.

**Interfaces:**

- **Consumes:** `Take::curve`, `Notes::take_mut`, `taken` (Task 6).
- **Produces:** Shared formats' pressure curves.

- [ ] **Step 1: Write the failing tests**

```rust
// store/curve.rs
#[test] fn points_keep_what_says_something_new() {
    // start(ticks 5, 50); point(15, 51): dropped; point(25, 52): kept with 20 ticks; point(80,
    // 52): dropped; point(85, 52): kept (the spacing, 60, passed); points() == [(5, 50), (20,
    // 52), (60, 52)]
}
#[test] fn a_full_curve_drops_every_second_point_and_doubles_the_spacing() {
    // 169 points 60 ticks apart, then one more: 86 points, the first and the newest kept, the
    // ticks adding up to the newest's since the hit; the next kept point needs 120 ticks or a
    // move of 2
}
#[test] fn a_long_pause_holds_its_ticks_at_65_535() {}

// store/mod.rs
#[test] fn a_leaf_holds_its_notes_curves() {
    // a CURVE block c; insert a note with curve c, hold the tree: c held once; insert another note
    // and hold the new tree: c held twice; release both: c free
}
#[test] fn give_back_frees_a_block_nobody_holds() {}

// control/tests/record.rs
#[test] fn pressure_while_recording_goes_into_the_notes_curve() {
    // KEYS, MIDI note-on 60 at 6_000, NotePressure 60 → 40 at 6_250, 45 at 7_000, note-off at
    // 9_000: the note's curve holds [(20, 40), (60, 45)]
}
#[test] fn channel_pressure_reaches_every_held_recorded_note() {}
#[test] fn without_room_a_note_is_kept_without_its_curve() {
    // fill_until(RESERVE): the pressure takes no block; the release still stores the note, curve
    // None
}
#[test] fn a_dropped_note_gives_its_curve_back() {
    // Review Focus 2: a held note with a curve whose sound is deleted: ready() as before the hit
}
#[test] fn pressure_without_a_recorded_note_does_nothing() {
    // Review Focus 5: pressure with no note on, on a note played while not recording, and after
    // STOP ended its take: no block taken, nothing sent, no panic
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- store:: pressure curve`. Expected: FAIL to compile.

- [ ] **Step 3: Implement S15 and S16**

  A take's ticks for a point are `tick_at` of the input's sample less the delay, minus the take's
  `tick`, held at 0.

- [ ] **Step 4: Run every core test**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Keep the pressure played into each recorded groovebox note"`

---

### Task 9: The scenes, the gallery, the changeset and a look

**Files:**

- Create: `scenes/record.scene`, `scenes/record-loose.scene`, `.changeset/groovebox-recording.md`.
- Modify: every scene's fingerprints and frames (re-blessed),
  `apps/groovebox/source/gallery/states.ts`, `apps/groovebox/tests/gallery.test.ts`.

**What the scenes do** (Workflow B's drift scenes "a take played in with quantize on, and one with
it off", "overdub passes", "the metronome and the count-in", and Project model's "a hit just before
a grid line with quantize on"; through the panel only, each frame named in the scene's comments):

- `record.scene`: a synth on pad 1 of T4 as `metronome.scene` puts it; LENGTH 2 bars; REC (frame:
  STEP armed, the dim dot); PLAY: the count-in (frame halfway: standing on bar 1); a hit just before
  the first beat; a take over two passes, one hit just before the loop restarts and one held over
  the loop point (frame: recording, the red dot, beside `step-playing.png`); REC off and on again
  (drop out and in); a second pass whose hit replaces one; STOP with a pad held (frame: the notes
  after STOP).
- `record-loose.scene`: MENU + 9 and Quantize Off (frame: the Timing page with Quantize);
  `output-delay 1200`; KEYS and MIDI notes with `note-pressure` and `channel-pressure` lines (no
  sound depends on them); a take played around the steps (frame: STEP with late notes 2 px right);
  MENU + 8 (frame: the Playing page with Count-in).

- [ ] **Step 1: Write the two scenes**
- [ ] **Step 2: Build and re-bless**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift -- --test-threads=1`. Expected: PASS: every scene
  plays the same natively and in both `.wasm` builds. No earlier scene's `expect-audio` changes
  (S19); list the earlier frames that changed (Timing page, timing strip, Playing page) and stop and
  report any other.

- [ ] **Step 3: The gallery**

  `states.ts` gains "STEP armed", "STEP during the count-in", "STEP while recording"
  (`step-playing.png`), "STEP after a take", "PATTERN Timing with Quantize", "STEP with loose notes"
  and "SETTINGS Playing with Count-in"; changed frames keep their titles. `gallery.test.ts` lists
  `record` and `record-loose` among the scenes whose every frame has a state.

  Run, from `apps/groovebox`: `npx vitest run tests/gallery.test.ts`,
  `npx eslint source/gallery/states.ts tests/gallery.test.ts`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: The changeset**

```markdown
---
'groovebox': minor
'groovebox-core': minor
---

Added live recording to the groovebox: REC arms and drops in and out, a one-bar count-in, Quantize
on the Timing page and Count-in on the Playing page, with each note's velocity, length and pressure.
```

- [ ] **Step 5: Run clippy and commit**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: no warnings.

  `git commit -m "Add the groovebox recording scenes and re-bless the scenes"`

- [ ] **Step 6: The owner looks and listens**

  Ask the owner to open the gallery and the app: each new frame beside its approved picture; the
  count-in and REC's blink with the beat; a take with Quantize on and one with it off, played along
  with the metronome, landing where he played them (the output delay); overdub passes; a held note
  over the loop. Values and speeds are tuning: change what the owner chooses, re-bless as in Step 2
  and commit; nothing changed: no commit.
