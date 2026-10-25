# Groovebox – overview

Status: brainstorming. This document records what has been decided so far about the whole project.
Each part gets its own design document when it is brainstormed in detail.

## Intent

A custom, open source synth/sequencer/groovebox. The end product is a physical device, built
primarily for myself. While the workflow is designed, experimented with, and iterated on, the device
lives in the browser as a virtual instrument. What that workflow turns out to be then informs the
physical layout and look of the device.

## Influences

- **Teenage Engineering EP-133 K.O. II** – the workflow: fast, hands-on, playing patterns in live on
  pads. Its weak spot is the small, limited display.
- **FL Studio** – the piano roll view of a track's notes. The device needs a display big enough to
  show this.
- **Dirtywave M8** – simplicity: a small set of controls, with the screen doing the heavy lifting.
- **Roland JD-Xi** – the sound.
- **Teenage Engineering OP-XY** – the industrial design.
- **Pixel art** – the visual style of the display. Low resolution is fine, even preferred.

## Decisions

### Whole project

- **Rust**, sharing one core between the browser and the device. Go was considered and rejected: its
  garbage collector risks audio dropouts, and its WASM and microcontroller support (TinyGo) is a
  poor fit for real-time audio.
- **One shared core.** The sound engine, sequencer, display rendering, and control handling live in
  one Rust crate that builds both for WASM and for bare-metal firmware (`no_std`, no allocation on
  the audio path). The browser and the device must not drift apart, in sound or in workflow.
- **Samples and synthesis are equal.** Both are first-class sound sources. Every sound slot has a
  source (sample player or synth engine) at the front; everything after it – filter, envelopes,
  effects, modulation, sequencing, piano roll – is shared and identical.
- **Recording.** The device has mic and line inputs. Resampling (recording the device's own output)
  is a feature.
- **Standalone.** Every musical feature works on the device alone. The companion app can make things
  more convenient, but it is never required. A feature that only works with a computer attached is a
  design failure.
- **Open source, buildable by others.** Primarily for me, but built from parts and files anyone can
  order, so others could theoretically build one too.

### Part 1 – Rust core and browser virtual device

Designed first, in its own document. Decided so far:

- The core is compiled to WASM and runs in an AudioWorklet.
- A thin browser shell around it shows the device's actual display pixels and on-screen controls,
  and feeds input back to the core. Computer keyboard, mouse, and USB MIDI controllers can drive the
  controls.
- The core respects hardware-realistic constraints – CPU budget, memory, a display resolution and a
  control set that can be bought and fitted – so that part 3 stays possible. The display in
  particular must match a real, purchasable part (size, resolution, colour depth).
- In the browser, recording uses the computer's microphone or audio interface.

### Part 2 – Companion features

- The browser app from part 1 doubles as the companion app. Connected to the device over USB
  (WebUSB, WebMIDI, or WebSerial), it can move samples and projects in both directions, back up the
  device, and edit on a big screen.
- Because it runs the same core, it uses the same project format and can keep working on a project
  away from the device.

### Part 3 – Electronics

- Not designed yet; the workflow from part 1 comes first.
- Needs an audio codec with mic preamp and line input, a display big enough for a piano roll, a CPU
  with a hardware FPU (synthesis), and external RAM plus storage (samples). The Daisy Seed (STM32H7,
  64 MB SDRAM) is an example of this class of board; no board has been chosen.
- Memory must be generous enough that a user never has to worry about running out, even for very
  long songs. Note data is small; samples are what drive the memory and storage sizing.
- Circuit boards are designed for manufacturing and assembly services (e.g. JLCPCB, PCBWay), leaving
  little or no hand-soldering.
- Controls are the hardest part to match: velocity- or pressure-sensitive pads and good encoders are
  projects of their own.

### Part 4 – Enclosure and physical design

- Not designed yet; the layout follows from the workflow designed in part 1.
- Design and materials should be close to the EP-133 and OP-XY. For a one-off, a CNC-machined
  aluminium enclosure (OP-XY-like) is realistic through online services. The EP-133's
  injection-moulded plastic does not pay off for one unit; CNC-milled plastic or a finished resin
  print is the approximation.

## Order

1. Rust core and browser virtual device
2. Companion features
3. Electronics
4. Enclosure and physical design
