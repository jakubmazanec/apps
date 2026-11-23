# Groovebox Mix, Mute and Track Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 4 of 4 for Milestone 3 ("A looping pattern"). Plan 1 is playing a pattern
(`2026-11-19-groovebox-playing-a-pattern.md`), plan 2 timing and bars
(`2026-11-20-groovebox-timing-and-bars.md`), plan 3 the STEP view
(`2026-11-22-groovebox-step-view.md`). This plan is written against plan 3's code, which is built
and pushed.

**Goal:** SHIFT + T1 to T4 mutes and unmutes a track's pattern from any screen, with the muted
tracks named in the header and their buttons blinking. MIX sets the four track levels and the master
level. Every track has six effect slots in series, starting with a delay and a reverb; FX's Chain
page picks each slot's effect and moves slots along the chain, and a page per slot holds its
effect's settings. The delay follows the tempo in note values, the reverb is Mutable Instruments'
Rings reverb, and the worst case with every slot busy goes into the budget profile.

**Architecture:**

- **Values where they belong.** A track keeps its level and mute as master-list values and its six
  slots, each an effect and the values of every effect type; the project keeps the master level.
  `Target` gains the project, a track and a slot, so every change is the usual `SetParam`; picking
  an effect and moving a slot are two new messages.
- **Mute lives in the sequencer.** Both parts' sequencers pass over a muted track's notes, so the
  audio part starts none of them and the control part's player lights no pad for them. Hand-played
  notes never go through the sequencer, so they still sound.
- **Each track has its own bus.** Voices and their fades add into their track's bus; each bus goes
  through its slots in chain order, then its level; the four are summed, then the master level, then
  the preview and the click as before. At 100% a level multiplies by exactly 1 and an effect at
  Level 0 adds nothing, so a project on one track sounds bit for bit as today.
- **Effect memory is a third memory beside the sample RAM and the note memory,** owned by the audio
  side alone: 24 pieces of 2 seconds of stereo 16-bit samples. A slot uses a piece; a move swaps
  which pieces slots use. A clear writes nothing: each effect counts the samples written since, and
  a read further back reads 0, so STOP while stopped clears 24 slots in one chunk at no cost.
- **FX's pages follow the track's slots,** so `pages()` returns its pages by value instead of a
  static slice.

**Tech Stack:** as before: Rust 1.99.1, `libm`, `png` 0.18, `wasmtime` 50 with fuel in the drift
crate; TypeScript, Vite, Vitest for the gallery. No new dependency.

**Spec:**

- [Sound](../specs/2026-11-03-groovebox-sound-design.md) is the main spec: "Signal path", "Engine
  architecture" 7 and 8 (effect types, determinism), "Voices" (the worst case, STOP while stopped),
  "Track effects" (Slots, Delay, Reverb, Effect determinism), "Mixing and master", "Parameters",
  "Testing".
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "The screens", "What every
  screen shows", "The cursor and the shortcuts", "Effect slots", "Mix and volume", "Actions and
  bindings", "Testing".
- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md): "Patterns and the project", "The
  tempo" (the delay follows it), "Controls and bindings" (mutes act on the press).
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The header", "FX, Chain", "MIX", "The
  lights"; `fx-chain.png`, `mix.png`, `menu-held.png`, `page-held.png`.
- The Look rig's `drawHeader`, `drawFxChain` and `drawMix`, the drawing code of the approved
  pictures (outside the repo by the owner's choice):
  `C:\Users\Jakub\AppData\Local\Temp\claude\D--projects-apps\acb4db09-8c01-482d-9418-b85e6f948e54\scratchpad\redraw\rig\groovebox-screens.html`.
  S5, S7 and S15 copy its geometry.
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "Memory" (the budget profile),
  "Parameters" (the ID blocks).
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "The project and its
  parts" (a track's slots, level and mute).
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Milestones" and "Open
  points for planning".
- Rings: `rings/dsp/fx/reverb.h` and `rings/dsp/fx/fx_engine.h` of
  https://github.com/pichenettes/eurorack (MIT, Copyright 2014 Emilie Gillet) and stmlib's
  `dsp/cosine_oscillator.h`, saved for this plan in
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\f1bce69b-c083-43b5-8848-3868ba278cab\scratchpad\rings\`.
  S13 gives what the port needs.
- The EP-133 guide (saved for plan 1 under
  `C:\Users\Jakub\AppData\Local\Temp\claude\fb9f3eb15760f4ce\9118a0fc-20da-4a21-9883-27f2a051918e\scratchpad\ep133txt\`):
  it writes triplets as "1/8T" (`buttons-and-combos.txt`), has no dotted values, no track mute (only
  FX solo and choke "mute groups") and gives no blink rate.

## Decisions for this plan

### The rule

As every plan so far: everything is built in its final state, as the later plans expect it. Nothing
temporary, nothing the final version does not have. A part of the final design that needs a later
feature comes with that feature (see "Not in this plan").

### The owner's answers

| #   | Point                     | Answer (2026-11-23)                                                                                                                                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Delay times (overview)    | Triplets "1/8T", dotted "1/8D", ordered by length, so turning right always makes the echo longer: 1/32T, 1/32, 1/16T, 1/32D, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T, 1/4D, 1/2, 1/1T, 1/2D, 1/1, 1/1D |
| 2   | Effects in a new project  | Dry: the delay in slot 1 and the reverb in slot 2 start at Level 0, so pads and the pattern sound as before; turning Level up brings in echoes and room, including echoes of what just played                |
| 3   | The slow blink (overview) | Once a second: half a second on, half a second off, at any tempo and while stopped. The fast blinks (REC armed, a queued pattern) get their own quicker speed with Milestones 4 and 5                        |

### Settled by the specs, the pictures, the rig or the code

| #   | Point                    | Settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Values and IDs           | Foundation's blocks: MASTER_LEVEL 101 (project); TRACK_LEVEL 200 and MUTE 201 (track); the effect values in a new scope `Slot`, from 10,000 (Foundation: "one block of 1,000 per effect type from 10000"): the delay's 10,000 to 10,004, the reverb's 11,000 to 11,003. The table under "Shared formats" gives names, curves and defaults. Defaults are tuning, changed by ear (Sound, "Parameters"): the levels start at 100%, so today's loudness stays, and the effects' Levels at 0 (answer 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S2  | Effect types             | Empty, Delay and Reverb, keyed 0, 1 and 2 (Sound's "effect type 1" and "2"). A slot keeps the values of every effect type and reads only its own; a new type sets them all to their defaults, as a sound keeps one engine's settings (Workflow A). Every track starts with Delay in slot 1, Reverb in slot 2 and four empty slots (Sound), in both parts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| S3  | Messages                 | `Target` gains `Project`, `Track(t)` and `Slot { track, slot }` (`message.rs`: "Milestone 3 adds the project, a track and a slot"). Picking a type sends `SlotEffect`; a turn of MOVE sends one `MoveSlot`, however many clicks, the slots between moving one place towards where the moved one came from (successive swaps, Sound)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S4  | Mute                     | SHIFT + T1 to T4 flips that track's mute at its press (Workflow B: mutes act on the press), on every screen, with a picker or a question open, under MENU or PAGE and while steps are held (Workflow A); the current track does not change. Both sequencers pass over a muted track's notes as they come due: none starts, now or after the unmute (not caught up), and none takes a number. A note sounding at the mute keeps its end and plays its release (Sound). Pads lit by the control part's player follow, since it starts nothing either. Hand-played notes are `NoteOn`s and sound as usual                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| S5  | The header               | "Mute 2 4" in the dim colour at the right end, after the metronome icon (the rig's `drawHeader` lays the group out from the right: Mute, the icon, then the transport); it counts in the room that shortens the sound's name; a message replaces it with the transport (Look)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| S6  | The track lights         | A muted track's light is on while `now % 48_000 < 24_000` (`BLINK_SLOW`, counted from sample 0 of the audio clock, so every muted track blinks together), selected or not: the Look table says "a muted track blinks slowly" and the header names the track. An unmuted track is lit while selected, as before                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S7  | MIX                      | One page whose name is empty: the header reads "Mix" (`mix.png`), and PAGE shows one tile "1". Items: `TrackLevel(0)` to `TrackLevel(3)` on encoders 1 to 4, then Master with no encoder, its name where the others' names start. A muted track's item reads "Track 3 muted" with its name in red; its strip cell reads the same in the strip's usual colours (`mix.png`). The encoders and − and + move a level by 512 (128 clicks), SHIFT a sixteenth of that; OK does nothing (a smooth value)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| S8  | The audio path           | Each voice and each fade adds into its track's bus. Each bus goes through slots 1 to 6, then is multiplied by its level; the buses are summed in track order, multiplied by the master level, and then the preview and the click join as before. Levels glide over 128 samples (`Glide`) and move in a line across each chunk, as the output volume does. A track's level is not muted: mute is not in the path (Sound)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S9  | Effect memory (overview) | Beside the sample RAM and the note memory, as the note memory already is: `effect_ram = 9_216_000` in `budget.toml`, 24 pieces of 192,000 16-bit samples, a 2-second stereo delay at 48 kHz each (Sound: "about 0.4 MB per slot, about 9 MB"). Only the audio side touches it. Slot `s` of track `t` starts on piece `6t + s`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| S10 | Clearing                 | A clear (a new type, STOP while stopped) writes no memory: each line counts the samples written since its clear, and a read further back than that reads 0. Sound's "cleared at defined points ... applied by the audio part at a 32-sample chunk boundary" holds without wiping 9 MB inside one chunk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| S11 | Ringing                  | An effect counts the samples since it last stored a sample that is not 0. Once that count reaches its memory's span (a delay line's 96,000; the reverb's 32,768 and its pre-delay's 4,800) it holds only zeros: it sets its filter states to 0 and is not ringing. A slot that is empty, or not ringing with a chunk of input that is exactly 0 on both sides, is passed over and leaves the bus as it is (Sound: "whether they are still ringing (so silent slots can be skipped)")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S12 | The delay                | Two lines, left and right, of 96,000 samples each in the piece's halves, stored as `value × 8,192` rounded toward zero and held within `i16` (headroom to ±4). Time: `samples(ticks_in_use(time, tempo), tempo)`, from 1 to 96,000. A change of that number crossfades in a straight line over `CROSSFADE` (1,024 samples) between the old and the new read; a change during a crossfade waits for it to finish (Sound, "Effect determinism"). Feedback 100% on the item is 0.98 in the loop (Sound: "up to 98%"). Tone: a one-pole low-pass in the loop from 1 kHz (0%) to 16 kHz (100%), `1000 × 16^p` Hz; a fixed one-pole low cut at 100 Hz. The limiter: `soft_clip` on the fed-back part. Ping-pong: the left line takes the input's mono sum and the right echo fed back, the right line the left echo fed back, so echoes cross sides. The echoes are added at Level (a `Level` curve) on top of the dry sound                                                                                                                                                                                                                        |
| S13 | The reverb               | Rings's reverb: one ring of 32,768 samples in the piece, its ten lines, coefficients and 16-bit format (`value × 32,768` toward zero, held within `i16`) as in `reverb.h` and `fx_engine.h`, at 48 kHz as Rings runs. Input: the mono sum through a one-pole low cut at 100 Hz, then the pre-delay, then × 0.2 (Rings's input gain). Diffusion 0.625. Decay sets Rings's reverb time from 0.4 (0%) to 0.98 (100%), Tone its loop low-pass from 0.2 (dark) to 0.9 (bright). Two wobble oscillators at 0.5 and 0.3 Hz from 32-bit integer phases, stepped once per chunk, each `0.5 + 0.5 × cos` (stmlib's cosine oscillator, which Rings steps every 32 samples). Pre-delay: a mono line of 4,800 samples after the ring, crossfading on a change as the delay's time does; 0 passes the input straight. The wet left and right are added at Level on top of the dry, as the delay's are. The file keeps Rings's copyright and MIT notice                                                                                                                                                                                                      |
| S14 | The tempo                | The delay follows the tempo while stopped too (Sound: locked to the tempo; Workflow B: it follows at once). A tempo change while stopped now sends `SetParam { target: Project, id: TEMPO.id }`; while playing the audio part takes the tempo from `Play` and `Tempo` runs, as the music does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| S15 | FX, Chain                | Three rows, as `fx-chain.png` and the rig: the six slot tiles (`ItemKind::Chain`), Type (encoder 1) and Move (encoder 2). Up and down move between the rows; left and right move along the tiles, stopping at slots 1 and 6, and do nothing on Type and Move. Type and Move act on the tile the cursor last stood on, `View::fx_slot`, kept for every track until the project closes. OK on the tiles or on Type opens the Type picker (Empty, Delay, Reverb) on the slot's type; choosing the type it holds changes nothing, another clears the slot and starts it at its defaults (Workflow A). Turning encoder 1 and − and + do nothing on the tiles and Type (Workflow A: on an item that opens a picker). Move reads the slot's place, 1 to 6; each click moves its effect one place, `fx_slot` going with it, stopping at the ends. Tiles: 78 by 19 px from (1 + 79 s, 16); a used slot's border in the line grey, an empty one's faint; the number dim at x + 3, the name in the text colour 14 px in; the cursor's tile with its border, number and name in the accent. Type and Move are items 160 px wide from (2, 39), 18 px apart |
| S16 | FX, slot pages           | Pages 2 to 7 are slots 1 to 6 in chain order (Workflow A). Delay: Time, Feedback, Tone, Ping-pong, Level, with Time, Feedback, Tone and Level on encoders 1 to 4 (Sound). Reverb: Decay, Tone, Pre-delay, Level on 1 to 4. An empty slot's page has no items, so its strip is empty. Tab and header names: "Chain", "Delay", "Reverb" and "–" for an empty slot (Workflow A's "four dashes", in the en dash the strip's ranges use). Time reads the picked value and, while it does not fit 2 seconds, the value in use after it: "1/1 (1/2)" at 60 BPM, "1/1D (1/2D)" (answer 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| S17 | Pages by value           | FX's pages depend on the current track's slots, so `pages()` returns `Pages`, up to 7 page definitions by value (FX: Chain and six slots), and `Control::page` gives a copy. Item slices stay `&'static`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| S18 | The worst case           | Sound: every slot holds the most expensive effect. Measured: `worst-case.scene` is played with every slot a delay and with every slot a reverb, and keeps the costlier. All 24 are ringing at the batch where the 32 notes fade, and when the delay is the costlier a TEMPO turn lands in that batch, so every delay crossfades. If the measurement is over `worst_batch_operations`, stop and report both numbers: the budget is the owner's (as on 2026-11-22)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| S19 | Old pictures and sounds  | MENU's tiles 4 and 5 now exist (frames and lights change). The tempo's message while stopped adds applied reports. Audio fingerprints stay, except where two tracks sound at once (the buses add in another order) and `worst-case.scene`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Overview open points this plan settles

Task 1 writes these into the specs they belong to and takes them out of the overview's "Open points
for planning": "Delay time on the strip" (answer 1, S16), "Effect memory" (S9), and the slow speed
of "Blink speeds" (answer 3; the fast speed stays open for Milestone 4).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs and storage replies give the same audio, frames,
  lights, messages and written files in every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Float functions come
  from `libm`; no fused multiply-add; no logic depends on pointer size. Every value written into a
  feedback path or a filter state goes through `dsp::flush` (Sound, "Effect determinism"). Code
  under the `harness` feature and `cfg(test)` may use `std`.
- 48 kHz; the core's own 32-sample chunks. Time: 1,920 ticks a beat, 480 a sixteenth, 7,680 a whole
  note; samples of ticks are `ticks × 150,000 / tempo` rounded down (the sequencer's `SCALE`).
- Working memory stays within `budget.toml`'s 2 MB, checked when the core builds. This plan adds
  about 10 KB (the audio part's 24 slots and levels, the tracks' slots). If the device outgrows the
  budget, report the size and stop: the budget is the owner's. The effect memory is its own entry,
  `effect_ram`, outside the working memory.
- Note memory rules as before (the audio part never waits and never writes note memory). The audio
  part never waits for the effect memory either: nothing else touches it.
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
  - Tasks 2 to 7 do not run the drift tests; Task 8 runs the operation count; Task 9 re-blesses
    every scene once.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **Moving a ringing effect.** A move must keep the tail unbroken: a delay moved through empty
   slots changes no output bit, a move swaps settings and memory together, MOVE stops at slots 1 and
   6 and the cursor's slot goes with the effect. Pinned in Task 5
   (`moving_a_lone_delay_changes_nothing_in_the_output`) and Task 7
   (`move_moves_the_effect_and_the_cursor_goes_with_it`, `move_stops_at_the_ends`).
2. **A tempo too slow for the picked time.** At 60 BPM a picked 1/1 must play 1/2 and read "1/1
   (1/2)", come back at 120 BPM, crossfade both ways and follow a tempo turned while stopped. Pinned
   in Task 5 (`a_time_too_long_plays_the_longest_choice_that_fits`,
   `the_delay_follows_a_tempo_change_while_stopped`) and Task 7
   (`time_shows_the_value_in_use_when_it_does_not_fit`).
3. **STOP while stopped over 24 ringing slots.** Everything must go silent in one chunk with no
   wiping of memory and the next note must start dry, with no old echo or tail. Pinned in Task 5
   (`silence_clears_every_slot_and_the_next_note_starts_dry`) and Task 6
   (`a_cleared_reverb_reads_nothing_written_before`).
4. **Mute at awkward moments.** A note sounding at the mute keeps its end; notes passed while muted
   are not caught up after the unmute; a hand-played note on a muted track sounds; SHIFT + T works
   in a picker, a question, under MENU or PAGE and while a step is held. Pinned in Task 2
   (`a_muted_track_starts_none_of_its_notes_and_catches_none_up`,
   `a_note_sounding_at_the_mute_keeps_its_end`, `a_hand_played_note_on_a_muted_track_sounds`,
   `muting_works_wherever_shift_and_a_track_button_can_be_pressed`).
5. **High feedback under a loud mix.** Feedback at 100% with a loud chord must stay bounded and fade
   once the input stops, and the 16-bit lines must never wrap. Pinned in Task 5
   (`feedback_at_most_stays_bounded_and_fades`).

## Not in this plan

- **Milestone 4:** recording on a muted track (its notes stay silent by S4 already); the fast blink
  (REC armed) and CANCEL or COPY with T1 to T4.
- **Milestone 5:** saving the levels, mutes, master level and slots (a chunk per slot, the type by
  its key); clearing the effect memory when a project loads; a queued pattern's blink.
- **Later:** more effect types, a tape-style delay, a plate reverb, a master compressor, copying
  effect slots (Workflow A: not in part 1).

## Shared formats

### Values (`src/param/mod.rs`, `src/param/mix.rs` and `src/param/effect.rs`, new)

`Scope` gains `Slot` (an effect slot's values). `check`: a track's IDs lie in 200 to 299, a slot's
from 10,000. `ENTRIES` stays in ID order: TEMPO, MASTER_LEVEL, TRACK_LEVEL, MUTE, the sound entries,
then the delay's and the reverb's.

| Entry            | ID     | Name      | Scope   | Curve                | Unit    | Default | Click | Glide | Modulated |
| ---------------- | ------ | --------- | ------- | -------------------- | ------- | ------- | ----- | ----- | --------- |
| MASTER_LEVEL     | 101    | Master    | Project | Level                | Percent | 65,535  | 512   | 128   | no        |
| TRACK_LEVEL      | 200    | Level     | Track   | Level                | Percent | 65,535  | 512   | 128   | no        |
| MUTE             | 201    | Mute      | Track   | Switch               | None    | 0       | 0     | 0     | no        |
| DELAY_TIME       | 10,000 | Time      | Slot    | List (`DELAY_TIMES`) | None    | 960     | 0     | 0     | no        |
| DELAY_FEEDBACK   | 10,001 | Feedback  | Slot    | Fraction             | Percent | 26,214  | 512   | 128   | yes       |
| DELAY_TONE       | 10,002 | Tone      | Slot    | Fraction             | Percent | 32,768  | 512   | 128   | yes       |
| DELAY_PING_PONG  | 10,003 | Ping-pong | Slot    | Switch               | None    | 0       | 0     | 0     | no        |
| DELAY_LEVEL      | 10,004 | Level     | Slot    | Level                | Percent | 0       | 512   | 128   | yes       |
| REVERB_DECAY     | 11,000 | Decay     | Slot    | Fraction             | Percent | 32,768  | 512   | 128   | yes       |
| REVERB_TONE      | 11,001 | Tone      | Slot    | Fraction             | Percent | 32,768  | 512   | 128   | yes       |
| REVERB_PRE_DELAY | 11,002 | Pre-delay | Slot    | Time { max_ms: 100 } | Time    | 0       | 512   | 0     | no        |
| REVERB_LEVEL     | 11,003 | Level     | Slot    | Level                | Percent | 0       | 512   | 128   | yes       |

Ranges: smooth values 0 to 65,535, switches 0 to 1, DELAY_TIME 0 to 11,520 (its highest key), as the
list entries set theirs.

```rust
/// DELAY_TIME's choices, keyed by their length in ticks and ordered by it (answer 1): 1/32T 160,
/// 1/32 240, 1/16T 320, 1/32D 360, 1/16 480, 1/8T 640, 1/16D 720, 1/8 960, 1/4T 1,280, 1/8D 1,440,
/// 1/4 1,920, 1/2T 2,560, 1/4D 2,880, 1/2 3,840, 1/1T 5,120, 1/2D 5,760, 1/1 7,680, 1/1D 11,520.
pub const DELAY_TIMES: [Choice; 18];
```

### A track's values and slots (`src/project/track.rs`, `src/project/mod.rs`)

```rust
pub const TRACK_VALUES: usize = param::count(ENTRIES, Scope::Track); // 2
pub const SLOT_VALUES: usize = param::count(ENTRIES, Scope::Slot); // 9

/// What an effect slot holds (S2). Copy, Eq, Debug.
pub enum Effect { Empty, Delay, Reverb }
impl Effect {
    /// Its permanent key: 0, 1 and 2.
    pub const fn key(self) -> u16;
}

/// An effect slot: its effect and the values of every effect type, in list order. Copy, Eq.
pub struct Slot { pub effect: Effect, pub values: [i32; SLOT_VALUES] }
impl Slot {
    /// `effect` with every value at its default.
    pub const fn new(effect: Effect) -> Self;
    pub fn value(&self, id: ParamId) -> i32;
    pub fn set(&mut self, id: ParamId, value: i32);
}

pub struct Track {
    // ...as before, then:
    /// TRACK_LEVEL and MUTE, in list order.
    pub values: [i32; TRACK_VALUES],
    /// Slots 1 to 6 in chain order: Delay, Reverb and four empty in a new track (S2).
    pub slots: [Slot; 6],
}
impl Track {
    pub fn value(&self, id: ParamId) -> i32;
    pub fn set(&mut self, id: ParamId, value: i32);
    pub fn muted(&self) -> bool;
    /// The slot at `from` goes to `to`; the slots between move one place towards `from` (S3).
    pub fn move_slot(&mut self, from: u8, to: u8);
}

pub struct Project {
    // ...as before, then:
    /// MASTER_LEVEL's value.
    pub master: i32,
}
```

### Messages (`src/message.rs`)

```rust
pub enum Target { Device, Sound(SoundNumber), Project, Track(u8), Slot { track: u8, slot: u8 } }

MessageKind::SlotEffect { track: u8, slot: u8, effect: Effect } // the slot clears and takes `effect` at its defaults
MessageKind::MoveSlot { track: u8, from: u8, to: u8 }           // as Track::move_slot; memory moves too, nothing clears
```

`SetParam` carries TRACK_LEVEL and MUTE to `Track(t)`, MASTER_LEVEL and TEMPO (stopped, S14) to
`Project`, and the effect values to `Slot`.

### The sequencer (`src/sequencer.rs`)

```rust
impl Sequencer {
    /// While `muted`, the notes of `track` that come due start nothing and take no number (S4).
    pub fn mute(&mut self, track: u8, muted: bool);
}
```

### Effect memory (`src/effect_ram.rs`, new; `src/device.rs`)

```rust
/// 2 seconds of stereo 16-bit samples at 48 kHz: the delay, the largest effect (S9).
pub const PIECE: usize = 192_000;
pub const PIECES: usize = 24;
pub type Piece = [i16; PIECE];

/// The effect memory, kept beside the device. Sync; only the audio side touches it.
pub struct EffectRam { pieces: UnsafeCell<[Piece; PIECES]> }
impl EffectRam {
    pub const fn new() -> Self;
    /// # Safety
    ///
    /// Only the one audio side calls it, and holds the pieces while it lives.
    pub unsafe fn pieces(&self) -> &mut [Piece; PIECES];
}
```

`Device::audio_side(ram, notes, effects: &'a EffectRam)`; `AudioSide` holds the pieces and passes
them to
`Audio::render(left, right, readers, notes, effects: &mut [Piece; PIECES], messages, versions, reports)`.

### A line (`src/dsp/line.rs`, new)

```rust
/// A delay line in a slice of 16-bit samples, which stores `value × scale` rounded toward zero and
/// held within `i16`, and reads it back divided by `scale` (S10, S11).
pub struct Line { /* the next write's place, writes since the clear, writes since the last that was not 0 */ }
impl Line {
    pub const fn new(scale: f32) -> Self;
    /// Every sample written so far reads 0 from now on. Writes nothing.
    pub fn clear(&mut self);
    pub fn write(&mut self, memory: &mut [i16], value: f32);
    /// The sample written `back` writes ago, 1 the latest, at most `memory.len()`; 0 when it was
    /// written before the clear.
    pub fn read(&self, memory: &[i16], back: u32) -> f32;
    /// Whether one of the last `memory.len()` samples written was not 0.
    pub fn ringing(&self, memory: &[i16]) -> bool;
}
```

### The effects (`src/audio/delay.rs`, `src/audio/reverb.rs`, `src/audio/slots.rs`, new)

```rust
// delay.rs
pub const MOST_SAMPLES: u32 = 96_000;
pub const CROSSFADE: u32 = 1_024;
/// The samples of `ticks` at `tempo` hundredths of a BPM, rounded down.
pub fn samples(ticks: u32, tempo: u32) -> u32;
/// The ticks the delay plays for the picked `ticks`: those, or the longest of `DELAY_TIMES` whose
/// samples are at most `MOST_SAMPLES`.
pub fn ticks_in_use(ticks: u32, tempo: u32) -> u32;
pub struct Delay { .. }
impl Delay {
    pub const fn new() -> Self;
    pub fn clear(&mut self);
    pub fn ringing(&self, piece: &Piece) -> bool;
    /// One chunk of `bus` through the delay, with the slot's `values` (in list order) at `tempo`.
    pub fn render(&mut self, values: &[i32; SLOT_VALUES], tempo: u32,
        bus: &mut [[f32; CHUNK]; 2], piece: &mut Piece);
}

// reverb.rs: `Reverb` with the same four methods (no tempo).

// slots.rs
/// Every track's six slots in chain order: each its effect, its values gliding as a sound's do,
/// its effect's state and the piece it uses (S9).
pub struct Slots { .. }
impl Slots {
    /// Every track with a delay in slot 1 and a reverb in slot 2 at their defaults (S2), slot `s` of
    /// track `t` on piece `6t + s`, at 120 BPM.
    pub const fn new() -> Self;
    pub fn set_effect(&mut self, track: u8, slot: u8, effect: Effect);
    pub fn move_slot(&mut self, track: u8, from: u8, to: u8);
    pub fn set(&mut self, track: u8, slot: u8, id: ParamId, value: i32);
    pub fn set_tempo(&mut self, tempo: u32);
    /// Every slot of every track (STOP while stopped).
    pub fn clear(&mut self);
    /// One chunk of `bus` through the track's slots 1 to 6, passing over those S11 skips.
    pub fn render(&mut self, track: u8, bus: &mut [[f32; CHUNK]; 2], pieces: &mut [Piece; PIECES]);
}
```

`audio/mod.rs` gains `pub type Buses = [[[f32; CHUNK]; 2]; 4];`. `Voices::note_on`, `forget`,
`delete` and `silence` take `fades: &mut Buses` and fade each voice into its track's bus;
`Voices::render(reader, out: &mut Buses)` adds each voice into its track's. `Audio` gains
`slots: Slots`, `levels: [Glide; 4]` and `master: Glide`.

### The control part (`src/control/pages.rs`, `src/control/view.rs`, `src/control/mod.rs`)

```rust
ItemKind::TrackLevel(u8)  // MIX's "Track n": track n's TRACK_LEVEL
ItemKind::Chain           // FX Chain's tiles: View::fx_slot among the six
ItemKind::SlotType        // Type: the effect of slot fx_slot, which OK changes in the Type picker
ItemKind::SlotMove        // Move: the place of slot fx_slot, 1 to 6

pub const MOST_PAGES: usize = 7;
/// A screen's pages, by value (S17). Copy; derefs to `[PageDef]`.
pub struct Pages { .. }
pub fn pages(screen: Screen, sound: Option<&Sound>, pad: bool, slots: &[Slot; 6]) -> Pages;

Screen::Fx, Screen::Mix          // MENU + 4 and MENU + 5; Screen::ALL in MENU order
Picker::Effect                   // Empty, Delay, Reverb
View { /* ...as before, then: */ pub fx_slot: u8 }

impl Control {
    fn page(&self, screen: Screen) -> Option<PageDef>;              // a copy now (S17)
    fn value_of(&self, target: Target, id: ParamId) -> i32;
    /// Stores `value` for `id` of `target` and sends it, unless it holds it already; MUTE also
    /// mutes the control part's player, and TEMPO keeps its own rules (S14).
    fn set_on(&mut self, target: Target, id: ParamId, value: i32, sample: u64,
        messages: &mut Producer<'_, Message, MESSAGE_QUEUE>);
}
```

`value(id)` and `set(id, ...)` become `value_of(self.target(id), id)` and
`set_on(self.target(id), ...)`. `target` gives `Project` for the project's entries, `Track(current)`
for a track's and `Slot { track: current, slot: FX's shown page − 1 }` for a slot's.

### Drawing (`src/ui/frame.rs`, `src/ui/item.rs`, `src/ui/tiles.rs`)

```rust
/// ...as before; `mute` in the dim colour at the right end, after the metronome icon; "" draws nothing.
pub fn draw_header(canvas: &mut impl Canvas, left: &[Piece], right: &[Piece], metronome: bool, mute: &str);
pub struct ItemView<'a> { /* ...as before, then: */ pub alert: bool } // the name in red on a page; the strip ignores it
/// FX Chain's six tiles (S15): each slot's effect name, none for an empty one, and the cursor's tile.
pub fn draw_chain(canvas: &mut impl Canvas, names: &[Option<&str>; 6], cursor: Option<usize>);
```

## File structure

**`packages/groovebox-core/`:** `budget.toml`: modify (Task 5).

**`packages/groovebox-core/crates/groovebox-core/src/`:**

- `param/mod.rs`: modify (Tasks 2, 5). `param/mix.rs`: create (Task 2). `param/effect.rs`: create
  (Task 5).
- `project/track.rs`, `project/mod.rs`: modify (Tasks 2, 4, 7).
- `message.rs`, `sequencer.rs`: modify (Tasks 2, 5).
- `effect_ram.rs`: create (Task 5); `lib.rs`, `device.rs`: modify (Task 5).
- `dsp/line.rs`: create (Task 5); `dsp/mod.rs`: modify.
- `audio/mod.rs`, `audio/voices.rs`, `audio/voice.rs`: modify (Tasks 2, 3, 5). `audio/delay.rs`,
  `audio/slots.rs`: create (Task 5). `audio/reverb.rs`: create (Task 6).
- `control/mod.rs`, `control/view.rs`, `control/pages.rs`, `control/draw.rs`: modify (Tasks 2, 4, 5,
  7). `control/tests/mix.rs`: create (Task 2); `control/tests/fx.rs`: create (Task 7);
  `control/tests.rs`, `control/tests/timing.rs`: modify.
- `ui/frame.rs`, `ui/item.rs`, `ui/tiles.rs`: modify (Tasks 2, 4, 7).
- `lights.rs`: unchanged (the blink is worked out in `Control::lights`).

**`packages/groovebox-core/crates/`:** `groovebox-browser/src/lib.rs`, `groovebox-browser/build.rs`
and the drift crate's native runner: modify (Task 5).

**`packages/groovebox-core/scenes/`:** `worst-case.scene` (Task 8); create `mix.scene`,
`delay.scene`, `reverb.scene` and re-bless all (Task 9).

**`apps/groovebox/`:** `source/gallery/states.ts`, `tests/gallery.test.ts`: modify (Task 9).

**Repo root:** `.changeset/groovebox-mix-mute-and-effects.md`: create (Task 9). The specs: modify
(Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-02-groovebox-foundation-design.md`, `2026-11-03-groovebox-sound-design.md`,
  `2026-11-03-groovebox-workflow-a-design.md`, `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Overview:** "Open points for planning" as listed above.
- **Foundation:** the budget profile's effect memory as its own entry beside the sample RAM and the
  note memory (S9).
- **Sound:** "Slots": answer 2 (both start at Level 0), S9's pieces, S10's clear, S11's ringing.
  "Delay": answer 1's names and order, S12's crossfade, headroom, Tone range, limiter and ping-pong.
  "Reverb": S13. "Mixing and master": S8, the levels starting at 100%. The tempo while stopped
  (S14).
- **Workflow A:** "Mix and volume": S4 (a sounding note keeps its end; passed notes are not caught
  up), S7. "Effect slots": S15's rows and MOVE's cursor, S16's tab names.
- **Look:** "The header": S5's place of "Mute 2 4". "FX, Chain": S15's tiles. "MIX": S7's strip
  colours. "The lights": answer 3 and S6.

- [ ] **Step 1: Edit the five specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the mix, mute and track effect decisions in the groovebox specs"`

---

### Task 2: Track values and mute

**Files:**

- Create: `src/param/mix.rs`, `src/control/tests/mix.rs`.
- Modify: `src/param/mod.rs` (MASTER_LEVEL, TRACK_LEVEL and MUTE on the list; `Scope::Slot` and
  `check` come in Task 5), `src/project/track.rs` (`TRACK_VALUES`, `values`, `value`, `set`,
  `muted`), `src/project/mod.rs` (`master`), `src/message.rs` (`Target::Project`, `Track`),
  `src/sequencer.rs` (`mute`), `src/audio/mod.rs` (MUTE reaches the sequencer), `src/control/mod.rs`
  (SHIFT + T, `value_of`, `set_on`, the lights), `src/control/draw.rs` and `src/ui/frame.rs` (the
  header), `src/control/tests.rs` (`mod mix`; `shift_with_a_track_button_does_nothing` goes).

**Interfaces:**

- **Produces:** the three entries, `Track::values`, `value`, `set`, `muted`, `Project::master`,
  `Target::Project` and `Track`, `Sequencer::mute`, `value_of`, `set_on`, `BLINK_SLOW`, the new
  `draw_header` (Shared formats).

- [ ] **Step 1: Write the failing tests**

```rust
// sequencer.rs
#[test] fn a_muted_track_starts_none_of_its_notes_and_catches_none_up() {
    // track 1 with notes at ticks 0 and 960, track 2 with a note at 0, 1 bar of 4/4 looping;
    // mute(0, true) before PLAY: advance to the note at 960's sample: only track 2's start;
    // mute(0, false) after 960's sample: nothing more until the next pass, whose 0 starts
}
#[test] fn a_note_sounding_at_the_mute_keeps_its_end() {
    // track 1's note at 0, 480 long, started; mute(0, true) at 240's sample: its End comes at 480
}

// audio/mod.rs
#[test] fn a_hand_played_note_on_a_muted_track_sounds() {
    // a version with a note on track 0, SetParam { Track(0), MUTE, 1 } and Play: silent; a NoteOn on
    // track 0 after it: not silent
}

// control/tests/mix.rs
#[test] fn shift_and_a_track_button_mutes_and_unmutes_it() {
    // SHIFT + T2 at 0: sent [SetParam { Track(1), MUTE.id, 1 }], track 2 muted, the current track
    // still 1; again: value 0
}
#[test] fn muting_works_wherever_shift_and_a_track_button_can_be_pressed() {
    // Review Focus 4: with the sound picker open, with POOL's DELETE question, under MENU, under
    // PAGE and with step 1 held: each SHIFT + T3 flips track 3's mute and nothing else changes
}
#[test] fn the_header_names_the_muted_tracks_after_the_metronome() {
    // T2 and T4 muted, metronome on: the header as `draw_header(.., true, "Mute 2 4")` draws it;
    // with a message showing, no "Mute"
}
#[test] fn a_muted_track_blinks_once_a_second() {
    // answer 3, S6: T1 selected and muted, T3 muted: lit() holds track(0) and track(2) at 0 and
    // 23,999, neither at 24,000 and 47,999, both at 48,000; T2 (unmuted) never; unmuted T1 steady
}
#[test] fn a_muted_tracks_pattern_lights_no_pad() {
    // Syn 1 on pad 1 with a note at step 1, pad 2 selected, track 1 muted, PLAY: at the note's
    // sample pad 1 is not lit; unmuted, the next pass lights it
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- mute muted shift_and_a_track header_names`. Expected:
  FAIL to compile (no `Sequencer::mute`, `Target::Track`, `MUTE`).

- [ ] **Step 3: Implement**

  - The entries and `Track::values` (S1). `Project::new` sets `master` to MASTER_LEVEL's default.
  - `Sequencer::mute` (S4): `advance` still moves a muted track's cursor past each note as it comes
    due, but puts nothing in the table, sends no `Start` and takes no number.
  - The audio part: `SetParam { target: Track(t), id: MUTE.id, value }` calls
    `self.sequencer.mute(t, value != 0)`; TRACK_LEVEL and MASTER_LEVEL wait for Task 3 (they fall
    into the `SetParam { .. } => {}` arm until then).
  - `press`: SHIFT + T1 to T4 leaves the arm that takes `Ok`, `Stop` and `Push` with SHIFT and flips
    the mute through `set_on(Target::Track(t), MUTE.id, ..)`, then takes the button. It stays first
    in `press`, so pickers, questions, MENU and PAGE never reach it otherwise.
  - `set_on` for MUTE also calls `self.player.mute`. `value_of` and `set_on` take over `value` and
    `set` (Shared formats); TEMPO keeps its branch.
  - `lights`: `BLINK_SLOW: u64 = 48_000`; a track's light is
    `if muted { now % BLINK_SLOW < BLINK_SLOW / 2 } else { selected }`.
  - The header (S5): `draw` writes "Mute" and the muted tracks' numbers, 1 to 4, with spaces, passes
    it to `draw_header` and counts its width and a gap in the room that shortens the sound's name.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, with every earlier test unchanged but
  `shift_with_a_track_button_does_nothing`, which this task removes.

- [ ] **Step 5: Commit**

  `git commit -m "Mute groovebox tracks with SHIFT and a track button"`

---

### Task 3: Track buses and levels

**Files:**

- Modify: `src/audio/mod.rs` (`Buses`, `levels`, `master`, the path of S8), `src/audio/voices.rs`
  and `src/audio/voice.rs` (fades and render by track), their tests.

**Interfaces:**

- **Consumes:** TRACK_LEVEL, MASTER_LEVEL, `Target::Track`, `Target::Project` (Task 2).
- **Produces:** `Buses`; `Voices::render(reader, &mut Buses)` and the `fades: &mut Buses` of
  `note_on`, `forget`, `delete` and `silence`. The slots come in Task 5, between the bus and its
  level.

- [ ] **Step 1: Write the failing tests**

```rust
// audio/voices.rs
#[test] fn a_taken_voice_fades_into_its_own_tracks_bus() {
    // 32 voices on track 2, a 33rd note on track 1: the fade is in fades[1], fades[0] silent
}

// audio/mod.rs
#[test] fn a_track_level_scales_only_its_own_track() {
    // one synth note on track 0 and one on track 1; SetParam { Track(1), TRACK_LEVEL, 0 } with its
    // glide over: the output equals the track 0 note's alone, bit for bit
}
#[test] fn the_master_level_leaves_the_preview_and_the_click_alone() {
    // MASTER_LEVEL 0 with a note playing and a preview: the output equals the preview's alone
}
#[test] fn a_level_change_glides_over_four_chunks() {
    // TRACK_LEVEL from 65,535 to 32,768: the gain moves in a line across chunks 1 to 4 (as
    // `the_output_volume_glides_over_four_chunks`)
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio::`. Expected: FAIL to compile.

- [ ] **Step 3: Implement S8**

  `SetParam` to `Track(t)` for TRACK_LEVEL and to `Project` for MASTER_LEVEL set their glides.
  Voices add into `out[track]` and fade into `fades[track]`. `render` sums each bus with its fades,
  multiplies it by its level in a line across the chunk, adds the buses in track order, multiplies
  by the master level the same way, then adds the preview and the click and clips as before. The sum
  keeps the old order for one track: `(bus + fades) × 1.0`, plus three buses of +0.0, then `× 1.0`,
  so every existing audio test passes unchanged, and that is this task's regression check.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS, no earlier test changed.

- [ ] **Step 5: Commit**

  `git commit -m "Give each groovebox track its own bus with a level and add a master level"`

---

### Task 4: MIX

**Files:**

- Modify: `src/control/view.rs` (`Screen::Mix`, also `Screen::Fx` with its name "Fx", so `ALL`
  follows MENU's order once), `src/control/pages.rs` (MENU's step 5, MIX's page),
  `src/control/mod.rs` (`TrackLevel` in `change`, `use_item` and `target`), `src/control/draw.rs`
  (MIX's items, an empty page name left out of the header), `src/ui/item.rs` (`alert`),
  `src/control/tests/mix.rs`, `src/control/tests.rs` and `control/view.rs`'s tests (MENU's tiles).

**Interfaces:**

- **Consumes:** `set_on`, `value_of`, `Track::muted` (Task 2).
- **Produces:** `Screen::Mix`, `Screen::Fx` (without a page or MENU step until Task 7),
  `ItemKind::TrackLevel`, `ItemView::alert`.

- [ ] **Step 1: Write the failing tests**

```rust
// control/tests/mix.rs
#[test] fn menu_5_shows_mix_with_four_track_levels_and_master() {
    // S7: header "Mix T1 1 Pads" with no page name; items "1 Track 1 100%" to "4 Track 4 100%",
    // then "Master 100%" with no number, the cursor on Track 1; the strip Track 1 to Track 4
}
#[test] fn encoder_2_turns_track_2s_level_and_moves_the_cursor() {
    // turn encoder 2 by −1: SetParam { Track(1), TRACK_LEVEL.id, 65_023 }, cursor on item 1
}
#[test] fn minus_on_master_lowers_the_master_level() {
    // down 4 times, −: SetParam { Project, MASTER_LEVEL.id, 65_023 }; SHIFT + −: 32 lower
}
#[test] fn a_muted_track_reads_muted_in_red_on_mix_and_plainly_in_the_strip() {
    // T3 muted: item 3 named "Track 3 muted" in RECORD, its strip cell "Track 3 muted" in the
    // strip's usual colours (`mix.png`)
}
#[test] fn page_on_mix_shows_one_unnamed_tile() {}

// control/tests.rs (updated)
// the MENU tiles test: steps 4 ("Fx") stays empty until Task 7, 5 ("Mix") exists and lights
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::mix`. Expected: FAIL.

- [ ] **Step 3: Implement S7**

  `pages(Screen::Mix, ..)` is one page with the name "" and the five items. `item_view` writes a
  track's name into a label, "Track 3" or "Track 3 muted", with `alert` while muted; `draw_item`
  draws an alerted name in `RECORD` on a page, and `draw_strip` ignores `alert`. The header leaves
  out a page whose name is empty.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox MIX screen with the track levels and the master level"`

---

### Task 5: Effect memory, slots and the delay

**Files:**

- Create: `src/effect_ram.rs`, `src/dsp/line.rs`, `src/param/effect.rs`, `src/audio/delay.rs`,
  `src/audio/slots.rs`.
- Modify: `budget.toml` (`effect_ram = 9_216_000`, with a comment naming the 24 pieces of 2 s of
  stereo 16-bit samples), `src/param/mod.rs` (`Scope::Slot`, `check`, the delay's entries),
  `src/project/track.rs` (`Effect`, `Slot`, `SLOT_VALUES`, `slots`, `move_slot`), `src/message.rs`
  (`Target::Slot`, `SlotEffect`, `MoveSlot`), `src/lib.rs`, `src/device.rs` (`audio_side` takes the
  effect memory), `src/audio/mod.rs` (`slots`, the messages, the tempo), `src/control/mod.rs` (TEMPO
  while stopped, S14), `src/control/tests/timing.rs`
  (`a_tempo_change_while_stopped_sends_nothing_and_play_carries_it` becomes
  `a_tempo_change_while_stopped_sends_the_tempo_and_play_carries_it`), the browser crate's `lib.rs`
  (`static EFFECT_RAM`) and `build.rs` (its memory counts `EFFECT_RAM`), the drift crate's native
  runner and every test rig that makes an audio side (a `static` `EffectRam`, as `SampleRam` is
  kept).

**Interfaces:**

- **Consumes:** `Buses`, `levels` (Task 3); `value_of`, `set_on` (Task 2).
- **Produces:** `EffectRam`, `Piece`, `PIECES`, `Line`, `Effect`, `Slot`, `Track::slots`,
  `move_slot`, `Slots`, `Delay`, `samples`, `ticks_in_use`, `CROSSFADE`, the delay's entries,
  `DELAY_TIMES`, `SlotEffect`, `MoveSlot` (Shared formats). Until Task 6 a new track's slot 2 is
  empty in both parts; Task 6 puts the reverb there.

- [ ] **Step 1: Write the failing tests**

```rust
// effect_ram.rs
#[test] fn the_effect_memory_is_the_budgets() { /* size_of::<EffectRam>() == EFFECT_RAM */ }

// dsp/line.rs
#[test] fn a_line_reads_what_it_wrote_and_zero_from_before_its_clear() {
    // write 0.5, 0.25: read(1) 0.25, read(2) 0.5, read(3) 0; clear; write 0.125: read(1) 0.125,
    // read(2) 0
}
#[test] fn a_line_stores_16_bits_toward_zero_within_i16() {
    // scale 8,192: 1.0 / 8,192 × 1.5 reads 1.0 / 8,192; −1.0 / 8,192 × 1.5 reads −1.0 / 8,192;
    // 10.0 reads 32,767 / 8,192
}
#[test] fn a_line_stops_ringing_after_a_whole_line_of_zeros() {}

// audio/delay.rs
#[test] fn samples_follow_the_tempo_in_whole_samples() {
    // samples(1_920, 12_000) == 24_000; samples(160, 12_000) == 2_000; samples(240, 12_100) == 2_975
}
#[test] fn a_time_too_long_plays_the_longest_choice_that_fits() {
    // Review Focus 2: ticks_in_use(7_680, 6_000) == 3_840 (1/1 plays 1/2 at 60 BPM);
    // ticks_in_use(11_520, 6_000) == 3_840; ticks_in_use(7_680, 12_000) == 7_680;
    // ticks_in_use(11_520, 3_000) == 1_920
}
#[test] fn an_echo_comes_after_the_time_at_the_level() {
    // 1/16 at 120 BPM (6,000 samples), Level 100%, Feedback 0: an impulse of 0.5 on both sides at
    // sample 0 gives the output 0.5 at 0 (the dry), 0.5 at 6,000 (the echo) and 0 elsewhere
}
#[test] fn ping_pong_bounces_the_echoes_between_the_sides() {
    // an impulse on the left only, Feedback 100%: the first echo on the left at d, the next on the
    // right at 2d, then the left at 3d
}
#[test] fn feedback_at_most_stays_bounded_and_fades() {
    // Review Focus 5: a chord of 32 loud notes into Feedback 100%, Tone 100%, Level 100%: every
    // output sample stays within ±(2 × input peak + 1.0) (the fed-back part is held within ±1 and
    // the lines within ±4); after the input stops, the echoes after 30 s are quieter than after 1 s
}
#[test] fn a_tempo_change_crossfades_to_the_new_time() {
    // a steady tone through 1/4 at 120 BPM, then 121 BPM: over the next 1,024 samples the echo is
    // (1 − k) × old read + k × new read, k = n / 1,024; then the new read alone
}

// audio/mod.rs (through `render` and messages)
#[test] fn a_new_project_has_a_delay_at_level_0_which_changes_nothing() {
    // answer 2: a note through the default chain equals the same note with every slot empty, bit
    // for bit
}
#[test] fn moving_a_lone_delay_changes_nothing_in_the_output() {
    // Review Focus 1: slot 1 a delay at Level 100% with Feedback 50%, the rest empty; while its
    // echoes ring, MoveSlot { 0, 0, 3 }: the output equals the unmoved one's, bit for bit
}
#[test] fn moving_swaps_settings_and_memory_together() {
    // slot 1 a delay at 1/4 (24,000 samples) and Level 100%, slot 2 a delay at 1/8 and Level 0; an
    // impulse at 0, MoveSlot { 0, 0, 1 } at 12,000: the echo still comes at 24,000, and from then
    // SetParam { Slot { 0, 1 }, DELAY_LEVEL.id, 0 } silences the 1/4 echoes
}
#[test] fn a_new_type_clears_the_slot_and_takes_its_defaults() {
    // a ringing delay at Level 100%; SlotEffect { 0, 0, Delay }: from that chunk no echo of what
    // came before, and Level is 0 again
}
#[test] fn silence_clears_every_slot_and_the_next_note_starts_dry() {
    // Review Focus 3: delays at 1/16 and Level 100% ringing on all four tracks; Silence: the chunk
    // after it is silent, and a new note's first 6,000 samples equal those of a second rig fed the
    // same messages with every Level at 0
}
#[test] fn the_delay_follows_a_tempo_change_while_stopped() {
    // S14: stopped, SetParam { Project, TEMPO.id, 6_000 }: an impulse's echo at 1/16 comes 12,000
    // samples later
}

// control/tests/timing.rs
#[test] fn a_tempo_change_while_stopped_sends_the_tempo_and_play_carries_it() {
    // as before, but the stopped turn sends SetParam { Project, TEMPO.id, 12_100 }
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib -- line delay slot silence tempo_change`. Expected: FAIL
  to compile.

- [ ] **Step 3: Implement the memory and the line**

  `EffectRam` (S9) as `NoteRam` is kept, with a build-time check against `budget::EFFECT_RAM`.
  `Line` (S10, S11) stores as Rings's `Compress` does: `(value × scale) as i32` clamped to `i16`'s
  range.

- [ ] **Step 4: Implement the delay (S12)**

  Per chunk: the time in samples from the Time value and the tempo; a crossfade starts when that
  differs from the read in use and none runs; the coefficients of Tone and of the low cut, and the
  values, read once. Per sample, with `x` the bus's input and
  `fb(e) = soft_clip(low_cut(low_pass(e × feedback × 0.98)))` per side:

```text
echo = (1 − k) × line.read(from) + k × line.read(to)      // each side; k = 1 outside a crossfade
bus += level × echo                                       // only while Level is above 0 in the chunk
ping-pong off: left.write(x_l + fb(echo_l)); right.write(x_r + fb(echo_r))
ping-pong on:  left.write((x_l + x_r) / 2 + fb(echo_r)); right.write(fb(echo_l))
```

Filter states go through `flush`. Not ringing (S11) sets the filter states to 0.

- [ ] **Step 5: Implement the slots and the messages**

  `Slots` (Shared formats): smooth values glide as a sound's do (`Glide`, the entry's glide), lists
  and switches jump. `move_slot` rotates whole slots, piece included. `Audio` sends each bus through
  `slots.render` before its level; `SlotEffect`, `MoveSlot`, `SetParam` to a slot, `Silence`
  (`slots.clear()`), `Play` and `Tempo` (`set_tempo(run.tempo)`) and `SetParam` to the project's
  TEMPO reach `slots`. `Track::new` and `Slots::new` start with a delay in slot 1. The control
  part's `set_on` for TEMPO while stopped sends `SetParam { Project, TEMPO.id, value }`.

- [ ] **Step 6: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib` and `cargo test -p groovebox-browser`. Expected: PASS.

- [ ] **Step 7: Commit**

  `git commit -m "Add groovebox effect slots with their own memory and the delay"`

---

### Task 6: The reverb

**Files:**

- Create: `src/audio/reverb.rs`.
- Modify: `src/param/effect.rs` (the reverb's entries), `src/audio/slots.rs` (a reverb's slot; slot
  2 of a new track), `src/project/track.rs` (slot 2 of a new track).

**Interfaces:**

- **Consumes:** `Line`, `Piece`, `Slots` (Task 5).
- **Produces:** `Reverb` with `new`, `clear`, `ringing` and `render(values, bus, piece)`; the
  reverb's entries.

- [ ] **Step 1: Write the failing tests**

```rust
// audio/reverb.rs
#[test] fn an_impulse_gives_a_tail_on_both_sides_that_fades() {
    // Level 100%: after an impulse both sides are not silent within 0.2 s, and the energy of the
    // second 0.5 s is below the first's
}
#[test] fn a_longer_decay_rings_longer() {
    // Decay 100% against 0%: more energy between 1 s and 2 s after an impulse
}
#[test] fn pre_delay_holds_the_tail_back() {
    // Pre-delay at its top (100 ms): the first sample that is not 0 comes 4,800 samples later than
    // at 0 ms
}
#[test] fn a_cleared_reverb_reads_nothing_written_before() {
    // Review Focus 3: a ringing reverb, clear(): the next chunk with silent input is silent
}
#[test] fn a_reverb_stops_ringing_once_its_memory_holds_only_zeros() {}

// audio/mod.rs
#[test] fn the_reverb_in_slot_2_takes_the_delays_echoes() {
    // default chain, the delay at Level 100% and the reverb at 100%: the output differs from the
    // reverb's slot emptied, from the first echo on
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib reverb`. Expected: FAIL to compile.

- [ ] **Step 3: Implement S13**

  The ring is the piece's first 32,768 samples with Rings's `write_ptr` going down one a sample and
  its `MASK`; line `i` of lengths `[150, 214, 319, 527, 2182, 2690, 4501, 2525, 2197, 6312]` starts
  at `base(i) = Σ (length + 1)` of the lines before it. A read at offset `k` (written `k` samples
  ago) reads 0 while `k` is at least the samples started since the clear, the current one counted
  (S10). The pre-delay is a `Line` with the delay's scale, 8,192. Rings's `Context` reads and writes
  as in `fx_engine.h`: `Read(line TAIL)` is `length − 1` back, `Interpolate` reads `offset` and
  `offset + 1` and mixes them by the fraction, `Write` stores then scales the accumulator,
  `WriteAllPass` stores, scales and adds the last read. Per sample, after the pre-delay and the low
  cut gave `input`:

```text
acc = input × 0.2
for ap in [ap1, ap2, ap3, ap4]: acc += ap.tail × kap; ap.write_all_pass(−kap)
apout = acc
acc = apout + interpolate(del2, 6261 + 50 × lfo2) × krt; lp_1 += klp × (acc − lp_1); acc = lp_1
acc += dap1a.tail × −kap; dap1a.write_all_pass(kap)
acc += dap1b.tail × kap;  dap1b.write_all_pass(−kap)
del1.write(scale 2.0); wet = acc; left += level × wet
acc = apout + interpolate(del1, 4460 + 40 × lfo1) × krt; lp_2 += klp × (acc − lp_2); acc = lp_2
acc += dap2a.tail × kap;  dap2a.write_all_pass(−kap)
acc += dap2b.tail × −kap; dap2b.write_all_pass(kap)
del2.write(scale 2.0); wet = acc; right += level × wet
```

With `kap` 0.625, `krt` and `klp` from Decay and Tone (S13), `lp_1` and `lp_2` through `flush`. The
file starts with Rings's copyright line and MIT notice, the source path and "Changed from the
original:" naming the port to Rust, the pre-delay, the low cut, the level on top of the dry, the
clear by count and the oscillators, as `blake3.rs` credits its source.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS;
  `a_new_project_has_a_delay_at_level_0_which_changes_nothing` still passes with the reverb at Level
  0 in slot 2.

- [ ] **Step 5: Commit**

  `git commit -m "Add the Rings reverb to the groovebox effect slots"`

---

### Task 7: FX

**Files:**

- Create: `src/control/tests/fx.rs`.
- Modify: `src/control/pages.rs` (`Pages`, `MOST_PAGES`, FX's pages, MENU's step 4, the new
  `ItemKind`s), `src/control/view.rs` (`Picker::Effect`, `fx_slot`), `src/control/mod.rs` (`page` by
  value, the Chain's arrows, OK, MOVE, the Type picker, `target` for a slot), `src/control/draw.rs`
  (the Chain page, the Type picker's rows, Time's value in use), `src/ui/tiles.rs` (`draw_chain`),
  `src/project/track.rs` (`move_slot` used here), `src/control/tests.rs` (MENU's tiles, `pages`
  calls with the slots).

**Interfaces:**

- **Consumes:** `Effect`, `Slot`, `Track::slots`, `move_slot`, `SlotEffect`, `MoveSlot`,
  `ticks_in_use` (Tasks 5, 6); `Screen::Fx` (Task 4).
- **Produces:** `Pages`, `pages(.., slots)`, `Picker::Effect`, `View::fx_slot`, `ItemKind::Chain`,
  `SlotType`, `SlotMove`, `draw_chain`.

- [ ] **Step 1: Write the failing tests**

```rust
// control/tests/fx.rs
#[test] fn menu_4_shows_the_chain_of_the_current_track() {
    // S15: header "Fx Chain T1 1 Pads"; tiles "1 Delay", "2 Reverb", "3" to "6" faint, the cursor
    // on tile 1; items "1 Type Delay", "2 Move 1"; strip Type and Move
}
#[test] fn left_and_right_move_along_the_slots_and_up_and_down_between_rows() {
    // right: tile 2 (Type reads Reverb, Move 2); left twice: tile 1; down: Type; down: Move; left on
    // Move changes nothing; up twice: tile 1
}
#[test] fn ok_on_a_slot_opens_the_type_picker_on_its_type() {
    // OK on tile 2: picker rows Empty, Delay, Reverb on Reverb; down to Reverb is the end; up to
    // Delay and OK: sent [SlotEffect { 0, 1, Delay }], tile 2 reads Delay; OK on Type and OK on its
    // own type: nothing sent
}
#[test] fn turning_encoder_1_or_minus_and_plus_on_type_do_nothing() {}
#[test] fn move_moves_the_effect_and_the_cursor_goes_with_it() {
    // Review Focus 1: tile 1, turn encoder 2 by +2: sent [MoveSlot { 0, 0, 2 }]; tiles "1 Reverb",
    // "2", "3 Delay"; the cursor's tile 3, Move reads 3
}
#[test] fn move_stops_at_the_ends() {
    // tile 1, − on Move: nothing sent; tile 6, +: nothing sent; tile 5, turn +9: MoveSlot { 0, 4, 5 }
}
#[test] fn page_on_fx_shows_chain_and_each_slots_type() {
    // tiles "1 Chain", "2 Delay", "3 Reverb", "4 –" to "7 –", the shown page in the accent
}
#[test] fn a_delay_page_holds_time_feedback_tone_and_level_on_the_encoders() {
    // PAGE + 2: header "Fx Delay"; items Time 1/8, Feedback 40%, Tone 50%, Ping-pong Off, Level 0%;
    // encoder 4 + 1: SetParam { Slot { 0, 0 }, DELAY_LEVEL.id, 512 }; OK on Ping-pong flips it
}
#[test] fn time_shows_the_value_in_use_when_it_does_not_fit() {
    // Review Focus 2: Time turned to 1/1: "1/1" at 120 BPM; TEMPO to 60: "1/1 (1/2)"; to 120: "1/1"
}
#[test] fn an_empty_slots_page_and_strip_are_empty() {
    // PAGE + 4: header "Fx –", no items, an empty strip
}
#[test] fn each_track_has_its_own_chain() {
    // slot 3 of T1 set to Delay; T2: tile 3 empty; T1 again: Delay; fx_slot kept across tracks
}
#[test] fn a_new_type_with_fewer_items_moves_the_cursor_up() {
    // slot 1's page with the cursor on Level (item 5); Type Reverb on the Chain page: slot 1's
    // page has four items and its cursor is on the fourth
}
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control::tests::fx`. Expected: FAIL.

- [ ] **Step 3: Implement S15 to S17**

  `pages(Screen::Fx, .., slots)` is the Chain page (items `Chain`, `SlotType` on encoder 1,
  `SlotMove` on encoder 2) and one page per slot: `DELAY` (S16), `REVERB` or the empty page "–".
  `nudge` on FX's Chain page moves `fx_slot` with left and right while the cursor is on `Chain`; up
  and down are the page's usual ones. `change` on `SlotMove` sends one `MoveSlot` for the clicks
  that fit before an end and moves `fx_slot` along. The Type picker's rows are an
  `Entry::Effect(Effect)`; choosing another effect sets the track's slot to `Slot::new(effect)` and
  sends `SlotEffect`. `draw` draws the Chain page with `draw_chain` and Type and Move at their place
  (S15); Time's value gains " (" the label in use ")" while `ticks_in_use` differs.

- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox FX screen with the chain and a page per slot"`

---

### Task 8: The worst case

**Files:**

- Modify: `scenes/worst-case.scene` and its fingerprints; `budget.toml` only on the owner's word.

**What the scene adds** (S18): before the 32-note chord, pad on pad 1 of tracks 2 to 4 through the
sound picker (pool rows), each track's six slots set to the type being measured through FX, every
Level, Feedback or Decay at its top, a hit on each track's pad shortly before the chord so all 24
slots ring at it; for the delay, a TEMPO turn at the chord's sample.

- [ ] **Step 1: Write the scene with every slot a delay; build and measure**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `cargo test -p groovebox-drift --test operations -- --nocapture`. Note the busiest batch.

- [ ] **Step 2: The same with every slot a reverb; keep the costlier**

  Expected: the costlier stays in `worst-case.scene`, named in its comment with both numbers.

- [ ] **Step 3: Check the budget**

  The busiest batch within `worst_batch_operations`: PASS, go on. Over it: stop and report both
  numbers and the measurement plus 10% to the owner, who decides the new budget (Sound: the worst
  case's cost goes into the budget profile).

- [ ] **Step 4: Bless the worst case and commit**

  Run: `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift --test drift -- worst --test-threads=1`.
  Expected: PASS natively and in both `.wasm` builds.

  `git commit -m "Measure the groovebox worst case with every effect slot ringing"`

---

### Task 9: The scenes, the gallery, the changeset and a look

**Files:**

- Create: `scenes/mix.scene`, `scenes/delay.scene`, `scenes/reverb.scene`,
  `.changeset/groovebox-mix-mute-and-effects.md`.
- Modify: every scene's fingerprints and frames (re-blessed),
  `apps/groovebox/source/gallery/states.ts`, `apps/groovebox/tests/gallery.test.ts`.

**What the scenes do** (Sound's and Workflow A's drift scenes, through the panel only, each frame
named in the scene's comments):

- `mix.scene`: Syn 1 on pad 1 of T1 and Syn 2 on pad 1 of T2 with steps on both; PLAY; MENU + 5
  (frame: MIX, as `mix.png`); encoder 2 turns Track 2 down; Master down with the cursor and −;
  SHIFT + T2 while a note of T2 sounds, its tail ringing out (frame: "Track 2 muted" and "Mute 2",
  lights blinking at two frames half a second apart); a hit of T2's pad while muted, which sounds;
  MENU held with SHIFT + T4 (frame: MENU's tiles with Fx and Mix); SHIFT + T2 and SHIFT + T4 again.
- `delay.scene`: MENU + 4 (frame: the Chain page); right to slot 2 (frame, as `fx-chain.png`); OK
  and the Type picker (frame); Delay for slot 3, then Move it to slot 4 and back; PAGE held (frame:
  the tabs); PAGE + 2 (frame: the Delay page); Level, Feedback and Tone up, hits; Ping-pong on; MOVE
  of the ringing delay one place (Sound: its tail does not break); Time 1/1 and TEMPO down to 60 BPM
  (frame: "1/1 (1/2)") and back to 120.
- `reverb.scene`: the Reverb page (frame), Decay, Tone, Pre-delay and Level up, hits after the delay
  echoes; STOP while stopped over the ringing tails and a held preview of the sample picker (Sound:
  all of it silent in one step), then a hit that starts dry.

- [ ] **Step 1: Write the three scenes**
- [ ] **Step 2: Build and re-bless**

  Run, from `packages/groovebox-core`: `node build.js && node build.js --fallback`, then
  `GROOVEBOX_BLESS=1 cargo test -p groovebox-drift -- --test-threads=1`. Expected: PASS: every scene
  plays the same natively and in both `.wasm` builds. Audio fingerprints of the earlier scenes
  change only where two tracks sound at once (S19); list the scenes whose `expect-audio` changed,
  and stop and report any other.

- [ ] **Step 3: The gallery**

  `states.ts` gains: "FX Chain" (`fx-chain.png`), "Type picker on Reverb", "PAGE held on FX", "FX
  Delay page", "Delay time in use at 60 BPM", "FX Reverb page", "MIX with track 2 muted"
  (`mix.png`), "MENU held with FX and MIX" (`menu-held.png`); the states whose MENU frames changed
  keep their titles. `gallery.test.ts` lists `mix`, `delay` and `reverb` among the scenes whose
  every frame has a state.

  Run, from `apps/groovebox`: `npx vitest run tests/gallery.test.ts`,
  `npx eslint source/gallery/states.ts tests/gallery.test.ts`, `npm run typecheck`. Expected: PASS.

- [ ] **Step 4: The changeset**

```markdown
---
'groovebox': minor
'groovebox-core': minor
---

Added mutes, track levels and the master level on the groovebox's MIX screen, and six effect slots
per track with a tempo-synced delay and a reverb, set on the FX screen.
```

- [ ] **Step 5: Run clippy and commit**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: no warnings.

  `git commit -m "Add the groovebox mix and effect scenes and re-bless the scenes"`

- [ ] **Step 6: The owner looks and listens**

  Ask the owner to open the gallery and the app: each new frame beside its approved picture, a mute
  while playing, the delay at a few times and feedbacks, ping-pong, a slow tempo, the reverb's decay
  and tone, and STOP while stopped. Defaults and ranges are tuning (Sound): change what the owner
  chooses, re-bless as in Step 2 and commit; nothing changed: no commit.
