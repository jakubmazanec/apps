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
- Effects **(my call)**.
- Editing notes in the piano roll. The piano roll is shown; editing in it may come later **(my
  call)**. This clashes with the goal that every parameter is reachable; see Workflow B.
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
   screen; the time base, sample rate and numerics; the parameter mechanism; the binding table
   format and how the core loads it; the storage interface; budget measurement, drift tests and a
   bare-metal build check; the Rust toolchain inside this monorepo; the licence.
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
   screen is drawn; panel layout D as data; mouse, keyboard and MIDI input; dropping sample files
   in; development meters.

Foundation comes first because it sets the limits the other specs work within. Sound comes before
the workflow specs because its parameter count and sample pitch rules shape how parameters are
reached and how KEYS mode works. Project model comes after the workflow specs so the data model
follows how things are used. Look comes last because it draws the screens the workflow specs define.

### Questions that span specs

| Question                                            | Owner                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Interface between core and browser; what runs where | Foundation                                                                                                  |
| Memory model and budgets                            | Foundation; Project model places the note store in it                                                       |
| Screen resolution and colour format                 | Foundation: how the core draws; Look: the resolution, colour format and palette                             |
| Time                                                | Foundation: the time base; Workflow B: grids and quantize                                                   |
| Parameters                                          | Foundation: the mechanism; Sound: the list; Workflow A: how they are reached                                |
| Bindings                                            | Foundation: format and loading; Workflows A and B: actions and default assignments; Look: panel layout data |
| Storage                                             | Foundation: the interface and its browser backend; Project model: the layout                                |
| Projects, patterns, tracks, sounds                  | Workflows A and B: what they mean; Project model: how they are represented                                  |
| Voices, polyphony, mixing                           | Sound, within Foundation's budgets                                                                          |
| Screens                                             | Workflows A and B: which screens exist and what they show; Look: how they are drawn                         |
| Velocity                                            | Workflow A: behaviour; Look: mapping input devices                                                          |

### Milestones

The plans are written after all specs, ordered so that something is playable after the first
milestone **(decided)**. What each milestone contains is **(my call)**:

1. **Make a sound:** a synth sound played on the pads in KEYS mode, the encoders on its parameters,
   the header and parameter strip, the panel drawn from data, mouse, keyboard and MIDI input.
2. **Samples and the pool:** storage and file drop, the sample engine, the sound list and creating
   sounds, track selection, pad mappings, PADS mode.
3. **A looping pattern:** transport and tempo, step entry, the STEP view, track level and mute.
4. **Play it in:** live recording, quantize, overdub, growing length, the ROLL view.
5. **Keep it:** several patterns and switching between them, new, save and load.

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

The owner picked approach 1 **(decided)**. To ease the slower iteration, panel layout, bindings, and
colours are data the shell can reload without a rebuild **(decided; see Foundation)**.

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
  pad _n_ hit with velocity _v_. Which action a control triggers is a binding table, not code. The
  binding and colour tables are versioned JSON read by the core; the panel layout belongs to the
  shell **(decided)**.
- The core reaches storage through requests and replies **(decided)**.
- **GPL-family licence** **(decided)**. The code is GPL-3.0-or-later; the hardware files (parts 3
  and 4) will be CERN-OHL-S-2.0, its hardware counterpart **(my call)**. Dependencies must be
  compatible with the GPL.
- The project lives in this monorepo: a Rust package from a new alpha Carson Rust template and a
  Carson-generated browser app. Part 1 runs locally only **(decided)**. It can move to its own
  repository later, when firmware and hardware files join it.

### 2. Sound

- **Samples and synthesis are equal, first-class sound sources** **(decided)**.
- **Sound:** a source – a sample player or a synth engine – followed by a shared voice chain
  (filter, envelopes, level). Everything after the source is identical for both kinds **(my call;
  follows the decided equality)**.
- **One sample engine and one basic synth engine** **(decided)**.
- **Sample engine** **(my call):** plays a loaded sample, with start, end, pitch, and level;
  one-shot playback.
- **Synth engine** **(my call):** a basic subtractive voice – oscillator with a choice of waveforms,
  low-pass filter with resonance, and an amplitude envelope. The JD-Xi is the reference for the
  sound character the project aims at over time **(decided)**.
- Each track has its own level and mute **(my call)**.
- **(open)** The filter and envelope appear twice: in the synth engine and in the shared voice
  chain. Is the synth source only the oscillator?
- **(open)** Voice allocation, polyphony, voice stealing, one sound cutting off another, and mono
  sounds, within Foundation's budgets.
- **(open)** Whether a one-shot sample stops when its note is released, and the base pitch a sample
  plays at in KEYS mode.
- **(open)** Mixing and output: mono or stereo, pan, master level, limiting.
- **(open)** Which sample file formats are accepted.

### 3. Workflow A: playing and sounds

- **Sounds live in one pool shared by the whole project** **(decided)**. Any track can play any
  sound, including sounds other tracks use. A sound exists once: when the same sound is used on two
  tracks, editing it on one changes it on both **(decided)**.
- The device must be usable standalone, so creating a sound, choosing its source (sample or synth),
  and picking a sample all happen in the core, on the device's own screens and controls – never in
  the browser shell.
- A sound list screen shows the pool; from it a sound can be added, its source type chosen, and a
  sample picked from the samples in storage **(my call)**.
- New projects start empty, with no bundled samples **(my call)**.
- **Each track has its own pad mapping** **(decided)**: switching tracks changes which sounds the 12
  pads play in PADS mode. Each pad points to a sound in the pool, so two tracks can put the same
  sound on their pads.
- **Pads** have two modes **(decided)**: in PADS mode each pad triggers a different sound of the
  current track, like a drum kit; in KEYS mode the 12 pads are one chromatic octave of the selected
  sound. Both modes write the same kind of notes.
- **Encoders** control the four parameters shown in the strip at the bottom of the screen; what they
  control depends on the selected sound and its source type **(my call)**.
- A **header** with track, sound, pad mode, tempo, transport position, and a recording indicator,
  and a **parameter strip** for the encoders **(my call)**.
- **(open)** How sounds are created, browsed, and assigned **(decided that this is still to be
  decided)**.
- **(open)** The selection model, modes, navigation and the list of screens.
- **(open)** How every parameter is reached with four encoders, and how encoders feel (fine, coarse,
  accelerated).
- **(open)** Whether control bindings are saved per project or as device settings.
- **(open)** Controls for decided features that have none on the starting panel: the sound list,
  track level and mute, octave shift in KEYS mode, and new, save and load project.
- **(open)** Velocity from inputs that have none (mouse, computer keyboard), and whether pad
  pressure belongs in notes. The project overview leaves velocity- or pressure-sensitive pads open.

### 4. Workflow B: sequencing and patterns

The owner is not yet sure how patterns should work; everything in this section is the current
leaning and is expected to change.

- **Four tracks** in the first version **(decided)**.
- **A pattern is what the four tracks currently contain**, so all four tracks share one length
  **(decided, provisional)**. Per-track lengths must stay possible to add later.
- **A project holds several patterns** that can be switched **(decided)**. Song mode and chaining
  come later and their details are undecided.
- **Pattern length has no fixed limit** **(decided)**; it is bounded only by the generous note
  memory. The length can always be set by hand, and it can also grow while recording live
  **(decided)**.
- **Step sequencer:** the 16 step buttons enter and remove notes for the selected sound
  **(decided)**.
- **Live recording with looping and overdub:** play the pads while the pattern loops, and the notes
  are recorded into it **(decided)**.
- **Quantize is on by default and can be turned off** **(decided)**. When on, recorded notes are
  snapped to the grid as they are recorded.
- **Both input methods write the same notes into the same pattern** **(my call)**.
- **Tempo** is adjustable **(my call)**.
- **STEP view:** the selected track's sounds as lanes, 16 steps each, with the playhead **(my call,
  as in the mockup)**.
- **ROLL view:** a piano roll – pitch against time – showing the track's notes coloured by sound
  **(decided that the piano roll exists; layout my call)**.
- **(open)** Editing notes. A note's pitch, velocity and length are parameters too, so the goal that
  every parameter is reachable clashes with piano-roll editing being a non-goal, and step entry
  cannot set them.
- **(open)** The step resolution, going past 16 steps, the pitch, velocity and length of a note
  entered by step, and what a step means in KEYS mode.
- **(open)** Whether the STEP view's lanes are the track's 12 pad sounds or every sound its notes
  use, and what happens when they do not fit on the screen.
- **(open)** When recording grows the pattern and when it wraps, notes held across the loop point,
  count-in, metronome.
- **(open)** Whether tracks are the same across patterns; whether pad mappings, track level and
  mute, and tempo belong to a pattern or to the project; when a pattern switch takes effect.
- **(open)** How quantize, overdub and tempo are operated from the panel, and controls for switching
  patterns, setting the length and turning quantize off.
- **(open)** Undo, copying and clearing patterns, erasing notes while recording, swing: in this
  version or non-goals.
- **(open)** The experiments the owner wants to try.

### 5. Project model and saving

- **Note:** a time, a length, a pitch, a velocity, and which sound it plays. Each note can play a
  different sound **(decided)**.
- **Track:** a lane of notes that can mix any sounds from the pool **(decided)**.
- The companion app (part 2) uses the same project format as the device **(decided)**.
- **(open)** How a project's parts refer to each other, and what happens when a sound in use is
  deleted.
- **(open)** The note store: no practical limit on length, no allocation on the audio path, notes
  inserted while the pattern loops, and which part of the core writes to it.
- **(open)** A versioned project format and how old projects are migrated.
- **(open)** The storage layout, and device settings kept separate from the project.
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
- The panel layout in the browser – which controls exist and where – is data, so controls can be
  added, moved, and rebound while experimenting **(decided)**.
- The shell shows the core's frame buffer on a canvas **(decided)** and draws the panel from the
  layout data, to scale **(my call)**.
- Mouse, computer keyboard, and USB MIDI controllers drive the controls **(decided)**.
- Sample files dropped onto the shell go into browser storage, standing in for copying files onto
  the device's storage card **(my call)**.
- Later the same tables are how people reprogram the device. Buttons with tiny displays are an idea
  for later; if they come, the core renders their labels the same way it renders the main screen.
- **(open)** The resolution the browser emulates (provisionally 480×272), whether and how elements
  are drawn chunky (uniformly or as mixels), the colour format and palette, the pixel font and the
  exact drawing operations, with the frame buffer inside Foundation's working-memory budget.
- **(open)** How each screen is drawn.
- **(open)** The format of the panel layout data.
- **(open)** How mouse, keyboard and MIDI input map to controls.
- **(open)** Development meters for CPU time and memory.

## Glossary

- **Control:** a button, encoder or pad, as the core sees it.
- **Action:** what the core does when a control is used, such as starting playback.
- **Binding:** an entry in the table that connects a control to an action.
- **Sound:** a source followed by the shared voice chain. Sounds live in the pool.
- **Source:** the sample player or synth engine at the front of a sound.
- **Pool:** all sounds of a project.
- **Note:** a time, length, pitch, velocity and sound.
- **Track:** a lane of notes; there are four.
- **Pattern:** what the four tracks currently contain.
- **Project:** the pool and several patterns.
- **Pad mapping:** which sound each of the 12 pads plays in PADS mode; each track has its own.
- **PADS mode:** each pad plays a different sound of the current track.
- **KEYS mode:** the 12 pads are one chromatic octave of the selected sound.
