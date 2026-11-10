# Groovebox foundation spike

The spike for Task 1 of the [foundation plan](./2026-11-10-groovebox-foundation.md). It checks the
findings that the [Foundation spec](../specs/2026-11-02-groovebox-foundation-design.md) marks
**(unverified)**. The spike code lived in `%TEMP%\groovebox-spike\` and is not kept in any repo;
this report is its only kept output.

## Machine and tools

- Windows 11 Pro 10.0.26300.
- rustup 1.29.3, after `rustup self update` from 1.27.1.
- Rust 1.99.1 (`rustc 1.99.1 (58cf8f9c3 2026-10-13)`) with `clippy`, `rustfmt`,
  `wasm32-wasip1-threads` and `thumbv7em-none-eabihf`. Its linker is LLD 23.1.1.
- The nightly: **`nightly-2026-11-01`** (`rustc 1.101.0-nightly (f9ceb4a4d 2026-10-31)`) with
  `rust-src`. That date has `rust-src`, so no earlier date was needed. Its linker is LLD 23.1.4.
- Node 24.19.0 for `check-imports.mjs` and `serve.mjs`.
- Browser: Google Chrome 155.0.8059.79, headed, launched by the Playwright browser tools with its
  own profile. Among the flags the tools pass, these affect timers and audio:
  `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`,
  `--disable-backgrounding-occluded-windows` and `--disable-hang-monitor`. The page stayed visible
  in every run.
- Audio output: Realtek(R) Audio. Both of its endpoints, Speakers and Headphones, run at 48 kHz,
  16-bit, in Windows shared mode.

## Results

| Step | Check                                                                                              | Result                    | Evidence                                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | Stable route: the only import is `env.memory`                                                      | Pass                      | `WebAssembly.Module.imports` gives exactly `[{module: 'env', name: 'memory', kind: 'memory'}]`                                                                                                                         |
| 3    | Stable route: the memory import is shared, 32 pages minimum and maximum                            | Pass                      | Parsed from the import section: flags 3, initial 32, maximum 32. `--max-memory=2097152` overrides the target's default `--max-memory=1073741824`                                                                       |
| 3    | Exports include the global `__stack_pointer` and the five functions                                | Pass                      | Both routes export `memory`, `__stack_pointer`, `counter`, `pop_stamp`, `push_stamp`, `stack_probe` and `stack_top`                                                                                                    |
| 3    | `__tls_size` is not exported, no other import                                                      | Pass                      | Neither route exports any TLS global                                                                                                                                                                                   |
| 3    | Instantiation on `new WebAssembly.Memory({initial: 32, maximum: 32, shared: true})`                | Pass                      | Both routes in Node: `__stack_pointer` 262144, `counter()` 7 then 8, `stack_top()` 327696, ring push and pop in order, `pop_stamp()` empty gives `u64::MAX`, the 65th push is refused                                  |
| 3    | Both routes list the same import and export names and kinds                                        | Pass, after a flag change | First try failed: the stable route exported `memory` and the fallback did not. Adding `--export-memory` to the fallback made them identical. It is written in both routes so the two lists match                       |
| 3    | The fallback route builds with `cargo +nightly-2026-11-01 build ... -Z build-std=core,panic_abort` | **Fail on this machine**  | `error: linker 'link.exe' not found` while building the `compiler_builtins` build script for the host. See "Contradictions and problems"                                                                               |
| 3    | The fallback shape, built by hand with the same nightly and flags                                  | Pass                      | `rustc` builds of `core` and `compiler_builtins` for `wasm32-unknown-unknown` with the fallback's rustflags, then the spike crate: same imports, exports, limits and calls as the stable route                         |
| 4    | The worker's `counter()` is 7 and the worklet's is 8                                               | Pass                      | Both routes, in Chrome: worker 7, worklet 8                                                                                                                                                                            |
| 4    | The stacks lie in different regions; the worklet's lies inside the 64 KiB array                    | Pass                      | Worker `stack_probe()` 262072, inside the linker's stack 0 to 262144. Worklet `stack_probe()` 327624, inside the array 262160 to 327696. Both instances start with `__stack_pointer` 262144, so setting it is required |
| 4    | `crossOriginIsolated` in the page and the worker                                                   | Pass                      | `true` in both                                                                                                                                                                                                         |
| 4    | `Atomics.notify` from the worklet resolves the worker's `Atomics.waitAsync`                        | Pass                      | `Atomics.notify` returned 1; the worker's promise resolved with `'ok'`                                                                                                                                                 |
| 4    | Worker first, then the AudioWorklet instance                                                       | Pass                      | The worklet's synchronous `new WebAssembly.Instance` succeeded after the worker reported ready. The opposite order was not tried                                                                                       |
| 5    | In the worklet, `navigator?.storage` is undefined                                                  | Pass                      | `typeof navigator` is `'undefined'`, so there is no storage at all                                                                                                                                                     |
| 5    | In the worklet, `Atomics.wait` throws                                                              | Pass                      | `TypeError: Atomics.wait cannot be called in this context`                                                                                                                                                             |
| 5    | In the worker, `FileSystemSyncAccessHandle.read()` into a `Uint8Array` on the shared buffer        | Pass                      | Reads straight into a `SharedArrayBuffer`-backed view work; the bytes match what was written. No plain buffer or copy is needed                                                                                        |
| 6    | Library load: 64 MB from OPFS into shared memory                                                   | Measured                  | See "Numbers"                                                                                                                                                                                                          |
| 6    | Audio after 2 s: `sampleRate`, `baseLatency`, `outputLatency`                                      | Measured                  | See "Numbers"                                                                                                                                                                                                          |
| 6    | Delivery lateness over 60 s                                                                        | Measured                  | See "Numbers"                                                                                                                                                                                                          |
| 6    | The audio clock keeps real time during the lateness window                                         | **Fail when silent**      | After about 30 s of silent output the clock ran at about 69% of real time. See "The audio clock"                                                                                                                       |

## Build settings

Exactly as used by the spike. Task 13 moves `--initial-memory` and `--max-memory` into `build.rs`.

The fallback's config and command were never run through cargo here: cargo failed for lack of a host
linker, and the fallback's shape was checked with a hand build (see "Contradictions and problems").
Task 13's `node build.js --fallback` is their first real run.

`Cargo.toml` of the spike crate:

```toml
[lib]
crate-type = ["cdylib"]

[profile.dev]
panic = "abort"

[profile.release]
panic = "abort"
```

The crate is `#![no_std]` with a `#[panic_handler]` that calls `core::arch::wasm32::unreachable()`.

`.cargo/config.toml`:

```toml
[target.wasm32-wasip1-threads]
rustflags = [
  "-C", "link-arg=--import-memory",
  "-C", "link-arg=--export-memory",
  "-C", "link-arg=--shared-memory",
  "-C", "link-arg=--initial-memory=2097152",
  "-C", "link-arg=--max-memory=2097152",
  "-C", "link-arg=--export=__stack_pointer",
  "-C", "link-arg=-zstack-size=262144",
]

[target.wasm32-unknown-unknown]
rustflags = [
  "-C", "target-feature=+atomics,+bulk-memory,+mutable-globals",
  "-C", "link-arg=--import-memory",
  "-C", "link-arg=--export-memory",
  "-C", "link-arg=--shared-memory",
  "-C", "link-arg=--initial-memory=2097152",
  "-C", "link-arg=--max-memory=2097152",
  "-C", "link-arg=--export=__stack_pointer",
  "-C", "link-arg=-zstack-size=262144",
]
```

Commands:

- Stable route: `cargo +1.99.1 build --release --target wasm32-wasip1-threads`
- Fallback route:
  `cargo +nightly-2026-11-01 build --release --target wasm32-unknown-unknown -Z build-std=core,panic_abort`
- Fallback toolchain: `nightly-2026-11-01`, installed with `--profile minimal --component rust-src`.

What rustc adds on its own, from `--print link-args`:

- Both routes: `-z stack-size=1048576 --stack-first --no-demangle --gc-sections --no-entry -O3`. The
  spike's `-zstack-size=262144` comes later and wins.
- Stable route only: `--import-memory --export-memory --shared-memory --max-memory=1073741824`. The
  spike's `--max-memory=2097152` comes later and wins. wasm-ld has no option that turns
  `--export-memory` off, which is why the fallback needs it too.
- Neither route passes `--allow-undefined`, so a missing symbol is a link error, not a new import.

Resulting layout: the stack runs from 0 to 262144, the statics follow it and the 64 KiB array runs
from 262160 to 327696.

## Numbers

Four full runs on the stable route, on an otherwise idle machine. Runs 1 to 3 output silence. Run 4
outputs a constant 1e-9 on both channels, far below anything a 16-bit output can play, to test the
cause of the slow clock (see "The audio clock"). Runs 3 and 4 add a clock cross-check.

| Measure                           | Run 1                    | Run 2               | Run 3               | Run 4               |
| --------------------------------- | ------------------------ | ------------------- | ------------------- | ------------------- |
| Output                            | silence                  | silence             | silence             | 1e-9                |
| Library load, warm-up             | 22.5 ms                  | 25.8 ms             | 25.8 ms             | 30.4 ms             |
| Library load, 3 runs              | 27.7, 24.9, 22.1 ms      | 28.6, 25.7, 21.3 ms | 21.5, 21.8, 21.6 ms | 32.5, 25.7, 22.7 ms |
| **Library load, median**          | **24.9 ms**              | **25.7 ms**         | **21.6 ms**         | **25.7 ms**         |
| `sampleRate`                      | 48000                    | 48000               | 48000               | 48000               |
| `baseLatency`                     | 0.010667 s (512 samples) | 0.010667 s          | 0.010667 s          | 0.010667 s          |
| `outputLatency`                   | 0.048 s (2304 samples)   | 0.048 s             | 0.048 s             | 0.048 s             |
| Audio clock behind the wall clock | at least 10.1 s          | at least 4.4 s      | 9.8 s in 60.0 s     | 0.004 s in 60.0 s   |
| Lateness, median                  | 0 samples                | 0 samples           | 0 samples           | **0 samples**       |
| Lateness, p99                     | 512 samples              | 512 samples         | 512 samples         | **0 samples**       |
| Lateness, max                     | 512 samples              | 512 samples         | 512 samples         | **512 samples**     |
| Stamps sent, pushed, refused      | 1200, 1200, 0            | 1200, 1200, 0       | 1200, 1200, 0       | 1200, 1200, 0       |

- **Library load** is opening the file, reading all 67,108,864 bytes in one `read()` call and
  closing it: about 2.6 to 3.1 GB/s. The read goes into a `Uint8Array` on a separate 64 MiB shared
  `WebAssembly.Memory` that stands in for sample RAM, not into the spike module's own memory, which
  is only 2 MiB. Runs 1 and 3 wrote the file just before reading it; runs 2 and 4 found it from the
  run before. In every run the warm-up read went first, so the timed reads came from a warm
  operating system file cache. A cold start after a reboot was not measured.
- **Audio:** Chrome renders 4 quanta of 128 samples at a time (`baseLatency` 512 samples). The
  output adds 40 to 48 ms: one extra context, on the fallback module, read `outputLatency` 0.040 s.
  From the moment the audio part renders a sample to the speaker it is therefore about 51 to 59 ms.
- **Lateness:** run 4 is the delivery measurement with the audio clock on the sound card. Runs 1 to
  3 ran partly on the slow clock described below, so their lateness numbers mix two states.
  Distribution in run 4: 0 samples 1194 times, 128 samples once, 384 samples once and 512 samples 4
  times. In run 2: 0 samples 916 times, 128 samples 69 times, 256 samples 18 times, 384 samples 18
  times and 512 samples 179 times. A stamp is either in the ring before the next batch of quanta
  starts (0) or waits for one batch (up to 512). The page's 50 ms timer fired every 47.0 to 47.7 ms
  at the median and at most every 64.7 ms.

## The audio clock

In runs 1 to 3 the audio clock fell behind the wall clock. It did not stall; it ran slow.

- **Run 3 cross-check.** Every 50 ms the page logged the worklet's position against
  `performance.now()`. For the first 28 s of the window the clock advanced 46,080 to 48,640 frames
  per second. From second 28 to the end it advanced 32,256 to 35,328 frames per second, about 69% of
  real time. The position never stood still for 100 ms or more. The worklet also logged `Date.now()`
  at every `process()` call: no gap in the window was over 30 ms. Over the 60.0 s window the clock
  covered 50.2 s.
- **Runs 1 and 2** had no cross-check. Their final positions, 52.2 s and 58.0 s of audio, against at
  least 62.3 s of wall clock since the context started, put them at least 10.1 s and 4.4 s behind.
- **Cause.** The slow phase began about 30 s after the context started, with nothing but zeros sent
  to the output. Chrome then moves a silent output off the sound card and drives it from a timer
  instead: `media/base/silent_sink_suspender.cc` checks for exact zeros with `AreFramesZero()`,
  pauses the real output after a timeout and starts a timer-driven one. At about 33,000 frames per
  second that timer delivers one batch of 512 frames every 15.5 ms or so, close to the 15.6 ms
  default Windows timer tick. Run 4 differs only in its constant 1e-9 output: its clock kept 48,000
  frames per second for the whole window (60.011 s of audio in 60.014 s) and its largest `process()`
  gap was 11 ms.
- **What lateness can see.** Lateness counts audio clock samples, so it cannot show a slow or frozen
  clock. Only the wall clock cross-check does.

## Contradictions and problems

1. **The fallback only has the stable route's shape with `--export-memory` added.** The spec says
   the nightly fallback "gives a module of the same shape". The `wasm32-wasip1-threads` target
   always exports its memory, and wasm-ld cannot turn that off. With `--export-memory` in the
   fallback's link args the two modules list the same names and kinds. The Build settings above
   include it in both routes.
2. **The stable route cannot link `memcmp`.** The stable target's prebuilt `compiler_builtins`
   leaves the memory functions to wasi-libc, which a `no_std` crate does not link. A side probe that
   compares two byte slices failed on the stable route with
   `rust-lld: error: ... undefined symbol: memcmp`. Adding `-C link-arg=-lc`, which links the
   wasi-libc that ships with the target, fixed it with no new import. The fallback route links it
   from its own `compiler_builtins`. Copying memory and filling it were fine on both routes: they
   become bulk memory instructions. The spike crate itself needs none of this, so the Build settings
   above do not include `-lc`. If the browser crate or the core compares byte slices, Task 13's
   stable build fails to link without it.
3. **This machine has no host linker.** It has no Visual Studio C++ build tools and no Windows SDK,
   so `link.exe` is missing. `rustc +1.99.1 hello.rs` for the host fails with
   `linker 'link.exe' not found`. In Git Bash, rustc even picks up Git's unrelated `link` command.
   As a result:
   - the fallback route's `cargo ... -Z build-std` fails, because the `compiler_builtins` build
     script must be built for the host;
   - every other host build fails the same way: any `build.rs`, including Task 13's, every
     `cargo test` (the starter crate in Task 8 and the core from Task 9 on; likely also the
     template's smoke test in Task 3) and the drift harness.

   The stable route only built because the spike crate has no build script. The fallback's shape was
   checked by building `core` and `compiler_builtins` by hand with `rustc`, which needs no host
   linker. This is not a finding about the routes but a missing tool on this machine. It needs a
   decision before Task 3: for example installing the Visual Studio Build Tools with the C++
   workload, which the MSVC host toolchain expects.

   **Resolved on 2026-11-10, without Visual Studio.** Host builds keep the MSVC toolchain but link
   with Rust's own `rust-lld` against the Microsoft CRT and Windows SDK libraries, fetched by
   [xwin](https://github.com/Jake-Shadle/xwin) 0.10.0 into `D:\winsdk` (632 MB). Fetching them
   accepts Microsoft's licence for those libraries. A plain `splat` fails here because creating
   symbolic links needs a privilege this user does not have, so the command is:

   ```
   xwin --accept-license splat --use-winsysroot-style --preserve-ms-arch-notation --disable-symlinks --output D:\winsdk
   ```

   The user-level `%USERPROFILE%\.cargo\config.toml` holds:

   ```toml
   [target.x86_64-pc-windows-msvc]
   linker = "rust-lld"

   [env]
   LIB = 'D:\winsdk\VC\Tools\MSVC\14.44.17.14\lib\x64;D:\winsdk\Windows Kits\10\Lib\10.0.26100\um\x64;D:\winsdk\Windows Kits\10\Lib\10.0.26100\ucrt\x64'
   ```

   Nothing in the repo or CI changes. With only that file in place, a probe crate passed its host
   tests with `libm`, `png`, `loom` and `wasmtime` 50 (two instances on one shared memory, and a
   trap), `cargo clippy` with warnings denied, the fallback route's real `-Z build-std` command and
   the stable route, both with a build script. The `x86_64-pc-windows-gnullvm` host was tried first
   and fails: build scripts that use the `cc` crate (in `generator`, which `loom` uses, and in
   `wasmtime`) link `advapi32`, `ole32` and `oleaut32`, which that toolchain does not ship. wasmtime
   also needs `Config::shared_memory(true)` besides `wasm_threads(true)` to accept a shared memory.

4. **A silent output slows the audio part down.** The spec has the audio part's wake-up, once per
   batch, pace the control part. After about 30 s of exact silence Chrome drives the AudioWorklet
   from a timer instead of the sound card, and here that ran it at about 69% of real time. The
   wake-ups and with them the control part would slow down by the same amount; the audio position
   would fall behind the wall clock. A groovebox that nobody plays outputs exact silence. A constant
   1e-9 output kept the clock on the sound card for the whole window (run 4). The owner decided on
   2026-11-10 to take no action for now; this is a note for later plans.

## Not checked here

- How long Chrome takes to move a silent output back to the sound card when sound starts again, and
  whether the first sound after a silence comes late.
- Whether the isolation headers reach every page and worker script of the Carson-generated app's
  development server. Task 16 Step 5 checks that.
- Creating the AudioWorklet instance before the worker's. The spike only ran the order the spec
  prescribes.
