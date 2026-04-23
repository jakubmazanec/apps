# Vitest browser mode

## Goal

Move Somewhere's tests that mock browser APIs (canvas, WebGL, DOM) to Vitest
browser mode, where real Chromium runs the real Pixi.js, so the hand-rolled
`vi.mock('pixi.js')` / `vi.mock('@pixi/layout')` classes can be deleted. This
requires updating the workspace's Carson templates to the newest prerelease
(`9.0.0-unstable.9c3734ab`), which generates the browser-mode test config.

## Templates update (workspace-wide)

Carson and Carson templates are root devDependencies, and `carson update
workspace` regenerates all five apps (dram, foam, headwind, riffle, somewhere).
The other four apps have no tests, so for them the only changes are:

- `vite.config.ts`: test environment `happy-dom` -> `node`
- CI workflows: gain `npx playwright install --with-deps chromium` when any
  project has browser tests
- `.gitignore`: gains `.vitest-attachments/`, `.vitest-reports/`

Root package.json version bumps:

- `@jakubmazanec/carson`: `^3.0.2` -> `3.0.6-unstable.9c3734ab` (exact
  prerelease, matching the templates peer dependency)
- `@jakubmazanec/carson-templates`: `^8.1.0` -> `9.0.0-unstable.9c3734ab`
  (exact prerelease)

### What the new template generates (per project)

If a project has files matching `tests/**/*.browser.test.?(c|m)[jt]s?(x)`,
`vite.config.ts` becomes a two-project Vitest config:

- `unit`: node environment, `tests/**/*.test.*`, excluding the browser glob
- `browser`: Playwright provider (chromium, headless), browser glob only

Otherwise the project gets `environment: 'node'` with the plain test glob.

`package.json` gains `@vitest/browser-playwright`, `playwright`, and
`vitest-browser-react` devDependencies only for projects that have browser
tests. `happy-dom`, `@testing-library/react`, and `@testing-library/jest-dom`
leave the template's dependency list.

### Carson-managed cleanup (verified against carson source)

`applyTemplateRenders` first unmerges every previously-snapshotted render
before applying new ones (`unmerge.js` keeps only keys not contributed by the
old template), and `overwrite`-strategy snapshots are deleted when the render
disappears. Therefore `carson update workspace` automatically:

- Removes `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`
  from somewhere's devDependencies (package.json strategy is `merge`)
- Deletes `tests/setup.ts` (old template's `overwrite` render no longer
  exists; the new template has no setup file at all)

No manual cleanup is needed. Verify afterwards with `git diff` that these are
gone and that `.carson/project.json` overrides (`build.target: ES2022`,
eslint ignores, tsconfig options) survive the regeneration.

### Sequencing matters

The template detects browser tests by globbing existing files at update time.
Rename/convert the test files to `*.browser.test.ts` **before** running
`carson update workspace`, or the generated config will not include the
browser project.

## Test conversion

### Browser mode (~25 files, renamed `*.browser.test.ts`)

The full set is the union of two groups: 17 files that fail in a node
environment (measured) and 8 pixi-mocked files that happen to pass in node.
Seven files are in both groups (DialogueBox, Game, GameScreen, Modal,
TextInput, UiRoot, mapSign).

Pixi-mocking tests (15) - delete `vi.mock('pixi.js')` and
`vi.mock('@pixi/layout...')`, run against real Pixi in Chromium:

- Button, Container, DialogueBox, Game, GameAssets, GameScreen,
  GameScreenState, Modal, Panel, Slider, TextInput, Toggle, UiRoot,
  attachWidgetInteraction, mapSign

Node-failing tests without pixi mocks (10) - these fail in a node environment
(`globalThis.addEventListener is not a function`,
`requestAnimationFrame is not defined`, missing localStorage):

- AudioMixer, SliderFillGeometry, Text, engine/GameInput, game/gameInput,
  isTextEntryTarget, pauseFlow, save, settings, worldSpawn

### Stays unit (node environment, no changes)

The remaining pure-logic tests: Vector, Scheduler, Tween, easing, World,
EventChannel, ObjectPool, exportedAssets (uses `node:fs`, must stay in node),
and the rest - they pass in a node environment unchanged.

### Per-file cleanup for browser mode

- Delete the `pixi.js` / `@pixi/layout` mocks. Some tests need adjustments
  where the mock's semantics (e.g. layout style merge) differ from the real
  library, or where the real `Application.init()` requires a WebGL context.
- `Text.test.ts` and `mapSign.test.ts` read files via `node:fs` (monogram.fnt,
  map.json, tileset.json) - browsers have no filesystem. Switch to Vite `?raw`
  imports (`import fnt from '../public/monogram.fnt?raw'`), which work in both
  node and browser mode.
- `settings.test.ts` uses `vi.resetModules()` - unsupported in browser mode
  (it throws). Rewrite to re-import with a cache-busting query, e.g.
  `import('../source/game/settings.js?fresh=…')`.
- Real `Application.init()` in Game / GameScreen / pauseFlow tests may need a
  pixi renderer preference (`preference: 'webgl'`) for headless Chromium, and
  ticker control may need rework (real rAF-driven ticker instead of the mock's
  manual handler array).

## Execution order

1. Bump root `package.json` (carson + carson-templates), `npm install`
2. Convert somewhere's tests: rename the 25 files to `*.browser.test.ts`,
   delete pixi/layout mocks, apply the fs -> `?raw` and `vi.resetModules`
   rewrites (before the update, since template detection globs existing files)
3. `npx carson update workspace` - regenerates all apps' configs; somewhere
   gets the two-project vitest config + playwright deps; stale deps and
   `tests/setup.ts` are unmerged/deleted
4. `npm install` (new devDeps), `npx playwright install chromium` locally
   (CI workflow already has the install step)
5. Fix and iterate: run vitest in somewhere. Convert in two waves - the 17
   mandatory node-failing files first (verify), then the 8
   pixi-mocked-but-node-passing files (Button, Container, GameAssets,
   GameScreenState, Panel, Slider, Toggle, attachWidgetInteraction) (verify).
   Address real-pixi-in-headless issues (WebGL preference, ticker control,
   layout semantics)
6. Full workspace check: `npm test`, `npm run lint`, `npm run typecheck`
   (other apps have no tests, so `--passWithNoTests` keeps them green)

## Verification

- After `carson update workspace`, `git diff` must show: two vitest projects
  in somewhere's `vite.config.ts`, playwright devDeps added, `happy-dom` /
  `@testing-library/*` / `tests/setup.ts` gone, `.carson/project.json`
  overrides untouched, CI workflows with the playwright install step
- `vitest run --coverage` (v8 provider) must work across both projects;
  browser-mode coverage is supported in Vitest 4
- `npm run lint` and `npm run typecheck` pass for the whole workspace

## Risks

- Real Pixi in headless Chromium: WebGL via SwiftShader usually works; if
  `Application.init()` fails, mitigation is `preference: 'webgl'` or an
  explicit renderer type in tests. Ticker-dependent tests may need manual
  ticker stepping instead of the mock's handler array
- Browser-mode API limits: `vi.resetModules` throws (settings.test.ts
  rewrite), no `node:fs` (Text, mapSign `?raw` imports). `vi.hoisted` and
  `vi.stubGlobal` work fine in browser mode
