# Groovebox part 1 – Foundation

Status: design, approved by the owner. The first of six subpart specs of part 1; see
[the part 1 overview](./2026-10-26-groovebox-core-browser-design.md) for the intent, the goals, the
other subparts and the decision register.

Every section of this spec was presented to the owner and approved. Points where the owner chose
between options are marked **(owner's choice)**. Research findings that have not been checked in
practice yet are marked **(unverified)**; the first implementation task checks them (see "To verify
first").

## What Foundation decides

Foundation sets the ground rules the other specs build on: how the core runs, how it uses memory,
how it counts time, how parameters and settings tables work, how it draws its screen, how it reaches
storage, how the browser and device builds are kept identical, and how the code sits in this repo.
It does not decide the sound, the workflow, the project format or the look; those belong to the
later specs, and "Assumptions about other specs" lists what Foundation expects from them.

**No hardware is chosen** (owner's rule): not the processor, the board or the display. Nothing in
Foundation depends on a particular part. Where a number depends on hardware, it lives in the budget
profile (see "Memory and budgets") and changes when part 3 chooses hardware.

## Decisions at a glance

| Topic                 | Decision                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browsers              | Chromium only: Chrome and Edge (owner's choice)                                                                                                         |
| Browser versus device | Bit-identical: the same input events give exactly the same audio samples, screen pixels and note timing in every build (owner's choice)                 |
| How the core runs     | Two parts, an audio part with a hard deadline and a control part for everything else, linked by one-way queues                                          |
| Browser build         | One WASM module instantiated twice on one shared memory; stable compiler with a threads-enabled WASM target, nightly route as fallback (owner's choice) |
| Memory                | No allocation while running; fixed pools; working memory and sample memory kept apart                                                                   |
| Sample memory         | RAM only for now, 16-bit, a budget per project; long recordings are decided with recording and hardware (owner's choice)                                |
| Budgets               | A budget profile enforced by the browser build; provisional sample budget 64 MB per project (owner's choice)                                            |
| Audio                 | 48 kHz; the core's own fixed schedule of 32 samples                                                                                                     |
| Musical time          | 1920 ticks per beat (owner's choice); tempo in hundredths of a BPM; whole-number conversion to samples                                                  |
| Numbers               | 32-bit floats for sound, whole numbers for time and the screen; rules that keep results identical                                                       |
| Screen                | Screens draw through a small drawing interface; the core draws into its own buffer in the display's pixels; targets only present it (owner's choice)    |
| Parameters            | One master list; whole-number values; permanent IDs                                                                                                     |
| Settings tables       | Readable JSON files with a version, read by the core directly                                                                                           |
| Storage               | Requests and replies; the core never touches files                                                                                                      |
| Testing               | Drift tests: recorded scenes and fingerprints, compared across builds                                                                                   |
| Repo                  | A Rust package from a new alpha Carson Rust template, plus a Carson-generated app                                                                       |
| Deployment            | Local only in part 1 (owner's choice)                                                                                                                   |
| Licence               | GPL-3.0-or-later                                                                                                                                        |

## How the core runs

The core has two parts, separated by deadline:

- **Audio part.** Produces each block of audio: plays back the sequence exactly to the sample, runs
  the voices and mixes them. Its deadline is hard: no file access, no memory allocation, no waiting,
  no locks, bounded time.
- **Control part.** Everything else: control events, the workflow state, drawing the screen, loading
  samples, saving projects. Its deadline is soft: a screen update may slip a frame, audio may not.
- **How they talk.** Only through lock-free one-way queues. Control to audio: notes played on pads,
  parameter changes, edits. Audio to control: playhead position, meters, recorded notes. Large data
  such as a loaded sample is handed over as memory the control part has finished filling; nothing is
  shared while it is being written.

Why: audio has to be ready every few milliseconds whatever else is happening, while drawing, loading
and saving take varying time. Mixed together, audio drops out. In the browser the split is forced
anyway: the AudioWorklet cannot reach storage, and drawing the screen there is fragile.

### In the browser

- The audio part runs in an AudioWorklet, the control part in a dedicated worker, and the shell on
  the main thread: the panel, input, MIDI and showing the screen.
- One WASM module holds both entry points and is instantiated twice, once in the worker and once in
  the AudioWorklet, on one shared WebAssembly memory. Statics, engine state and the queues are
  genuinely shared, like one address space.
- The loader **(unverified)**:
  - starts the worker's instance first and creates the AudioWorklet's only after the worker reports
    that it is ready, because initialising shared memory may have to wait, and the AudioWorklet
    cannot wait;
  - gives each instance its own stack region by setting the exported stack pointer before calling
    anything, because both instances otherwise start their stack at the same address.
- Build route **(owner's choice, unverified)**: a pinned stable compiler with the
  `wasm32-wasip1-threads` target, whose prebuilt core library already supports atomics, with every
  link setting written out explicitly. The fallback is a pinned nightly compiler that rebuilds the
  core library with atomics for `wasm32-unknown-unknown`; it gives a module of the same shape, so
  switching only changes build settings. CI builds both, so the fallback stays ready.
- Shared memory needs cross-origin isolation, so every page and every worker script is served with
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

### On the device

How the two parts map onto hardware is decided in part 3. The core asks only that its audio part is
called on time and its control part runs the rest of the time.

### Alternatives rejected

- **The whole core in the worker,** with the AudioWorklet only playing a buffer the worker fills.
  Simpler, but it adds latency that hurts live playing and hides the boundary between the two parts.
- **Two separate WASM memories linked by shared rings.** Plain stable Rust, but the audio thread has
  to copy every sample into its own memory, the queue logic exists twice (in JavaScript and in
  Rust), and the model no longer matches one address space.

## Memory and budgets

### Memory

- The core never allocates memory while running. Every pool has a size fixed at build time: queues,
  voices, the note store, the frame buffer. The core library does not use Rust's allocation library
  at all, so an accidental allocation is a compile error.
- Two kinds of memory are kept apart in the code: **working memory** (engine state, queues, the
  frame buffer; small and needs to be fast) and **sample memory** (large, read in sequence by the
  voices). A device can then place them in different kinds of RAM without code changes.

### Sample memory (owner's choice)

- RAM only in the first version. Samples are stored as 16-bit and loaded when a project opens.
- A budget per project, with a meter showing the time left, a "remove unused" command, a preview of
  a sample's cost before it is loaded, and a clear refusal when it does not fit.
- Projects refer to sample files on storage; they do not embed audio.
- Voices read sample audio through one "give me the next block" call, so another source, such as
  streaming long recordings, can be plugged in later.
- Whether long recordings later get more RAM or a simple streaming path is decided when recording
  and hardware are designed.

### Budget profile

- A small data file states the limits: working memory, sample memory and operation counts. The
  browser build enforces it. Changing hardware later means changing the numbers, nothing else.
- **Memory** is checked exactly. Pool sizes are known at build time, so the build fails if they
  exceed the profile, and loading a sample beyond the sample budget is refused.
- **CPU** cannot be measured truthfully without hardware. The WASM build runs fixed test scenes in a
  WebAssembly runtime that counts executed instructions; the counts are the same on every machine
  and catch regressions. When hardware exists, running the same scenes on it turns the counts into
  real CPU percentages. Meanwhile the practical cap is the voice limit set by the Sound spec.
- Lowering a limit later can make existing projects too big. That is acceptable while projects are
  experiments.
- The provisional sample budget is **64 MB per project**, about 5.6 minutes of stereo at 48 kHz and
  16 bits (owner's choice). The working-memory limit follows from the pool sizes in the other specs
  and the frame buffer in the Look spec.

## Time, audio and numbers

### Audio

- The core runs at 48 kHz. The browser asks for 48 kHz; if the output device runs at another rate,
  the browser converts.
- **The core keeps its own fixed schedule of 32 samples.** Whatever batch size the host asks for
  (the browser asks for 128 at a time), the core cuts it into chunks of 32 and does its per-chunk
  work every 32 samples, such as moving a gliding parameter on or stepping an envelope. The host's
  batch size must be a multiple of 32. The output therefore does not depend on the host's batch
  size.
- Every control event is applied at an exact sample position, and that position is recorded with it.
  Replaying the log of events reproduces the output bit for bit.

### Musical time

- **A beat is divided into 1920 ticks** (owner's choice). That divides evenly into 16ths (480
  ticks), 16th triplets (320), quintuplets (384), 32nds, 64ths and MIDI clock (80 ticks per pulse).
  At 120 BPM a tick is about a quarter of a millisecond, and it stays under a millisecond down to
  about 31 BPM, so playing with quantize off keeps its feel. A 32-bit tick counter covers more than
  300 hours at 120 BPM.
- **Tempo** is a whole number in hundredths of a BPM: 120.00 BPM is stored as 12000.
- **Ticks become exact sample positions through whole-number arithmetic**, counted from the last
  tempo change and never by adding up rounded steps:

  `sample = anchor_sample + (tick − anchor_tick) × 150000 / tempo`

  in 64-bit integers, rounded down, where 150000 = 48000 × 60 × 100 / 1920. Each tempo change starts
  a new anchor, and recording uses the inverse. A note 30 minutes in lands on exactly the same
  sample in every build. Jumps between tempos are easy; gradual tempo ramps would need extra maths.

- **Live playing.** The shell stamps each input with its position on the audio clock and passes it
  to the core. The core shifts it back by the known output delay, so the note lands where the player
  heard the beat. The delay used is recorded with the input, so replays match.
- **Syncing to other gear later.** Incoming MIDI clock pulses or Ableton Link positions become
  ordinary input events converted to ticks, so replays stay identical.

### Numbers

Sound uses 32-bit floats; time and the screen use whole numbers. These rules keep float results
identical in every build:

- Basic operations (add, subtract, multiply, divide, square root) are exactly defined by the IEEE
  standard on every target.
- Functions such as sine and exponent come from one pure-Rust maths library compiled into the core
  and are always called explicitly. Rust's built-in float methods are not used: their precision
  varies by platform and Rust version, and host tests would silently use different maths.
- No fused multiply-add (a combined multiply and add that rounds differently).
- Tiny "denormal" values: a hardware flush-to-zero mode stays off wherever it exists, and feedback
  paths such as filters set tiny values to zero explicitly, which is deterministic and avoids
  slowdowns.
- No "not a number" value may reach the output; tests check this.
- No logic depends on pointer size, which differs between targets.
- No relaxed SIMD in WebAssembly, which gives up identical results across processors.

## Screen

**(owner's choice)**

1. Screen code draws through a small drawing interface. The `DrawTarget` interface of the Rust
   `embedded-graphics` library is the model.
2. The core does all drawing itself, into its own buffer in the display's pixels, so the result is
   bit-identical everywhere.
3. A target only presents that buffer: it converts colours and copies pixels, and draws nothing of
   its own. The browser may zoom the whole picture for comfort on a computer screen; that is
   presentation only.
4. The buffer's size and colour format are settings per display, not built into the rest of the
   core. The browser uses the provisional 480×272 until the Look spec says otherwise.

What a frame shows depends only on the core's state and the musical time, never on how many frames
were drawn before, so tests can capture frames at fixed points.

Left to the Look spec: the resolution the browser emulates; whether and how elements are drawn
chunky, uniformly or as mixels per element; the colour format and palette (8-bit indexed with a
256-colour palette is a strong candidate, because expanding it to any other format is a lossless
table lookup); the fonts; the exact drawing operations. A hand-tuned pixel layout depends on the
display's resolution, so moving to a display with a different resolution later means adjusting the
screens; weighing that is the Look spec's job.

Later, in part 2, the companion app can mirror the screen by receiving the changed regions of the
buffer, as Playdate Mirror and the Deluge do. Because screens draw through the interface, a command
stream like the M8's could be added without touching screen code. Editing on a big screen comes from
mirroring state, not pixels.

### Alternatives rejected

- **A fixed low logical resolution scaled up by whole numbers** (PICO-8, TIC-80): rules out mixels
  before the look is decided.
- **A stream of drawing commands** (M8, EVE modules): every target needs its own drawing code and
  fonts, and only the command stream is identical, not the pixels.
- **Character cells or tiles plus sprites** (NES, VGA text mode): poor for the piano roll and
  waveforms.
- **UI toolkits** (Slint, LVGL, TouchGFX): need memory allocation, licence fees or chip lock-in, and
  default to a smooth, anti-aliased look.

## Parameters

Foundation decides the mechanism, not the list.

1. **One master list.** Every adjustable value gets one entry in a list built into the core. An
   entry holds:
   - a permanent ID;
   - a name and a short name;
   - where the value lives: device, project, pattern, track, sound, step or note;
   - the lowest, highest and default value;
   - how the number becomes sound: straight, musical (each step up the knob is the same musical
     interval, as for pitch), decibels, a named list, or on/off;
   - how it is shown: Hz, dB, %, note name;
   - marks: can be modulated, glides, can be locked per step.
2. **Values are whole numbers.** Smooth controls use 0 to 65,535, finer than anyone can hear, and
   high-resolution MIDI maps onto it exactly. Counts use their natural units: steps, semitones,
   ticks, hundredths of a BPM. Lists save the choice's name ("saw"), not its position, so adding a
   choice does not break old projects.
3. **An ID never changes meaning.** Renaming the label is free. Changing a range or meaning creates
   a new ID plus a small rule that converts old values. Saved files store "ID = number"; unknown IDs
   are skipped with a warning, and missing ones take their default.
4. **Getting a change to the sound.** The control part sends "set parameter P to N at sample T".
   Smooth parameters glide to the new value over a few milliseconds, set per parameter, so there are
   no clicks; the glide runs on the core's own 32-sample schedule. Lists and switches change exactly
   at T.
5. **Ready for modulation, without building it now.** The saved number is the home position. All
   sound code reads parameters through one step that will later add modulation; for now it adds
   nothing. Modulation is never saved into the home value.
6. **Steps and notes can use the same mechanism.** Whether velocity, length and micro-timing go on
   the master list (as on Elektron devices) or stay plain note data (as on the Deluge) is Workflow
   B's decision.

Direct MIDI control of individual parameters comes after part 1; in part 1, MIDI controllers drive
the panel's controls.

## Settings tables

These are the tables edited most while experimenting: the control binding table (which control does
what), the browser panel's layout (which controls exist and where) and the screen colours.

- They are readable JSON files in the repo, so they are easy to edit by hand.
- The core reads the same JSON directly, with a Rust parser that needs no memory allocation. There
  is no conversion step: the browser can reload an edited table without rebuilding the core, and a
  device could read the same files from its storage card. Tables are small and rarely read, so the
  parser's speed does not matter.
- Every file carries a version number. Unknown fields are ignored and missing fields take defaults;
  when a change cannot be handled that way, a small conversion step upgrades old files.
- The panel layout belongs to the browser shell only; the core never sees it, because a physical
  device has its controls fixed in hardware.
- The control binding table and the colour table are core data, because a device needs them too.

Rejected: a compact binary format converted from the JSON at build time. It is faster and smaller,
but needs a conversion step and loses hand-editing on a device; neither advantage matters for small
tables.

## Storage

- The core never touches files itself. It sends requests: "load file X into sample memory", "save
  the project to file Y", "list folder Z". The platform does the work and replies when it is done.
  The core keeps running meanwhile, so loading a sample freezes neither the screen nor the sound.
- The requests and replies are the same on every platform; only the code that carries them out
  differs.
- In the browser, the worker carries out the requests using the site's private file storage (the
  Origin Private File System), which can read straight into the shared sample memory
  **(unverified)**.
- The browser can clear that storage, for example when the disk is nearly full. The shell therefore
  asks the browser to keep it permanently, and samples and projects can always be exported and
  imported again.
- Dropping files onto the browser shell copies them into that storage, standing in for copying files
  onto a device's storage card.
- A request can fail: a missing or broken file, or full storage. The core shows a clear message and
  keeps running. The audio part never depends on a file being there; voices only play what is
  already loaded.

## Testing and drift

- **Ordinary tests.** The core's logic is tested with standard Rust tests on the computer.
- **Drift tests.** A scene is a script of input events at exact sample positions: pad hits, encoder
  turns, button presses, sample loads. The core plays the scene, and its audio and screen frames are
  reduced to fingerprints that are compared with stored ones. The same scenes run in the Rust test
  build and in the exact WASM file the browser uses, run outside the browser; later also in the
  device build. All must give the same fingerprints. Screens are also saved as images, so a changed
  fingerprint shows what changed.
- **Playing becomes testing.** A session in the browser can be saved as an event log and turned into
  a new scene, so a bug found while playing becomes a test.
- **Rule checks.** The core does not use Rust's allocation library, so an accidental allocation
  fails to compile. The core is also built for a target without Rust's standard library, which
  proves it never relies on one. Tests check that no "not a number" value reaches the output.
- **Budget checks.** Memory sizes are checked at build time against the budget profile; operation
  counts for fixed scenes are tracked to catch CPU regressions.
- **Screen gallery.** A browser page shows every screen in fixed states, for fast layout work and
  visual review.
- The repo's CI runs all of it on every change.

## Repo, build and licence

- **`packages/groovebox-core/`** holds one Rust workspace: the core library, the thin browser crate
  and, later, the device crate.
  - The core library has no platform code, no statics and no target-specific conditions. It holds
    the audio engine, the control part that draws into a frame buffer it is given, the message types
    and the queue.
  - The browser crate owns the statics and exports both entry points from one `.wasm` file, as plain
    exported functions without `wasm-bindgen`.
  - The package is generated from a new **alpha Rust template in the Carson templates package**
    (owner's choice); creating that template is a step of the implementation plan. Like the other
    templates, it provides a `package.json` that lets turbo build the package like any other: its
    build compiles the `.wasm` file into `build/`, and turbo is told which Rust files are inputs, so
    caching works.
- **`apps/groovebox/`** holds the browser shell, generated from the Carson app template like the
  other apps, so it shares their linting, formatting, tests and type checking.
- The Rust version is pinned in a toolchain file, so every build uses the same compiler, which
  bit-identical output depends on. CI caches Rust builds.
- Every page and worker script is served with the isolation headers. Where Carson's generated
  configs do not allow that, the fix goes into the Carson app template as an option, not into
  generated files.
- **Deployment: local only in part 1** (owner's choice). The virtual device runs on the owner's
  computer with the development server, which sends the isolation headers. A production server and
  deployment are designed when they are needed, at the latest for the companion app in part 2.
- **Licence:** GPL-3.0-or-later in both packages. Dependencies must be GPL-compatible; MIT, Apache
  and BSD are.
- Building needs a current Rust toolchain. Installing it is the owner's call at the start of
  implementation.

## To verify first

These research findings have not been checked in practice. The first implementation task is a short
spike that checks them:

- The stable build route produces a module whose only import is the shared memory, and the nightly
  fallback produces the same shape.
- Two instances on one shared memory: statics are shared and initialised once, the worker-first
  loading order works, and the two stacks stay apart.
- The AudioWorklet cannot reach storage or wait, and the worker can read files from the site's
  private file storage straight into shared memory.
- The isolation headers reach every page and worker script in the Carson-generated app's development
  server.
- The browser's real audio latency on the owner's computer, which decides how live playing feels.

## Changes to the part 1 overview

Applied to the overview together with this spec:

- The display (4.3″, 480×272) is provisional, like all hardware.
- The STM32H7 reference target is replaced by the budget profile.
- "The core runs in an AudioWorklet" is refined: the audio part runs in an AudioWorklet, the control
  part in a worker.
- Colour moves from Foundation to the Look spec.

## Assumptions about other specs

- **Sound:** defines the parameter list with the mechanism above; sets voice limits that fit the
  budget profile; decides which sample file formats are accepted; voices read samples through the
  block call; sets glide times per parameter.
- **Workflow A:** defines the actions and their default bindings; decides whether bindings are saved
  per project or as device settings; decides how encoders feel and which parameters sit on which
  page.
- **Workflow B:** decides whether note values use the parameter mechanism; whether played timing is
  kept as an offset from the step or quantize is permanent; swing applied at playback or not;
  quantize grids expressed in ticks. Tempo changes are jumps, not ramps, unless Workflow B needs
  ramps.
- **Project model:** defines the folder layout and the project file format; stores parameters as "ID
  = number"; refers to sample files instead of embedding them; sizes the note store as a fixed pool
  within the budget profile; applies the per-project sample budget.
- **Look:** chooses the emulated resolution, chunkiness, colour format and palette, fonts and
  drawing operations; keeps the frame buffer within the working-memory budget.

## Research sources

- **Browser:**
  [Chrome audio worklet design pattern](https://developer.chrome.com/blog/audio-worklet-design-pattern/);
  [HTML agents](https://html.spec.whatwg.org/multipage/webappapis.html#integration-with-the-javascript-agent-formalism);
  [AudioWorkletGlobalScope compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/AudioWorkletGlobalScope.json);
  [COOP and COEP](https://web.dev/articles/coop-coep);
  [storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- **Rust and WASM:**
  [wasm32-wasip1-threads](https://doc.rust-lang.org/nightly/rustc/platform-support/wasm32-wasip1-threads.html);
  [wasm32-unknown-unknown](https://doc.rust-lang.org/nightly/rustc/platform-support/wasm32-unknown-unknown.html);
  [rust-lang/rust#147225](https://github.com/rust-lang/rust/pull/147225);
  [atomics tracking issue](https://github.com/rust-lang/rust/issues/77839);
  [wasm-ld Writer.cpp](https://github.com/llvm/llvm-project/blob/main/lld/wasm/Writer.cpp);
  [WebAssembly threads proposal](https://github.com/WebAssembly/threads/blob/main/proposals/threads/Overview.md);
  [Emscripten Wasm Audio Worklets](https://emscripten.org/docs/api_reference/wasm_audio_worklets.html);
  [build-std goal](https://goals.rust-lang.org/2026/build-std.html).
- **Numbers:** [Rust f32](https://doc.rust-lang.org/std/primitive.f32.html);
  [RFC 3514](https://github.com/rust-lang/rfcs/blob/master/text/3514-float-semantics.md);
  [WebAssembly nondeterminism](https://www.webassembly.org/docs/nondeterminism/).
- **Sample memory:**
  [Digitakt II manual](https://www.elektron.se/wp-content/uploads/2026/10/Digitakt-2-User-Manual_ENG_OS1.17_260930.pdf);
  [Octatrack MKII manual](https://www.elektron.se/wp-content/uploads/2026/08/Octatrack-MKII-User-Manual_ENG_OS1.40C_260827.pdf);
  [Deluge firmware](https://github.com/SynthstromAudible/DelugeFirmware);
  [Polyend Tracker manual](https://polyend-website.fra1.digitaloceanspaces.com/wp-content/uploads/2023/08/01084159/Polyend-Tracker-Manual-1.7.0.pdf).
- **Screen:** [m8c](https://github.com/laamaa/m8c);
  [embedded-graphics-core](https://docs.rs/embedded-graphics-core);
  [Playdate USB stream](https://github.com/cranksters/playdate-reverse-engineering);
  [Deluge OLED mirroring](https://github.com/SynthstromAudible/DelugeFirmware/blob/community/src/deluge/hid/hid_sysex.cpp).
- **Musical time:** [Ardour, representing time](https://ardour.org/representing-time.html);
  [Deluge playback handler](https://github.com/SynthstromAudible/DelugeFirmware/blob/community/src/deluge/playback/playback_handler.cpp);
  [CLAP fixed point](https://github.com/free-audio/clap/blob/main/include/clap/fixedpoint.h);
  [Roger Linn on swing](https://attackmagazine.com/features/interview/roger-linn-swing-groove-magic-mpc-timing/);
  [timing perception](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01709/epub).
- **Parameters:**
  [CLAP params](https://github.com/free-audio/clap/blob/main/include/clap/ext/params.h);
  [VST3 parameters](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical+Documentation/Parameters+Automation/Index.html);
  [LV2 core](https://lv2plug.in/ns/lv2core);
  [Deluge params](https://github.com/SynthstromAudible/DelugeFirmware/blob/community/src/deluge/modulation/params/param.h);
  [Plaits voice](https://github.com/pichenettes/eurorack/blob/master/plaits/dsp/voice.h);
  [NIH-plug smoothing](https://github.com/robbert-vdh/nih-plug/blob/master/src/params/smoothing.rs).
