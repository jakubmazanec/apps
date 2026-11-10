# Groovebox part 1 – Rust core and browser virtual device

Status: overview. Part 1 is designed in six subpart specs, listed below. This document holds what
they share: the intent, goals, architecture, which spec owns which question, and a register of every
decision and open question so far. See [the project overview](./2026-10-25-groovebox-overview.md)
for the whole picture and for parts 2–4.

Throughout, **(decided)** marks something the owner decided, **(my call)** marks a default proposed
during design that the owner has not confirmed, and **(open)** marks a question still to be
answered. Every "my call" and every open question is settled in the brainstorm of the spec that owns
it. Anything unmarked follows directly from the decided points.

**Everything here may change.** The point of part 1 is to find out what the workflow should be, so
even decided points – especially how patterns and sounds are structured – are expected to move as
the owner experiments. Where the owner was unsure, this document says so. The core's data model and
project format must be easy to evolve, not tuned to today's answers.

## Intent

The groovebox will end up as a physical device, but its workflow has to be designed, played with,
and iterated on first. Part 1 builds that workflow as a virtual device that runs in the browser,
driven by the same Rust code the hardware will later run. Experimenting in the browser must teach
true things about the device: how it sounds, how it is played, what fits on its screen, what its
controls do. What part 1 teaches then decides the physical layout and look (parts 3 and 4).

## Goals

- A playable virtual groovebox in the browser with a very simple but complete workflow: from an
  empty project to a looping, multi-track pattern built from samples and synthesis **(decided)**.
- One Rust core that will later run unchanged on the device's microcontroller **(decided)**.
- Fast iteration on the panel and the workflow: moving controls and rebinding them is cheap
  **(decided)**.
- **Every parameter of everything is reachable and settable on the device** **(decided)**, even when
  a faster way to change it also exists (such as a pattern growing while recording). The one
  exception is a note's pressure, recorded but not edited until modulation arrives (Workflow B).

## Non-goals for this version

- Song mode and pattern chaining **(decided)**.
- Recording from a microphone or line input, and resampling **(decided)**. Both are required on the
  device and come in a later version; the first version uses samples loaded from files.
- The features Workflow B puts after the first version: per-track lengths, growing while recording,
  swing, step extras, a choice of when a pattern switch happens, scales and chords, a changeable
  grid, note repeat and the arpeggiator, automation, randomization, hidden notes, per-pattern time
  signatures, editing pressure and more levels of undo **(decided)**.
- Typing names for sounds and projects. Names are automatic in part 1; see Workflow A.
- Migrating old projects and sharing files between different versions. A format change in part 1 is
  a clean break; projects in an old format can only be deleted **(decided)**. Both come with the
  companion in part 2; see the Project model.
- The companion features (part 2), hardware (part 3), and enclosure (part 4).

## Anti-goals

- **Browser and device drifting apart.** Any behaviour that exists only in the browser – a sound,
  timing, a screen, a control behaviour – defeats the point of the virtual device.
- **Features that need the browser.** The device must be fully usable standalone **(decided)**;
  nothing in the core may depend on the browser shell to work.
- **Running out of memory.** A user must never have to worry about memory, even for very long songs
  **(decided)**. The one limit a user meets is the size of the sample library, as on the EP-133: one
  meter, and a refusal only at import **(decided)**.

## How part 1 is designed

- Part 1 is split into the six subparts below. Each gets its own brainstorm with the owner and its
  own written spec **(decided)**.
- All six specs are written first, in the order below. Implementation plans for all of them are
  written only after the last spec, and implementation follows all planning **(decided)**.
- Each spec ends with a list of what it assumes about the other specs **(decided)**.
- After the last spec, one pass checks all specs and this overview against each other before any
  plan is written **(decided)**. That pass was done on 2026-11-10: its decisions are written into
  the specs and this overview, and the points it left open are listed under "Open points for
  planning" at the end of this overview.
- Each spec is linked from its section of the register once it is written.

## Subparts

In the order the specs are written **(decided)**:

1. **Foundation.** Mostly the builder's decisions, approved by the owner. The interface between the
   core and the browser and what runs where; the memory model and budgets; how the core produces its
   screen; the time base, sample rate and numerics; the parameter mechanism; the storage interface;
   budget measurement, drift tests and a bare-metal build check; the Rust toolchain inside this
   monorepo; the licence.
2. **Sound.** The engines and the shared voice chain; the parameter list; polyphony and one sound
   cutting off another; sample playback rules; mixing and output.
3. **Workflow A: playing and sounds.** Selection, modes, navigation and the list of screens; how
   every parameter is reached on the screen and which ones the four encoders hold; the sound list
   and creating sounds; pad mappings; velocity.
4. **Workflow B: sequencing and patterns.** Transport and tempo; step entry and editing notes;
   recording rules; patterns and what belongs to a pattern or to the project; a list of experiments
   the owner wants to try.
5. **Project model and saving.** What a project contains and how its parts refer to each other; the
   note store; a versioned format that can be migrated; the storage layout; device settings kept
   separate from the project.
6. **Look and panel.** The emulated resolution, colour format, pixel font and palette; how each
   screen is drawn; the panel layout; mouse, keyboard and MIDI input; dropping sample files in;
   development meters.

Foundation comes first because it sets the limits the other specs work within. Sound comes before
the workflow specs because its parameter count and sample pitch rules shape how parameters are
reached and how KEYS mode works. Project model comes after the workflow specs so the data model
follows how things are used. Look comes last because it draws the screens the workflow specs define.

### Questions that span specs

| Question                                            | Owner                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Interface between core and browser; what runs where | Foundation                                                                          |
| Memory model and budgets                            | Foundation; Project model places the note store in it                               |
| Screen resolution and colour format                 | Foundation: how the core draws; Look: the resolution, colour format and palette     |
| Time                                                | Foundation: the time base; Workflow B: grids and quantize                           |
| Parameters                                          | Foundation: the mechanism; Sound: the list; Workflow A: how they are reached        |
| Bindings                                            | Workflows A and B: actions and bindings, in code; Look: the panel layout, in code   |
| Storage                                             | Foundation: the interface and its browser backend; Project model: the layout        |
| Projects, patterns, tracks, sounds                  | Workflows A and B: what they mean; Project model: how they are represented          |
| Voices, polyphony, mixing                           | Sound, within Foundation's budgets                                                  |
| Screens                                             | Workflows A and B: which screens exist and what they show; Look: how they are drawn |
| Velocity                                            | Workflow A: behaviour; Look: mapping input devices                                  |

### Milestones

The plans are written after all specs, ordered so that something is playable after the first
milestone **(decided)**. What each milestone contains is **(my call)**:

1. **Make a sound:** a synth sound played on the pads in KEYS mode, its pages with the cursor, the
   encoders on the items they hold, the header and the strip, the panel drawn from code, mouse,
   keyboard and MIDI input.
2. **Samples and the pool:** storage and file drop, the library loaded into RAM at start-up, the
   sample engine, the sample preview, the sound list and creating sounds, track selection, pad
   mappings, PADS mode.
3. **A looping pattern:** transport, tempo and the metronome, time signatures and length, the
   PATTERN screen's TIMING and BARS pages, step entry and the NOTE strip, the STEP view, track level
   and mute, track effects.
4. **Play it in:** live recording, quantize, overdub and the count-in, the ROLL view and the NOTE
   panel, undo, erasing, clearing and copying.
5. **Keep it:** several patterns and switching between them, the pattern list, autosave, and NEW,
   OPEN and COPY of projects.

## Architecture

1. **Everything that defines the device lives in the Rust core (chosen).** The core holds the sound
   engines, the sequencer, the screen rendering (into a 480×272 frame buffer, e.g. with
   `embedded-graphics`), and the handling of buttons, encoders, and pads including the remappable
   bindings. A thin TypeScript shell runs the core's audio part in an AudioWorklet and its control
   part in a worker, blits the frame buffer to a canvas, draws the panel, and forwards clicks,
   keyboard and MIDI input as abstract control events. The browser version is then the device minus
   the hardware. The cost is that UI changes mean Rust changes and a WASM rebuild.
2. **Rust for sound and sequencing, TypeScript for screen and controls.** The fastest iteration, but
   the screen and control logic – the workflow itself – would have to be rewritten in Rust for the
   device, and the two would drift. Rejected because it works against the reason the virtual device
   exists.
3. **All Rust, including the shell** (e.g. egui or macroquad compiled to WASM). One language, but
   browser features (AudioWorklet, Web MIDI, WebUSB, file drag-and-drop, the later companion
   features) become awkward, and the shell is the part that benefits most from being ordinary web
   code. Rejected.

The owner picked approach 1 **(decided)**. Panel layout, bindings and colours are code, changed by
editing code; experimenting means changing code, not data files **(decided; see Foundation)**.

Go was considered for the core and rejected: its garbage collector risks audio dropouts, and its
WASM and microcontroller support (TinyGo) is a poor fit for real-time audio.

## Decision register

### 1. Foundation

Spec: [Foundation](./2026-11-02-groovebox-foundation-design.md). In short:

- **Rust** **(decided)**. The core is `no_std` and never allocates memory while running, so it can
  build for bare-metal firmware as well as for WASM.
- **No hardware is chosen** **(decided)**: not the processor, the board or the display. Numbers that
  depend on hardware live in a budget profile, which replaces the earlier STM32H7 reference target.
- **Chromium only**, and **bit-identical** output in every build, checked by drift tests
  **(decided)**.
- The core has an audio part and a control part linked by one-way queues. In the browser the audio
  part runs in an AudioWorklet and the control part in a worker, on one shared WASM memory
  **(decided)**.
- **Memory generous enough to never worry about.** Note data must not impose a practical limit on
  pattern length **(decided)**; samples are what size the memory. The whole sample library lives in
  RAM, as on the EP-133, with its copy on storage for power-off; samples are 16-bit, and the library
  is capped by the sample RAM, provisionally 64 MB for the whole device; long recordings are decided
  with recording and hardware **(decided)**.
- **The display must match a real, purchasable part** **(decided)**. 4.3″, 480×272 is the current
  idea and provisional, like all hardware **(decided)**.
- 48 kHz, 1920 ticks per beat, tempo in hundredths of a BPM, whole-number conversion from ticks to
  samples **(decided)**.
- Screens draw through a drawing interface into the core's own buffer in the display's pixels
  **(decided)**.
- One master list of parameters with permanent IDs and whole-number values **(decided)**.
- The core sees only abstract controls: button _n_ pressed or released, encoder _n_ turned by _d_,
  pad _n_ hit with velocity _v_, pad _n_ pressure _p_, pad _n_ released. Bindings connect controls
  to actions in one place in the code; bindings, colours, pages with the items their encoders hold
  and the browser panel layout are all code **(decided)**.
- The core reaches storage through requests and replies **(decided)**.
- **GPL-family licence** **(decided)**. The code is GPL-3.0-or-later; the hardware files (parts 3
  and 4) will be CERN-OHL-S-2.0, its hardware counterpart **(my call)**. Dependencies must be
  compatible with the GPL.
- The project lives in this monorepo: a Rust package from a new alpha Carson Rust template and a
  Carson-generated browser app. Part 1 runs locally only **(decided)**. It can move to its own
  repository later, when firmware and hardware files join it.

### 2. Sound

Spec: [Sound](./2026-11-03-groovebox-sound-design.md). In short:

- **Samples and synthesis are equal, first-class sound sources** **(decided)**. Engines make only
  the raw tone; one shared voice chain (filter, two envelopes, trigger mode, level and pan, tuning,
  play mode, choke group) follows every engine **(decided)**.
- The architecture is the final product's; part 1 builds a small part of it. Sounds are made of
  layers (one in part 1); engines and effect types describe themselves **(decided)**.
- Part 1's engines: virtual analog with supersaw, and a mono or stereo sample player **(decided)**.
  The JD-Xi is the reference for the sound character the project aims at over time **(decided)**.
- Poly or mono per sound, within what the engine allows; mono has legato and glide **(decided)**.
- A fixed count of 32 voices, provisional **(decided)**.
- Each track has 6 effect slots in series, any effect in any slot; part 1 has delay and reverb.
  Muting silences only the pattern and lets tails ring out; pads and keys played by hand still
  sound **(decided)**.
- Per-track level and mute; master level, then the sample preview and the metronome click, a soft
  clipper and the output volume **(decided)**.
- WAV import, converted once to 48 kHz and 16-bit with channels kept **(decided)**.

### 3. Workflow A: playing and sounds

Spec: [Workflow A](./2026-11-03-groovebox-workflow-a-design.md). In short:

- **Sounds live in one pool shared by the whole project** **(decided)**. Any track can play any
  sound; editing a shared sound changes it everywhere it is used **(decided)**.
- Making, choosing and editing sounds happens in the core, on the device's own screens and controls,
  never in the browser shell.
- **Two routes, both shallow** **(decided)**: buttons for what you do while playing, screens for
  everything. Every screen is two presses away with MENU + step; no menu diving.
- **Selection** **(decided)**: T1–T4 select the track; hitting a pad in PADS mode selects its sound;
  each track remembers its sound, pad mode and octave. KEYS mode plays the selected sound; to change
  it, go back through PADS.
- **Each track has its own pad mapping** **(decided)**. In PADS mode each pad plays a different
  sound of the current track; in KEYS mode the 12 pads are one chromatic octave of the selected
  sound, shifted with PADS/KEYS + up or down, a binding Workflow B moved there **(decided)**. Both
  modes write the same kind of notes.
- **Screens** **(decided)**: STEP, ROLL, SOUND, FX, MIX, POOL, PROJECT and SETTINGS, plus Workflow
  B's PATTERN and the Project model's SAMPLES. ROLL keeps its own button; STEP has none and is
  MENU + 1 (Look). Each screen has a header, a main area and a strip; the strip shows the items the
  encoders hold, up to four, and nothing else, and under STEP and ROLL those are the selected
  sound's.
- **The screen is the interface** **(decided)**: the arrows move a cursor over everything on the
  screen, OK uses an item, CANCEL backs out and − and + change values at once. The encoders are
  shortcuts for up to four items of the page, named in code: a turn changes an item, a press is OK
  on it. In pickers and questions they do nothing. No value is ever confirmed. The strip is only the
  encoders' display: the cursor never goes there, it is empty where the encoders hold nothing, and
  every strip has a screen route.
- **Pages and encoders** **(decided)**: a page is a group of related settings, of any number, and
  scrolls when it does not fit the screen; pages group, they never paginate. PAGE + step picks a
  page on every screen. Each page names in code which of its items the four encoders hold; an
  encoder holds only an item that is on the page. The encoders have push switches and turn in fixed
  steps, 16 times finer with SHIFT.
- **Sounds are made from the pad** **(decided)**: the PAD page's picker offers NEW SAMPLE, NEW SYNTH
  and the pool; COPY gives a pad its own copy of a shared sound; ENGINE switches a sound between
  sample and synth; names are automatic. The sample picker plays each highlighted sample. POOL is
  for overview and housekeeping, and highlighting a sound there selects it; its DELETE and REMOVE
  UNUSED are reached through its list, since a list holds nothing for the encoders. New projects
  start empty.
- **Effects** **(decided)**: a CHAIN page sets each slot's type and the order; one page per slot,
  holding all of its effect's settings.
- **Mix** **(decided)**: SHIFT + T1–T4 mutes; MIX is one page with the four track levels, on the
  encoders, and the master level; a dedicated fifth encoder sets the output volume after the soft
  clipper, as a device setting.
- **Projects** **(decided)**: autosave; NEW, OPEN, COPY and DELETE on PROJECT.
- **Velocity** **(decided)**: one switch, from how the pads are hit or none. Notes store pressure
  from part 1 **(decided)**.

### 4. Workflow B: sequencing and patterns

Spec: [Workflow B](./2026-11-05-groovebox-workflow-b-design.md). The owner is not yet sure how
patterns should work, so everything here is a starting point and expected to change. In short:

- **Four tracks** in the first version **(decided)**.
- **Version 1 has one shared length and a fixed loop** **(decided)**. The later features are listed
  under the non-goals. Quantizing on playback, parameter locks and pad mappings per pattern are not
  done **(decided)**.
- **A pattern is its notes and its length;** the tempo, the time signature, the effects and the mix
  belong to the project **(decided)**. Patterns are unlimited, and 1 to 16 always exist
  **(decided)**. Pattern length has no fixed limit; it is bounded only by the generous note memory
  **(decided)**.
- **Time signatures** from 1 to 16 over 4 or 8, per project; lengths in whole bars; tempo in quarter
  notes **(decided)**. Changing the signature or the length keeps each note's place in its bar and
  deletes what no longer fits, after a question **(decided)**.
- **The step buttons are always one bar** of sixteenths for the selected sound. Every bar starts on
  button 1, and a long bar continues on a short second page **(decided)**.
- **One GRID setting,** as on the EP-133, for step entry, quantize and later note repeat and the
  arpeggiator; 1/16 in version 1 **(decided)**.
- **Holding TEMPO** shows tempo, grid, swing and quantize, and a tap turns the metronome on or off
  **(decided)**. 30 to 300 BPM, a metronome and a one-bar count-in **(decided)**.
- **STEP and ROLL** are one scrolling view at a fixed scale, whose rows are sounds on STEP and
  pitches on ROLL. The cursor is a cell; the step buttons show the cursor's bar and follow the music
  while playing **(decided)**.
- **Notes are entered** with the step buttons or with OK on a cell, removed with a tap or CANCEL,
  and edited on the NOTE strip while a step is held or in the NOTE panel **(decided)**. Pressure is
  recorded but not edited in version 1 **(decided)**.
- **Recording:** REC drops in and out while playing and arms when stopped; overdub; quantize snaps
  to the nearest grid position for good **(decided)**.
- **One level of undo** with SHIFT + CANCEL. CANCEL held with a pad or a track button erases and
  clears; a new COPY button copies bars, sounds' notes and tracks, and SHIFT + COPY pastes
  **(decided)**.
- **Patterns switch** with SHIFT + step at the end of the playing pattern. The PATTERN screen
  (MENU + 9) holds the timing, the bars and the pattern list **(decided)**.
- **The strip is never a cursor target,** and every strip has a screen route **(decided)**.
- **A button that also does something when held acts when you let go** **(decided)**.

### 5. Project model and saving

Spec: [Project model](./2026-11-06-groovebox-project-model-design.md). In short:

- **Two memories:** storage keeps the files (the library's copy, the projects, the settings); RAM is
  what the engine plays from. At start-up the whole library is loaded from storage into RAM, so
  opening a project loads nothing and picking a sample never loads; the library is capped by the
  sample RAM, provisionally 64 MB, and import is the only place a file is refused for room
  **(decided)**.
- **Internal storage, nothing removable,** as on the EP-133: one sample library shared by every
  project, the projects beside it **(decided)**. Samples get in now by dropping files on the shell;
  projects out, backup and restore are the companion's job in part 2 **(decided)**. A SAMPLES screen
  (MENU + 10) deletes library files after a question, like POOL and PROJECT **(decided)**.
- **Deleting a sound in use** removes its pads and notes too, after a question that counts them; the
  project never holds a note whose sound is gone **(decided)**. "Used" means on any pad of any track
  or played by any note of any pattern.
- **A project remembers where you were:** the current pattern, track and screen, each screen's page,
  the cursor and view, following **(decided)**. Playback, the clipboard and undo are never saved.
- **A missing sample** leaves its sound silent and marked MISSING; the project opens and plays, and
  the sound is repaired from its own sample parameter **(decided)**.
- **Sounds and patterns have numbers that are never reused;** pads, notes and the selected sound
  refer to sounds by number; a note stores its bar and its place in the bar.
- **The note store:** the screen side owns the notes in copy-on-write blocks of one fixed pool
  (provisionally 8 MB, about 500,000 notes); the sound side plays published versions and switches at
  a moment computed from the input's timestamp, recorded so replays match; pattern length costs
  nothing. Undo and the clipboard keep hold of older versions; an undo budget triggers "CAN'T UNDO";
  when memory runs out redo, then undo give way and then new notes are refused, never the clipboard.
- **Files:** one binary chunk format with a version number and a checksum per chunk; a project is a
  folder of small files saved all-or-nothing, pattern files first, with a previous copy of the
  project and settings files. **No migrations in part 1** **(decided)**: an old-format project can
  only be deleted; the library survives format changes.
- **Sample files** are WAV with a private chunk holding the original name and a 128-bit fingerprint
  of the audio.
- **Autosave** runs 2 seconds after the last change and at least every 10 seconds while changes
  continue, from a consistent snapshot **(decided)**.

### 6. Look and panel

Spec: [Look and panel](./2026-11-07-groovebox-look-design.md). In short:

- **The display is the 4.3″ 480×272 IPS panel** **(decided)**, confirmed against real parts from
  many vendors in one 105.5 × 67.2 mm footprint; nothing is doubled, every element is drawn in the
  display's own pixels. The frame buffer is 8-bit indexed with a 256-entry palette, 128 KB.
- **The font is monogram** **(decided)**: 7 px capitals, monospaced 6 px, every Czech letter, CC0,
  from this repo. Mixed case everywhere; full names, shortened with "…" only when they do not fit.
- **Minimal and flat** **(decided)**: black, no bevels, no shading, lines only where they carry
  meaning. Every element sized to its content, 1 px gaps, free space between elements, 3 px around
  the capitals, 13 px text rows; a parameter item is name, value and a 2 px bar everywhere, with its
  encoder's number on an item an encoder holds; the cursor is an orange outline 1 px outside
  whatever it is on; the inverted orange block means only "selected".
- **Colour** **(decided)**: black, three greys, one orange accent, red for recording and errors;
  twelve sound colours that belong to the sound, not the pad, used on ROLL.
- **The header** is one row: where you are at the left, the transport at the right, the page named
  after the screen; messages replace the transport group. Accepted for now, expected to change.
- **STEP** at 8 px per sixteenth draws the pages of 16 the step buttons show; **ROLL** one 13 px
  row per semitone **(decided)**. Pictures on SOUND are cheap and informative only.
- **The panel is the owner's layout** **(decided)**, 321 × 128 mm: the volume encoder and the
  transport row top left; the display in the middle; the four encoders in a row top right with
  T1–T4, PADS/KEYS, ROLL, MENU, PAGE, COPY and SHIFT under them; the 16 step buttons over the 12
  pads with the cursor cluster (−, ▲, +, OK over ◀, ▼, ▶, CANCEL) at their right end. **There is
  no STEP button**: STEP is MENU + 1. Layout D is replaced.
- **Lights are single colour, on or off** **(decided)**; dimming only if the hardware gives it for
  free. Only pads, steps, T1–T4, REC, PLAY, TEMPO, ROLL and PADS/KEYS have lights.
- **The browser shell** zooms the screen by whole monitor pixels only; mouse, computer keyboard and
  USB MIDI map to the abstract controls, with velocity and aftertouch from MIDI; WAV files dropped
  on the page go into the library; development meters are a Dev page on SETTINGS **(decided)**.
- **The repo holds the spec and a folder of PNGs**, one per approved screen state, the first screen
  gallery **(decided)**.
- Buttons with tiny displays are an idea for later; if they come, the core renders their labels the
  same way it renders the main screen.
- **(open, later)** Whether people can remap controls on the device itself.

## Glossary

- **Control:** a button, encoder or pad, as the core sees it.
- **Action:** what the core does when a control is used, such as starting playback.
- **Binding:** the connection between a control and an action, defined in code.
- **Sound:** a source followed by the shared voice chain. Sounds live in the pool.
- **Source:** the sample player or synth engine at the front of a sound.
- **Pool:** all sounds of a project.
- **Note:** a time, length, pitch, velocity, pressure curve and sound.
- **Track:** a lane of notes; there are four.
- **Pattern:** the notes of the four tracks and a length.
- **Project:** the pool, the patterns and everything they share, such as the tempo, the time
  signature, the effects and the mix.
- **Bar:** one bar of the project's time signature; a pattern is a whole number of bars.
- **Grid:** where step-entered notes land and what recording snaps to; 1/16 in version 1.
- **Pad mapping:** which sound each of the 12 pads plays in PADS mode; each track has its own.
- **PADS mode:** each pad plays a different sound of the current track.
- **KEYS mode:** the 12 pads are one chromatic octave of the selected sound.
- **Screen:** what the display shows, one at a time: STEP, ROLL, SOUND, FX, MIX, POOL, PROJECT,
  SETTINGS, PATTERN or SAMPLES.
- **Storage:** the device's internal memory that keeps files when the power is off: the library's
  copy, the projects, the settings.
- **RAM:** the memory the engine plays from; the whole library is loaded into it at start-up and
  stays there.
- **Library:** every sample on the device, shared by all projects; it lives in RAM, with a copy on
  storage, and is capped by the sample RAM.
- **Library meter:** how full the library is, one number shown on POOL, on SAMPLES and in the sample
  picker.
- **Preview player:** the one player beside the 32 voices that plays the highlighted sample of the
  sample picker or the SAMPLES screen, from RAM, mixed after the tracks.
- **Fingerprint:** a 128-bit value computed from a sample's audio, written into the file and into
  the sounds that use it.
- **Block:** a fixed half-kilobyte piece of note memory; notes, their index, pressure curves and
  pattern records are all made of blocks.
- **Version:** the state of one track's notes as the sound side plays it; an edit publishes a new
  version from a given moment.
- **SAMPLES screen:** the library by folder, with DELETE for a file.
- **Page:** a group of related settings on a screen, of any number; it scrolls when it does not fit.
  Each page names which of its items the encoders hold.
- **Strip:** the bottom of the screen, showing the items the encoders hold, up to four, and nothing
  else; empty where they hold nothing; never a cursor target.
- **Cursor:** what the arrows move over the items on a screen; OK uses the item under it.
- **Picker:** a list opened from an item, moved through with the arrows and − and +, chosen from
  with OK, closed once you pick; the encoders do nothing in it. While it is open the music carries
  on, pads still play and buttons that lead elsewhere wait.
- **Cell:** one row by one grid step on STEP or ROLL; what the cursor stands on there.
- **NOTE strip:** the strip while a step is held, showing its notes' pitch, velocity, length and
  position.
- **NOTE panel:** the second level opened from a cell, listing the same four values for the arrows
  and − and +.
- **Clipboard:** the last copy: a bar, a sound's notes, a track or a pattern.
- **Following:** the view moving along with the music while playing.
- **Selected sound:** the sound the encoders edit, the step buttons enter and KEYS mode plays.
- **Output volume:** how loud the device plays, set by its own knob; a device setting.
- **Cursor outline:** the orange outline 1 px outside the item, cell, row or tile the cursor is on.
- **Selected block:** the inverted orange block behind the selected sound's name on STEP.
- **Dev page:** the page of SETTINGS with the development meters: library and note memory.

## Open points for planning

The consistency pass of 2026-11-10 found the points below stated by no spec. None contradicts a
spec. Each carries a proposed reading that is not yet approved; the plan that reaches a point
settles it with the owner. One needs a real decision: the MIDI note mapping under "Browser shell".

### On the device

- **The first STOP and the preview.** With the sample picker open while the music plays, does STOP
  end the preview? Proposed: no; a second STOP silences it.
- **SHIFT + PLAY in a picker or question.** PLAY works there and "every other combination" waits;
  SHIFT + PLAY is named in neither. Proposed: it waits.
- **When a combination acts.** Steps, CANCEL and COPY act when let go; MENU, PAGE and SHIFT are in
  neither list. Proposed: a combination acts when its second control goes down.
- **Two hold buttons at once.** Such as CANCEL and COPY held, then a pad. Proposed: the one pressed
  first counts; the other is ignored until both are let go.
- **CANCEL or COPY held + a step button.** No meaning is given. Proposed: nothing happens and the
  step's own tap does not fire.
- **MENU or PAGE held with other controls.** Do the arrows, OK, − and +, the encoders and the pads
  act on the covered screen? Proposed: pads, keys and transport work; the rest waits.
- **MENU or PAGE held + a dark step.** A step with no screen or page; what PAGE held shows on MIX
  (one page) and the lists (none). Proposed: the press does nothing; the display: none yet.
- **SHIFT + arrows outside STEP and ROLL.** Unsaid for pages, lists, pickers and the NOTE panel.
  Proposed: they do nothing, so the combination stays free.
- **An encoder whose item is not on the screen.** Under STEP and ROLL, or with TEMPO or a step held,
  the cursor cannot move to the item. Proposed: the value changes; the cursor stays.
- **The CANCEL + pad question.** When it appears and what letting go of CANCEL does. Proposed: it
  appears on the hit and waits for OK or a new tap of CANCEL; no notes, no question.
- **Held − and +.** The repeat delay and rate are named for the arrows only. Proposed: − and + use
  the same two constants.
- **REC during the count-in.** What the light and the header dot do. Proposed: the light blinks and
  the dot stays dim through the count-in; steady and red from the first beat.
- **Blink speeds.** "Blinks slowly" and "blinking" have no rate: one speed or two, in time with the
  tempo or not. Proposed: named constants counted in samples; the speeds: none yet.
- **How long a header message stays.** Nothing says what clears it. Proposed: a progress message
  stays while the work runs, any other until the next button press; none times out.
- **The header on STEP and ROLL.** Does it name the SOUND page the strip shows? Proposed: no, the
  screen's name alone.
- **Pad tiles on the Pad page.** What a tile shows. Proposed: the pad's number only; faint when
  empty, orange when selected, none orange for a sound selected on POOL.
- **An empty pad selected.** How Look draws its Pad page; whether its lane is highlighted on STEP;
  what OK does and where the view opens on ROLL. Proposed: none yet.
- **DELETE for an unused sound.** What the question reads when no pad or note uses the sound.
  Proposed: none yet.

### Sound and settings

- **Delay time on the strip.** How dotted and triplet values are written, their order in the list
  and whether "1/1 (1/2)" fits a strip cell. Proposed: none yet.
- **Starting values of a new sound.** No value is set. Proposed: in code, tuned by ear; a new sound
  is heard at once and unfiltered.
- **Sample start, end and loop points.** Their unit is unsaid. Proposed: sample frames of the
  converted file; one click moves 1/128 of its length.
- **Root note, transpose and fine tune.** No ranges. Proposed: 0 to 127; −48 to +48 semitones; −100
  to +100 cents, for the second oscillator too.
- **LENGTH limits.** What the pattern's picker lists; a note's shortest and longest. Proposed: 1, 2,
  4, 8, 16, 32 and 64 bars; a note from one fine step (30 ticks) to the pattern's length.
- **Counted or smooth.** Unmarked for velocity, cents, milliseconds and levels. Proposed: counted
  where people count the unit; note PITCH and VELOCITY move one per click, with SHIFT too.
- **Fine clicks.** A click size that does not divide by 16, and SHIFT on the volume encoder.
  Proposed: divide, round down, never under 1; the volume encoder ignores SHIFT.
- **Tuning a range in part 1.** New ID, new format version or just the number? Proposed: just the
  number; the ID and version stay and saved values are held within the new range.

### Saving and storage

- **When `.prev` is made.** Renamed or copied, and at which point of a save. Proposed: the old file
  is renamed to `.prev` just before the replace.
- **A lost view file.** Some defaults are unnamed and a notice is unsaid. Proposed: it opens as a
  new project does (pattern 1, first pages, bar 1, step 1), with no notice.
- **The selected pad.** The project remembers each track's selected sound, not its pad: an empty
  pad, or a sound on two pads, comes back undefined. Proposed: none yet.
- **"View follows" remembered.** A project opens stopped and PLAY follows again, so the saved value
  is never used. Proposed: drop it from the list.
- **Storage reserve.** No size. Proposed: 1 MB.
- **SWING in the project file.** Saved with the project but empty in version 1. Proposed: not
  written until swing is built.
- **Time signature.** Two numbers, but a saved value is one. Proposed: two entries, the beats (1 to
  16) and the beat unit (4 or 8); still one item on screen.
- **Pressure curves in a pattern file.** How a saved note points at its curve. Proposed: by the
  curve's position in its chunk, counted from 0.
- **Folder requests.** Foundation's list has no make folder, delete folder or copy. Proposed: a
  replace makes its folder; one delete-folder request; COPY reads and replaces.
- **A dropped file.** How the shell tells the core that a file waits in `tmp/`. Proposed: one
  message from the platform with the file's name and folder.
- **"A versioned format that can be migrated".** The subparts list still says so; migrations wait
  for part 2. Proposed: "a versioned file format".

### Inside the core

- **Storage replies in the session log.** Unsaid whether replies are logged. Proposed: each reply is
  an input at a sample position; a scene carries the replies it expects.
- **Timers.** The autosave and view-file delays name no clock. Proposed: every delay counts samples
  of the audio clock, as the hold and repeat times do.
- **What the audio part reports.** Foundation lists the playhead and meters; no screen has a meter.
  Proposed: the playhead, "message N applied at sample S", "sample let go" and the browser wake-up.
- **Pad lights.** Reported by the audio part or worked out by the control part? Proposed: worked
  out, from the control part's own transport model.
- **Edit lead.** No number, and not in Foundation's spike list. Proposed: provisionally 1,024
  samples, set just above the longest delay the spike measures.
- **Numbers not yet set.** The version queue's size, the reserve for versions in flight and the
  operation count. Proposed: none yet.
- **Fixed table sizes.** How many sounds, library files, projects and queue entries; the message
  when one is full. Proposed: none yet; each is a budget-profile entry.
- **Effect memory and note pool.** Sound's "large memory class" is not one of Foundation's two
  kinds. Proposed: both sit beside the sample RAM, each with its own budget number.
- **Master-list entry.** With notes as plain data, do "step or note" and "can be locked per step"
  stay as room for later? Proposed: none yet.

### Browser shell

- **MIDI note mapping and the octave.** Look's sentence reads three ways. Proposed: in Pads mode
  every C is pad 1; in Keys mode a note plays its own pitch and the octave moves only the pads; the
  core gains a note input. Or: the octave follows the note, or all octaves fold onto the pads.
- **Touch.** Not mentioned. Proposed: not supported in part 1; a finger does only what the browser
  passes on as a mouse click.
- **Letting a pad go.** Only the hit is stated for the mouse and keys. Proposed: the pad is held
  until the mouse button or key comes up; no pressure.
- **Computer keys.** "Z to /" is ten keys for twelve pads, and "the rest on letters" does not fit.
  Proposed: keys by position; pads in piano order (Z S X D C V G B H N J M); no encoder keys.
- **Encoders by mouse.** No push, direction or pixel count. Proposed: a click without a drag is a
  push; dragging up turns right; 8 pixels per click.
- **Starting sound.** A browser is silent until the first click or key. Proposed: the panel shows
  "Click to start" until then; MIDI is asked for at that moment.
- **Losing focus.** A key or pad held while you switch windows sticks. Proposed: every held key, pad
  and button is let go.
- **MIDI knobs.** Which five controller numbers; how a 0 to 127 knob becomes clicks. Proposed: each
  change of position is that many clicks; the numbers: none yet.
