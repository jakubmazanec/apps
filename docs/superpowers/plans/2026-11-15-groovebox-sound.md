# Groovebox Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 3 of 3 for Milestone 1 ("Make a sound"). Plan 1
([foundation](./2026-11-10-groovebox-foundation.md)) and plan 2
([screens and pads](./2026-11-13-groovebox-screens-and-pads.md)) are built. A small plan for
scrolling text follows this one (answer 3).

**Goal:** The groovebox makes sound. You make Syn 1 on a pad and hear it at once; SOUND gains its
Synth, Filter, Filter envelope, Volume envelope and Voice pages with the encoders on their items;
every value you turn changes the sound while it plays; 32 voices, mono, legato, glide, choke groups
and one-shot work; the volume knob sets the output volume after a soft clipper. A worst-case scene
records how much the sound costs.

**Architecture:**

- **Master list** (`param/`): new curves and display units, lists stepped by their choices, and the
  entries of the shared voice chain (IDs 1000–1999), the synth engine (2000–2999) and the output
  volume (device ID 2).
- **Messages:** `SetParam`, `NewSound` and `CopySound` join the note messages. The audio part keeps
  its own copy of every sound's values (`audio/sounds.rs`), since Milestone 3's sequencer starts
  notes on the audio side and needs them there.
- **Sound making:** pure building blocks in `dsp/` (oscillators, filter, envelope, soft clipper);
  `audio/voice.rs` is one note (synth engine plus the shared chain, every value read through one
  step); `audio/voices.rs` allocates 32 voices, steals, chokes and runs mono and legato;
  `audio/mod.rs` applies messages and runs the master path.
- **Screens:** SOUND's five new pages in `control/pages.rs`, values on sound items, the empty-pad
  rule, and the Filter and envelope pictures through a new `ui/plot.rs`.
- **Drift:** new scenes, gallery frames and an operation count read from `wasmtime` fuel.

**Tech Stack:** as plan 2: Rust 1.99.1, `libm`, `wasmtime` 50 in the drift crate (now with fuel);
TypeScript only for the gallery's list of states.

**Spec:**

- [Sound](../specs/2026-11-03-groovebox-sound-design.md) is the main spec: engine architecture,
  "Virtual analog with supersaw", "Shared voice chain", "Voices", "Mixing and master", "Testing".
- [Workflow A](../specs/2026-11-03-groovebox-workflow-a-design.md): "Pages and encoders", "The PAD
  page" (the empty pad), "Mix and volume" (the volume encoder).
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The other screens" (pages and their
  pictures), "The rules every screen is drawn by", "The screen gallery and the drift frames"; the
  pictures `sound-filter.png`, `sound-volume-envelope.png` and `page-held.png`.
- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md): "Parameters", "Numbers", "Budget
  profile", "Testing and drift".
- [Workflow B](../specs/2026-11-05-groovebox-workflow-b-design.md): "Mono legato and glide come from
  overlapping notes"; "No accents in part 1".
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): "Open points for
  planning".

## Decisions for this plan

The owner answered every open point on 2026-11-15. Task 1 writes the answers into the specs.

### The rule

As plan 2: everything is built in its final state, as the later plans expect it. Nothing temporary,
nothing the final version does not have; a part of the final design that needs a later feature comes
with that feature.

### The owner's answers

| #   | Point                   | Answer                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SOUND with an empty pad | While the selected pad is empty SOUND has only the Pad page; PAGE shows one tile. Each screen still remembers its page: once a pad with a sound is selected, SOUND shows the remembered page again. A stray hit on an empty pad never loses your page                                                                                         |
| 2   | Oscillator 2's names    | Oscillator 2 level, Oscillator 2 interval, Oscillator 2 fine tune. Full words; a name that does not fit is shortened with "…" as Look says, until scrolling text replaces that                                                                                                                                                                |
| 3   | Scrolling text          | The owner wants text that does not fit to scroll in place, its box never changing. It gets its own small plan right after this one and is designed then, EP-133 first. Nothing of it is built here                                                                                                                                            |
| 4   | Mono notes              | The newest held key sounds. Letting go of it goes back to the newest key still held. In Mono every change, the return included, restarts the envelopes; in Legato they keep running and only the pitch moves. Letting go of the last held key starts the release                                                                              |
| 5   | Glide in Poly           | Glide works in Mono and Legato only. In Poly, Glide time and Glide stay on the page, keep their values and do nothing                                                                                                                                                                                                                         |
| 6   | Each hit                | Saw, pulse, triangle, sine, the sub and oscillator 2 start every note at phase 0, so a sound hits the same way each time. The supersaw's seven saws and the noise start from a seed taken from the note, so they vary from hit to hit. A replay is identical either way                                                                       |
| 7   | Tuning                  | Transpose −48 to +48 semitones; Fine tune and Oscillator 2 fine tune −50 to +50 cents (as the JD-Xi). Each moves one unit per click and SHIFT changes nothing on them                                                                                                                                                                         |
| 8   | A new synth             | A plain open saw: Saw; filter open (LP 24, Cutoff 100%, Resonance 0%, Envelope amount +0, Key follow 0%); the volume starts at once, holds full while held and fades in about 100 ms; Level 80%; Poly, Gate, Glide time 0 ms, no choke group, no transpose; sub, noise, spread and oscillator 2 at 0. Every number is a constant tuned by ear |

### Settled by the specs, the pictures or the rule

| #   | Point                         | Settled                                                                                                                                                                                                                                                                        |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | SOUND's pages                 | 1 Pad, 2 Synth, 3 Filter, 4 Filter envelope, 5 Volume envelope, 6 Voice (`page-held.png`; the engine page is named after the engine as "Sample" is in `sound-sample.png`). Items and encoders as in "The pages" below (Sound's starting pages)                                 |
| S2  | How values read               | Smooth one-sided values as a whole percentage of their range, Cutoff included (`sound-filter.png`: "64%"); two-sided values and counts signed ("+40", "+0", "−7", with the font's U+2212); times in ms below a second ("12 ms"), then seconds with one decimal; lists by label |
| S3  | Counted or smooth             | Semitones, cents and lists (the choke group is a list) are counted, one unit per click with or without SHIFT (Workflow A, answer 7). Everything shown as a percentage or a time is smooth: 128 clicks end to end, 16 times finer with SHIFT                                    |
| S4  | OK and a push on a value      | Only a switch flips. Lists, counts and smooth values have no picker, so OK and an encoder push do nothing on them (Workflow A: OK opens a picker, flips a switch or runs an action)                                                                                            |
| S5  | Item bars                     | A list shows the bar's track only (`sound-filter.png`: Mode, Type); every other value fills the bar by its place in its range (Pan "+0" half full)                                                                                                                             |
| S6  | A taken voice                 | The new note starts at its own chunk, never later. The taken voice's last chunk is mixed in that same chunk with a straight fade to zero (Foundation: events at exact chunks; Sound: a fade within one chunk, never a hard cut)                                                |
| S7  | A choked voice                | Fades as a taken voice does, in the chunk of the note that chokes it. Only other sounds of the group on the same track are choked (Sound)                                                                                                                                      |
| S8  | Mono on two tracks            | One voice per sound and track: a voice feeds the track that plays it (Sound: a sound gets the effects of the track that plays it)                                                                                                                                              |
| S9  | The seed                      | The audio part counts every note it starts; the count, mixed by a fixed 32-bit hash, is the note's seed (answer 6: taken from the note; Sound: seeds come from input events)                                                                                                   |
| S10 | Ranges, curves, glide times   | Starting numbers in code, tuned by ear (Sound, "Parameters"). The table under "The master list" is the start                                                                                                                                                                   |
| S11 | The pictures                  | The Filter page shows the filter's curve with a faint line at the cutoff; both envelope pages show their envelope's shape; Synth and Voice have none (Look). Items, header and strip match Look's pictures pixel for pixel; the curves are compared by eye (Look's gallery)    |
| S12 | The engine's description      | Its name, page and entries. Allowed play modes, mono or stereo output, shaping its own volume and chain defaults come with the first engine that differs from the synth (Milestone 2's sample engine starts in one-shot)                                                       |
| S13 | Accents                       | None (Workflow B: no accents in part 1). Engines get no accent mark until a feature makes one                                                                                                                                                                                  |
| S14 | The operation count           | `wasmtime` fuel counts the stable build's instructions; the budget holds the busiest 128-sample render batch of the worst-case scene; a test fails above it (Foundation: tracked to catch regressions; the budget names the number)                                            |
| S15 | STOP while stopped            | Comes with STOP in Milestone 3; it uses the one-chunk fade built here                                                                                                                                                                                                          |
| S16 | Track and master levels       | Come with MIX in Milestone 3. Voices mix straight into the master path until then: soft clipper, then output volume                                                                                                                                                            |
| S17 | The output volume             | Device entry 2, "Volume", not shown on any page; the volume encoder moves it 512 per click, ignoring SHIFT. Its default is the named starting level, tuned by ear (Workflow A)                                                                                                 |
| S18 | Sound changes reach the audio | Every change of a value sends one `SetParam`; a value already at its end sends nothing. New synth sends `NewSound`, Copy sends `CopySound`; a full pool sends nothing                                                                                                          |

### Overview open points this plan settles

Task 1 removes or narrows these in the overview's "Open points for planning" and writes each answer
into the spec it belongs to:

- Sound and settings: "Starting values of a new sound" (answer 8); "Root note, transpose and fine
  tune" keeps only the root note (Milestone 2); "Counted or smooth" keeps only note PITCH and
  VELOCITY (S3).
- Inside the core: "Numbers not yet set" loses the operation count (Task 10).
- Plan 2's own list for this plan: the parameter table (S10 and "The master list"), mono note
  priority (answer 4), the seed (S9), the timing of a taken voice (S6) and the operation count
  (S14).

## Global Constraints

- **The rule above.**
- Chromium only. Bit-identical: the same inputs give the same audio, frames, lights and reports in
  every build.
- The core is `no_std`, never allocates, has no statics and no platform code. Functions such as
  `sinf`, `tanf`, `tanhf`, `exp2f` and `powf` come from `libm` and are called explicitly; Rust's
  float methods are not used. No fused multiply-add; no logic depends on pointer size.
- Every feedback path (filter states, envelopes, glides) sets values below 1e-20 in magnitude to
  exactly 0 on every write. No sample may be "not a number" or infinite.
- 48 kHz; the core's own 32-sample chunks. Every message applies at the first chunk start at or
  after its sample. The output must not depend on the host's batch size.
- Integers for time, values and the screen. Parameter values are `i32`: smooth 0 to 65,535, counts
  in their units, lists by permanent key.
- Look's rules as in plan 2 (monogram, 13 px rows, items 17 px, the cursor 1 px outside, mixed case,
  full names shortened with "…"). The colours are the palette's named entries.
- The working memory stays within `budget.toml`'s 1 MB, checked when the core builds.
- GPL-3.0-or-later; dependencies GPL-compatible.
- Repo rules (as plans 1 and 2): never hand-edit Carson "DO NOT EDIT" files; never remove comments;
  inline variables and functions used only once; no em-dashes and no Oxford commas in copy, docs or
  commits; commit messages in imperative sentence case without prefixes; never mention Claude,
  Claude Code or Anthropic; never use `git stash`.
- Run only the focused tests and checks a task names; CI runs the full suite.
  - Rust: from `packages/groovebox-core`, `cargo test -p <crate> ...` and
    `cargo clippy --workspace --all-targets -- --deny warnings`.
  - Drift tests need both `.wasm` builds first: `node build.js && node build.js --fallback`.
  - The shell: from `apps/groovebox`, `npx vitest run <test file>`, `npx eslint <changed files>` and
    `npm run typecheck`.

## Review Focus

1. **A note-off that finds its voice gone.** A pad released after its voice was taken, choked or
   superseded in mono must never end or bend another note. Pinned in Task 8
   (`a_release_never_touches_a_voice_its_note_no_longer_has`).
2. **Turning a value on a held note.** Cutoff turned fast while 8 voices hold must not click: the
   value glides on every voice of that sound and no other. Pinned in Task 7
   (`a_cutoff_change_glides_over_four_chunks`) and Task 8 (`set_reaches_only_the_sounds_voices`).
3. **The worst settings at once.** 32 voices of stereo supersaw at Resonance 100%, Cutoff 100% in LP
   24, loudest levels, then silence: no "not a number", the output stays within ±1 and the filter
   states fall to exactly 0. Pinned in Task 6 (`full_resonance_at_the_top_stays_finite`,
   `silence_flushes_the_state_to_zero`) and Task 9 (`the_loudest_mix_stays_within_one`).
4. **The batch size.** Rendering the same messages in batches of 32 and of 128 samples must give the
   same bits. Pinned in Task 9 (`the_output_does_not_depend_on_the_batch_size`).
5. **Copying a sound while it is being edited.** A turn of Cutoff on Syn 1 followed at once by Copy
   must give Syn 2 the turned value on the audio side too. Pinned in Task 3
   (`a_copy_takes_the_values_the_audio_part_holds`).

## Not in this plan

- **Scrolling text:** its own plan, next (answer 3).
- **Milestone 2:** the sample engine and its page, the Engine item, the preview player, chain
  defaults per engine.
- **Milestone 3:** STOP (and STOP while stopped), track buses, effects, track and master levels,
  MIX, mute, the sequencer starting notes on the audio side. The worst-case scene gains every effect
  slot then, and the preview player in Milestone 2.
- **Milestone 4:** pressure.
- **Milestone 5:** saving sounds by layer-addressed IDs.

## Shared formats

### The master list

All smooth entries run 0 to 65,535 with click 512; counts and lists have click 0. "Glide" is the
parameter glide in samples. `p` is `value / 65_535`.

| ID   | Name                   | Scope  | Curve          | Unit    | Range and choices (key: label)                      | Default         | Glide |
| ---- | ---------------------- | ------ | -------------- | ------- | --------------------------------------------------- | --------------- | ----- |
| 1    | Velocity               | Device | Switch         | None    | (plan 2)                                            | On              | 0     |
| 2    | Volume                 | Device | Level          | Percent | smooth                                              | 45,875 (70%)    | 128   |
| 1000 | Mode                   | Sound  | List           | None    | 0: LP 12, 1: LP 24, 2: HP, 3: BP                    | LP 24           | 0     |
| 1001 | Cutoff                 | Sound  | Cutoff         | Percent | smooth                                              | 65,535          | 128   |
| 1002 | Resonance              | Sound  | Fraction       | Percent | smooth                                              | 0               | 128   |
| 1003 | Envelope amount        | Sound  | Bipolar        | Signed  | smooth                                              | 32,768 (+0)     | 128   |
| 1004 | Key follow             | Sound  | Fraction       | Percent | smooth                                              | 0               | 128   |
| 1005 | Velocity amount        | Sound  | Fraction       | Percent | smooth (filter)                                     | 0               | 128   |
| 1006 | Type                   | Sound  | List           | None    | 0: State variable                                   | State variable  | 0     |
| 1010 | Attack                 | Sound  | Time 10,000 ms | Time    | smooth (filter envelope)                            | 0 (0 ms)        | 0     |
| 1011 | Decay                  | Sound  | Time 10,000 ms | Time    | smooth                                              | 20,363 (300 ms) | 0     |
| 1012 | Sustain                | Sound  | Fraction       | Percent | smooth                                              | 0               | 128   |
| 1013 | Release                | Sound  | Time 10,000 ms | Time    | smooth                                              | 14,117 (100 ms) | 0     |
| 1020 | Attack                 | Sound  | Time 10,000 ms | Time    | smooth (volume envelope)                            | 0 (0 ms)        | 0     |
| 1021 | Decay                  | Sound  | Time 10,000 ms | Time    | smooth                                              | 20,363 (300 ms) | 0     |
| 1022 | Sustain                | Sound  | Fraction       | Percent | smooth                                              | 65,535          | 128   |
| 1023 | Release                | Sound  | Time 10,000 ms | Time    | smooth                                              | 14,117 (100 ms) | 0     |
| 1024 | Velocity amount        | Sound  | Fraction       | Percent | smooth (volume)                                     | 32,768 (50%)    | 128   |
| 1025 | Level                  | Sound  | Level          | Percent | smooth                                              | 52,428 (80%)    | 128   |
| 1026 | Pan                    | Sound  | Bipolar        | Signed  | smooth                                              | 32,768 (+0)     | 128   |
| 1030 | Play mode              | Sound  | List           | None    | 0: Poly, 1: Mono, 2: Legato                         | Poly            | 0     |
| 1031 | Glide time             | Sound  | Time 2,000 ms  | Time    | smooth                                              | 0 (0 ms)        | 0     |
| 1032 | Glide                  | Sound  | List           | None    | 0: Always, 1: Overlapping                           | Always          | 0     |
| 1033 | Trigger                | Sound  | List           | None    | 0: Gate, 1: One-shot                                | Gate            | 0     |
| 1034 | Choke group            | Sound  | List           | None    | 0: None, 1 to 8: "1" to "8"                         | None            | 0     |
| 1035 | Transpose              | Sound  | Count          | Signed  | −48 to +48 semitones                                | 0               | 0     |
| 1036 | Fine tune              | Sound  | Count          | Signed  | −50 to +50 cents                                    | 0               | 0     |
| 2000 | Wave                   | Sound  | List           | None    | 0: Saw, 1: Pulse, 2: Triangle, 3: Sine, 4: Supersaw | Saw             | 0     |
| 2001 | Shape                  | Sound  | Fraction       | Percent | smooth: pulse width (50% square) or supersaw detune | 32,768 (50%)    | 128   |
| 2002 | Spread                 | Sound  | Fraction       | Percent | smooth                                              | 0               | 128   |
| 2003 | Sub level              | Sound  | Level          | Percent | smooth                                              | 0               | 128   |
| 2004 | Noise level            | Sound  | Level          | Percent | smooth                                              | 0               | 128   |
| 2005 | Oscillator 2 level     | Sound  | Level          | Percent | smooth                                              | 0               | 128   |
| 2006 | Oscillator 2 interval  | Sound  | Count          | Signed  | −24 to +24 semitones                                | 0               | 0     |
| 2007 | Oscillator 2 fine tune | Sound  | Count          | Signed  | −50 to +50 cents                                    | 0               | 0     |

Curves (`param::real`): Switch, List and Count give the value itself; Fraction `p`; Bipolar
`(value − 32,768) / 32,767` held within −1 and 1; Time `max_ms / 1000 × p³` seconds; Cutoff
`20 × 1000^p` Hz; Level `p²` as a gain. Nothing is modulated yet: `modulated` is true for every
smooth sound entry and false elsewhere.

### The pages

| Page            | Items, encoder in brackets                                                                                                     | Picture  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Synth           | Wave (1), Shape (2), Spread (3), Sub level (4), Noise level, Oscillator 2 level, Oscillator 2 interval, Oscillator 2 fine tune | none     |
| Filter          | Mode (1), Cutoff (2), Resonance (3), Envelope amount (4), Key follow, Velocity amount, Type                                    | curve    |
| Filter envelope | Attack (1), Decay (2), Sustain (3), Release (4), the filter envelope's                                                         | envelope |
| Volume envelope | Attack (1), Decay (2), Sustain (3), Release (4), Velocity amount, Level, Pan, the volume envelope's                            | envelope |
| Voice           | Play mode (1), Glide time (2), Glide (3), Trigger (4), Choke group, Transpose, Fine tune                                       | none     |

The picture area is x 164 to 478, y 16 to 251 (`ui/layout.rs`: `PICTURE`), the pad tiles' area.
Curves and shapes run from column 164 to 478 and between row 17 (top) and row 250 (bottom), 1 px
inside the area as Look's pictures do.

### Messages

```rust
pub enum Target { Device, Sound(SoundNumber) }  // Milestone 3 adds Project, Track(u8) and Slot
MessageKind::SetParam { target: Target, id: ParamId, value: i32 }
MessageKind::NewSound { sound: SoundNumber }               // every default
MessageKind::CopySound { sound: SoundNumber, of: SoundNumber }
```

`MAX_MESSAGES_PER_EVENT` stays 1.

## File structure

**`packages/groovebox-core/`:**

- `budget.toml`: modify. `voices = 32`; `worst_batch_operations` (Task 10).
- `crates/groovebox-core/src/`:
  - `param.rs` becomes `param/mod.rs` (the mechanism, Velocity, Volume, `ENTRIES`); create
    `param/chain.rs` and `param/synth.rs` (their entries).
  - `message.rs`, `project/pool.rs`, `lib.rs`: modify.
  - `dsp/`: `mod.rs`, `osc.rs`, `filter.rs`, `envelope.rs`, `clip.rs`: create.
  - `audio.rs` becomes `audio/mod.rs`; create `audio/sounds.rs`, `audio/synth.rs`, `audio/voice.rs`,
    `audio/voices.rs`.
  - `control/mod.rs`, `control/pages.rs`, `control/draw.rs`, `control/tests.rs`,
    `control/tests/sound.rs`: modify. `ui/layout.rs`, `ui/mod.rs`: modify; `ui/plot.rs`: create.
- `crates/groovebox-drift/`: `src/wasm.rs` (fuel): modify; `tests/operations.rs`: create.
- `scenes/`: create `synth-pages`, `synth-waves`, `filter`, `voices`, `mono`, `triggers`, `volume`,
  `worst-case` (with fingerprints and frames); re-bless the scenes whose audio changes.

**`apps/groovebox/`:** `source/gallery/states.ts`: modify.

**Repo root:** `.changeset/groovebox-sound.md`: create. The specs: modify (Task 1).

---

### Task 1: The specs record the decisions

Docs only, stated as the current design.

**Files:**

- Modify, in `docs/superpowers/specs/`: `2026-10-26-groovebox-core-browser-design.md`,
  `2026-11-03-groovebox-sound-design.md`, `2026-11-03-groovebox-workflow-a-design.md`,
  `2026-11-07-groovebox-look-design.md`.

**What each spec gains:**

- **Sound:** "Shared voice chain", play mode: answers 4 and 5; tuning: answer 7. "Virtual analog
  with supersaw": answer 6 and Oscillator 2's names (answer 2). "Voices": S6 to S9. A new "Starting
  sound" paragraph: answer 8.
- **Workflow A, "The PAD page":** answer 1 replaces "the other five pages are empty".
- **Look, "The font":** text that does not fit is shortened with "…" until scrolling text, which
  gets its own plan (answer 3).
- **Overview:** "How part 1 is designed" names the scrolling text plan after Sound (answer 3); "Open
  points for planning" as listed under "Overview open points this plan settles".

- [ ] **Step 1: Edit the four specs**
- [ ] **Step 2: Check them**

  Run: `npx prettier --check docs/superpowers/specs/*.md` from the repo root. Expected: no file
  needs formatting.

- [ ] **Step 3: Commit**

  `git commit -m "Record the sound decisions in the groovebox specs"`

---

### Task 2: The master list grows

**Files:**

- Move `src/param.rs` to `src/param/mod.rs`; create `src/param/chain.rs`, `src/param/synth.rs` (all
  in `crates/groovebox-core/`).

**Interfaces:**

- `pub enum Curve { Switch, List, Count, Fraction, Bipolar, Time { max_ms: u32 }, Cutoff, Level }`.
- `pub enum Unit { None, Percent, Signed, Time }`.
- Every entry of "The master list" as a `pub const` named after it (`OUTPUT_VOLUME` for Volume,
  which keeps clear of `input::VOLUME`, then `MODE`, `CUTOFF`, `FILTER_ATTACK` … `FILTER_RELEASE`,
  `ATTACK` … `RELEASE`, `FILTER_VELOCITY`, `VOLUME_VELOCITY`, `LEVEL`, `PAN`, `PLAY_MODE`,
  `GLIDE_TIME`, `GLIDE`, `TRIGGER`, `CHOKE_GROUP`, `TRANSPOSE`, `FINE_TUNE`, `WAVE`, `SHAPE`,
  `SPREAD`, `SUB_LEVEL`, `NOISE_LEVEL`, `OSCILLATOR_2_LEVEL`, `OSCILLATOR_2_INTERVAL`,
  `OSCILLATOR_2_FINE_TUNE`), the chain's in `chain.rs`, the synth's in `synth.rs`, all in `ENTRIES`.
  List keys as `pub const`s where code matches on them (`LP_12`, `LP_24`, `HP`, `BP`, `POLY`,
  `MONO`, `LEGATO`, `ALWAYS`, `OVERLAPPING`, `GATE`, `ONE_SHOT`, `SAW`, `PULSE`, `TRIANGLE`, `SINE`,
  `SUPERSAW`).
- `check` gains, in this order after plan 2's rules: a list has choices with unique keys, its
  default among them and click 0; a count has click 0; Fraction, Bipolar, Time, Cutoff and Level are
  smooth.
- `pub fn real(entry: &Entry, value: i32) -> f32`: the curves under "The master list".
- `moved`: a list moves `clicks` places along `choices` from the place of `value`'s key, stops at
  the ends and returns that choice's key; counts and smooth values as before.
- `format` (unchanged signature): S2. Percent is `round(p × 100)` then "%"; Signed is the count, or
  `round(real × 100)` for Bipolar, with "+" for 0 and above and "−" below; Time is `round(ms)` then
  " ms" below 999.5 ms, else tenths of a second as "4.2 s"; a list its choice's label. Rounding is
  half away from zero, on integers where possible.
- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn the_list_passes_its_check_with_33_sound_and_2_device_entries() { /* check(ENTRIES) == Ok; count(ENTRIES, Sound) == 33; count(ENTRIES, Device) == 2 */ }
#[test] fn lists_move_along_their_choices_and_stop_at_the_ends() {
    // a test list with keys 3, 0, 7 in that order: moved(e, 0, 1, false) == 7; moved(e, 0, 5, false) == 7; moved(e, 3, -1, false) == 3
    // moved(&WAVE, SAW, 10, true) == SUPERSAW
}
#[test] fn counts_ignore_shift() { /* moved(&TRANSPOSE, 0, 1, true) == 1; moved(&FINE_TUNE, 50, 1, false) == 50 */ }
#[test] fn percentages_are_whole() { /* CUTOFF: 65_535 "100%", 41_943 "64%", 0 "0%"; LEVEL 52_428 "80%" */ }
#[test] fn signed_values_read_plus_zero_in_the_middle() {
    // ENVELOPE_AMOUNT: 32_768 "+0", 45_875 "+40", 0 "−100", 65_535 "+100"; TRANSPOSE: 12 "+12", -7 "−7", 0 "+0"
}
#[test] fn times_read_in_milliseconds_then_seconds() { /* ATTACK: 0 "0 ms", 6_554 "10 ms", 14_117 "100 ms", 49_151 "4.2 s", 65_535 "10.0 s"; GLIDE_TIME 65_535 "2.0 s" */ }
#[test] fn lists_read_their_labels() { /* MODE LP_24 "LP 24"; CHOKE_GROUP 0 "None", 3 "3"; TRIGGER ONE_SHOT "One-shot" */ }
#[test] fn curves_give_the_sound_its_numbers() {
    // real(&CUTOFF, 0) == 20.0; real(&CUTOFF, 65_535) within 0.5 of 20_000.0; real(&RELEASE, 14_117) within 0.0001 of 0.1;
    // real(&LEVEL, 65_535) == 1.0; real(&PAN, 0) == -1.0; real(&PAN, 32_768) == 0.0
}
#[test] fn a_new_sound_is_the_plain_open_saw() { /* the Sound defaults in list order: WAVE SAW, CUTOFF 65_535, MODE LP_24, SUSTAIN 65_535, RELEASE 14_117, LEVEL 52_428, PLAY_MODE POLY, TRIGGER GATE (answer 8) */ }
#[test] fn check_refuses_a_bad_list_or_count() { /* duplicate keys; default not a key; a list with click 512; a count with click 512; a Fraction with click 0 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib param`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the curves, units, entries, `real`, `moved` and `format`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS (plan 2's tests keep passing; a new
  sound now holds 33 values).

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox sound parameters to the master list"`

---

### Task 3: Values reach the audio part

**Files:**

- Modify: `src/message.rs`, `src/project/pool.rs`, `src/control/mod.rs`, `src/control/tests.rs`.
- Move `src/audio.rs` to `src/audio/mod.rs`; create `src/audio/sounds.rs`.

**Interfaces:**

- **Consumes:** Task 2's entries.
- **`message.rs`:** "Messages" above.
- **`pool.rs`:** `Sound::value(&self, id: ParamId) -> i32` and
  `Sound::set(&mut self, id: ParamId, value: i32)` (held within the entry's range);
  `Pool::get_mut(&mut self, number: SoundNumber) -> Option<&mut Sound>`.
- **`audio/sounds.rs`:** `pub struct Sounds`, the audio part's copy of the pool's values, in number
  order like the pool: `pub const fn new() -> Self`;
  `pub fn add(&mut self, sound: SoundNumber, values: [i32; SOUND_VALUES])` (numbers only grow, so it
  appends; it panics when full, as the control part never makes more sounds than the pool holds);
  `pub fn values(&self, sound: SoundNumber) -> &[i32; SOUND_VALUES]`;
  `pub fn set(&mut self, sound: SoundNumber, id: ParamId, value: i32)`.
- **`audio/mod.rs`:** `Audio` holds `Sounds` and applies `NewSound`, `CopySound` (a copy of `of`'s
  values in `Sounds`) and `SetParam` for a sound. Still silent; Task 9 adds the voices.
- **`control/mod.rs`:**
  - `change` and `item_view` read and write a value by its scope: `Device` in the settings, `Sound`
    in the selected sound of the current track.
  - A change sends `SetParam` with the value after the move, at the input's sample, unless the value
    did not move (S18).
  - New synth sends `NewSound`, Copy sends `CopySound`, after the pool accepted them.
  - The volume encoder (`input::VOLUME`) moves `OUTPUT_VOLUME` with `fine` false and sends its
    `SetParam` wherever you are, MENU, PAGE and the picker included (Workflow A).
  - A flip of Velocity sends its `SetParam` too (S18); the audio part ignores a device ID it does
    not use.

- [ ] **Step 1: Write the failing tests**

```rust
// control/tests.rs
#[test] fn new_synth_and_copy_tell_the_audio_part() { /* New synth → NewSound { sound: 1 }; push 2 → CopySound { sound: 2, of: 1 }; a full pool sends nothing */ }
#[test] fn a_turn_changes_the_selected_sound_and_sends_its_value() {
    // Syn 1 on pad 1; the pages come in Task 4, so call change() on
    // ItemDef { kind: Param(CUTOFF.id), encoder: None } with -10 clicks at sample 4_800:
    // pool Syn 1 CUTOFF == 60_415; SetParam { target: Sound(1), id: CUTOFF.id, value: 60_415 } at 4_800
}
#[test] fn a_value_at_its_end_sends_nothing() { /* CUTOFF at 65_535 moved +1: no message */ }
#[test] fn the_volume_encoder_sets_the_output_volume_everywhere() {
    // turn volume -3 with SHIFT held, then under MENU, then with the picker open:
    // OUTPUT_VOLUME moves 512 per click each time; three SetParam { target: Device, id: OUTPUT_VOLUME.id, .. }
}
// audio/sounds.rs and audio/mod.rs
#[test] fn the_audio_part_keeps_its_own_copy_of_every_sound() { /* NewSound 1, SetParam Sound(1) CUTOFF 100, NewSound 2: values(1)[cutoff] == 100, values(2) are the defaults */ }
#[test] fn a_copy_takes_the_values_the_audio_part_holds() { /* NewSound 1, SetParam CUTOFF 9_000 and CopySound { sound: 2, of: 1 } in one chunk: values(2)[cutoff] == 9_000 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib`. Expected: FAIL to compile.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Send groovebox sound values to the audio part"`

---

### Task 4: SOUND's pages

**Files:**

- Modify: `src/control/pages.rs`, `src/control/mod.rs`, `src/control/draw.rs`,
  `src/control/tests/sound.rs` in `crates/groovebox-core/`.

**Interfaces:**

- **Consumes:** Task 2's entries; Task 3's `change`.
- **`pages.rs`:** `pages(Screen::Sound, track)` gives Pad then "The pages" while the selected pad
  has a synth, and only Pad while it is empty (answer 1). `Engine::page_name(self) -> &'static str`
  is "Synth" (S1).
- **`control/mod.rs`:** `fn shown_page(&self, screen: Screen) -> usize` is the remembered page when
  it exists, else 0. Every place that used `view.page(screen)` to find the shown page (items, the
  header, the strip, the encoders, PAGE's tiles, the cursor) uses it; `View` keeps the remembered
  page untouched. PAGE + a dark step does nothing (plan 2).
- **Behaviour:** turns and − and + move every value of these pages with `param::moved` (S3); OK and
  pushes do nothing on them (S4). The strip and the page items read their values through `item_view`
  (Task 3) and their bars through `fn bar(entry: &Entry, value: i32) -> Bar` in `control/draw.rs`
  (S5).

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn sound_has_six_pages_while_the_pad_has_a_synth() { /* PAGE held on SOUND: tiles 1 Pad, 2 Synth, 3 Filter, 4 Filter envelope, 5 Volume envelope, 6 Voice; steps 1 to 6 lit */ }
#[test] fn each_page_holds_its_items_on_the_encoders() { /* for each page of "The pages": item names in order and encoders 0..=3 on the first four */ }
#[test] fn an_empty_pad_shows_only_the_pad_page_and_a_sound_brings_the_page_back() {
    // Syn 1 on pad 1, PAGE + 3 (Filter); hit empty pad 2: header "Sound Pad T1 2 Pads", PAGE shows one tile;
    // hit pad 1: header "Sound Filter T1 Syn 1 Pads"
}
#[test] fn lists_step_with_turns_and_minus_plus_and_ok_does_nothing_on_them() {
    // Synth page: encoder 1 +1 → Wave "Pulse"; +10 → "Supersaw"; Ok and push 1 change nothing and open nothing
}
#[test] fn counts_ignore_shift_and_smooth_values_go_finer() { /* Voice page: cursor down to Transpose, SHIFT + plus → "+1"; Filter page: SHIFT + encoder 2 −1 → Cutoff 65_503 */ }
#[test] fn the_filter_page_matches_its_geometry() {
    // header "Sound Filter T1 Syn 1 Pads"; item 2 at (2, 35) reads "2 Cutoff" and "100%" with a full ACCENT bar;
    // item 1 "Mode" "LP 24" with a FAINT track only; strip "Mode LP 24", "Cutoff 100%", "Resonance 0%", "Envelope amount +0"
}
#[test] fn oscillator_2_names_give_way_to_their_values() { /* Synth page item 8: the value "+0" whole, the name "Oscillator 2 fine…" shortened with "…" */ }
#[test] fn the_strip_on_step_follows_sounds_shown_page() { /* PAGE + 5 on STEP: STEP's strip reads Attack, Decay, Sustain, Release of the volume envelope; with an empty pad selected it is empty */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib control`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox SOUND pages for the synth"`

---

### Task 5: The pictures

**Files:**

- Create: `src/ui/plot.rs`. Modify: `src/ui/layout.rs`, `src/ui/mod.rs`, `src/control/pages.rs`,
  `src/control/draw.rs` in `crates/groovebox-core/`.

**Interfaces:**

- **`layout.rs`:** `pub const PICTURE: (i32, i32, i32, i32) = (164, 16, 315, 236);` (x, y, width,
  height).
- **`plot.rs`:** `pub fn draw_line(canvas: &mut impl Canvas, points: &[(i32, i32)], color: Color)`
  joins each point to the next with one vertical run per column, so a line has no gaps; a run is at
  least 2 px tall, as Look's curve is.
- **`pages.rs`:** `Picture` gains `FilterCurve` and
  `Envelope { attack, decay, sustain, release: ParamId }` (the page's own four).
- **`draw.rs`:**
  - **Filter curve:** x across the area is 20 Hz to 20 kHz on a log scale. y is the magnitude of the
    chosen mode at the set cutoff and resonance, from +12 dB at row 17 to −48 dB at row 250. Use the
    textbook two-pole response, `|H|` with `r = f / fc` and `Q` from resonance as the filter of Task
    6 sets it, squared for LP 24. A `FAINT` vertical line at the cutoff's x; the curve in `TEXT`.
    Envelope amount and key follow are not drawn.
  - **Envelope:** from (164, 250), attack, decay and release each take up to a quarter of the width
    in proportion to `p`, and the sustain hold a quarter. The hold is at the sustain's height; a
    `FAINT` vertical line where the release starts and a `FAINT` line along the bottom; the shape in
    `TEXT`.

- [ ] **Step 1: Write the failing tests**

```rust
// ui/plot.rs
#[test] fn a_line_has_no_gaps_between_columns() { /* (0, 0) to (10, 40): every column 0..=10 has ink and consecutive runs touch */ }
// control/tests/sound.rs
#[test] fn the_filter_curve_marks_the_cutoff_with_a_faint_line() { /* Cutoff 50%: FAINT at x 164 + round(0.5 × 314) in the area's middle rows; nothing drawn outside PICTURE */ }
#[test] fn low_pass_is_level_below_the_cutoff_and_falls_above_it() { /* LP 12 at 25%: the curve's y at x 170 is above (smaller than) its y at x 470 */ }
#[test] fn high_pass_rises_toward_the_cutoff() { /* HP at 75%: y at x 170 is below y at x 470 */ }
#[test] fn the_envelope_holds_at_the_sustain_level() { /* volume envelope, Sustain 60%: the hold's pixels lie at y = 250 − round(0.6 × 233) */ }
#[test] fn a_zero_attack_rises_straight_up() { /* Attack 0: column 164 has TEXT from the bottom to the top row */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib ui::plot control`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Draw the groovebox filter curve and envelope shapes"`

---

### Task 6: The building blocks of sound

Pure, sample-by-sample maths with no knowledge of parameters. Every float function from `libm`.

**Files:**

- Create: `src/dsp/mod.rs`, `src/dsp/osc.rs`, `src/dsp/filter.rs`, `src/dsp/envelope.rs`,
  `src/dsp/clip.rs` in `crates/groovebox-core/`. Modify: `src/lib.rs`.

**Interfaces:**

- **`osc.rs`:**
  - `pub enum Wave { Saw, Pulse, Triangle, Sine }`.
  - `pub struct Oscillator { phase: f32 }` with `pub const fn new(phase: f32) -> Self` and
    `pub fn next(&mut self, wave: Wave, increment: f32, width: f32) -> f32`, output within −1 and 1,
    `increment` the frequency over 48,000. Saw and pulse use PolyBLEP (Sound); triangle and sine are
    plain.
  - `pub struct Noise(u32)`: `pub const fn new(seed: u32) -> Self`, `pub fn next(&mut self) -> f32`
    within −1 and 1 (xorshift32; a zero seed becomes 1).
  - `pub fn seed(count: u32) -> u32`: MurmurHash3's 32-bit finaliser.
- **`filter.rs`:** `pub enum Mode { Lp12, Lp24, Hp, Bp }`; `pub struct Filter` (two trapezoidal
  state-variable stages, Zavalishin's form) with `pub const fn new()`,
  `pub fn tune(&mut self, cutoff_hz: f32, resonance: f32)` once per chunk (cutoff held within 20 Hz
  and 0.45 × 48 kHz; `k = 2 − 1.98 × resonance`) and
  `pub fn process(&mut self, mode: Mode, x: f32) -> f32`; LP 24 runs both stages, the others the
  first.
- **`envelope.rs`:** `pub struct Envelope` with `pub fn start(&mut self)` (attack from the current
  level, so a restart never clicks), `pub fn release(&mut self)` and
  `pub fn next(&mut self, attack: u32, decay: u32, sustain: f32, release: u32) -> f32` (times in
  samples). Attack rises linearly to 1; decay and release fall exponentially, to 1/1,000 of the way
  in their time; `pub fn is_done(&self) -> bool` once a release is below 1/10,000.
- **`clip.rs`:** `pub fn soft_clip(x: f32) -> f32`: unchanged within ±0.5; above,
  `0.5 + 0.5 × tanhf((|x| − 0.5) / 0.5)` with x's sign, so it never reaches 1 and its slope is
  continuous.

- [ ] **Step 1: Write the failing tests**

```rust
// osc.rs
#[test] fn a_440_hz_saw_crosses_zero_upwards_440_times_a_second() { /* within ±1 */ }
#[test] fn every_wave_stays_within_one_and_starts_at_phase_0() { /* each Wave at 100, 5_000 and 15_000 Hz for a second: finite, within ±1.0; two oscillators new(0.0) give identical output */ }
#[test] fn a_square_spends_half_its_time_high() { /* Pulse, width 0.5, 1 kHz: positive samples 50 % ± 1 % */ }
#[test] fn noise_repeats_for_its_seed_only() { /* new(7) twice: equal; new(8): differs; seed(0) != seed(1) */ }
// filter.rs
#[test] fn low_pass_passes_100_hz_and_cuts_10_khz() { /* LP 12 at 1 kHz: RMS of 100 Hz sine within 1 dB of the input; 10 kHz at least 30 dB down */ }
#[test] fn lp_24_falls_twice_as_steeply() { /* 10 kHz through LP 24 at 1 kHz at least 60 dB down */ }
#[test] fn high_pass_and_band_pass_keep_their_side() {}
#[test] fn full_resonance_at_the_top_stays_finite() { /* resonance 1.0, cutoff 21_600 Hz, white noise for a second: every sample finite */ }
#[test] fn silence_flushes_the_state_to_zero() { /* an impulse, then zeros: the output is exactly 0.0 within 2 seconds */ }
// envelope.rs
#[test] fn attack_rises_in_its_time_and_sustain_holds() { /* attack 480: level 1.0 at sample 480; decay 4_800 to sustain 0.6: within 0.6 ± 0.001 by 4_800 */ }
#[test] fn release_ends_the_note() { /* release 4_800 from 1.0: is_done within 6_400 samples */ }
#[test] fn a_restart_starts_from_the_current_level() {}
// clip.rs
#[test] fn quiet_signals_pass_and_loud_ones_stay_below_one() { /* soft_clip(0.3) == 0.3; soft_clip(100.0) < 1.0; soft_clip(-x) == -soft_clip(x); rises steadily */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib dsp`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the four modules**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib dsp`, then
  `cargo build -p groovebox-core --release --target thumbv7em-none-eabihf`. Expected: PASS; builds.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox oscillators, filter, envelope and soft clipper"`

---

### Task 7: One voice

**Files:**

- Create: `src/audio/synth.rs`, `src/audio/voice.rs` in `crates/groovebox-core/`.

**Interfaces:**

- **Consumes:** Task 2's entries and `param::real`; Task 6's blocks.
- **`synth.rs`:** `pub struct Synth` holds oscillator 1 as seven `Oscillator`s (only the first
  sounds unless the wave is Supersaw), oscillator 2, the sub (a square an octave down) and the
  noise.
  - `pub fn start(&mut self, seed: u32)`: plain oscillators at phase 0; the supersaw's saws and the
    noise from the seed (answer 6).
  - `pub fn render(&mut self, read: impl Fn(ParamId) -> i32, frequency: f32, stereo: bool, out: &mut [[f32; CHUNK]; 2])`.
  - Supersaw: seven saws detuned symmetrically by up to ±1 semitone at Shape 100%. Spread places the
    supersaw's saws, or oscillators 1 and 2, apart across left and right; sub and noise stay in the
    middle. Each source scaled so the default sound peaks near 0.25.
- **`voice.rs`:**
  - `pub struct Voice` and `pub enum State { Idle, Held, Released }`.
  - `pub fn start(&mut self, note: NoteId, track: u8, sound: SoundNumber, pitch: u8, velocity: u8, seed: u32, values: &[i32; SOUND_VALUES])`:
    copies the values; stereo when Spread is above 0 at this moment, fixed for the note (Sound).
  - `pub fn change(&mut self, note: NoteId, pitch: u8, velocity: u8, restart: bool, glide: bool)`:
    mono's change of note (Task 8 decides `restart` and `glide`).
  - `pub fn release(&mut self)`: Gate releases; One-shot ignores it.
  - `pub fn set(&mut self, id: ParamId, value: i32)`: starts that value's glide over the entry's
    `glide` samples in whole chunks, landing exactly on the value; 0 sets it at once.
  - `fn read(&self, id: ParamId) -> i32`: the one read step (Foundation); it returns the gliding
    home value and adds no modulation yet.
  - `pub fn render(&mut self, out: &mut [[f32; CHUNK]; 2])` adds one chunk.
  - `pub fn fade(&mut self, out: &mut [[f32; CHUNK]; 2])` adds one chunk fading straight to zero and
    goes `Idle` (S6).
  - Per chunk: the pitch in semitones is `pitch + Transpose + Fine tune / 100`, gliding linearly to
    a new note over Glide time when `change` asked for it; oscillator 2 adds its interval and fine
    tune; the filter is tuned from Cutoff
    `× 2^(8 × Envelope amount × filter envelope + Key follow × (pitch − 60) / 12 + 4 × Velocity amount × velocity / 127)`
    octaves.
  - Per sample: both envelopes; the gain is `Level × (1 − Velocity amount × (1 − velocity / 127))`
    times the volume envelope.
  - Pan is constant-power; a stereo voice uses it as balance.
  - One-shot counts sustain as 0, so the envelope always ends. The voice is `Idle` once the volume
    envelope is done.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_new_synth_note_sounds_at_once_and_ends_about_100_ms_after_release() { /* defaults, pitch 60: the first chunk is not silent; release at 4_800: Idle by 4_800 + 9_600 */ }
#[test] fn the_pitch_follows_note_transpose_and_fine_tune() { /* Sine, pitch 69: 440 zero crossings a second ±1; Transpose +12: 880; Fine tune +50: 453 ±1 */ }
#[test] fn oscillator_2_plays_its_interval() { /* Sine, pitch 69: the difference between Oscillator 2 level 100% with interval +12 and level 0% crosses zero upwards 880 times a second ±1 */ }
#[test] fn spread_makes_a_stereo_voice_only_from_its_start() { /* Spread 0: left == right; set Spread 50% while held: still equal; a new note: they differ */ }
#[test] fn a_cutoff_change_glides_over_four_chunks() { /* set CUTOFF from 65_535 to 0: the filter's cutoff falls over 128 samples, not at once */ }
#[test] fn one_shot_ignores_the_release() { /* Trigger One-shot, sustain 100%: release changes nothing; the note still ends after its decay */ }
#[test] fn velocity_amount_scales_the_level() { /* amount 100%: velocity 64 peaks at about half of 127's; amount 0: equal */ }
#[test] fn a_fade_reaches_zero_in_one_chunk() { /* the last sample of fade() is 0.0 and the voice is Idle */ }
#[test] fn the_supersaw_varies_with_the_seed_and_plain_waves_do_not() { /* Saw: seeds 1 and 2 give equal chunks; Supersaw: different */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `synth.rs` and `voice.rs`**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Play one groovebox synth voice through the shared chain"`

---

### Task 8: Thirty-two voices

**Files:**

- Create: `src/audio/voices.rs`. Modify: `budget.toml` (`voices = 32`).

**Interfaces:**

- **Consumes:** Task 7's `Voice`; Task 3's `Sounds`.
- `pub struct Voices` holds `[Voice; budget::VOICES]`, the held notes (at most 12 + 128, the control
  part's limit, each with its note, track, sound, pitch, velocity and a start count) and the count
  of notes started (S9).
  - `pub fn note_on(&mut self, note: NoteId, track: u8, sound: SoundNumber, pitch: u8, velocity: u8, sounds: &Sounds, fades: &mut [[f32; CHUNK]; 2])`.
  - `pub fn note_off(&mut self, note: NoteId, sounds: &Sounds, fades: &mut [[f32; CHUNK]; 2])`.
  - `pub fn set(&mut self, sound: SoundNumber, id: ParamId, value: i32)`: every voice of that sound.
  - `pub fn render(&mut self, out: &mut [[f32; CHUNK]; 2])`.
- **Poly:** each note takes a voice. With none idle, it takes the oldest released voice, then the
  oldest voice of the same sound, then the oldest voice; the taken voice `fade`s into `fades` first
  (S6).
- **Choke:** a note of a sound in group _n_ fades every voice on the same track whose sound is a
  different sound in group _n_ (S7).
- **Mono and Legato (answers 4 and 5, S8):** one voice per sound and track.
  - A new key, or letting go of the sounding key while another is held (back to the newest held
    one), calls `change`. Mono restarts the envelopes; Legato restarts them only when no key was
    held.
  - Glide applies when Glide time is above 0 and Glide is Always, or Overlapping with another key
    held (a return is always overlapping). Poly never glides.
  - Letting go of the last held key releases.
- **A note-off** only ever touches the voice that still plays that note; a note no voice plays is
  only taken off the held list.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn the_33rd_note_takes_the_oldest_voice_with_a_fade() { /* 33 notes: note 0's voice fades into `fades` in the 33rd note's chunk; 32 voices Held */ }
#[test] fn stealing_prefers_released_then_same_sound_then_oldest() {}
#[test] fn a_choke_group_fades_other_sounds_of_the_group_on_its_track_only() { /* Syn 1 and Syn 2 in group 1 on T1, Syn 3 in group 1 on T2: a Syn 2 note fades Syn 1, keeps Syn 3 and keeps other Syn 2 notes */ }
#[test] fn mono_plays_the_newest_held_key_and_returns_to_the_held_one() { /* hold 60, press 64, release 64: the voice plays 60 again and is still Held */ }
#[test] fn mono_restarts_the_envelopes_and_legato_keeps_them() {}
#[test] fn overlapping_glide_needs_a_held_key_and_poly_never_glides() {}
#[test] fn a_mono_sound_on_two_tracks_plays_one_voice_per_track() {}
#[test] fn a_release_never_touches_a_voice_its_note_no_longer_has() { /* note 0 taken by note 32: note_off(0) leaves every voice as it was */ }
#[test] fn set_reaches_only_the_sounds_voices() {}
#[test] fn every_start_gets_the_next_seed() { /* two hits of a supersaw differ; the same messages from a fresh Voices repeat exactly */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio::voices`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `voices.rs` and the budget entry**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Allocate, steal and choke groovebox voices and play mono and legato"`

---

### Task 9: The master path

**Files:**

- Modify: `src/audio/mod.rs`, `src/device.rs` (only if the size check needs it) in
  `crates/groovebox-core/`.

**Interfaces:**

- **Consumes:** Tasks 3, 6 and 8.
- `Audio` holds `Sounds`, `Voices` and the output volume (its value and a per-chunk glide over
  `OUTPUT_VOLUME.glide`). Per chunk it applies the due messages and reports them (as before), clears
  `fades`, renders the voices into the mix, adds `fades`, then `soft_clip`s each sample and
  multiplies by the output volume's gain, ramped linearly across the chunk.
- `Device` stays within `budget::WORKING_MEMORY`; if it does not, report the size and stop, as the
  budget is the owner's.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn a_new_synth_on_a_pad_is_heard() { /* NewSound 1, NoteOn sound 1 pitch 60: the next chunk is not silent; NoteOff: silent again within 9_600 samples */ }
#[test] fn the_output_volume_turns_it_down_after_the_clipper() { /* the same note at OUTPUT_VOLUME 65_535 and 32_768: the second is a quarter of the first, sample for sample after the glide */ }
#[test] fn the_loudest_mix_stays_within_one() { /* 32 stereo supersaws, Level 100%, Resonance 100%: every sample finite and within ±1 */ }
#[test] fn the_output_does_not_depend_on_the_batch_size() { /* the same messages rendered in batches of 32 and of 128: equal bits */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL.

- [ ] **Step 3: Implement**
- [ ] **Step 4: Run them to verify they pass**

  Run: `cargo test -p groovebox-core --lib`, then
  `cargo clippy --workspace --all-targets -- --deny warnings`. Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

  `git commit -m "Mix the groovebox voices through the soft clipper and output volume"`

---

### Task 10: Drift scenes, gallery and the operation count

**Files:**

- Create: the eight scenes of "File structure" and `crates/groovebox-drift/tests/operations.rs`.
- Modify: `crates/groovebox-drift/src/wasm.rs`, `budget.toml`,
  `apps/groovebox/source/gallery/states.ts`.
- Re-bless: every existing scene whose audio changes now that pads sound.

**The scenes**, driven by the panel and MIDI only (Sound, "Testing"):

- **`synth-pages`:** New synth; a frame of each page 2 to 6 under PAGE + step, Filter with the
  cursor on Cutoff and Volume envelope with Sustain at 60% (for Look's two pictures); PAGE held on
  SOUND.
- **`synth-waves`:** each wave held for half a second; Shape, Spread, Sub, Noise and oscillator 2
  turned while a note holds.
- **`filter`:** the four modes; a cutoff sweep on a held note; resonance; envelope amount with the
  filter envelope; key follow across KEYS notes; velocity amount at velocities 30 and 127.
- **`voices`:** 40 MIDI notes in KEYS mode (stealing); two sounds in choke group 1 on one track.
- **`mono`:** Mono and Legato with overlapping MIDI notes, the return to a held key, glide Always
  and Overlapping, and Poly ignoring glide.
- **`triggers`:** Gate and One-shot with short and long holds.
- **`volume`:** the volume knob turned down and up; 32 loud notes into the clipper.
- **`worst-case`:** KEYS mode, Supersaw, Spread 50%, Resonance 100%, Release 10 s, then 32 MIDI
  note-ons, held for a second.

**The operation count (S14):**

- `WasmRunner` turns on `Config::consume_fuel`, gives the store `u64::MAX` fuel and records the fuel
  each `audio_render` call uses. `pub fn busiest_render(&self) -> u64` is the largest.
- `operations.rs` plays `worst-case.scene` in the stable build and fails when `busiest_render`
  exceeds `budget::WORST_BATCH_OPERATIONS`, printing both numbers.
- `budget.toml`: `worst_batch_operations` is the first measurement rounded up to the next 10 %, with
  a comment saying so. Raising it later is a deliberate edit.

**The gallery:** `STATES` gains the five page frames of `synth-pages` and its PAGE held frame;
Filter with `approved: 'sound-filter.png'`, Volume envelope with
`approved: 'sound-volume-envelope.png'`, PAGE held with `approved: 'page-held.png'`.

- [ ] **Step 1: Write the scenes, `operations.rs` and the fuel count**
- [ ] **Step 2: Bless and compare**

  Run: `node build.js && node build.js --fallback`, then `cargo test -p groovebox-drift` with
  `GROOVEBOX_BLESS=1`. Then:
  - `git diff scenes/*.fingerprints` for the existing scenes: `audio` and `applied` lines may change
    (pads sound, and New synth, Copy and Velocity now send messages); a changed `frame` or `lights`
    line is a bug.
  - Open the new frames beside `sound-filter.png`, `sound-volume-envelope.png` and `page-held.png`:
    items, header and strip match pixel for pixel where both show the same thing; the curves by eye
    (S11).
  - Listen to `synth-waves`, `mono` and `voices` in the app (`npm run develop` in `apps/groovebox`,
    the same moves by hand): no clicks at note starts, steals or chokes.

- [ ] **Step 3: Run without blessing**

  Run: `cargo test -p groovebox-drift`, and in `apps/groovebox`
  `npx vitest run tests/gallery.test.ts`, `npx eslint source/gallery/states.ts` and
  `npm run typecheck`. Expected: PASS, 0 errors.

- [ ] **Step 4: Commit**

  `git commit -m "Add the groovebox sound scenes and count the worst case"`

---

### Task 11: Changeset and the last checks

**Files:**

- Create: `.changeset/groovebox-sound.md`: `'groovebox-core': minor` and `'groovebox': minor`,
  "Added the synth engine, the shared voice chain and the SOUND pages of the groovebox."

- [ ] **Step 1: Write the changeset**
- [ ] **Step 2: Run the package checks once**

  Run: `cargo clippy --workspace --all-targets -- --deny warnings` and `npm test` in
  `packages/groovebox-core`; `npm run lint` and `npm run typecheck` in `apps/groovebox`. Expected:
  all pass, and `git status --porcelain` is empty afterwards.

- [ ] **Step 3: Commit**

  `git commit -m "Add a changeset for the groovebox sound"`
