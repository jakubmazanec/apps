# Vitest Browser Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the workspace to Carson templates `9.0.0-unstable.9c3734ab` and convert Somewhere's browser-API-mocking tests to Vitest browser mode (real Pixi.js in headless Chromium), deleting the hand-rolled `pixi.js` / `@pixi/layout` mocks.

**Architecture:** The new template generates a two-project Vitest config (`unit` = node env for pure-logic tests, `browser` = Playwright chromium for DOM/canvas tests). The 25 browser-bound test files get renamed to `*.browser.test.ts` and their pixi mocks deleted; the remaining 51 test files stay untouched in the `unit` project.

**Tech Stack:** Vitest 4, `@vitest/browser-playwright`, `playwright` (chromium), `@vitest/coverage-v8`, Carson templates + Carson CLI (both unstable prereleases).

**Spec:** `docs/superpowers/specs/2026-07-31-vitest-browser-mode-design.md`

## Global Constraints

- Workspace root: `/workspaces/apps` (git repo root). Project: `/workspaces/apps/apps/somewhere`.
- Bump root devDeps to exact prereleases: `@jakubmazanec/carson` → `3.0.6-unstable.9c3734ab`, `@jakubmazanec/carson-templates` → `9.0.0-unstable.9c3734ab`.
- Browser test files are detected by glob at update time: `tests/**/*.browser.test.?(c|m)[jt]s?(x)`. Rename files BEFORE the templates are applied.
- Delete only `vi.mock('pixi.js', ...)` and `vi.mock('@pixi/layout', ...)` / `vi.mock('@pixi/layout/components', ...)` blocks. Source-module mocks (`createBackground`, `Text.js`, `game.js`, `assets.js`, `../source/pixi-tools/*`) stay.
- `vi.resetModules()` is unsupported in browser mode (throws). Use cache-busting query imports instead.
- `node:fs` does not exist in browser mode. Use Vite `?raw` imports for fixture files.
- `carson update workspace` automatically unmerges deleted template deps (`happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`) and deletes `tests/setup.ts` (verified against carson source: `applyTemplateRenders` unmerges snapshots first, and `overwrite`-strategy renders are deleted when gone).
- Keep `.carson/project.json` overrides untouched (`build.target: ES2022`, eslint ignores, tsconfig options).
- Never commit the untracked `*.png`, `.playwright-mcp/`, `coverage/` files in the working tree.
- Run all test commands from `/workspaces/apps/apps/somewhere` unless stated otherwise.

---

### Task 1: Bump root Carson dependencies

**Files:**
- Modify: `/workspaces/apps/package.json` (devDependencies)

**Interfaces:**
- Consumes: nothing
- Produces: root devDeps pinned to the unstable prereleases that the new templates require (templates peer-depends on carson `3.0.6-unstable.9c3734ab`)

- [ ] **Step 1: Edit root package.json**

In `/workspaces/apps/package.json`, change:

```json
"@jakubmazanec/carson": "^3.0.2",
"@jakubmazanec/carson-templates": "^8.1.0",
```

to:

```json
"@jakubmazanec/carson": "3.0.6-unstable.9c3734ab",
"@jakubmazanec/carson-templates": "9.0.0-unstable.9c3734ab",
```

- [ ] **Step 2: Verify the edit**

Run: `node -e "const p=require('/workspaces/apps/package.json'); console.log(p.devDependencies['@jakubmazanec/carson'], p.devDependencies['@jakubmazanec/carson-templates'])"`
Expected: `3.0.6-unstable.9c3734ab 9.0.0-unstable.9c3734ab`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: bump carson and carson-templates to 9.0.0-unstable prereleases"
```

---

### Task 2: Rename 25 test files to `*.browser.test.ts`

**Files:**
- Rename: 25 files under `/workspaces/apps/apps/somewhere/tests/`

**Interfaces:**
- Consumes: nothing (renames are content-preserving)
- Produces: `tests/**/*.browser.test.ts` files that Task 3's `carson update workspace` will detect, generating the two-project vitest config and adding playwright devDeps

- [ ] **Step 1: Rename wave-1 files (17, node-failing)**

```bash
cd /workspaces/apps/apps/somewhere/tests
git mv AudioMixer.test.ts AudioMixer.browser.test.ts
git mv DialogueBox.test.ts DialogueBox.browser.test.ts
git mv Game.test.ts Game.browser.test.ts
git mv GameScreen.test.ts GameScreen.browser.test.ts
git mv Modal.test.ts Modal.browser.test.ts
git mv SliderFillGeometry.test.ts SliderFillGeometry.browser.test.ts
git mv Text.test.ts Text.browser.test.ts
git mv TextInput.test.ts TextInput.browser.test.ts
git mv UiRoot.test.ts UiRoot.browser.test.ts
git mv engine/GameInput.test.ts engine/GameInput.browser.test.ts
git mv game/gameInput.test.ts game/gameInput.browser.test.ts
git mv isTextEntryTarget.test.ts isTextEntryTarget.browser.test.ts
git mv mapSign.test.ts mapSign.browser.test.ts
git mv pauseFlow.test.ts pauseFlow.browser.test.ts
git mv save.test.ts save.browser.test.ts
git mv settings.test.ts settings.browser.test.ts
git mv worldSpawn.test.ts worldSpawn.browser.test.ts
```

- [ ] **Step 2: Rename wave-2 files (8, pixi-mocked but node-passing)**

```bash
cd /workspaces/apps/apps/somewhere/tests
git mv Button.test.ts Button.browser.test.ts
git mv Container.test.ts Container.browser.test.ts
git mv GameAssets.test.ts GameAssets.browser.test.ts
git mv GameScreenState.test.ts GameScreenState.browser.test.ts
git mv Panel.test.ts Panel.browser.test.ts
git mv Slider.test.ts Slider.browser.test.ts
git mv Toggle.test.ts Toggle.browser.test.ts
git mv attachWidgetInteraction.test.ts attachWidgetInteraction.browser.test.ts
```

- [ ] **Step 3: Verify renames**

Run: `git status --short | grep -c "\.browser\.test\.ts"`
Expected: `25` renamed entries. Run `find /workspaces/apps/apps/somewhere/tests -name "*.browser.test.ts" | wc -l` — also `25`. Ensure `createTestTheme.ts` and `GameScreenContents.types.ts` were NOT renamed.

- [ ] **Step 4: Commit**

```bash
git add -A apps/somewhere/tests
git commit -m "test: rename browser-bound tests to *.browser.test.ts"
```

---

### Task 3: Install deps and apply the new templates

**Files:**
- Regenerated by carson: `/workspaces/apps/package-lock.json`, all 5 apps' `vite.config.ts` + `package.json`, `/workspaces/apps/.github/workflows/*.yaml`, `/workspaces/apps/.gitignore`
- Deleted by carson: `/workspaces/apps/apps/somewhere/tests/setup.ts`
- Verify: `/workspaces/apps/apps/somewhere/vite.config.ts`, `/workspaces/apps/apps/somewhere/.carson/project.json`

**Interfaces:**
- Consumes: Task 2's `*.browser.test.ts` files
- Produces: somewhere's `vite.config.ts` with the `unit` + `browser` projects; `package.json` with `@vitest/browser-playwright`, `playwright`, `vitest-browser-react`; CI workflows with `npx playwright install --with-deps chromium`

- [ ] **Step 1: Run npm install**

Run: `npm install` (from `/workspaces/apps`).
Expected: root `package.json`'s `prepare` script runs `patch-package && carson update workspace` automatically, regenerating all templates. The install must succeed.

- [ ] **Step 2: Run carson update explicitly (idempotent, in case prepare skipped it)**

Run: `npx carson update workspace` (from `/workspaces/apps`).
Expected: exits 0. If it fails, it must fail for a reason visible in the output; do not continue past an error.

- [ ] **Step 3: Verify somewhere's vite.config.ts**

Read `/workspaces/apps/apps/somewhere/vite.config.ts`. It must contain:
- `import {playwright} from '@vitest/browser-playwright';`
- `test.projects` with exactly two entries:
  - `name: 'unit'`, `environment: 'node'`, `include: ['tests/**/*.test.?(c|m)[jt]s?(x)']`, `exclude: ['tests/**/*.browser.test.?(c|m)[jt]s?(x)']`
  - `name: 'browser'`, `browser: {enabled: true, headless: true, provider: playwright(), instances: [{browser: 'chromium' as const}]}`, `include: ['tests/**/*.browser.test.?(c|m)[jt]s?(x)']`
- The `_.merge` second argument still has `{"build": {"target": "ES2022"}}` (the project.json override must survive)

- [ ] **Step 4: Verify somewhere's package.json**

Run: `node -e "const p=require('/workspaces/apps/apps/somewhere/package.json'); console.log(Object.keys(p.devDependencies).filter(k=>k.includes('playwright')||k.includes('vitest-browser')||k==='happy-dom'||k.includes('testing-library')).sort())"`
Expected: `['@vitest/browser-playwright', 'playwright', 'vitest-browser-react']` — `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom` must be gone. `@vitest/coverage-v8` stays. `test` script stays `del-cli coverage && vitest run --coverage --passWithNoTests`.

- [ ] **Step 5: Verify cleanup and CI**

- `tests/setup.ts` must not exist: `test ! -f /workspaces/apps/apps/somewhere/tests/setup.ts`
- `/workspaces/apps/.gitignore` contains `.vitest-attachments/` and `.vitest-reports/`
- `/workspaces/apps/.github/workflows/check-pull-request.yaml` contains `npx playwright install --with-deps chromium`
- Other apps' `vite.config.ts` use `environment: 'node'` (no happy-dom): `grep -L "happy-dom" /workspaces/apps/apps/*/vite.config.ts` lists all five

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: apply Carson 9.0.0-unstable templates (Vitest browser mode)"
```

---

### Task 4: Install playwright deps and browsers; smoke-run

**Files:**
- Install: `@vitest/browser-playwright`, `playwright`, `vitest-browser-react` (added to package.json by Task 3; lockfile update here)
- No test edits

**Interfaces:**
- Consumes: Task 3's generated config
- Produces: a working `npx vitest run --project browser` invocation; baseline failure list

- [ ] **Step 1: Install new devDeps**

Run: `npm install` (from `/workspaces/apps`). This resolves the three new devDeps from somewhere's `package.json`.

- [ ] **Step 2: Install chromium**

Run: `npx playwright install chromium` (from `/workspaces/apps`).
Expected: installs chromium into the playwright cache (no `--with-deps` needed locally; CI workflow uses it).

- [ ] **Step 3: Smoke-run the browser project**

Run: `npx vitest run --project browser --reporter=basic` (from `/workspaces/apps/apps/somewhere`).
Expected: the runner boots chromium and runs the 25 renamed files. It is expected that MOST tests fail at this point (mocks deleted or pixi mocks still present but broken in browser). The goal of this step is only to confirm chromium launches and vitest reports per-file results rather than crashing. If vitest cannot boot chromium at all, stop and report — do not continue.

- [ ] **Step 4: Smoke-run the unit project**

Run: `npx vitest run --project unit --reporter=basic` (from `/workspaces/apps/apps/somewhere`).
Expected: 51 files, all passing (they were verified to pass in node env earlier). If any unit test fails, investigate whether the new template config broke it (e.g. missing jest-dom matchers) before proceeding.

- [ ] **Step 5: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore: install playwright browser-mode dev dependencies"
```

---

### Task 5: Wave 1a — trivial renames that work as-is in browser mode

**Files:**
- Modify (fixups only if needed): `tests/AudioMixer.browser.test.ts`, `tests/SliderFillGeometry.browser.test.ts`, `tests/engine/GameInput.browser.test.ts`, `tests/game/gameInput.browser.test.ts`, `tests/isTextEntryTarget.browser.test.ts`, `tests/pauseFlow.browser.test.ts`, `tests/save.browser.test.ts`, `tests/worldSpawn.browser.test.ts`

**Interfaces:**
- Consumes: nothing (these files have no pixi mocks; they failed in node only because node lacks DOM/rAF)
- Produces: 8 green browser test files

- [ ] **Step 1: Run the eight files**

Run: `npx vitest run --project browser --reporter=basic tests/AudioMixer.browser.test.ts tests/SliderFillGeometry.browser.test.ts tests/engine/GameInput.browser.test.ts tests/game/gameInput.browser.test.ts tests/isTextEntryTarget.browser.test.ts tests/pauseFlow.browser.test.ts tests/save.browser.test.ts tests/worldSpawn.browser.test.ts`

- [ ] **Step 2: Fix failures**

These files should mostly pass in a real browser (they need `globalThis.addEventListener`, `requestAnimationFrame`, `localStorage`, `document` — all present). Known possible fixups:
- `pauseFlow.browser.test.ts` already imports `'pixi.js/events'` explicitly — if real `UiRoot`/`Modal` construction now fails on a missing event system, keep that import (it is a real pixi side-effect import, not a mock).
- If any file references the old `happy-dom`-only globals at module scope, remove those references.

For each failing test, apply the minimal fix, then re-run only that file. Do not delete or rewrite passing assertions.

- [ ] **Step 3: Verify all eight pass**

Run: `npx vitest run --project browser --reporter=basic tests/AudioMixer.browser.test.ts tests/SliderFillGeometry.browser.test.ts tests/engine/GameInput.browser.test.ts tests/game/gameInput.browser.test.ts tests/isTextEntryTarget.browser.test.ts tests/pauseFlow.browser.test.ts tests/save.browser.test.ts tests/worldSpawn.browser.test.ts`
Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add apps/somewhere/tests
git commit -m "test: run DOM-dependent tests in browser mode (wave 1a)"
```

---

### Task 6: Wave 1b — settings, Text, mapSign rewrites

**Files:**
- Modify: `tests/settings.browser.test.ts`, `tests/Text.browser.test.ts`, `tests/mapSign.browser.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: 3 green browser test files whose browser-mode incompatibilities (`vi.resetModules`, `node:fs`) are fixed; the `?fresh` import pattern (used here) and `?raw` import pattern (used here) become the reference for later tasks

- [ ] **Step 1: Rewrite `settings.browser.test.ts` — replace `vi.resetModules()`**

`vi.resetModules()` throws in browser mode. Replace the helper:

```ts
// settings.ts hydrates at module load, so each test re-imports a fresh copy
// after seeding localStorage. resetModules is unsupported in browser mode, so
// a cache-busting query makes each dynamic import a fresh module instance.
let settingsImport = 0;

async function importSettings() {
  settingsImport += 1;

  return import(`../source/game/settings.js?fresh=${settingsImport}`);
}
```

Delete the `vi.resetModules();` line inside the old helper. Everything else in the file stays. (Vite treats each unique query string as a distinct module, so the module executes its top-level hydration again.)

- [ ] **Step 2: Rewrite `Text.browser.test.ts` — replace `readFileSync`**

The file currently does `let xml = readFileSync('public/monogram.fnt', 'utf8');` with `import {readFileSync} from 'node:fs';`. Replace both with a raw import:

```ts
import monogramFnt from '../public/monogram.fnt?raw';
```

and inside `installMonogram()`:

```ts
let xml = monogramFnt;
```

Delete the `node:fs` import. Keep everything else, including the real pixi `BitmapFont`/`LayoutSystem` usage — that is the point of running this file in the browser.

- [ ] **Step 3: Rewrite `mapSign.browser.test.ts` — replace `fs.readFileSync` + delete `@pixi/layout` mock**

Delete the `import fs from 'node:fs';` line and the `vi.mock('@pixi/layout/components', ...)` block (the whole block from `vi.mock('@pixi/layout/components', async () => {` to the closing `}));`). The other mocks (`../source/engine/ui/Text.js`, `../source/game/assets.js`, `../source/game/game.js`) STAY.

Replace the two `fs` reads:

```ts
import mapJsonRaw from '../public/map.json?raw';
import tilesetJsonRaw from '../public/tileset.json?raw';
```

```ts
let mapJson = JSON.parse(mapJsonRaw) as unknown;
let tilesetJson = JSON.parse(tilesetJsonRaw) as {
  // keep the existing inline type if present; otherwise `as unknown` and let
  // the following accessors typecheck
};
```

- [ ] **Step 4: Run the three files**

Run: `npx vitest run --project browser --reporter=basic tests/settings.browser.test.ts tests/Text.browser.test.ts tests/mapSign.browser.test.ts`
Expected: 0 failures. If `?raw` imports fail to resolve, check the path is relative to the test file (`../public/...` from `tests/`).

- [ ] **Step 5: Commit**

```bash
git add apps/somewhere/tests
git commit -m "test: adapt settings, Text and mapSign tests to browser mode"
```

---

### Task 7: Wave 1c — widget tests: delete pixi/layout mocks

**Files:**
- Modify: `tests/DialogueBox.browser.test.ts`, `tests/Modal.browser.test.ts`, `tests/TextInput.browser.test.ts`, `tests/UiRoot.browser.test.ts`, `tests/GameScreen.browser.test.ts`

**Interfaces:**
- Consumes: the `?fresh`/`?raw` patterns from Task 6
- Produces: 5 green browser test files running against the REAL `@pixi/layout` and pixi `Container`/`Rectangle`/`Sprite`

- [ ] **Step 1: Delete pixi/layout mock blocks**

For each file, delete every `vi.mock('pixi.js', ...)`, `vi.mock('pixi.js', () => { ... })` and `vi.mock('@pixi/layout/components', ...)` block (from `vi.mock(` to the matching `}));` or `});`). Files and their mocks:

- `DialogueBox.browser.test.ts`: delete `vi.mock('@pixi/layout/components', ...)`. KEEP `vi.mock('../source/engine/ui/Text.js', ...)` and the `vi.hoisted` `mockTexts` array (the `Text.js` mock is a source-module mock). If the real `LayoutContainer` constructor now throws because it needs `@pixi/layout`'s container mixins installed, add `import '@pixi/layout';` at the top of the file (same side-effect import `SliderFillGeometry` already relies on).
- `Modal.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (the big `Container` mock). If the tests construct `new Container()` directly, they already import type-only pixi — add a value import: `import {Container} from 'pixi.js';` and let the tests construct the real class.
- `TextInput.browser.test.ts`: delete `vi.mock('@pixi/layout/components', ...)` and `vi.mock('pixi.js', ...)`. KEEP `vi.mock('../source/engine/ui/Text.js', ...)` and `vi.mock('../source/engine/ui/createBackground.js', ...)`.
- `UiRoot.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (the large `Container` mock with listeners). If real pixi events are needed (tests dispatch via `listeners` maps), add `import 'pixi.js/events';` at the top — the real pixi event system registers `addEventListener` on `Container` as a side effect.
- `GameScreen.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (the `Container` mock).

Also convert any `const {X} = await import('../source/...')` that exists ONLY to load after the mock into a normal top-level static import, e.g. `import {Modal} from '../source/engine/ui/Modal.js';` — the dynamic import is only needed when a mock must be registered first. If a dynamic import remains valid (imports a mocked module), leave it.

- [ ] **Step 2: Run the five files**

Run: `npx vitest run --project browser --reporter=basic tests/DialogueBox.browser.test.ts tests/Modal.browser.test.ts tests/TextInput.browser.test.ts tests/UiRoot.browser.test.ts tests/GameScreen.browser.test.ts`

- [ ] **Step 3: Fix failures iteratively**

Expected failure classes and their fixes:
- `@pixi/layout` needs `LayoutSystem` to process layout before bounds/positions are readable. Where a test asserts on `layout`-derived values, call `LayoutSystem.update({objects: ...})` or construct with `throttle: 0` (see `SliderFillGeometry.browser.test.ts` for the established pattern) before asserting.
- Real `Container` has no `listeners`/`captureListeners` plain maps — tests that read those must instead attach a real event handler with `container.on(...)` / `addEventListener` (pixi event system) and assert through it.
- Real `hitArea` is a `pixi.Rectangle` — tests asserting plain objects need `new pixi.Rectangle(...)`.

Fix each failure minimally, re-run the file, and repeat until green. Do not weaken assertions; if a real-pixi behavior differs from the mock's, the test must be updated to assert the real behavior.

- [ ] **Step 4: Verify all five pass**

Run: `npx vitest run --project browser --reporter=basic tests/DialogueBox.browser.test.ts tests/Modal.browser.test.ts tests/TextInput.browser.test.ts tests/UiRoot.browser.test.ts tests/GameScreen.browser.test.ts`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add apps/somewhere/tests
git commit -m "test: run widget tests against real pixi/layout in browser mode (wave 1c)"
```

---

### Task 8: Wave 1d — Game.test.ts (real Application + ticker)

**Files:**
- Modify: `tests/Game.browser.test.ts` (largest rewrite)
- Possibly modify: `/workspaces/apps/apps/somewhere/source/engine/app/Game.ts` ONLY if a real-pixi incompatibility blocks the tests (see Step 3; prefer test-side fixes first)

**Interfaces:**
- Consumes: nothing
- Produces: green `Game.browser.test.ts` running the REAL `pixi.Application` (WebGL via SwiftShader) with manual ticker stepping

- [ ] **Step 1: Delete mock blocks**

Delete all of:
- `vi.mock('pixi.js', () => ({ Application: ..., extensions, ExtensionType, LoaderParserPriority, TextureSource, Assets, Container, Rectangle, UPDATE_PRIORITY }))` — the large block (was lines ~39-140)
- `vi.mock('@pixi/layout', () => ({}));`

KEEP the four `vi.mock('../source/pixi-tools/*.js', ...)` blocks (`tiledTilesetAsset`, `tiledTilemapAsset`, `audioBufferAsset`, `spritesetAsset`) — they prevent real asset loading.

Replace the dynamic imports at the bottom of the mock section with static imports:

```ts
import {Game} from '../source/engine/app/Game.js';
import {GameAssets} from '../source/engine/app/GameAssets.js';
import * as pixi from 'pixi.js';
import {getPixelScale} from '../source/engine/app/getPixelScale.js';
```

(The `Game`/`GameAssets` static imports are safe now that the pixi mock is gone; keep `const pixi = await import('pixi.js')` only if the code after it needs it — a static `import * as pixi` works too.)

- [ ] **Step 2: Seed the asset cache instead of the mocked `Assets`**

The old mock returned `Assets.get: () => uiSpriteset` and `cache.has: (key) => key === 'ui'`. With real pixi, seed the real cache in `createGame()` (before `game.init()`, since `Game.init` loads bundles):

```ts
pixi.Assets.cache.set('ui', uiSpriteset);
```

If `pixi.Assets.cache.set` requires a third `type` argument in this pixi version, pass `pixi.ExtensionType.Asset` (check the `Cache.set` signature in `/workspaces/apps/node_modules/pixi.js/lib/assets/cache/Cache.mjs` first).

- [ ] **Step 3: Rework the ticker — replace the `frame()` helper**

The old `frame()` iterated the mock's `handlers` array. Real pixi `Ticker` exposes `update(currentTime?)` which runs all listeners synchronously, and `stop()` which cancels rAF. In `createGame()`, after `await game.init()`, stop the auto-started ticker:

```ts
game.app.ticker.stop();
```

Replace the `frame()` helper with:

```ts
let frameTime = 0;

function frame(game: InstanceType<typeof Game>) {
  frameTime += 16.7;
  game.app.ticker.update(frameTime);
}
```

`Ticker.update` only runs listeners when `currentTime > this.lastTime`, so monotonically increasing `frameTime` is required. If any assertion depends on `deltaTime` values, keep the increment at `16.7` (1 frame at 60 fps).

If stopping the ticker breaks Game's own logic (e.g. it relies on `ticker.autoStart`), instead set `game.app.ticker.autoStart = false` and call `game.app.ticker.update(...)` the same way.

- [ ] **Step 4: Run the file**

Run: `npx vitest run --project browser --reporter=basic tests/Game.browser.test.ts`

- [ ] **Step 5: Fix failures iteratively**

Expected failure classes and fixes:
- `Application.init()` fails to create a WebGL context → the test environment's chromium cannot create WebGL. First try adding `preference: 'webgl'`-style options on the test's `Application` — but `Game.ts` constructs the Application internally, so if WebGL genuinely fails, report it as a blocker (SwiftShader WebGL is expected to work in headless chromium; this would indicate a missing system dependency).
- `AudioBuffer` `instanceof` checks (GameAssets `sound()`) fail because browser `AudioBuffer` exists but nothing was loaded → the seeded cache must contain a real `AudioBuffer`-compatible value for keys the tests call `sound()` on; seed `pixi.Assets.cache.set(name, new AudioBuffer(...))` or adjust the test to not call `sound()` for unloaded keys.
- Ticker ordering assertions (input callback runs at HIGH priority before screens) — the real ticker sorts by priority, which is exactly what the old mock comment claimed; if ordering differs, assert through observable behavior (ui call order) rather than handler-array order.

Fix each failure minimally and re-run until green.

- [ ] **Step 6: Verify green**

Run: `npx vitest run --project browser --reporter=basic tests/Game.browser.test.ts`
Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add apps/somewhere/tests apps/somewhere/source
git commit -m "test: run Game tests against real pixi Application in browser mode"
```

---

### Task 9: Wave 2 — remaining pixi-mocked tests

**Files:**
- Modify: `tests/Button.browser.test.ts`, `tests/Container.browser.test.ts`, `tests/GameAssets.browser.test.ts`, `tests/GameScreenState.browser.test.ts`, `tests/Panel.browser.test.ts`, `tests/Slider.browser.test.ts`, `tests/Toggle.browser.test.ts`, `tests/attachWidgetInteraction.browser.test.ts`

**Interfaces:**
- Consumes: mock-deletion + layout patterns from Task 7, cache-seeding pattern from Task 8
- Produces: 8 green browser test files, completing the 25-file conversion

- [ ] **Step 1: Delete pixi/layout mock blocks**

Per file, delete `vi.mock('pixi.js', ...)` and `vi.mock('@pixi/layout/components', ...)` blocks. KEEP all `createBackground`, `Text.js`, `UiRoot.js`, `Scheduler.js`, and `../source/pixi-tools/*` mocks:

- `Button.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (Rectangle mock) and `vi.mock('@pixi/layout/components', ...)`. KEEP `vi.mock('../source/engine/ui/createBackground.js', ...)`.
- `Container.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (Container mock). Convert `const {Container} = await import(...)` to a static import of `../source/engine/ui/Container.js`.
- `GameAssets.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (Assets mock). KEEP the four `vi.mock('../source/pixi-tools/*.js', ...)` mocks and the `vi.stubGlobal('AudioBuffer', StubAudioBuffer)` line (real browser `AudioBuffer` exists; the stub is harmless but if `instanceof` checks use it, keep it). Convert `const {GameAssets} = await import(...)` to a static import. If `Assets.init` is now called by the real module and warns, that is fine — assertions target the cache, so seed entries via `pixi.Assets.cache.set(...)` where the mock previously returned them.
- `GameScreenState.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (Container mock). KEEP `vi.mock('../source/engine/ui/UiRoot.js', ...)` and `vi.mock('../source/engine/scheduler/Scheduler.js', ...)`.
- `Panel.browser.test.ts`: delete `vi.mock('@pixi/layout/components', ...)`. KEEP `vi.mock('../source/engine/ui/createBackground.js', ...)`.
- `Slider.browser.test.ts`: delete `vi.mock('pixi.js', ...)` and `vi.mock('@pixi/layout/components', ...)`. KEEP `vi.mock('../source/engine/ui/createBackground.js', ...)`.
- `Toggle.browser.test.ts`: delete `vi.mock('pixi.js', ...)` and `vi.mock('@pixi/layout/components', ...)`. KEEP `vi.mock('../source/engine/ui/createBackground.js', ...)`.
- `attachWidgetInteraction.browser.test.ts`: delete `vi.mock('pixi.js', ...)` (Rectangle mock). The file's comment says it imports after the mock so `attachHitArea` picks up the mocked Rectangle — with the mock gone, the real `pixi.Rectangle` is used; convert the dynamic import to a static import and remove the now-stale comment.

- [ ] **Step 2: Run the eight files**

Run: `npx vitest run --project browser --reporter=basic tests/Button.browser.test.ts tests/Container.browser.test.ts tests/GameAssets.browser.test.ts tests/GameScreenState.browser.test.ts tests/Panel.browser.test.ts tests/Slider.browser.test.ts tests/Toggle.browser.test.ts tests/attachWidgetInteraction.browser.test.ts`

- [ ] **Step 3: Fix failures iteratively**

Apply the same failure classes as Task 7 Step 3 (real LayoutContainer needs `LayoutSystem` updates; real hitArea is a `Rectangle`; layout merge semantics are already mirrored by the real library, so assertions on merged styles should pass unchanged). For `GameAssets.browser.test.ts`, if `pixi.Assets.init` needs a base path or throws on the `bump.wav` bundle, keep the four pixi-tools mocks (they are already kept) and seed only what assertions read.

Fix each failure minimally and re-run until green.

- [ ] **Step 4: Verify all eight pass**

Run: `npx vitest run --project browser --reporter=basic tests/Button.browser.test.ts tests/Container.browser.test.ts tests/GameAssets.browser.test.ts tests/GameScreenState.browser.test.ts tests/Panel.browser.test.ts tests/Slider.browser.test.ts tests/Toggle.browser.test.ts tests/attachWidgetInteraction.browser.test.ts`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add apps/somewhere/tests
git commit -m "test: run remaining widget tests against real pixi in browser mode (wave 2)"
```

---

### Task 10: Full verification

**Files:**
- None expected to change (fixes only if verification finds problems)

**Interfaces:**
- Consumes: all of Tasks 1-9
- Produces: evidence that the whole workspace is green

- [ ] **Step 1: Full somewhere test run with coverage**

Run: `npm test` (from `/workspaces/apps/apps/somewhere`).
Expected: both `unit` and `browser` projects pass; coverage report generated (`coverage/`). If coverage fails for the browser project (v8 provider unsupported in some config), report it — do not silently disable coverage.

- [ ] **Step 2: Verify no pixi mocks remain**

Run: `grep -rln "vi.mock('pixi.js'\|vi.mock('@pixi/layout" tests --include="*.ts"` (from `/workspaces/apps/apps/somewhere`)
Expected: no output.

- [ ] **Step 3: Workspace-wide checks**

From `/workspaces/apps`:
- `npm run lint`
- `npm run typecheck`
- `npm test` (turbo — the other four apps run vitest with `--passWithNoTests`)

All must pass.

- [ ] **Step 4: Review the full diff**

Run: `git diff development --stat` and skim the diff. Verify:
- `.carson/project.json` overrides unchanged
- No `happy-dom` anywhere: `grep -rn "happy-dom" apps/*/package.json || true` prints nothing
- No `tests/setup.ts` references: `grep -rn "tests/setup" apps/*/vite.config.ts || true` prints nothing
- The untracked png/playwright-mcp files were never committed

- [ ] **Step 5: Final commit**

If Step 1-4 produced any changes:

```bash
git add -A
git commit -m "chore: final verification fixes for Vitest browser mode migration"
```

---

## Self-Review Notes

- **Spec coverage:** templates bump (Task 1), rename-before-update sequencing (Tasks 2-3), carson-managed cleanup verified (Task 3 Step 5), mock deletion (Tasks 7-9), fs→`?raw` and `resetModules`→`?fresh` (Task 6), ticker/Application rework (Task 8), two-wave conversion with verification (Tasks 5-9), full workspace verification incl. coverage/lint/typecheck and diff review (Task 10).
- **Placeholders:** none — every step names concrete files, exact mock blocks, and commands. Fix-iteration steps name the expected failure classes and their specific fixes because real-pixi-in-headless behavior is empirical; the plan's steps remain concrete.
- **Type consistency:** `frameTime` (Task 8), `settingsImport` (Task 6), and `?raw` imports (Tasks 6) are defined where used and used only there.
