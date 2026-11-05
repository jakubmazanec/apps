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
  a faster way to change it also exists (such as a pattern growing while recording).

## Non-goals for this version

- Song mode and pattern chaining **(decided)**.
- Recording from a microphone or line input, and resampling **(decided)**. Both are required on the
  device and come in a later version; the first version uses samples loaded from files.
- The features Workflow B puts after the first version: per-track lengths, growing while recording,
  swing, step extras, a choice of when a pattern switch happens, scales and chords, a changeable
  grid, note repeat and the arpeggiator, automation, randomization, hidden notes, per-pattern time
  signatures, editing pressure and more levels of undo **(decided)**.
- Typing names for sounds and projects. Names are automatic in part 1; see Workflow A.
- The companion features (part 2), hardware (part 3), and enclosure (part 4).

## Anti-goals

- **Browser and device drifting apart.** Any behaviour that exists only in the browser – a sound,
  timing, a screen, a control behaviour – defeats the point of the virtual device.
- **Features that need the browser.** The device must be fully usable standalone **(decided)**;
  nothing in the core may depend on the browser shell to work.
- **Running out of memory.** A user must never have to worry about memory, even for very long songs
  **(decided)**.

## How part 1 is designed

- Part 1 is split into the six subparts below. Each gets its own brainstorm with the owner and its
  own written spec **(decided)**.
- All six specs are written first, in the order below. Implementation plans for all of them are
  written only after the last spec, and implementation follows all planning **(decided)**.
- Each spec ends with a list of what it assumes about the other specs **(decided)**.
- After the last spec, one pass checks all specs and this overview against each other before any
  plan is written **(decided)**.
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
   every parameter is reached with four encoders; the sound list and creating sounds; pad mappings;
   velocity.
4. **Workflow B: sequencing and patterns.** Transport and tempo; step entry and editing notes;
   recording rules; patterns and what belongs to a pattern or to the project; a list of experiments
   the owner wants to try.
5. **Project model and saving.** What a project contains and how its parts refer to each other; the
   note store; a versioned format that can be migrated; the storage layout; device settings kept
   separate from the project.
6. **Look and panel.** The emulated resolution, colour format, pixel font and palette; how each
   screen is drawn; panel layout D; mouse, keyboard and MIDI input; dropping sample files in;
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

1. **Make a sound:** a synth sound played on the pads in KEYS mode, the encoders on its parameters,
   the header and parameter strip, the panel drawn from data, mouse, keyboard and MIDI input.
2. **Samples and the pool:** storage and file drop, the sample engine, the sound list and creating
   sounds, track selection, pad mappings, PADS mode.
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
  pattern length **(decided)**; samples are what size the memory. Sample memory is RAM only for now,
  16-bit, with a provisional budget of 64 MB per project; long recordings are decided with recording
  and hardware **(decided)**.
- **The display must match a real, purchasable part** **(decided)**. 4.3″, 480×272 is the current
  idea and provisional, like all hardware **(decided)**.
- 48 kHz, 1920 ticks per beat, tempo in hundredths of a BPM, whole-number conversion from ticks to
  samples **(decided)**.
- Screens draw through a drawing interface into the core's own buffer in the display's pixels
  **(decided)**.
- One master list of parameters with permanent IDs and whole-number values **(decided)**.
- The core sees only abstract controls: button _n_ pressed or released, encoder _n_ turned by _d_,
  pad _n_ hit with velocity _v_. Bindings connect controls to actions in one place in the code;
  bindings, colours, encoder pages and the browser panel layout are all code **(decided)**.
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
  Muting lets tails ring out **(decided)**.
- Per-track level and mute; master level and a soft clipper **(decided)**.
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
  B's PATTERN. Each has a header, a main area and a parameter strip; the four encoders always edit
  the strip, which under STEP and ROLL shows the selected sound.
- **The screen is the interface** **(decided)**: the arrows move a cursor over everything on the
  screen, OK uses an item, CANCEL backs out and − and + change values at once. The encoders are
  shortcuts for the strip: a turn changes an item, a press is OK on it. No value is ever confirmed.
  Workflow B makes the strip only the encoders' display: the cursor never goes there, and every
  strip has a screen route.
- **Pages and encoders** **(decided)**: PAGE + step picks a page on every screen. The encoders have
  push switches and turn in fixed steps, 16 times finer with SHIFT.
- **Sounds are made from the pad** **(decided)**: the PAD page's picker offers NEW SAMPLE, NEW SYNTH
  and the pool; COPY gives a pad its own copy of a shared sound; ENGINE switches a sound between
  sample and synth; names are automatic. The sample picker plays each highlighted sample. POOL is
  for overview and housekeeping, and highlighting a sound there selects it. New projects start
  empty.
- **Effects** **(decided)**: a CHAIN page sets each slot's type and the order; one page per slot.
- **Mix** **(decided)**: SHIFT + T1–T4 mutes; MIX holds the track levels and the master level; a
  dedicated fifth encoder sets the output volume after the soft clipper, as a device setting.
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

- **Note:** a time, a length, a pitch, a velocity, a pressure curve, and which sound it plays. Each
  note can play a different sound **(decided)**.
- **Track:** a lane of notes that can mix any sounds from the pool **(decided)**.
- The companion app (part 2) uses the same project format as the device **(decided)**.
- **(open)** How a project's parts refer to each other, and what happens when a sound in use is
  deleted.
- **(open)** The note store: no practical limit on length, no allocation on the audio path, notes
  inserted while the pattern loops, and which part of the core writes to it.
- **(open)** A versioned project format and how old projects are migrated.
- **Autosave** **(decided)**: the open project saves itself; projects have automatic names.
- **Patterns** **(decided)**: unlimited, with 1 to 16 always present. Each holds its notes, its
  length and whether it has ever been changed. The time signature is the project's but is read per
  pattern. Notes are plain data, not parameters. See Workflow B.
- **Undo** **(decided)**: one level, over note changes; the Project model sizes what it can hold.
- **(open)** The storage layout, and device settings kept separate from the project. The device
  settings so far are the output volume, the VELOCITY switch, the metronome, its level and the
  count-in.
- **(open)** Whether each track's selected sound, pad mode and octave, each screen's page, the
  cursor and view, following and the current pattern are saved with the project.
- **(open)** How projects are saved and loaded in the browser.

### 6. Look and panel

- **Pixel-art style**, drawn at native resolution with chunky pixel fonts, in the spirit of
  early-90s MS-DOS games **(decided)**.
- The starting panel is layout D from the
  [panel mockup](https://claude.ai/artifact/MLmfiDi7HieYGJHYfRhqNM) **(decided)**: about 240 × 110
  mm, with
  - the 4.3″ display in the middle of the top row,
  - a 4×4 block of function buttons to its left: T1–T4; STEP, ROLL, PADS/KEYS, SHIFT; REC, PLAY,
    STOP, TEMPO; and four arrows,
  - four endless encoders in a 2×2 block to its right,
  - a row of 16 step buttons below,
  - a row of 12 pads below that **(decided)**.
- The function buttons and their labels are a starting point and are expected to change
  **(decided)**.
- The panel layout in the browser – which controls exist and where – is code, so controls are added,
  moved, and rebound by changing code **(decided)**.
- The shell shows the core's frame buffer on a canvas **(decided)** and draws the panel to scale
  **(my call)**.
- Mouse, computer keyboard, and USB MIDI controllers drive the controls **(decided)**.
- Sample files dropped onto the shell go into browser storage, standing in for copying files onto
  the device's storage card **(my call)**.
- Workflow A adds controls to layout D: MENU, PAGE, OK, CANCEL, − and + buttons, push switches on
  the four encoders and a fifth encoder for the output volume **(decided)**. Workflow B adds a COPY
  button **(decided)**. Where they sit is open.
- Buttons with tiny displays are an idea for later; if they come, the core renders their labels the
  same way it renders the main screen.
- **(open, later)** Whether people can remap controls on the device itself.
- **(open)** The resolution the browser emulates (provisionally 480×272), whether and how elements
  are drawn chunky (uniformly or as mixels), the colour format and palette, the pixel font and the
  exact drawing operations, with the frame buffer inside Foundation's working-memory budget.
- **(open)** How each screen is drawn.
- **(open)** How mouse, keyboard and MIDI input map to controls, including velocity and aftertouch.
- **(open)** Development meters for CPU time and memory.

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
  SETTINGS or PATTERN.
- **Page:** a set of up to four parameters on a screen.
- **Strip:** the bottom of the screen, showing the four items the encoders edit; never a cursor
  target.
- **Cursor:** what the arrows move over the items on a screen; OK uses the item under it.
- **Picker:** a list opened from a parameter, closed once you pick.
- **Cell:** one row by one grid step on STEP or ROLL; what the cursor stands on there.
- **NOTE strip:** the strip while a step is held, showing its notes' pitch, velocity, length and
  position.
- **NOTE panel:** the second level opened from a cell, listing the same four values for the arrows
  and − and +.
- **Clipboard:** the last copy: a bar, a sound's notes, a track or a pattern.
- **Following:** the view moving along with the music while playing.
- **Selected sound:** the sound the encoders edit, the step buttons enter and KEYS mode plays.
- **Output volume:** how loud the device plays, set by its own knob; a device setting.
