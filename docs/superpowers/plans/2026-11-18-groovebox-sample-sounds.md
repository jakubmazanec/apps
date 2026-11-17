# Groovebox Sample Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 2 of 3 for Milestone 2 ("Samples and POOL"). Plan 1 (the library) and its follow-up are built.
Plan 3 builds POOL.

**Goal:** Pads play samples. NEW SAMPLE in the sound picker opens the sample picker, which lists the
library as SAMPLES does and previews each highlighted file; choosing one puts a sample sound on the
pad. The sample engine plays it with start, end, loop, reverse and root note, through the shared
chain. SOUND gains the Sample page with the waveform and its marks, the Pad page gains ENGINE, and
the Sample item changes a sound's file. Deleting a file that sounds use asks with a count, fades
their voices and leaves them MISSING until a file of that path comes back.

**Architecture:**

- **Values:** the sample engine's seven entries join the master list (IDs 3000 to 3006). Start, End,
  Loop start and Loop end are frames of the sound's file, a new curve whose range is the file's
  length; Root note is a counted note.
- **A sound's sample:** `Engine::Sample(Sample)`, where a sample is a library `FileId` while the
  library holds the file, or the file's path once it is gone (MISSING). The control part keeps it in
  step at the two places the library removes a file (a delete, a replace) and the one place it lists
  one (an import).
- **The audio part learns the file from each note:** `NoteOn` carries the file, its length and its
  channels. A voice reads that file until the note ends; the audio part keeps no sound-to-file map,
  so a replace or a file that comes back needs no message per sound. `ForgetSample` fades every
  voice reading the file.
- **The sample player** reads one chunk ahead, as the preview does, so a fade reads nothing: the
  audio part lets go of a file in the chunk its `ForgetSample` applies. Pitch by 4-point Hermite
  interpolation from a fixed-point position.
- **Screens:** the sample picker shares SAMPLES' rows, order, folder line, cursor rules and preview;
  ENGINE gets a two-row picker; the Sample page draws the waveform from peaks the control part reads
  once per file.

**Tech Stack:** as plan 1: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Sound](../specs/2026-11-03-groovebox-sound-design.md) is the main spec: "Engine architecture",
  "Sample player", "Shared voice chain" (trigger mode), "Voices", "Sample import" (root note and
  loops).
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "The PAD page" (ENGINE), "Making
  sounds", "Two ways to change what a pad plays", "Pickers", "The sample picker".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "The project and its
  parts" (a sound's file), "A missing sample", "Where things live and how they move" (the DELETE
  question), "Projects and the library in use" (deleting, replacing).
- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md): the pitch a pad plays in PADS
  mode ("the root note of a sample and C4 for a synth").
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header" (a missing sample in red),
  "Shared parts" (the pickers), "The other screens" (a sample page); the pictures `sound-pad.png`,
  `sound-sample.png`, `picker-sound.png`, `picker-sample.png`, `question.png`.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- The EP-133 research for this plan (Teenage Engineering's written guide only):
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\3e042e4c-ded6-4f3f-be8d-d5a923888859\scratchpad\ep133-sample-sounds.md`.

## Decisions for this plan

The owner answered the open points on 2026-11-18. Task 1 writes the answers and the settled points
into the specs.

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point                     | Answer                                                                                                                                                                                                                                                           |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One-shot and a sample     | One-shot plays a sample to its end. The volume envelope's sustain counts as zero only when a note would never end by itself: a synth, or a sample with Loop on. Lowering Sustain still lets Decay shorten a drum. The EP-133's one-shot "plays the whole sample" |
| 2   | Start, end and loop       | Each point is a frame of the sound's file, so a file's own loop stays exact. One click moves 1/128 of the file's length, SHIFT a sixteenth of that. Shown as a percent of the length with one decimal ("4.2%"), so every fine click shows                        |
| 3   | Points that would cross   | Each stops at the other: Start stops one frame before End and End one frame after Start; Loop start and Loop end stop at each other the same way. Only the part of a loop that lies between Start and End plays                                                  |
| 4   | NEW SAMPLE on a full pool | Refused at once: OK on New sample closes the picker and shows "Pool full" in red, as New synth does; the sample picker never opens                                                                                                                               |
| 5   | A file with its own loop  | A new sound of a file with its own loop starts with Loop on and Gate, so it loops while the pad is held and fades after letting go. A file without a loop gives Loop off and One-shot                                                                            |

### Settled by the specs, the pictures or the answers

| #   | Point                   | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Root note               | 0 to 127, MIDI's range, as a note's pitch is (Project model); one per click, SHIFT changes nothing (a count). Shown as a note name with C4 for 60 and sharps as "#": "C4", "C#4", "C−1" for 0 (the minus sign of signed values)                                                                                                                                                                                                                                                                                                                   |
| S2  | The pitch a pad plays   | In PADS mode a sample sound plays at its Root note, so it sounds as recorded; a synth stays at C4 (Workflow B). In KEYS mode the key's pitch; the sample is read `2^((pitch + Transpose + Fine tune / 100 − Root note) / 12)` times as fast                                                                                                                                                                                                                                                                                                       |
| S3  | Reverse                 | Plays from End back to Start; with Loop on the loop runs backwards between its points (my call: "played forward" in Sound means no back-and-forth loop). The waveform is not flipped                                                                                                                                                                                                                                                                                                                                                              |
| S4  | Where a note ends       | A sample that is not looping ends at End (at Start in reverse) in either trigger: the voice is free from then on. Gate: letting go releases, as for a synth                                                                                                                                                                                                                                                                                                                                                                                       |
| S5  | Mono and Legato         | Mono restarts the sample from Start with the new note's file; Legato keeps its place and its file and only the pitch moves (Sound: "the kind of start"; the EP-133's legato "carries on from the same play position")                                                                                                                                                                                                                                                                                                                             |
| S6  | Loudness                | The sample source is unscaled (a full-scale sample reads ±1), so a default sample sound at velocity 127 plays as loud as its preview (plan 1, S12)                                                                                                                                                                                                                                                                                                                                                                                                |
| S7  | A new sample sound      | Named after the file without ".wav", as Workflow A says: `next_name(pool, split(stem).0, false)`, so kick.wav gives "kick", the next "kick 2". Every default, then Start the first frame, End the last, Loop start and Loop end the file's loop or the whole file, Root note the file's, Loop and Trigger by answer 5                                                                                                                                                                                                                             |
| S8  | Changing a sound's file | Start, End, Loop start, Loop end and Root note come from the new file as in S7; every other value stays, Loop and Trigger too (Workflow A)                                                                                                                                                                                                                                                                                                                                                                                                        |
| S9  | ENGINE                  | Pad page item 3, encoder 3, value "Sample" or "Synth" (`sound-pad.png`). OK or its push opens a picker of two rows, "Sample" then "Synth", on the current one; turns, − and + do nothing. The current engine changes nothing. Synth: the synth's entries go to their defaults and the chain stays. Sample: the sample picker replaces it at once, and the switch happens only when a file is chosen, so CANCEL leaves a synth (Project model: no other way for a sound to lack its sample). Both engines allow every play mode, so the mode stays |
| S10 | One engine's settings   | Switching starts the new engine's entries at their defaults; the old engine's entries are never read again and are reset when that engine comes back                                                                                                                                                                                                                                                                                                                                                                                              |
| S11 | The Sample page         | "Sample" (header "Sound Sample", tile "2 Sample"): Sample (1), Start (2), End (3), Loop (4), Loop start, Loop end, Reverse, Root note (Sound; `sound-sample.png`). The Sample item shows the file's stored name with ".wav"; OK or its push opens the sample picker; turns, − and + do nothing, as on the Pad page's Sound and ENGINE                                                                                                                                                                                                             |
| S12 | The sample picker       | SAMPLES' rows, order, folder entering, ".." and CANCEL going up, cursor keeping and preview rules (Workflow A). A dim top line names the folder and the meter, "drums/ Library 41.2 of 64 MB", the folder losing its start to "…" when too wide; at the top level "Library 41.2 of 64 MB" (`picker-sample.png`). 15 rows under it at every level. CANCEL at the top level closes it without choosing. OK on a file chooses it and closes the picker                                                                                               |
| S13 | Where it opens          | From New sample and ENGINE: in the folder it was last in, on its first row; from the Sample item: in the folder of the sound's file, on the file, or as from New sample when the file is missing. Opening plays nothing. The folder is kept while the project is open (Project model: "the sample picker's folder"); a folder that is gone gives the top level                                                                                                                                                                                    |
| S14 | Files not loaded        | Listed in red with "not loaded" as on SAMPLES, never previewed, and can be chosen: the sound is then MISSING (Project model: files start-up could not load count as missing)                                                                                                                                                                                                                                                                                                                                                                      |
| S15 | MISSING                 | The sound's name in the header and its row in the sound picker in red (Look; `picker-sound.png`). It plays silence: its note takes a voice that sounds nothing and ends. Its Sample item shows the file's name; its waveform area shows only the middle line and the marks; turning Start, End, Loop start or Loop end does nothing until a file is chosen                                                                                                                                                                                        |
| S16 | A file that comes back  | A missing sound keeps its file's path. A file listed under that path, ignoring case, by an import makes it play again; a file replaced by a drop of its name keeps its sounds, which play the new audio (Project model)                                                                                                                                                                                                                                                                                                                           |
| S17 | The DELETE question     | "Delete clap.wav?", then "2 sounds use it" or "1 sound uses it" when sounds of the open project play the file, then "OK deletes, Cancel keeps" (Project model, in Look's mixed case)                                                                                                                                                                                                                                                                                                                                                              |
| S18 | Deleting a used file    | `ForgetSample` fades every voice reading the file within one chunk (Project model). Its sounds turn MISSING when the delete ends; a failed delete leaves them playing the file                                                                                                                                                                                                                                                                                                                                                                    |
| S19 | The waveform            | Per column of the picture, the highest absolute sample, of both channels, among up to 64 frames spread evenly over the column's share of the whole file (my call: bounded work per file); drawn as a vertical line in `NOTE_MID`, symmetric about a `FAINT` middle line, half its height 2 px less than half the area; Start and End as full-height `ACCENT` lines (the rig's `drawSoundSample`)                                                                                                                                                  |
| S20 | The sound picker        | "Empty", "New sample", "New synth", then the pool (`picker-sound.png`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S21 | Messages per event      | Up to 8: a new sample sound sends `NewSound` and up to seven values, and a switch to the synth up to eight. `MAX_MESSAGES_PER_EVENT` becomes 8                                                                                                                                                                                                                                                                                                                                                                                                    |
| S22 | Working memory          | Each sound can hold a path (255 bytes), about 270 KB for 1,024 sounds: the device grows from 1.61 MB to about 1.88 MB of the 2 MB working memory. Sample RAM (64 MB) is separate and unchanged                                                                                                                                                                                                                                                                                                                                                    |

### Overview open points this plan settles

Task 1 removes these from the overview's "Open points for planning" and writes each answer into the
spec it belongs to: "NEW SAMPLE on a full pool" (answer 4), "Sample start, end and loop points"
(answers 2 and 3), "Root note" (S1).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Float functions come
  from `libm`; no fused multiply-add; no logic depends on pointer size. Code under the `harness`
  feature and `cfg(test)` may use `std`.
- 48 kHz; the core's own 32-sample chunks; every message applies at the first chunk start at or
  after its sample; the output does not depend on the host's batch size.
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds. If the device
  outgrows it, report the size and stop: the budget is the owner's.
- The audio part never waits and only reads frames of files a `NoteOn` or a `Preview` named, below
  their lengths, and none of a file from the chunk its `ForgetSample` applies. The control part
  never sends a file it has asked the audio part to forget.
- Look's rules as before (monogram, 13 px rows, items 17 px, the cursor 1 px outside, mixed case,
  scrolling under the cursor and "…" elsewhere). Colours are the palette's named entries.
- Repo rules (as before): never hand-edit Carson "DO NOT EDIT" files; never remove comments; inline
  variables and functions used only once; no em-dashes and no Oxford commas in copy, docs or
  commits; commit messages in imperative sentence case without prefixes; never mention Claude,
  Claude Code or Anthropic; never use `git stash`; no new dependency.
- Run only the focused tests and checks a task names; CI runs the full suite.
  - Rust: from `packages/groovebox-core`, `cargo test -p <crate> ...` and
    `cargo clippy --workspace --all-targets -- --deny warnings`.
  - Drift tests need both `.wasm` builds first: `node build.js && node build.js --fallback`.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **A file read after it was let go.** A hit while the file's delete or replace runs, a Mono return
   to a held key after `ForgetSample`, and a steal in the chunk a `ForgetSample` applies must read
   nothing of the file. Pinned in Task 4
   (`a_forgotten_file_is_not_read_from_the_chunk_its_forget_applies`,
   `a_mono_return_to_a_forgotten_key_plays_silence`) and Task 7
   (`a_hit_during_a_delete_sends_no_file`).
2. **Reads outside the file.** Values that belong to another file (the sample changed while a note
   rings), End on the last frame, Hermite's neighbours at the first and last frame, reverse at frame
   0 and a loop ending on the last frame must stay inside the file. Pinned in Task 3
   (`reads_stay_inside_the_file_whatever_the_values`).
3. **A reused `FileId`.** A file deleted and a new file listed under its old place must not revive
   its sounds: only a file of the same path does. Pinned in Task 7
   (`a_new_file_in_a_deleted_files_place_does_not_revive_its_sounds`); the waveform is keyed by
   fingerprint for the same reason (Task 6).
4. **Tiny files.** Files of one and two frames: Start and End cannot cross, the percent never
   divides by zero and a note ends. Pinned in Task 2
   (`a_one_frame_file_reads_0_percent_and_never_moves`) and Task 3
   (`a_two_frame_file_plays_and_ends`).
5. **Eight messages in one event.** An event that sends eight messages with the queue nearly full
   must wait for room, not panic. Pinned in Task 5
   (`a_new_sample_sound_waits_for_room_for_its_messages`).

## Not in this plan

- **Plan 3:** POOL and REMOVE UNUSED, MISSING with the file's name on POOL, a sound selected on POOL
  (the Pad page with ENGINE only).
- **Milestone 3:** STOP and silencing the preview with STOP while stopped; the MISSING mark on
  STEP's lane; the master level.
- **Milestone 5:** saving a sound's file path and fingerprint, "2 samples missing" on opening a
  project, a saved sample picker folder.

## Shared formats

### The master list grows

Engine block 3000 (Foundation: one block of 1,000 per engine from 2000).

| ID   | Name       | Scope | Curve  | Unit    | Range           | Default | Glide |
| ---- | ---------- | ----- | ------ | ------- | --------------- | ------- | ----- |
| 3000 | Start      | Sound | Frame  | Percent | 0 to `i32::MAX` | 0       | 0     |
| 3001 | End        | Sound | Frame  | Percent | 0 to `i32::MAX` | 0       | 0     |
| 3002 | Loop       | Sound | Switch | None    | Off, On         | Off     | 0     |
| 3003 | Loop start | Sound | Frame  | Percent | 0 to `i32::MAX` | 0       | 0     |
| 3004 | Loop end   | Sound | Frame  | Percent | 0 to `i32::MAX` | 0       | 0     |
| 3005 | Reverse    | Sound | Switch | None    | Off, On         | Off     | 0     |
| 3006 | Root note  | Sound | Count  | Note    | 0 to 127        | 60      | 0     |

`Curve::Frame` has click 0 and is not modulated; `check` gains "a frame entry runs from 0 to
`i32::MAX`". The control part holds a frame value within its file and moves it with
`param::moved_frame`; `param::moved` and `param::format` never see one. A sound has 40 values.

### Messages

```rust
/// A library file the audio part may read: its place, its length in frames and its channels.
pub struct SampleFile { pub file: FileId, pub frames: u32, pub stereo: bool }

/// What a note's engine plays: the synth, or a sample sound's file; none for a missing one.
pub enum NoteEngine { Synth, Sample(Option<SampleFile>) }

MessageKind::NoteOn { note, track, sound, pitch, velocity, engine: NoteEngine }
MessageKind::Preview { sample: SampleFile }   // was { file, frames, stereo }
pub const MAX_MESSAGES_PER_EVENT: usize = 8;  // Task 5 (S21)
```

### A sound's sample

```rust
pub enum Sample { File(FileId), Missing(Path) }
pub enum Engine { Synth, Sample(Sample) }       // page_name: "Synth", "Sample"
```

### The pages

| Page         | Items, encoder in brackets                                                         | Picture  |
| ------------ | ---------------------------------------------------------------------------------- | -------- |
| Pad          | Sound (1), Copy (2), Engine (3)                                                    | pads     |
| Sample       | Sample (1), Start (2), End (3), Loop (4), Loop start, Loop end, Reverse, Root note | waveform |
| Synth and on | unchanged                                                                          |          |

SOUND's pages are Pad, the engine's page (Sample or Synth), Filter, Filter envelope, Volume envelope
and Voice. An empty pad keeps the Pad page with Sound only.

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `param/mod.rs`: modify (`Curve::Frame`, `Unit::Note`, `moved_frame`, `format_frame`, note names).
  `param/sample.rs`: create (the seven entries).
- `project/pool.rs`: modify (`Engine`, `Sample`, `Sound::take_file`, `start_sample`, `start_synth`,
  `Pool::new_sample`).
- `message.rs`: modify. `audio/sample.rs`: create (the sample player). `audio/voice.rs`,
  `audio/voices.rs`, `audio/preview.rs`, `audio/mod.rs`: modify.
- `sample_ram.rs`, `library/mod.rs` (peaks), `library/import.rs` (`listed`): modify.
- `control/mod.rs`, `control/pages.rs`, `control/view.rs`, `control/samples.rs`, `control/draw.rs`,
  `control/tests.rs`: modify. `control/tests/sample_sounds.rs`: create.

**`packages/groovebox-core/`:** `scenes/`: create `sample-sounds` and `sample-delete`; modify
`worst-case` and every scene that reaches New synth with one "down"; re-bless.

**`apps/groovebox/`:** `source/gallery/states.ts`: modify.

**Repo root:** `.changeset/groovebox-sample-sounds.md`: create. The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-03-groovebox-sound-design.md`, `2026-11-03-groovebox-workflow-a-design.md`,
  `2026-11-06-groovebox-project-model-design.md`, `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Sound:** "Shared voice chain", trigger mode: answer 1 replaces "with sustain counted as zero so
  it always ends". "Sample player": answers 2, 3 and 5, S1 to S6. "Engine architecture" item 3: S5's
  restart and legato for a sample.
- **Workflow A:** "Making sounds": answer 4, S7. "The PAD page": S9, S10. "Two ways to change what a
  pad plays": S8, S11. "The sample picker": S12 to S14.
- **Project model:** "A missing sample": S14, S15, S16. "Where things live and how they move": S17
  in mixed case. "Projects and the library in use": S18.
- **Look:** "Shared parts": S12's top line; "The other screens": S19, and frame points with one
  decimal (answer 2) where `sound-sample.png` shows whole percent.
- **Overview:** "Open points for planning" as listed above.

- [ ] **Step 1: Edit the five specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the sample sound decisions in the groovebox specs"`

---

### Task 2: The sample engine's values and a sound's sample

**Files:**

- Create: `src/param/sample.rs`.
- Modify: `src/param/mod.rs`, `src/project/pool.rs`, `src/control/draw.rs` (the sound picker's
  engine word), in `crates/groovebox-core/`.

**Interfaces:**

- **Produces, `param`:** the entries `START`, `END`, `LOOP`, `LOOP_START`, `LOOP_END`, `REVERSE`,
  `ROOT_NOTE` (Shared formats), on `ENTRIES` after the synth's.
  - `pub fn moved_frame(value: i32, clicks: i32, fine: bool, frames: u32) -> i32`: a click is
    `max(1, frames / 128)` frames, a fine one `max(1, click / 16)`; held within `0..=frames − 1`.
  - `pub fn format_frame(value: i32, frames: u32, out: &mut Label<16>)`: tenths of a percent of
    `frames − 1`, rounded half up on integers, "4.2%"; a file of one frame reads "0.0%".
  - `format` writes a `Unit::Note` count as its name (S1).
- **Produces, `project::pool`:** `Sample` and `Engine` (Shared formats); `Engine::page_name(&self)`.
  - `Sound::take_file(&mut self, file: FileId, audio: &File)`: S8's five values and
    `Engine::Sample(Sample::File(file))`.
  - `Sound::start_sample(&mut self, file: FileId, audio: &File)`: the sample entries at their
    defaults, Loop on when `audio.loop_points` is some (answer 5), then `take_file`.
  - `Sound::start_synth(&mut self)`: the synth entries at their defaults and `Engine::Synth`.
  - `Pool::new_sample(&mut self, file: FileId, audio: &File) -> Result<SoundNumber, PoolFull>`: S7,
    Trigger Gate for a file with its own loop and One-shot otherwise, then `start_sample`.

- [ ] **Step 1: Write the failing tests**

```rust
// param/mod.rs
#[test] fn the_list_passes_its_check_with_40_sound_and_2_device_entries() { /* replaces the 33 test */ }
#[test] fn check_refuses_a_frame_entry_with_a_click() { /* Frame, click 512: Err */ }
#[test] fn frames_move_by_a_128th_of_the_file_or_a_sixteenth_with_shift() {
    assert_eq!(moved_frame(0, 1, false, 48_000), 375);
    assert_eq!(moved_frame(0, 1, true, 48_000), 23);
    assert_eq!(moved_frame(47_900, 1, false, 48_000), 47_999);
    assert_eq!(moved_frame(10, -1, false, 48_000), 0);
    assert_eq!(moved_frame(0, 1, true, 100), 1);
}
#[test] fn frames_read_as_a_percent_with_one_decimal() {
    /* 48_000 frames: 0 "0.0%", 47_999 "100.0%", 2_016 "4.2%", 44_160 "92.0%" */
}
#[test] fn a_one_frame_file_reads_0_percent_and_never_moves() {
    /* format_frame(0, 1) "0.0%"; moved_frame(0, 5, false, 1) == 0 */
}
#[test] fn notes_read_as_names() { /* ROOT_NOTE: 60 "C4", 61 "C#4", 0 "C−1", 127 "G9" */ }

// project/pool.rs
#[test] fn a_sample_sound_of_a_file_without_a_loop_is_one_shot_over_the_whole_file() {
    /* File kick.wav, 4_800 frames, root 48, no loop: name "kick", Trigger One-shot, Loop Off,
       Start 0, End 4_799, Loop start 0, Loop end 4_799, Root note 48, Cutoff at its default,
       engine Sample(File(FileId(3))) */
}
#[test] fn a_sample_sound_of_a_file_with_a_loop_loops_on_gate() { /* loop (1_000, 3_999): Loop On, Gate, Loop start 1_000, Loop end 3_999 */ }
#[test] fn taking_another_file_keeps_every_other_value() {
    /* Loop On, Reverse On, Trigger Gate, Cutoff 1_000 kept; Start, End, loop points and Root note from the new file */
}
#[test] fn the_synth_starts_at_its_defaults_and_keeps_the_chain() { /* Wave Pulse, Cutoff 1_000 → start_synth: Wave Saw, Cutoff 1_000, Engine::Synth */ }
#[test] fn a_full_pool_refuses_a_sample_sound_and_changes_nothing() {}
#[test] fn a_second_sound_of_a_file_is_numbered() { /* kick, then "kick 2"; "kick 2.wav" on an empty pool gives "kick" */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib param project`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the entries, the frame functions and the sample on a sound**

  The sound picker's engine word (`draw.rs`) reads "sample" for `Engine::Sample(_)`; `SOUND_VALUES`
  callers that spell 33 move to the constant.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox sample engine's values and a sound's sample"`

---

### Task 3: The sample player

**Files:**

- Create: `src/audio/sample.rs`.
- Modify: `src/message.rs`, `src/audio/preview.rs`, `src/audio/mod.rs`, `src/control/samples.rs`,
  `src/control/mod.rs` (`hit` sends `NoteEngine::Synth` until Task 5).

**Interfaces:**

- **Consumes:** Task 2's entries.
- **Produces:** `SampleFile`, `NoteEngine`, the new `NoteOn` and `Preview` (Shared formats).
- **`sample.rs`:** `pub struct Player`.
  - `pub fn start(&mut self, sample: Option<SampleFile>, read: impl Fn(ParamId) -> i32, rate: f32, reader: &Reader<'_>)`:
    from Start, or End in reverse, and reads its first chunk ahead. `None` has finished at once.
  - `pub fn render(&mut self, read: impl Fn(ParamId) -> i32, rate: f32, reader: &Reader<'_>) -> [[f32; CHUNK]; 2]`:
    gives the chunk read ahead and reads the next; `rate` is file frames per output frame.
  - `pub fn ahead(&self) -> [[f32; CHUNK]; 2]`: the chunk read ahead, reading nothing.
  - `pub fn finished(&self) -> bool`, `pub fn file(&self) -> Option<FileId>`,
    `pub fn stereo(&self) -> bool`.
  - The position is a `u64` of 32.32 fixed point. Each output frame is a 4-point Hermite of the
    frames around the position, each neighbour held within `0..=frames − 1`, a mono file's sample in
    both channels, `/ 32_768` and unscaled (S6). Start, End and the loop points are held within the
    file whatever their values; the loop is `max(Loop start, Start)` to `min(Loop end, End)` and
    none when that is empty (answer 3); past its end the position goes back by the loop's length, in
    reverse past its start forward by it (S3). Without a loop it finishes after End (before Start in
    reverse), the rest of that chunk silent.

- [ ] **Step 1: Write the failing tests**

  A ramp file written into the sample RAM as the audio tests' `Rig::add_file` does: frame `i` holds
  `8 * i` (stereo: right `−8 * i`).

```rust
#[test] fn at_rate_1_it_plays_the_frames_from_start_to_end_and_finishes() {
    /* 1_000 frames, Start 100, End 163: the first two chunks are frames 100..164 / 32_768 exactly, then finished, the rest silent */
}
#[test] fn reverse_plays_from_end_back_to_start() {}
#[test] fn a_loop_jumps_back_to_its_start_after_its_end() { /* Loop On 200..=231, Start 0, End 999: after frame 231 comes 200 */ }
#[test] fn a_loop_outside_start_and_end_does_not_loop() { /* Loop 10..=40, Start 500: plays to End and finishes */ }
#[test] fn a_reversed_loop_runs_backwards() {}
#[test] fn rate_2_skips_every_other_frame_and_rate_half_interpolates() { /* rate 2: 0, 16, 32 …; rate 0.5: frame values and their midpoints */ }
#[test] fn reads_stay_inside_the_file_whatever_the_values() {
    /* 64 frames, End 1_000_000, Loop end 1_000_000, Loop On, rate 16, both directions: no panic, every
       output within the ramp's range; a reader over a RAM whose next block holds i16::MAX never shows it */
}
#[test] fn a_two_frame_file_plays_and_ends() {}
#[test] fn a_stereo_file_keeps_its_channels() {}
#[test] fn ahead_gives_the_next_chunk_without_reading() { /* overwrite the blocks after render: ahead() still gives the old frames */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio::sample`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the player and the message changes**

  `Preview` carries a `SampleFile`; the preview player, SAMPLES and their tests follow.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib audio control`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox sample player"`

---

### Task 4: Sample voices

**Files:**

- Modify: `src/audio/voice.rs`, `src/audio/voices.rs`, `src/audio/mod.rs`, `src/sample_ram.rs` (the
  readers' contract).

**Interfaces:**

- **Consumes:** Task 3's `Player`, `NoteEngine`.
- **`voice.rs`:** the voice holds the synth or a `Player`, chosen at `start`.
  - `pub fn start(&mut self, note: NoteId, track: u8, sound: SoundNumber, pitch: u8, velocity: u8, seed: u32, engine: NoteEngine, values: &[i32; SOUND_VALUES], reader: &Reader<'_>)`:
    a sample voice is stereo when its file is.
  - `pub fn change(&mut self, note: NoteId, pitch: u8, velocity: u8, restart: bool, glide: bool, engine: NoteEngine, reader: &Reader<'_>)`:
    S5.
  - `pub fn render(&mut self, reader: &Reader<'_>, out: &mut [[f32; CHUNK]; 2])`: the rate is S2's;
    One-shot counts sustain as zero only for a synth or a sample with Loop on (answer 1); a voice
    whose sample finished goes `Idle` after that chunk (S4).
  - `pub fn fade(&mut self, out: &mut [[f32; CHUNK]; 2])`: takes no reader; a sample voice fades its
    chunk read ahead.
  - `pub fn reads(&self) -> Option<FileId>`.
- **`voices.rs`:** `note_on` and `note_off` take the `NoteEngine` (note on) and the reader; a held
  key keeps its note's engine for Mono's return.
  - `pub fn forget(&mut self, file: FileId, fades: &mut [[f32; CHUNK]; 2])`: fades every voice that
    reads `file` and turns each held key's `Sample(Some(file))` into `Sample(None)`.
  - `pub fn render(&mut self, reader: &Reader<'_>, out: &mut [[f32; CHUNK]; 2])`.
- **`Audio::render`:** `ForgetSample` also calls `voices.forget` into the chunk's fades; voices read
  through the table in use. Its doc and `Tables::readers`' contract name the files a `NoteOn` named.

- [ ] **Step 1: Write the failing tests**

  In `audio/mod.rs`'s tests, with the `Rig` and its files.

```rust
#[test] fn a_one_shot_sample_plays_to_its_end_at_full_sustain() {
    /* NoteOn of a new sample sound (One-shot, Loop Off) on a 9_600-frame file at its root: still sounding at frame 9_000; silent and the voice idle after 9_600 */
}
#[test] fn a_looping_one_shot_sample_ends_by_its_decay() { /* Loop On: silent within Decay's 300 ms × 2 */ }
#[test] fn lowering_sustain_shortens_a_one_shot_sample() { /* Sustain 0: silent long before the file ends */ }
#[test] fn a_gate_sample_releases_when_let_go_and_ends_at_its_end_when_held() {}
#[test] fn a_sample_plays_an_octave_up_twelve_semitones_above_its_root() { /* root 60, pitch 72: twice as fast */ }
#[test] fn a_stereo_file_makes_a_stereo_voice() {}
#[test] fn a_missing_sample_takes_a_voice_and_sounds_nothing() { /* Sample(None): silent, idle after one chunk, still chokes its group */ }
#[test] fn mono_restarts_a_sample_and_legato_keeps_its_place() {}
#[test] fn forget_fades_the_voices_reading_the_file_within_one_chunk() { /* the last sample of that chunk is 0 and the voice idle; a voice of another file plays on */ }
#[test] fn a_forgotten_file_is_not_read_from_the_chunk_its_forget_applies() {
    /* fill the file's blocks with i16::MAX between renders right before the chunk the ForgetSample applies: that chunk equals the same render with the blocks untouched */
}
#[test] fn a_mono_return_to_a_forgotten_key_plays_silence() {}
#[test] fn a_steal_fades_a_sample_voice_without_reading() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL to compile.

- [ ] **Step 3: Implement sample voices**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: PASS, the synth's tests unchanged.

- [ ] **Step 5: Commit**

  `git commit -m "Play groovebox sample sounds in the voices"`

---

### Task 5: NEW SAMPLE and the sample picker

**Files:**

- Modify: `src/message.rs` (S21), `src/control/mod.rs`, `src/control/view.rs`,
  `src/control/samples.rs`, `src/control/draw.rs`, `src/control/tests.rs`.
- Create: `src/control/tests/sample_sounds.rs`.

**Interfaces:**

- **Consumes:** Task 2's `Pool::new_sample`, `Engine`; Task 3's `NoteEngine`, `SampleFile`.
- **Produces:**
  - `Picker::Sample(Pick)` with `pub enum Pick { NewSound, Change, Switch }`: what choosing a file
    does (Task 6 uses `Change` and `Switch`).
  - `View::sample_picker: SamplesView`: the sample picker's folder and cursor, kept while the
    project is open (S13). SAMPLES' moves, OK, CANCEL, going up, cursor keeping after replies and
    the import's replace act on whichever of `View::samples` and `View::sample_picker` is shown. The
    picker fits 15 rows at every level, SAMPLES 15 and 14 as before.
  - `fn playable(&self, file: FileId) -> Option<SampleFile>` on `Control`: the file when it is
    loaded, not being deleted and not being replaced; previews and notes both use it.
  - `fn send_values(&mut self, sound: SoundNumber, before: &[i32; SOUND_VALUES], sample: u64, messages)`:
    a `SetParam` for each value of `sound` that differs from `before`.
  - `fn open_sample_picker(&mut self, pick: Pick, on: Option<FileId>)`: S13; Task 6 opens it from
    ENGINE and the Sample item.
- **Behaviour:** S20 (`FIRST_SOUND_ROW` is 3); answer 4; S12, S13, S14 for the picker; OK on a file
  with `Pick::NewSound` makes the sound (`NewSound`, then `send_values` from `SOUND_DEFAULTS`) and
  puts it on the selected pad. `hit` sends the sound's `NoteEngine` (`Sample(None)` when its file is
  not `playable`) and in PADS mode a sample sound's Root note (S2).

- [ ] **Step 1: Write the failing tests**

  In `sample_sounds.rs`, with plan 1's `Rig` helpers for a library of `drums/kick.wav` (mono, root
  48), `drums/snare.wav`, `bass.wav` (stereo, loop) and `drums/808/` holding one file.

```rust
#[test] fn the_sound_picker_offers_new_sample_between_empty_and_new_synth() {}
#[test] fn new_sample_opens_the_sample_picker_at_the_top_on_its_first_row_and_plays_nothing() {}
#[test] fn the_sample_picker_draws_its_top_line_and_the_librarys_rows() {
    /* top level: "Library " and the meter's text, dim; inside drums/: "drums/  Library …", then "..", "808/", kick.wav … */
}
#[test] fn a_remembered_folder_that_is_gone_opens_the_top_level() {}
#[test] fn moving_onto_a_file_in_the_picker_previews_it_and_a_folder_stops_it() {}
#[test] fn ok_on_a_file_puts_a_new_sample_sound_on_the_pad() {
    /* sends NewSound then the SetParams of Trigger, End, Loop end and Root note; the pad holds "kick"; header "Sound Pad T1 kick Pads" */
}
#[test] fn a_new_sample_sound_waits_for_room_for_its_messages() { /* queue with 7 free: the OK waits; with 8 it is handled */ }
#[test] fn cancel_goes_up_and_closes_at_the_top_without_choosing() {}
#[test] fn the_picker_reopens_in_the_folder_it_was_last_in() {}
#[test] fn a_full_pool_refuses_new_sample_at_once() { /* "Pool full" in red, no picker, no message */ }
#[test] fn an_import_while_the_picker_is_open_keeps_its_cursor_on_its_row() {}
#[test] fn a_not_loaded_file_is_red_never_previewed_and_can_be_chosen() {}
#[test] fn pads_mode_plays_a_sample_sound_at_its_root() { /* kick, root 48: NoteOn pitch 48 with Sample(Some(kick)) */ }
#[test] fn keys_mode_plays_a_sample_sound_at_the_keys_pitch() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL to compile.

- [ ] **Step 3: Implement NEW SAMPLE and the picker**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS; tests that reached New synth by
  row 1 now use row 2.

- [ ] **Step 5: Commit**

  `git commit -m "Make groovebox sample sounds from the sample picker"`

---

### Task 6: ENGINE and the Sample page

**Files:**

- Modify: `src/control/pages.rs`, `src/control/mod.rs`, `src/control/view.rs`,
  `src/control/draw.rs`, `src/library/mod.rs`, `src/sample_ram.rs`,
  `src/control/tests/sample_sounds.rs`.

**Interfaces:**

- **Consumes:** Task 2's `take_file`, `start_sample`, `start_synth`, `moved_frame`, `format_frame`;
  Task 5's `open_sample_picker`, `send_values`.
- **Produces:**
  - `ItemKind::PadEngine`, `ItemKind::SampleFile`, `Picker::Engine`, `Picture::Waveform`.
  - `pub fn pages(screen: Screen, sound: Option<&Sound>) -> &'static [PageDef]`: the selected
    sound's engine picks its page.
  - `pub fn peaks(&self, file: FileId, tables: &Tables, ram: &SampleRam) -> [u16; PICTURE.2 as usize]`
    on `Library`: S19's peaks, read through a reader of the table the listing uses. A listed file's
    blocks are written by no one, so the control part may read them; `Tables::readers`' contract
    says so.
  - `Control` keeps the peaks of the selected sound's file with that file's fingerprint and reads
    them again in `step` when the fingerprint differs.
- **Behaviour:** S9, S10, S11 (the Sample item opens `Pick::Change` on the file; ENGINE's Sample
  opens `Pick::Switch`); turning or − and + on a frame item moves it by `moved_frame`, then holds it
  by answer 3 against its partner (Start below End, Loop start below Loop end), and does nothing
  while the file is missing or when no frame is left to move to; the bar fills by the value's share
  of `frames − 1`; Root note shows S1's name. Choosing with `Pick::Change` calls `take_file`, with
  `Pick::Switch` `start_sample`; both send `send_values`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn the_pad_page_shows_engine_on_encoder_3() { /* "Engine" "Sample" with a 3; the strip's third cell */ }
#[test] fn engine_opens_a_picker_on_the_current_engine() {}
#[test] fn switching_to_synth_resets_the_synths_values_and_keeps_the_chain() {}
#[test] fn switching_to_sample_happens_only_when_a_file_is_chosen() { /* CANCEL in the sample picker: still a synth, no message */ }
#[test] fn a_turn_on_engine_or_the_sample_item_does_nothing() {}
#[test] fn the_sample_page_lists_its_eight_items() {
    /* header "Sound Sample T1 kick Pads"; Sample kick.wav (1), Start 0.0% (2), End 100.0% (3), Loop Off (4), Loop start 0.0%, Loop end 100.0%, Reverse Off, Root note C3 */
}
#[test] fn start_moves_by_a_128th_of_the_file_and_stops_before_end() {}
#[test] fn loop_end_stops_after_loop_start() {}
#[test] fn the_sample_item_changes_the_file_and_keeps_the_other_values() {}
#[test] fn the_picker_from_the_sample_item_opens_on_the_sounds_file() {}
#[test] fn the_waveform_shows_the_files_peaks_and_the_start_and_end_marks() {
    /* a file of silence then full scale: the columns over the silence are empty, those over the loud part fill to 2 px inside the area; ACCENT at the Start and End columns; FAINT middle line */
}
#[test] fn peaks_read_at_most_64_frames_a_column() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control library`. Expected: FAIL to compile.

- [ ] **Step 3: Implement ENGINE, the Sample page and the waveform**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control library`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox ENGINE item and Sample page"`

---

### Task 7: Deleting a used file and MISSING

**Files:**

- Modify: `src/control/mod.rs`, `src/control/samples.rs`, `src/control/draw.rs`,
  `src/library/import.rs`, `src/control/tests/sample_sounds.rs`.

**Interfaces:**

- **Consumes:** Task 5's `playable`; Task 2's `Sample`.
- **Produces:** `Import::listed(&mut self) -> Option<(FileId, Option<FileId>)>`: the file the
  library just listed and the file it replaced, once; it replaces `replaced`, whose callers follow.
- **Behaviour:** S15 to S18. `deleted` turns every `Sample::File(file)` of the pool into
  `Sample::Missing(path)` before the library removes the file. `follow_import` turns `File(old)`
  into `File(new)` on a replace and every `Missing(path)` that names the new file's path, ignoring
  case (`name::same`), into `File(new)`. MISSING is a sound whose sample is `Missing` or whose file
  is not loaded.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn the_delete_question_counts_the_sounds_that_use_the_file() {
    /* "Delete kick.wav?", "2 sounds use it", "OK deletes, Cancel keeps"; one sound: "1 sound uses it"; none: no count line */
}
#[test] fn deleting_a_used_file_fades_its_voices_and_leaves_its_sounds_missing() {
    /* ForgetSample sent; after the reply the header's "kick" is RECORD and its picker row red; a hit sends Sample(None) */
}
#[test] fn a_hit_during_a_delete_sends_no_file() { /* between ForgetSample and the Delete reply */ }
#[test] fn a_failed_delete_leaves_the_sounds_playing_the_file() {}
#[test] fn a_file_dropped_again_under_its_path_revives_its_sounds() { /* KICK.wav into drums/: Sample(Some(new)) */ }
#[test] fn a_new_file_in_a_deleted_files_place_does_not_revive_its_sounds() { /* another name takes the freed FileId: still missing */ }
#[test] fn a_replaced_file_keeps_its_sounds_on_the_new_audio() {}
#[test] fn a_hit_during_a_replace_sends_no_file() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement the count, MISSING and the relinking**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Leave groovebox sounds missing when their file is deleted"`

---

### Task 8: Scenes, gallery and the worst case

**Files:**

- Create: `scenes/sample-sounds.scene`, `scenes/sample-delete.scene` (with fingerprints and frames).
- Modify: `scenes/worst-case.scene`, `budget.toml` only with the owner's go,
  `apps/groovebox/source/gallery/states.ts`.
- Re-bless: every scene whose picker frames or inputs change.

**The existing scenes:** each scene that opens the sound picker and presses "down" once to reach New
synth gets a second press and release of "down" between the first one's release and the OK, so no
later input moves; check the recorded `browser-*` scenes, which only use SAMPLES, by their blessed
diff.

**The new scenes,** driven by the panel only, with `file` lines from the `ours` source:

- **`sample-sounds`:** `drums/kick.wav`, `drums/snare-room.wav` (1.2 s), `drums/808/` and a stereo
  `pad.wav`. SOUND, OK, New sample: a frame of the picker at the top, ▼ onto a file (preview), OK
  into `drums/` (frame for `picker-sample.png`), the snare chosen. Pad 1 hit and held past the
  file's end; KEYS mode notes an octave apart. PAGE + 2: the Sample page with Start and End turned
  to about 4% and 92% (frame for `sound-sample.png`); Loop on, Reverse on, notes held. The Pad page
  (frame for `sound-pad.png`). ENGINE to Synth, then to Sample through the picker.
- **`sample-delete`:** two sounds of `kick.wav`, one ringing with Loop on in KEYS mode; SAMPLES, OK,
  Delete: the question (frame for `question.png`); OK: the voice fades, then the header names the
  sound in red (frame) and the sound picker shows its row in red (frame for `picker-sound.png`);
  `kick.wav` dropped again: a hit sounds.

**The worst case:** `worst-case.scene` keeps its 32 stereo supersaw voices and opens the sample
picker on the long stereo file, so the preview plays too. Then measure once, outside the suite, the
same scene with 32 stereo sample voices at Transpose +48 instead of the synth; the scene keeps
whichever costs more. When `busiest_render` exceeds `worst_batch_operations`, stop and report both
numbers: raising it is the owner's call.

**The gallery:** `STATES` gains the five frames above, each with its `approved` picture; the frames
of `picker-sound.png` and `sound-pad.png` that exist already now show New sample and Engine.

- [ ] **Step 1: Write the scenes and the gallery states**
- [ ] **Step 2: Bless and compare**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-drift` with
  `GROOVEBOX_BLESS=1`. Then:
  - `git diff scenes/*.fingerprints` for the existing scenes: `applied` lines move by the extra
    "down"; `frame` lines change only for frames that show the sound picker or the Pad page; any
    other change is a bug.
  - Open the new frames beside their approved pictures: items, header and strip match pixel for
    pixel where both show the same thing, apart from answer 2's one decimal; the waveform by eye.
  - Listen to `sample-sounds` and `sample-delete` in the app (`npm run develop` in `apps/groovebox`,
    the same moves by hand): no click at a note's end, a loop's jump or the delete's fade.

- [ ] **Step 3: Run without blessing**

  Run: `cargo test -p groovebox-drift`, and in `apps/groovebox`
  `npx vitest run tests/gallery.test.ts`, `npx eslint source/gallery/states.ts` and
  `npm run typecheck`. Expected: PASS, 0 errors.

- [ ] **Step 4: Commit**

  `git commit -m "Add the groovebox sample sound scenes"`

---

### Task 9: Changeset and the last checks

**Files:**

- Create: `.changeset/groovebox-sample-sounds.md`: `'groovebox-core': minor` and
  `'groovebox': minor`, "Added sample sounds to the groovebox: the sample engine, the sample picker,
  the Sample page and ENGINE".

- [ ] **Step 1: Write the changeset**
- [ ] **Step 2: Run the package checks once**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`,
  `cargo test -p groovebox-core --lib the_device_fits_the_working_memory -- --nocapture` (report the
  size against S22) and `npm test` in `packages/groovebox-core`; `npm run lint` and
  `npm run typecheck` in `apps/groovebox`. Expected: all pass, and `git status --porcelain` is empty
  afterwards.

- [ ] **Step 3: Commit**

  `git commit -m "Add a changeset for the groovebox sample sounds"`
