# Groovebox part 1 – Rust core and browser virtual device

Status: design, awaiting the owner's approval. Part of the groovebox project; see
[the overview](./2026-10-25-groovebox-overview.md) for the whole picture and for parts 2–4.

Throughout, **(decided)** marks something the owner decided in the brainstorm and **(my call)**
marks a default proposed during the design that the owner has not explicitly confirmed. Anything
unmarked follows directly from the decided points.

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
  device and come in a later version; the first version uses samples loaded from files. The memory
  model must still leave room for audio written at runtime, so recording can be added without
  reworking it **(my call)**.
- Effects **(my call)**.
- Editing notes in the piano roll. The piano roll is shown; editing in it may come later **(my
  call)**.
- The companion features (part 2), hardware (part 3), and enclosure (part 4).

## Anti-goals

- **Browser and device drifting apart.** Any behaviour that exists only in the browser – a sound,
  timing, a screen, a control behaviour – defeats the point of the virtual device.
- **Features that need the browser.** The device must be fully usable standalone **(decided)**;
  nothing in the core may depend on the browser shell to work.
- **Running out of memory.** A user must never have to worry about memory, even for very long songs
  **(decided)**.

## Constraints

### The core must be able to run on the device

- **Rust** **(decided)**. The core is `no_std` and does not allocate on the audio path, so it can
  build for bare-metal firmware as well as for `wasm32`.
- **Hardware-realistic budgets.** The reference target is an STM32H7-class microcontroller
  (Cortex-M7 with a hardware FPU, around 1 MB of internal RAM, external SDRAM in the tens of MB –
  the Daisy Seed is an example of this class). No board is chosen; the core must stay within what
  such a chip can do in CPU time and memory **(my call)**.
- **Memory generous enough to never worry about.** Note data must not impose a practical limit on
  pattern length **(decided)**; samples are what size the memory.

### The display

- **4.3″, 480×272 pixels, 16:9** **(decided)**. A common off-the-shelf panel; on the device it needs
  a microcontroller with a display controller and a frame buffer in RAM (about 255 KB at 16-bit
  colour).
- **Pixel-art style**, drawn at native resolution with chunky pixel fonts, in the spirit of
  early-90s MS-DOS games **(decided)**.
- **Colour** **(my call)**.

## Approaches considered

1. **Everything that defines the device lives in the Rust core (chosen).** The core holds the sound
   engines, the sequencer, the screen rendering (into a 480×272 frame buffer, e.g. with
   `embedded-graphics`), and the handling of buttons, encoders, and pads including the remappable
   bindings. A thin TypeScript shell runs the core in an AudioWorklet, blits the frame buffer to a
   canvas, draws the panel, and forwards clicks, keyboard and MIDI input as abstract control events.
   The browser version is then the device minus the hardware. The cost is that UI changes mean Rust
   changes and a WASM rebuild.
2. **Rust for sound and sequencing, TypeScript for screen and controls.** The fastest iteration, but
   the screen and control logic – the workflow itself – would have to be rewritten in Rust for the
   device, and the two would drift. Rejected because it works against the reason the virtual device
   exists.
3. **All Rust, including the shell** (e.g. egui or macroquad compiled to WASM). One language, but
   browser features (AudioWorklet, Web MIDI, WebUSB, file drag-and-drop, the later companion
   features) become awkward, and the shell is the part that benefits most from being ordinary web
   code. Rejected.

The owner picked approach 1. To ease the slower iteration, panel layout, bindings, and colours are
data the shell can reload without a rebuild **(my call)**.

Go was considered for the core and rejected: its garbage collector risks audio dropouts, and its
WASM and microcontroller support (TinyGo) is a poor fit for real-time audio.

## What the device is

### Sounds, notes, and tracks

- **Samples and synthesis are equal, first-class sound sources** **(decided)**.
- **Sound:** a source – a sample player or a synth engine – followed by a shared voice chain
  (filter, envelopes, level). Everything after the source is identical for both kinds **(my call;
  follows the decided equality)**.
- **Note:** a time, a length, a pitch, a velocity, and which sound it plays. Each note can play a
  different sound **(decided)**.
- **Sounds live in one pool shared by the whole project** **(decided)**. Any track can play any
  sound, including sounds other tracks use. A sound exists once: when the same sound is used on two
  tracks, editing it on one changes it on both **(decided)**. The exact way sounds are created,
  browsed, and assigned is to be decided **(decided)**; for the first version, see "Creating sounds"
  below.
- **Track:** a lane of notes that can mix any sounds from the pool **(decided)**, with its own level
  and mute **(my call)**.
- **Four tracks** in the first version **(decided)**.

### Creating sounds

The device must be usable standalone, so creating a sound, choosing its source (sample or synth),
and picking a sample all happen in the core, on the device's own screens and controls – never in the
browser shell. For the first version **(my call)**:

- A sound list screen shows the pool; from it a sound can be added, its source type chosen, and a
  sample picked from the samples in storage.
- The core reads samples through an abstract storage layer. On the device that will be an SD card or
  flash; in the browser it is browser storage. Dropping files onto the browser shell only stands in
  for copying files onto the device's storage card.
- **Each track has its own pad mapping** **(decided)**: switching tracks changes which sounds the 12
  pads play in PADS mode. Each pad points to a sound in the pool, so two tracks can put the same
  sound on their pads.
- New projects start empty, with no bundled samples.

### Engines in the first version

- **One sample engine and one basic synth engine** **(decided)**.
- **Sample engine** **(my call):** plays a loaded sample, with start, end, pitch, and level;
  one-shot playback.
- **Synth engine** **(my call):** a basic subtractive voice – oscillator with a choice of waveforms,
  low-pass filter with resonance, and an amplitude envelope. The JD-Xi is the reference for the
  sound character the project aims at over time **(decided)**.

### Patterns and recording

The owner is not yet sure how patterns should work; everything in this section is the current
leaning and is expected to change.

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

### The panel

The starting panel is layout D from the
[panel mockup](https://claude.ai/artifact/MLmfiDi7HieYGJHYfRhqNM) **(decided)**: about 240 × 110 mm,
with

- the 4.3″ display in the middle of the top row,
- a 4×4 block of function buttons to its left: T1–T4; STEP, ROLL, PADS/KEYS, SHIFT; REC, PLAY, STOP,
  TEMPO; and four arrows,
- four endless encoders in a 2×2 block to its right,
- a row of 16 step buttons below,
- a row of 12 pads below that **(decided)**.

The function buttons and their labels are a starting point and are expected to change **(decided)**.

**Pads** have two modes **(decided)**: in PADS mode each pad triggers a different sound of the
current track, like a drum kit; in KEYS mode the 12 pads are one chromatic octave of the selected
sound. Both modes write the same kind of notes.

**Encoders** control the four parameters shown in the strip at the bottom of the screen; what they
control depends on the selected sound and its source type **(my call)**.

### Screens

- **STEP view:** the selected track's sounds as lanes, 16 steps each, with the playhead **(my call,
  as in the mockup)**.
- **ROLL view:** a piano roll – pitch against time – showing the track's notes coloured by sound
  **(decided that the piano roll exists; layout my call)**.
- **Header** with track, sound, pad mode, tempo, transport position, and a recording indicator, and
  a **parameter strip** for the encoders **(my call)**.

### Remappable controls

- The core sees only abstract controls (button _n_ pressed or released, encoder _n_ turned by _d_,
  pad _n_ hit with velocity _v_). Which action a control triggers is a binding table, not code
  **(decided that controls are remappable; the mechanism is my call)**.
- The panel layout in the browser – which controls exist and where – is data too, so controls can be
  added, moved, and rebound while experimenting **(decided)**.
- Later the same tables are how people reprogram the device. Buttons with tiny displays are an idea
  for later; if they come, the core renders their labels the same way it renders the main screen.

### The browser shell

- Runs the core in an AudioWorklet and shows its frame buffer on a canvas **(decided)**.
- Draws the panel from the layout data, to scale **(my call)**.
- Drives the controls with mouse, computer keyboard, and USB MIDI controllers **(my call)**.
- Accepts sample files dropped onto it and puts them into browser storage, standing in for the
  device's storage card **(my call)**.

## Repository and licence

- **GPL-family licence** **(decided)**. The code is GPL-3.0-or-later; the hardware files (parts 3
  and 4) will be CERN-OHL-S-2.0, its hardware counterpart **(my call)**. Dependencies must be
  compatible with the GPL.
- The project lives in this monorepo, which already licenses each project separately: the Rust core
  as a crate and the browser shell as an app in the workspace **(my call)**. It can move to its own
  repository later, when firmware and hardware files join it.

## Left to the builder

- The crate structure, the WASM interface between core and shell, and how control events and audio
  buffers cross between the main thread and the AudioWorklet.
- The internal time resolution of notes, voice allocation and polyphony, sample rate, and buffer
  sizes – within the hardware-realistic budgets above.
- How CPU time and memory budgets are measured and enforced in the browser build.
- How projects are saved and loaded in the browser.
- The pixel font and the exact screen layouts, within the pixel-art style.
- How quantize, overdub, and tempo are operated from the panel, using the starting buttons.
