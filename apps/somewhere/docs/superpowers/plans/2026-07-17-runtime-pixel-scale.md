# Runtime Pixel Scale (T1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the baked ×4 asset upscale with a render-time integer `pixelScale` applied as one scale transform on `Game.view`, with all assets re-authored at true 1× art-pixel scale and world coordinates in art px (a tile is 16 world units everywhere).

**Architecture:** A pure chooser function picks an integer `pixelScale` per device once at `Game.init()`; `Game.view` gets `scale.set(pixelScale)` and everything inside it (screens, world, UI) operates in art px. Assets migrate ×4 → 1× via one-off audited scripts (lossless nearest downscale + numeric ÷4), the standalone UI PNGs collapse into one `ui` spritesheet whose per-frame `borders` carry nine-slice insets, and game-code pixel constants become plain art-px literals.

**Tech Stack:** TypeScript, pixi.js 8.16.0 (`Assets`/`Spritesheet`/`NineSliceSprite`/`roundPixels`), `@pixi/layout`, Node 24 `.mjs` scripts with `fast-png` (new devDependency), Vitest + happy-dom.

Reference spec: [`docs/superpowers/specs/2026-07-16-runtime-pixel-scale-design.md`](../specs/2026-07-16-runtime-pixel-scale-design.md).

## Global Constraints

Every task's requirements implicitly include this section.

- **House style:** options-object constructors; `#`-private fields (never `_`); `let` for locals; `DisposableStack` for cleanup; fail-loud accessors that throw while unset; `.js` extensions on relative imports in `source/`; `exactOptionalPropertyTypes` is on, so optional fields are conditionally assigned, never set to `undefined`. Composition, no inheritance.
- **Art-px semantics:** 1 art px = 1 world unit; a tile is 16 art px; device px = art px × `pixelScale`. Time values (`MAX_DELTA_TIME`, tween/timer durations, `fadeDuration`) never change.
- **Chooser policy (exact):** `clamp(round(height / 270), 2, 8)` over the viewport in device px (`window.innerWidth × devicePixelRatio`, `window.innerHeight × devicePixelRatio`). A custom chooser's output must be an integer ≥ 1, otherwise `init()` throws.
- **Renderer stays:** `resolution: 1`, `roundPixels: true`, global `TextureSource.defaultOptions.scaleMode = 'nearest'` set before any load. Textures load at 1× with no resolution manipulation anywhere.
- **Sheet guardrails:** no `meta.scale` key in any sheet JSON the plan writes (absent key ⇒ resolution 1 in pixi 8.16.0; `Tileset.from`'s internal `meta: {scale: '1'}` also resolves to 1 and stays as is); no `@Nx` suffix in any asset filename.
- **Nine-slice:** insets live only in `public/ui.json` per-frame `borders` (art px, shape `{left, top, right, bottom}`); pixi passes them raw to `texture.defaultBorders` and `NineSliceSprite` reads them when constructed without inset options (both verified in pixi 8.16.0 source). No insets in code anywhere.
- **World constants (exact, from the spec):** `MAX_SPEED` 4 → 1; motion snap threshold 0.1 → 0.025 (two occurrences); player spawn 64·9, 64·10 → 16·9, 16·10; player boundingBox (0, 40, 64, 40) → (0, 10, 16, 10); tap offsets −32, −60 → −8, −15; spark size/rise 16/24 → 4/6.
- **UI values (exact, from the spec):** `pressOffset` 4 → 1; focus-ring `padding` 8 → 2; caret width 1; layout `padding` 32 → 8, 16 → 4, 8 → 2; `gap` 16 → 4, 12 → 3, 4 → 1; `minWidth` 220 → 55; `fontSize` 48 → 12 and 24 → 6 at every site. All current values are ×4 multiples.
- **Migration safety:** backup of `public/` (to a directory outside the repo and the Docker build context) before anything else, abort if it fails or already exists; block-uniformity audit before downscale; divisibility guard on every numeric ÷4; explicit ×4-bake preconditions so a second run aborts loudly.
- **Two flagged deliberate visual changes** (everything else must be pixel-identical at `pixelScale` 4, DPR 1): the text-input caret goes from 2 device px to 1 art px (grid-consistent, slightly thicker at ×4; its 2-device-px margin becomes 1 art px for the same reason), and the spark loses its sub-art-pixel detail, becoming a 4×4-art-px diamond of the same on-screen size.
- **Commands** (run from `apps/somewhere/`): single test file `npx vitest run tests/<File>.test.ts`; full suite `npm run test`; types `npm run typecheck`; lint `npm run lint`. Commit after every task.
- **Mid-branch runtime state:** tests, typecheck and lint stay green after every task, but the dev server renders wrong between Task 6 (spike) and Task 13 (mixed ×4/1× state) — expected; do not "fix" it mid-way.

## Spec deviations (found during planning, all verified against the code)

1. **Modal sizing needs art px** (spec §3 says the camera snap is "the one game-code read of `game.pixelScale`"): the four `modal.resize(app.screen.width, app.screen.height)` call sites in `mainMenuScreen.ts`/`gameScreen.ts` pass device px, but the modal lives inside the scaled root. They must divide by `pixelScale` (Task 13), making them additional game-code reads.
2. **`graphicsSystem` must stop rounding sprite positions** (spec §2 promises "movement granularity is 1/`pixelScale` art px = 1 device px, exactly today's", and the spike explicitly tests entities at fractional art positions): today's `Math.round` would quantize display to whole art px. `roundPixels` owns device-px snapping now (Task 5).
3. **`GameScreen`'s `focusRing` option becomes a thunk** (`() => FocusRingOptions`): the spec's "each screen builds its focus-ring options where used" cannot be a plain value because screens are module-level consts constructed before assets load, while a resolved `texture` exists only afterwards. The thunk runs in `setGame`, which the boot flow only reaches after `init()` has loaded the `default` bundle (Task 13).
4. **`motionSystem.test.ts` needs no changes** (spec §4 lists "snap-threshold expectations update"): verified — its tests set `velocity` directly on a stub map and never use `motion.target`, so no assertion references `MAX_SPEED` or the snap threshold.
5. **Both fonts migrate through the same ÷4 path** (spec §5 says to reuse `$/public_1x`'s monogram un-bake): verified during planning that `scale-fnt` at 0.25 on `public/monogram.fnt` is byte-identical to `$/public_1x/monogram.fnt`, and a nearest ÷4 of the page PNG matches `$/public_1x/monogram_0.png` on every visible pixel (differences only under alpha = 0). `$/public_1x` stays what it is — ground truth for the verification step in Task 10.

---

## File Structure

**Create (engine):**
- `source/engine/app/ChoosePixelScale.ts` — the `ChoosePixelScale` type + `defaultChoosePixelScale` policy (mirrors `FocusKeys.ts` as a sibling single-purpose module).

**Create (scripts):**
- `scripts/asset-migration.mjs` — pure, unit-tested migration helpers (block audit, nearest downscale, numeric ÷4 guards, `.fnt` scaling); no file I/O.
- `scripts/migrate-assets-to-1x.mjs` — one-shot CLI: backup → preconditions → audit → downscale → numeric ÷4.
- `scripts/generate-ui-atlas.mjs` — renders all widget variants at 1 art px per cell + blits the 1× banner into `public/ui.png` + `public/ui.json`.
- `scripts/generate-spark-assets.mjs` — 4×4 art-px spark diamond → `public/spark.png` + `public/spark.json`.
- `scripts/assets/` — hand-made 1× source art (`banner.png`, `banner-hover.png`, `banner-active.png`, written there by the migration; committed).

**Create (tests):**
- `tests/ChoosePixelScale.test.ts`, `tests/assetMigration.test.ts`.

**Modify (engine):** `source/engine/app/GameOptions.ts`, `source/engine/app/Game.ts`, `source/engine/app/GameScreen.ts`, `source/engine/input/Input.ts`, `source/engine/ui/UiRoot.ts`, `source/engine/ui/TextInput.ts`.

**Modify (game):** `source/game/game.ts`, `source/game/widgets.ts`, `source/game/motionSystem.ts`, `source/game/playerPool.ts`, `source/game/playerSystem.ts`, `source/game/wallHitPopupSystem.ts`, `source/game/cameraSystem.ts`, `source/game/graphicsSystem.ts`, `source/game/mainMenuScreen.ts`, `source/game/gameScreen.ts`, `source/game/loadingScreen.ts`.

**Modify (tests):** `tests/Game.test.ts`, `tests/Input.test.ts`, `tests/UiRoot.test.ts`, `tests/playerSystem.test.ts`, `tests/graphicsSystem.test.ts`.

**Modify (meta):** `package.json` (add `fast-png` devDependency).

**Assets (via scripts, Task 10):** regenerate/rewrite `public/{tileset,character,monogram_0,monogram-outline_0}.png`, `public/{map,tileset,character}.json`, `public/{monogram,monogram-outline}.fnt`, `public/spark.{png,json}`; create `public/ui.{png,json}`; delete 14 standalone UI PNGs; move 3 banner PNGs to `scripts/assets/`.

---

## Task 1: `ChoosePixelScale` — the chooser type and default policy

**Files:**
- Create: `source/engine/app/ChoosePixelScale.ts`
- Test: `tests/ChoosePixelScale.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type ChoosePixelScale = (viewport: {width: number; height: number}) => number`
  - `const defaultChoosePixelScale: ChoosePixelScale` — `clamp(round(height / 270), 2, 8)`

- [ ] **Step 1: Write the failing test**

Create `tests/ChoosePixelScale.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {defaultChoosePixelScale} from '../source/engine/app/ChoosePixelScale.js';

describe('defaultChoosePixelScale', () => {
  test('reproduces the ×4 feel on a 1080p DPR-1 viewport', () => {
    expect(defaultChoosePixelScale({width: 1920, height: 1080})).toBe(4);
  });

  test('rounds to the nearest integer scale', () => {
    expect(defaultChoosePixelScale({width: 1366, height: 768})).toBe(3); // 2.84 → 3
    expect(defaultChoosePixelScale({width: 1280, height: 620})).toBe(2); // 2.30 → 2
  });

  test('clamps tiny viewports to 2', () => {
    expect(defaultChoosePixelScale({width: 320, height: 200})).toBe(2); // 0.74 → 1 → clamped
  });

  test('clamps huge viewports to 8', () => {
    expect(defaultChoosePixelScale({width: 3840, height: 4320})).toBe(8); // 16 → clamped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ChoosePixelScale.test.ts`
Expected: FAIL — cannot resolve `../source/engine/app/ChoosePixelScale.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/app/ChoosePixelScale.ts`:

```ts
/**
 * Picks the session's integer render scale from the viewport size in device px
 * (CSS px × devicePixelRatio). `Game` runs it exactly once, at the top of
 * `init()`; the result must be an integer >= 1 and is fixed until reload.
 */
export type ChoosePixelScale = (viewport: {width: number; height: number}) => number;

// 270 art px of vertical world reproduces the current ×4 feel on a 1080p DPR-1
// screen; the clamp keeps degenerate viewports usable.
export const defaultChoosePixelScale: ChoosePixelScale = ({height}) =>
  Math.min(8, Math.max(2, Math.round(height / 270)));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ChoosePixelScale.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add source/engine/app/ChoosePixelScale.ts tests/ChoosePixelScale.test.ts
git commit -m "Add pixel scale chooser type and default policy"
```

---

## Task 2: `Game.pixelScale` lifecycle

**Files:**
- Modify: `source/engine/app/GameOptions.ts`
- Modify: `source/engine/app/Game.ts` (constructor, `init()`, new getter)
- Test: `tests/Game.test.ts` (new `describe('Game pixelScale')`)

**Interfaces:**
- Consumes: `ChoosePixelScale`, `defaultChoosePixelScale` from Task 1.
- Produces:
  - `GameOptions.choosePixelScale?: ChoosePixelScale` (optional, mirrors `focusKeys?: FocusKeys`)
  - `Game.pixelScale: number` — readonly getter; throws `'pixelScale is not available before init()!'` while unset
  - `init()` throws `` `Invalid pixelScale "${pixelScale}": the chooser must return an integer >= 1!` `` on bad chooser output

- [ ] **Step 1: Write the failing tests**

Append a new top-level `describe` block to `tests/Game.test.ts` (after the existing `describe('Game ticker configuration')` block; it reuses the file's existing `cleanups` array and mocked pixi):

```ts
describe('Game pixelScale', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('pixelScale access before init throws', () => {
    let game = new Game({assetBundles: []});

    expect(() => game.pixelScale).toThrow('pixelScale is not available before init()!');
  });

  test('init runs the chooser exactly once with the device-px viewport', async () => {
    let chooser = vi.fn(() => 5);
    let game = new Game({assetBundles: [], choosePixelScale: chooser});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();
    await game.init(); // init after init is a no-op: no second chooser run

    expect(chooser).toHaveBeenCalledTimes(1);
    expect(chooser).toHaveBeenCalledWith({
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio,
    });
    expect(game.pixelScale).toBe(5);
  });

  test('a non-integer chooser result rejects init and pixelScale stays unset', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 2.5});

    await expect(game.init()).rejects.toThrow(
      'Invalid pixelScale "2.5": the chooser must return an integer >= 1!',
    );
    expect(() => game.pixelScale).toThrow('pixelScale is not available before init()!');
  });

  test('a chooser result below 1 rejects init', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 0});

    await expect(game.init()).rejects.toThrow('Invalid pixelScale "0"');
  });

  test('without an override the engine default policy applies', async () => {
    let game = new Game({assetBundles: []});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.pixelScale).toBe(
      defaultChoosePixelScale({
        width: window.innerWidth * window.devicePixelRatio,
        height: window.innerHeight * window.devicePixelRatio,
      }),
    );
  });
});
```

Add the import at the top of `tests/Game.test.ts`, next to the existing dynamic imports (it must come after the `vi.mock` calls, with the other `await import`s):

```ts
const {defaultChoosePixelScale} = await import('../source/engine/app/ChoosePixelScale.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Game.test.ts`
Expected: FAIL — the new block fails (`game.pixelScale` does not exist, `choosePixelScale` is not a known option); every pre-existing test still passes.

- [ ] **Step 3: Extend `GameOptions`**

Replace the whole `source/engine/app/GameOptions.ts` (note: this file's imports carry no `.js` suffix today — keep its existing style):

```ts
import {ChoosePixelScale} from './ChoosePixelScale';
import {FocusKeys} from './FocusKeys';
import {GameAssetBundle} from './GameAssetBundle';

export type GameOptions = {
  assetBundles: GameAssetBundle[];
  choosePixelScale?: ChoosePixelScale;
  focusKeys?: FocusKeys;
};
```

- [ ] **Step 4: Implement the lifecycle in `Game.ts`**

In `source/engine/app/Game.ts`:

4a. Add the import (with the other relative imports):

```ts
import {type ChoosePixelScale, defaultChoosePixelScale} from './ChoosePixelScale.js';
```

4b. Add the fields (next to `#focusCommands`):

```ts
readonly #choosePixelScale: ChoosePixelScale;
#pixelScale: number | null = null;
```

4c. Update the constructor signature and store the chooser (first lines of the constructor body):

```ts
constructor({assetBundles, choosePixelScale, focusKeys}: GameOptions) {
  this.assetBundles = assetBundles;
  this.#choosePixelScale = choosePixelScale ?? defaultChoosePixelScale;
```

(rest of the constructor unchanged.)

4d. Add the fail-loud getter (after the `get #isRunning()` getter, before the constructor):

```ts
/** Integer render scale chosen for this session; device px = art px × pixelScale. */
get pixelScale(): number {
  if (this.#pixelScale === null) {
    throw new Error('pixelScale is not available before init()!');
  }

  return this.#pixelScale;
}
```

4e. Run the chooser at the top of `init()`'s `try` block, before the `scaleMode` line (the surrounding `finally` already reopens the `created` guard when this throws, so a failed init stays retryable):

```ts
try {
  // The canvas has no real size until the DOM ref attaches, long after init();
  // the viewport is available immediately and cannot be 0-sized the way a
  // hidden container can. Fixed per session: later resizes and DPR changes do
  // not re-run the chooser.
  let pixelScale = this.#choosePixelScale({
    width: window.innerWidth * window.devicePixelRatio,
    height: window.innerHeight * window.devicePixelRatio,
  });

  if (!Number.isInteger(pixelScale) || pixelScale < 1) {
    throw new Error(
      `Invalid pixelScale "${pixelScale}": the chooser must return an integer >= 1!`,
    );
  }

  this.#pixelScale = pixelScale;

  pixi.TextureSource.defaultOptions.scaleMode = 'nearest'; // Must be set before any texture load starts
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/Game.test.ts`
Expected: PASS — all pre-existing tests plus the 5 new ones.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add source/engine/app/GameOptions.ts source/engine/app/Game.ts tests/Game.test.ts
git commit -m "Add per-session pixelScale chosen at Game.init"
```

---

## Task 3: The scaled root and art-px `handleResize`

**Files:**
- Modify: `source/engine/app/Game.ts` (post-`app.init` block, `handleResize`)
- Test: `tests/Game.test.ts` (mock upgrades + new `describe('Game scaled root')`)

**Interfaces:**
- Consumes: `Game.pixelScale` from Task 2.
- Produces: `game.view` scaled by `pixelScale`; `view.layout` and `view.hitArea` in art px (device size ÷ `pixelScale`) — screens lay out against art-px viewport dimensions from here on.

- [ ] **Step 1: Upgrade the shared pixi mock in `tests/Game.test.ts`**

The mock must mirror two real pixi behaviors the new code relies on: `renderer.resize` updates `app.screen`, and containers have a `scale`. In the `vi.mock('pixi.js', ...)` factory:

Replace the `Application` mock's `renderer` line:

```ts
renderer = {
  resize: (width: number, height: number) => {
    this.screen.width = width;
    this.screen.height = height;
  },
};
```

Add to the `Container` mock class:

```ts
scale = {
  x: 1,
  y: 1,
  set(value: number) {
    this.x = value;
    this.y = value;
  },
};
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/Game.test.ts`:

```ts
describe('Game scaled root', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('init applies pixelScale as the root view scale', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 4});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.view.scale.x).toBe(4);
    expect(game.view.scale.y).toBe(4);
  });

  test('handleResize lays out the view and hit area in art px', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 4});
    let element = document.createElement('div');

    // happy-dom elements have no layout; pin the client box the resize reads.
    Object.defineProperty(element, 'clientWidth', {value: 800});
    Object.defineProperty(element, 'clientHeight', {value: 600});
    document.body.append(element);

    await game.init();
    game.addRef({current: element});
    cleanups.push(() => {
      game.destroy();
      element.remove();
    });

    // 800×600 CSS at DPR 1 → renderer 800×600 device px → 200×150 art px.
    expect(game.view.layout).toEqual({width: 200, height: 150});

    let hitArea = game.view.hitArea as pixi.Rectangle;

    expect(hitArea.width).toBe(200);
    expect(hitArea.height).toBe(150);
  });
});
```

`pixi` is already imported in this file via `const pixi = await import('pixi.js');` — the `pixi.Rectangle` cast type-resolves against the real module's types. If the cast complains under the mock, use `as {width: number; height: number}` instead.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/Game.test.ts`
Expected: FAIL — `game.view.scale.x` is 1 and layout/hitArea come out in device px (800/600).

- [ ] **Step 4: Implement the scaled root**

In `source/engine/app/Game.ts`, inside the post-`app.init` `.then(() => {...})` block, replace:

```ts
this.app.stage.addChild(this.view);

this.view.layout = {width: this.app.screen.width, height: this.app.screen.height};
```

with:

```ts
this.app.stage.addChild(this.view);

// Everything inside the root (screens, world, UI) operates in art px;
// device px exists only outside it.
this.view.scale.set(this.pixelScale);

this.view.layout = {
  width: this.app.screen.width / this.pixelScale,
  height: this.app.screen.height / this.pixelScale,
};
```

- [ ] **Step 5: Implement the art-px `handleResize` conversion**

Still in `Game.ts`, inside `handleResize` (in `addRef`): the canvas work stays in device px (CSS style size, `renderer.resize` to CSS×DPR); only the two values living in the view's local space convert. Replace:

```ts
      if (this.view.hitArea) {
        let hitArea = this.view.hitArea as pixi.Rectangle;

        hitArea.x = 0;
        hitArea.y = 0;
        hitArea.width = pixelWidth;
        hitArea.height = pixelHeight;
      }

      window.scrollTo(0, 0);
      this.app.renderer.resize(pixelWidth, pixelHeight);

      this.view.layout = {width: this.app.screen.width, height: this.app.screen.height}; // muste be called after renderer.resize() call, apparently
```

with:

```ts
      // The hit area and layout live in the view's local space — art px.
      if (this.view.hitArea) {
        let hitArea = this.view.hitArea as pixi.Rectangle;

        hitArea.x = 0;
        hitArea.y = 0;
        hitArea.width = pixelWidth / this.pixelScale;
        hitArea.height = pixelHeight / this.pixelScale;
      }

      window.scrollTo(0, 0);
      this.app.renderer.resize(pixelWidth, pixelHeight);

      this.view.layout = {
        width: this.app.screen.width / this.pixelScale,
        height: this.app.screen.height / this.pixelScale,
      }; // muste be called after renderer.resize() call, apparently
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/Game.test.ts`
Expected: PASS (all).

- [ ] **Step 7: Full suite, typecheck, commit**

Run: `npm run test && npm run typecheck`
Expected: green.

```bash
git add source/engine/app/Game.ts tests/Game.test.ts
git commit -m "Scale the root view by pixelScale and lay out in art px"
```

---

## Task 4: `Input` — view-local tap latching

**Files:**
- Modify: `source/engine/input/Input.ts`
- Test: `tests/Input.test.ts`

**Interfaces:**
- Consumes: pixi's `FederatedPointerEvent.getLocalPosition(container)` (inverse of the container's world transform — divides the root scale out).
- Produces: `input.tapPosition` in view-local art px (same `Vector` accessor, new coordinate space). `playerSystem`'s camera-relative tap math keeps its shape (it consumes art px after Task 11).

- [ ] **Step 1: Update the fake view and write the failing tests**

In `tests/Input.test.ts`, replace the `createView` helper with a version whose events carry `getLocalPosition` (mirroring pixi: computed from the live `global` at call time) and which represents a scaled root:

```ts
// Input's pixi surface is `view.on`/`view.off` plus per-event
// `getLocalPosition`, so a recording fake stands in for a real container.
// `scale` mimics the pixelScale root transform that getLocalPosition inverts.
function createView() {
  let handlers: Record<string, Array<(event: unknown) => void>> = {};

  return {
    handlers,
    scale: 2,
    on(event: string, handler: (event: unknown) => void) {
      (handlers[event] ??= []).push(handler);

      return this;
    },
    off(event: string, handler: (event: unknown) => void) {
      handlers[event] = (handlers[event] ?? []).filter((existing) => existing !== handler);

      return this;
    },
    // Simulates pixi dispatching 'pointertap' and returns the event object so
    // tests can mutate it afterwards (pixi reuses federated events).
    tap(x: number, y: number) {
      let event = {
        global: {x, y},
        // Mirrors pixi: view-local is derived from the live `global` at call
        // time by inverting the view's world transform.
        getLocalPosition(view: {scale: number}) {
          return {x: this.global.x / view.scale, y: this.global.y / view.scale};
        },
      };

      for (let handler of handlers.pointertap ?? []) {
        handler(event);
      }

      return event;
    },
  };
}
```

Then update the tap expectations in the `describe('Input taps')` block (the fake view's scale is 2, so latched positions halve):

- In `'a tap is instantaneous...'`: after `view.tap(10, 20)` expect `tapPosition.x` `5` and `tapPosition.y` `10`.
- In `'multiple taps in one step collapse to one edge, last position wins'`: after `view.tap(1, 2); view.tap(3, 4)` expect `tapPosition.x` `1.5` and `tapPosition.y` `2`.
- In `'tapPosition is the tap-time position...'`: after `view.tap(10, 20)` and mutating `event.global` to 999s, expect `5` / `10`.

And add one new test to the same block, after `'a tap is instantaneous...'`:

```ts
  test('tapPosition is view-local: the root scale is divided out at latch time', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(10, 20);
    input.update();

    expect(input.tapPosition.x).toBe(10 / view.scale);
    expect(input.tapPosition.y).toBe(20 / view.scale);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Input.test.ts`
Expected: FAIL — the tap tests still latch `event.global` (10/20 instead of 5/10).

- [ ] **Step 3: Latch the local position**

In `source/engine/input/Input.ts`:

3a. Replace the `handlePointerTap` closure inside `attach` (it closes over the `view` parameter):

```ts
    let handlePointerTap = (event: pixi.FederatedPointerEvent) => {
      // Multiple taps in one frame collapse to one, last position wins. Copy
      // the position: pixi reuses federated event objects after handlers return.
      let local = event.getLocalPosition(view);

      this.#hasBufferedTap = true;
      this.#bufferedTapPosition.set(local.x, local.y);
    };
```

3b. Update the `tapPosition` doc comment:

```ts
  /**
   * Position of the last latched tap, in view-local coordinates (art px — the
   * root pixelScale transform is already divided out). Changes only at the
   * step boundary, so a pointer move between the tap and the next `update()`
   * cannot retarget it.
   */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/Input.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add source/engine/input/Input.ts tests/Input.test.ts
git commit -m "Latch taps in view-local art px"
```

---

## Task 5: `graphicsSystem` — unrounded sprite positions

`roundPixels: true` (already set at `Application.init`) snaps each object's final render position to whole device px. Keeping game-side `Math.round` would snap to whole *art* px — `pixelScale`× coarser movement than today, contradicting spec §2's granularity promise.

**Files:**
- Modify: `source/game/graphicsSystem.ts:41-42`
- Test: `tests/graphicsSystem.test.ts`

**Interfaces:**
- Consumes: existing `MotionComponent`/`GraphicsComponent`/`CameraComponent` fields.
- Produces: `sprite.view.position` carries fractional art positions through; the renderer's `roundPixels` owns device-px snapping.

- [ ] **Step 1: Write the failing test**

Append to the `describe('graphicsSystem sprite lifecycle')` block in `tests/graphicsSystem.test.ts` (same wiring as the `onUpdate` test in that file):

```ts
  test('sprite positions pass through unrounded: roundPixels owns device-px snapping', () => {
    let sprite = createSpriteStub();
    let map = {
      addToLayer: vi.fn(),
      removeFromLayer: vi.fn(),
      topLayerIndex: 2,
      view: {x: 0, y: 0},
    };
    let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
    let cameraEntity = new Entity({
      components: [new CameraComponent({position: new Vector(0.75, 0)})],
    });
    let player = new Entity({
      components: [
        new MotionComponent({position: new Vector(1.25, 2.5), velocity: new Vector(0, 0)}),
        stubComponent(GraphicsComponent, {sprite, boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(levelQuery)
          .addEntityQuery(cameraQuery)
          .addSystem(graphicsSystem)
          .addEntity(level)
          .addEntity(cameraEntity)
          .addEntity(player);
      },
    });

    world.start();
    world.update({deltaTime: 1} as unknown as pixi.Ticker);

    expect(sprite.view.position.x).toBe(0.5);
    expect(sprite.view.position.y).toBe(2.5);

    world.stop();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graphicsSystem.test.ts`
Expected: FAIL — positions come out rounded (1 and 3, or 1 and 2).

- [ ] **Step 3: Drop the rounding**

In `source/game/graphicsSystem.ts`, replace:

```ts
      // we add the sprite to the map view, and positions are relative to a parent container
      sprite.view.position.x = Math.round(motion.position.x - cameraPosition.x - map.view.x);
      sprite.view.position.y = Math.round(motion.position.y - cameraPosition.y - map.view.y);
```

with:

```ts
      // we add the sprite to the map view, and positions are relative to a parent container;
      // fractional art positions pass through raw — the renderer's roundPixels snaps them to
      // whole device px at render time, keeping today's 1-device-px movement granularity
      sprite.view.position.x = motion.position.x - cameraPosition.x - map.view.x;
      sprite.view.position.y = motion.position.y - cameraPosition.y - map.view.y;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graphicsSystem.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add source/game/graphicsSystem.ts tests/graphicsSystem.test.ts
git commit -m "Let roundPixels own device-px snapping of entity sprites"
```

---

## Task 6: Spike — on-screen proof at scale > 1

Manual verification of what code reading cannot prove, pinned before the asset/UI work. Today's 1:1 rendering has never exercised the NEAREST filter or the scale transform; this spike runs the *current ×4 assets* under `pixelScale: 2` (everything renders 2× too big and taps mis-target — both expected and irrelevant to what is being checked).

**Files:**
- Temporarily modify: `source/game/game.ts` (reverted at the end of this task; nothing committed).

- [ ] **Step 1: Force a scale > 1**

In `source/game/game.ts`, add a temporary option to the `new Game({...})` call:

```ts
export const game = new Game({
  choosePixelScale: () => 2, // TEMPORARY spike override — do not commit
  focusKeys: {
```

- [ ] **Step 2: Run and inspect the main menu**

Run: `npm run develop`, open `http://localhost:5000`.

Checklist (main menu + Options modal):

- Bitmap-font text ("Somewhere", buttons) renders as crisp square blocks — no blur, no smearing (NEAREST on font pages under the scale transform).
- Button/banner/text-input nine-slice corners and edges render as crisp blocks at 2× their usual thickness (border × scale) with no seams at the slice boundaries.
- Tab/arrow keys: the focus ring draws as a crisp ring around widgets (nine-slice under scale).
- The toggle in Options renders as crisp blocks.

- [ ] **Step 3: Inspect the world**

Click New Game (the button is clickable even though world taps mis-target — use WASD to move).

- Tileset and character render as crisp blocks at 2× (NEAREST on sheet pages).
- Walk diagonally (W+D held): the character carries fractional positions (post-Task-5) — verify it still renders as clean uniform blocks each frame, never half-shifted or shimmering (`roundPixels` snapping to device px).
- Walk into a wall: the spark popup animates upward smoothly with clean blocks.

- [ ] **Step 4: Revert the override**

```bash
git checkout -- source/game/game.ts
```

Nothing is committed in this task. If any check fails, STOP — re-read spec §2 and fix the engine tasks before proceeding; do not paper over rendering artifacts in later tasks.

---

## Task 7: Migration helpers library (`fast-png` + guards)

**Files:**
- Modify: `package.json` (devDependency)
- Create: `scripts/asset-migration.mjs`
- Test: `tests/assetMigration.test.ts`

**Interfaces:**
- Consumes: nothing (pure data-in/data-out; `fast-png` is used only by the CLI/generators, not by this lib).
- Produces (all exported from `scripts/asset-migration.mjs`; `RawImage` is `{width, height, channels, data: Uint8Array}`):
  - `assertUniformBlocks(image: RawImage, block: number, label: string): void`
  - `downscaleNearest(image: RawImage, block: number): RawImage`
  - `divideExact(value: number, divisor: number, label: string): number`
  - `scaleTilesetJson(tileset, divisor)` / `scaleMapJson(map, divisor)` / `scaleCharacterJson(sheet, divisor)` — mutate and return the parsed JSON
  - `scaleFntContent(content: string, factor: number): string`

- [ ] **Step 1: Add the `fast-png` devDependency**

Run from the monorepo root (`D:\projects\apps`):

```bash
npm install --save-dev fast-png --workspace apps/somewhere
```

Expected: `apps/somewhere/package.json` gains `"fast-png": "^x.y.z"` in `devDependencies`. (`fast-png` is maintained under the image-js org; the archived generators already target it.)

- [ ] **Step 2: Write the failing tests**

Create `tests/assetMigration.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {
  assertUniformBlocks,
  divideExact,
  downscaleNearest,
  scaleCharacterJson,
  scaleFntContent,
  scaleMapJson,
  scaleTilesetJson,
} from '../scripts/asset-migration.mjs';

// A 4×2 RGBA image made of two 2×2 blocks: left block all-10s, right all-20s.
function uniformImage() {
  let data = new Uint8Array(4 * 2 * 4);

  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      data.fill(x < 2 ? 10 : 20, (y * 4 + x) * 4, (y * 4 + x) * 4 + 4);
    }
  }

  return {width: 4, height: 2, channels: 4, data};
}

describe('asset migration guards', () => {
  test('assertUniformBlocks accepts exact block-uniform images', () => {
    expect(() => {
      assertUniformBlocks(uniformImage(), 2, 'test.png');
    }).not.toThrow();
  });

  test('assertUniformBlocks rejects a block broken only in the alpha channel', () => {
    let image = uniformImage();

    image.data[3] = 99; // alpha of the top-left texel only

    expect(() => {
      assertUniformBlocks(image, 2, 'test.png');
    }).toThrow('test.png: block at (0, 0) is not uniform in channel 3!');
  });

  test('assertUniformBlocks rejects dimensions that are not block multiples', () => {
    expect(() => {
      assertUniformBlocks({width: 3, height: 2, channels: 4, data: new Uint8Array(24)}, 2, 'test.png');
    }).toThrow('test.png: 3x2 is not a multiple of 2!');
  });

  test('downscaleNearest keeps one texel per block', () => {
    let small = downscaleNearest(uniformImage(), 2);

    expect(small.width).toBe(2);
    expect(small.height).toBe(1);
    expect([...small.data]).toEqual([10, 10, 10, 10, 20, 20, 20, 20]);
  });

  test('divideExact divides multiples and aborts on anything else', () => {
    expect(divideExact(64, 4, 'x')).toBe(16);
    expect(() => divideExact(10, 4, 'map.json tilewidth')).toThrow(
      'map.json tilewidth: 10 is not a multiple of 4!',
    );
  });

  test('scaleTilesetJson divides pixel fields and collision rects, leaves counts and ids alone', () => {
    let tileset = scaleTilesetJson(
      {
        columns: 64,
        tilewidth: 64,
        tileheight: 64,
        imagewidth: 4096,
        imageheight: 4096,
        margin: 0,
        spacing: 0,
        tilecount: 4096,
        tiles: [{id: 64, objectgroup: {objects: [{x: 8, y: 32, width: 48, height: 32}]}}],
      },
      4,
    );

    expect(tileset.tilewidth).toBe(16);
    expect(tileset.imagewidth).toBe(1024);
    expect(tileset.columns).toBe(64);
    expect(tileset.tilecount).toBe(4096);
    expect(tileset.tiles[0].id).toBe(64);
    expect(tileset.tiles[0].objectgroup.objects[0]).toEqual({x: 2, y: 8, width: 12, height: 8});
  });

  test('scaleMapJson divides the tile pixel size, keeps tile counts and GID data', () => {
    let map = scaleMapJson(
      {tilewidth: 64, tileheight: 64, width: 40, height: 40, layers: [{data: [1414]}]},
      4,
    );

    expect(map.tilewidth).toBe(16);
    expect(map.tileheight).toBe(16);
    expect(map.width).toBe(40);
    expect(map.layers[0].data).toEqual([1414]);
  });

  test('scaleCharacterJson divides frame rects', () => {
    let sheet = scaleCharacterJson({frames: {1: {frame: {x: 64, y: 80, w: 64, h: 80}}}}, 4);

    expect(sheet.frames[1].frame).toEqual({x: 16, y: 20, w: 16, h: 20});
  });

  test('scaleFntContent scales metrics (csv values included) and leaves other attributes alone', () => {
    let content = [
      '<info face="monogram" size="48" spacing="4,4" padding="0,0,0,0" outline="0"/>',
      '<common lineHeight="48" base="40" scaleW="1024" scaleH="1024"/>',
      '<char id="97" x="8" y="16" width="20" height="24" xoffset="0" yoffset="4" xadvance="24" page="0"/>',
    ].join('\n');

    let scaled = scaleFntContent(content, 0.25);

    expect(scaled).toContain('size="12"');
    expect(scaled).toContain('spacing="1,1"');
    expect(scaled).toContain('lineHeight="12"');
    expect(scaled).toContain('x="2" y="4" width="5" height="6"');
    expect(scaled).toContain('xadvance="6"');
    expect(scaled).toContain('id="97"');
    expect(scaled).toContain('page="0"');
  });

  test('scaleFntContent guards non-integer results', () => {
    expect(() => scaleFntContent('<char x="10"/>', 0.25)).toThrow(
      'char x: 10 × 0.25 is not an integer!',
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/assetMigration.test.ts`
Expected: FAIL — cannot resolve `../scripts/asset-migration.mjs`.

- [ ] **Step 4: Write the library**

Create `scripts/asset-migration.mjs`:

```js
// Pure helpers for the one-shot ×4 → 1× asset migration (runtime pixel scale,
// T1.5). No file I/O here: everything takes and returns plain data so the
// guards are unit-testable (tests/assetMigration.test.ts). The CLI wrapper is
// scripts/migrate-assets-to-1x.mjs.

/**
 * @typedef {object} RawImage
 * @property {number} width
 * @property {number} height
 * @property {number} channels
 * @property {Uint8Array} data
 */

/**
 * Every baked PNG must be exact uniform block×block squares across all
 * channels, alpha included — the proof that the ÷block downscale is lossless.
 *
 * @param {RawImage} image
 * @param {number} block
 * @param {string} label
 */
export function assertUniformBlocks({width, height, channels, data}, block, label) {
  if (width % block !== 0 || height % block !== 0) {
    throw new Error(`${label}: ${width}x${height} is not a multiple of ${block}!`);
  }

  for (let blockY = 0; blockY < height; blockY += block) {
    for (let blockX = 0; blockX < width; blockX += block) {
      for (let channel = 0; channel < channels; channel++) {
        let reference = data[(blockY * width + blockX) * channels + channel];

        for (let dy = 0; dy < block; dy++) {
          for (let dx = 0; dx < block; dx++) {
            if (data[((blockY + dy) * width + blockX + dx) * channels + channel] !== reference) {
              throw new Error(
                `${label}: block at (${blockX}, ${blockY}) is not uniform in channel ${channel}!`,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Nearest downscale by an integer factor; lossless when the image passed
 * `assertUniformBlocks` (every output texel takes its block's single value).
 *
 * @param {RawImage} image
 * @param {number} block
 * @returns {RawImage}
 */
export function downscaleNearest({width, height, channels, data}, block) {
  let outWidth = width / block;
  let outHeight = height / block;
  let out = new Uint8Array(outWidth * outHeight * channels);

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      for (let channel = 0; channel < channels; channel++) {
        out[(y * outWidth + x) * channels + channel] =
          data[(y * block * width + x * block) * channels + channel];
      }
    }
  }

  return {width: outWidth, height: outHeight, channels, data: out};
}

/**
 * @param {number} value
 * @param {number} divisor
 * @param {string} label
 */
export function divideExact(value, divisor, label) {
  if (value % divisor !== 0) {
    throw new Error(`${label}: ${value} is not a multiple of ${divisor}!`);
  }

  return value / divisor;
}

/**
 * ÷divisor on tileset.json pixel fields: tile/image dimensions, margin/spacing
 * and per-tile collision-rect objects. Ids and counts stay. Mutates and
 * returns the parsed JSON.
 *
 * @param {any} tileset
 * @param {number} divisor
 */
export function scaleTilesetJson(tileset, divisor) {
  for (let key of ['tilewidth', 'tileheight', 'imagewidth', 'imageheight', 'margin', 'spacing']) {
    tileset[key] = divideExact(tileset[key], divisor, `tileset.json ${key}`);
  }

  for (let tile of tileset.tiles ?? []) {
    for (let object of tile.objectgroup?.objects ?? []) {
      for (let key of ['x', 'y', 'width', 'height']) {
        object[key] = divideExact(
          object[key],
          divisor,
          `tileset.json tile ${tile.id} object ${key}`,
        );
      }
    }
  }

  return tileset;
}

/**
 * ÷divisor on map.json pixel fields. `width`/`height` are tile counts and
 * layer GID data is untouched; only the tile pixel size scales. Mutates and
 * returns the parsed JSON.
 *
 * @param {any} map
 * @param {number} divisor
 */
export function scaleMapJson(map, divisor) {
  map.tilewidth = divideExact(map.tilewidth, divisor, 'map.json tilewidth');
  map.tileheight = divideExact(map.tileheight, divisor, 'map.json tileheight');

  return map;
}

/**
 * ÷divisor on character.json frame rects. Animations reference frames by name
 * and are untouched. Mutates and returns the parsed JSON.
 *
 * @param {any} sheet
 * @param {number} divisor
 */
export function scaleCharacterJson(sheet, divisor) {
  for (let [name, {frame}] of Object.entries(sheet.frames)) {
    for (let key of ['x', 'y', 'w', 'h']) {
      frame[key] = divideExact(frame[key], divisor, `character.json frame ${name} ${key}`);
    }
  }

  return sheet;
}

// Numeric attributes scaled per BMFont XML tag — ported from the archived
// $/scripts-2026-07-02/scale-fnt.mjs, plus the migration's integer guard.
const SCALED_FNT_ATTRIBUTES = {
  info: ['size', 'spacing', 'padding', 'outline'],
  common: ['lineHeight', 'base', 'scaleW', 'scaleH'],
  char: ['x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance'],
  kerning: ['amount'],
};

/**
 * Scale every numeric metric of a BMFont .fnt (XML) file by `factor`; throws
 * if any scaled value does not land on an integer.
 *
 * @param {string} content
 * @param {number} factor
 */
export function scaleFntContent(content, factor) {
  let scaleValue = (value, label) => {
    let scaled = Number(value) * factor;

    if (!Number.isInteger(scaled)) {
      throw new Error(`${label}: ${value} × ${factor} is not an integer!`);
    }

    return String(scaled);
  };

  let eol = content.includes('\r\n') ? '\r\n' : '\n';

  return content
    .split(/\r?\n/)
    .map((line) => {
      let tagMatch = line.match(/<(\w+)\b/);
      let attributes = tagMatch && SCALED_FNT_ATTRIBUTES[tagMatch[1]];

      if (!attributes) {
        return line;
      }

      let scaledLine = line;

      for (let attribute of attributes) {
        scaledLine = scaledLine.replace(
          new RegExp(`(\\b${attribute}=")([^"]+)(")`),
          (_, prefix, value, suffix) =>
            `${prefix}${value
              .split(',')
              .map((part) => scaleValue(part, `${tagMatch[1]} ${attribute}`))
              .join(',')}${suffix}`,
        );
      }

      return scaledLine;
    })
    .join(eol);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/assetMigration.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: green (the `.mjs` lib is linted; `allowJs` covers the test's import).

```bash
git add package.json ../../package-lock.json scripts/asset-migration.mjs tests/assetMigration.test.ts
git commit -m "Add audited asset-migration helpers on fast-png"
```

---

## Task 8: Migration CLI — backup, audit, downscale, numeric ÷4

**Files:**
- Create: `scripts/migrate-assets-to-1x.mjs`

**Interfaces:**
- Consumes: everything from `scripts/asset-migration.mjs`; `fast-png` `decode`/`encode`.
- Produces: the one-shot CLI `node scripts/migrate-assets-to-1x.mjs` (executed in Task 10 — **do not run it in this task**).

- [ ] **Step 1: Write the CLI**

Create `scripts/migrate-assets-to-1x.mjs`:

```js
/* eslint-disable no-console -- one-shot migration script feedback */
// One-shot ×4 → 1× migration of public/ (runtime pixel scale, T1.5), in spec
// order: backup, audit, lossless downscale, numeric ÷4. NOT idempotent by
// design — the ×4-bake preconditions abort a second run loudly. Afterwards run
// the generators and delete the standalone UI PNGs (plan Task 10):
//   node scripts/migrate-assets-to-1x.mjs
//   node scripts/generate-ui-atlas.mjs
//   node scripts/generate-spark-assets.mjs

import {decode, encode} from 'fast-png';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  assertUniformBlocks,
  downscaleNearest,
  scaleCharacterJson,
  scaleFntContent,
  scaleMapJson,
  scaleTilesetJson,
} from './asset-migration.mjs';

const BLOCK = 4;

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let assetsDir = fileURLToPath(new URL('./assets/', import.meta.url));

/** @param {string} name */
function readImage(name) {
  let png = decode(readFileSync(join(publicDir, name)));

  if (png.depth !== 8 || png.channels !== 4) {
    throw new Error(
      `${name}: expected 8-bit RGBA, got depth ${png.depth} with ${png.channels} channels!`,
    );
  }

  return {width: png.width, height: png.height, channels: 4, data: png.data};
}

/**
 * @param {string} path
 * @param {{width: number, height: number, data: Uint8Array}} image
 */
function writeImage(path, {width, height, data}) {
  writeFileSync(path, encode({width, height, data, channels: 4}));
  console.log(`wrote ${path} (${width}x${height})`);
}

// —— 1. Backup first, mandatory: outside the repo and the Docker build
// context. An existing backup means a previous (possibly partial) run already
// touched public/ — never overwrite the pristine pre-migration copy.
let backupDir = join(tmpdir(), 'somewhere-public-backup');

if (existsSync(backupDir)) {
  throw new Error(
    `Backup directory ${backupDir} already exists — this migration ran before. Restore public/ from git (the primary rollback) or from the backup, delete the directory, then re-run!`,
  );
}

cpSync(publicDir, backupDir, {recursive: true});
console.log(`backed up public/ to ${backupDir}`);

// —— 2. Preconditions (the assets are still the ×4 bake) and the block audit.
let map = JSON.parse(readFileSync(join(publicDir, 'map.json'), 'utf8'));
let tileset = JSON.parse(readFileSync(join(publicDir, 'tileset.json'), 'utf8'));
let character = JSON.parse(readFileSync(join(publicDir, 'character.json'), 'utf8'));
let fonts = ['monogram.fnt', 'monogram-outline.fnt'].map((name) => ({
  name,
  content: readFileSync(join(publicDir, name), 'utf8'),
}));

if (map.tilewidth !== 64 || tileset.tilewidth !== 64) {
  throw new Error(
    `Expected the ×4 bake (tilewidth 64), found map ${map.tilewidth} / tileset ${tileset.tilewidth} — already migrated?`,
  );
}

for (let {name, content} of fonts) {
  if (!content.includes('size="48"')) {
    throw new Error(`${name}: expected the ×4 bake (size="48") — already migrated?`);
  }
}

let downscaleTargets = [
  'tileset.png',
  'character.png',
  'monogram_0.png',
  'monogram-outline_0.png',
  'banner.png',
  'banner-hover.png',
  'banner-active.png',
];
let images = new Map(downscaleTargets.map((name) => [name, readImage(name)]));

for (let [name, image] of images) {
  assertUniformBlocks(image, BLOCK, name);
}

console.log(`audit passed: ${downscaleTargets.length} PNGs are uniform ${BLOCK}x${BLOCK} blocks`);

// —— 3. Downscale ÷4 (nearest, lossless given the audit). The hand-made 1×
// banners become generator source art in scripts/assets/ — public/ keeps only
// shipped assets (the banner ships inside the ui atlas from Task 9 on).
mkdirSync(assetsDir, {recursive: true});

for (let [name, image] of images) {
  let isBanner = name.startsWith('banner');

  writeImage(join(isBanner ? assetsDir : publicDir, name), downscaleNearest(image, BLOCK));

  if (isBanner) {
    rmSync(join(publicDir, name));
  }
}

// —— 4. Numeric ÷4 with the divisibility guard.
writeFileSync(join(publicDir, 'map.json'), `${JSON.stringify(scaleMapJson(map, BLOCK), null, 2)}\n`);
writeFileSync(
  join(publicDir, 'tileset.json'),
  `${JSON.stringify(scaleTilesetJson(tileset, BLOCK), null, 2)}\n`,
);
writeFileSync(
  join(publicDir, 'character.json'),
  `${JSON.stringify(scaleCharacterJson(character, BLOCK), null, 2)}\n`,
);

for (let {name, content} of fonts) {
  writeFileSync(join(publicDir, name), scaleFntContent(content, 1 / BLOCK));
  console.log(`scaled ${name} by 1/${BLOCK}`);
}

console.log('numeric ÷4 done — now run the generators (see the header comment)');
```

- [ ] **Step 2: Verify it lints and typechecks — do not run it**

Run: `npm run lint && npm run typecheck`
Expected: green. The script's behavior is covered by Task 7's unit tests plus Task 10's supervised execution with verification.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-assets-to-1x.mjs
git commit -m "Add one-shot 4x-to-1x asset migration script"
```

---

## Task 9: Generators — `ui` atlas and 1× spark

**Files:**
- Create: `scripts/generate-ui-atlas.mjs`
- Create: `scripts/generate-spark-assets.mjs`

**Interfaces:**
- Consumes: `scripts/assets/banner.png` (1×, written by Task 8's CLI when it runs in Task 10); `fast-png`.
- Produces:
  - `public/ui.png` + `public/ui.json` — 15 frames named exactly like today's bundle aliases: `banner`, `button-normal`, `button-hovered`, `button-active`, `button-disabled`, `toggle-unchecked`, `toggle-checked`, `toggle-hovered`, `toggle-hovered-checked`, `toggle-disabled`, `toggle-disabled-checked`, `text-input-normal`, `text-input-hovered`, `text-input-disabled`, `focus-ring`. Nine-slice frames carry `borders` (art px): buttons `{left: 1, top: 2, right: 1, bottom: 2}` (active variant `bottom: 1`), banner `{left: 3, top: 1, right: 3, bottom: 3}`, text-inputs and focus-ring `{left: 1, top: 1, right: 1, bottom: 1}`. Toggles carry none (plain sprites). No `meta.scale`.
  - `public/spark.png` (4×4) + `public/spark.json` (frame `1`, all eight directional animation keys → `['1']`).

- [ ] **Step 1: Write the atlas generator**

Create `scripts/generate-ui-atlas.mjs`:

```js
// Generate the 1×-art-px UI atlas: public/ui.png + public/ui.json. One sheet
// replaces the standalone UI PNGs (button ×4, toggle ×6, text-input ×3,
// focus-ring, banner); nine-slice insets ship as per-frame `borders` in art px
// (pixi passes them straight to texture.defaultBorders) and toggle frames are
// plain sprites with none. The per-widget render code is ported from the
// archived $/scripts-2026-07-02/ generators at BLOCK = 1 — the runtime
// pixelScale now provides the chunky-block look the old ×4 bake hard-coded.
// The banner frame is blitted from the hand-made 1× source art in
// scripts/assets/banner.png (put there by scripts/migrate-assets-to-1x.mjs).
//
// Idempotent — re-running overwrites both files with identical bytes.
// Usage: node scripts/generate-ui-atlas.mjs

import {decode, encode} from 'fast-png';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHANNELS = 4; // RGBA
const GAP = 1; // transparent px between frames — insurance against sampling bleed

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let assetsDir = fileURLToPath(new URL('./assets/', import.meta.url));

// Union of the archived generators' palettes (sampled from the banner art).
const palette = {
  transparent: [0, 0, 0, 0],

  navy: [29, 43, 83, 255],
  navyBright: [40, 60, 115, 255],
  navyMuted: [58, 64, 82, 255],

  border: [194, 195, 199, 255],
  borderBright: [223, 224, 228, 255],
  borderMuted: [120, 122, 130, 255],

  icon: [233, 234, 238, 255],
  iconMuted: [146, 148, 156, 255],

  face: [50, 70, 128, 255],
  faceHover: [68, 92, 160, 255],
  faceActive: [40, 58, 110, 255],
  faceMuted: [58, 64, 82, 255],

  highlight: [86, 112, 180, 255],
  highlightHover: [104, 134, 205, 255],

  side: [18, 27, 52, 255],
  sideHover: [24, 36, 72, 255],
  sideMuted: [32, 36, 48, 255],

  ringBlue: [41, 173, 255, 255],
};

// Button: a 3×5 extruded "slab" — border with clipped corners, top highlight,
// darker side band; the active variant drops the face by one px (topGap) and
// removes the band so it reads as pushed in.
const SLAB_W = 3;
const SLAB_H = 5;

function buildSlab({face, band, border, highlight, topGap, bandRows}) {
  let top = topGap;
  let bottom = SLAB_H - 1;
  let cells = [];

  for (let row = 0; row < SLAB_H; row++) {
    let cols = [];

    for (let col = 0; col < SLAB_W; col++) {
      let isEdgeRow = row === top || row === bottom;
      let isEdgeCol = col === 0 || col === SLAB_W - 1;
      let color;

      if (row < top || (isEdgeRow && isEdgeCol)) {
        color = palette.transparent; // gap above the slab, or a clipped (rounded) corner
      } else if (isEdgeRow || isEdgeCol) {
        color = border;
      } else if (row >= bottom - bandRows) {
        color = band;
      } else if (highlight !== undefined && row === top + 1) {
        color = highlight;
      } else {
        color = face;
      }

      cols.push(color);
    }

    cells.push(cols);
  }

  return cells;
}

// Toggle: an 8×8 box — 1-px border ring, body fill, and for checked variants a
// centered 4×4 icon (rows/cols 2..5).
const TOGGLE_GRID = 8;

function buildToggle({border, body, icon}) {
  let cells = [];

  for (let row = 0; row < TOGGLE_GRID; row++) {
    let cols = [];

    for (let col = 0; col < TOGGLE_GRID; col++) {
      let isBorder = row === 0 || row === TOGGLE_GRID - 1 || col === 0 || col === TOGGLE_GRID - 1;
      let isIcon = icon !== undefined && row >= 2 && row <= 5 && col >= 2 && col <= 5;

      cols.push(isBorder ? border : isIcon ? icon : body);
    }

    cells.push(cols);
  }

  return cells;
}

// Text input: a 3×3 box — 1-px border ring with square corners around a fill.
function buildBox({body, border}) {
  let cells = [];

  for (let row = 0; row < 3; row++) {
    let cols = [];

    for (let col = 0; col < 3; col++) {
      let isBorder = row === 0 || row === 2 || col === 0 || col === 2;

      cols.push(isBorder ? border : body);
    }

    cells.push(cols);
  }

  return cells;
}

// Focus ring: a hollow 3×3 1-px ring with clipped (slightly rounded) corners.
function buildRing() {
  let cells = [];

  for (let row = 0; row < 3; row++) {
    let cols = [];

    for (let col = 0; col < 3; col++) {
      let isEdgeRow = row === 0 || row === 2;
      let isEdgeCol = col === 0 || col === 2;

      if (isEdgeRow && isEdgeCol) {
        cols.push(palette.transparent); // clipped corner
      } else if (isEdgeRow || isEdgeCol) {
        cols.push(palette.ringBlue);
      } else {
        cols.push(palette.transparent); // hollow center
      }
    }

    cells.push(cols);
  }

  return cells;
}

// Render a cell grid at 1 art px per cell.
function renderCells(cells) {
  let height = cells.length;
  let width = cells[0].length;
  let data = new Uint8Array(width * height * CHANNELS);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      data.set(cells[row][col], (row * width + col) * CHANNELS);
    }
  }

  return {width, height, data};
}

function loadBanner() {
  let png = decode(readFileSync(join(assetsDir, 'banner.png')));

  if (png.depth !== 8 || png.channels !== 4) {
    throw new Error(
      `banner.png: expected 8-bit RGBA, got depth ${png.depth} with ${png.channels} channels!`,
    );
  }

  return {width: png.width, height: png.height, data: png.data};
}

const BUTTON_BORDERS = {left: 1, top: 2, right: 1, bottom: 2};
const BUTTON_ACTIVE_BORDERS = {left: 1, top: 2, right: 1, bottom: 1};
const BOX_BORDERS = {left: 1, top: 1, right: 1, bottom: 1};
const BANNER_BORDERS = {left: 3, top: 1, right: 3, bottom: 3};

let frames = [
  {name: 'banner', image: loadBanner(), borders: BANNER_BORDERS},
  {
    name: 'button-normal',
    image: renderCells(
      buildSlab({
        face: palette.face,
        band: palette.side,
        border: palette.border,
        highlight: palette.highlight,
        topGap: 0,
        bandRows: 1,
      }),
    ),
    borders: BUTTON_BORDERS,
  },
  {
    name: 'button-hovered',
    image: renderCells(
      buildSlab({
        face: palette.faceHover,
        band: palette.sideHover,
        border: palette.borderBright,
        highlight: palette.highlightHover,
        topGap: 0,
        bandRows: 1,
      }),
    ),
    borders: BUTTON_BORDERS,
  },
  {
    name: 'button-active',
    image: renderCells(
      buildSlab({
        face: palette.faceActive,
        band: palette.side,
        border: palette.border,
        topGap: 1,
        bandRows: 0,
      }),
    ),
    borders: BUTTON_ACTIVE_BORDERS,
  },
  {
    name: 'button-disabled',
    image: renderCells(
      buildSlab({
        face: palette.faceMuted,
        band: palette.sideMuted,
        border: palette.borderMuted,
        topGap: 0,
        bandRows: 1,
      }),
    ),
    borders: BUTTON_BORDERS,
  },
  {
    name: 'toggle-unchecked',
    image: renderCells(buildToggle({border: palette.border, body: palette.navy})),
  },
  {
    name: 'toggle-checked',
    image: renderCells(buildToggle({border: palette.border, body: palette.navy, icon: palette.icon})),
  },
  {
    name: 'toggle-hovered',
    image: renderCells(buildToggle({border: palette.borderBright, body: palette.navyBright})),
  },
  {
    name: 'toggle-hovered-checked',
    image: renderCells(
      buildToggle({border: palette.borderBright, body: palette.navyBright, icon: palette.icon}),
    ),
  },
  {
    name: 'toggle-disabled',
    image: renderCells(buildToggle({border: palette.borderMuted, body: palette.navyMuted})),
  },
  {
    name: 'toggle-disabled-checked',
    image: renderCells(
      buildToggle({border: palette.borderMuted, body: palette.navyMuted, icon: palette.iconMuted}),
    ),
  },
  {
    name: 'text-input-normal',
    image: renderCells(buildBox({body: palette.navy, border: palette.border})),
    borders: BOX_BORDERS,
  },
  {
    name: 'text-input-hovered',
    image: renderCells(buildBox({body: palette.navyBright, border: palette.borderBright})),
    borders: BOX_BORDERS,
  },
  {
    name: 'text-input-disabled',
    image: renderCells(buildBox({body: palette.navyMuted, border: palette.borderMuted})),
    borders: BOX_BORDERS,
  },
  {name: 'focus-ring', image: renderCells(buildRing()), borders: BOX_BORDERS},
];

// Single-column shelf packing: trivially correct, and at art-px sizes the
// whole sheet stays tiny (146 × ~120 px).
let sheetWidth = Math.max(...frames.map(({image}) => image.width));
let sheetHeight = frames.reduce((sum, {image}) => sum + image.height + GAP, -GAP);
let sheet = new Uint8Array(sheetWidth * sheetHeight * CHANNELS);
let framesJson = {};
let y = 0;

for (let {name, image, borders} of frames) {
  for (let row = 0; row < image.height; row++) {
    sheet.set(
      image.data.subarray(row * image.width * CHANNELS, (row + 1) * image.width * CHANNELS),
      (y + row) * sheetWidth * CHANNELS,
    );
  }

  framesJson[name] = {frame: {x: 0, y, w: image.width, h: image.height}, ...(borders && {borders})};
  y += image.height + GAP;
}

writeFileSync(
  join(publicDir, 'ui.png'),
  encode({width: sheetWidth, height: sheetHeight, data: sheet, channels: CHANNELS}),
);
writeFileSync(
  join(publicDir, 'ui.json'),
  `${JSON.stringify({frames: framesJson, meta: {image: 'ui.png'}}, null, 2)}\n`,
);
// eslint-disable-next-line no-console -- one-shot generator script feedback
console.log(`wrote public/ui.png (${sheetWidth}x${sheetHeight}) and public/ui.json (${frames.length} frames)`);
```

- [ ] **Step 2: Write the spark generator**

Create `scripts/generate-spark-assets.mjs`:

```js
// Generates public/spark.png + public/spark.json — a warm-yellow diamond at
// its true art-px size (4×4; the runtime pixelScale reproduces the old 16×16
// device-px footprint). The old sub-art-pixel diamond detail is gone — one of
// the migration's two flagged deliberate visual changes.
//
// The eight duplicated animation keys are load-bearing: graphicsSystem picks a
// sprite name from velocity direction and Sprite.show throws on a missing name
// (see the TODO in source/game/wallHitPopupSystem.ts).
//
// Idempotent — re-running overwrites both files with identical bytes.
// Usage: node scripts/generate-spark-assets.mjs

import {encode} from 'fast-png';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SIZE = 4; // art px
const CHANNELS = 4; // RGBA

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));

let center = (SIZE - 1) / 2;
let radius = SIZE / 2;
let data = new Uint8Array(SIZE * SIZE * CHANNELS);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (Math.abs(x - center) + Math.abs(y - center) <= radius) {
      data.set([255, 220, 40, 255], (y * SIZE + x) * CHANNELS);
    }
  }
}

let spriteNames = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

writeFileSync(join(publicDir, 'spark.png'), encode({width: SIZE, height: SIZE, data, channels: CHANNELS}));
writeFileSync(
  join(publicDir, 'spark.json'),
  `${JSON.stringify(
    {
      frames: {1: {frame: {x: 0, y: 0, w: SIZE, h: SIZE}}},
      meta: {image: 'spark.png'},
      animations: Object.fromEntries(spriteNames.map((name) => [name, ['1']])),
    },
    null,
    2,
  )}\n`,
);
// eslint-disable-next-line no-console -- one-shot generator script feedback
console.log(`wrote public/spark.png (${SIZE}x${SIZE}) and public/spark.json`);
```

- [ ] **Step 3: Lint and commit — do not run the generators yet**

(`generate-ui-atlas.mjs` needs `scripts/assets/banner.png`, which only exists after the migration runs in Task 10.)

Run: `npm run lint`
Expected: green.

```bash
git add scripts/generate-ui-atlas.mjs scripts/generate-spark-assets.mjs
git commit -m "Add 1x UI atlas and spark generators"
```

---

## Task 10: Execute the migration and commit the 1× assets

**Files:**
- Regenerated: `public/{tileset,character,monogram_0,monogram-outline_0}.png`, `public/{map,tileset,character}.json`, `public/{monogram,monogram-outline}.fnt`, `public/spark.{png,json}`
- Created: `public/ui.png`, `public/ui.json`, `scripts/assets/banner{,-hover,-active}.png`
- Deleted: 14 standalone UI PNGs from `public/`, 3 banner PNGs moved out of `public/`

- [ ] **Step 1: Run the migration and the generators, in order**

```bash
node scripts/migrate-assets-to-1x.mjs
node scripts/generate-ui-atlas.mjs
node scripts/generate-spark-assets.mjs
```

Expected output: backup path logged, `audit passed: 7 PNGs...`, one `wrote ...` line per image, `scaled monogram.fnt...` ×2, then the two generator `wrote ...` lines. Any thrown guard error = STOP, restore with `git checkout -- public/` and investigate.

- [ ] **Step 2: Verify dimensions and metrics**

```bash
node -e "const fs=require('fs');const dim=f=>{const b=fs.readFileSync('public/'+f);return b.readUInt32BE(16)+'x'+b.readUInt32BE(20)};for(const f of ['tileset.png','character.png','monogram_0.png','monogram-outline_0.png','ui.png','spark.png'])console.log(f,dim(f))"
```

Expected: `tileset.png 1024x1024`, `character.png 48x80`, `monogram_0.png 256x256`, `monogram-outline_0.png 256x256`, `ui.png 146x120`, `spark.png 4x4`.

```bash
node -e "const m=require('./public/map.json'),t=require('./public/tileset.json'),c=require('./public/character.json'),u=require('./public/ui.json');console.log('map',m.tilewidth,m.tileheight,m.width,m.height);console.log('tileset',t.tilewidth,t.imagewidth,t.tiles[0].objectgroup.objects[0]);console.log('character frame 1',c.frames['1'].frame);console.log('ui frames',Object.keys(u.frames).length,'banner',u.frames.banner.frame,u.frames.banner.borders)"
```

Expected: `map 16 16 40 40`; `tileset 16 1024 {height: 8, ..., width: 12, x: 2, y: 8}`; `character frame 1 {x: 0, y: 0, w: 16, h: 20}`; `ui frames 15 banner {x: 0, y: 0, w: 146, h: 26} {left: 3, top: 1, right: 3, bottom: 3}`.

- [ ] **Step 3: Verify the monogram un-bake against the `$/public_1x` ground truth**

Run in Git Bash (the `\$` escape keeps the literal `$` directory name; in PowerShell, put the whole `-e` argument in single quotes and drop the backslash):

```bash
node -e "const f=require('fs');const n=s=>s.replace(/\r\n/g,'\n').trim();const a=n(f.readFileSync('public/monogram.fnt','utf8'));const b=n(f.readFileSync('./\$/public_1x/monogram.fnt','utf8'));console.log('monogram.fnt matches public_1x ground truth:',a===b)"
```

Expected: `true`. Also spot-check both fonts: `size="12"`, `lineHeight="12"`, `spacing="1,1"` in `public/monogram.fnt`; `size="12"`, `outline="1"` in `public/monogram-outline.fnt`.

- [ ] **Step 4: Delete the replaced standalone UI PNGs**

```bash
git rm public/button-normal.png public/button-hovered.png public/button-active.png public/button-disabled.png public/toggle-unchecked.png public/toggle-checked.png public/toggle-hovered.png public/toggle-hovered-checked.png public/toggle-disabled.png public/toggle-disabled-checked.png public/text-input-normal.png public/text-input-hovered.png public/text-input-disabled.png public/focus-ring.png
```

- [ ] **Step 5: Verify the suite still passes and commit everything**

Run: `npm run test`
Expected: green (tests never load real assets).

```bash
git add public/ scripts/assets/
git status
```

Expected status: 3 banner PNGs deleted from `public/` + created under `scripts/assets/`, 14 UI PNGs deleted, `ui.png`/`ui.json` new, the rest modified.

```bash
git commit -m "Migrate public assets to 1x art-pixel scale"
```

Note: from this commit until Task 13 lands, the dev server renders a broken mix (1× assets under ×4-era game code) — expected.

---

## Task 11: World constants become art-px literals

**Files:**
- Modify: `source/game/motionSystem.ts`, `source/game/playerPool.ts`, `source/game/playerSystem.ts`, `source/game/wallHitPopupSystem.ts`
- Test: `tests/playerSystem.test.ts` (updated expectations); `tests/motionSystem.test.ts` (no changes — verify green)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MAX_SPEED = 1` (still exported from `motionSystem.ts`; `playerSystem` keeps importing it); all other constants below are private literals.

- [ ] **Step 1: Update the failing test first**

In `tests/playerSystem.test.ts`, in the test `'a tap sets the target from tapPosition plus camera offset and zeroes velocity'`, replace the comment and the two expectations:

```ts
    // 10 + 100 - 8, 20 + 50 - 15 (camera at (100, 50), bounding-box offsets).
    expect(motion.target?.x).toBe(102);
    expect(motion.target?.y).toBe(55);
```

Run: `npx vitest run tests/playerSystem.test.ts`
Expected: FAIL — that one test (78/10 vs 102/55). The `MAX_SPEED` assertions reference the symbol and track automatically.

- [ ] **Step 2: Apply the constant table**

`source/game/motionSystem.ts`:
- `export const MAX_SPEED = 4;` → `export const MAX_SPEED = 1;`
- Both snap thresholds: `Math.abs(motion.velocity.x) < 0.1` → `< 0.025` and `Math.abs(motion.velocity.y) < 0.1` → `< 0.025`.
- In the long TODO comment: `Tiles are grid-aligned (64px)` → `Tiles are grid-aligned (16 art px)`, and `a tile boundingBox larger than its 64px cell` → `a tile boundingBox larger than its 16-art-px cell` (keep the rest of the comment intact).

`source/game/playerPool.ts`:

```ts
const initialX = 16 * 9;
const initialY = 16 * 10;
```

and

```ts
          boundingBox: new pixi.Rectangle(0, 10, 16, 10),
```

`source/game/playerSystem.ts` (values and their TODO comments):

```ts
        motion.target = new Vector(
          // TODO: 8 comes from the bounding box; extract it as a constant instead of using the value directly
          input.tapPosition.x + cameraPosition.x - 8,
          // TODO: 15 comes from the bounding box; extract it as a constant instead of using the value directly
          input.tapPosition.y + cameraPosition.y - 15,
        );
```

`source/game/wallHitPopupSystem.ts`:
- In the big TODO comment: `(public/spark.json duplicates the same 16x16 frame` → `(public/spark.json duplicates the same 4x4 frame`.
- `// The spark spritesheet frame is 16x16 (see public/spark.json).` → `// The spark spritesheet frame is 4x4 (see public/spark.json).`
- `const SPARK_SIZE = 16;` → `const SPARK_SIZE = 4;`
- Float-up tween: `to: {y: y - 24},` → `to: {y: y - 6},`

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/playerSystem.test.ts tests/motionSystem.test.ts`
Expected: PASS. (`motionSystem.test.ts` passes unchanged — its stub-map tests set `velocity` directly and never use `motion.target`, so neither `MAX_SPEED` nor the snap threshold appears in an assertion.)

- [ ] **Step 4: Full suite and commit**

Run: `npm run test`
Expected: green.

```bash
git add source/game/motionSystem.ts source/game/playerPool.ts source/game/playerSystem.ts source/game/wallHitPopupSystem.ts tests/playerSystem.test.ts
git commit -m "Author world constants in art px"
```

---

## Task 12: `cameraSystem` — art-px viewport, device-px snap

**Files:**
- Modify: `source/game/cameraSystem.ts`

**Interfaces:**
- Consumes: `game.pixelScale` (the game-code read the spec designates), `game.app.canvas` (device px).
- Produces: camera position in art px, snapped to 1/`pixelScale` increments.

No unit test: the module reads the real `game` singleton (constructing it in a test would drag the whole pixi app in), and the spec's test list deliberately leaves this to the acceptance sweep (Task 15), where a mis-snapped camera is immediately visible as steppy scrolling or tile seams.

- [ ] **Step 1: Implement**

Replace the `onUpdate` body of `source/game/cameraSystem.ts`:

```ts
  onUpdate: (delta, system) => {
    let {position: cameraPosition} = system.getFirst().getComponent(CameraComponent);
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let {position: playerPosition} = playersQuery.getFirst().getComponent(MotionComponent);

    // The canvas is device px; the world is art px.
    let {pixelScale} = game;
    let viewportWidth = game.app.canvas.width / pixelScale;
    let viewportHeight = game.app.canvas.height / pixelScale;

    // Snap to whole device px (1/pixelScale art px), not whole art px —
    // art-px snapping would make scrolling visibly steppier at scale > 1 than
    // today's 1-device-px granularity.
    let x = Math.floor((playerPosition.x - viewportWidth / 2) * pixelScale) / pixelScale;
    let y = Math.floor((playerPosition.y - viewportHeight / 2) * pixelScale) / pixelScale;

    cameraPosition.set(
      Math.max(map.position.x, Math.min(map.position.x + map.width - viewportWidth, x)),
      Math.max(map.position.y, Math.min(map.position.y + map.height - viewportHeight, y)),
    );
  },
```

- [ ] **Step 2: Verify and commit**

Run: `npm run test && npm run typecheck`
Expected: green.

```bash
git add source/game/cameraSystem.ts
git commit -m "Snap the camera to device px in the art-px world"
```

---

## Task 13: UI on the `ui` atlas, in art px

One atomic task: `FocusRingOptions` changes shape, so the engine (`UiRoot`/`GameScreen`), `widgets.ts` and all three screens must move together for typecheck to stay green.

**Files:**
- Modify: `source/engine/ui/UiRoot.ts`, `source/engine/app/GameScreen.ts`, `source/engine/ui/TextInput.ts`
- Modify: `source/game/game.ts`, `source/game/widgets.ts`, `source/game/mainMenuScreen.ts`, `source/game/gameScreen.ts`, `source/game/loadingScreen.ts`
- Test: `tests/UiRoot.test.ts`

**Interfaces:**
- Consumes: the `ui` spritesheet frames/borders from Task 9-10; `game.pixelScale` (modal sizing).
- Produces:
  - `FocusRingOptions` (UiRoot) = `{padding: number; texture: pixi.Texture}` — the four inset fields are gone; the ring reads `texture.defaultBorders`.
  - `GameScreenOptions.focusRing?: (() => FocusRingOptions) | undefined` — a thunk, called once in `setGame`.
  - `widgets.ts`: `uiTexture(name: string): pixi.Texture` (fail-loud fetch from the `ui` sheet), `nineSlice(name: string): pixi.NineSliceSprite` (no slice argument), `createButton` with `fontSize = 12`, `pressOffset: 1`, `padding: 2`. Deleted: `BUTTON_SLICE`, `BUTTON_ACTIVE_SLICE`, `BANNER_SLICE`, `INPUT_SLICE`, `FOCUS_RING`.

- [ ] **Step 1: Update `tests/UiRoot.test.ts` (the type-level red)**

Replace the fixture:

```ts
const FOCUS_RING = {
  texture: {} as pixi.Texture,
  padding: 8,
};
```

and delete the now-unused `Assets: {get: vi.fn(() => ({}))},` line from the `vi.mock('pixi.js', ...)` factory (after this task `UiRoot` no longer touches `Assets`).

Run: `npm run typecheck`
Expected: FAIL — the fixture no longer matches `FocusRingOptions` (`assetName` and the inset fields are required). This is the red step for a type reshape; the runtime tests still pass because the mock ignores insets.

- [ ] **Step 2: Reshape `FocusRingOptions` in `source/engine/ui/UiRoot.ts`**

Replace the type:

```ts
export type FocusRingOptions = {
  // Extra space between the focused component's bounds and the outside of the
  // ring, in art px.
  padding: number;
  // Resolved nine-slice texture; the insets come from `texture.defaultBorders`
  // (set by the ui spritesheet's per-frame `borders`).
  texture: pixi.Texture;
};
```

and `#createRing`:

```ts
  #createRing(options: FocusRingOptions): pixi.NineSliceSprite {
    this.#ring = new pixi.NineSliceSprite({texture: options.texture});
    this.#overlay.addChild(this.#ring);

    return this.#ring;
  }
```

- [ ] **Step 3: Thunk the screen option in `source/engine/app/GameScreen.ts`**

In `GameScreenOptions`, replace the `focusRing` line:

```ts
  // A thunk, not a value: screens are module-level consts constructed before
  // assets load, and a resolved ring texture exists only afterwards. Called
  // once in setGame — the boot flow reaches addScreen only after init() has
  // loaded the default bundle.
  focusRing?: (() => FocusRingOptions) | undefined;
```

Change the field declaration:

```ts
  readonly #focusRing?: () => FocusRingOptions;
```

and in `setGame`, replace the forwarding:

```ts
    if (this.#focusRing !== undefined) {
      uiRootOptions.focusRing = this.#focusRing();
    }
```

(The constructor's `if (focusRing !== undefined) { this.#focusRing = focusRing; }` stays as is.)

- [ ] **Step 4: Caret to the art grid in `source/engine/ui/TextInput.ts`**

Replace:

```ts
const CARET_WIDTH = 2;
```

with:

```ts
// 1 art px — part of the migration's flagged caret change (grid-consistent,
// slightly thicker at ×4 than the old 2 device px), as is the 1-art-px margin.
const CARET_WIDTH = 1;
```

and in the constructor, the caret layout line becomes:

```ts
    this.#caret.layout = {width: CARET_WIDTH, height: Math.round(fontSize * 0.8), marginLeft: 1};
```

- [ ] **Step 5: Rewrite `source/game/widgets.ts`**

Full new content:

```ts
import * as pixi from 'pixi.js';

import {Button} from '../engine/ui/Button.js';
import {Text} from '../engine/ui/Text.js';
import {audio} from './audio.js';

// All widget art lives in the `ui` spritesheet (default bundle, 1× art px).
// Nine-slice insets ship as per-frame `borders` in the atlas JSON and land on
// `texture.defaultBorders`, so consumers never pass insets in code.
export function uiTexture(name: string): pixi.Texture {
  let texture = pixi.Assets.get<pixi.Spritesheet>('ui').textures[name];

  if (!texture) {
    throw new Error(`Texture "${name}" not found in the "ui" spritesheet!`);
  }

  return texture;
}

export function nineSlice(name: string): pixi.NineSliceSprite {
  return new pixi.NineSliceSprite({texture: uiTexture(name)});
}

export type CreateButtonOptions = {
  label: string;
  onClick: () => void;
  fontSize?: number;
  layout?: pixi.ContainerOptions['layout'];
};

// The standard button: nine-slice art from the ui atlas, monogram-outline
// label, 3D press offset. Each call builds fresh backgrounds (a Button owns and
// destroys its background sprites, so instances must never be shared).
export function createButton({label, onClick, fontSize = 12, layout}: CreateButtonOptions): Button {
  return new Button({
    backgrounds: {
      normal: nineSlice('button-normal'),
      hovered: nineSlice('button-hovered'),
      active: nineSlice('button-active'),
      disabled: nineSlice('button-disabled'),
    },
    children: [
      new Text({
        text: label,
        fontFamily: 'monogram-outline',
        fontSize,
        fill: 0xffffff,
        layout: true,
      }),
    ],
    pressOffset: 1,
    onClick: () => {
      audio.play(pixi.Assets.get<AudioBuffer>('ui-click'), {bus: 'ui'});
      onClick();
    },
    layout: {padding: 2, ...(typeof layout === 'object' ? layout : undefined)},
  });
}
```

- [ ] **Step 6: Collapse the bundle in `source/game/game.ts`**

Replace the `default` bundle's `assets` array (the `game` bundle stays unchanged):

```ts
      assets: [
        {name: 'tileset', sources: ['tileset.json']},
        {name: 'monogram', sources: ['monogram.fnt']},
        {name: 'monogram-outline', sources: ['monogram-outline.fnt']},
        {name: 'ui', sources: ['ui.json']},
        {name: 'ui-click', sources: ['ui-click.wav']},
        {name: 'ui-key', sources: ['ui-key.wav']},
        {name: 'ui-error', sources: ['ui-error.wav']},
        {name: 'menu-music', sources: ['menu-music.wav']},
      ],
```

(The `banner-hover`/`banner-active` aliases were unused and are dropped, per the spec.)

- [ ] **Step 7: Update `source/game/mainMenuScreen.ts`**

7a. Import line: `import {createButton, nineSlice, uiTexture} from './widgets.js';` (drop `BANNER_SLICE`, `FOCUS_RING`, `INPUT_SLICE`).

7b. `toggleBackgrounds`'s inner builder:

```ts
  let toggleSprite = (name: string) => new pixi.Sprite(uiTexture(name));
```

7c. All `nineSlice` calls drop the slice argument: `nineSlice('text-input-normal')`, `nineSlice('text-input-hovered')`, `nineSlice('text-input-disabled')`, `nineSlice('banner')` (two sites: options panel and banner panel).

7d. Art-px literals, every site in this file:
- `fontSize: 48` → `fontSize: 12` (5 sites: options title, name input, "Player name" label, "Sound" label, "Somewhere" title)
- name input `layout: {minWidth: 220, padding: 16}` → `layout: {minWidth: 55, padding: 4}`
- `layout: {gap: 12}` → `layout: {gap: 3}` (nameRow and soundRow)
- both panels: `padding: 32` → `padding: 8`, `gap: 16` → `gap: 4`

7e. Screen option: `focusRing: FOCUS_RING,` → `focusRing: () => ({texture: uiTexture('focus-ring'), padding: 2}),`

7f. Both modal sizing sites (in `openOptionsModal` and `onResize`) convert to art px — the modal lives inside the scaled root:

```ts
  modal.resize(game.app.screen.width / game.pixelScale, game.app.screen.height / game.pixelScale);
```

```ts
  onResize: (screen) => {
    screen.state.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
```

- [ ] **Step 8: Update `source/game/gameScreen.ts`**

8a. Import line: `import {createButton, nineSlice, uiTexture} from './widgets.js';` (drop `BANNER_SLICE`, `FOCUS_RING`).

8b. `nineSlice('banner', BANNER_SLICE)` → `nineSlice('banner')` (pause panel).

8c. Art-px literals, every site:
- pause modal title `fontSize: 48` → `fontSize: 12`; panel `padding: 32` → `padding: 8`, `gap: 16` → `gap: 4`
- HUD root `padding: 16` → `padding: 4`
- `fontSize: 24` → `fontSize: 6` (3 sites: nameLabel, hitCounter, pauseButton)
- HUD column `gap: 4` → `gap: 1`

8d. Screen option: `focusRing: FOCUS_RING,` → `focusRing: () => ({texture: uiTexture('focus-ring'), padding: 2}),`

8e. Both modal sizing sites (in the pause `openModal` callback and `onResize`):

```ts
            modal.resize(
              screen.game.app.screen.width / screen.game.pixelScale,
              screen.game.app.screen.height / screen.game.pixelScale,
            );
```

```ts
  onResize: (screen) => {
    screen.state.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
```

- [ ] **Step 9: Update `source/game/loadingScreen.ts`**

`fontSize: 48` → `fontSize: 12`.

- [ ] **Step 10: Verify everything**

Run: `npm run typecheck && npm run test && npm run lint`
Expected: all green (the Step-1 red is resolved; `Modal.test.ts` and the widget unit tests pass unchanged — they take pre-built containers).

- [ ] **Step 11: Commit**

```bash
git add source/engine/ui/UiRoot.ts source/engine/app/GameScreen.ts source/engine/ui/TextInput.ts source/game/game.ts source/game/widgets.ts source/game/mainMenuScreen.ts source/game/gameScreen.ts source/game/loadingScreen.ts tests/UiRoot.test.ts
git commit -m "Move UI onto the 1x ui atlas and art-px metrics"
```

---

## Task 14: Magic-number audit and full verification

**Files:** possibly small fixes in `source/game/` / `source/engine/ui/` if the audit finds stragglers.

- [ ] **Step 1: Grep for leftover ×4-era pixel numbers**

```bash
git grep -nE '\b(16|20|24|32|40|48|56|60|64|80|128|220)\b' -- source/game source/engine/ui source/engine/app
```

Review every hit against this expected-leftovers list; anything not on it is a candidate bug — convert it to art px or justify it in a comment:

| Hit | Why it stays |
|---|---|
| `mainMenuScreen.ts` `maxLength: 16` | characters, not px |
| `gameScreen.ts` / `mainMenuScreen.ts` `fadeDuration: 200` | time |
| `wallHitPopupSystem.ts` `duration: 400` ×2 | time |
| `graphicsSystem.ts` `45/135/225/315/360` | angles |
| `motionSystem.ts` `MAX_DELTA_TIME = 2` | time |
| `Game.ts` `minFPS = 10`, `ChoosePixelScale.ts` `270`, `2`, `8` | policy values, device px by definition |
| `playerPool.ts` `16 * 9`, `16 * 10`, `Rectangle(0, 10, 16, 10)` | already art px (this migration) |
| hex colors (`0xffffff`, `0x000000`), ports, versions | not px |

Also re-run the same grep with `-- source/game '*.ts'` and skim for any `* 4` / `/ 4` arithmetic that smells like a leftover scale conversion.

- [ ] **Step 2: Full verification**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 3: Commit (only if the audit changed anything)**

```bash
git add -A
git commit -m "Fix leftover device-px magic numbers found by the audit"
```

---

## Task 15: Acceptance — visual comparison and scale sweep

Manual visual check (the repo has no screenshot-diff infra). Use a browser at a 1920×1080 window with DPR 1 (Windows display scale 100%) so the default chooser picks 4.

- [ ] **Step 1: Capture the pre-migration reference**

```bash
git stash --include-untracked   # only if the tree is dirty
git checkout development
npm run develop
```

Screenshot: main menu, Options modal (toggle both states, focus ring via Tab, caret in the name input), in-game world with HUD, pause modal, a wall-hit spark. Then return:

```bash
git checkout somewhere-update
git stash pop   # only if stashed
```

- [ ] **Step 2: Compare at pixelScale 4**

Run `npm run develop` on the branch, same window size. Compare against the reference screenshots side by side. Required: pixel-identical rendering **except** the two flagged changes — the caret (1 art px wide, art-grid margin) and the spark (4×4-art-px diamond, same on-screen size). Check specifically: font glyph chunkiness, nine-slice button/banner/input corners, focus-ring thickness and padding, HUD placement, tile art, character sprite, collision feel (walk into walls on all sides), click-to-move accuracy (tap targets must land exactly), UI proportions.

- [ ] **Step 3: Scale sweep 2/3/5/8**

For each scale, temporarily set the chooser override in `source/game/game.ts` (`choosePixelScale: () => N,`), reload, and check: smooth movement (no stepping coarser than 1 device px), no blur anywhere (NEAREST intact), collision aligned with visible walls, legible UI, stable UI proportions (padding/gap/fontSize all scale together). Then revert:

```bash
git checkout -- source/game/game.ts
```

- [ ] **Step 4: Confirm the suite one last time and finish**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: green.

Done — the branch is ready for review/merge (use superpowers:finishing-a-development-branch).
