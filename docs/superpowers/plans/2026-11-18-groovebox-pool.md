# Groovebox POOL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 3 of 3 for Milestone 2 ("Samples and POOL"). Plan 1 (the library) and its follow-up are built.
**Plan 2 (sample sounds) must be built first:** this plan uses its `Engine::Sample(Sample)`,
`Sample::Missing(Path)`, ENGINE item, `pages(screen, sound)` and test helpers.

**Goal:** MENU + 6 shows POOL: Remove unused, then every sound with its engine, its pads on the
current track and its sample's size, a missing sound in red with its file's name, and the library
meter. The cursor stands on the selected sound and highlighting a sound selects it, with its pad
when it sits on one. OK on a sound deletes it after a question that counts its pads; Remove unused
removes every sound that nothing uses. A deleted sound's voices fade and its pads go empty.

**Architecture:**

- **The project** deletes a sound in one place (`Project::delete_sound`): its pads empty on every
  track, a track that selected it on no pad goes back to pad 1, and it leaves the pool. "Used" has
  one definition (`Project::is_used`), which Milestone 3 extends with notes.
- **The audio part** hears `DeleteSound`: it fades the sound's voices within one chunk and forgets
  its values. Remove unused can delete 1,024 sounds at once, more than the message queue holds, so
  the control part keeps the numbers to send in a ring and sends them before any later event.
- **POOL** is a list screen like SAMPLES (its own `control/pool.rs`), with a cursor that follows the
  current track's selection whenever something else changes it.

**Tech Stack:** as plan 2: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md) is the main spec: "Selection"
  (POOL), "The PAD page" (a sound selected on POOL), "POOL".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "The project and its
  parts" (used), "Deleting a sound in use", "What a project remembers" (the fallback to a default),
  "A missing sample", "Projects and the library in use" (REMOVE UNUSED frees no RAM).
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header", "Shared parts" (a question),
  "The other screens" (POOL); the pictures `pool.png` and `question.png`.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- [Plan 2](./2026-11-18-groovebox-sample-sounds.md): `Sample`, `Engine`, MISSING (its S14 to S16)
  and the SAMPLES delete question's style (its S17).

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

The owner answered on 2026-11-18. The EP-133 has no pool of sounds (its sounds are numbered library
slots), so there was nothing to copy.

| #   | Point                          | Answer                                                                                                                                                                                                    |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | POOL's cursor                  | It opens on the current track's selected sound, or on Remove unused while an empty pad is selected. A pad hit or T1 to T4 while POOL shows moves it to the new selection: the cursor and the header agree |
| 2   | Which pads a row lists         | The current track's pads, as the Pad page and STEP's lanes. "no pad, no notes" marks a sound nothing uses on any track: what Remove unused removes                                                        |
| 3   | DELETE for an unused sound     | No count line: "Delete Syn 4?", then "OK deletes, Cancel keeps", as SAMPLES' question leaves out its count when no sound uses the file                                                                    |
| 4   | Remove unused with none unused | No question; the header says "No unused sounds" until the next button press                                                                                                                               |
| 5   | A missing sound's row          | With the file's name, "sample missing kick.wav no pad", in red. A long name is shortened with "…" so that the label takes at most half the row                                                            |
| 6   | A highlighted sound on a pad   | Highlighting selects the sound and the first pad of the current track that holds it (pad 1 for Kick on pads 1 and 12). Only a sound on none of the track's pads leaves no pad selected                    |

### Settled by the specs, the pictures or the answers

| #   | Point                      | Settled                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | The rows                   | "Remove unused" first, with no label; then every sound in number order, its name at the left and a dim label at the right: the engine word, for a missing sample "missing" and the file's name, the pads, and a loaded sample's size, two spaces apart (`pool.png`)                                                                                                           |
| S2  | The pads part              | The current track's pads that hold the sound, in pad order: "pad 2", "pads 1, 12"; "no pad" when none does; "no pad, no notes" when the sound is unused (answer 2). Until Milestone 3 brings notes, a sound is used when a pad of any track holds it                                                                                                                          |
| S3  | Missing                    | Plan 2's MISSING: the sample is `Missing`, or its file is not loaded. The file's name is the last part of the path, or the library file's name. The whole row is red and has no size                                                                                                                                                                                          |
| S4  | Shortening the file name   | `text::fit(name, room)` with room = `(ROW_WIDTH − 2 × TEXT_INSET) / 2` minus the width of the rest of the label, but at least `ADVANCE`, so the name keeps at least "…" (answer 5)                                                                                                                                                                                            |
| S5  | The size                   | `name::size(file.bytes())`, as SAMPLES shows it                                                                                                                                                                                                                                                                                                                               |
| S6  | Layout                     | 15 rows (`SAMPLES_VISIBLE`, as SAMPLES' top level) from `ROW_FIRST`; the library meter as an item at `METER_Y`, as on SAMPLES; the strip empty; the encoders and their pushes hold nothing (Workflow A, Look)                                                                                                                                                                 |
| S7  | Moving                     | Up, down, − and + one row; left and right 15 rows; stopping at the ends; with SHIFT held they do nothing, as on SAMPLES. CANCEL does nothing on POOL, which has no folders                                                                                                                                                                                                    |
| S8  | Following the selection    | Opening POOL lands the cursor on the selection (answer 1). After that, whenever the current track or its selected sound changes by anything but a move on POOL, the cursor lands on the new selection's row. Moving onto Remove unused keeps the selection, and the cursor stays there until it changes                                                                       |
| S9  | Highlighting               | Moving onto a sound selects it and its first pad (answer 6); nothing sounds. Moving onto Remove unused selects nothing                                                                                                                                                                                                                                                        |
| S10 | A sound on no pad          | SOUND's Pad page shows Engine only, on encoder 3 (Workflow A); the pads picture marks no pad; no pad lights in PADS mode; PAGE shows all of SOUND's pages; KEYS mode plays the sound; a pad hit in PADS mode selects that pad again                                                                                                                                           |
| S11 | The Delete picker          | OK on a sound opens a picker of one row, "Delete", as SAMPLES' file picker; OK on it opens the question; CANCEL closes either                                                                                                                                                                                                                                                 |
| S12 | The DELETE question        | "Delete Kick?" (text), "On 2 pads" or "On 1 pad" (dim), counting every track and left out when the sound is unused (answer 3), "OK deletes, Cancel keeps" (dim). Milestone 3 adds ", 24 notes" (`question.png`)                                                                                                                                                               |
| S13 | The Remove unused question | "Remove 3 unused sounds?" or "Remove 1 unused sound?" (text), "OK removes, Cancel keeps" (dim). With none: "No unused sounds" in the accent, as an import result that is no error (answer 4). The count is taken when the question is drawn and the sounds when OK is pressed                                                                                                 |
| S14 | What a delete does         | The sound leaves the pool; its number is never reused. Every pad that holds it, on every track, empties. A track that selected it on no pad selects pad 1, its default (Project model: a remembered item falls back to its default when its target is gone). Its voices fade within one chunk, as a deleted file's voices do. The library and the sample RAM stay as they are |
| S15 | What Remove unused removes | Every unused sound at once, a sound selected on POOL that sits on no pad included (Project model: one definition of used)                                                                                                                                                                                                                                                     |
| S16 | The cursor after a delete  | DELETE: the row above, as SAMPLES moves after a delete, and that sound is selected by S9; on Remove unused the selection stays as the delete left it. Remove unused: the cursor stays on Remove unused, unless S8 moves it                                                                                                                                                    |
| S17 | Telling the audio part     | One `DeleteSound` per sound. The control part keeps the numbers in a ring of `POOL_SOUNDS` and sends them, oldest first and stamped with the sample of the OK, as the queue makes room and before any later event. The audio part never holds more sounds than the pool                                                                                                       |
| S18 | Scrolling                  | POOL's cursor row joins `Focus`, so the name under the cursor scrolls from where it landed                                                                                                                                                                                                                                                                                    |
| S19 | Working memory             | The ring adds about 4 KB. Sample RAM is separate and unchanged                                                                                                                                                                                                                                                                                                                |

### Overview open points this plan settles

Task 1 removes "DELETE for an unused sound" (answer 3) from the overview's "Open points for
planning" and writes the answer into Workflow A and the Project model.

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
- The audio part never waits and never reads the values of a sound it was told to delete. The
  control part never sends a message about a deleted sound.
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

1. **Notes of a deleted sound still on.** A held pad, a held KEYS note, a Mono voice and a choke
   group partner after `DeleteSound`, then their `NoteOff`s and a new note of another sound, must
   neither panic nor read the deleted sound's values. Pinned in Task 3
   (`a_note_off_after_its_sound_is_deleted_does_nothing`,
   `a_choke_note_after_a_delete_reads_no_deleted_sound`).
2. **Remove unused on a full pool.** 1,023 deletes then New synth at once must send every
   `DeleteSound` before the `NewSound`, across as many steps as the queue needs, and the audio part
   must have room for the new sound. Pinned in Task 3
   (`the_audio_part_has_room_for_a_new_sound_after_a_delete_on_a_full_pool`) and Task 6
   (`remove_unused_on_a_full_pool_sends_every_delete_before_the_next_new_sound`).
3. **A selection whose sound is gone.** A track that selected the sound on POOL on no pad, on this
   track or another, must fall back to pad 1, so the header and SOUND always have a pad or a sound.
   Pinned in Task 2 (`removing_a_sound_selected_on_no_pad_selects_pad_1`) and Task 6
   (`a_track_that_selected_the_deleted_sound_on_no_pad_goes_back_to_pad_1`,
   `remove_unused_removes_a_sound_selected_on_no_pad_and_the_cursor_follows_pad_1`).
4. **The cursor and the selection drifting apart.** A pad hit or a track change while POOL shows, a
   cursor parked on Remove unused, a selection far down the list. Pinned in Task 5
   (`a_pad_hit_on_pool_moves_the_cursor_to_its_sound`,
   `moving_onto_remove_unused_keeps_the_selection_and_the_cursor_stays`,
   `following_a_sound_far_down_scrolls_it_into_view`).
5. **Long text.** A 64-byte sound name beside a long missing file name, and a missing sound on all
   12 pads, must keep the label within its room. Pinned in Task 4
   (`a_long_missing_file_name_is_cut_to_keep_the_label_within_half_the_row`).

## Not in this plan

- **Milestone 3:** notes in "used" (`Project::is_used`), ", 24 notes" in the DELETE question,
  deleting a sound's notes with it, STEP's extra lanes for a sound on no pad.
- **Milestone 4:** emptying undo, redo and the clipboard on a delete.
- **Milestone 5:** saving the pool and its next number, so a number is never reused across a save.

## Shared formats

### Messages

```rust
MessageKind::DeleteSound { sound: SoundNumber } // its voices fade; the audio part forgets it
```

### The view

```rust
pub enum Screen { Step, Sound, Pool, Settings, Samples } // ALL in this order; MENU[5] is Pool
pub struct PoolView {
    pub cursor: Cursor,
    /// The current track and its selected sound when the cursor last landed (S8).
    pub shows: (u8, Option<SoundNumber>),
}
pub enum Picker { Sound, Delete(FileId), DeleteSound(SoundNumber), /* plan 2's */ }
pub enum Question { DeleteFile(FileId), DeleteSound(SoundNumber), RemoveUnused }
```

POOL's rows: row 0 is Remove unused, row `n` the pool's sound `n − 1` in number order.

### A row's label

| Sound                                 | Label                                              |
| ------------------------------------- | -------------------------------------------------- |
| Sample on pads 1 and 12 of this track | `sample  pads 1, 12  38 KB`                        |
| Synth on pad 9                        | `synth  pad 9`                                     |
| Synth on another track's pad only     | `synth  no pad`                                    |
| Missing sample on no pad, unused      | `sample  missing kick.wav  no pad, no notes` (red) |
| Synth nothing uses                    | `synth  no pad, no notes`                          |

## File structure

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `project/pool.rs`, `project/track.rs`, `project/mod.rs`: modify (deleting, selecting a sound).
- `message.rs`, `audio/sounds.rs`, `audio/voices.rs`, `audio/mod.rs`: modify (`DeleteSound`).
- `control/pool.rs`: create (POOL's moves, OK, following, deleting). `control/view.rs`,
  `control/pages.rs`, `control/mod.rs`, `control/draw.rs`, `control/tests.rs`: modify.
  `control/tests/pool.rs`: create.

**`packages/groovebox-core/`:** `scenes/pool.scene`: create; re-bless the scenes whose MENU frames
and lights change.

**`apps/groovebox/`:** `source/gallery/states.ts`: modify.

**Repo root:** `.changeset/groovebox-pool.md`: create. The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-03-groovebox-workflow-a-design.md`, `2026-11-06-groovebox-project-model-design.md`,
  `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Workflow A:** "Selection", the POOL bullet: answers 1 and 6, S8, S9. "POOL": answers 2 to 5, S1,
  S2, S7, S11 to S16.
- **Project model:** "Deleting a sound in use": answer 3, S14, S15. "A missing sample": answer 5.
- **Look:** "The other screens", POOL: S1 to S4 and answer 5; "The header": "No unused sounds" in
  the accent among the messages; "Shared parts": the two questions' lines (S12, S13).
- **Overview:** "Open points for planning" as listed above.

- [ ] **Step 1: Edit the four specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the POOL decisions in the groovebox specs"`

---

### Task 2: The project deletes sounds

**Files:**

- Modify: `src/project/pool.rs`, `src/project/track.rs`, `src/project/mod.rs`, in
  `crates/groovebox-core/`.

**Interfaces:**

- **Produces, `Pool`:** `pub fn delete(&mut self, number: SoundNumber)`: the others keep their
  numbers and order, and `next` stays. Panics with "the sound to delete is in the pool".
- **Produces, `Track`:**
  - `pub fn select_sound(&mut self, sound: SoundNumber)`: S9, keeping the selection rule.
  - `pub fn remove(&mut self, sound: SoundNumber)`: empties the pads that hold it (`put`), then
    selects pad 1 when it was selected on no pad (S14).
- **Produces, `Project`:**
  - `pub fn is_used(&self, sound: SoundNumber) -> bool`: a pad of any track holds it.
  - `pub fn unused(&self) -> impl Iterator<Item = SoundNumber> + '_`: in number order.
  - `pub fn delete_sound(&mut self, sound: SoundNumber)`: `Track::remove` on every track, then
    `Pool::delete`.
- The `Track` doc's "as POOL will" becomes the rule as it now is.

- [ ] **Step 1: Write the failing tests**

```rust
// project/pool.rs
#[test] fn deleting_a_sound_keeps_the_others_in_number_order() {
    /* Syn 1 to 3, delete 2: numbers [1, 3]; get(2) is none; get(3) is "Syn 3" */
}
#[test] fn a_deleted_number_is_never_reused_but_its_name_may_be() {
    /* Syn 1 to 3, delete 3, new_synth: SoundNumber(4) named "Syn 3" */
}
#[test] fn a_full_pool_has_room_again_after_a_delete() { /* 1,024 synths, delete 1: new_synth is Ok(SoundNumber(1_025)) */ }
#[test]
#[should_panic(expected = "the sound to delete is in the pool")]
fn deleting_a_sound_that_is_not_in_the_pool_panics() {}

// project/track.rs
#[test] fn selecting_a_sound_selects_the_first_pad_that_holds_it() {
    /* pads 3 and 7 hold 5: select_sound(5) gives pad Some(3), sound Some(5) */
}
#[test] fn selecting_a_sound_on_no_pad_leaves_no_pad_selected() { /* pad None, sound Some(9) */ }
#[test] fn removing_a_sound_empties_its_pads_and_keeps_the_selected_pad() {
    /* pads 0 and 2 hold 4, pad 0 selected: remove(4): every pad None, pad Some(0), sound None */
}
#[test] fn removing_a_sound_selected_on_no_pad_selects_pad_1() {
    /* pad 0 holds 1; select_sound(2); remove(2): pad Some(0), sound Some(1) */
}
#[test] fn removing_another_sound_keeps_the_selection() {}

// project/mod.rs
#[test] fn a_sound_is_used_while_a_pad_of_any_track_holds_it() {}
#[test] fn unused_lists_the_sounds_on_no_pad_in_number_order() {
    /* 4 synths; 1 on T1 pad 1, 3 on T3 pad 12: unused is [2, 4] */
}
#[test] fn deleting_a_sound_empties_its_pads_on_every_track_and_leaves_the_pool() {
    /* on T1 pad 1 and T2 pad 5 (selected there), selected on no pad on T4: delete it:
       no pad holds it; T2 pad Some(4) sound None; T4 pad Some(0); the pool lacks it */
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib project`. Expected: FAIL to compile.

- [ ] **Step 3: Implement deleting and selecting a sound**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib project`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Delete groovebox sounds from the project"`

---

### Task 3: The audio part deletes sounds

**Files:**

- Modify: `src/message.rs`, `src/audio/sounds.rs`, `src/audio/voices.rs`, `src/audio/mod.rs`.

**Interfaces:**

- **Produces:** `MessageKind::DeleteSound` (Shared formats).
- `Sounds::remove(&mut self, sound: SoundNumber)`: the others stay in number order; panics as `find`
  does.
- `Voices::delete(&mut self, sound: SoundNumber, fades: &mut [[f32; CHUNK]; 2])`: fades every voice
  of `sound` that is not idle. Held keys stay: their `NoteOff`s still come and clear them, and no
  voice of the sound is left to return to them.
- `Audio::render`: `DeleteSound` calls `voices.delete` into the chunk's fades, then `sounds.remove`.

- [ ] **Step 1: Write the failing tests**

  In `audio/mod.rs`'s tests, with the `Rig`; plan 2's voice signatures.

```rust
#[test] fn a_deleted_sounds_voices_fade_within_one_chunk() {
    /* sounds 1 and 2 held; DeleteSound 1: after that chunk sound 1's voice is idle, sound 2's plays on */
}
#[test] fn a_note_off_after_its_sound_is_deleted_does_nothing() {
    /* Mono sound 1, two keys held; DeleteSound 1; both NoteOffs: no panic, every voice idle */
}
#[test] fn a_choke_note_after_a_delete_reads_no_deleted_sound() {
    /* sounds 1 and 2 in choke group 1 on track 0; note of 1 held; DeleteSound 1; NoteOn of 2: no panic */
}
#[test] fn the_audio_part_has_room_for_a_new_sound_after_a_delete_on_a_full_pool() {
    /* 1,024 sounds; DeleteSound 1; NewSound 1_025: its values are SOUND_DEFAULTS */
}

// audio/sounds.rs
#[test] fn removing_a_sound_keeps_the_others_found_by_number() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `DeleteSound`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Forget deleted groovebox sounds in the audio part"`

---

### Task 4: POOL lists the pool

**Files:**

- Create: `src/control/pool.rs`, `src/control/tests/pool.rs`.
- Modify: `src/control/view.rs`, `src/control/pages.rs`, `src/control/mod.rs`,
  `src/control/draw.rs`, `src/control/tests.rs` (`mod pool;`).

**Interfaces:**

- **Consumes:** Task 2's `Project::is_used`; plan 2's `Engine`, `Sample`.
- **Produces:**
  - `Screen::Pool` and `MENU[5]` (Shared formats); `name` "Pool"; no pages.
  - `View::pool: PoolView` with `shows` at `(0, None)` and the cursor on row 0 in `View::new`.
  - `fn move_in_pool(&mut self, button: Button)` on `Control`, in `pool.rs`: S7 by `moved`, with
    `SAMPLES_VISIBLE` rows. `nudge` sends POOL's moves here as it sends SAMPLES'.
  - `fn missing_file(&self, sound: &Sound) -> Option<&str>` on `Control`: S3's file name of a
    missing sample sound, none for any other sound. The header and the sound picker test MISSING
    through it; if plan 2 left its own test of MISSING, it is replaced by this one.
  - `fn pool_row<'a>(&'a self, sound: &'a Sound, label: &'a mut Label<160>) -> Row<'a>` in
    `draw.rs`: S1 to S5. The sound picker's engine word and this one come from one place.
  - `Focus::pool: Option<usize>`: the cursor's row while POOL shows (S18).
- **Behaviour:** `draw` shows POOL's rows (`draw_rows`) and the library meter as SAMPLES shows its
  own; the strip is empty.

- [ ] **Step 1: Write the failing tests**

  In `tests/pool.rs`, with the `Rig`, and plan 2's helpers for a library of `drums/kick.wav`.

```rust
#[test] fn menu_6_shows_pool_with_remove_unused_and_every_sound() {
    /* Syn 1 on pads 1 and 12, Syn 2 on pad 2, Syn 3 on T2 pad 1 only, Syn 4 on no pad:
       header "Pool T1 Syn 1 Pads"; rows "Remove unused"; "Syn 1" "synth  pads 1, 12";
       "Syn 2" "synth  pad 2"; "Syn 3" "synth  no pad"; "Syn 4" "synth  no pad, no notes";
       the meter at METER_Y as on SAMPLES; the strip empty */
}
#[test] fn a_sample_sounds_row_shows_its_size() { /* "kick" "sample  pad 1  " + the size SAMPLES shows */ }
#[test] fn a_missing_sound_is_red_with_its_files_name() {
    /* kick.wav deleted on SAMPLES: "kick" "sample  missing kick.wav  pad 1", alert; a file start-up
       could not load reads the same with its name */
}
#[test] fn a_long_missing_file_name_is_cut_to_keep_the_label_within_half_the_row() {
    /* a 60-character file: width(label) <= (ROW_WIDTH - 2 * TEXT_INSET) / 2 and the name ends in "…";
       the same sound on all 12 pads: the name is "…" alone */
}
#[test] fn the_arrows_move_pools_cursor_and_left_and_right_jump_15_rows() {
    /* 40 sounds: down 1, right to 16, left to 1, up to 0; SHIFT + down does nothing */
}
#[test] fn the_encoders_and_cancel_do_nothing_on_pool() { /* turns, pushes, CANCEL: nothing sent, nothing changes */ }
#[test] fn the_name_under_pools_cursor_scrolls_from_where_it_landed() { /* a 64-byte name */ }

// control/view.rs
#[test] fn the_menu_tiles_show_step_sound_pool_settings_and_samples() { /* tiles[5] "Pool"; 11 empty tiles */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the screen, its rows and its moves**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS; the old MENU tiles test is
  replaced by the new one.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox POOL screen"`

---

### Task 5: Highlighting a sound selects it

**Files:**

- Modify: `src/control/pool.rs`, `src/control/view.rs`, `src/control/pages.rs`,
  `src/control/mod.rs`, `src/control/tests/pool.rs`.

**Interfaces:**

- **Consumes:** Task 2's `Track::select_sound`; Task 4's `PoolView`, `move_in_pool`.
- **Produces:**
  - `fn land_on_selection(&mut self)` on `Control`: the cursor on the selected sound's row, or row 0
    when there is none, scrolled as far as it must; `shows` records the selection. MENU + 6 calls it
    every time POOL opens.
  - `fn follow_selection(&mut self)`: while POOL shows and `(track, selected sound)` differs from
    `shows`, `land_on_selection`. `step` calls it after each event, beside `keep_cursor`.
  - `move_in_pool` then selects a sound row's sound (`select_sound`) and records `shows`.
  - `pub fn pages(screen: Screen, sound: Option<&Sound>, pad: bool) -> &'static [PageDef]`: `pad`
    says whether the current track has a selected pad. SOUND's Pad page holds Sound, Copy and Engine
    with a pad and a sound, Sound with a pad and no sound, Engine (encoder 3) with a sound and no
    pad (S10). Every caller passes it.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn pool_opens_on_the_selected_sound() { /* pad 2's Syn 2 selected; MENU + 6: cursor on row 2 */ }
#[test] fn pool_opens_on_remove_unused_while_an_empty_pad_is_selected() {}
#[test] fn moving_onto_a_sound_selects_it_and_its_first_pad() {
    /* onto Syn 1 on pads 1 and 12: pad Some(0); header "Pool T1 Syn 1 Pads"; pad 1 lit; nothing sent */
}
#[test] fn moving_onto_a_sound_on_no_pad_leaves_no_pad_selected() {
    /* onto Syn 4: pad None; no pad lit; MENU + 3: the Pad page shows "Engine" "Synth" with a 3 only, the
       pads picture marks no pad; PAGE lights all six of SOUND's pages */
}
#[test] fn keys_mode_plays_a_sound_selected_on_no_pad() { /* NoteOn of Syn 4 at the key's pitch */ }
#[test] fn moving_onto_remove_unused_keeps_the_selection_and_the_cursor_stays() {
    /* from Syn 2 up to row 0: header still "Syn 2"; after another step the cursor is still on row 0 */
}
#[test] fn a_pad_hit_on_pool_moves_the_cursor_to_its_sound() {
    /* from Syn 4 and from Remove unused alike; a hit on an empty pad moves it to row 0 */
}
#[test] fn a_track_button_on_pool_moves_the_cursor_to_that_tracks_selection() {}
#[test] fn a_hit_while_pools_picker_is_open_moves_nothing() { /* the Delete picker open: selection and cursor stay */ }
#[test] fn following_a_sound_far_down_scrolls_it_into_view() { /* 40 sounds, pad 1 holds sound 40: a hit: cursor 40, scroll 26 */ }

// control/pages.rs
#[test] fn the_pad_page_of_a_sound_on_no_pad_holds_engine_only() {}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement highlighting, following and the Engine-only Pad page**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Select groovebox sounds on POOL"`

---

### Task 6: DELETE and Remove unused

**Files:**

- Modify: `src/control/pool.rs`, `src/control/view.rs`, `src/control/mod.rs`, `src/control/draw.rs`,
  `src/control/tests/pool.rs`.

**Interfaces:**

- **Consumes:** Task 2's `Project::delete_sound`, `Project::unused`, `Project::pads_using`; Task 3's
  `DeleteSound`; Task 5's `land_on_selection`, `select_sound`.
- **Produces:**
  - `Picker::DeleteSound`, `Question::DeleteSound`, `Question::RemoveUnused` (Shared formats), and
    `Entry::DeleteSound(SoundNumber)` drawn as "Delete".
  - `fn ok_in_pool(&mut self)`: row 0 opens `RemoveUnused`, or says "No unused sounds"; a sound row
    opens its Delete picker (S11).
  - `fn delete_sound(&mut self, sound: SoundNumber, sample: u64)`: `Project::delete_sound`, then the
    number joins `unsent` with `unsent_at = sample`.
  - On `Control`: `unsent: Ring<SoundNumber, { budget::POOL_SOUNDS }>` and `unsent_at: u64`.
  - `fn say(&mut self, text: &str, color: Color)`: the header's message; `pool_full` becomes
    `say("Pool full", RECORD)` and "No unused sounds" uses the accent.
- **Behaviour:** S12, S13, S16. OK on the DELETE question deletes the sound and lands the cursor on
  the row above (S16); OK on the Remove unused question deletes every sound `unused` gives at that
  moment.
- **`step`:** at the top of each turn of its event loop it sends `DeleteSound` for the numbers in
  `unsent`, oldest first, stamped with `unsent_at`, while the queue has room. While numbers remain
  it handles no event and the step ends there; the next step goes on with them. Only then does the
  `MAX_MESSAGES_PER_EVENT` check apply as before.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn ok_on_a_sound_opens_its_delete_picker() { /* one row "Delete"; CANCEL closes it */ }
#[test] fn the_delete_question_counts_the_pads_on_every_track() {
    /* on T1 pads 1 and 12, T2 pad 3: "Delete Syn 1?" text, "On 3 pads" dim, "OK deletes, Cancel keeps" dim;
       on one pad: "On 1 pad" */
}
#[test] fn the_delete_question_of_an_unused_sound_has_no_count() { /* "Delete Syn 4?", "OK deletes, Cancel keeps" */ }
#[test] fn ok_deletes_the_sound_and_lands_on_the_row_above() {
    /* Syn 2 on T1 pad 2 and T2 pad 1: sends DeleteSound 2 at the OK's sample; both pads empty; its row
       is gone; the cursor on Syn 1, selected with pad 1 */
}
#[test] fn cancel_keeps_the_sound() {}
#[test] fn deleting_the_first_sound_lands_on_remove_unused() { /* the track keeps the empty pad the delete left */ }
#[test] fn a_track_that_selected_the_deleted_sound_on_no_pad_goes_back_to_pad_1() {
    /* T2 selects Syn 4 on POOL; on T1, DELETE Syn 4: T2 has pad 1 and its sound selected */
}
#[test] fn remove_unused_asks_with_the_count_and_removes_every_unused_sound() {
    /* Syn 1 on pad 1, Syn 2 on T2 pad 1, Syn 3 and Syn 4 on no pad: "Remove 2 unused sounds?" text,
       "OK removes, Cancel keeps" dim; OK: DeleteSound 3 then 4; their rows gone; the cursor on Remove unused */
}
#[test] fn remove_unused_with_one_unused_sound_says_sound() { /* "Remove 1 unused sound?" */ }
#[test] fn remove_unused_with_none_unused_says_so_in_the_header() {
    /* no question; header "No unused sounds" in ACCENT; the next button press clears it */
}
#[test] fn remove_unused_removes_a_sound_selected_on_no_pad_and_the_cursor_follows_pad_1() {}
#[test] fn remove_unused_on_a_full_pool_sends_every_delete_before_the_next_new_sound() {
    /* 1,024 synths, sound 1 on pad 1: Remove unused, OK, then SOUND and New synth, all queued at once;
       steps with the queue emptied between them: 1,023 DeleteSounds in number order, each at the OK's
       sample, then NewSound 1_025; no step sends a message for an event while a DeleteSound waits */
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement the pickers, the questions and the sending of deletes**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Delete groovebox sounds on POOL"`

---

### Task 7: The scene and the gallery

**Files:**

- Create: `scenes/pool.scene` (with fingerprints and frames).
- Modify: `apps/groovebox/source/gallery/states.ts`.
- Re-bless: every scene that holds MENU (its tiles gain Pool, step 6 lights).

**`pool.scene`,** driven by the panel only, with `file` lines from the `ours` source as plan 2's
scenes: `drums/kick.wav`, `drums/snare-room.wav` and `hat.wav`.

- From SOUND's Pad page: a sample sound of `kick.wav` on pads 1 and 12, `snare-room.wav` on pad 2,
  `hat.wav` on pad 3, New synth three times on pad 9, so Syn 1 and Syn 2 sit on no pad, and New
  synth on pad 11. On T2, New synth on pad 1 only.
- SAMPLES: `hat.wav` deleted, so its sound is missing.
- MENU + 6 (frame for `pool.png`). Down twice: the snare selected with pad 2. Up to Remove unused. A
  hit on pad 12: the cursor on the kick. KEYS mode: down onto the sound on no pad, a key played,
  MENU + 3 (frame: the Pad page with Engine only), MENU + 6.
- OK on the kick, OK on Delete (frame for `question.png`); CANCEL. OK on Syn 1, Delete, OK: its row
  goes.
- OK on Remove unused (frame of its question, Syn 2 left to remove); OK; OK again: "No unused
  sounds" (frame).

**The gallery:** `STATES` gains the POOL frame with `approved: 'pool.png'`, the DELETE question with
`approved: 'question.png'`, the Pad page with Engine only with `approved: 'sound-pad.png'`, and the
Remove unused question and the "No unused sounds" header without a picture.

- [ ] **Step 1: Write the scene and the gallery states**
- [ ] **Step 2: Bless and compare**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-drift` with
  `GROOVEBOX_BLESS=1`. Then:
  - `git diff scenes/*.fingerprints` for the existing scenes: only `frame` lines of frames with MENU
    held and `lights` lines while MENU is held change; any other change is a bug.
  - Open the new frames beside their approved pictures: rows, header, meter and question match pixel
    for pixel where both show the same thing, apart from the picture's ", 24 notes" (Milestone 3)
    and its sounds, which the scene names differently.
  - Listen in the app (`npm run develop` in `apps/groovebox`, the same moves by hand): no click when
    a sound that rings is deleted.

- [ ] **Step 3: Run without blessing**

  Run: `cargo test -p groovebox-drift`, and in `apps/groovebox`
  `npx vitest run tests/gallery.test.ts`, `npx eslint source/gallery/states.ts` and
  `npm run typecheck`. Expected: PASS, 0 errors.

- [ ] **Step 4: Commit**

  `git commit -m "Add the groovebox POOL scene"`

---

### Task 8: Changeset and the last checks

**Files:**

- Create: `.changeset/groovebox-pool.md`: `'groovebox-core': minor` and `'groovebox': minor`, "Added
  POOL to the groovebox: every sound of the project, selecting, deleting and removing unused
  sounds".

- [ ] **Step 1: Write the changeset**
- [ ] **Step 2: Run the package checks once**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`,
  `cargo test -p groovebox-core --lib the_device_fits_the_working_memory -- --nocapture` (report the
  size against S19) and `npm test` in `packages/groovebox-core`; `npm run lint` and
  `npm run typecheck` in `apps/groovebox`. Expected: all pass, and `git status --porcelain` is empty
  afterwards.

- [ ] **Step 3: Commit**

  `git commit -m "Add a changeset for the groovebox POOL"`
