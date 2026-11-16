# Groovebox Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 1 of 3 for Milestone 2 ("Samples and POOL"). Milestone 1 and the scrolling text plan are built.
Plan 2 builds sample sounds, plan 3 POOL (answer 1).

**Goal:** The device gets its sample library. You drop WAV files or folders on the page; they are
converted to 48 kHz and 16 bits, written to the device's storage and placed in its 64 MB sample RAM,
and the header reports the result. Every start-up loads the whole library before the project opens.
SAMPLES (MENU + 10) lists the library by folder with each file's length and size and the library
meter. Moving onto a file plays it once through the preview player. OK on a file leads to Delete and
a question, and deleting frees the file's storage and RAM. SETTINGS gains its Dev page with the
library meter. A saved session carries its files and replays on its own.

**Architecture:**

- **Storage interface** (`storage.rs`): the control part sends one request at a time (list, read,
  load into sample RAM, replace in parts, delete, free space); the platform carries it out and
  queues a stamped reply, which the control part handles in sample order with the inputs. Read data
  lands in an I/O buffer in working memory or straight in sample RAM.
- **Sample RAM** (`sample_ram.rs`): 64,000,000 bytes in blocks of 2,048. A file takes whole blocks,
  listed in a block table that the audio part reads. Blocks and table entries never move while a
  file lives, so nothing the audio part reads is ever written. A table that runs out of room is
  compacted into a second copy, which the audio part switches to at a chunk.
- **Library** (`library/`): the control part's list of files and folders, start-up, import (WAV
  reading, conversion, names, the BLAKE3 fingerprint) and deleting, each a job of storage requests.
- **Audio part:** a preview player beside the voices that reads a file's blocks, mixed before the
  soft clipper; `ForgetSample` fades whatever reads a file, and its applied report is the "let go"
  the control part waits for before a block is reused.
- **Screens:** SAMPLES, the Delete picker, the first question and SETTINGS' Dev page.
- **Platforms:** the drift harness gets an in-memory storage seeded by scene lines; the browser
  worker carries requests out on the site's private storage; the shell takes dropped files; the
  session log carries files and replies.

**Tech Stack:** as the Sound plan: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the
drift crate; TypeScript, React Router 8, Vite, Vitest (node and Playwright Chromium browser mode);
the Origin Private File System in the worker. BLAKE3 is the official reference implementation copied
into the core (answer 3): no new dependency.

**Spec:**

- [Project model](../specs/2026-11-06-groovebox-project-model-design.md) is the main spec: "Two
  memories", "Where things live and how they move", "Layout of the internal storage", "Sample
  files", "Projects and the library in use" (starting up, the library, the library meter).
- [Sound](../specs/2026-11-03-groovebox-sound-design.md): "Sample import", "Voices" (the preview
  player), "Mixing and master".
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "Sample RAM", "Budget profile",
  "Storage", "Testing and drift".
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "Pickers and questions", "The
  sample picker" (the preview rules SAMPLES shares), "Actions and bindings".
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header" (messages), "Shared parts" (a
  picker, a question), "The other screens" (SAMPLES, the Dev page), "The browser shell" (files),
  "The font"; the pictures `samples.png`, `picker-sample.png`, `question.png`.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".

## Decisions for this plan

The owner answered every open point on 2026-11-16. Task 1 writes the answers into the specs.

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature: what deleting a sample does to sounds (MISSING, fading their
voices, "2 sounds use it") comes with sample sounds in plan 2, and STOP silencing the preview with
STOP in Milestone 3.

### The owner's answers

| #   | Point                 | Answer                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Milestone 2's plans   | Three: (1) storage, import and the SAMPLES screen with its preview and delete; (2) sample sounds: the sample engine, the Sample page, NEW SAMPLE, the sample picker, the Engine item and what deleting a sample does to its sounds; (3) POOL                                                                                                              |
| 2   | Sessions and storage  | A saved session carries a copy of every file the device read during it (the library at start-up and each dropped file) and the moment each storage reply arrived, so it replays on its own. Hand-written scenes make their files with a generator line. Big session files are fine: "Memory should be no issue"                                           |
| 3   | BLAKE3                | The BLAKE3 team's official reference implementation is copied into the core with its licence noted. No new dependency                                                                                                                                                                                                                                     |
| 4   | Library files         | At most 4,096 files, so with real samples the meter is the limit you meet. Working memory grows from 1 MB to 2 MB for the file list. Either limit refuses with "<file> not imported: library full"                                                                                                                                                        |
| 5   | When a preview plays  | Only when the arrows or − and + move the highlight onto a file. Opening SAMPLES, coming back from the Delete picker or a question, or a delete moving the cursor plays nothing                                                                                                                                                                            |
| 6   | Folders               | Kept, as the specs say: a dropped folder keeps its name and subfolders; loose dropped files sit at the top level                                                                                                                                                                                                                                          |
| 7   | Inside a folder       | As in the sample picker picture: a dim line names the folder, then ".." as the first row; OK on ".." goes up, and so does CANCEL. At the top level both are left out                                                                                                                                                                                      |
| 8   | Order                 | Folders first, then files, each A to Z ignoring case; an accented letter sorts with its plain letter (déšť.wav between clap.wav and hat-closed.wav). A new import lands in its place by name                                                                                                                                                              |
| 9   | Storage reserve       | 9 MB: the note memory (8 MB) plus 1 MB, so a project with every note slot used can always be saved. An import that would reach into it: "<file> not imported: storage full"                                                                                                                                                                               |
| 10  | Other files in a drop | Only names ending in .wav count, in any case; the rest are skipped and not mentioned. A .wav the device cannot read (8-bit, compressed, more than two channels, damaged) is refused: "<file> not imported: can't be read". Several reasons are listed: "5 files imported, 3 not: library full, can't be read"                                             |
| 11  | A dropped file        | One message per drop: the browser copies all of the drop's .wav files into `tmp/`, numbered in the order dropped, then sends one input, "3 files dropped". A drop that arrives during an import joins it ("Importing 5 files")                                                                                                                            |
| 12  | Folder requests       | Writing a file makes its folders; deleting a file also removes the folders it leaves empty, so an emptied folder vanishes from SAMPLES and you land in the folder above, on the nearest row above where it was. One delete request also removes a folder with everything in it, which empties `tmp/` at start-up. Copying a project waits for Milestone 5 |
| 13  | Leaving SAMPLES       | A preview still playing fades out when you leave SAMPLES, as on OK and CANCEL. Holding MENU or PAGE without choosing a screen does not stop it                                                                                                                                                                                                            |

### Settled by the specs, the pictures or the rule

| #   | Point                      | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Sample RAM                 | 64,000,000 bytes: the meter counts a MB as 1,000,000 bytes and reads "of 64 MB" (Project model). It sits beside working memory, never inside it (Foundation)                                                                                                                                                                                                                                                                                                                                                |
| S2  | Blocks                     | The builder's choice: 31,250 blocks of 2,048 bytes (1,024 mono or 512 stereo frames, never split). A file takes whole blocks and the meter counts them, so it is exact about what still fits; it reads up to 2 KB per file more than the files' sizes add up to                                                                                                                                                                                                                                             |
| S3  | The meter                  | "41.2 of 64 MB": the blocks in use × 2,048 bytes in tenths of a MB, rounded half up; the bar filled by that share (Project model, `samples.png`). The same text on SAMPLES and the Dev page                                                                                                                                                                                                                                                                                                                 |
| S4  | Lengths and sizes          | Below a minute a length reads in tenths of a second ("0.4 s", "14.0 s"), from a minute in minutes and seconds ("5:30"); a size is the audio's bytes, whole KB below 1,000 KB ("38 KB") and tenths of a MB from there ("2.6 MB"), a KB being 1,000 bytes (`picker-sample.png`). Each rounds half up                                                                                                                                                                                                          |
| S5  | SAMPLES' rows              | A folder as its name and "/", a file as its stored name with ".wav" and "length size" dim at the right; a file start-up could not load in red with "not loaded" (Project model). The meter is an item above the strip ("Library" and the meter text, full width, its bar), never a cursor target; the strip is empty                                                                                                                                                                                        |
| S6  | SAMPLES' layout            | 15 rows fit at the top level and 14 inside a folder, under the folder line. ▲ ▼ − + move one row, ◀ ▶ as many rows as fit, all stopping at the ends, as in pickers ("lists the library the way the sample picker does")                                                                                                                                                                                                                                                                                     |
| S7  | SAMPLES' header and tiles  | The screen's name and where you are, no page name (`samples.png`); MENU tile 10 "Samples"; PAGE shows 16 empty tiles, as on any screen without pages                                                                                                                                                                                                                                                                                                                                                        |
| S8  | What SAMPLES remembers     | Its folder and its cursor, until the project closes, not saved (Workflow A: page cursors). The cursor stays on its entry when rows come or go above it; when its entry vanishes it moves to the nearest row above. OK on a folder puts the cursor on ".."; going up puts it on the folder you left                                                                                                                                                                                                          |
| S9  | Delete                     | OK on a file (loaded or not) opens a picker with one row, "Delete"; CANCEL closes it. OK on Delete opens the question "Delete <file>?" with the dim line "OK deletes, Cancel keeps" (`question.png`). OK deletes; CANCEL answers no and goes back to the list. Opening the picker stops the preview (Workflow A)                                                                                                                                                                                            |
| S10 | The question               | A box in the middle of the main area, 1 px `LINE` outline (Look, the rig's `drawQuestion`). Only OK and CANCEL answer it; while it is open only the controls a picker lets through act, and the arrows, − and + do nothing either (Workflow A)                                                                                                                                                                                                                                                              |
| S11 | Letting go of a file       | Deleting sends `ForgetSample`; the audio part fades whatever reads the file within one chunk. The file's blocks are free, and the meter drops, only once that message's applied report has reached the control part (Project model: RAM reused after the sound side reports). The overview's "sample let go" is that report                                                                                                                                                                                 |
| S12 | The preview                | The file once, from its first frame, at its own rate, dry, at the gain of a default sound at velocity 127: the Level default through the voice's level and centred pan maths (`0.64 × √½` today). Mixed after the voices and before the soft clipper; master level joins in Milestone 3. Every stop fades within one chunk                                                                                                                                                                                  |
| S13 | Start-up                   | Empties `tmp/`, lists `samples/` and loads every file in SAMPLES' order, depth first, with "Loading library" in the accent. Until the project opens the main area and strip are empty and every input except the volume encoder does nothing. Then the message clears, unless a result follows                                                                                                                                                                                                              |
| S14 | Files start-up cannot load | Past the sample RAM: "Library too big. 3 files not loaded" in red. A file whose header is not this device's (damaged or foreign) is not loaded either, counted as "1 file not loaded" when the RAM did not run out. Both kinds are listed, red, "not loaded", and can be deleted (Project model)                                                                                                                                                                                                            |
| S15 | Names                      | Reduced to letters the font draws, digits, space, dash, underscore and dot, trimmed (Project model). A file name keeps ".wav" and is cut at a character boundary to 64 bytes; a folder name to 32. At most four folder levels: deeper files go into the fourth, so a path fits 255 bytes. Nothing left before ".wav" gives "sample.wav"                                                                                                                                                                     |
| S16 | Same name                  | Names that differ only in case are the same (Project model). The same audio (fingerprint) under the same name writes nothing and counts as imported; other audio gets "-2", then "-3", before ".wav"                                                                                                                                                                                                                                                                                                        |
| S17 | Root note and loops        | From the file's `smpl` chunk (unity note, first loop, ends inclusive, rescaled to 48 kHz and rounded), else a note name at the end of the name such as `Bass_C2` (C4 is 60), else C4 (Sound). Kept in our converted file's `smpl` chunk                                                                                                                                                                                                                                                                     |
| S18 | Import messages            | "Importing 3 files", or "Importing kick.wav" for one, in the accent while it runs; presses do not clear it (Look: progress stays). Then "3 files imported" or "kick.wav imported" in the accent, or in red "2 files imported, 1 not: library full" / "kick.wav not imported: library full", reasons in the order library full, storage full, can't be read. A name too long for the header is shortened with "…" so the rest shows. Look's "Library full. Kick.wav not imported" example takes this wording |
| S19 | Checks                     | In this order: can't be read (header or format), library full (4,096 files, 1,024 folders or blocks), storage full (free space less the 9 MB reserve below the converted file's size). A refused file does not stop the ones after it (Sound)                                                                                                                                                                                                                                                               |
| S20 | Converted file             | WAV, 48 kHz, 16-bit PCM, channels kept; chunks `fmt `, `gbox` (ours), `smpl`, `data`, in that order, so a header read of 512 bytes finds everything; rounding half away from zero with no dither (Sound)                                                                                                                                                                                                                                                                                                    |
| S21 | Conversion quality         | The builder's choice: a Kaiser-windowed sinc (β 8.6, 32 zero crossings a side, cutoff 0.95 of the lower Nyquist), from a table of 256 phases per zero crossing with linear interpolation; input positions in exact integer arithmetic. The tests in Task 4 are the bar                                                                                                                                                                                                                                      |
| S22 | Reading a dropped file     | Its chunks up to the `data` chunk's header must lie in its first 64 KB, which covers real WAV files; otherwise it can't be read                                                                                                                                                                                                                                                                                                                                                                             |
| S23 | The Dev page               | SETTINGS page 2, "Dev", header "Settings Dev": one item, "Library", with the meter's text and bar (Look). Not settable: OK, − and + do nothing, the encoders hold nothing and the strip is empty. Note memory joins it with the note store                                                                                                                                                                                                                                                                  |
| S24 | A failed storage delete    | The file stays listed and in RAM (the audio part reads it again from the next preview) and the header says in red "kick.wav not deleted". Any other failed request of a job ends that file as "can't be read" (import) or "not loaded" (start-up)                                                                                                                                                                                                                                                           |
| S25 | Persistent storage         | The shell asks the browser to keep the site's storage at the "Click to start" gesture and shows nothing either way (Foundation: the only safeguard; it says nothing about a refusal)                                                                                                                                                                                                                                                                                                                        |
| S26 | Drop counting              | The worker numbers dropped files from 1 at every start, never reusing a number while it runs; `tmp/<k>/` holds the k-th file at its path relative to the drop. A drop with no .wav sends nothing                                                                                                                                                                                                                                                                                                            |

### Overview open points this plan settles

Task 1 removes or narrows these in the overview's "Open points for planning" and writes each answer
into the spec it belongs to:

- Saving and storage: "Storage reserve" (answer 9), "Folder requests" (answer 12), "A dropped file"
  (answer 11).
- Inside the core: "Storage replies in the session log" (answer 2); "Fixed table sizes" keeps
  projects and queue entries (library files: answer 4; folders: S19); "What the audio part reports"
  keeps the playhead and the browser wake-up ("sample let go": S11).
- Look's header example and the Project model's "LIBRARY FULL. KICK.WAV NOT IMPORTED" take S18's
  wording.

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Float functions come
  from `libm`; no fused multiply-add; no logic depends on pointer size. Code under the `harness`
  feature and `cfg(test)` may use `std`.
- 48 kHz; the core's own 32-sample chunks; every message applies at the first chunk start at or
  after its sample; the output does not depend on the host's batch size.
- Working memory stays within `budget.toml`'s 2 MB (answer 4), checked when the core builds; sample
  RAM is separate. If the device outgrows it, report the size and stop: the budget is the owner's.
- The audio part never waits, never touches storage and only reads blocks of files it was told
  about; the control part never writes a block or a table entry the audio part may read.
- Look's rules as before (monogram, 13 px rows, items 17 px, the cursor 1 px outside, mixed case,
  scrolling under the cursor and "…" elsewhere). Colours are the palette's named entries.
- GPL-3.0-or-later; the BLAKE3 code is CC0-1.0 OR Apache-2.0, both GPL-compatible.
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

1. **A block reused too early.** Deleting a file while it previews, then importing at once, must
   never hand the new file a block the audio part still reads. Pinned in Task 12
   (`blocks_are_reused_only_after_the_audio_part_let_go`).
2. **Drops that overlap.** A drop during an import must join it in order, and a drop during the
   start-up load must wait for the project. Pinned in Task 9 (`a_drop_during_an_import_joins_it`,
   `a_drop_during_loading_waits_for_the_project`).
3. **The last block.** A file that exactly fills the free blocks imports; one more byte is refused
   as library full, and so is the 4,097th file. Pinned in Task 9
   (`a_file_that_fills_the_last_block_imports_and_one_byte_more_is_refused`,
   `the_4097th_file_is_refused`).
4. **Late replies.** A recorded session whose reply arrived several batches late must replay to the
   same frames and files in both builds, and an import must not depend on the batch size. Pinned in
   Task 13 (`recorded_replies_replay_at_their_samples`) and Task 15 (the `library-import` scene in
   both builds).
5. **Case and re-drops.** `KICK.wav` with other audio next to `kick.wav` becomes `KICK-2.wav`; the
   same file dropped twice writes nothing the second time. Pinned in Task 9
   (`different_audio_under_a_name_differing_in_case_gets_dash_2`,
   `an_identical_redrop_writes_nothing_and_counts_as_imported`).

## Not in this plan

- **Plan 2 (sample sounds):** the sample engine, the Sample page and its waveform, NEW SAMPLE, the
  sample picker (it reuses SAMPLES' rows, order, folder line and preview rules), the Engine item,
  sample names on sounds, MISSING, "2 sounds use it" in the delete question and voices that fade
  when their file is deleted. The worst-case scene's preview comes here (Task 15).
- **Plan 3:** POOL and REMOVE UNUSED, a sound selected on POOL.
- **Milestone 3:** STOP (and silencing the preview with STOP while stopped), the master level.
- **Milestone 5:** projects on storage, settings, the `groovebox` marker, rename and `.prev`, copy.

## Shared formats

### `budget.toml`

```toml
working_memory = 2_097_152   # answer 4
pool_sounds = 1_024
voices = 32
worst_batch_operations = …   # unchanged unless Task 15 must raise it (the owner's number)
sample_ram = 64_000_000       # S1
library_files = 4_096         # answer 4
library_folders = 1_024       # S19
storage_reserve = 9_000_000   # answer 9
io_buffer = 65_536
```

### Storage requests and replies (`storage.rs`)

```rust
pub type Path = Label<255>;                       // relative to the storage's root: "samples/drums/kick.wav", "tmp"
pub enum Memory { Io, SampleRam }                 // where data goes to or comes from
pub enum Request {
    List { folder: Path, from: u32 },             // every file under `folder` at any depth, sorted by path bytes, from entry `from`
    Read { file: Path, at: u64, length: u32 },    // into Io from 0
    Load { file: Path, at: u64, length: u32, into: u32 }, // into sample RAM at byte `into`
    Begin { file: Path },                         // starts replacing `file`, making its folders
    Append { from: Memory, offset: u32, length: u32 },
    Commit,                                       // swaps the new file in; without it the old one stays
    Delete { path: Path },                        // a file, or a folder with everything in it; then the folders left empty, never `samples` or `tmp`
    Free,
}
pub enum Status { Done, More, Missing, Full, Failed }
pub struct Reply { pub number: u32, pub status: Status, pub value: u64 }
```

- `value`: List, the entries written (`More` when entries remain); Read and Load, the bytes read;
  Free, the free bytes; otherwise 0.
- List records in Io, one after another: path length (`u8`), the path relative to `folder`, the
  file's size (`u32` little-endian). A page holds as many whole records as fit.
- Requests are numbered from 0. At most one is out; the next comes only after its reply.
- **The browser's request record** (`control_take_request` fills it; little-endian, `repr(C)`):
  `number u32, kind u32 (0 List … 7 Free in the order above), memory u32 (0 Io, 1 SampleRam), offset u32, length u32, from u32, into u32, at u64, path_length u32, path [u8; 255]`.

### Inputs and messages

- `Input::Dropped { files: u16 }`: wire kind 10, `a` = files from 1 to 65,535. Scene and session
  word: `dropped <n>`.
- `MessageKind::Preview { file: FileId, slice: u32, frames: u32, stereo: bool }`,
  `MessageKind::StopPreview`, `MessageKind::ForgetSample { file: FileId }`,
  `MessageKind::UseTable { version: u8 }`. `FileId(pub u16)` is the file's place in the library's
  table, reused only after the file's `ForgetSample` applied.
- `MAX_MESSAGES_PER_EVENT` stays 1.

### Scene lines (the scene grammar stays version 1; these are new)

```
storage <bytes>                                   the harness storage's size; default 1,000,000,000
file <path> <source>                              the storage holds this file at the start
drop <sample> <path> <source>                     at <sample> the platform writes tmp/<k>/<path>, k counting dropped files from 1
input <sample> dropped <n>
reply <number> <sample> <status> [<value>]        a recorded reply: queued at <sample> with this status and value
<source>: base64 <data> | sine <hz> <seconds> <rate> <bits> <channels>   (bits 16, 24, 32 or 32f)
```

A scene without `reply` lines gets the harness storage's replies, each stamped at the `until` of the
step after which its request appeared. A recorded `reply` takes its status and value from the line
and its data from the harness storage. The `.fingerprints` file gains `storage <hex>`: a fingerprint
of every file's path and bytes at the end, in path order.

### The converted WAV

`RIFF`, `WAVE`; `fmt ` (16 bytes: PCM 1, channels, 48,000, byte rate, block align, 16); `gbox`
(format 1 `u8`, 0 `u8`, the fingerprint 16 bytes, the original name's length `u8` and its bytes, a
pad byte when odd); `smpl` (36 bytes plus one loop of 24 when there is one; unity note the root; the
loop forward, ends inclusive); `data`. The fingerprint: BLAKE3 of the channel count byte followed by
the audio's little-endian `i16`s, cut to its first 16 bytes (Project model).

## File structure

**`packages/groovebox-core/`:**

- `budget.toml`: modify (above).
- `crates/groovebox-core/`:
  - `Cargo.toml`: modify (feature `harness`).
  - `src/blake3.rs`, `src/sample_ram.rs`, `src/storage.rs`, `src/memory_storage.rs` (feature
    `harness` or tests): create.
  - `src/library/mod.rs`, `wav.rs`, `convert.rs`, `name.rs`, `startup.rs`, `import.rs`: create.
  - `src/audio/preview.rs`: create. `src/audio/mod.rs`: modify.
  - `src/control/samples.rs`, `src/control/tests/library.rs`, `src/ui/question.rs`: create.
  - `src/control/mod.rs`, `view.rs`, `pages.rs`, `draw.rs`, `tests.rs`, `src/ui/list.rs`,
    `src/device.rs`, `src/input.rs`, `src/message.rs`, `src/lib.rs`: modify.
- `crates/groovebox-browser/`: `src/lib.rs`, `build.rs`: modify.
- `crates/groovebox-drift/`: `Cargo.toml` (enables `harness`), `src/runner.rs`, `native.rs`,
  `wasm.rs`, `scene.rs`, `play.rs`, `tests/drift.rs`, `tests/operations.rs`: modify.
- `scenes/`: create `library-startup`, `library-import`, `library-full`, `library-too-big`,
  `samples-screen`, `samples-delete`, `preview-voices`, `browser-library`; modify `worst-case`.

**`apps/groovebox/`:** `source/shell/storage.ts`, `source/shell/drop.ts`: create;
`control.worker.ts`, `protocol.ts`, `session.ts`, `shell.ts`, `startAudio.ts`,
`source/gallery/states.ts`: modify; tests beside them.

**Repo root:** `.changeset/groovebox-library.md`: create. The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: the overview, Foundation, Sound, Workflow A, Project model
  and Look.

**What each spec gains:**

- **Overview:** "How part 1 is designed" names Milestone 2's three plans (answer 1); "Open points
  for planning" as listed above.
- **Foundation:** "Budget profile": working memory 2 MB, 4,096 library files, 1,024 folders, the 9
  MB storage reserve. "Storage": the folder rules of answer 12. "Testing and drift": a saved session
  carries its files and reply moments (answer 2).
- **Sound:** "Voices": the preview plays when you move onto a file and stops when you leave (answers
  5 and 13). "Sample import": S18's wording, answer 10.
- **Workflow A:** "The sample picker": answers 5, 7, 8 and 13 as the rules the picker shares with
  SAMPLES.
- **Project model:** "Where things live": answers 6, 7, 8, 12; "Saving": the 9 MB reserve; "The
  library": answers 10 and 11, S14, S16 and S19; "Sample files": S15.
- **Look:** "The header" example and "The browser shell, Files": S18. "The other screens, SAMPLES":
  answer 7 and S5.

- [ ] **Step 1: Edit the six specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the library decisions in the groovebox specs"`

---

### Task 2: BLAKE3 and the sample fingerprint

**Files:**

- Create: `src/blake3.rs` in `crates/groovebox-core/`. Modify: `src/lib.rs`,
  `packages/groovebox-core/README.md` (a "Third-party code" note).

**Interfaces:**

- `blake3.rs` is `reference_impl/reference_impl.rs` from https://github.com/BLAKE3-team/BLAKE3 at
  the latest release tag, unchanged except for formatting and lint allowances, under a header
  comment naming the source, the tag and `SPDX-License-Identifier: CC0-1.0 OR Apache-2.0`. Its
  `Hasher` with `new`, `update` and `finalize(&self, out: &mut [u8])` is the interface.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn the_published_vectors_hash_as_published() {
    // input byte i is i % 251; lengths 0, 1, 1_024, 1_025 and 102_400; expected: the first 32 bytes of
    // "hash" for those lengths in test_vectors/test_vectors.json at the same tag, copied as hex
}
#[test] fn updates_in_pieces_hash_as_one() { /* 102_400 bytes in pieces of 1_000: equal to one update */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib blake3`. Expected: FAIL to compile.

- [ ] **Step 3: Copy the reference implementation and its notes**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib blake3`, then
  `cargo build -p groovebox-core --release --target thumbv7em-none-eabihf`. Expected: PASS; builds.

- [ ] **Step 5: Commit**

  `git commit -m "Copy the BLAKE3 reference implementation into the groovebox core"`

---

### Task 3: Reading and writing WAV files

**Files:**

- Create: `src/library/mod.rs` (modules only for now), `src/library/wav.rs`. Modify: `src/lib.rs`,
  `Cargo.toml` (feature `harness = []`).

**Interfaces:**

- `pub enum Encoding { Int16, Int24, Int32, Float32 }`;
  `pub struct Format { pub channels: u8, pub rate: u32, pub encoding: Encoding }`.
- `pub struct Ours { pub fingerprint: [u8; 16], pub original: Label<255> }`.
- `pub struct Header { pub format: Format, pub data_at: u64, pub frames: u32, pub root: Option<u8>, pub loop_points: Option<(u32, u32)>, pub ours: Option<Ours> }`.
- `pub fn parse(start: &[u8], file_bytes: u64) -> Option<Header>`: `start` is the file's first bytes
  (up to 64 KB, S22). PCM 16, 24 and 32, float 32 and `WAVE_FORMAT_EXTENSIBLE` of either; one or two
  channels; 1,000 to 384,000 Hz; at least one whole frame. A `data` chunk longer than the file is
  cut to the file's whole frames. `None` is "can't be read".
- `pub fn decode(encoding: Encoding, bytes: &[u8], out: &mut [f32])`: integers over 2^(bits−1);
  floats as they are, not-finite as 0.
- `pub fn write_header(out: &mut [u8], channels: u8, frames: u32, root: u8, loop_points: Option<(u32, u32)>, ours: &Ours) -> usize`
  ("The converted WAV"); returns the bytes written, at most 512.
- `pub fn root_from_name(name: &str) -> Option<u8>`: the last of the name's parts split at space,
  `_`, `-` and `.` that reads as a note: A to G in either case, then `#` or `b` or nothing, then an
  octave 0 to 9; C4 is 60; only 0 to 127.
- `#[cfg(any(test, feature = "harness"))] pub fn sine(hz: f32, seconds: f32, rate: u32, encoding: Encoding, channels: u8) -> std::vec::Vec<u8>`:
  a whole WAV file; the scene generator.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn every_accepted_format_parses() { /* sine() of each Encoding in mono and stereo at 44_100: format and frames as made */ }
#[test] fn extensible_reads_as_its_subformat() { /* fmt with tag 0xFFFE and the PCM and float GUIDs */ }
#[test] fn smpl_gives_the_root_and_the_first_loop() { /* unity note 36, loops 1_000..=1_999 and 5..=9: root Some(36), loop_points Some((1_000, 1_999)) */ }
#[test] fn what_the_device_cannot_read_is_none() { /* 8-bit; 3 channels; ADPCM tag 2; no data chunk; zero frames; fmt after 64 KB */ }
#[test] fn a_data_chunk_longer_than_the_file_is_cut_to_whole_frames() {}
#[test] fn decode_scales_to_plus_minus_one() { /* i16 -32_768 → -1.0; 24-bit 0x7F_FFFF → 8_388_607 / 8_388_608; f32 NaN → 0.0 */ }
#[test] fn the_root_comes_from_the_end_of_the_name() { /* "Bass_C2" 36; "pad A#3" 58; "Lead Db4" 61; "C4 loop 2" 60; "G9" 127; "G#9" None; "kick" None */ }
#[test] fn our_header_reads_back() { /* write_header then parse: 48_000 Int16, frames, root, loop, ours equal; at most 512 bytes */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib library::wav`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `wav.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib library::wav`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Read and write WAV files in the groovebox core"`

---

### Task 4: Converting to 48 kHz and 16 bits

**Files:**

- Create: `src/library/convert.rs`.

**Interfaces:**

- `pub fn output_frames(input_frames: u64, rate: u32) -> u64`: `ceil(input × 48,000 / rate)`.
- `pub fn to_i16(x: f32) -> i16`: `x × 32,768` rounded half away from zero (`libm::roundf`), held
  within −32,768 and 32,767.
- `pub struct Converter`: `pub fn new(rate: u32, channels: u8) -> Self` builds the kernel table of
  S21 unless the rate is 48,000; `pub fn push(&mut self, input: &[f32], out: &mut impl FnMut(i16))`
  takes interleaved frames and gives interleaved output as soon as it is known;
  `pub fn finish(&mut self, out: &mut impl FnMut(i16))` gives the rest, so the total is
  `output_frames`. At 48 kHz it only rounds. Output frame `n` sits at input position
  `n × rate / 48,000`, computed in `u64` integers, never by adding steps.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn 48_khz_16_bit_passes_bit_exact() { /* decode then convert then to_i16 gives the input's samples */ }
#[test] fn the_length_rounds_up() { /* output_frames(44_100, 44_100) == 48_000; (10, 44_100) == 11; (1, 96_000) == 1 */ }
#[test] fn a_44_1_khz_sine_keeps_its_pitch_and_stays_clean() { /* 1 kHz for 1 s: 1_000 ± 1 upward zero crossings; after removing the best-fitting 1 kHz sine the rest is below -80 dB */ }
#[test] fn a_tone_above_24_khz_is_removed() { /* 30 kHz at 96 kHz: output RMS below -80 dB full scale */ }
#[test] fn pieces_give_what_one_push_gives() { /* 44.1 kHz stereo pushed in pieces of 1, 17 and 4_096 frames: identical output */ }
#[test] fn rounding_is_half_away_from_zero_and_loud_floats_clip() { /* to_i16(1.5) == 32_767; to_i16(-1.0) == -32_768; to_i16(0.5 / 32_768.0) == 1; to_i16(-0.5 / 32_768.0) == -1 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib library::convert`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `convert.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib library::convert --release` (the sine tests are slow in
  debug). Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Convert groovebox samples to 48 kHz and 16 bits"`

---

### Task 5: Names, order and numbers

**Files:**

- Create: `src/library/name.rs`.

**Interfaces:**

- `pub fn file_name(original: &str) -> Label<64>` and
  `pub fn folder_name(original: &str) -> Label<32>` (S15); a letter is one `font` has a glyph for.
- `pub fn same(a: &str, b: &str) -> bool`: equal ignoring case (`char::to_lowercase`).
- `pub fn numbered(name: &str, number: u32) -> Label<64>`: "kick.wav", 2 → "kick-2.wav", the base
  cut so it fits.
- `pub fn order(a: &str, b: &str) -> Ordering`: by a key of lowercase letters with Latin accents
  folded to their plain letter (a table over Latin-1 Supplement and Latin Extended-A), then by
  bytes.
- `pub fn length(frames: u32) -> Label<16>`, `pub fn size(bytes: u64) -> Label<16>`,
  `pub fn meter(used: u64, total: u64) -> Label<24>` (S3, S4).

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn names_keep_letters_digits_and_four_marks() { /* "Kick #1 (dry).WAV" → "Kick 1 dry.WAV"; "  Říkanka.wav " → "Říkanka.wav"; "漢字.wav" → "sample.wav" */ }
#[test] fn long_names_are_cut_at_a_character_boundary_keeping_dot_wav() { /* 70 × "ž" + ".wav": 64 bytes or fewer, ends ".wav", valid UTF-8; a 40-byte folder name → 32 bytes or fewer */ }
#[test] fn case_does_not_make_a_new_name() { /* same("Kick.wav", "KICK.WAV") */ }
#[test] fn the_second_kick_is_kick_2() { /* numbered("kick.wav", 2) == "kick-2.wav"; a 64-byte name stays 64 bytes */ }
#[test] fn names_sort_ignoring_case_and_accents() {
    // ["rim.wav", "hat-closed.wav", "říkanka.wav", "Clap.wav", "déšť.wav"] sorted:
    // ["Clap.wav", "déšť.wav", "hat-closed.wav", "říkanka.wav", "rim.wav"]
}
#[test] fn lengths_read_as_on_the_picker() { /* 19_200 "0.4 s"; 672_000 "14.0 s"; 2_878_080 "1:00"; 15_840_000 "5:30" */ }
#[test] fn sizes_read_as_on_the_picker() { /* 38_400 "38 KB"; 999_499 "999 KB"; 999_500 "1.0 MB"; 31_700_000 "31.7 MB" */ }
#[test] fn the_meter_reads_tenths_of_64_mb() { /* meter(41_200_000, 64_000_000) "41.2 of 64 MB"; meter(0, 64_000_000) "0.0 of 64 MB" */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib library::name`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `name.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib library::name`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Name, order and measure groovebox library files"`

---

### Task 6: Sample RAM, blocks and the block table

**Files:**

- Create: `src/sample_ram.rs`. Modify: `budget.toml` (the whole list above except
  `worst_batch_operations`), `src/device.rs`, `src/message.rs`, `src/audio/mod.rs`, `src/lib.rs` in
  `crates/groovebox-core/`; `crates/groovebox-browser/src/lib.rs` and `build.rs`;
  `crates/groovebox-drift/src/native.rs`.

**Interfaces:**

- `pub const BLOCK: usize = 2_048; pub const BLOCKS: usize = budget::SAMPLE_RAM / BLOCK;` with a
  build check that it divides.
- `pub struct SampleRam` (`Sync`): `pub const fn new() -> Self` (zeroed);
  `#[cfg(any(test, feature = "harness"))] pub fn boxed() -> Box<Self>` (zeroed on the heap);
  `pub unsafe fn bytes(&self, offset: u32, length: u32) -> &mut [u8]`, whose contract is that only
  the side that owns those blocks touches them (S11, Global Constraints).
- `pub struct Blocks` (control side): which blocks are free; `pub fn free(&self) -> usize`;
  `pub fn take(&mut self, count: usize) -> Option<...>` gives the lowest free blocks;
  `pub fn give_back(&mut self, block: u32)`.
- `pub struct Tables`: two tables of `[u32; BLOCKS]`, kept in `Device` (working memory). The control
  side appends a file's blocks as a slice after the last slice of the table the audio part uses;
  when they do not fit there it writes every live slice, packed, and the new one into the other
  table, and its caller sends `UseTable`; neither table is written again until that message's
  applied report. `pub fn blocks_for(frames: u32, channels: u8) -> usize`.
- **`message.rs`:** `MessageKind::UseTable { version: u8 }`; `Audio` reads blocks through the table
  it names from that chunk on.
- `pub struct Reader<'a>` (audio side):
  `pub fn frame(&self, slice: u32, stereo: bool, frame: u32) -> (i16, i16)` (mono gives the sample
  twice).
- `Device`: `pub unsafe fn control_side<'a>(&'a self, ram: &'a SampleRam) -> ControlSide<'a>` and
  the same for `audio_side`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_file_takes_whole_blocks() { /* blocks_for(1, 1) 1; (1_024, 1) 1; (1_025, 1) 2; (512, 2) 1; (513, 2) 2 */ }
#[test] fn blocks_are_taken_lowest_first_and_given_back() {}
#[test] fn a_reader_finds_every_frame_across_scattered_blocks() { /* a mono and a stereo file written into blocks 5, 2 and 9: every frame reads back in order */ }
#[test] fn a_full_table_packs_into_the_other_one() { /* three files, the middle one forgotten, then one that does not fit after the last slice: the other table holds files 1 and 3 packed, then the new one; all read the same frames */ }
#[test] fn the_audio_part_switches_tables_at_the_chunk_of_use_table() {}
#[test] fn the_device_fits_the_working_memory() { /* size_of::<Device>() <= budget::WORKING_MEMORY, printed */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib sample_ram`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `sample_ram.rs`, the budget entries and the sides' new argument**

  Every caller of `control_side` and `audio_side` passes a `SampleRam`: the browser crate a
  `static SAMPLE_RAM: SampleRam`, the native runner a `SampleRam::boxed()` it owns, the tests one
  each. The browser crate's `build.rs` sizes the memory as
  `WORKING_MEMORY + SAMPLE_RAM + OTHER_MEMORY`, rounded up to 65,536.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`,
  `cargo build -p groovebox-core --release --target thumbv7em-none-eabihf` and
  `node build.js && node build.js --fallback`. Expected: PASS; both `.wasm` files build.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox sample RAM in blocks"`

---

### Task 7: The storage interface

**Files:**

- Create: `src/storage.rs`, `src/memory_storage.rs`. Modify: `src/control/mod.rs`, `src/device.rs`,
  `src/lib.rs`.

**Interfaces:**

- **Consumes:** Task 6's `SampleRam`.
- **`storage.rs`:** "Storage requests and replies".
- **`Control`:** `pub fn take_request(&mut self) -> Option<(u32, Request)>` gives each request once;
  `pub fn queue_reply(&mut self, sample: u64, reply: Reply) -> Result<(), Reply>` (a ring of 8).
  `step` takes replies and inputs in sample order, a reply first on equal samples, under the same
  room rule for messages. `pub fn applied(&mut self, number: u32, sample: u64)`: the control part
  keeps the reports of the messages it waits for (`ForgetSample`, `UseTable`) as events at their
  sample.
- **`Device`:** an I/O buffer of `IO_BUFFER` bytes; `ControlSide::take_request`,
  `ControlSide::queue_reply`, `ControlSide::io(&mut self) -> &mut [u8]` and `Device::io_pointer()`.
  `ControlSide::step` takes every report off the queue first, gives each to `Control::applied`, then
  steps; `take_report` gives the host the same reports as before.
- **`memory_storage.rs`** (`harness` or tests, with `std`): `pub struct MemoryStorage` (paths to
  bytes, a size) with `pub fn new(size: u64)`, `pub fn put(&mut self, path: &str, bytes: Vec<u8>)`,
  `pub fn files(&self) -> &BTreeMap<String, Vec<u8>>` and
  `pub fn carry_out(&mut self, request: &Request, io: &mut [u8], ram: &SampleRam) -> Reply`, every
  request as "Storage requests and replies" says; `Full` when a commit would pass the size.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_request_is_given_once_and_the_next_waits_for_its_reply() {}
#[test] fn a_reply_goes_before_an_input_of_the_same_sample() {}
#[test] fn the_control_part_hears_when_its_awaited_message_applied() { /* the report reaches Control as an event at the report's sample, not earlier */ }
// memory_storage.rs
#[test] fn lists_every_file_under_a_folder_in_pages() { /* 3 files, an Io too small for 2 records: Done is 1 record and More, then from 1 */ }
#[test] fn a_replace_is_all_or_nothing() { /* Begin, Append, no Commit: the old bytes; after Commit the new ones; folders made */ }
#[test] fn delete_takes_the_folders_it_empties_but_never_samples_or_tmp() {}
#[test] fn free_is_the_size_less_the_files() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib storage memory_storage control`. Expected: FAIL to
  compile.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox storage requests and replies"`

---

### Task 8: Start-up and the library list

**Files:**

- Create: `src/library/startup.rs`, `src/control/tests/library.rs`. Modify: `src/library/mod.rs`,
  `src/control/mod.rs`, `src/control/pages.rs`, `src/control/draw.rs`, `src/control/tests.rs`.

**Interfaces:**

- **Consumes:** Tasks 3, 5, 6 and 7.
- **`library/mod.rs`:** `pub struct FileId(pub u16)`, `pub struct FolderId(pub u16)`;
  `pub struct File { pub name: Label<64>, pub folder: Option<FolderId>, pub frames: u32, pub channels: u8, pub root: u8, pub loop_points: Option<(u32, u32)>, pub fingerprint: [u8; 16], pub slice: u32, pub loaded: bool }`;
  `pub struct Library` (in `Control`) with its files (`LIBRARY_FILES`), folders (`LIBRARY_FOLDERS`,
  each a name and a parent), `Blocks` and the control side of `Tables`;
  `pub fn entries(&self, folder: Option<FolderId>) -> impl Iterator<Item = Entry>` in answer 8's
  order (`pub enum Entry { Folder(FolderId), File(FileId) }`); `pub fn used(&self) -> u64` (blocks ×
  `BLOCK`); `pub fn path(&self, file: FileId) -> Path`.
- **`startup.rs`:** the job of S13 and S14: `Delete tmp`; `List samples` page by page; per file in
  load order `Read` 512 bytes, `parse`, `Load` the audio into newly taken blocks; then the project
  opens. A file whose header has no `gbox` chunk, or any failed request, leaves it not loaded.
- **`Control`:** opens the project when the job ends. Before that it draws the header with "Loading
  library" and nothing else, and drops every input but the volume encoder.
- **`pages.rs`:** SETTINGS gains page 2,
  `PageDef { name: "Dev", items: &[ItemDef { kind: ItemKind::LibraryMeter, encoder: None }], picture: None }`;
  `ItemKind::LibraryMeter` reads "Library", the meter text and its bar (S23).
- **`control/tests.rs`:** `Rig::new` runs the start-up against an empty `MemoryStorage` (step, carry
  out, reply at sample 0, until the project opens), so every existing test starts on an open
  project. `control/tests/library.rs` adds `Rig::with_files(&[(&str, Vec<u8>)])` and
  `Rig::serve(&mut self, sample: u64)` (carries out the request that is out and replies at
  `sample`).

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn start_up_empties_tmp_then_loads_every_file_in_order() {
    // samples/zap.wav, samples/Bass.wav, samples/drums/clap.wav, samples/drums/808/kick.wav (converted files):
    // requests Delete "tmp", List "samples", then Read and Load for drums/808/kick, drums/clap, Bass, zap
}
#[test] fn loading_library_shows_until_the_project_opens() { /* header "Loading library" in ACCENT; then no message */ }
#[test] fn before_the_project_opens_only_the_volume_acts() { /* MENU + 3 and a pad hit change nothing and send nothing; a volume turn sends SetParam */ }
#[test] fn a_library_bigger_than_the_ram_loads_in_order_as_far_as_it_fits() { /* two 40 MB files: the first loaded, the second not; "Library too big. 1 file not loaded" in RECORD */ }
#[test] fn a_file_that_is_not_ours_is_not_loaded() { /* a plain 44.1 kHz WAV in samples/: "1 file not loaded"; listed, not loaded */ }
#[test] fn the_dev_page_shows_the_library_meter() { /* Bass.wav (1 s mono) loaded; PAGE + 2 on SETTINGS: header "Settings Dev"; item "Library" "0.1 of 64 MB"; strip empty; OK, − and + send nothing */ }
#[test] fn the_meter_counts_whole_blocks() { /* one mono file of 1_025 frames: used() == 4_096 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, the existing tests included.

- [ ] **Step 5: Commit**

  `git commit -m "Load the groovebox library at start-up"`

---

### Task 9: Importing dropped files

**Files:**

- Create: `src/library/import.rs`. Modify: `src/input.rs`, `src/library/mod.rs`,
  `src/control/mod.rs`, `src/control/draw.rs`, `src/control/tests/library.rs`.

**Interfaces:**

- **Consumes:** Tasks 2 to 8.
- **`input.rs`:** `Input::Dropped { files: u16 }` ("Inputs and messages").
- **`import.rs`:** the job, per dropped file `k` in order: `List tmp/<k>` for its path; `Read` the
  first 64 KB and `parse`; the checks of S19 (`Free` for storage); take the blocks; `Read` the rest
  in pieces of whole frames, `decode`, convert and write `i16`s into the blocks while hashing them
  (Task 2) and `finish`; on a name already in the folder compare fingerprints (S16); write the file
  with `Begin`, `Append` of the header from Io and of each run of consecutive blocks from sample
  RAM, `Commit`; add it to the library and its slice to the table; `Delete tmp/<k>`. A refused file
  gives back its blocks and is deleted from `tmp/` too.
- **`Control`:** `Dropped` adds to the files waiting and the header message (S18). The message field
  grows to `Label<128>`; progress messages are not cleared by presses, results are.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_dropped_file_is_converted_written_and_listed() {
    // tmp/1/drums/kick.wav, a 1 s 44.1 kHz 24-bit stereo sine; Dropped { files: 1 }:
    // "Importing kick.wav", then "kick.wav imported" in ACCENT; samples/drums/kick.wav parses as ours, 48_000 frames,
    // its fingerprint that of its audio; the library lists drums/ then kick.wav; tmp/1 is gone
}
#[test] fn loose_files_sit_at_the_top_and_folders_keep_their_subfolders() {}
#[test] fn an_identical_redrop_writes_nothing_and_counts_as_imported() {}
#[test] fn different_audio_under_a_name_differing_in_case_gets_dash_2() { /* kick.wav then KICK.wav with other audio: KICK-2.wav */ }
#[test] fn a_file_that_does_not_fit_is_refused_and_the_ones_after_it_import() { /* "2 files imported, 1 not: library full" in RECORD */ }
#[test] fn a_file_that_fills_the_last_block_imports_and_one_byte_more_is_refused() {}
#[test] fn the_4097th_file_is_refused() {}
#[test] fn storage_full_keeps_the_reserve() { /* storage size so that free − 9_000_000 is below the file: "kick.wav not imported: storage full" */ }
#[test] fn an_unreadable_wav_is_refused_and_reasons_are_listed_in_order() { /* an 8-bit file and a too-big one: "1 file imported, 2 not: library full, can't be read" */ }
#[test] fn the_root_and_loop_come_from_smpl_then_the_name() { /* Bass_C2.wav without smpl: root 36; with smpl unity 40 and a loop 4_410..=8_819 at 44.1 kHz: root 40, loop 4_800..=9_599 */ }
#[test] fn a_drop_during_an_import_joins_it() { /* "Importing 3 files", a second drop of 2: "Importing 5 files"; all five in order */ }
#[test] fn a_drop_during_loading_waits_for_the_project() {}
#[test] fn a_press_does_not_clear_importing_but_clears_the_result() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::library`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Import dropped files into the groovebox library"`

---

### Task 10: The preview player

**Files:**

- Create: `src/audio/preview.rs`. Modify: `src/audio/mod.rs`, `src/message.rs`.

**Interfaces:**

- **Consumes:** Task 6's `Reader` and `Tables`.
- **`message.rs`:** `Preview`, `StopPreview` and `ForgetSample` ("Inputs and messages").
- **`preview.rs`:** `pub struct Preview` with `start`, `stop` (a straight fade to zero within the
  chunk), `forget(file: FileId)` (a stop when it plays that file) and
  `pub fn render(&mut self, reader: &Reader, out: &mut [[f32; CHUNK]; 2])`. The gain is S12's,
  worked out from `LEVEL.default` with the voice's own maths, not a typed number.
- **`Audio`:** applies the three messages and adds the preview to the mix after the voices and
  fades, before the soft clipper.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_preview_plays_the_file_once_at_the_default_sound_level() { /* mono file: each output sample is sample / 32_768 × gain on both channels, then silence */ }
#[test] fn a_stereo_preview_keeps_its_channels() {}
#[test] fn stop_and_forget_fade_within_one_chunk() { /* the chunk's last sample 0.0, then silence */ }
#[test] fn forgetting_another_file_changes_nothing() {}
#[test] fn a_new_preview_fades_the_old_one_out() {}
#[test] fn use_table_switches_at_its_chunk() { /* a preview reads the same frames across the switch */ }
#[test] fn the_preview_takes_no_voice() { /* 32 held synth notes and a preview: still 32 voices held; output = voices alone + preview alone, before the clipper */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL to compile.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox preview player"`

---

### Task 11: The SAMPLES screen

**Files:**

- Create: `src/control/samples.rs`. Modify: `src/control/view.rs`, `src/control/pages.rs`,
  `src/control/mod.rs`, `src/control/draw.rs`, `src/ui/list.rs`, `src/control/tests/library.rs`.

**Interfaces:**

- **Consumes:** Tasks 5, 8 and 10.
- **`view.rs`:** `Screen::Samples` (name "Samples"; `MENU` step 10). `View` gains
  `pub samples: SamplesView { pub folder: Option<FolderId>, pub cursor: Cursor, pub on: Option<Row> }`.
- **`samples.rs`:** `pub enum Row { Up, Folder(FolderId), File(FileId) }`; the rows of a folder
  (`Up` first inside one, then `Library::entries`); the moves of answers 5, 7 and 13 and S6 to S8.
  OK on a folder enters it and on ".." goes up; OK on a file comes with Task 12. Moving onto a
  loaded file sends `Preview`; moving onto anything else, OK, CANCEL and leaving SAMPLES send
  `StopPreview` when a preview was started since the last stop.
- **`ui/list.rs`:** `Row` gains `pub alert: bool` (text and label in `RECORD`); `draw_rows` takes
  the number of rows that fit and the first row's y.
- **Drawing:** the folder line (dim, the folder's path ending in "/") at the first text row inside a
  folder; the rows (S5, scrolling under the cursor); the meter item at y 235, x 2, width 476; the
  strip empty.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn menu_10_lists_the_top_level() { /* drums/ then Bass.wav "1.0 s  96 KB"; meter "Library" "0.1 of 64 MB"; header "Samples T1 1 Pads"; strip empty */ }
#[test] fn inside_a_folder_a_dim_line_names_it_and_dot_dot_comes_first() { /* line "drums/808/" in DIM; rows "..", then files */ }
#[test] fn ok_enters_and_dot_dot_and_cancel_go_up_onto_the_folder_left() {}
#[test] fn the_arrows_and_minus_plus_move_rows_and_stop_at_the_ends() { /* ◀ ▶ move 15 rows at the top, 14 inside a folder */ }
#[test] fn moving_onto_a_file_previews_it_and_landing_does_not() { /* MENU + 10 with the cursor left on Bass.wav: no message; ▲ then ▼ onto Bass.wav: Preview { file, .. } */ }
#[test] fn a_folder_row_ok_cancel_and_leaving_stop_the_preview() { /* MENU + 3 stops it; MENU held alone does not */ }
#[test] fn the_cursor_stays_on_its_file_when_an_import_adds_rows_above() {}
#[test] fn not_loaded_files_are_red_and_play_nothing() {}
#[test] fn the_encoders_hold_nothing_and_page_shows_sixteen_empty_tiles() {}
#[test] fn a_long_name_scrolls_under_the_cursor() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox SAMPLES screen"`

---

### Task 12: Deleting a file

**Files:**

- Create: `src/ui/question.rs`. Modify: `src/control/view.rs`, `src/control/mod.rs`,
  `src/control/samples.rs`, `src/control/draw.rs`, `src/library/mod.rs`, `src/ui/mod.rs`,
  `src/control/tests/library.rs`.

**Interfaces:**

- **Consumes:** Tasks 7, 8, 10 and 11.
- **`view.rs`:** the open picker becomes `pub picker: Option<(Picker, Cursor)>` with
  `pub enum Picker { Sound, Delete(FileId) }` (plan 2 adds the sample picker);
  `pub question: Option<Question>` with `pub enum Question { DeleteFile(FileId) }`.
- **`ui/question.rs`:** `pub fn draw_question(canvas: &mut impl Canvas, lines: &[(&str, Color)])`:
  the box as wide as its widest line plus 8 px and 14 px per line plus 1, centred between `MAIN_TOP`
  and `STRIP_LINE`, filled `BACKGROUND`, outlined `LINE`, each line 4 px inside.
- **The delete job:** a loaded file sends `ForgetSample`, waits for its applied report (Task 7),
  then `Delete`s the file; on `Done` its blocks go back and its entry and emptied folders go (answer
  12, S11). A file not loaded is only deleted from storage. A failure: S24. Then SAMPLES shows the
  nearest folder that still exists, the cursor on the nearest row above.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn ok_on_a_file_opens_the_delete_picker_and_stops_the_preview() { /* one row "Delete"; StopPreview; strip empty; CANCEL back to the list sends no Preview */ }
#[test] fn the_question_names_the_file_and_only_ok_and_cancel_answer_it() {
    // "Delete clap.wav?" in TEXT, "OK deletes, Cancel keeps" in DIM; ▼, −, an encoder turn and MENU + 1 change nothing;
    // a pad sounds and does not select; CANCEL goes back to the list with the cursor on clap.wav
}
#[test] fn ok_deletes_after_the_audio_part_let_go() { /* ForgetSample, then Delete "samples/drums/clap.wav" only after its applied report */ }
#[test] fn blocks_are_reused_only_after_the_audio_part_let_go() { /* a drop imported while the report is pending gets none of clap.wav's blocks */ }
#[test] fn deleting_the_last_file_of_a_folder_shows_the_folder_above() { /* drums/808/kick.wav deleted: SAMPLES in drums/, cursor on the row above where 808/ was */ }
#[test] fn a_not_loaded_file_is_deleted_from_storage_only() {}
#[test] fn the_meter_drops_once_the_blocks_are_free() {}
#[test] fn a_failed_delete_keeps_the_file_and_says_so() { /* Failed: "clap.wav not deleted" in RECORD; still listed */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib` and
  `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

  `git commit -m "Delete groovebox library files after a question"`

---

### Task 13: Storage in the drift harness and the browser export

**Files:**

- Modify: `crates/groovebox-browser/src/lib.rs`; in `crates/groovebox-drift/`: `Cargo.toml`
  (`groovebox-core` with feature `harness`), `src/runner.rs`, `src/native.rs`, `src/wasm.rs`,
  `src/scene.rs`, `src/play.rs`, `tests/drift.rs`.

**Interfaces:**

- **Browser export:** `control_take_request() -> u32` (1 when it filled the request record, else 0),
  `request_pointer() -> u32`,
  `control_queue_reply(sample: u64, number: u32, status: u32, value: u64) -> u32` (1 queued, 0
  full), `io_pointer() -> u32`, `sample_ram_pointer() -> u32`. Status codes in `Status` order.
- **`Runner`:** gains `fn take_request(&mut self) -> Option<(u32, Request)>`,
  `fn queue_reply(&mut self, sample: u64, reply: Reply) -> bool` and
  `fn carry_out(&mut self, storage: &mut MemoryStorage, request: &Request) -> Reply`, which lets the
  storage read and write the runner's I/O buffer and sample RAM. `WasmRunner` decodes the request
  record and copies bytes in and out of the module's memory.
- **`scene.rs`:** the new lines ("Scene lines").
- **`play.rs`:** a `MemoryStorage` seeded from `storage` and `file` lines; `drop` lines write into
  it at their sample, before the inputs of that sample are queued; after every step it carries out
  the request that is out and queues the reply as "Scene lines" says. `Outcome` gains
  `storage: u64`; `tests/drift.rs` reads and writes the `storage` fingerprint line. The player's
  unit tests start their inputs after the start-up (`SYN_1` from sample 1,024).

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_scene_with_files_loads_them_at_start_up() { /* file lines: the library holds them; the project opens after */ }
#[test] fn drop_lines_put_files_in_tmp_and_the_input_imports_them() {}
#[test] fn recorded_replies_replay_at_their_samples() { /* a reply line 2_048 samples late: the project opens later; native and wasm outcomes equal */ }
#[test] fn the_wasm_build_gives_the_same_requests() { /* the same scene: identical (number, Request) sequences from both runners */ }
#[test] fn generated_files_are_the_same_bytes_everywhere() { /* sine 440 0.5 44100 24 2 parsed twice: equal bytes */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-drift --lib`.
  Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-drift`. Expected: PASS. The existing scenes keep every `audio`,
  `frame`, `lights` and `applied` line; any change is a bug.

- [ ] **Step 5: Commit**

  `git commit -m "Give the groovebox drift harness a storage"`

---

### Task 14: The browser's storage, drops and sessions

**Files:**

- Create: `apps/groovebox/source/shell/storage.ts`, `source/shell/drop.ts`, `tests/storage.test.ts`,
  `tests/storage.browser.test.ts`, `tests/drop.test.ts`.
- Modify: `source/shell/control.worker.ts`, `protocol.ts`, `session.ts`, `shell.ts`,
  `startAudio.ts`; `tests/session.test.ts`, `tests/protocol.test.ts`.

**Interfaces:**

- **`storage.ts`:** `readRequest(memory: ArrayBufferLike, address: number): StorageRequest` (the
  request record) and
  `carryOut(request: StorageRequest, root: FileSystemDirectoryHandle, memory: ArrayBufferLike, addresses: {io: number; sampleRam: number}): Promise<StorageReply>`.
  List walks the folder recursively and sorts paths by their UTF-8 bytes; Read and Load copy a slice
  of `getFile()` into shared memory; Begin opens `createWritable()`, Append writes a copy of the
  bytes, Commit closes it; Delete uses `removeEntry` (recursive for a folder), then removes the
  emptied parents below `samples` and `tmp`; Free is `estimate()`'s quota less its usage; a
  `QuotaExceededError` is `Full`, a missing entry `Missing`, anything else `Failed`.
- **`drop.ts`:**
  `droppedFiles(items: DataTransferItemList): Promise<Array<{path: string; file: File}>>` (answer
  10: `.wav` in any case, names not starting with "."; the items in their order, a folder's entries
  sorted by name).
- **The worker:** after every `control_step` it takes a request and carries it out without stopping
  the loop; when done it queues the reply stamped with the audio position then, and logs it. A
  `drop` message from the page writes `tmp/<k>/<path>` for each file, logs it and queues
  `dropped <n>` at the audio position.
- **`session.ts`:** `reply`, `drop` and `file` lines and the `dropped` input word. The worker keeps
  a copy of every file it reads that the session has not written, the first time it reads it, and
  writes them as `file … base64` lines at the top on save (answer 2).
- **`shell.ts`:** `dragover` and `drop` on the page; **`startAudio.ts`:**
  `navigator.storage.persist()` at the "Click to start" gesture (S25).

- [ ] **Step 1: Write the failing tests**

```ts
test('readRequest decodes every field of the record', …);           // a record written by hand: each kind
test('SessionLog writes reply, drop, file and dropped lines', …);
test('droppedFiles keeps .wav in any case and skips hidden and other files', …);
test('droppedFiles walks folders in name order and keeps their paths', …);
// storage.browser.test.ts (Chromium, a fresh OPFS folder per test)
test('a replace without commit leaves the old file', …);
test('list pages are sorted by path and continue from their index', …);
test('delete removes the folders it empties but not samples', …);
test('load copies a slice straight into shared memory', …);
```

- [ ] **Step 2: Run them to verify they fail**

  Run:
  `npx vitest run tests/storage.test.ts tests/session.test.ts tests/drop.test.ts tests/storage.browser.test.ts`
  in `apps/groovebox`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run the same tests, `npx eslint <changed files>` and `npm run typecheck`. Expected: PASS, 0
  errors.

- [ ] **Step 5: Check it by hand**

  `npm run develop` in `apps/groovebox`: drop a folder holding a 44.1 kHz WAV, a readme and an 8-bit
  WAV; the header shows "1 file imported, 1 not: can't be read"; reload the page; MENU + 10 lists
  the file; ▼ plays it. Stop the server and check its port is free (`netstat -ano`), killing the
  `node.exe` that still listens.

- [ ] **Step 6: Commit**

  `git commit -m "Carry out groovebox storage in the browser and take dropped files"`

---

### Task 15: Scenes, gallery and the operation count

**Files:**

- Create: the seven new scenes of "File structure" except `browser-library`. Modify:
  `scenes/worst-case.scene`, `apps/groovebox/source/gallery/states.ts`, and `budget.toml` only if
  the owner approves (below).

**The scenes**, driven by the panel and drops only:

- **`library-startup`:** `file` lines for drums/808/kick.wav, drums/clap.wav, Bass.wav and zap.wav
  (made by converting `sine` sources once and pasting them as `base64`); MENU + 10; frames of the
  top level, inside drums/ and inside 808/, with moves that preview.
- **`library-import`:** a drop of a folder (24-bit 44.1 kHz stereo, 32f 96 kHz mono, a nested
  folder), then a drop with an 8-bit file, a same-name identical file and `KICK.wav` with other
  audio; frames of "Importing 3 files" and each result.
- **`library-full`:** a 63.9 MB file at start (48 kHz, so no conversion), then a drop of a 1 MB
  file: refused, the library unchanged; a `storage` size that refuses the next drop as storage full.
- **`library-too-big`:** two 40 MB files at start: "Library too big. 1 file not loaded"; SAMPLES
  shows the red row.
- **`samples-screen`:** every move of Task 11, previews cut short and played out, leaving SAMPLES
  mid-preview.
- **`samples-delete`:** the Delete picker, the question, CANCEL, then deleting a previewing file and
  the last file of a folder; the meter before and after.
- **`preview-voices`:** 32 held MIDI notes of a supersaw in KEYS mode while SAMPLES previews (Sound:
  no voice is taken and the preview is heard).
- **`worst-case`:** gains a preview of a long stereo file during its 32 voices (Sound plan, "Not in
  this plan").

**The gallery:** SAMPLES at the top level with `approved: 'samples.png'`, SAMPLES inside a folder
with `approved: 'picker-sample.png'`, the Delete picker, the question with
`approved: 'question.png'`, the Dev page, and the import messages with
`approved: 'step-message.png'`.

- [ ] **Step 1: Write the scenes and the gallery states**
- [ ] **Step 2: Bless and compare**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-drift` with
  `GROOVEBOX_BLESS=1`. Then:
  - `git diff scenes/*.fingerprints`: the existing scenes only gain `storage` lines; any other
    changed line is a bug.
  - Open the new frames beside their approved pictures: rows, folder line, meter, question box and
    header match pixel for pixel where both show the same thing.
  - `tests/operations.rs` with the new `worst-case`: if the busiest batch is above
    `worst_batch_operations`, report both numbers to the owner and stop; raise it to the new
    measurement plus 10 %, rounded up, only with the owner's approval.

- [ ] **Step 3: Run without blessing**

  Run: `cargo test -p groovebox-drift`, and in `apps/groovebox`
  `npx vitest run tests/gallery.test.ts`, `npx eslint source/gallery/states.ts` and
  `npm run typecheck`. Expected: PASS, 0 errors.

- [ ] **Step 4: Commit**

  `git commit -m "Add the groovebox library scenes and gallery states"`

---

### Task 16: A recorded session with a drop replays

**Files:**

- Create: `packages/groovebox-core/scenes/browser-library.scene` with its blessed fingerprints.
- Modify: `scenes/browser-session.scene` and its fingerprints, only if Task 13's run showed that it
  no longer replays (then re-record it the same way).

- [ ] **Step 1: Record a session**

  `npm run develop` in `apps/groovebox` on a fresh browser profile (empty storage). Click to start,
  drop a folder of two small WAV files, MENU + 10, enter the folder, move onto each file, delete one
  after its question, and turn the volume. Click "Save session" and move the download to
  `scenes/browser-library.scene`. Stop the server and check its port is free.

- [ ] **Step 2: Replay it**

  Run: `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift browser_library`, then without blessing
  `cargo test -p groovebox-drift`. Expected: PASS in both builds; its `storage` fingerprint holds
  the one imported file left.

- [ ] **Step 3: Commit**

  `git commit -m "Replay a recorded groovebox session with a drop"`

---

### Task 17: Changeset and the last checks

**Files:**

- Create: `.changeset/groovebox-library.md`: `'groovebox-core': minor` and `'groovebox': minor`,
  "Added the groovebox sample library: storage, importing dropped WAV files, loading at start-up,
  the SAMPLES screen with preview and delete, and the Dev page."

- [ ] **Step 1: Write the changeset**
- [ ] **Step 2: Run the package checks once**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings` and `npm test` in
  `packages/groovebox-core`; `npm run lint` and `npm run typecheck` in `apps/groovebox`. Expected:
  all pass, and `git status --porcelain` is empty afterwards.

- [ ] **Step 3: Commit**

  `git commit -m "Add a changeset for the groovebox library"`
