# Engine Repairs (2026-07-14 Design) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the seven decided fixes from `docs/engine-fixes-design-2026-07-14.md`: activate depth sorting, pin the Pixi ticker clamp, make unsupported Tiled inputs fail loud, drain repeating-timer surplus, guard unregistered event-channel pushes, pin the Tween capture contract, and make deferred entity adds idempotent.

**Architecture:** Seven independent, small repairs to existing engine classes (`Map`, `Game`, `Tilemap`, `Timer`, `EventChannel`/`World`, `Tween`, `World`), each with pinning unit tests. No new files in `source/`; two new test files (`tests/Tilemap.test.ts`, `tests/Tileset.test.ts`). No behavior redesigns — each change enables, guards, or documents what the code already intends.

**Tech Stack:** TypeScript, Pixi.js 8.16, zod 4, vitest 4 + happy-dom.

## Global Constraints

- Run all commands from `/workspaces/apps/apps/somewhere`.
- Work on the current branch `somewhere-update`. One commit per task.
- Commit message style (match `git log`): imperative sentence case, **no** `feat:`/`fix:` prefix — e.g. `Enable depth sorting on the entity layer`.
- Loud-failure pattern (the `ObjectPool.destroy` precedent, `source/engine/utilities/ObjectPool.ts:47`): `if (import.meta.env.DEV) { throw new Error(message); } console.warn(message);`. Keep helpers module-local — do NOT create a shared `invariant()` utility (per `docs/…` design principles: axioms over mechanisms).
- Under vitest, `import.meta.env.DEV` is `true`, so tests exercise the DEV-throw path. The prod-warn path is not unit-tested.
- Bare `console.warn`/`console.error` is allowed (see `source/game/gameScreen.ts:49`). If eslint still flags a new call, add `// eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)` directly above it.
- Do NOT change: the two zIndex formulas (`Map.ts`, `graphicsSystem.ts`), `motionSystem`'s `MAX_DELTA_TIME = 2`, the hardcoded `animationSpeed = 0.15`, frame-duration handling (stays silent by design — T1.3 owns it), or anything for design-doc item 4 (no code changes — both deferrals re-affirmed, already committed).
- The review doc `docs/engine-review-2026-07-04.md` already has all five items struck through — no doc edits in this plan.
- Code style: `let` over `const` for locals, `#private` class fields, `.js` suffix on relative imports, tests use `test()` + `toBeTruthy()`/`toBeFalsy()`, fixtures built by plain functions.
- Run a single test file with: `npx vitest run tests/<File>.test.ts` (the full `npm test` recreates coverage and runs everything — save it for the final task).

## File Structure

| File | Change |
|---|---|
| `source/engine/tiled/Map.ts` | Task 1: set `sortableChildren` on the entity layer (index 1) |
| `tests/Map.test.ts` | Task 1: depth-sorting tests (new stub + describe block) |
| `source/engine/app/Game.ts` | Task 2: pin `app.ticker.minFPS = 10` in `init()` |
| `tests/Game.test.ts` | Task 2: ticker-configuration test |
| `source/engine/tiled/Tilemap.ts` | Task 3: `failUnsupported` helper + five loud-failure checks in `from()` |
| `tests/Tilemap.test.ts` | Task 3: NEW — happy path + seven DEV-throw tests |
| `tests/Tileset.test.ts` | Task 4: NEW — `Tileset.from` happy-path tests (no production change) |
| `source/engine/scheduler/Timer.ts` | Task 5: `#elapsed %= duration` on repeat fire |
| `tests/Timer.test.ts` | Task 5: bounded-residual test + one stale comment fix |
| `source/engine/ecs/EventChannel.ts` | Task 6: registered flag, loud unregistered `push()` |
| `source/engine/ecs/World.ts` | Task 6: set/clear the flag in `addEventChannel`/`removeEventChannel`; Task 8: idempotent deferred add in the flush |
| `tests/EventChannel.test.ts` | Task 6: register standalone channels; lifecycle + DEV-throw tests |
| `tests/uiBridge.test.ts` | Task 6: register `wallHitChannel` through the world in `withBridge` |
| `source/engine/scheduler/Tween.ts` | Task 7: contract doc comment (no behavior change) |
| `tests/Tween.test.ts` | Task 7: capture-timing pin test |
| `tests/World.test.ts` | Task 8: deferred double-add test |

Tasks are independent of each other; only Task 6 spans two source files (the flag and its call sites are one reviewable unit).

---

### Task 1: Enable depth sorting on the entity layer

Design-doc item 1, Option A. Both zIndex writes already compute the correct y-sort key (bottom of collision box); nothing ever sorts. Setting `sortableChildren = true` on the entity layer container (layer index 1 — `addToLayer`'s default, where `graphicsSystem` puts entity sprites as siblings of tiles) activates the existing design. Other layers keep insertion order on purpose.

**Files:**
- Modify: `source/engine/tiled/Map.ts:89-96` (after the layer loop, before `this.layers = layers`)
- Test: `tests/Map.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change — `map.layers[1].view.sortableChildren` is now `true` after construction.

**Pixi 8.16 caveat for the implementer:** pixi's `zIndex` setter auto-sets `parent.sortableChildren = true` when a *parented* child's zIndex *changes* (`sortMixin.mjs`, `depthOfChildModified`). Tiles set zIndex before `addChild`, so construction does NOT trip it — the constructor-flag test below is the real fail-first pin. The draw-order test may pass even before the change (the test's own zIndex write trips the auto-flag); it pins the sort-key convention end-to-end and guards against pixi changing that accidental behavior.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Map.test.ts`, below the existing `stubAssets` function (module level):

```ts
// A 1x2 map with two layers: layer 0 (ground) and layer 1 (the entity layer,
// addToLayer's default). Layer 1's row-1 tile carries a collision box, so its
// zIndex sort key is row * tileHeight + boundingBox.y + boundingBox.height
// = 16 + 8 + 8 = 32.
function stubDepthSortAssets() {
  let tileset = new Tileset({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tiles: [
      {id: toTileId(0), textures: [pixi.Texture.WHITE]},
      {
        id: toTileId(1),
        textures: [pixi.Texture.WHITE],
        boundingBox: new pixi.Rectangle(0, 8, 16, 8),
      },
    ],
  });
  let tilemap = new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [
      {tileGids: [toTileGid(1), toTileGid(1)]}, // ground
      {tileGids: [toTileGid(1), toTileGid(2)]}, // entity layer; row 1 has the collision-box tile
    ],
  });

  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap : tileset) as never);
}
```

And a new describe block at the end of the file:

```ts
describe('Map depth sorting (entity layer)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('only the entity layer (index 1) sorts its children by zIndex', () => {
    stubDepthSortAssets();

    let map = new Map({assetName: 'map'});

    expect(map.layers[1]!.view.sortableChildren).toBeTruthy();
    expect(map.layers[0]!.view.sortableChildren).toBeFalsy();
  });

  test('an entity draws behind a tile while its feet are above the tile collision-box bottom, in front once below', () => {
    stubDepthSortAssets();

    let map = new Map({assetName: 'map'});
    let layer = map.layers[1]!;
    let tileView = layer.tiles[0]![1]!.view; // row 1: zIndex 16 + 8 + 8 = 32

    // The entity enters the same container graphicsSystem uses and writes the
    // same sort key: position.y + boundingBox.y + boundingBox.height.
    let entityView = new pixi.Container();
    let boundingBox = new pixi.Rectangle(0, 12, 16, 4);

    map.addToLayer(entityView);

    // Feet at 12 + 12 + 4 = 28 < 32: renders behind the tile.
    entityView.position.y = 12;
    entityView.zIndex = entityView.position.y + boundingBox.y + boundingBox.height;
    layer.view.sortChildren();

    expect(layer.view.getChildIndex(entityView)).toBeLessThan(layer.view.getChildIndex(tileView));

    // Feet at 20 + 12 + 4 = 36 > 32: renders in front.
    entityView.position.y = 20;
    entityView.zIndex = entityView.position.y + boundingBox.y + boundingBox.height;
    layer.view.sortChildren();

    expect(layer.view.getChildIndex(entityView)).toBeGreaterThan(
      layer.view.getChildIndex(tileView),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify the flag test fails**

Run: `npx vitest run tests/Map.test.ts`
Expected: `only the entity layer (index 1) sorts its children by zIndex` FAILS with `expected false to be truthy`. (The draw-order test may already pass — see the pixi 8.16 caveat above; that is fine.) All pre-existing tests still pass.

- [ ] **Step 3: Implement the change**

In `source/engine/tiled/Map.ts`, insert between the end of the layer loop and `this.layers = layers;`:

```ts
    // Layer 1 is the entity layer (addToLayer's default): entity sprites are
    // inserted as siblings of its tiles, and both write the same y-sort key
    // to zIndex — the bottom edge of the collision box (tiles at construction
    // above, entities per frame in graphicsSystem). This flag makes Pixi
    // actually sort by it, so an entity can walk behind scenery. Other layers
    // keep insertion order: their stacking is layer-level by design (ground
    // below, overhead "air" above). T1.6 later replaces the mechanism with a
    // dedicated y-sorted RenderLayer without changing the sort key; T2.16
    // addresses the per-frame sort cost over all layer-1 tiles.
    let entityLayer = layers[1];

    if (entityLayer) {
      entityLayer.view.sortableChildren = true;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/Map.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add source/engine/tiled/Map.ts tests/Map.test.ts
git commit -m "Enable depth sorting on the entity layer"
```

---

### Task 2: Pin the Pixi ticker clamp in Game.init

Design-doc item 2, Option A. Pixi's `Ticker` already clamps elapsed time to 100 ms (`minFPS = 10` default) — the guarantee is an undocumented third-party default. Pin it explicitly with a contract comment; zero behavior change.

**Files:**
- Modify: `source/engine/app/Game.ts:88-105` (the `appReady` `.then()` block)
- Test: `tests/Game.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change — `game.app.ticker.minFPS === 10` after `init()`.

- [ ] **Step 1: Write the failing test**

Add a new describe block at the end of `tests/Game.test.ts` (the file's pixi mock gives `Application` a plain `ticker = {add() {}, remove() {}}` object, so the property assignment is observable):

```ts
describe('Game ticker configuration', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('init pins the ticker clamp: minFPS = 10 caps one frame step at 100 ms', async () => {
    let game = new Game({assetBundles: []});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.app.ticker.minFPS).toBe(10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/Game.test.ts`
Expected: the new test FAILS with `expected undefined to be 10`. All pre-existing tests pass.

- [ ] **Step 3: Implement the change**

In `source/engine/app/Game.ts`, inside the `appReady` `.then(() => { … })` callback, after `this.view.hitArea = new pixi.Rectangle();` add:

```ts
          // Engine contract: one frame advances world time by at most 100 ms
          // (maxElapsedMS = 1000 / minFPS), no matter how long the tab sat
          // backgrounded (rAF stops firing there) or how badly a frame
          // hitched. Pixi's Ticker defaults to minFPS = 10 already — pinned
          // explicitly so a ticker config change can't silently remove the
          // clamp. Timers fire at most once per update and tweens snap to
          // their end values, so a single 100 ms step is benign. (T1.9 moves
          // this into a world-level time object when timeScale lands.)
          this.app.ticker.minFPS = 10;
```

(The ticker only exists after `app.init()` resolves — pixi's TickerPlugin creates it — which is why the assignment lives in this `.then()` and not the constructor.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/Game.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add source/engine/app/Game.ts tests/Game.test.ts
git commit -m "Pin the Pixi ticker clamp as an explicit engine contract"
```

---

### Task 3: Fail loud on unsupported Tiled inputs in Tilemap.from

Design-doc item 3, Option A. `Tilemap.from` silently drops everything that isn't a finite, CSV-encoded tile layer with an external tileset, and silently strips flip/rotation flags. Each unsupported input now throws in DEV and warns in production, with a message saying what to change in Tiled.

**Files:**
- Modify: `source/engine/tiled/Tilemap.ts:44-78` (the `from` method + a module-local helper)
- Test: Create `tests/Tilemap.test.ts`

**Interfaces:**
- Consumes: `getGid` (`source/engine/tiled/getGid.ts`), `toTileGid`, `FLIPPED_HORIZONTALLY_FLAG` (`source/engine/tiled/constants.ts`) — all existing.
- Produces: no API change. In DEV, `Tilemap.from` now rejects on unsupported input; in production it warns and keeps the current skip/strip behavior.

- [ ] **Step 1: Write the failing tests**

Create `tests/Tilemap.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {FLIPPED_HORIZONTALLY_FLAG} from '../source/engine/tiled/constants.js';
import {Tilemap} from '../source/engine/tiled/Tilemap.js';

// Minimal valid orthogonal Tiled map: 2x1 tiles, one CSV tile layer, one
// external tileset. Tests override fields to produce each unsupported input.
function createTileLayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: [1, 2],
    encoding: 'csv',
    height: 1,
    id: 1,
    name: 'ground',
    opacity: 1,
    type: 'tilelayer',
    visible: true,
    width: 2,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function createTiledTilemap(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    compressionlevel: -1,
    height: 1,
    infinite: false,
    layers: [createTileLayer()],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 16,
    tilesets: [{firstgid: 1, source: 'tileset.tsx'}],
    tilewidth: 16,
    type: 'map',
    version: '1.10',
    width: 2,
    ...overrides,
  };
}

describe('Tilemap.from', () => {
  test('parses a finite CSV map with an external tileset', async () => {
    let tilemap = await Tilemap.from(createTiledTilemap());

    expect(tilemap.tileWidth).toBe(16);
    expect(tilemap.tileHeight).toBe(16);
    expect(tilemap.columnCount).toBe(2);
    expect(tilemap.rowCount).toBe(1);
    expect(tilemap.tilesets).toEqual([{assetName: 'tileset.tsx', firstTileGid: 1}]);
    expect(tilemap.layers).toEqual([{tileGids: [1, 2]}]);
  });

  test('throws in DEV on an infinite map', async () => {
    await expect(Tilemap.from(createTiledTilemap({infinite: true}))).rejects.toThrow(
      /Infinite tilemaps are not supported/,
    );
  });

  test('throws in DEV on an embedded tileset', async () => {
    let source = createTiledTilemap({
      tilesets: [
        {
          columns: 1,
          firstgid: 1,
          image: 'tileset.png',
          imageheight: 16,
          imagewidth: 16,
          margin: 0,
          name: 'embedded',
          spacing: 0,
          tilecount: 1,
          tiledversion: '1.10.2',
          tileheight: 16,
          tilewidth: 16,
          type: 'tileset',
          version: '1.10',
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/Embedded tilesets are not supported/);
  });

  test('throws in DEV on base64 layer data', async () => {
    let source = createTiledTilemap({
      layers: [createTileLayer({data: 'eJxjZGBgYAQAAAwAAw==', encoding: 'base64'})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/Tile Layer Format: CSV/);
  });

  test('throws in DEV on an object layer', async () => {
    let source = createTiledTilemap({
      layers: [
        {
          id: 2,
          name: 'objects',
          objects: [],
          opacity: 1,
          type: 'objectgroup',
          visible: true,
          x: 0,
          y: 0,
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "objectgroup"/);
  });

  test('throws in DEV on an image layer', async () => {
    let source = createTiledTilemap({
      layers: [
        {
          id: 3,
          image: 'background.png',
          name: 'background',
          opacity: 1,
          type: 'imagelayer',
          width: 32,
          x: 0,
          y: 0,
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "imagelayer"/);
  });

  test('throws in DEV on a group layer', async () => {
    let source = createTiledTilemap({
      layers: [
        {
          id: 4,
          layers: [],
          name: 'group',
          opacity: 1,
          type: 'group',
          width: 32,
          x: 0,
          y: 0,
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "group"/);
  });

  test('throws in DEV on a tile GID carrying flip/rotation flags', async () => {
    let source = createTiledTilemap({
      layers: [createTileLayer({data: [1, FLIPPED_HORIZONTALLY_FLAG + 2]})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/flipped or rotated tile/);
  });
});
```

- [ ] **Step 2: Run the tests to verify the seven throw tests fail**

Run: `npx vitest run tests/Tilemap.test.ts`
Expected: the happy-path test PASSES; the seven `throws in DEV …` tests FAIL with `promise resolved … instead of rejecting` (today's code silently skips these inputs).

- [ ] **Step 3: Implement the change**

In `source/engine/tiled/Tilemap.ts`, add a module-local helper above the `Tilemap` class:

```ts
// DEV-throw / prod-warn on unsupported Tiled input (the ObjectPool.destroy
// precedent): a silent drop reproduces as an inexplicably empty map layer,
// and a warn alone gets missed in development.
function failUnsupported(message: string): void {
  if (import.meta.env.DEV) {
    throw new Error(message);
  }

  console.warn(message);
}
```

Replace the body of `static async from(source: unknown)` with:

```ts
  static async from(source: unknown) {
    let tiledTilemap = tiledTilemapSchema.parse(source);

    if (tiledTilemap.infinite) {
      failUnsupported(
        'Infinite tilemaps are not supported! Re-export the map from Tiled with "Infinite" turned off (Map > Map Properties).',
      );
    }

    let tilesets: TilemapTileset[] = [];

    for (let tiledTilemapTileset of tiledTilemap.tilesets) {
      if (tiledTilemapTileset.source) {
        tilesets.push({
          assetName: tiledTilemapTileset.source,
          firstTileGid: toTileGid(tiledTilemapTileset.firstgid),
        });
      } else {
        failUnsupported(
          'Embedded tilesets are not supported! Export the tileset to its own file in Tiled and reference it from the map as an external tileset.',
        );
      }
    }

    let layers: TilemapLayer[] = [];

    for (let tiledTilemapLayer of tiledTilemap.layers) {
      if (tiledTilemapLayer.type !== 'tilelayer') {
        failUnsupported(
          `Layer "${tiledTilemapLayer.name}" has unsupported type "${tiledTilemapLayer.type}"! Only tile layers are supported; remove object, image, and group layers from the map.`,
        );

        continue;
      }

      if (typeof tiledTilemapLayer.data === 'string') {
        failUnsupported(
          `Tile layer "${tiledTilemapLayer.name}" uses base64 (and/or compressed) data! Re-export the map from Tiled with "Tile Layer Format: CSV" (Map > Map Properties).`,
        );

        continue;
      }

      // Flip/rotation flags are stripped below, so a flipped tile would
      // silently render un-flipped — loud until T1.7 implements flip
      // rendering (T1.7 relaxes this check to actual support).
      let flaggedIndex = tiledTilemapLayer.data.findIndex(
        (gid) => getGid(toTileGid(gid)) !== gid,
      );

      if (flaggedIndex >= 0) {
        failUnsupported(
          `Tile layer "${tiledTilemapLayer.name}" has a flipped or rotated tile (first at tile index ${flaggedIndex})! Flipped tiles render un-flipped; remove the flips/rotations in Tiled.`,
        );
      }

      let tileGids = tiledTilemapLayer.data.map((gid) => getGid(toTileGid(gid)));

      layers.push({
        tileGids,
      });
    }

    return new this({
      tileWidth: tiledTilemap.tilewidth,
      tileHeight: tiledTilemap.tileheight,
      columnCount: tiledTilemap.width,
      rowCount: tiledTilemap.height,
      tilesets,
      layers,
    });
  }
```

(Production keeps the current behavior after the warn: unsupported tilesets/layers are skipped, flags are stripped, an infinite map proceeds degraded.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/Tilemap.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Run the map-consuming tests to catch regressions**

Run: `npx vitest run tests/Map.test.ts tests/mapSystem.test.ts`
Expected: PASS (these stub `Assets.get` with already-constructed `Tilemap` instances, so they bypass `from` — but verify).

- [ ] **Step 6: Commit**

```bash
git add source/engine/tiled/Tilemap.ts tests/Tilemap.test.ts
git commit -m "Fail loud on unsupported Tiled inputs in Tilemap.from"
```

---

### Task 4: Add the missing Tileset.from unit tests

Design-doc item 3 scope note: `Tileset.from` has no direct tests. These are characterization tests of the happy path (frames, animations, collision boxes) — **no production change**, so they should pass on first run. The approach (real `Spritesheet.parse()` against a stubbed in-memory texture) was verified to work headless under happy-dom.

**Files:**
- Test: Create `tests/Tileset.test.ts`

**Interfaces:**
- Consumes: `Tileset`, `toTileId` — existing.
- Produces: nothing — test-only task.

- [ ] **Step 1: Write the tests**

Create `tests/Tileset.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';

// A 1-column x 2-row tileset (16x32 image): tile 0 static, tile 1 animated
// (frames 0 -> 1) and carrying a collision box.
function createTiledTileset(): Record<string, unknown> {
  return {
    columns: 1,
    image: 'tileset.png',
    imageheight: 32,
    imagewidth: 16,
    margin: 0,
    name: 'test',
    spacing: 0,
    tilecount: 2,
    tiledversion: '1.10.2',
    tileheight: 16,
    tilewidth: 16,
    type: 'tileset',
    version: '1.10',
    tiles: [
      {
        id: 1,
        animation: [
          {duration: 100, tileid: 0},
          {duration: 100, tileid: 1},
        ],
        objectgroup: {
          draworder: 'index',
          id: 2,
          name: '',
          objects: [
            {
              height: 8,
              id: 1,
              name: '',
              rotation: 0,
              type: '',
              visible: true,
              width: 16,
              x: 0,
              y: 8,
            },
          ],
          opacity: 1,
          type: 'objectgroup',
          visible: true,
          x: 0,
          y: 0,
        },
      },
    ],
  };
}

// Tileset.from loads the tileset image through Assets.load + Texture.from;
// stub both so the spritesheet parses against an in-memory 16x32 source.
function stubImage() {
  vi.spyOn(pixi.Assets, 'load').mockResolvedValue(undefined as never);
  vi.spyOn(pixi.Texture, 'from').mockReturnValue(
    new pixi.Texture({source: new pixi.TextureSource({width: 16, height: 32})}),
  );
}

describe('Tileset.from', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses dimensions and gives every tile a texture', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.tileWidth).toBe(16);
    expect(tileset.tileHeight).toBe(16);
    expect(tileset.columnCount).toBe(1);
    expect(tileset.rowCount).toBe(2);
    expect(tileset.getTile(0).textures).toHaveLength(1);
  });

  test('an animated tile gets one texture per animation frame', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.getTile(1).textures).toHaveLength(2);
  });

  test('a collision object becomes the tile bounding box; tiles without one stay unset', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.getTile(1).boundingBox).toMatchObject({x: 0, y: 8, width: 16, height: 8});
    expect(tileset.getTile(0).boundingBox).toBeUndefined();
  });
});

describe('Tileset.getTile', () => {
  test('throws on an unknown tile id', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [{id: toTileId(0), textures: [pixi.Texture.WHITE]}],
    });

    expect(() => tileset.getTile(1)).toThrow('Tile with ID "1" not found!');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/Tileset.test.ts`
Expected: PASS (4 tests) — characterization of existing behavior, so no fail-first cycle. If anything fails, the fixture is wrong (zod parse error) — fix the fixture, not `Tileset`.

- [ ] **Step 3: Commit**

```bash
git add tests/Tileset.test.ts
git commit -m "Add Tileset.from unit tests"
```

---

### Task 5: Drain the repeating Timer surplus on fire

Design-doc item 5a. `#elapsed -= duration` banks unbounded surplus when the period is shorter than the frame time, then bursts (fires every frame) once the frame rate recovers. `#elapsed %= duration` keeps the residual below one period: effective cadence `max(period, frame time)`, no post-hitch burst. The "fires at most once per update" contract is unchanged.

**Files:**
- Modify: `source/engine/scheduler/Timer.ts:41-43`
- Test: `tests/Timer.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change — `Timer.update` still returns `boolean`.

- [ ] **Step 1: Write the failing test**

Add to the `describe('Timer', …)` block in `tests/Timer.test.ts`:

```ts
  test('sustained sub-period frames keep a bounded residual — no burst after the frame rate recovers', () => {
    let timer = new Timer({duration: 10, repeat: true});

    // 100 slow frames (35ms > the 10ms period): fires exactly once per frame,
    // and the surplus past one period is discarded instead of banked.
    for (let i = 0; i < 100; i++) {
      expect(timer.update(tick(35))).toBeTruthy();
    }

    // Frame rate recovers: with `-=` the ~2,500ms banked surplus would fire
    // every 1ms frame for seconds; drained, the next fire needs a full period.
    for (let i = 0; i < 9; i++) {
      expect(timer.update(tick(1))).toBeFalsy();
    }

    expect(timer.update(tick(1))).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/Timer.test.ts`
Expected: the new test FAILS on the first `toBeFalsy()` in the recovery loop with `expected true to be falsy` (the banked surplus keeps it firing). All pre-existing tests pass.

- [ ] **Step 3: Implement the change**

In `source/engine/scheduler/Timer.ts`, replace:

```ts
    if (this.#repeat) {
      this.#elapsed -= this.#duration;
    } else {
      this.#finished = true;
    }
```

with:

```ts
    if (this.#repeat) {
      // Drain the whole surplus, not one period: under sustained sub-period
      // frames `-=` banks time without bound, then fires every frame until
      // the surplus drains once the frame rate recovers. `%=` keeps the
      // residual below one period — effective cadence max(period, frame
      // time), phase realigned after a hitch.
      this.#elapsed %= this.#duration;
    } else {
      this.#finished = true;
    }
```

- [ ] **Step 4: Fix the now-stale comment in the existing test**

In `tests/Timer.test.ts`, the test `fires at most once per update even across several periods` — change:

```ts
    expect(timer.update(tick(350))).toBeTruthy(); // single fire, surplus carried
```

to:

```ts
    expect(timer.update(tick(350))).toBeTruthy(); // single fire; residual is 350 % 100 = 50, not 250 banked
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/Timer.test.ts tests/timerSystem.test.ts tests/Scheduler.test.ts`
Expected: PASS (all — `timerSystem` and `Scheduler` consume `Timer`, so verify them too).

- [ ] **Step 6: Commit**

```bash
git add source/engine/scheduler/Timer.ts tests/Timer.test.ts
git commit -m "Drain the repeating Timer surplus on fire"
```

---

### Task 6: Fail loud when pushing to an unregistered event channel

Design-doc item 5b. A pushed-but-never-registered channel leaks every event forever (only `World.update` calls `swap()`, and only for registered channels) while consumers read an always-empty snapshot. `EventChannel` gets a registered flag that `World.addEventChannel`/`removeEventChannel` set and clear (`World.stop()` clears it too — it removes every channel via `removeEventChannel`); `push()` on an unregistered channel throws in DEV, warns once and drops the event in production.

**Files:**
- Modify: `source/engine/ecs/EventChannel.ts`
- Modify: `source/engine/ecs/World.ts:234-263` (`addEventChannel`, `removeEventChannel`)
- Test: `tests/EventChannel.test.ts`, `tests/uiBridge.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EventChannel.setRegistered(isRegistered: boolean): void` (`@internal`, called by `World`) and `get isRegistered(): boolean`. Tests that drive a channel standalone (calling `swap()` by hand) must now also call `setRegistered(true)` — or register through a real world.

**Blast radius (checked):** `tests/EventChannel.test.ts` has four standalone-push tests and `tests/uiBridge.test.ts` pushes to the never-registered `wallHitChannel` — both updated below. `tests/popupCleanupSystem.test.ts`, `tests/timerSystem.test.ts`, `tests/motionSystem.test.ts`, and `tests/World.test.ts` all register their channels via `addEventChannel` before pushing — no changes needed. Production pushers (`motionSystem`, `timerSystem`/`tweenSystem` emits) run only during `world.update` on channels registered in `world.ts` `onStart` — no changes needed.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('EventChannel', …)` block in `tests/EventChannel.test.ts`:

```ts
  test('push on an unregistered channel throws in DEV', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    expect(() => {
      channel.push(new FooEvent({value: 1}));
    }).toThrow('Cannot push to the unregistered event channel "Foo"');
  });
```

Add to the `describe('World event channel integration', …)` block:

```ts
  test('registration lifecycle: addEventChannel enables push, removeEventChannel disables it', () => {
    let world = new World();
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    expect(channel.isRegistered).toBeFalsy();

    world.addEventChannel(channel);

    expect(channel.isRegistered).toBeTruthy();
    expect(() => {
      channel.push(new FooEvent({value: 1}));
    }).not.toThrow();

    world.removeEventChannel(channel);

    expect(channel.isRegistered).toBeFalsy();
    expect(() => {
      channel.push(new FooEvent({value: 2}));
    }).toThrow(/unregistered event channel/);
  });

  test('stop() unregisters channels, so a push after stop is loud (the T1.2 trap)', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
      },
    });

    world.start();

    expect(channel.isRegistered).toBeTruthy();

    world.stop();

    expect(channel.isRegistered).toBeFalsy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/EventChannel.test.ts`
Expected: the three new tests FAIL (`isRegistered` is undefined / push does not throw). Pre-existing tests still pass (no production change yet).

- [ ] **Step 3: Implement the EventChannel change**

In `source/engine/ecs/EventChannel.ts`, add two private fields after `#currentEvents`:

```ts
  #isRegistered = false;
  #hasWarnedUnregistered = false;
```

Add after the `events` getter:

```ts
  /** Whether a world currently drains this channel (see `setRegistered`). */
  get isRegistered(): boolean {
    return this.#isRegistered;
  }

  /** @internal Set by `World.addEventChannel` / `removeEventChannel` (and so cleared by `World.stop`). */
  setRegistered(isRegistered: boolean): void {
    this.#isRegistered = isRegistered;
  }
```

Replace the `push` method (keep its doc comment, extended):

```ts
  /** Push an event onto the channel. Becomes current (visible via `events`) next frame. Safe to call mid-update. Off-cycle pushes are batched into the next swap (readable the following frame), never dropped. The channel must be registered (`world.addEventChannel`): only registered channels get their `swap()` called, so an unregistered push would buffer — and leak — forever while consumers read an always-empty snapshot. */
  push(event: InstanceType<T>): void {
    if (!this.#isRegistered) {
      let message = `Cannot push to the unregistered event channel "${this.displayName}" — events would never be delivered! Register it with world.addEventChannel() first.`;

      if (import.meta.env.DEV) {
        throw new Error(message);
      }

      // Warn once and drop the event: buffering it anyway would recreate the
      // unbounded growth this guard exists to prevent.
      if (!this.#hasWarnedUnregistered) {
        this.#hasWarnedUnregistered = true;
        console.warn(message);
      }

      return;
    }

    this.#nextEvents.push(event);
  }
```

- [ ] **Step 4: Implement the World change**

In `source/engine/ecs/World.ts`, in `addEventChannel`, after `this.eventChannels.push(channel as unknown as EventChannel);` add:

```ts
    (channel as unknown as EventChannel).setRegistered(true);
```

In `removeEventChannel`, change:

```ts
    (channel as unknown as EventChannel).clear();
    this.eventChannels.splice(index, 1);
```

to:

```ts
    (channel as unknown as EventChannel).clear();
    (channel as unknown as EventChannel).setRegistered(false);
    this.eventChannels.splice(index, 1);
```

- [ ] **Step 5: Update the standalone-channel tests**

In `tests/EventChannel.test.ts`, the four standalone tests in `describe('EventChannel', …)` — `pushed event is invisible until swap…`, `events appear in push order after swap`, `clear() empties both buffers…`, and `pushing during iteration…` — each construct a channel and drive it by hand (they already call the `@internal` `swap()` directly). In each, add this line immediately after the `new EventChannel(…)` construction:

```ts
    channel.setRegistered(true); // driven by hand below; a real world sets this in addEventChannel
```

- [ ] **Step 6: Update tests/uiBridge.test.ts**

The file pushes to the module-singleton `wallHitChannel` without any world registration. Register it through the world in `withBridge` and move the pushes inside. Replace the `withBridge` helper with:

```ts
function withBridge(run: (world: World) => void) {
  let world = new World();

  world.addEventChannel(wallHitChannel);
  world.addSystem(uiBridge);

  try {
    run(world);
  } finally {
    world.removeSystem(uiBridge);
    world.removeEventChannel(wallHitChannel);
  }
}
```

In the first test, replace:

```ts
    wallHitChannel.push(new WallHit({entity, tile}));
    wallHitChannel.swap();

    withBridge((world) => {
      world.update({deltaTime: 1} as never);
    });
```

with:

```ts
    withBridge((world) => {
      wallHitChannel.push(new WallHit({entity, tile}));
      wallHitChannel.swap();
      world.update({deltaTime: 1} as never);
    });
```

In the second test, replace:

```ts
    wallHitChannel.push(new WallHit({entity, tile: tileA}));
    wallHitChannel.push(new WallHit({entity, tile: tileB}));
    wallHitChannel.swap();

    withBridge((world) => {
      world.update({deltaTime: 1} as never);
    });
```

with:

```ts
    withBridge((world) => {
      wallHitChannel.push(new WallHit({entity, tile: tileA}));
      wallHitChannel.push(new WallHit({entity, tile: tileB}));
      wallHitChannel.swap();
      world.update({deltaTime: 1} as never);
    });
```

(The third test pushes nothing — unchanged.)

- [ ] **Step 7: Run the affected test files**

Run: `npx vitest run tests/EventChannel.test.ts tests/uiBridge.test.ts tests/World.test.ts tests/popupCleanupSystem.test.ts tests/timerSystem.test.ts tests/motionSystem.test.ts tests/pauseFlow.test.ts`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add source/engine/ecs/EventChannel.ts source/engine/ecs/World.ts tests/EventChannel.test.ts tests/uiBridge.test.ts
git commit -m "Fail loud when pushing to an unregistered event channel"
```

---

### Task 7: Document and pin Tween's capture-at-construction contract

Design-doc item 5c. Not a defect — a load-bearing contract (`Modal.ts:154-158` relies on it for jump-free mid-fade cancel-and-replace). Add the doc comment and a pinning test. **No behavior change.**

**Files:**
- Modify: `source/engine/scheduler/Tween.ts:17` (doc comment above the class)
- Test: `tests/Tween.test.ts`

**Interfaces:**
- Consumes / Produces: nothing — documentation and a pin test only.

- [ ] **Step 1: Write the pinning test**

Add to `tests/Tween.test.ts`:

```ts
  test('from is captured at construction, not at the first update (load-bearing contract)', () => {
    let target = {x: 10};
    let tween = new Tween({target, to: {x: 20}, duration: 100});

    // Mutating the target between construction and the first update must not
    // move the tween's origin: it interpolates 10 -> 20, not 999 -> 20.
    // Modal's mid-fade cancel-and-replace relies on exactly this capture
    // timing for jump-free fades (Modal.ts).
    target.x = 999;

    tween.update(tick(50));

    expect(target.x).toBeCloseTo(15);
  });
```

- [ ] **Step 2: Run the test — expected to pass immediately**

Run: `npx vitest run tests/Tween.test.ts`
Expected: PASS. This is a pin of existing intended behavior, not a fail-first cycle. If it fails, STOP — the contract three documents describe is broken; do not "fix" the test.

- [ ] **Step 3: Add the doc comment**

In `source/engine/scheduler/Tween.ts`, directly above `export class Tween<T = Record<string, number>> {` add:

```ts
/**
 * Interpolates the numeric properties named in `to` from their current values
 * toward the target values over `duration` milliseconds.
 *
 * Axiom: `from` is captured at construction, NOT at the first update —
 * construct a tween at the moment it should start. This is load-bearing:
 * cancel-and-replace flows (e.g. Modal's mid-fade close) rely on a new tween
 * picking up from the target's current value with no visual jump.
 */
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/Tween.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add source/engine/scheduler/Tween.ts tests/Tween.test.ts
git commit -m "Document and pin Tween's capture-at-construction contract"
```

---

### Task 8: Make deferred entity adds idempotent

Design-doc item 5d. In the post-update flush, queued removals are guarded (`Tolerate repeats`) but queued adds re-enter `addEntity` unguarded and hit the synchronous double-add throw mid-flush — after systems ran, with a stack trace far from the offending call. Guard the flush-site add the same way. Axiom: synchronous structural calls are strict; deferred structural changes are idempotent. Remove-then-re-add keeps working (FIFO flush).

**Files:**
- Modify: `source/engine/ecs/World.ts:342-357` (the pending-changes flush in `update`)
- Test: `tests/World.test.ts`

**Interfaces:**
- Consumes / Produces: no API change.

- [ ] **Step 1: Write the failing test**

Add to the `describe('World.update deferred structural changes', …)` block in `tests/World.test.ts`, after the `two systems removing the same entity…` test:

```ts
    test('two systems adding the same entity in one update do not throw (deferred adds are idempotent)', () => {
      let spawned = new Entity({components: []});
      let makeSpawner = () =>
        new System({
          components: [],
          onUpdate: (ticker, system, world) => {
            if (!world.entities.includes(spawned)) {
              world.addEntity(spawned);
            }
          },
        });
      let world = new World({
        onStart: (w) => {
          w.addSystem(makeSpawner()).addSystem(makeSpawner());
        },
      });

      world.start();

      // Both systems see the entity absent (adds defer during the update), so
      // both enqueue it; the flush must apply the first and skip the repeat.
      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities.filter((each) => each === spawned)).toHaveLength(1);

      world.stop();
    }, 2000);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/World.test.ts`
Expected: the new test FAILS — the update throws `Entity was already added to the world!`. All pre-existing tests pass.

- [ ] **Step 3: Implement the change**

In `source/engine/ecs/World.ts`, inside `update`'s flush loop, replace:

```ts
      if (isRemoval) {
        // Tolerate repeats: two systems may remove the same entity in one frame.
        if (this.entities.includes(entity)) {
          this.removeEntity(entity);
        }
      } else {
        this.addEntity(entity);
      }
```

with:

```ts
      // Deferred structural changes are idempotent — two systems expressing
      // the same intent in one frame converge to the same state (synchronous
      // calls stay strict and throw on misuse). Without the add guard, a
      // repeated deferred add re-entered addEntity's synchronous double-add
      // throw mid-flush, far from the offending call site.
      if (isRemoval) {
        if (this.entities.includes(entity)) {
          this.removeEntity(entity);
        }
      } else if (!this.entities.includes(entity)) {
        this.addEntity(entity);
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/World.test.ts`
Expected: PASS (all — including the existing `removing and re-adding the same entity…` test, which pins that remove-then-re-add still works through the FIFO flush).

- [ ] **Step 5: Commit**

```bash
git add source/engine/ecs/World.ts tests/World.test.ts
git commit -m "Make deferred entity adds idempotent"
```

---

### Task 9: Full-suite verification

Cross-cutting check: Task 6 in particular touches a module-singleton channel used across several test files; run everything.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass (coverage report prints; no thresholds are configured, so pass/fail is the tests themselves).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no output errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exits 0. If `no-console` flags the new `console.warn` calls (Tasks 3 and 6), add `// eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)` above each and re-run.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix verification fallout from engine repairs"
```

If nothing needed fixing, there is nothing to commit — the work is already committed per task.
