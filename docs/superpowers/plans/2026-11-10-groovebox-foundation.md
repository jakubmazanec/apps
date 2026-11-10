# Groovebox Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

Plan 1 of 3 for Milestone 1 ("Make a sound"). Plan 2 (the synth sound) and plan 3 (the screens and
the panel) are written after this plan's spike has reported.

**Goal:** The groovebox core runs in Chromium as two parts on one shared WebAssembly memory. You
open the app, click, see a test picture drawn by the core and hear a test tone on the Z key. Drift
tests prove that the native build, the stable WASM build and the fallback WASM build give identical
audio and frames, and that a session recorded in the browser replays identically.

**Architecture:** One Rust workspace in `packages/groovebox-core/` holds three crates:

- `groovebox-core`: the `no_std` library with the audio part, the control part, the queues and
  the frame buffer, and no statics.
- `groovebox-browser`: a thin `cdylib` that owns the statics and exports plain functions.
- `groovebox-drift`: the host-only harness that replays scenes natively and in the built `.wasm`
  files.

The browser shell in `apps/groovebox/` instantiates the one `.wasm` twice on one shared memory:
first in a worker (the control part), then in an AudioWorklet (the audio part). It presents the
frame buffer on a canvas and stamps input with the audio position. Both projects come from Carson
templates in `D:\projects\tools`, which this plan extends first.

**Tech Stack:**

- Rust 1.99.1, edition 2024.
- Stable route: `wasm32-wasip1-threads`. Fallback route: a pinned nightly with `-Z build-std` for
  `wasm32-unknown-unknown`.
- Rust crates: `libm`, `loom`, `wasmtime` and `png`.
- The shell: TypeScript, a React Router 8 app from the Carson app template, Vite, and Vitest (node
  plus Playwright Chromium browser mode).

**Spec:**

- [Foundation](../specs/2026-11-02-groovebox-foundation-design.md) is the main spec.
- [Part 1 overview](../specs/2026-10-26-groovebox-core-browser-design.md): Milestones and the
  "Open points for planning".
- [Look](../specs/2026-11-07-groovebox-look-design.md): "The display", "Colour" and "The browser
  shell".
- [Project model](../specs/2026-11-06-groovebox-project-model-design.md): "One version per edit, at
  its own moment".

## Global Constraints

- Chromium only: Chrome and Edge.
- Bit-identical: the same input events give exactly the same audio samples, screen pixels and note
  timing in every build.
- The core is `no_std` and never allocates while running; it does not use Rust's `alloc` crate, so
  an accidental allocation is a compile error.
- The core library has no platform code, no statics and no target-specific conditions.
- The browser crate owns the statics and exports both entry points from one `.wasm` file, as plain
  exported functions without `wasm-bindgen`.
- 48 kHz. The core keeps its own fixed schedule of 32 samples; the host's batch size must be a
  multiple of 32; the browser asks for 128.
- Every control event is applied at an exact sample position, and that position is recorded with
  it. Replaying the log reproduces the output bit for bit.
- Every message is numbered; the audio part records the sample at which it applied each one; these
  records belong to the session log.
- One step of the control part handles every input stamped before that batch (the audio part's
  wake-up paces the control part).
- Sound uses 32-bit floats. Time and the screen use whole numbers.
- Functions such as sine and exponent come only from `libm`, always called explicitly. Rust's
  built-in float methods are not used for them.
- No fused multiply-add.
- Flush-to-zero stays off.
- No "not a number" value may reach the output; tests check this.
- No logic depends on pointer size.
- No relaxed SIMD.
- Display 480 × 272. 8-bit indexed frame buffer of 130,560 bytes, two buffers. 256-entry palette.
- Drawing operations: fill a rectangle with a palette colour, a horizontal or vertical 1-pixel line
  and an outlined rectangle. Glyphs come in plan 3.
- A target only presents the buffer. The browser zooms the screen by a whole number of the
  monitor's device pixels, never by a fraction. On other scales the shell says so instead of
  pretending.
- Abstract controls in this plan: pad _n_ hit with velocity _v_ and pad _n_ released. Pads are
  numbered 0 to 11 in code; velocity is 1 to 127.
- Every page and worker script is served with `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`.
- Where Carson's generated configs do not allow the isolation headers, the fix goes into the Carson
  app template as an option, not into generated files.
- GPL-3.0-or-later in both packages. Dependencies must be GPL-compatible (MIT, Apache and BSD are).
- Rust 1.99.1 is pinned in `rust-toolchain.toml`. The fallback nightly is pinned by date in
  `build.js` (Task 13).
- Local only. No deployment config for `apps/groovebox`.
- Repo rules:
  - Never hand-edit files with a Carson "DO NOT EDIT" header.
  - Never remove comments.
  - Inline variables and functions used only once.
  - No em-dashes and no Oxford commas in copy, docs or commits.
  - Commit messages in the repo's style: imperative sentence case, no prefixes. Never mention
    Claude, Claude Code or Anthropic in commits, PRs or files.
- Tools repo rules:
  - Every PR targets `development` and needs a changeset.
  - `git status --porcelain` must be empty after `npm test`.
  - Never hand-edit `packages/*/docs/**`, `CONTRIBUTING.md` or `.github/workflows/*.yaml`.
- Run only the focused tests a task names. CI runs the full suite after the last task.

## Review Focus

1. **Rolling holds.** A player hits Z, then another pad, then lets go of the first. The tone must
   keep sounding for the pad still held. Pinned in Task 12
   (`release_of_an_earlier_pad_keeps_the_later_tone`).
2. **A worker that falls behind.** A busy browser skips wake-ups and delivers messages late. The
   recorded session must still replay identically. Pinned in Task 14 (`late.scene`,
   `applied_records_steer_late_messages`).
3. **Input bursts.** More inputs arrive in one step than the input queue holds. None may be lost or
   reordered. Pinned in Task 12 (`input_queue_refuses_when_full_and_accepts_after_a_step`) and
   Task 15 (`drainPending keeps refused inputs in order`).
4. **Display scales and small windows.** At 125% or 150% scale or in a narrow window, the zoom must
   stay a whole number of at least 1, and the note must appear when the picture cannot be exact.
   Pinned in Task 15 (`fitScreen` cases).
5. **Starting twice.** A double click, or a click followed quickly by a key, must build one audio
   graph, not two. Pinned in Task 16 (`two quick clicks start one audio graph`).

## Not in this plan

- **Plan 2:** parameters, real voices, the master path and operation counts.
- **Milestone 3 and 4 plans:** musical time (ticks and tempo) and the output-delay shift for
  recording.
- **Plan 3:** the font and glyphs, the header and strip, pages, the panel, mouse and MIDI, the full
  key map, letting keys go on focus loss, PNG export and the screen gallery.
- **Milestone 2:** storage, sample RAM and the library. The spike only measures loading the library.

Plan 1 meets two open points from the overview and settles them as follows:

- **Starting sound** (approved 2026-11-10): the page shows "Click to start" beside the screen until
  the first click or key.
- **Edit lead:** the spike measures how late messages arrive. The number itself is set in the
  Milestone 3 plan.

## Dependency changes

Approving this plan approves these. The Carson pin in Task 7 still waits for Jakub's OK at the time
it is made.

- **Rust toolchains** (Task 1):
  - Rust 1.99.1 with `clippy`, `rustfmt`, `wasm32-wasip1-threads` and `thumbv7em-none-eabihf`.
  - The nightly the spike pins, with `rust-src`.
  - `rustup self update` to a rustup that installs from `rust-toolchain.toml`.
- **Cargo crates** (`packages/groovebox-core/Cargo.lock`, new):
  - `libm` 0.2 (MIT or Apache-2.0), in groovebox-core.
  - `loom` 0.7 (MIT), an optional dependency of groovebox-core behind the `loom` feature.
  - `wasmtime` at its current release (Apache-2.0 WITH LLVM-exception) and `png` at its current
    release (MIT or Apache-2.0), both in groovebox-drift only.
- **npm in the tools repo:** none.
- **npm in this repo:**
  - `@jakubmazanec/carson-templates` pinned to the exact unstable version Task 6 publishes.
  - The two new workspace packages with their template dependencies, at the versions the
    workspace already uses.
  - The Vitest browser packages the app template adds once `apps/groovebox` has a browser test.
  - `apps/groovebox` depends on `groovebox-core` (`0.0.0`).
- **GitHub action:** `actions/cache` at its current major, in the generated workflows.

## Shared formats

The drift crate parses (Task 14) and the shell writes (Task 15) the **scene file**: UTF-8, one item
per line, `#` comments and blank lines ignored, samples and numbers in decimal:

```
groovebox-scene 1
input <sample> pad-hit <pad> <velocity>
input <sample> pad-release <pad>
step <sample>
applied <message number> <sample>
frame <sample>
expect-audio <sample> <fingerprint as 16 lowercase hex digits>
end <sample>
```

- The first line is the header. `end` is the last line and appears exactly once.
- A scene with no `step` line is **implicit**: the harness steps after every 128-sample batch and
  queues each input just before the first step whose sample is greater than the input's.
- A scene with `step` lines is **explicit**: the harness replays the lines in order. A recorded
  session is always explicit.
- `frame <s>` captures the shown frame after the step at `s`. In implicit scenes, `s` is a multiple
  of 128.
- `expect-audio <s> <f>` says the audio of samples 0 to `s`, end exclusive, has fingerprint `f`. It
  requires `end <s>`.
- `applied` lines may appear anywhere. The harness reads them all before it plays, because a live
  session logs each one only after the step that made its message.

The **fingerprints file** `scenes/<name>.fingerprints` has one `audio <hex16>` line, then one
`frame <sample> <hex16>` line per captured frame.

**Fingerprint:** FNV-1a 64 (offset `0xcbf29ce484222325`, prime `0x100000001b3`):

- Audio: each sample frame adds the left f32's bits as 4 little-endian bytes, then the right's.
- Frames: the pixel bytes in row order.

## File structure

**`D:\projects\tools`** (worktree on branch `rust-template` from `origin/development`):

- `packages/carson-templates/source/isRustProject.ts`: create. Is a project from the Rust template?
- `packages/carson-templates/source/getReferences.ts`: modify. Skip Rust projects.
- `packages/carson-templates/source/constants.ts`: modify. Add `RUST_VERSION`.
- `packages/carson-templates/source/main.ts`: modify. Export the two above.
- `packages/carson-templates/templates/projects/rust/**`: create. The alpha Rust template.
- `packages/carson-templates/templates/projects/app/vite.config.ts.ejs`: modify. The
  `crossOriginIsolation` option.
- `packages/carson-templates/templates/workspace/.github/workflows/{check-pull-request,release-pull-request,release}.yaml.ejs`:
  modify. Rust steps.
- `packages/carson-templates/tests/getReferences.test.ts`: create.
- `packages/carson-templates/tests/smoke-tests.test.ts`: modify.
- `.changeset/rust-template.md`: create.

**`packages/groovebox-core/`**:

- Generated: `package.json`, `.carson/project.json`, `.gitignore`, `.prettierignore`,
  `.editorconfig`, `README.md` and `rust-toolchain.toml`.
- `Cargo.toml`: the workspace with three crates. `Cargo.lock` is committed.
- `.cargo/config.toml`: the link settings of both routes, from the spike.
- `budget.toml`: the budget profile.
- `build.js`: builds `build/groovebox-core.wasm` (stable) and `build/fallback/groovebox-core.wasm`
  (nightly), and installs the toolchains. Only `node:` modules.
- `crates/groovebox-core/build.rs`: turns `budget.toml` into `budget.rs`.
- `crates/groovebox-core/src/`:
  - `lib.rs` and `fingerprint.rs`
  - `queue.rs`: the lock-free SPSC queue between the parts
  - `ring.rs`: the single-thread ring
  - `input.rs` and `message.rs`
  - `audio.rs` and `tone.rs`
  - `screen.rs` and `palette.rs`
  - `control.rs`
  - `device.rs`: both parts and their queues in one struct
- `crates/groovebox-browser/build.rs` and `crates/groovebox-browser/src/lib.rs`: the statics and
  the exports.
- `crates/groovebox-drift/src/`: `lib.rs`, `scene.rs`, `runner.rs`, `native.rs`, `wasm.rs`,
  `play.rs` and `image.rs`. Its test is `tests/drift.rs`.
- `scenes/*.scene`, `scenes/*.fingerprints` and `scenes/<name>/frame-<sample>.png`.

**`apps/groovebox/`**:

- Generated from the app template.
- `source/routes/_index.tsx`: the page.
- `source/shell/`:
  - `memoryLimits.ts`, `present.ts`, `keyboard.ts`, `session.ts`, `pending.ts` and `protocol.ts`
  - `boot.ts`, `startAudio.ts` and `shell.ts`
  - `control.worker.ts` and `audio.worklet.ts`
- `tests/*.test.ts` and `tests/shell.browser.test.ts`.

---

### Task 1: Toolchains and the spike

Foundation's "To verify first", on Jakub's machine. The spike code is thrown away; only its report
is kept.

**Files:**

- Create: `docs/superpowers/plans/2026-11-10-groovebox-foundation-spike.md`. This is the report.
- Throwaway: `%TEMP%\groovebox-spike\`, outside both repos. It holds:
  - a `no_std` cdylib crate
  - `serve.mjs`: `node:http`, port 5100, the two isolation headers on every response
  - `index.html`, `main.js`, `worker.js`, `worklet.js` and `check-imports.mjs`

**Interfaces:**

- Produces:
  - the report's **Build settings** block: the exact rustflags and link args of both routes, which
    Task 13 copies
  - the pinned nightly date
  - the measured numbers

- [ ] **Step 1: Install the toolchains**

  - Run: `rustup self update`
  - Run:
    `rustup toolchain install 1.99.1 --profile minimal --component clippy,rustfmt --target wasm32-wasip1-threads,thumbv7em-none-eabihf`
  - Run:
    `rustup toolchain install nightly-2026-11-01 --profile minimal --component rust-src`

    If that date lacks `rust-src`, take the nearest earlier date that has it.

  Expected: `rustc +1.99.1 --version` prints `rustc 1.99.1`, and
  `rustup +1.99.1 target list --installed` lists both targets.

- [ ] **Step 2: Write the spike crate**

  It exports:

  - `counter() -> u32`: a static `AtomicU32` starting at 7; returns `fetch_add(1)`.
  - `stack_top() -> u32`: the end address of a static, 16-byte-aligned 64 KiB array.
  - `stack_probe() -> u32`: the address of a local array.
  - `push_stamp(stamp: u64) -> u32` and `pop_stamp() -> u64`: a 64-entry SPSC ring of `u64`;
    `pop_stamp` returns `u64::MAX` when empty.

  Candidate link args for the stable route, in `.cargo/config.toml` under
  `[target.wasm32-wasip1-threads]`: `--import-memory`, `--shared-memory`,
  `--initial-memory=2097152`, `--max-memory=2097152`, `--export=__stack_pointer` and
  `-zstack-size=262144`. The fallback route is
  `cargo +<nightly> build --release --target wasm32-unknown-unknown -Z build-std=core,panic_abort`
  with `-C target-feature=+atomics,+bulk-memory,+mutable-globals` and the same link args.

- [ ] **Step 3: Check the module shape of both routes** (Foundation: stable route)

  Run: `node check-imports.mjs <wasm>` for each route. It prints `WebAssembly.Module.imports` and
  `.exports` and instantiates with `new WebAssembly.Memory({initial: 32, maximum: 32, shared: true})`.

  Expected:

  - The imports are exactly `[{module: 'env', name: 'memory', kind: 'memory'}]`.
  - The exports include the global `__stack_pointer` and the five functions.
  - Both routes list the same import and export names and kinds.
  - If `__tls_size` is exported and not 0, or any other import appears, adjust the flags. If no
    flags give the expected shape, record that and stop.

- [ ] **Step 4: Check two instances in the browser**

  Run `node serve.mjs`. Open `http://localhost:5100` in headed Chromium with the Playwright browser
  tools.

  The page compiles the module, creates the shared memory and starts the worker, which
  instantiates and reports ready with `stack_top()`. Only then does the page create
  `new AudioContext({latencyHint: 'interactive', sampleRate: 48000})`, add the worklet and pass
  `{module, memory, stackTop}` in `processorOptions`. The worklet instantiates synchronously, sets
  `exports.__stack_pointer.value = stackTop` before any call, then calls `counter()` and
  `stack_probe()`.

  Expected:

  - The worker's `counter()` is 7 and the worklet's is 8: the statics are shared and initialised
    once.
  - The two `stack_probe()` addresses lie in different regions, and the worklet's lies inside the
    64 KiB array.
  - `crossOriginIsolated` is true in the page and the worker.
  - `Atomics.notify` from the worklet resolves the worker's `Atomics.waitAsync`.

- [ ] **Step 5: Check the worklet's limits and the worker's storage**

  Expected:

  - In the worklet, `navigator?.storage` is undefined and `Atomics.wait` throws.
  - In the worker, `FileSystemSyncAccessHandle.read()` into a `Uint8Array` on the shared buffer
    either works, or the report records the error and times reading into a plain buffer plus a
    copy.

- [ ] **Step 6: Measure**

  - **Library load:** read a 64 MB OPFS file into shared memory. Record the median of 3 runs after
    one warm-up.
  - **Audio:** after 2 s, record the AudioContext's `sampleRate`, `baseLatency` and
    `outputLatency`.
  - **Delivery lateness:** for 60 s, every 50 ms, the page reads the audio position (which the
    worklet writes after each quantum) and posts it to the worker. The worker calls
    `push_stamp(position)`. At the start of each quantum the worklet pops every stamp and records
    `position − stamp`. Report the median, the p99 and the maximum, in samples.

- [ ] **Step 7: Write the report**

  - A table with one row per check (Steps 3 to 6): result and evidence.
  - The **Build settings** block for both routes, exactly as used.
  - The nightly date.
  - The numbers.
  - Anything that contradicts Foundation's "(unverified)" findings, stated plainly.

  Commit:

  ```bash
  git add docs/superpowers/plans/2026-11-10-groovebox-foundation-spike.md
  git commit -m "Record the groovebox foundation spike"
  ```

- [ ] **Step 8: Stop and report to Jakub.** Continue with Task 2 only on his go. If a check failed,
  bring the failure and the options; change nothing in this plan without him.

---

### Task 2: Carson skips Rust projects in TypeScript references

In the tools worktree. Without this, an app that depends on a Rust package gets a tsconfig
reference to it, and `tsc` fails.

**Files:**

- Create: `packages/carson-templates/source/isRustProject.ts`
- Create: `packages/carson-templates/tests/getReferences.test.ts`
- Modify: `packages/carson-templates/source/getReferences.ts`
- Modify: `packages/carson-templates/source/main.ts`

**Interfaces:**

- Produces:
  - `isRustProject(project: Project | Project<false>): boolean`: true when
    `project.config.template` includes `projects/rust`.
  - Exported from `main.ts`, so templates can use it as a global.

- [ ] **Step 1: Write the failing test**

```ts
test('getReferences skips Rust projects', () => {
  let app = {name: 'app', relativePath: 'apps/app', config: {template: '@jakubmazanec/carson-templates:projects/app'}};
  let core = {name: 'core', relativePath: 'packages/core', config: {template: '@jakubmazanec/carson-templates:projects/rust'}};
  let library = {name: 'library', relativePath: 'packages/library', config: {template: '@jakubmazanec/carson-templates:projects/library'}};
  let workspace = {
    projects: [app, core, library],
    allDependencies: [{name: 'core', projects: [app]}, {name: 'library', projects: [app]}],
  };

  expect(getReferences(workspace as unknown as Workspace, app as unknown as Project)).toEqual([
    {path: '../../packages/library'},
  ]);
});

test('isRustProject', () => {
  expect(isRustProject({config: {template: '@jakubmazanec/carson-templates:projects/rust'}} as unknown as Project)).toBe(true);
  expect(isRustProject({config: {template: '@jakubmazanec/carson-templates:projects/app'}} as unknown as Project)).toBe(false);
  expect(isRustProject({config: {}} as unknown as Project)).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npx vitest run tests/getReferences.test.ts` in `packages/carson-templates`.

  Expected: FAIL. `isRustProject` does not exist, and the core reference is returned.

- [ ] **Step 3: Implement `isRustProject` and skip it in `getReferences`**

  Skip when the matched `workspaceProject` is a Rust project.

- [ ] **Step 4: Run the test to verify it passes**

  Same command. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Skip Rust projects in TypeScript references"`

---

### Task 3: The alpha Rust template

**Files:**

- Create, under `packages/carson-templates/templates/projects/rust/`:
  - `config.json`
  - `package.json.create.ejs` and `package.json.ejs`
  - `Cargo.toml.create.ejs`
  - `rust-toolchain.toml.create.ejs`
  - `crates/<name>/Cargo.toml.create.ejs` and `crates/<name>/src/lib.rs.create.ejs`
  - `.gitignore.ejs`, `.prettierignore.ejs`, `.editorconfig.ejs` and `README.md.create.ejs`
- Modify: `packages/carson-templates/source/constants.ts` (`RUST_VERSION = '1.99.1'`)
- Modify: `packages/carson-templates/tests/smoke-tests.test.ts`

**Interfaces:**

- Consumes: `isRustProject` (Task 2).
- Produces: template ID `@jakubmazanec/carson-templates:projects/rust`. A generated project has:
  - `toolchain`, `lint`, `format` and `clean` scripts owned by the template, through the merge
    strategy.
  - `build` and `test` scripts owned by the project, written once by the create file.

What the files hold:

- **`config.json`:** `{}`.
- **`package.json.create.ejs`** (strategy `create`):
  - name, `"version": "0.0.0"`, empty description, repository URL and `AUTHOR`, as in the library
    template
  - `"license": "GPL-3.0-or-later"`
  - `"scripts": {"build": "cargo build --release", "test": "cargo test --workspace"}`
- **`package.json.ejs`** (strategy `merge`), shaped like the library template's:
  - `repository.directory`, `"private": true` and `"type": "module"`
  - scripts:
    - `toolchain`: `rustup toolchain install`
    - `lint`: `cargo clippy --workspace --all-targets -- --deny warnings`
    - `format`: `cargo fmt --all && <FORMAT_COMMAND>`
    - `clean`: `cargo clean && del-cli build`
  - devDependencies from `getDependencies(['del-cli', 'prettier', 'prettier-plugin-packagejson'], workspace)`
  - `packageManager` and `engines` as in the library template
  - finally merged with `project.config.overrides?.packageJson`
- **`Cargo.toml.create.ejs`:**
  - `[workspace]` with `resolver = "3"` and `members = ["crates/*"]`
  - `[workspace.package]` with `edition = "2024"`, `license = "GPL-3.0-or-later"` and
    `publish = false`
- **`rust-toolchain.toml.create.ejs`:** `[toolchain]` with `channel = "<%- RUST_VERSION %>"`,
  `components = ["clippy", "rustfmt"]` and `profile = "minimal"`.
- **The starter crate:** `crates/<name>/`, where `<name>` is the last segment of `project.name`;
  `to:` is rendered by EJS. It is a library with `pub fn add(left: u64, right: u64) -> u64` and one
  test, as `cargo new --lib` writes it. Its `Cargo.toml` inherits edition, license and publish from
  the workspace.
- **`.gitignore.ejs`:** `/target`.
- **`.prettierignore.ejs` and `.editorconfig.ejs`:** like the library template's; the prettier
  ignore also lists `target`.
- **`README.md.create.ejs`:** the name, then one line: "Generated from the alpha Carson Rust
  template."
- **No package-level `turbo.json`.** Turbo's default inputs are the package's git-tracked files, so
  every Rust file is already an input and caching works; `target/` is ignored.

- [ ] **Step 1: Add the smoke case** (the failing test)

  Add a second `describe.each` row:

  ```ts
  {
    label: '#2',
    workspaceTemplateId: '@jakubmazanec/carson-templates:workspace',
    projectTemplateIds: ['@jakubmazanec/carson-templates:projects/rust'],
  }
  ```

  Before the smoke test builds, run `npm run toolchain --workspaces --if-present` in the workspace.

- [ ] **Step 2: Run it to verify it fails**

  Run: `npx vitest run tests/smoke-tests.test.ts -t "#2"` in `packages/carson-templates`.

  Expected: FAIL. The template `projects/rust` is not found.

- [ ] **Step 3: Write the template files above and `RUST_VERSION`**

- [ ] **Step 4: Run it to verify it passes**

  Same command. Expected: PASS. The workspace builds with cargo.

- [ ] **Step 5: Commit**

  `git commit -m "Add an alpha Rust project template"`

---

### Task 4: Rust steps in the generated CI

**Files:**

- Modify: `packages/carson-templates/templates/workspace/.github/workflows/check-pull-request.yaml.ejs`
- Modify: `packages/carson-templates/templates/workspace/.github/workflows/release-pull-request.yaml.ejs`
- Modify: `packages/carson-templates/templates/workspace/.github/workflows/release.yaml.ejs`. It
  has two jobs.
- Modify: `packages/carson-templates/tests/smoke-tests.test.ts`

**Interfaces:**

- Consumes: `isRustProject` (Task 2); the `toolchain` script (Task 3).
- Produces: in all four jobs, right after `actions/setup-node`, one block per
  `workspace.projects.filter(isRustProject)`:

```yaml
      - name: Install the Rust toolchains of <%- project.relativePath %>
        run: npm run toolchain --workspace=<%- project.relativePath %>

      - uses: actions/cache@<current major>
        with:
          path: |
            ~/.cargo/registry/index
            ~/.cargo/registry/cache
            ~/.cargo/git/db
            <%- project.relativePath %>/target
          key: rust-${{ runner.os }}-<%- project.name %>-${{ hashFiles('<%- project.relativePath %>/Cargo.lock', '<%- project.relativePath %>/rust-toolchain.toml') }}
          restore-keys: rust-${{ runner.os }}-<%- project.name %>-
```

- [ ] **Step 1: Write the failing assertion**

  In case `#2`, after the workspace update, add:

  ```ts
  let workflow = await fs.readFile(path.join(workspacePath, '.github/workflows/check-pull-request.yaml'), 'utf8');

  expect(workflow).toContain('npm run toolchain --workspace=packages/project-0');
  expect(workflow).toContain('packages/project-0/target');
  ```

- [ ] **Step 2: Run it to verify it fails**

  Run: `npx vitest run tests/smoke-tests.test.ts -t "#2"`. Expected: FAIL on `toContain`.

- [ ] **Step 3: Add the block to the four jobs**

  Place it where the gel step's guard sits.

- [ ] **Step 4: Run it to verify it passes**

  Same command. Expected: PASS. Then check that case `#1`'s workflows are unchanged: no Rust
  projects means no block.

- [ ] **Step 5: Commit**

  `git commit -m "Install and cache Rust toolchains in CI for Rust projects"`

---

### Task 5: The app template's `crossOriginIsolation` option

Vite's `server.headers` misses React Router's pages, so the option adds a plugin. The plugin sets
both headers on every response of the dev and preview servers, before any other middleware. The
Vitest server shares the plugins, so browser tests are isolated too.

**Files:**

- Modify: `packages/carson-templates/templates/projects/app/vite.config.ts.ejs`
- Modify: `packages/carson-templates/tests/smoke-tests.test.ts`

**Interfaces:**

- Produces: `.carson/project.json` key `"crossOriginIsolation": true`. When set, the generated
  `vite.config.ts` has this in `plugins`:

```ts
{
  name: 'cross-origin-isolation',
  configureServer(server) { server.middlewares.use(setIsolationHeaders); },
  configurePreviewServer(server) { server.middlewares.use(setIsolationHeaders); },
}
```

  `setIsolationHeaders` sets `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, then calls `next()`.

- [ ] **Step 1: Write the failing assertion**

  In case `#1`, before the first workspace update, write `crossOriginIsolation: true` into the app
  project's `.carson/project.json`. After the update, assert that its `vite.config.ts` contains
  `'Cross-Origin-Embedder-Policy'` and `'require-corp'`.

- [ ] **Step 2: Run it to verify it fails**

  Run: `npx vitest run tests/smoke-tests.test.ts -t "#1"`. Expected: FAIL on the assertion.

- [ ] **Step 3: Render the plugin when `project.config.crossOriginIsolation` is true**

- [ ] **Step 4: Run it to verify it passes**

  Same command. Expected: PASS, including the case's build.

- [ ] **Step 5: Commit**

  `git commit -m "Add a cross-origin isolation option to the app template"`

---

### Task 6: Release the templates as an unstable version

- [ ] **Step 1: Run the package gate**

  Run: `npx turbo run test --no-daemon --filter=@jakubmazanec/carson-templates`

  Expected: PASS, and `git status --porcelain` is empty.

- [ ] **Step 2: Write `.changeset/rust-template.md`**

  `'@jakubmazanec/carson-templates': minor`, with one line each for:

  - the alpha Rust template
  - the `crossOriginIsolation` app option
  - the Rust CI steps
  - Rust projects left out of TypeScript references

  Commit: `git commit -m "Add a changeset for the Rust template"`

- [ ] **Step 3: Stop: ask Jakub before pushing**

  Push `rust-template` and open the PR into `development` only after his OK. The PR body lists the
  four changes; nothing else.

- [ ] **Step 4: Note the published version**

  Wait for the PR's `release-pull-request` workflow. Note the exact
  `@jakubmazanec/carson-templates@9.x.0-unstable.<sha>` it publishes, for Task 7.

---

### Task 7: Pin the unstable Carson templates

Back in this repo, on the implementation branch.

**Files:**

- Modify: `package.json` and `package-lock.json`
- Commit any files `carson update workspace` regenerates

- [ ] **Step 1: Stop: ask Jakub for the OK**

  Pin the exact version from Task 6. This is the dependency change he asked to approve when it is
  made.

- [ ] **Step 2: Pin and install**

  Set `"@jakubmazanec/carson-templates": "<exact version>"` in the root `package.json`. Run
  `npm install`. Its `prepare` runs `carson update workspace`.

  Expected:

  - The lockfile pins the version.
  - `node_modules/@jakubmazanec/carson-templates/package.json` shows it. Today it holds a stale
    `9.1.0-unstable.d78a4437` from another branch.

- [ ] **Step 3: Check the regenerated files**

  Run: `git status`. `development` may carry unreleased template changes, so list every
  regenerated file for Jakub. Groovebox does not exist yet, so nothing Rust-specific may appear.

- [ ] **Step 4: Commit**

  `git commit -m "Update Carson templates"`

---

### Task 8: Create the core package and the app

**Files:**

- Create: `packages/groovebox-core/**` and `apps/groovebox/**`, from the templates.
- Modify:
  - `apps/groovebox/package.json`: license and the dependency
  - `apps/groovebox/.carson/project.json`
  - `package-lock.json`
  - the regenerated workflows

**Interfaces:**

- Produces:
  - the package `groovebox-core` at `packages/groovebox-core`, with the starter crate
    `crates/groovebox-core`
  - the app `groovebox` at `apps/groovebox`, with `crossOriginIsolation: true`, depending on
    `"groovebox-core": "0.0.0"`

- [ ] **Step 1: Create both projects without the interactive location prompt**

  Write a script in the scratchpad that calls `runCreateProject` from `@jakubmazanec/carson`,
  shaped like the smoke test's call:

  - template `projects/rust`, name `groovebox-core`, path `<repo>/packages/groovebox-core`
  - template `projects/app`, name `groovebox`, path `<repo>/apps/groovebox`

  Run it with `npx tsx <script>`.

- [ ] **Step 2: Set the options and the licence**

  - In `apps/groovebox/.carson/project.json`, add `"crossOriginIsolation": true`.
  - In `apps/groovebox/package.json`, set `"license": "GPL-3.0-or-later"` and
    `"dependencies": {"groovebox-core": "0.0.0", ...}`.

- [ ] **Step 3: Regenerate and install**

  Run `npx carson update workspace`, then `npm install`.

  Expected:

  - `.github/workflows/check-pull-request.yaml` contains
    `npm run toolchain --workspace=packages/groovebox-core`.
  - `apps/groovebox/vite.config.ts` contains `require-corp`.
  - `apps/groovebox/tsconfig.json` has no reference to `groovebox-core`.

- [ ] **Step 4: Verify**

  Run: `npx turbo run test typecheck --no-daemon --filter=groovebox-core --filter=groovebox`

  Expected: PASS. The starter crate's test runs; the app has no tests yet.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/groovebox-core apps/groovebox package-lock.json .github
  git commit -m "Create the groovebox core package and app"
  ```

---

### Task 9: The core crate, its fingerprint and its queues

**Files:**

- Modify: `packages/groovebox-core/crates/groovebox-core/Cargo.toml`: depend on `libm`; add
  `[features] loom = ["dep:loom"]` with `loom` optional.
- Modify: `packages/groovebox-core/Cargo.toml`: `[profile.release]` gets `panic = "abort"`. The
  WASM and bare-metal builds are release builds.
- Replace: `packages/groovebox-core/crates/groovebox-core/src/lib.rs`
- Create: `fingerprint.rs`, `queue.rs` and `ring.rs` in the same `src/`

**Interfaces:**

- **`lib.rs`:**
  - `#![no_std]`, `#![deny(unsafe_code)]`
  - `#[cfg(any(test, feature = "loom"))] extern crate std;`
- **`fingerprint.rs`:** `pub struct Fingerprint(u64)` with:
  - `pub const fn new() -> Self`
  - `pub fn bytes(&mut self, bytes: &[u8])`
  - `pub fn f32(&mut self, value: f32)`: the bits, little-endian
  - `pub fn value(&self) -> u64`
- **`queue.rs`** (`#[allow(unsafe_code)]`): `pub struct Queue<T: Copy, const N: usize>`, a lock-free
  single-producer single-consumer ring.
  - `N` is a power of two, checked at compile time. Indices are `u32`, with wrapping arithmetic and
    Acquire/Release `AtomicU32`.
  - `pub const fn new() -> Self` (not `const` under `loom`)
  - `pub unsafe fn producer(&self) -> Producer<'_, T, N>` and
    `pub unsafe fn consumer(&self) -> Consumer<'_, T, N>`. The caller promises at most one of each
    at a time.
  - `Producer::push(&mut self, item: T) -> Result<(), T>`
  - `Consumer::pop(&mut self) -> Option<T>` and `Consumer::peek(&self) -> Option<T>`
  - Under the `loom` feature, the atomics and the cell come from `loom` through a small private
    shim. Only `queue::model` tests build then, and `device` is compiled out (Task 12).
- **`ring.rs`:** `pub struct Ring<T: Copy, const N: usize>`, a safe single-thread ring with:
  - `pub const fn new()`
  - `push(&mut self, T) -> Result<(), T>`
  - `pop(&mut self) -> Option<T>`
  - `peek(&self) -> Option<T>`

- [ ] **Step 1: Write the failing tests**

```rust
// fingerprint.rs
#[test]
fn fnv1a_vectors() {
    let hash = |text: &str| { let mut f = Fingerprint::new(); f.bytes(text.as_bytes()); f.value() };
    assert_eq!(hash(""), 0xcbf2_9ce4_8422_2325);
    assert_eq!(hash("a"), 0xaf63_dc4c_8601_ec8c);
    assert_eq!(hash("foobar"), 0x8594_4171_f739_67e8);
}

// queue.rs
#[test]
fn fifo_until_full() { /* N = 4: four pushes Ok, fifth Err(item), pops return 1, 2, 3, 4, then None */ }
#[test]
fn wraps_around() { /* N = 4: 10_000 rounds of push 3, pop 3, values in order */ }
#[test]
fn peek_does_not_consume() { /* peek == Some(1) twice, then pop == Some(1) */ }
#[test]
fn two_threads_keep_order() { /* N = 64, producer thread pushes 0..200_000 (retry on Err), consumer pops all in order */ }

#[cfg(feature = "loom")]
mod model {
    #[test]
    fn one_producer_one_consumer() { /* loom::model: N = 2, producer pushes 1, 2, 3 (retrying), consumer pops until it has 3 values; they are [1, 2, 3] */ }
}

// ring.rs
#[test]
fn ring_fifo_until_full_and_after() { /* N = 2: push 1, 2 Ok, 3 Err(3); pop 1; push 3 Ok; pops 2, 3 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib` in `packages/groovebox-core`.

  Expected: FAIL to compile. The modules do not exist.

- [ ] **Step 3: Implement the three modules and the new `lib.rs`**

  Delete the starter `add`.

- [ ] **Step 4: Run them to verify they pass**

  - Run: `cargo test -p groovebox-core --lib`. Expected: PASS.
  - Run: `cargo test -p groovebox-core --features loom --release --lib queue::model`. Expected:
    PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox core's fingerprint and queues"`

---

### Task 10: The audio part and the test tone

**Files:**

- Create, in `packages/groovebox-core/crates/groovebox-core/src/`:
  - `input.rs`
  - `message.rs`
  - `audio.rs`
  - `tone.rs`: throwaway, replaced by plan 2's voices

**Interfaces:**

- Consumes: `Queue`, `Producer` and `Consumer` (Task 9).
- **`input.rs`:**
  - `pub const PADS: u8 = 12;`
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub enum Input { PadHit { pad: u8, velocity: u8 }, PadRelease { pad: u8 } }`
  - `pub struct Stamped { pub sample: u64, pub input: Input }`, same derives
- **`message.rs`:**
  - `pub struct Message { pub number: u32, pub at: u64, pub kind: MessageKind }`
  - `pub enum MessageKind { ToneOn { pad: u8, velocity: u8 }, ToneOff }`
  - `pub enum Report { Applied { number: u32, sample: u64 } }`
  - `pub const MESSAGE_QUEUE: usize = 256; pub const REPORT_QUEUE: usize = 256;`
  - Every type has the same derives as `Input`.
- **`audio.rs`:**
  - `pub const SAMPLE_RATE: u32 = 48_000; pub const CHUNK: usize = 32; pub const MAX_BATCH: usize = 128;`
  - `pub struct Audio` with:
    - `pub const fn new() -> Self`
    - `pub fn position(&self) -> u64`
    - `pub fn render(&mut self, left: &mut [f32], right: &mut [f32], messages: &mut Consumer<'_, Message, MESSAGE_QUEUE>, reports: &mut Producer<'_, Report, REPORT_QUEUE>)`
  - The rule: at each chunk start `c`, pop every head message with `at <= c`, apply it and push
    `Report::Applied { number, sample: c }`. A full report queue drops the report; the audio part
    never waits. `render` panics when the lengths differ or are not a multiple of `CHUNK`.
- **`tone.rs`:** one sine voice.
  - Frequency `261.6256 × libm::exp2f(pad / 12)`.
  - Peak `0.25 × velocity / 127`.
  - Phase in cycles, kept in [0, 1); the sample is `gain × libm::sinf(TAU × phase)`.
  - Gain moves linearly to its target over exactly 32 samples from the chunk where a message
    applies.
  - `ToneOn` while sounding switches the frequency at once and ramps to the new peak.
  - `ToneOff` ramps to 0. After that the tone is idle: it outputs exactly 0.0 and its phase resets
    to 0.
  - Left equals right.

- [ ] **Step 1: Write the failing tests** (in `audio.rs`)

```rust
#[test]
fn silence_without_messages() { /* render 128: every sample is exactly 0.0, position == 128 */ }
#[test]
fn message_applies_at_the_first_chunk_boundary_at_or_after_its_sample() {
    // ToneOn { pad: 0, velocity: 127 } numbered 0 at 40; render 128
    // report == Applied { number: 0, sample: 64 }; samples 0..64 == 0.0; some sample in 64..128 != 0.0
}
#[test]
fn late_message_applies_at_the_next_chunk() { /* render 128, then push at = 10, render 128: Applied sample == 128 */ }
#[test]
fn tone_off_is_silent_one_chunk_after() { /* ToneOn at 0, ToneOff at 256: samples from 288 on == 0.0 */ }
#[test]
fn output_is_finite_and_within_the_peak() { /* 1 s with ToneOn pad 11 velocity 127: every sample finite and |x| <= 0.25 */ }
#[test]
fn batch_size_does_not_change_the_output() { /* same messages; 2 × 128 vs 8 × 32: identical f32 bits */ }
#[test]
#[should_panic]
fn render_refuses_a_batch_that_is_not_a_multiple_of_the_chunk() { /* render 100 */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib audio`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the four modules**

- [ ] **Step 4: Run them to verify they pass**

  Same command. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox audio part with a test tone"`

---

### Task 11: The frame buffer, the drawing interface and the palette

**Files:**

- Create: `packages/groovebox-core/crates/groovebox-core/src/screen.rs` and `palette.rs`

**Interfaces:**

- **`screen.rs`:**
  - `pub const WIDTH: usize = 480; pub const HEIGHT: usize = 272;`
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub struct Color(pub u8);`
  - `pub struct Rect { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }`
  - `pub trait Canvas`:
    - `fn fill_rect(&mut self, rect: Rect, color: Color);`
    - Default methods: `hline(&mut self, x: i32, y: i32, width: u32, color: Color)`,
      `vline(&mut self, x: i32, y: i32, height: u32, color: Color)` and
      `outline_rect(&mut self, rect: Rect, color: Color)`, all built on `fill_rect`.
  - `pub struct FrameBuffer<const W: usize, const H: usize> { rows: [[u8; W]; H] }`:
    - `pub const fn new() -> Self` (all 0)
    - `pub fn pixels(&self) -> &[u8]` (row order, via `as_flattened`)
    - `pub fn pixel(&self, x: usize, y: usize) -> Color`
    - `impl Canvas`, clipping to the buffer
  - `pub type Screen = FrameBuffer<WIDTH, HEIGHT>;`
- **`palette.rs`:**
  - The colours: `BACKGROUND = Color(0)` `#000000`, `TEXT = Color(1)` `#e8e8e8`,
    `DIM = Color(2)` `#6e6e6e`, `FAINT = Color(3)` `#1e1e1e`, `LINE = Color(4)` `#3c3c3c`,
    `SHOWN_BAR = Color(5)` `#0e0e0e`, `ACCENT = Color(6)` `#ff7a2f`, `RECORD = Color(7)` `#ff4a4a`,
    `NOTE_SOFT = Color(8)` `#5c5c5c`, `NOTE_MID = Color(9)` `#a0a0a0` and
    `NOTE_LOUD = Color(10)` `#f2f2f2`.
  - `pub const PALETTE: [[u8; 3]; 256]`: those entries, every other entry black. The sound colours
    come with ROLL.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn fill_rect_clips_to_the_buffer() { /* Rect { x: -5, y: -5, width: 10, height: 10 } on FrameBuffer<8, 8>: pixels (0..5, 0..5) set, (5, 5) not; no panic */ }
#[test]
fn outline_rect_draws_a_one_pixel_border() { /* 4 × 3 rect at 1, 1: border pixels set, (2, 2) untouched */ }
#[test]
fn empty_rect_draws_nothing() { /* width 0 or height 0 */ }
#[test]
fn palette_entries() { /* PALETTE[6] == [0xff, 0x7a, 0x2f]; PALETTE[4] == [0x3c, 0x3c, 0x3c]; PALETTE[11..] all [0, 0, 0] */ }
#[test]
fn screen_is_130_560_bytes() { assert_eq!(core::mem::size_of::<Screen>(), 130_560); }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib screen palette`. Expected: FAIL to compile.

- [ ] **Step 3: Implement both modules**

- [ ] **Step 4: Run them to verify they pass**

  Same command. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox frame buffer and palette"`

---

### Task 12: The control part, the device and the budget profile

**Files:**

- Create:
  - `packages/groovebox-core/budget.toml`
  - `packages/groovebox-core/crates/groovebox-core/build.rs`
  - `src/control.rs` and `src/device.rs`, in `crates/groovebox-core/`
- Modify: `src/lib.rs`. Add the modules, `pub mod budget { include!(concat!(env!("OUT_DIR"), "/budget.rs")); }`
  and `#[cfg(not(feature = "loom"))]` on `device`.

**Interfaces:**

- Consumes: Tasks 9 to 11.
- **`budget.toml`:** a comment saying the numbers are provisional until part 3 picks hardware, then
  `working_memory = 1_048_576`.
- **`build.rs`:**
  - Reads `../../budget.toml`: flat `name = integer` lines, `_` separators, `#` comments.
  - Writes one `pub const <NAME>: usize` per line into `$OUT_DIR/budget.rs`.
  - Fails the build on any other line.
  - Prints `cargo:rerun-if-changed`.
- **`control.rs`:**
  - `pub const INPUT_QUEUE: usize = 64; pub const REPLAY_QUEUE: usize = 64;`
  - `pub struct Control` with:
    - `pub const fn new() -> Self`
    - `pub fn queue_input(&mut self, input: Stamped) -> Result<(), Stamped>`
    - `pub fn replay_applied(&mut self, number: u32, sample: u64) -> Result<(), (u32, u64)>`
    - `pub fn step(&mut self, until: u64, messages: &mut Producer<'_, Message, MESSAGE_QUEUE>) -> bool`:
      handles queued inputs with `sample < until`, in order; returns whether the screen must be
      redrawn. It is true on the first step and whenever the held pads change.
    - `pub fn draw(&self, canvas: &mut impl Canvas)`
  - The input queue and the replay queue are both a `Ring`.
  - Message numbers start at 0 and count up by one.
  - `at`: the input's sample. When the replay ring's head has this message's number, `at` is the
    record's sample instead. A head record with a lower number is dropped.
  - When the message queue is full, the step stops and leaves the rest of its inputs queued.
  - Last-hit priority:
    - A hit sends `ToneOn` for its pad.
    - Releasing the sounding pad sends `ToneOn` for the most recently hit pad still held, with that
      hit's velocity, or `ToneOff` when none is held.
    - Releasing another pad sends nothing.
  - The test picture:
    - a `LINE` outline at `Rect { x: 0, y: 0, width: 480, height: 272 }`
    - for each held pad `p`, an `ACCENT` fill at `x = 20 + 37p, y = 116`, 32 × 40
- **`device.rs`** (`#[allow(unsafe_code)]`):
  - `pub struct Device`: the control part, the audio part, `messages: Queue<Message, MESSAGE_QUEUE>`,
    `reports: Queue<Report, REPORT_QUEUE>`, two `Screen`s and `front: AtomicU32`.
    - `unsafe impl Sync`
    - `pub const fn new() -> Self`
    - `pub unsafe fn control_side(&self) -> ControlSide<'_>` and
      `pub unsafe fn audio_side(&self) -> AudioSide<'_>`; the caller promises at most one of each
      at a time.
    - `pub fn screen_pointer(&self, index: usize) -> *const u8` and
      `pub fn front_pointer(&self) -> *const AtomicU32`
    - `const _: () = assert!(core::mem::size_of::<Device>() <= budget::WORKING_MEMORY);`
  - `ControlSide`:
    - `queue_input`, `replay_applied` and `step(until: u64)`. When `Control::step` returns true,
      `step` draws into the back screen (`1 − front`), then stores `front` with Release.
    - `take_report(&mut self) -> Option<Report>`
    - `front_screen(&self) -> &Screen`
  - `AudioSide`: `render(left, right)` and `position() -> u64`.

- [ ] **Step 1: Write the failing tests**

```rust
// control.rs
#[test]
fn pad_hit_sends_tone_on_at_the_hit() { /* hit pad 0 velocity 127 at 100; step(128) → Message { number: 0, at: 100, kind: ToneOn { pad: 0, velocity: 127 } } */ }
#[test]
fn step_handles_only_inputs_stamped_before_until() { /* hit at 200: step(128) sends nothing; step(256) sends it */ }
#[test]
fn release_of_an_earlier_pad_keeps_the_later_tone() {
    // hit 0 (velocity 100), hit 7 (velocity 60), release 0 → only ToneOn 0 and ToneOn 7 were sent
    // then release 7 → ToneOff
    // and: hit 0 (100), hit 7 (60), release 7 → ToneOn { pad: 0, velocity: 100 }
}
#[test]
fn replay_record_sets_the_message_sample() { /* replay_applied(0, 512); hit at 100; step(128) → at == 512 */ }
#[test]
fn input_queue_refuses_when_full_and_accepts_after_a_step() { /* 64 queued, 65th Err; step(u64::MAX) sends 64 in order; then queue_input Ok */ }
#[test]
fn stops_taking_inputs_while_the_message_queue_is_full() { /* no consumer; 4 × (queue 64 hits, step): 256 messages; queue 64 more, step: nothing sent, the 64 stay queued; pop all messages, step: the 64 follow, numbered 256..320 */ }
#[test]
fn test_picture() { /* Screen after draw with pad 0 held: pixel(0, 0) == LINE, (479, 271) == LINE, (1, 1) == BACKGROUND, (36, 136) == ACCENT, (36 + 37, 136) == BACKGROUND */ }
#[test]
fn redraw_only_when_held_pads_change() { /* first step true; step without inputs false; hit true */ }

// device.rs
#[test]
fn step_draws_into_the_back_screen_and_flips() { /* front starts 0; first step → front == 1 and the front screen shows the outline */ }
#[test]
fn messages_reach_the_audio_part_and_reports_come_back() { /* hit at 0; step(128); audio render 128 → take_report == Applied { number: 0, sample: 0 } */ }
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-core --lib control device`. Expected: FAIL to compile.

- [ ] **Step 3: Implement `budget.toml`, `build.rs`, `control.rs` and `device.rs`**

- [ ] **Step 4: Run them to verify they pass**

  - Run: `cargo test -p groovebox-core --lib`. Expected: PASS.
  - Then set `working_memory = 1_000` and run `cargo build -p groovebox-core`. Expected: FAIL on the
    budget assert. Restore the value.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox control part and the budget profile"`

---

### Task 13: The browser crate and the two build routes

**Files:**

- Create:
  - `packages/groovebox-core/crates/groovebox-browser/Cargo.toml`
  - `packages/groovebox-core/crates/groovebox-browser/build.rs`
  - `packages/groovebox-core/crates/groovebox-browser/src/lib.rs`
  - `packages/groovebox-core/.cargo/config.toml`
  - `packages/groovebox-core/build.js`
- Modify:
  - `packages/groovebox-core/package.json`: the project-owned `build` and `test` scripts
  - `packages/groovebox-core/.carson/project.json`: `overrides.packageJson.scripts.toolchain`
  - `packages/groovebox-core/rust-toolchain.toml`: add
    `targets = ["wasm32-wasip1-threads", "thumbv7em-none-eabihf"]`

**Interfaces:**

- Consumes: `Device` and the sides (Task 12); the spike's **Build settings** (Task 1).
- **`Cargo.toml`:**
  - `[lib] crate-type = ["cdylib"]`, `test = false`, `doctest = false`
  - depends on `groovebox-core`; `[build-dependencies] groovebox-core` for the budget
- **`build.rs`:**
  - Emits `cargo:rustc-link-arg-cdylib=--initial-memory=<X>` and `--max-memory=<X>`.
  - `X = budget::WORKING_MEMORY + 524_288`, rounded up to 65,536. The 512 KiB covers the 256 KiB
    worker stack, the 64 KiB audio stack and this crate's own statics.
  - The link fails if they do not fit.
- **`.cargo/config.toml`:** the spike's rustflags for `[target.wasm32-wasip1-threads]` and
  `[target.wasm32-unknown-unknown]`, without the memory sizes, which come from `build.rs`.
- **`src/lib.rs`:**
  - `#![no_std]`, with a `#[panic_handler]` that traps with `core::arch::wasm32::unreachable()` on
    `wasm32` and loops elsewhere. The browser crate may use target conditions; the loop only keeps
    host `clippy` compiling.
  - Statics:
    - `DEVICE: Device`
    - `POSITION: AtomicU64`
    - `WAKE: AtomicU32`
    - `FINGERPRINT: AtomicU64`, starting at the FNV offset
    - the output, two `[f32; MAX_BATCH]` channels
    - the applied stash, `[(u32, u64); REPORT_QUEUE]`
    - `AUDIO_STACK`, 65,536 bytes, aligned 16
    - `PALETTE`
  - Exports, all `#[unsafe(no_mangle)] pub extern "C"`:

| Export                                                                      | Side   | Does                                                                         |
| --------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `control_queue_input(sample: u64, kind: u32, pad: u32, velocity: u32) -> u32` | worker | `kind` 0 hit, 1 release; returns 1 queued, 0 full                            |
| `control_replay_applied(number: u32, sample: u64) -> u32`                   | worker | returns 1 queued, 0 full                                                     |
| `control_step(until: u64) -> u32`                                           | worker | steps, then moves every report into the stash; returns their count          |
| `control_applied_number(index: u32) -> u32`, `control_applied_sample(index: u32) -> u64` | worker | reads the stash                                                              |
| `screen_pointer(index: u32) -> u32`, `front_pointer() -> u32`, `palette_pointer() -> u32`, `position_pointer() -> u32`, `wake_pointer() -> u32`, `audio_stack_top() -> u32` | worker | addresses for the shell                                                      |
| `audio_position() -> u64`, `audio_fingerprint() -> u64`                     | worker | read `POSITION` and `FINGERPRINT`                                            |
| `audio_render(frames: u32) -> u32`                                          | audio  | renders into the output; adds it to `FINGERPRINT`; stores `POSITION`; returns the left channel's address, with the right at `+ MAX_BATCH × 4` |

- **`build.js`** (ESM, `node:` modules only):
  - `node build.js` runs
    `cargo build --release --target wasm32-wasip1-threads -p groovebox-browser`, then copies
    `target/wasm32-wasip1-threads/release/groovebox_browser.wasm` to `build/groovebox-core.wasm`.
  - `node build.js --fallback` runs the nightly route with `FALLBACK_TOOLCHAIN`, the spike's date,
    into `build/fallback/groovebox-core.wasm`.
  - `node build.js --toolchains` runs `rustup toolchain install`, then installs
    `FALLBACK_TOOLCHAIN` with `--profile minimal --component rust-src`.
- **Scripts:**
  - `"build": "node build.js"`
  - `"test": "node build.js && node build.js --fallback && node check-imports.mjs && cargo test --workspace --exclude groovebox-browser && cargo test -p groovebox-core --features loom --release --lib queue::model && cargo build -p groovebox-core --release --target thumbv7em-none-eabihf"`
  - override `"toolchain": "node build.js --toolchains"`

- [ ] **Step 1: Write the failing check**

  Copy the spike's `check-imports.mjs` to `packages/groovebox-core/check-imports.mjs`. It now
  asserts:

  - the single import `env.memory`
  - the export list of this task's table plus `__stack_pointer`
  - identical names and kinds in both `.wasm` files

  It exits 1 otherwise. The `test` script below runs it after the two builds.

- [ ] **Step 2: Run it to verify it fails**

  Run: `npm test --workspace packages/groovebox-core`. Expected: FAIL. `build.js` does not exist.

- [ ] **Step 3: Implement the crate, `build.rs`, `.cargo/config.toml`, `build.js` and the scripts**

  Then run `npx carson update workspace` to apply the toolchain override.

- [ ] **Step 4: Run it to verify it passes**

  Same command. Expected: PASS: both routes, the import check, all core tests, the loom model and
  the bare-metal build.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox browser crate and both build routes"`

---

### Task 14: The drift harness

**Files:**

- Create:
  - `packages/groovebox-core/crates/groovebox-drift/Cargo.toml`: depends on `groovebox-core`,
    `wasmtime` and `png`
  - `src/{lib,scene,runner,native,wasm,play,image}.rs` and `tests/drift.rs`, in that crate
  - `packages/groovebox-core/scenes/silence.scene`, `tone.scene` and `late.scene`, with their
    blessed fingerprints and PNGs

**Interfaces:**

- Consumes: `Device` (Task 12); the browser exports (Task 13); the scene format ("Shared formats").
- **`scene.rs`:**
  - `pub enum SceneLine { Input(Stamped), Step(u64), Applied { number: u32, sample: u64 }, Frame(u64), ExpectAudio { sample: u64, fingerprint: u64 }, End(u64) }`
  - `pub fn parse(text: &str) -> Result<Vec<SceneLine>, String>`: errors name the line number. It
    checks pads 0 to 11, velocity 1 to 127, the header, one final `end` and implicit frame samples.
- **`runner.rs`:** `pub trait Runner` with:
  - `fn queue_input(&mut self, input: Stamped) -> bool`
  - `fn replay_applied(&mut self, number: u32, sample: u64) -> bool`
  - `fn step(&mut self, until: u64)`
  - `fn render(&mut self, left: &mut [f32], right: &mut [f32])`
  - `fn front_screen(&mut self) -> Vec<u8>`
- **The runners:**
  - `native.rs`: `pub struct NativeRunner` on a `Box<Device>`.
  - `wasm.rs`: `pub struct WasmRunner::new(path: &Path) -> Self`.
    - Uses wasmtime with threads on and one `SharedMemory`, sized from the module's memory import.
    - Two instances: the control instance first, then the audio instance, whose `__stack_pointer`
      is set to `audio_stack_top()` before any call.
    - `pub fn audio_fingerprint(&mut self) -> u64` reads the export.
- **`play.rs`:**
  - `pub struct Outcome { pub audio: u64, pub frames: Vec<(u64, u64, Vec<u8>)>, pub finite: bool }`,
    where each frame is (sample, fingerprint, pixels).
  - `pub fn play(scene: &[SceneLine], runner: &mut dyn Runner) -> Outcome`:
    - implicit and explicit modes per "Shared formats"
    - before each step, it tops up `replay_applied` with the next `applied` records in number order
      until refused
    - it renders in batches of at most 128
    - `finite` is false if any sample is NaN or infinite
- **`image.rs`:** `pub fn write_png(path: &Path, pixels: &[u8], palette: &[[u8; 3]; 256])`, an
  indexed PNG.
- **`tests/drift.rs`:** for each `scenes/*.scene`:
  1. Play it on `NativeRunner`, `WasmRunner` with `build/groovebox-core.wasm` and `WasmRunner`
     with `build/fallback/groovebox-core.wasm`. All three `Outcome`s are equal. The stable wasm's
     `audio_fingerprint()` equals `Outcome.audio`.
  2. `finite` holds.
  3. An `expect-audio` line must match.
  4. Comparing with `<name>.fingerprints`:
     - Missing, or with `GROOVEBOX_BLESS=1`: write the fingerprints file and
       `scenes/<name>/frame-<sample>.png`.
     - On a mismatch: write the actual PNGs to `target/drift/<name>/` and fail, naming them.

- [ ] **Step 1: Write the failing tests**

```rust
// scene.rs
#[test]
fn parses_every_line_kind() { /* one of each line kind → the matching SceneLine values */ }
#[test]
fn rejects_unknown_lines_with_their_number() { /* "groovebox-scene 1\nbogus\nend 128" → Err containing "line 2" */ }
#[test]
fn rejects_an_implicit_frame_off_the_batch_grid() { /* "frame 100" without step lines → Err */ }

// play.rs (on NativeRunner)
#[test]
fn applied_records_steer_late_messages() {
    // same hit at 100 with explicit steps; scene A with no applied line, scene B with "applied 0 1024"
    // A's audio != B's audio; B's audio == C's, where C is A plus the hit's input moved so it is processed at step 1024
}
#[test]
fn an_input_logged_after_a_step_waits_for_the_next() {
    // "step 128", "frame 128", then "input 100 pad-hit 0 127", "step 640", "frame 640", "end 1024"
    // frame 128: pixel (36, 136) == BACKGROUND; frame 640: pixel (36, 136) == ACCENT
}
```

  Scenes, in `scenes/`:

  - `silence.scene`: `end 48000`, `frame 24064`.
  - `tone.scene`:
    - hit pad 0 velocity 127 at 4800
    - `frame 9600`
    - hit pad 7 velocity 64 at 12000
    - release pad 0 at 14400
    - `frame 19200`
    - release pad 7 at 24000
    - `end 48000`
  - `late.scene` (Review Focus 2): explicit steps with gaps, late `applied` records and a release
    that hands the tone back:

    ```
    groovebox-scene 1
    input 100 pad-hit 0 127
    step 128
    applied 0 1024
    input 700 pad-hit 7 64
    step 1024
    applied 1 1536
    step 1536
    frame 1536
    input 2000 pad-release 7
    step 4096
    frame 4096
    input 4200 pad-release 0
    step 8192
    end 9600
    ```

- [ ] **Step 2: Run them to verify they fail**

  Run: `cargo test -p groovebox-drift`. Expected: FAIL to compile.

- [ ] **Step 3: Implement the crate**

- [ ] **Step 4: Run them to verify they pass**

  - Run: `npm test --workspace packages/groovebox-core`. Expected: PASS. The first run blesses the
    three scenes.
  - Open `scenes/tone/frame-9600.png`. Expected: the outline and pad 0's orange block.
  - Run again. Expected: PASS without writing.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox drift harness and first scenes"`

---

### Task 15: The shell's pure parts

**Files:**

- Create, in `apps/groovebox/source/shell/`:
  - `memoryLimits.ts`, `present.ts`, `keyboard.ts`, `session.ts`, `pending.ts` and `protocol.ts`
- Create: `apps/groovebox/tests/memoryLimits.test.ts`, `present.test.ts`, `keyboard.test.ts`,
  `session.test.ts` and `pending.test.ts`

**Interfaces:**

- Consumes: the scene format ("Shared formats"); `build/groovebox-core.wasm` (Task 13).
- **`protocol.ts`:**
  - `type ShellInput = {kind: 'pad-hit'; pad: number; velocity: number} | {kind: 'pad-release'; pad: number}`
  - `type StampedInput = {sample: bigint; input: ShellInput}`
  - `type CoreAddresses = {stackTop: number; position: number; wake: number; front: number; screens: [number, number]; palette: number}`
  - `type WorkerRequest = {type: 'start'; module: WebAssembly.Module; memory: WebAssembly.Memory} | {type: 'input'; stamped: StampedInput} | {type: 'save'}`
  - `type WorkerReply = {type: 'ready'; addresses: CoreAddresses} | {type: 'session'; text: string}`
- **`memoryLimits.ts`:** `readMemoryLimits(bytes: Uint8Array): {initial: number; maximum: number}`.
  It parses the import section and returns the `env.memory` limits in pages. It throws unless the
  memory is shared with a maximum.
- **`present.ts`:**
  - `expandFrame(pixels: Uint8Array, palette: Uint8Array, rgba: Uint8ClampedArray): void`: alpha
    255.
  - `fitScreen(viewport: {width: number; height: number}, devicePixelRatio: number): {scale: number; cssWidth: number; cssHeight: number; exact: boolean}`:
    - `scale` is the largest whole number with `480 × scale ≤ width × dpr` and
      `272 × scale ≤ height × dpr`, at least 1.
    - `cssWidth = 480 × scale / dpr`.
    - `exact = Number.isInteger(dpr)`.
- **`keyboard.ts`:**
  `keyToInput(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'type'>): ShellInput | null`.
  `KeyZ` down hits pad 0 at velocity 127; up releases it; a repeat is null; any other key is null.
- **`session.ts`:** `class SessionLog` with `input(stamped)`, `step(sample: bigint)`,
  `applied(number: number, sample: bigint)` and `finish(position: bigint, fingerprint: bigint): string`.
  `finish` writes the header, every line in order, `expect-audio` and `end`.
- **`pending.ts`:**
  `drainPending(pending: StampedInput[], queue: (stamped: StampedInput) => boolean): StampedInput[]`.
  It removes and returns inputs from the front until `queue` refuses one; the refused input and
  those after it stay in `pending`.

- [ ] **Step 1: Write the failing tests**

```ts
test('readMemoryLimits reads a shared memory import', () => {
  let bytes = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version
    0x02, 0x10, 0x01, // import section, size 16, 1 import
    0x03, 0x65, 0x6e, 0x76, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, // "env", "memory"
    0x02, 0x03, 0x11, 0x11, // memory, shared with max, 17, 17
  ]);
  expect(readMemoryLimits(bytes)).toEqual({initial: 17, maximum: 17});
});
test('readMemoryLimits refuses an unshared memory', () => { /* same bytes with flags 0x01 → throws */ });
test('readMemoryLimits reads the built core', () => { /* fs.readFile('../../packages/groovebox-core/build/groovebox-core.wasm'): initial === maximum, both > 0 */ });

test.each([
  [{width: 1920, height: 1080}, 1, {scale: 3, cssWidth: 1440, cssHeight: 816, exact: true}],
  [{width: 1920, height: 1080}, 2, {scale: 7, cssWidth: 1680, cssHeight: 952, exact: true}],
  [{width: 1536, height: 864}, 1.25, {scale: 3, cssWidth: 1152, cssHeight: 652.8, exact: false}],
  [{width: 1280, height: 720}, 1.5, {scale: 3, cssWidth: 960, cssHeight: 544, exact: false}],
  [{width: 300, height: 200}, 1, {scale: 1, cssWidth: 480, cssHeight: 272, exact: true}],
])('fitScreen %o at %d', (viewport, dpr, expected) => {
  expect(fitScreen(viewport, dpr)).toEqual(expected);
});
test('expandFrame looks colours up in the palette', () => { /* pixels [0, 6]; palette with entry 6 = ff 7a 2f → rgba [0, 0, 0, 255, 255, 122, 47, 255] */ });

test('keyToInput', () => { /* KeyZ keydown → pad-hit 0 127; KeyZ keyup → pad-release 0; repeat → null; KeyX → null */ });

test('SessionLog writes the scene format', () => {
  let log = new SessionLog();
  log.input({sample: 100n, input: {kind: 'pad-hit', pad: 0, velocity: 127}});
  log.step(128n);
  log.applied(0, 128n);
  log.input({sample: 300n, input: {kind: 'pad-release', pad: 0}});
  log.step(384n);
  expect(log.finish(512n, 0xabcn)).toBe(
    'groovebox-scene 1\ninput 100 pad-hit 0 127\nstep 128\napplied 0 128\ninput 300 pad-release 0\nstep 384\nexpect-audio 512 0000000000000abc\nend 512\n',
  );
});

test('drainPending keeps refused inputs in order', () => { /* 5 pending, queue accepts 3 → returns first 3; pending holds 4th and 5th */ });
```

- [ ] **Step 2: Run them to verify they fail**

  Run: `npx vitest run --project unit` in `apps/groovebox`. Expected: FAIL. The modules do not
  exist.

- [ ] **Step 3: Implement the six modules**

- [ ] **Step 4: Run them to verify they pass**

  Same command. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "Add the groovebox shell's pure parts"`

---

### Task 16: Boot the core in the browser

**Files:**

- Create, in `apps/groovebox/source/shell/`:
  - `boot.ts`, `startAudio.ts` and `shell.ts`
  - `control.worker.ts` and `audio.worklet.ts`
- Modify: `apps/groovebox/source/routes/_index.tsx`
- Create: `apps/groovebox/tests/shell.browser.test.ts`

**Interfaces:**

- Consumes: Task 13's exports; Task 15's modules.
- **`boot.ts`:**
  - `bootCore(wasmUrl: string): Promise<Core>`, where
    `type Core = {module: WebAssembly.Module; memory: WebAssembly.Memory; worker: Worker; addresses: CoreAddresses}`.
  - It fetches the bytes, then `readMemoryLimits`, then `WebAssembly.compile`, then a shared
    `WebAssembly.Memory`.
  - It starts the worker (`import ControlWorker from './control.worker.ts?worker'`), sends `start`
    and resolves on `ready`.
  - `wasmUrl` comes from `import wasmUrl from 'groovebox-core/build/groovebox-core.wasm?url'`.
- **`control.worker.ts`:**
  - On `start`: instantiate, reply `ready` with the addresses, then loop:
    1. `Atomics.waitAsync` on `wake`.
    2. Read `position`. If it moved: `drainPending` (log each accepted input), `log.step`,
       `control_step`, then `log.applied` for each stashed record.
  - On `input`: push it to pending and drain at once.
  - On `save`: reply `session` with `log.finish(audio_position(), audio_fingerprint())`.
- **`audio.worklet.ts`:**
  - `registerProcessor('groovebox', ...)`. The constructor instantiates synchronously from
    `processorOptions.module` and `processorOptions.memory`, then sets `__stack_pointer` to
    `processorOptions.stackTop` before any call.
  - `process()` runs `audio_render(128)`, copies both channels to the output, then
    `Atomics.add(wake, 0, 1)` and `Atomics.notify(wake, 0)`. It returns true.
  - Loaded through `import workletUrl from './audio.worklet.ts?worker&url'`.
- **`startAudio.ts`:** `startAudio(core: Core): Promise<AudioContext>` creates
  `new AudioContext({latencyHint: 'interactive', sampleRate: 48000})`, adds the worklet, and
  connects `new AudioWorkletNode(context, 'groovebox', {numberOfInputs: 0, outputChannelCount: [2], processorOptions: {module, memory, stackTop}})`.
- **`shell.ts`:**
  `runShell(elements: {canvas: HTMLCanvasElement; status: HTMLElement; note: HTMLElement; save: HTMLButtonElement}): Promise<{start: () => Promise<AudioContext>; stop: () => void}>`.
  - `start` is memoized: one promise, one audio graph.
  - The first `pointerdown` or `keydown` on the page calls `start` and plays nothing.
  - `status` reads "Click to start" until the context runs, then is empty.
  - After the start, `keyToInput` posts `input` stamped with `Atomics.load` of `position`.
  - Each `requestAnimationFrame` presents the front screen with `expandFrame`.
  - `fitScreen` sizes the canvas on load and resize, with `image-rendering: pixelated`. `note`
    reads "This display scale cannot show the screen pixel-exactly." when not `exact`.
  - "Save session":
    1. suspend the context
    2. ask the worker for `save`
    3. download the text as `session.scene`
    4. resume
  - `stop` tears everything down.
- **`_index.tsx`:** the page holds the canvas (480 × 272), `status`, `note` and a "Save session"
  button. A `useEffect` loads the shell with `import('../shell/shell.js')`, so the server render
  never evaluates it. The effect's cleanup calls `stop`.

- [ ] **Step 1: Write the failing browser test**

```ts
test('the page is cross-origin isolated', () => {
  expect(crossOriginIsolated).toBe(true);
});

test('boots, draws the test picture and plays pad 0', async () => {
  // mount the elements, runShell, await userEvent.click(document.body)
  // wait until Atomics.load(position) > 4800n
  // front screen: pixel (0, 0) === 4 (LINE) and pixel (240, 30) === 0 (BACKGROUND)
  // userEvent.keyboard('{z>}'): within 500 ms pixel (36, 136) === 6 (ACCENT); userEvent.keyboard('{/z}'): back to 0
});

test('two quick clicks start one audio graph', async () => {
  // two userEvent.click calls without awaiting between them: start() returns the same promise both times
});
```

- [ ] **Step 2: Run it to verify it fails**

  Run `npx carson update workspace`, which adds the browser test setup and its devDependencies once
  the file exists. Run `npm install`, which the plan's dependency list covers. Then run
  `npx vitest run --project browser` in `apps/groovebox`.

  Expected: FAIL. `runShell` does not exist.

- [ ] **Step 3: Implement the five modules and the page**

- [ ] **Step 4: Run it to verify it passes**

  Same command. Expected: PASS.

- [ ] **Step 5: Check the dev server headers** (Foundation's spike item on headers)

  1. Run `npm run develop --workspace apps/groovebox` in the background.
  2. Run `curl -sI http://localhost:5000/`. Run curl again on the worker's and the worklet's
     module URLs as the dev page requests them; take them from the page's network list.

  Expected: every response has both isolation headers.

  Stop the server and check that port 5000 no longer listens (`netstat -ano | findstr :5000`).
  Force-kill the `node.exe` if it still does.

- [ ] **Step 6: Commit**

  `git commit -m "Boot the groovebox core in the browser"`

---

### Task 17: A recorded session replays identically

**Files:**

- Create: `packages/groovebox-core/scenes/browser-session.scene` with its blessed fingerprints and
  PNGs

- [ ] **Step 1: Record a session**

  Start the dev server. Open `http://localhost:5000` in Chromium with the Playwright browser tools
  and click. For about 10 seconds:

  - hold Z for a second
  - tap Z eight times quickly
  - hold Z for two seconds

  Click "Save session" and move the download to `scenes/browser-session.scene`. Stop the server as
  in Task 16.

- [ ] **Step 2: Replay it**

  Run: `npm test --workspace packages/groovebox-core`.

  Expected: PASS. The three runners agree, `expect-audio` matches the live fingerprint, and the
  scene is blessed. If `expect-audio` fails, stop. That is a drift between the browser and the
  replay: debug it with superpowers:systematic-debugging, and do not re-record to make it pass.

- [ ] **Step 3: Run the focused gates**

  Run: `npx turbo run test --no-daemon --filter=groovebox-core --filter=groovebox`.

  Expected: PASS.

- [ ] **Step 4: Commit**

  `git commit -m "Replay a recorded browser session in the drift tests"`

  CI runs the full suite on the branch.
