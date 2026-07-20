# Tiled Object Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Tiled object layers into game-owned entity factories, render tile flip flags with matching collision, resolve the entity layer by a `class="entities"` marker, add player-only trigger volumes with enter/exit events (doors + sound zone), and reset the Tiled authoring pipeline.

**Architecture:** The engine (`source/engine/tiled/`) parses Tiled JSON into plain data (`Tilemap.objectLayers`, per-tile flip flags, multi-rectangle collision); the game (`source/game/`) maps `object.type` to factory functions in a plain record and runs the spawn loop in `world.onStart`. Triggers are data-only `TriggerComponent` entities tested against the player by `triggerSystem`; `doorSystem`/`zoneSystem` consume buffered `TriggerEnter` events exactly like `WallHit`.

**Tech Stack:** TypeScript, Pixi.js 8, Zod 4 (existing `tiled-tools` schemas — no schema changes), Vitest + happy-dom, Tiled CLI (dev-only, for the export script).

**Spec:** `docs/superpowers/specs/2026-07-18-tiled-object-layers-design.md`

## Global Constraints

- **Error policy:** one shape everywhere — DEV throws, prod warns and degrades (the existing `failUnsupported` pattern). The §7 table in the spec is normative; every degradation listed there must match exactly.
- **Rectangles and points only** for map objects; every other kind (ellipse, polygon, polyline, text, tile object with `gid`, template, `rotation !== 0`) fails loud. Tileset collision groups: rectangles only, non-rects fail loud and the rectangles are kept.
- **Triggers are player-only**; event payloads carry the entity so widening later is additive. **Enter + exit only, no stay event.** Strict overlap (touching edges do not count).
- **Layer roles via Tiled's `class` field**, value `"entities"` marks the entity layer. Exactly one required; prod falls back to index 1.
- **Thin engine:** no engine spawner class; factories and the spawn loop are game code. `Map` never touches object layers.
- **World coordinates are art px** (the `pixelScale` transform lives on the root container).
- **Landing order:** the entity-layer-marker code lands in the same commit as the `map.json` that carries `class: "entities"` (Task 6); the spawn-loop switch lands in the same commit as the `map.json` that carries the object layer (Task 10).
- **Code style:** `#name` private fields (never `_name`); `let` for locals (matching existing files); options-object constructors mirroring the nearest existing class (`new X({options})`, no factories, no positional args); one function per file in `utilities/`; never remove existing comments (adapt wording when a rename makes them stale); prefer self-documenting code to new comments.
- **Commit style:** imperative sentence, no conventional-commit prefix (matches `git log`: "Add Continue to the main menu").
- **Before every commit:** `npm run lint` and `npm run typecheck` must pass.
- **Test command:** `npx vitest run tests/<file>.test.ts` (coverage is only enabled by the `npm test` script). `import.meta.env.DEV` is `true` under Vitest, so DEV-throw paths are the testable ones (the existing suite's convention).
- **No new dependencies.**

## File Structure

Created:
- `source/engine/utilities/failUnsupported.ts` — the shared DEV-throw/prod-warn helper (extracted from `Tilemap.ts`)
- `source/utilities/doRectanglesOverlap.ts` — strict-overlap predicate (sibling of `doRectanglesIntersect`)
- `source/game/getPositionForBoundingBoxCenter.ts` — position an entity so its bounding box centers on a point
- `source/game/TriggerComponent.ts`, `source/game/TriggerEnter.ts`, `source/game/TriggerExit.ts`, `source/game/triggerEnterChannel.ts`, `source/game/triggerExitChannel.ts`
- `source/game/triggerSystem.ts`, `source/game/doorSystem.ts`, `source/game/zoneSystem.ts`
- `source/game/objectFactories.ts` — the `Record<string, (object: TilemapObject) => Entity>`
- `scripts/export-assets.mjs` + npm script `export-assets`
- `assets/` — untracked Tiled project (`.gitignore` with `*`, `map.tmx`, `tileset.tsx`, `tileset.png`, `somewhere.tiled-project`)
- Tests: `tests/doRectanglesOverlap.test.ts`, `tests/getPositionForBoundingBoxCenter.test.ts`, `tests/triggerSystem.test.ts`, `tests/doorSystem.test.ts`, `tests/zoneSystem.test.ts`, `tests/objectFactories.test.ts`, `tests/worldSpawn.test.ts`, `tests/exportedAssets.test.ts`

Modified:
- `source/engine/tiled/Tilemap.ts` — object layers, property normalization, flip decode, `tileGids` → `tiles`
- `source/engine/tiled/getGid.ts`, `getHorizontalFlip.ts`, `getVerticalFlip.ts`, `getDiagonalFlip.ts`, `getRotatedHex120.ts` — retype `TileGid` → `TileGidWithFlags`
- `source/engine/tiled/Tileset.ts` — `boundingBox?` → `collisionBoxes: Rectangle[]`
- `source/engine/tiled/Map.ts` — flip rendering, collision transform, y-sort over boxes, `entityLayerIndex`
- `source/game/WallHit.ts`, `source/game/motionSystem.ts`, `source/game/wallHitPopupSystem.ts` — `WallHit` gains `box`; multi-box collision loops
- `source/game/graphicsSystem.ts`, `source/game/playerSystem.ts`, `source/game/playerPool.ts`, `source/game/world.ts`, `source/game/assets.ts`
- `scripts/generate-placeholder-audio.mjs` — `chime.wav`
- `public/map.json` (hand-edited JSON in Tasks 5/6/10; regenerated by the export script in Task 13), `public/bump.wav`-style new `public/chime.wav`
- Tests migrating: `tests/Tilemap.test.ts`, `tests/Tileset.test.ts`, `tests/Map.test.ts`, `tests/motionSystem.test.ts`, `tests/uiBridge.test.ts`, `tests/graphicsSystem.test.ts`, `tests/playerSystem.test.ts`

Task order: engine data model (1–2), wall-hit precision (3), multi-box collision (4), flip rendering (5), entity-layer marker (6), game utilities (7–8), triggers (9), spawn loop (10), doors (11), zone + chime (12), authoring pipeline + acceptance (13).

---

### Task 1: Tilemap object-layer parsing

`Tilemap.from` currently rejects object layers loudly. Teach it to parse them into plain data (`TilemapObject`, `TilemapObjectLayer`), flatten Tiled property arrays to a record, skip invisible objects, reject unsupported object kinds loudly, and capture each tile layer's `class`. Also extract `failUnsupported` into a shared engine utility (Tileset, Map, and the game spawn loop need it in later tasks).

**Files:**
- Create: `source/engine/utilities/failUnsupported.ts`
- Modify: `source/engine/tiled/Tilemap.ts`
- Modify: `tests/Map.test.ts` (fixtures gain `objectLayers: []`)
- Test: `tests/Tilemap.test.ts`

**Interfaces:**
- Consumes: `tiledObjectGroupLayerSchema`, `tiledObjectSchema`, `tiledPropertySchema` (already part of `tiledTilemapSchema` — no schema changes).
- Produces (later tasks rely on these exact shapes):

```ts
export type TilemapObject = {
  id: number; // Tiled object id, unique per map; door targets reference it
  name: string;
  type: string; // '' when unset; factories dispatch on this
  x: number; // art px; top-left for rects, the point itself for points
  y: number;
  width: number; // 0 for points
  height: number;
  point: boolean;
  properties: Record<string, boolean | number | string>;
};

export type TilemapObjectLayer = {
  name: string;
  objects: TilemapObject[];
};

// TilemapLayer gains `class: string | undefined`; Tilemap gains
// `readonly objectLayers: readonly TilemapObjectLayer[]` and TilemapOptions
// gains a required `objectLayers` field.
// failUnsupported(message: string): void — DEV throw, prod console.warn.
```

- [ ] **Step 1: Write the failing tests**

In `tests/Tilemap.test.ts`, add two fixture helpers next to `createTileLayer`:

```ts
function createObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    height: 16,
    id: 1,
    name: 'door-a',
    rotation: 0,
    type: 'door',
    visible: true,
    width: 16,
    x: 32,
    y: 48,
    ...overrides,
  };
}

function createObjectLayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    draworder: 'topdown',
    id: 2,
    name: 'objects',
    objects: [createObject()],
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
    ...overrides,
  };
}
```

Delete the `'throws in DEV on an object layer'` test (it inverts into support) and add a new describe block:

```ts
describe('Tilemap.from object layers', () => {
  test('parses a rectangle object into plain data', async () => {
    let tilemap = await Tilemap.from(
      createTiledTilemap({layers: [createTileLayer(), createObjectLayer()]}),
    );

    expect(tilemap.layers).toHaveLength(1);
    expect(tilemap.objectLayers).toEqual([
      {
        name: 'objects',
        objects: [
          {
            id: 1,
            name: 'door-a',
            type: 'door',
            x: 32,
            y: 48,
            width: 16,
            height: 16,
            point: false,
            properties: {},
          },
        ],
      },
    ]);
  });

  test('parses a point object (width/height 0, point true)', async () => {
    let source = createTiledTilemap({
      layers: [
        createObjectLayer({
          objects: [createObject({height: 0, point: true, type: 'spawn', width: 0, x: 152, y: 175})],
        }),
      ],
    });
    let tilemap = await Tilemap.from(source);

    expect(tilemap.objectLayers[0]!.objects[0]).toMatchObject({
      type: 'spawn',
      x: 152,
      y: 175,
      width: 0,
      height: 0,
      point: true,
    });
  });

  test('flattens properties: bool, int, float, string pass through; object becomes the referenced id; color and file become strings', async () => {
    let source = createTiledTilemap({
      layers: [
        createObjectLayer({
          objects: [
            createObject({
              properties: [
                {name: 'locked', type: 'bool', value: true},
                {name: 'count', type: 'int', value: 2},
                {name: 'speed', type: 'float', value: 1.5},
                {name: 'sound', type: 'string', value: 'chime'},
                {name: 'target', type: 'object', value: 3},
                {name: 'tint', type: 'color', value: '#ff00cc'},
                {name: 'clip', type: 'file', value: 'chime.wav'},
              ],
            }),
          ],
        }),
      ],
    });
    let tilemap = await Tilemap.from(source);

    expect(tilemap.objectLayers[0]!.objects[0]!.properties).toEqual({
      locked: true,
      count: 2,
      speed: 1.5,
      sound: 'chime',
      target: 3,
      tint: '#ff00cc',
      clip: 'chime.wav',
    });
  });

  test('throws in DEV on a class-typed property', async () => {
    let source = createTiledTilemap({
      layers: [
        createObjectLayer({
          objects: [
            createObject({
              properties: [{name: 'stats', type: 'class', propertytype: 'Stats', value: {}}],
            }),
          ],
        }),
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "class"/);
  });

  test('skips invisible objects silently', async () => {
    let source = createTiledTilemap({
      layers: [createObjectLayer({objects: [createObject({visible: false})]})],
    });
    let tilemap = await Tilemap.from(source);

    expect(tilemap.objectLayers[0]!.objects).toEqual([]);
  });

  test.each([
    ['ellipse', {ellipse: true}],
    ['polygon', {polygon: [{x: 0, y: 0}, {x: 8, y: 8}, {x: 0, y: 8}]}],
    ['polyline', {polyline: [{x: 0, y: 0}, {x: 8, y: 8}]}],
    ['text', {text: {text: 'hello'}}],
    ['tile object', {gid: 5}],
    ['template', {template: 'door.tx'}],
    ['rotation', {rotation: 45}],
  ])('throws in DEV on an unsupported object kind: %s', async (kind, overrides) => {
    let source = createTiledTilemap({
      layers: [createObjectLayer({objects: [createObject(overrides)]})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported kind/);
  });

  test('captures the tile layer class', async () => {
    let tilemap = await Tilemap.from(
      createTiledTilemap({layers: [createTileLayer({class: 'entities'})]}),
    );

    expect(tilemap.layers[0]!.class).toBe('entities');
  });

  test('a tile layer without a class captures undefined', async () => {
    let tilemap = await Tilemap.from(createTiledTilemap());

    expect(tilemap.layers[0]!.class).toBeUndefined();
  });
});
```

Also update the first existing test's layer assertion to include the new field:

```ts
    expect(tilemap.layers).toEqual([{class: undefined, tileGids: [1, 2]}]);
    expect(tilemap.objectLayers).toEqual([]);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Tilemap.test.ts`
Expected: FAIL — `objectLayers` is undefined / object-layer sources still throw `unsupported type "objectgroup"`.

- [ ] **Step 3: Extract `failUnsupported`**

Create `source/engine/utilities/failUnsupported.ts` (move the function and its comment out of `Tilemap.ts` verbatim, exported):

```ts
// DEV-throw / prod-warn on unsupported input (the ObjectPool.destroy
// precedent): a silent drop reproduces as an inexplicably empty map layer,
// and a warn alone gets missed in development.
export function failUnsupported(message: string): void {
  if (import.meta.env.DEV) {
    throw new Error(message);
  }

  // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
  console.warn(message);
}
```

In `Tilemap.ts`, delete the local copy and import it: `import {failUnsupported} from '../utilities/failUnsupported.js';`

- [ ] **Step 4: Implement object-layer parsing in `Tilemap.ts`**

Add the imports and types:

```ts
import {type TiledProperty} from '../../tiled-tools/TiledProperty.js';
```

Add `TilemapObject` and `TilemapObjectLayer` exactly as in the Interfaces block above. Extend the layer type and options:

```ts
export type TilemapLayer = {
  class: string | undefined; // Tiled layer class; marks the entity layer
  tileGids: TileGid[];
};

export type TilemapOptions = {
  tileWidth: number;
  tileHeight: number;
  columnCount: number;
  rowCount: number;
  tilesets: TilemapTileset[];
  layers: TilemapLayer[];
  objectLayers: TilemapObjectLayer[];
};
```

Add the module-local normalizer above the class:

```ts
// The flattening is lossy by design: an object-typed property becomes the
// referenced object id, indistinguishable from a plain count — id validation
// (door targets) is the safety net.
function normalizeProperties(
  tiledProperties: readonly TiledProperty[] | undefined,
): Record<string, boolean | number | string> {
  let properties: Record<string, boolean | number | string> = {};

  for (let tiledProperty of tiledProperties ?? []) {
    switch (tiledProperty.type) {
      case 'class': {
        failUnsupported(
          `Property "${tiledProperty.name}" has unsupported type "class"! Use string, int, float, bool, color, file, or object properties. The property is dropped.`,
        );

        break;
      }

      case 'color':
      case 'file': {
        properties[tiledProperty.name] = tiledProperty.value as string;

        break;
      }

      case 'object': {
        // An object property's value is the referenced object's id.
        properties[tiledProperty.name] = tiledProperty.value as number;

        break;
      }

      default: {
        properties[tiledProperty.name] = tiledProperty.value;
      }
    }
  }

  return properties;
}
```

In the class, add the field (mirroring `layers`):

```ts
  readonly objectLayers: readonly TilemapObjectLayer[] = [];
```

assign it in the constructor from the new option, and in `from()` replace the layer loop's head with an object-group branch before the existing `type !== 'tilelayer'` rejection:

```ts
    let layers: TilemapLayer[] = [];
    let objectLayers: TilemapObjectLayer[] = [];

    for (let tiledTilemapLayer of tiledTilemap.layers) {
      if (tiledTilemapLayer.type === 'objectgroup') {
        let objects: TilemapObject[] = [];

        for (let tiledObject of tiledTilemapLayer.objects) {
          // The standard Tiled way to keep disabled objects in a map.
          if (!tiledObject.visible) {
            continue;
          }

          if (
            tiledObject.ellipse ||
            tiledObject.polygon ||
            tiledObject.polyline ||
            tiledObject.text ||
            tiledObject.gid !== undefined ||
            tiledObject.template !== undefined ||
            (tiledObject.rotation ?? 0) !== 0
          ) {
            failUnsupported(
              `Object "${tiledObject.name}" (id ${tiledObject.id}) in layer "${tiledTilemapLayer.name}" has an unsupported kind! Only unrotated rectangles and points are supported; remove ellipses, polygons, polylines, text, tile objects, templates, and rotations. The object is skipped.`,
            );

            continue;
          }

          objects.push({
            id: tiledObject.id,
            name: tiledObject.name,
            type: tiledObject.type ?? '',
            x: tiledObject.x,
            y: tiledObject.y,
            width: tiledObject.width,
            height: tiledObject.height,
            point: tiledObject.point ?? false,
            properties: normalizeProperties(tiledObject.properties),
          });
        }

        objectLayers.push({name: tiledTilemapLayer.name, objects});

        continue;
      }

      if (tiledTilemapLayer.type !== 'tilelayer') {
        failUnsupported(
          `Layer "${tiledTilemapLayer.name}" has unsupported type "${tiledTilemapLayer.type}"! Only tile and object layers are supported; remove image and group layers from the map.`,
        );

        continue;
      }
```

Keep the rest of the tile-layer body unchanged for now (base64 check, flip-flag loud check, `tileGids`), but push the class through:

```ts
      layers.push({
        class: tiledTilemapLayer.class,
        tileGids,
      });
```

and pass `objectLayers` into `new this({...})`.

- [ ] **Step 5: Fix the `Tilemap` fixtures in `tests/Map.test.ts`**

`TilemapOptions` now requires `class` per layer and `objectLayers`. In both `stubAssets` and `stubDepthSortAssets`, extend the `new Tilemap({...})` calls: each layer object gains `class: undefined,` before `tileGids`, and the options gain `objectLayers: [],` after `layers`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/Tilemap.test.ts tests/Map.test.ts`
Expected: PASS (all, including the migrated existing tests).

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/engine/utilities/failUnsupported.ts source/engine/tiled/Tilemap.ts tests/Tilemap.test.ts tests/Map.test.ts
git commit -m "Parse Tiled object layers into plain data"
```

---

### Task 2: Tilemap flip decode (`tileGids` → `tiles`)

Replace `TilemapLayer.tileGids` with `tiles: TilemapLayerTile[]` carrying decoded flip flags. The unused flip-bit helpers get their callers and are retyped from `TileGid` to `TileGidWithFlags`. The hex-120 bit stays a loud failure (renders unrotated in prod). `Map` adapts minimally (reads `tile.gid`, ignores flips until Task 5).

**Files:**
- Modify: `source/engine/tiled/Tilemap.ts`
- Modify: `source/engine/tiled/getGid.ts`, `getHorizontalFlip.ts`, `getVerticalFlip.ts`, `getDiagonalFlip.ts`, `getRotatedHex120.ts`
- Modify: `source/engine/tiled/Map.ts` (iteration only)
- Test: `tests/Tilemap.test.ts`, `tests/Map.test.ts`

**Interfaces:**
- Consumes: `TileGidWithFlags` (existing brand, `source/engine/tiled/TileGidWithFlags.ts`), flag constants in `constants.ts`.
- Produces:

```ts
export type TilemapLayerTile = {
  gid: TileGid; // flags stripped
  flipHorizontal: boolean;
  flipVertical: boolean;
  flipDiagonal: boolean;
};

export type TilemapLayer = {
  class: string | undefined;
  tiles: TilemapLayerTile[];
};

// Helpers after retype:
// getGid(gid: TileGidWithFlags): TileGid
// getHorizontalFlip / getVerticalFlip / getDiagonalFlip / getRotatedHex120
//   (gid: TileGidWithFlags): boolean
```

- [ ] **Step 1: Write the failing tests**

In `tests/Tilemap.test.ts`: delete the `'throws in DEV on a tile GID carrying flip/rotation flags'` test (it inverts into support). Update the import of constants:

```ts
import {
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  ROTATED_HEXAGONAL_120_FLAG,
} from '../source/engine/tiled/constants.js';
```

Update the first test's layer assertion:

```ts
    expect(tilemap.layers).toEqual([
      {
        class: undefined,
        tiles: [
          {gid: 1, flipHorizontal: false, flipVertical: false, flipDiagonal: false},
          {gid: 2, flipHorizontal: false, flipVertical: false, flipDiagonal: false},
        ],
      },
    ]);
```

Add a describe block:

```ts
describe('Tilemap.from flip decode', () => {
  test.each([
    [0, false, false, false],
    [FLIPPED_HORIZONTALLY_FLAG, true, false, false],
    [FLIPPED_VERTICALLY_FLAG, false, true, false],
    [FLIPPED_HORIZONTALLY_FLAG + FLIPPED_VERTICALLY_FLAG, true, true, false],
    [FLIPPED_DIAGONALLY_FLAG, false, false, true],
    [FLIPPED_DIAGONALLY_FLAG + FLIPPED_HORIZONTALLY_FLAG, true, false, true],
    [FLIPPED_DIAGONALLY_FLAG + FLIPPED_VERTICALLY_FLAG, false, true, true],
    [
      FLIPPED_DIAGONALLY_FLAG + FLIPPED_HORIZONTALLY_FLAG + FLIPPED_VERTICALLY_FLAG,
      true,
      true,
      true,
    ],
  ])('decodes flags %i into H=%s V=%s D=%s with the gid stripped', async (flags, h, v, d) => {
    let tilemap = await Tilemap.from(
      createTiledTilemap({layers: [createTileLayer({data: [flags + 2, 1]})]}),
    );

    expect(tilemap.layers[0]!.tiles[0]).toEqual({
      gid: 2,
      flipHorizontal: h,
      flipVertical: v,
      flipDiagonal: d,
    });
  });

  test('throws in DEV on the hexagonal-120 rotation flag', async () => {
    let source = createTiledTilemap({
      layers: [createTileLayer({data: [1, ROTATED_HEXAGONAL_120_FLAG + 2]})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/hexagonal-120/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Tilemap.test.ts`
Expected: FAIL — `tiles` is undefined; flagged gids still throw the old "flipped or rotated tile" error.

- [ ] **Step 3: Retype the flip-bit helpers**

In each of `getGid.ts`, `getHorizontalFlip.ts`, `getVerticalFlip.ts`, `getDiagonalFlip.ts`, `getRotatedHex120.ts`: change the import and parameter type from `TileGid` to `TileGidWithFlags` (`import {type TileGidWithFlags} from './TileGidWithFlags.js';`). `getGid` keeps returning `TileGid` (keep its `TileGid` import; the body already casts `as TileGid`).

- [ ] **Step 4: Implement flip decode in `Tilemap.ts`**

Replace `TilemapLayer` with the Interfaces shape above and add the `TilemapLayerTile` export. Add imports:

```ts
import {getDiagonalFlip} from './getDiagonalFlip.js';
import {getHorizontalFlip} from './getHorizontalFlip.js';
import {getRotatedHex120} from './getRotatedHex120.js';
import {getVerticalFlip} from './getVerticalFlip.js';
import {type TileGidWithFlags} from './TileGidWithFlags.js';
```

In `from()`, delete the `flaggedIndex` loud check and its comment (the T1.7 placeholder it announced is now implemented), delete the `let tileGids = ...` line, and build tiles instead:

```ts
      let tiles = tiledTilemapLayer.data.map((value) => {
        // The brand has no constructor, so the parse boundary casts once.
        let gidWithFlags = value as TileGidWithFlags;

        if (getRotatedHex120(gidWithFlags)) {
          failUnsupported(
            `Tile layer "${tiledTilemapLayer.name}" has a tile with the hexagonal-120 rotation flag! The flag only applies to hexagonal maps; remove the rotation in Tiled. The tile renders unrotated.`,
          );
        }

        return {
          gid: getGid(gidWithFlags),
          flipHorizontal: getHorizontalFlip(gidWithFlags),
          flipVertical: getVerticalFlip(gidWithFlags),
          flipDiagonal: getDiagonalFlip(gidWithFlags),
        };
      });

      layers.push({
        class: tiledTilemapLayer.class,
        tiles,
      });
```

`toTileGid` stays imported (still used for `firstgid`).

- [ ] **Step 5: Adapt `Map.ts` iteration**

In the constructor, change the tile loop head to:

```ts
      for (let [tileIndex, layerTile] of tilemapLayer.tiles.entries()) {
        let tilesetTile = tilemap.getTile(layerTile.gid);
```

(No flip handling yet — Task 5.)

- [ ] **Step 6: Migrate the `tests/Map.test.ts` fixtures**

Add near the top:

```ts
import {type TilemapLayerTile} from '../source/engine/tiled/Tilemap.js';

function tile(gid: number): TilemapLayerTile {
  return {gid: toTileGid(gid), flipHorizontal: false, flipVertical: false, flipDiagonal: false};
}
```

Replace every `tileGids: [toTileGid(n), ...]` layer with `tiles: [tile(n), ...]` (three layers across the two stubs).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/Tilemap.test.ts tests/Map.test.ts`
Expected: PASS.

- [ ] **Step 8: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/engine/tiled/ tests/Tilemap.test.ts tests/Map.test.ts
git commit -m "Decode tile flip flags into per-tile layer data"
```

---

### Task 3: `WallHit` carries the clipping box

`WallHit` gains the specific map-space rectangle that clipped the movement, so consumers stop reaching through `tile.boundingBox` (which becomes ambiguous once tiles carry several boxes in Task 4). `wallHitPopupSystem` places the spark against the event's box and drops its `?? 0` fallbacks. `uiBridge` keeps forwarding only `tile` to `world:wallHit`.

**Files:**
- Modify: `source/game/WallHit.ts`, `source/game/motionSystem.ts`, `source/game/wallHitPopupSystem.ts`
- Test: `tests/motionSystem.test.ts`, `tests/uiBridge.test.ts`

**Interfaces:**
- Produces: `WallHit = defineEvent<{entity: Entity; tile: MapTile; box: pixi.Rectangle}>()` — `box` is map-space art px. `defineEvent` payloads are fully required, so every construction site (including tests) adds `box`.

- [ ] **Step 1: Write the failing test**

In `tests/motionSystem.test.ts`, extend the first test (`'sustained contact fires exactly one WallHit; re-contact fires again'`) right after the existing frame-2 assertion `expect(wallHitChannel.events).toHaveLength(1);`:

```ts
    // The event carries the map-space rectangle that clipped the movement.
    expect(wallHitChannel.events[0]!.box).toMatchObject({x: 32, y: 0, width: 32, height: 32});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/motionSystem.test.ts`
Expected: FAIL — `box` is undefined on the event.

- [ ] **Step 3: Implement**

`source/game/WallHit.ts` becomes:

```ts
import type * as pixi from 'pixi.js';

import {type Entity} from '../engine/ecs/Entity.js';
import {defineEvent} from '../engine/ecs/Event.js';
import {type MapTile} from '../engine/tiled/Map.js';

export const WallHit = defineEvent<{entity: Entity; tile: MapTile; box: pixi.Rectangle}>();
```

`source/game/motionSystem.ts`: add `import * as pixi from 'pixi.js';` at the top. Declare the tracker next to `contactTile`:

```ts
      let contactTile;
      let contactBox;
```

In **both** axis passes, replace `contactTile ??= tile;` with (the locals `tileX`/`tileY` are already in scope):

```ts
              if (contactTile === undefined) {
                contactTile = tile;
                contactBox = new pixi.Rectangle(
                  tileX,
                  tileY,
                  tile.boundingBox.width,
                  tile.boundingBox.height,
                );
              }
```

(The `!tile.boundingBox` guard above already narrows it, but if TypeScript complains inside the closure-free loop, read the box into a local `let box = tile.boundingBox;` right after the guard and use `box` throughout — Task 4 rewrites these loops anyway.)

The edge-trigger push becomes:

```ts
        if (contactTile !== undefined && contactBox !== undefined && !motion.isTouchingWall) {
          wallHitChannel.push(new WallHit({entity, tile: contactTile, box: contactBox}));
        }
```

`source/game/wallHitPopupSystem.ts`: replace the loop head

```ts
    for (let {entity, box} of wallHitChannel.events) {
```

delete the `let box = tile.boundingBox;` line and the four `tileX`/`tileY`/`tileWidth`/`tileHeight` locals, and compute the contact point from the event box:

```ts
      let contactX = Math.max(box.x, Math.min(playerCenterX, box.x + box.width));
      let contactY = Math.max(box.y, Math.min(playerCenterY, box.y + box.height));
```

Update the payload comment above the loop to: `` // `WallHit` carries `{entity, tile, box}`: the map-space box that clipped the movement and the entity (the player) that hit it. `` and adjust the spark-placement comment to "the point on the hit collision box nearest the player's center".

- [ ] **Step 4: Migrate `tests/uiBridge.test.ts`**

All three `new WallHit({...})` sites gain a box. Add `import type * as pixi from 'pixi.js';` and one module-level stub next to `let entity = ...`, following the file's cast style:

```ts
let box = {} as unknown as pixi.Rectangle;
```

then `new WallHit({entity, tile, box})` / `new WallHit({entity, tile: tileA, box})` / `new WallHit({entity, tile: tileB, box})`. The emitted `world:wallHit` payload assertions stay `{tile}`-only — uiBridge still forwards only the tile.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/motionSystem.test.ts tests/uiBridge.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/game/WallHit.ts source/game/motionSystem.ts source/game/wallHitPopupSystem.ts tests/motionSystem.test.ts tests/uiBridge.test.ts
git commit -m "Carry the clipping collision box on WallHit"
```

---

### Task 4: Multi-rectangle tile collision

`TilesetTile.boundingBox?` becomes `collisionBoxes: pixi.Rectangle[]` (empty = no collision), collecting every rectangle in a tile's collision objectgroup. `MapTile` mirrors it, the y-sort key becomes the max bottom edge over the boxes, and `motionSystem`'s axis passes loop over the boxes per tile (the `WallHit` box is the specific rectangle that clipped).

**Files:**
- Modify: `source/engine/tiled/Tileset.ts`, `source/engine/tiled/Map.ts`, `source/game/motionSystem.ts`
- Test: `tests/Tileset.test.ts`, `tests/Map.test.ts`, `tests/motionSystem.test.ts`

**Interfaces:**
- Produces:

```ts
export type TilesetTile = {
  id: TileId;
  textures: Texture[];
  collisionBoxes: Rectangle[]; // empty = no collision
};

export type MapTile = {
  view: pixi.Container;
  collisionBoxes: pixi.Rectangle[]; // empty = no collision, cell-relative art px
};
```

- [ ] **Step 1: Write the failing tests**

`tests/Tileset.test.ts` — in `createTiledTileset`, give the objectgroup a second rectangle (after the existing `{height: 8, ..., x: 0, y: 8}` object):

```ts
            {
              height: 4,
              id: 2,
              name: '',
              rotation: 0,
              type: '',
              visible: true,
              width: 6,
              x: 10,
              y: 0,
            },
```

Replace the `'a collision object becomes the tile bounding box...'` test with:

```ts
  test('every collision rectangle is collected; tiles without an objectgroup get an empty array', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.getTile(1).collisionBoxes).toHaveLength(2);
    expect(tileset.getTile(1).collisionBoxes[0]).toMatchObject({x: 0, y: 8, width: 16, height: 8});
    expect(tileset.getTile(1).collisionBoxes[1]).toMatchObject({x: 10, y: 0, width: 6, height: 4});
    expect(tileset.getTile(0).collisionBoxes).toEqual([]);
  });

  test('throws in DEV on a non-rectangle shape in a collision group', async () => {
    stubImage();

    let source = createTiledTileset() as {tiles: Array<{objectgroup: {objects: unknown[]}}>};

    source.tiles[0]!.objectgroup.objects.push({
      ellipse: true,
      height: 8,
      id: 3,
      name: '',
      rotation: 0,
      type: '',
      visible: true,
      width: 8,
      x: 0,
      y: 0,
    });

    await expect(Tileset.from(source)).rejects.toThrow(/collision group/);
  });
```

The `Tileset.getTile` describe's fixture tile gains `collisionBoxes: []`.

`tests/Map.test.ts` — in `stubDepthSortAssets`, the tileset tile's `boundingBox: new pixi.Rectangle(0, 8, 16, 8)` becomes `collisionBoxes: [new pixi.Rectangle(0, 8, 16, 8)]` (and every fixture tile without collision gains `collisionBoxes: []` — `stubAssets` has two, `stubDepthSortAssets` has one, plus the animated tile). Add to the depth-sorting describe:

```ts
  test('the y-sort key is the max bottom edge over all collision boxes', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [
        {
          id: toTileId(0),
          textures: [pixi.Texture.WHITE],
          collisionBoxes: [new pixi.Rectangle(0, 2, 16, 4), new pixi.Rectangle(0, 5, 16, 6)],
        },
      ],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 2,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [{class: undefined, tiles: [tile(1), tile(1)]}],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);

    let map = new Map({assetName: 'map'});

    // row 1 offset 16 + max(2 + 4, 5 + 6) = 27.
    expect(map.layers[0]!.tiles[0]![1]!.view.zIndex).toBe(27);
  });

  test('a boxless tile keeps the bare row offset as its y-sort key', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});

    expect(map.layers[0]!.tiles[0]![1]!.view.zIndex).toBe(16);
  });
```

`tests/motionSystem.test.ts` — migrate the stub: `boundingBox: {...}` → `collisionBoxes: [{...}]` for the solid tile, `boundingBox: undefined` → `collisionBoxes: []` for the empty tile. Add a multi-box describe (reusing `tick`, `stubComponent`):

```ts
// One tile at x 32..64 carrying two small boxes: a top-left block at map-space
// (32, 0, 4, 8) and a bottom-left block at (32, 24, 4, 8).
function createMultiBoxWorld(playerAt: {x: number; y: number}, velocity: {x: number; y: number}) {
  let solid = {
    view: {x: 32, y: 0},
    collisionBoxes: [
      {x: 0, y: 0, width: 4, height: 8},
      {x: 0, y: 24, width: 4, height: 8},
    ],
  };
  let empty = {view: {x: 0, y: 0}, collisionBoxes: []};
  let map = {
    columnCount: 2,
    rowCount: 1,
    width: 64,
    height: 32,
    layers: [undefined, {tiles: [[empty], [solid]]}],
  };
  let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
  let motion = new MotionComponent({
    position: new Vector(playerAt.x, playerAt.y),
    velocity: new Vector(velocity.x, velocity.y),
  });
  let player = new Entity({
    components: [
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(wallHitChannel)
        .addEntityQuery(levelQuery)
        .addSystem(motionSystem)
        .addEntity(level)
        .addEntity(player);
    },
  });

  return {world, motion};
}

describe('motionSystem multi-box tiles', () => {
  test('the X pass reports the specific box it clipped against', () => {
    // Moving right at y 24 can only hit the bottom box (32, 24, 4, 8).
    let {world, motion} = createMultiBoxWorld({x: 20, y: 24}, {x: 8, y: 0});

    world.start();
    world.update(tick(1));

    // Contact begins this frame; the end-of-update swap makes the event
    // readable immediately (same rhythm as the existing wall-hit tests).
    expect(motion.position.x).toBe(24); // clipped flush against the box
    expect(wallHitChannel.events).toHaveLength(1);
    expect(wallHitChannel.events[0]!.box).toMatchObject({x: 32, y: 24, width: 4, height: 8});

    world.stop();
  });

  test('the Y pass reports the specific box it clipped against', () => {
    // Moving down at x 33 (inside the boxes' 32..36 column) from above the
    // bottom box.
    let {world, motion} = createMultiBoxWorld({x: 33, y: 10}, {x: 0, y: 10});

    world.start();
    world.update(tick(1));

    expect(motion.position.y).toBe(16); // clipped flush against the box top (24 - 8)
    expect(wallHitChannel.events).toHaveLength(1);
    expect(wallHitChannel.events[0]!.box).toMatchObject({x: 32, y: 24, width: 4, height: 8});

    world.stop();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Tileset.test.ts tests/Map.test.ts tests/motionSystem.test.ts`
Expected: FAIL — `collisionBoxes` doesn't exist yet (type errors count as failures here).

- [ ] **Step 3: Implement `Tileset.ts`**

Add `import {failUnsupported} from '../utilities/failUnsupported.js';`. Change `TilesetTile` to the Interfaces shape. In `from()`, tile construction gains `collisionBoxes: []`:

```ts
      let tile: TilesetTile = {
        id: tileId,
        textures: [texture],
        collisionBoxes: [],
      };
```

Replace the whole `if (tiledTileset.tiles) { ... objects[0] ... }` collision block with:

```ts
    if (tiledTileset.tiles) {
      for (let tilemapTile of tiledTileset.tiles) {
        for (let object of tilemapTile.objectgroup?.objects ?? []) {
          if (
            object.ellipse ||
            object.polygon ||
            object.polyline ||
            object.text ||
            object.point ||
            object.gid !== undefined ||
            (object.rotation ?? 0) !== 0
          ) {
            failUnsupported(
              `Tile ${tilemapTile.id} has a non-rectangle shape in its collision group! Only unrotated rectangles are supported; the rectangles are kept.`,
            );

            continue;
          }

          tiles[tilemapTile.id]!.collisionBoxes.push(
            new Rectangle(object.x, object.y, object.width, object.height),
          );
        }
      }
    }
```

- [ ] **Step 4: Implement `Map.ts`**

`MapTile` becomes the Interfaces shape. In the constructor: `let tile: MapTile = {view: new pixi.Container(), collisionBoxes: []};` — the `boundingBox` clone block inside `if (tilesetTile)` becomes:

```ts
          for (let box of tilesetTile.collisionBoxes) {
            tile.collisionBoxes.push(box.clone());
          }
```

and the zIndex line becomes:

```ts
        // y-sort key: the max bottom edge over the collision boxes; boxless
        // tiles contribute 0, so their zIndex stays the bare row offset.
        let maxBottom = 0;

        for (let box of tile.collisionBoxes) {
          maxBottom = Math.max(maxBottom, box.y + box.height);
        }

        tile.view.zIndex = row * tilemap.tileHeight + maxBottom;
```

- [ ] **Step 5: Implement `motionSystem.ts`**

In both axis passes, replace the `if (!tile.boundingBox) { continue; }` guard and the `tile.boundingBox` reads with a per-box loop. The complete X pass becomes:

```ts
      // X-axis pass: move only along X, clip against tile walls.
      if (deltaX !== 0) {
        let tentativeX = motion.position.x + deltaX;

        for (let column = 0; column < map.columnCount; column++) {
          for (let row = 0; row < map.rowCount; row++) {
            let tile = layer.tiles[column]![row]!;

            for (let box of tile.collisionBoxes) {
              let tileX = tile.view.x + box.x;
              let tileY = tile.view.y + box.y;
              let tileRight = tileX + box.width;
              let tileBottom = tileY + box.height;
              let playerX = tentativeX + boundingBox.x;
              let playerY = motion.position.y + boundingBox.y;
              let playerRight = playerX + boundingBox.width;
              let playerBottom = playerY + boundingBox.height;

              // Strict overlap: touching edges don't count, so the player can slide flush along a wall.
              if (
                playerRight > tileX &&
                tileRight > playerX &&
                playerBottom > tileY &&
                tileBottom > playerY
              ) {
                if (contactTile === undefined) {
                  contactTile = tile;
                  contactBox = new pixi.Rectangle(tileX, tileY, box.width, box.height);
                }

                if (deltaX > 0) {
                  // Guard against teleport-backward when already stuck inside a tile.
                  tentativeX = Math.max(
                    motion.position.x,
                    tileX - boundingBox.x - boundingBox.width,
                  );
                } else {
                  tentativeX = Math.min(motion.position.x, tileRight - boundingBox.x);
                }
              }
            }
          }
        }

        deltaX = tentativeX - motion.position.x;
      }
```

The Y pass gets the identical treatment: wrap its body in the same `for (let box of tile.collisionBoxes)` loop, derive `tileX`/`tileY`/`tileRight`/`tileBottom` from `box` instead of `tile.boundingBox`, and replace its `contactTile ??= tile;` with the same `if (contactTile === undefined) { contactTile = tile; contactBox = new pixi.Rectangle(tileX, tileY, box.width, box.height); }` block — its player locals (`motion.position.x + deltaX`, `tentativeY`) and its two `tentativeY` clip lines stay exactly as they are in the file. In the big swept-range TODO comment, update the stale terms only: "almost no tiles have a boundingBox" → "almost no tiles have collision boxes", and "a tile boundingBox larger than its 16-art-px cell" → "a tile collision box larger than its 16-art-px cell"; keep everything else verbatim (the invariants still hold — first hit in column-major order now means first hit in column-major-then-box order).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/Tileset.test.ts tests/Map.test.ts tests/motionSystem.test.ts tests/uiBridge.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/engine/tiled/Tileset.ts source/engine/tiled/Map.ts source/game/motionSystem.ts tests/Tileset.test.ts tests/Map.test.ts tests/motionSystem.test.ts
git commit -m "Keep every collision rectangle per tile"
```

---

### Task 5: Flip rendering and collision transforms

Render the decoded flip flags: the tile sprite gets `anchor` 0.5 at the cell center and the flip combination becomes rotation plus scale signs — on the child sprite only, so `tile.view` stays at the cell's top-left corner (camera math, y-sort key, and `motionSystem`'s `tile.view.x + box.x` reads untouched). Collision boxes are transformed within the cell in the same spec order (diagonal, then horizontal, then vertical). Diagonal flip on a non-square tile grid fails loud. Hand-edit `public/map.json` with a "flip zoo" so the demo shows it.

The 8 combinations (D = diagonal applied first, then H, then V):

| D | H | V | angle | scale.x | scale.y |
| - | - | - | ----- | ------- | ------- |
| 0 | 0 | 0 | 0     | 1       | 1       |
| 0 | 1 | 0 | 0     | -1      | 1       |
| 0 | 0 | 1 | 0     | 1       | -1      |
| 0 | 1 | 1 | 0     | -1      | -1      |
| 1 | 0 | 0 | 90    | 1       | -1      |
| 1 | 1 | 0 | 90    | 1       | 1       |
| 1 | 0 | 1 | -90   | 1       | 1       |
| 1 | 1 | 1 | 90    | -1      | 1       |

Sanity anchors: D+H is Tiled's rotate-right (pure 90° clockwise), D+V is rotate-left, H+V is 180°.

**Files:**
- Modify: `source/engine/tiled/Map.ts`, `public/map.json`
- Test: `tests/Map.test.ts`

**Interfaces:**
- Consumes: `TilemapLayerTile` flip fields (Task 2), `TilesetTile.collisionBoxes` (Task 4), `failUnsupported`.
- Produces: no new API — behavior only. Collision transform (cell size `s`, spec order): D: `(x, y, w, h) → (y, x, h, w)`; H: `x → s - x - w`; V: `y → s - y - h`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Map.test.ts`. The flip fixtures need a `tile()` variant with flags:

```ts
function flippedTile(
  gid: number,
  flips: {h?: boolean; v?: boolean; d?: boolean},
): TilemapLayerTile {
  return {
    gid: toTileGid(gid),
    flipHorizontal: flips.h ?? false,
    flipVertical: flips.v ?? false,
    flipDiagonal: flips.d ?? false,
  };
}
```

New describe block:

```ts
describe('Map flip rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubFlipAssets(
    tiles: TilemapLayerTile[],
    options: {tileHeight?: number; collisionBoxes?: pixi.Rectangle[]} = {},
  ) {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: options.tileHeight ?? 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [
        {
          id: toTileId(0),
          textures: [pixi.Texture.WHITE],
          collisionBoxes: options.collisionBoxes ?? [],
        },
      ],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: options.tileHeight ?? 16,
      columnCount: tiles.length,
      rowCount: 1,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [{class: undefined, tiles}],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);
  }

  test.each([
    [{}, 0, 1, 1],
    [{h: true}, 0, -1, 1],
    [{v: true}, 0, 1, -1],
    [{h: true, v: true}, 0, -1, -1],
    [{d: true}, 90, 1, -1],
    [{d: true, h: true}, 90, 1, 1],
    [{d: true, v: true}, -90, 1, 1],
    [{d: true, h: true, v: true}, 90, -1, 1],
  ])('flips %o render as angle %i, scale (%i, %i)', (flips, angle, scaleX, scaleY) => {
    stubFlipAssets([flippedTile(1, flips)]);

    let map = new Map({assetName: 'map'});
    let sprite = map.layers[0]!.tiles[0]![0]!.view.children[0] as pixi.Sprite;

    expect(sprite.angle).toBe(angle);
    expect(sprite.scale.x).toBe(scaleX);
    expect(sprite.scale.y).toBe(scaleY);
  });

  test('a flipped sprite is centered in its cell; an unflipped one keeps the top-left default', () => {
    stubFlipAssets([flippedTile(1, {h: true}), flippedTile(1, {})]);

    let map = new Map({assetName: 'map'});
    let flipped = map.layers[0]!.tiles[0]![0]!.view.children[0] as pixi.Sprite;
    let plain = map.layers[0]!.tiles[1]![0]!.view.children[0] as pixi.Sprite;

    expect(flipped.anchor.x).toBe(0.5);
    expect(flipped.anchor.y).toBe(0.5);
    expect(flipped.position.x).toBe(8);
    expect(flipped.position.y).toBe(8);
    expect(plain.anchor.x).toBe(0);
    expect(plain.position.x).toBe(0);
  });

  test.each([
    // Box (0, 12, 16, 4): a bottom strip.
    [{h: true}, {x: 0, y: 12, width: 16, height: 4}], // horizontally symmetric box: unchanged
    [{v: true}, {x: 0, y: 0, width: 16, height: 4}], // flips to a top strip
    [{d: true}, {x: 12, y: 0, width: 4, height: 16}], // transposes to a right-edge pole
    [{d: true, h: true}, {x: 0, y: 0, width: 4, height: 16}], // rotate-right: left-edge pole
  ])('collision boxes follow the art under flips %o', (flips, expected) => {
    stubFlipAssets([flippedTile(1, flips)], {
      collisionBoxes: [new pixi.Rectangle(0, 12, 16, 4)],
    });

    let map = new Map({assetName: 'map'});

    expect(map.layers[0]!.tiles[0]![0]!.collisionBoxes[0]).toMatchObject(expected);
  });

  test('the y-sort key uses the transformed boxes', () => {
    // D transposes (0, 12, 16, 4) to (12, 0, 4, 16): bottom edge 16, not 16 from 12+4.
    stubFlipAssets([flippedTile(1, {d: true})], {
      collisionBoxes: [new pixi.Rectangle(0, 12, 16, 4)],
    });

    let map = new Map({assetName: 'map'});

    // row 0 offset 0 + transposed bottom edge 16.
    expect(map.layers[0]!.tiles[0]![0]!.view.zIndex).toBe(16);
  });

  test('throws in DEV on a diagonal flip when tiles are not square', () => {
    expect(() => {
      stubFlipAssets([flippedTile(1, {d: true})], {tileHeight: 8});

      return new Map({assetName: 'map'});
    }).toThrow(/non-square/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Map.test.ts`
Expected: FAIL — sprites render unflipped (angle 0, scale 1), boxes untransformed.

- [ ] **Step 3: Implement in `Map.ts`**

Add `import {failUnsupported} from '../utilities/failUnsupported.js';`. Inside the constructor's `if (tilesetTile)` block, first refactor the sprite creation to a local (keep the animated-sprite comment where it is):

```ts
        if (tilesetTile) {
          let sprite;

          if (tilesetTile.textures.length <= 1) {
            sprite = new pixi.Sprite(tilesetTile.textures[0]);
          } else {
            // Off Pixi's shared clock: mapSystem drives these via map.update()
            // on the world's update path, so a paused world freezes them by
            // construction (game UI design §3).
            let animatedSprite = new pixi.AnimatedSprite(tilesetTile.textures, false);

            animatedSprite.animationSpeed = 0.15;

            animatedSprite.play();

            this.#animatedSprites.push(animatedSprite);
            sprite = animatedSprite;
          }

          tile.view.addChild(sprite);
```

Then, still inside the `if (tilesetTile)` block, apply the flips (destructure with `let` — `flipDiagonal` is reassigned by the degradation path):

```ts
          let {flipHorizontal, flipVertical, flipDiagonal} = layerTile;

          // A diagonal flip is an x/y transpose; it has no home in a
          // non-square cell.
          if (flipDiagonal && tilemap.tileWidth !== tilemap.tileHeight) {
            failUnsupported(
              `A diagonally flipped tile sits on a non-square tile grid (${tilemap.tileWidth}x${tilemap.tileHeight})! Diagonal flips need square tiles; the tile renders untransposed.`,
            );

            flipDiagonal = false;
          }

          if (flipHorizontal || flipVertical || flipDiagonal) {
            // The flip combination becomes rotation plus scale signs on the
            // child sprite only: tile.view stays at the cell's top-left
            // corner, so camera math, the y-sort key, and motionSystem's
            // tile.view.x + box.x reads are untouched.
            sprite.anchor.set(0.5);
            sprite.position.set(tilemap.tileWidth / 2, tilemap.tileHeight / 2);

            // Tiled applies the diagonal flip (transpose) first, then
            // horizontal, then vertical.
            if (flipDiagonal) {
              sprite.angle = flipVertical && !flipHorizontal ? -90 : 90;
              sprite.scale.set(
                flipHorizontal && flipVertical ? -1 : 1,
                !flipHorizontal && !flipVertical ? -1 : 1,
              );
            } else {
              sprite.scale.set(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
            }
          }
```

and replace the plain clone loop from Task 4 with the transforming version (still inside `if (tilesetTile)`; `flipDiagonal` here is the already-degraded local, so a non-square grid also keeps its boxes untransposed, matching the art):

```ts
          // Collision follows the art: the same D-then-H-then-V order,
          // applied within the cell.
          for (let tilesetBox of tilesetTile.collisionBoxes) {
            let box = tilesetBox.clone();

            if (flipDiagonal) {
              let {x, y, width, height} = box;

              box.x = y;
              box.y = x;
              box.width = height;
              box.height = width;
            }

            if (flipHorizontal) {
              box.x = tilemap.tileWidth - box.x - box.width;
            }

            if (flipVertical) {
              box.y = tilemap.tileHeight - box.y - box.height;
            }

            tile.collisionBoxes.push(box);
          }
        }
```

The zIndex computation from Task 4 stays after this block and picks up the transformed boxes automatically.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/Map.test.ts`
Expected: PASS.

- [ ] **Step 5: Hand-edit the flip zoo into `public/map.json`**

Five copies of gid 130 (the hut front-wall piece, collision box (0, 12, 16, 4)) on the "stuff" layer at row 20, columns 20–28 (art px y 320, x 320–464): plain, H, V, D, D+H. Flag bits: H = 2147483648, V = 1073741824, D = 536870912. Run from the repo root:

```bash
node - <<'EOF'
const fs = require('node:fs');
const map = JSON.parse(fs.readFileSync('public/map.json', 'utf8'));
const stuff = map.layers.find((layer) => layer.name === 'stuff');
Object.assign(stuff.data, {
  820: 130, // (20, 20) plain reference
  822: 2147483778, // (22, 20) H: art mirrored
  824: 1073741954, // (24, 20) V: upside down, collision strip moves to the top
  826: 536871042, // (26, 20) D: transposed, right-edge collision pole
  828: 2684354690, // (28, 20) D+H: rotate right, left-edge collision pole
});
fs.writeFileSync('public/map.json', JSON.stringify(map, null, 2) + '\n');
EOF
```

Verify: `git diff public/map.json` shows exactly five changed data values (indexes 820–828 of the second layer) and no other changes.

- [ ] **Step 6: Eyeball it in the running game**

Run: `npm run develop`, open http://localhost:5000, start a New Game, walk right/down from the spawn to (roughly) the middle-right of the map. Expected: five wall pieces in a row — mirrored, upside down, and rotated variants — and walking into each collides where the art is (e.g. the D variant blocks only at its right edge). Stop the server.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/engine/tiled/Map.ts tests/Map.test.ts public/map.json
git commit -m "Render tile flips with collision following the art"
```

---

### Task 6: Entity layer by marker

`Map` resolves `readonly entityLayerIndex` — the index of the single tile layer whose `class` is `"entities"`. Exactly one required; DEV throws, prod warns and falls back to index 1 (today's behavior, so a stale export degrades to the status quo rather than a collisionless map). All four former index-1 sites read it. Lands in the same commit as the `map.json` marker.

**Files:**
- Modify: `source/engine/tiled/Map.ts`, `source/game/motionSystem.ts`, `source/game/graphicsSystem.ts`, `public/map.json`
- Test: `tests/Map.test.ts` (+ stub fields in `tests/motionSystem.test.ts`, `tests/graphicsSystem.test.ts`)

**Interfaces:**
- Produces: `Map.entityLayerIndex: number` (readonly). `addToLayer(view, layerIndex = this.entityLayerIndex)` and `removeFromLayer(view, layerIndex = this.entityLayerIndex)`. Game map stubs in tests need an `entityLayerIndex` field from now on.

- [ ] **Step 1: Write the failing tests**

In `tests/Map.test.ts`, `stubDepthSortAssets` marks its second layer: `{class: 'entities', tiles: [tile(1), tile(2)]}` (first stays `class: undefined`). `stubAssets` (single layer) marks its only layer `class: 'entities'`. The flip-zoo stubs from Task 5 (`stubFlipAssets`, the y-sort fixtures from Task 4) keep `class: undefined` — update them to `class: 'entities'` too, since resolution now throws without a marker. Add:

```ts
describe('Map entity-layer marker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves entityLayerIndex to the single entities-class layer', () => {
    stubDepthSortAssets();

    let map = new Map({assetName: 'map'});

    expect(map.entityLayerIndex).toBe(1);
  });

  test('throws in DEV when no tile layer carries class "entities"', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [{id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []}],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [{class: undefined, tiles: [tile(1)]}],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);

    expect(() => new Map({assetName: 'map'})).toThrow(/exactly one tile layer/);
  });

  test('throws in DEV when two tile layers carry class "entities"', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [{id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []}],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [
        {class: 'entities', tiles: [tile(1)]},
        {class: 'entities', tiles: [tile(1)]},
      ],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);

    expect(() => new Map({assetName: 'map'})).toThrow(/exactly one tile layer/);
  });
});
```

The existing depth-sort test (`'only the entity layer (index 1) sorts its children by zIndex'`) keeps passing — via the marker now.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Map.test.ts`
Expected: FAIL — `entityLayerIndex` undefined; the throw tests construct fine.

- [ ] **Step 3: Implement in `Map.ts`**

Add the field after `readonly layers: MapLayer[];`:

```ts
  readonly entityLayerIndex: number;
```

In the constructor, right after the `tilemap instanceof Tilemap` guard:

```ts
    // The single tile layer whose class is "entities": the collision source,
    // the y-sorted layer, and addToLayer's default. A stale export without
    // the marker degrades to index 1 (yesterday's hardcoded behavior) rather
    // than a collisionless map.
    let entityLayerIndexes = tilemap.layers.flatMap((tilemapLayer, index) =>
      tilemapLayer.class === 'entities' ? [index] : [],
    );

    if (entityLayerIndexes.length === 1) {
      this.entityLayerIndex = entityLayerIndexes[0]!;
    } else {
      failUnsupported(
        `Expected exactly one tile layer with class "entities", found ${entityLayerIndexes.length}! Set the class on the entity layer in Tiled (Layer > Layer Properties). Falling back to layer index 1.`,
      );

      this.entityLayerIndex = 1;
    }
```

The `sortableChildren` loop becomes `layer.view.sortableChildren = index === this.entityLayerIndex;`, and the first sentence of its comment block changes from "Layer 1 is the entity layer (addToLayer's default):" to "The entities-class layer (entityLayerIndex, addToLayer's default) is the entity layer:" — the rest stays verbatim. The two method signatures become:

```ts
  addToLayer(view: pixi.Container, layerIndex = this.entityLayerIndex) {
  removeFromLayer(view: pixi.Container, layerIndex = this.entityLayerIndex) {
```

- [ ] **Step 4: Point the two remaining index-1 sites at it**

`source/game/motionSystem.ts`: `let layer = map.layers[1]!;` → `let layer = map.layers[map.entityLayerIndex]!;`

`source/game/graphicsSystem.ts`: in both `onAddEntity` and `onRemoveEntity`, `let layerIndex = graphics.overlay ? map.topLayerIndex : 1;` → `let layerIndex = graphics.overlay ? map.topLayerIndex : map.entityLayerIndex;`

Test stubs: in `tests/motionSystem.test.ts`, `createMapStub()`'s return and the Task-4 multi-box `map` literal gain `entityLayerIndex: 1,`; in `tests/graphicsSystem.test.ts`, all three `map` stub literals gain `entityLayerIndex: 1,`.

- [ ] **Step 5: Mark the shipped map**

```bash
node - <<'EOF'
const fs = require('node:fs');
const map = JSON.parse(fs.readFileSync('public/map.json', 'utf8'));
map.layers.find((layer) => layer.name === 'stuff').class = 'entities';
fs.writeFileSync('public/map.json', JSON.stringify(map, null, 2) + '\n');
EOF
```

Verify with `git diff public/map.json`: one added `"class": "entities"` line on the stuff layer.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/Map.test.ts tests/motionSystem.test.ts tests/graphicsSystem.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck, commit (code + marked map together — landing order)**

```bash
npm run lint && npm run typecheck
git add source/engine/tiled/Map.ts source/game/motionSystem.ts source/game/graphicsSystem.ts public/map.json tests/Map.test.ts tests/motionSystem.test.ts tests/graphicsSystem.test.ts
git commit -m "Resolve the entity layer by its class marker"
```

---

### Task 7: `doRectanglesOverlap`

The strict-overlap predicate (touching edges do not count), sibling of the edge-inclusive `doRectanglesIntersect` — same one-predicate-per-file shape, same 8-number signature. `doRectanglesIntersect` keeps its semantics and stays unused. `motionSystem`'s two axis passes keep their hand-inlined copies; `triggerSystem` (Task 9) is the third copy, where the test earns a name.

**Files:**
- Create: `source/utilities/doRectanglesOverlap.ts`
- Test: `tests/doRectanglesOverlap.test.ts`

**Interfaces:**
- Produces: `doRectanglesOverlap(x1, y1, width1, height1, x2, y2, width2, height2): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/doRectanglesOverlap.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {doRectanglesOverlap} from '../source/utilities/doRectanglesOverlap.js';

describe('doRectanglesOverlap', () => {
  test('overlapping rectangles overlap', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  test('a contained rectangle overlaps', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 2, 2, 4, 4)).toBe(true);
  });

  test('touching edges do not count (strict, unlike doRectanglesIntersect)', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
    expect(doRectanglesOverlap(0, 0, 10, 10, 0, 10, 10, 10)).toBe(false);
  });

  test('separated rectangles do not overlap', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 20, 0, 10, 10)).toBe(false);
    expect(doRectanglesOverlap(0, 0, 10, 10, 0, 20, 10, 10)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/doRectanglesOverlap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `source/utilities/doRectanglesOverlap.ts`:

```ts
/**
 * Strict overlap: touching edges do not count, matching wall collision
 * (unlike the edge-inclusive `doRectanglesIntersect`), so sliding flush
 * along an edge never counts as overlapping.
 */
export function doRectanglesOverlap(
  x1: number,
  y1: number,
  width1: number,
  height1: number,
  x2: number,
  y2: number,
  width2: number,
  height2: number,
): boolean {
  return x1 + width1 > x2 && x2 + width2 > x1 && y1 + height1 > y2 && y2 + height2 > y1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/doRectanglesOverlap.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/utilities/doRectanglesOverlap.ts tests/doRectanglesOverlap.test.ts
git commit -m "Add a strict rectangle-overlap predicate"
```

---

### Task 8: Bounding-box centering helper

"Position the entity so its bounding box centers on a point" appears three times (spawn factory, door teleport, tap targeting), so it becomes one game-local function. `playerSystem`'s tap path adopts it, deleting its two magic-number TODOs (`- 8`, `- 15` — both derived from the player's bounding box `(0, 10, 16, 10)`); those TODO comments are resolved by this change and go away with the numbers.

**Files:**
- Create: `source/game/getPositionForBoundingBoxCenter.ts`
- Modify: `source/game/playerSystem.ts`
- Test: `tests/getPositionForBoundingBoxCenter.test.ts`, `tests/playerSystem.test.ts`

**Interfaces:**
- Produces: `getPositionForBoundingBoxCenter(center: Vector, boundingBox: pixi.Rectangle): Vector` — returns a new `Vector`; position = center − box offset − half box size.
- `playerSystem.components` becomes `[PlayerComponent, MotionComponent, GraphicsComponent]` (the player always carries all three; the tap path needs the box).

- [ ] **Step 1: Write the failing test**

Create `tests/getPositionForBoundingBoxCenter.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Vector} from '../source/engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from '../source/game/getPositionForBoundingBoxCenter.js';

describe('getPositionForBoundingBoxCenter', () => {
  test('centers the player box (0, 10, 16, 10) on a point', () => {
    // The demo spawn: centering on (152, 175) reproduces the old hardcoded
    // start position (144, 160).
    let position = getPositionForBoundingBoxCenter(
      new Vector(152, 175),
      new pixi.Rectangle(0, 10, 16, 10),
    );

    expect(position.x).toBe(144);
    expect(position.y).toBe(160);
  });

  test('an offset-free box centers symmetrically', () => {
    let position = getPositionForBoundingBoxCenter(
      new Vector(10, 10),
      new pixi.Rectangle(0, 0, 8, 8),
    );

    expect(position.x).toBe(6);
    expect(position.y).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/getPositionForBoundingBoxCenter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `source/game/getPositionForBoundingBoxCenter.ts`:

```ts
import type * as pixi from 'pixi.js';

import {Vector} from '../engine/utilities/Vector.js';

/**
 * The entity position that centers its bounding box on `center` (map-space
 * art px). Shared by the spawn factory, door teleports, and tap targeting.
 */
export function getPositionForBoundingBoxCenter(
  center: Vector,
  boundingBox: pixi.Rectangle,
): Vector {
  return new Vector(
    center.x - boundingBox.x - boundingBox.width / 2,
    center.y - boundingBox.y - boundingBox.height / 2,
  );
}
```

- [ ] **Step 4: Adopt it in `playerSystem.ts`**

Add imports (`GraphicsComponent`, `getPositionForBoundingBoxCenter`), extend the components tuple:

```ts
  components: [PlayerComponent, MotionComponent, GraphicsComponent],
```

and replace the tap branch (deleting the two TODO lines with their magic numbers):

```ts
      } else if (input.pressed('move-to')) {
        let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);
        let {boundingBox} = entity.getComponent(GraphicsComponent);

        motion.target = getPositionForBoundingBoxCenter(
          new Vector(
            input.tapPosition.x + cameraPosition.x,
            input.tapPosition.y + cameraPosition.y,
          ),
          boundingBox,
        );
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      } else if (motion.target === undefined) {
```

- [ ] **Step 5: Migrate `tests/playerSystem.test.ts`**

The system now requires `GraphicsComponent`, so the fixture player gains a stub. Copy the `stubComponent` helper (and its explanatory comment) from `tests/motionSystem.test.ts`, import `type Component`, `type Constructor`, and `GraphicsComponent`, and extend `createWorld`'s player:

```ts
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 10, width: 16, height: 10}}),
    ],
  });
```

The box `(0, 10, 16, 10)` reproduces the old `- 8` / `- 15` offsets, so the existing tap assertion (`102`, `55`) still holds; update its comment to say the offsets come from centering the bounding box.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/getPositionForBoundingBoxCenter.test.ts tests/playerSystem.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/game/getPositionForBoundingBoxCenter.ts source/game/playerSystem.ts tests/getPositionForBoundingBoxCenter.test.ts tests/playerSystem.test.ts
git commit -m "Center bounding boxes on points through one helper"
```

---

### Task 9: Trigger volumes with enter/exit events

`TriggerComponent` (data only), `TriggerEnter`/`TriggerExit` events with their own buffered channels (the `WallHit` pattern), and `triggerSystem`: player-only, strict overlap, edge-triggered via per-trigger `isPlayerInside` state. A trigger's first test seeds `undefined` state from the current overlap without emitting, so a restored save whose position already sits inside a trigger stays silent on load (`applyStagedSave` runs in `gameScreen.onShow` before the first tick, so the seed sees the restored position). Registered in the real world directly after `motionSystem`.

**Files:**
- Create: `source/game/TriggerComponent.ts`, `source/game/TriggerEnter.ts`, `source/game/TriggerExit.ts`, `source/game/triggerEnterChannel.ts`, `source/game/triggerExitChannel.ts`, `source/game/triggerSystem.ts`
- Modify: `source/game/world.ts`
- Test: `tests/triggerSystem.test.ts`

**Interfaces:**
- Produces (Tasks 10–12 rely on these exactly):

```ts
export type TriggerComponentOptions = {
  id: number; // Tiled object id; door targets resolve against this
  name: string;
  type: string;
  rect: pixi.Rectangle; // map-space art px
  properties: Record<string, boolean | number | string>;
};

export class TriggerComponent extends Component {
  // all options fields, plus:
  isPlayerInside: boolean | undefined = undefined; // undefined = unseeded
}

export const TriggerEnter = defineEvent<{entity: Entity; trigger: Entity}>();
export const TriggerExit = defineEvent<{entity: Entity; trigger: Entity}>();
export const triggerEnterChannel = new EventChannel({event: TriggerEnter, displayName: 'Trigger enter'});
export const triggerExitChannel = new EventChannel({event: TriggerExit, displayName: 'Trigger exit'});
```

- [ ] **Step 1: Write the failing tests**

Create `tests/triggerSystem.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';
import {triggerExitChannel} from '../source/game/triggerExitChannel.js';
import {triggerSystem} from '../source/game/triggerSystem.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// GraphicsComponent builds a real Sprite from an asset name in its
// constructor; bypass it and assign the stub fields onto the real prototype
// so `entity.getComponent` (keyed by `.constructor`) still resolves it.
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

// playersQuery/triggerSystem are module singletons: every test must
// world.stop() so the next one can register them again; afterEach stops via
// activeWorld even when an assertion throws mid-test.
let activeWorld: World | null = null;

function createWorld(playerAt: {x: number; y: number}, rect: pixi.Rectangle) {
  let motion = new MotionComponent({
    position: new Vector(playerAt.x, playerAt.y),
    velocity: new Vector(0, 0),
  });
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let trigger = new Entity({
    components: [
      new TriggerComponent({id: 1, name: 'zone', type: 'zone', rect, properties: {}}),
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel)
        .addEventChannel(triggerExitChannel)
        .addEntityQuery(playersQuery)
        .addSystem(triggerSystem)
        .addEntity(player)
        .addEntity(trigger);
    },
  });

  activeWorld = world;

  return {world, motion, player, trigger};
}

describe('triggerSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('enter fires exactly once on overlap start and stays silent while inside', () => {
    let {world, motion, player, trigger} = createWorld({x: 0, y: 0}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick()); // seeds: outside

    expect(triggerEnterChannel.events).toHaveLength(0);

    motion.position.set(12, 0); // box 12..20 overlaps 16..32
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1);
    expect(triggerEnterChannel.events[0]!.entity).toBe(player);
    expect(triggerEnterChannel.events[0]!.trigger).toBe(trigger);

    world.update(tick()); // still inside

    expect(triggerEnterChannel.events).toHaveLength(0);
  });

  test('exit fires on leave and the trigger re-arms', () => {
    let {world, motion} = createWorld({x: 0, y: 0}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick()); // seed
    motion.position.set(12, 0);
    world.update(tick()); // enter
    motion.position.set(0, 0);
    world.update(tick());

    expect(triggerExitChannel.events).toHaveLength(1);

    motion.position.set(12, 0);
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1); // re-armed
  });

  test('flush edge contact never fires (strict overlap)', () => {
    // Player box 0..8 exactly touches the rect starting at 8.
    let {world} = createWorld({x: 0, y: 0}, new pixi.Rectangle(8, 0, 16, 16));

    world.start();
    world.update(tick()); // seed
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(0);
  });

  test('a first test that already overlaps seeds silently and re-arms normally (restored save)', () => {
    let {world, motion} = createWorld({x: 18, y: 2}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick()); // seeds: inside, but no enter event

    expect(triggerEnterChannel.events).toHaveLength(0);

    motion.position.set(40, 0); // walk out: a genuine exit
    world.update(tick());

    expect(triggerExitChannel.events).toHaveLength(1);

    motion.position.set(18, 2); // walk back in: enter fires now
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/triggerSystem.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the component and events**

`source/game/TriggerComponent.ts`:

```ts
import type * as pixi from 'pixi.js';

import {Component} from '../engine/ecs/Component.js';

export type TriggerComponentOptions = {
  id: number; // Tiled object id; door targets resolve against this
  name: string;
  type: string;
  rect: pixi.Rectangle; // map-space art px
  properties: Record<string, boolean | number | string>;
};

export class TriggerComponent extends Component {
  id: number;
  name: string;
  type: string;
  rect: pixi.Rectangle;
  properties: Record<string, boolean | number | string>;

  // undefined = unseeded: triggerSystem's first test seeds it from the
  // current overlap without emitting, so a restored save that loads inside a
  // trigger stays silent.
  isPlayerInside: boolean | undefined = undefined;

  constructor({id, name, type, rect, properties}: TriggerComponentOptions) {
    super();

    this.id = id;
    this.name = name;
    this.type = type;
    this.rect = rect;
    this.properties = properties;
  }
}
```

`source/game/TriggerEnter.ts` (and `TriggerExit.ts`, identical but for the name):

```ts
import {type Entity} from '../engine/ecs/Entity.js';
import {defineEvent} from '../engine/ecs/Event.js';

export const TriggerEnter = defineEvent<{entity: Entity; trigger: Entity}>();
```

`source/game/triggerEnterChannel.ts` (and `triggerExitChannel.ts`, mirroring `wallHitChannel.ts`):

```ts
import {EventChannel} from '../engine/ecs/EventChannel.js';
import {TriggerEnter} from './TriggerEnter.js';

export const triggerEnterChannel = new EventChannel({
  event: TriggerEnter,
  displayName: 'Trigger enter',
});
```

- [ ] **Step 4: Implement `triggerSystem.ts`**

```ts
import {System} from '../engine/ecs/System.js';
import {doRectanglesOverlap} from '../utilities/doRectanglesOverlap.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';
import {TriggerComponent} from './TriggerComponent.js';
import {TriggerEnter} from './TriggerEnter.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';
import {TriggerExit} from './TriggerExit.js';
import {triggerExitChannel} from './triggerExitChannel.js';

export const triggerSystem = new System({
  displayName: 'Trigger system',
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    let playerEntity = playersQuery.getFirst();
    let graphics = playerEntity.getComponent(GraphicsComponent);

    // The player always carries GraphicsComponent; the query just cannot
    // prove it (it only requires Player + Motion).
    if (graphics === undefined) {
      return;
    }

    let {position} = playerEntity.getComponent(MotionComponent);
    let {boundingBox} = graphics;
    let playerX = position.x + boundingBox.x;
    let playerY = position.y + boundingBox.y;

    for (let entity of system.entities) {
      let trigger = entity.getComponent(TriggerComponent);
      let isInside = doRectanglesOverlap(
        playerX,
        playerY,
        boundingBox.width,
        boundingBox.height,
        trigger.rect.x,
        trigger.rect.y,
        trigger.rect.width,
        trigger.rect.height,
      );

      // First test: seed from the current overlap without emitting, so a
      // restored save already inside a door or zone stays silent on load.
      if (trigger.isPlayerInside === undefined) {
        trigger.isPlayerInside = isInside;

        continue;
      }

      if (isInside && !trigger.isPlayerInside) {
        triggerEnterChannel.push(new TriggerEnter({entity: playerEntity, trigger: entity}));
      } else if (!isInside && trigger.isPlayerInside) {
        triggerExitChannel.push(new TriggerExit({entity: playerEntity, trigger: entity}));
      }

      trigger.isPlayerInside = isInside;
    }
  },
});
```

(Import path note: from `source/game/` the utilities live at `../utilities/`.)

- [ ] **Step 5: Register in the real world**

In `source/game/world.ts`: import `triggerEnterChannel`, `triggerExitChannel`, `triggerSystem`. Add after the `playSoundChannel` registration:

```ts
    world.addEventChannel(triggerEnterChannel);
    world.addEventChannel(triggerExitChannel);
```

and after `world.addSystem(motionSystem);`:

```ts
    world.addSystem(triggerSystem); // right after motionSystem: overlap tests read the just-resolved position
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/triggerSystem.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/game/TriggerComponent.ts source/game/TriggerEnter.ts source/game/TriggerExit.ts source/game/triggerEnterChannel.ts source/game/triggerExitChannel.ts source/game/triggerSystem.ts source/game/world.ts tests/triggerSystem.test.ts
git commit -m "Add player trigger volumes with enter and exit events"
```

---

### Task 10: Object factories and the spawn loop

The game maps `object.type` to factories in a plain record; `world.onStart` walks every object of every object layer, dispatches, and adds the entities. Spawn-count rules live in the loop (a factory that never runs cannot degrade anything); door-target validation runs once after the loop. `playerPool` loses its hardcoded `initialX`/`initialY` — the spawn factory positions the player. Lands in the same commit as the `map.json` that carries the object layer (spawn point at the old start position, two doors, one sound zone).

Demo object placement (validated against the collision layout — the hut sits at tile cols 10–12, rows 7–10; everything else is open grass):
- Spawn point at art px (152, 175) — today's hardcoded spawn `(144, 160)` expressed as the bounding-box center.
- Door A "door-hut" at rect (176, 176, 16, 16) — the tile directly below the hut's doorway column.
- Door B "door-far" at rect (480, 480, 16, 16) — open grass across the map; the separation makes held-direction ping-pong impossible.
- Zone "chime-zone" at rect (192, 240, 48, 48) — 3×3 tiles of open ground southeast of the spawn, `sound: "chime"`.

**Files:**
- Create: `source/game/objectFactories.ts`
- Modify: `source/game/playerPool.ts`, `source/game/world.ts`, `public/map.json`
- Test: `tests/objectFactories.test.ts`, `tests/worldSpawn.test.ts`

**Interfaces:**
- Consumes: `TilemapObject` (Task 1), `TriggerComponent` (Task 9), `getPositionForBoundingBoxCenter` (Task 8), `failUnsupported`, `Tilemap.objectLayers`.
- Produces: `objectFactories: Record<string, (object: TilemapObject) => Entity>` with keys `spawn`, `door`, `zone`. `world.onStop` now finds the player through `playersQuery` (guarded, see below) — the module-level `playerEntity` variable goes away.

- [ ] **Step 1: Write the failing factory tests**

Create `tests/objectFactories.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {type TilemapObject} from '../source/engine/tiled/Tilemap.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {objectFactories} from '../source/game/objectFactories.js';
import {playerPool} from '../source/game/playerPool.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';

const SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

// playerPool builds a real Sprite from the 'character' spritesheet; a minimal
// animations bag satisfies the Sprite constructor.
function stubCharacterAsset() {
  let character = {
    animations: Object.fromEntries(SPRITE_NAMES.map((name) => [name, [pixi.Texture.WHITE]])),
  };

  vi.spyOn(pixi.Assets, 'get').mockImplementation((() => character) as never);
}

function createObject(overrides: Partial<TilemapObject> = {}): TilemapObject {
  return {
    id: 1,
    name: '',
    type: '',
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    point: false,
    properties: {},
    ...overrides,
  };
}

describe('objectFactories', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('the record has exactly the three factories', () => {
    expect(Object.keys(objectFactories)).toEqual(['spawn', 'door', 'zone']);
  });

  test('spawn centers the player bounding box on the point', () => {
    stubCharacterAsset();

    let player = objectFactories['spawn']!(
      createObject({type: 'spawn', x: 152, y: 175, width: 0, height: 0, point: true}),
    );
    let {position} = player.getComponent(MotionComponent);

    expect(position.x).toBe(144);
    expect(position.y).toBe(160);

    playerPool.destroy(player); // hand it back for the next test
  });

  test('door builds a TriggerComponent carrying id, name, type, rect, and properties', () => {
    let door = objectFactories['door']!(
      createObject({id: 7, name: 'door-hut', type: 'door', x: 176, y: 176, properties: {target: 3}}),
    );
    let trigger = door.getComponent(TriggerComponent);

    expect(trigger.id).toBe(7);
    expect(trigger.name).toBe('door-hut');
    expect(trigger.type).toBe('door');
    expect(trigger.rect).toMatchObject({x: 176, y: 176, width: 16, height: 16});
    expect(trigger.properties).toEqual({target: 3});
    expect(trigger.isPlayerInside).toBeUndefined();
  });

  test('zone builds a trigger the same way', () => {
    let zone = objectFactories['zone']!(
      createObject({id: 4, name: 'chime-zone', type: 'zone', properties: {sound: 'chime'}}),
    );

    expect(zone.getComponent(TriggerComponent).type).toBe('zone');
    expect(zone.getComponent(TriggerComponent).properties).toEqual({sound: 'chime'});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/objectFactories.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `objectFactories.ts` and slim `playerPool.ts`**

Create `source/game/objectFactories.ts`:

```ts
import * as pixi from 'pixi.js';

import {Entity} from '../engine/ecs/Entity.js';
import {type TilemapObject} from '../engine/tiled/Tilemap.js';
import {Vector} from '../engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playerPool} from './playerPool.js';
import {TriggerComponent} from './TriggerComponent.js';

// Doors and zones are the same data shape: a TriggerComponent entity that
// triggerSystem tests and doorSystem/zoneSystem interpret by type.
function createTrigger(object: TilemapObject): Entity {
  return new Entity({
    components: [
      new TriggerComponent({
        id: object.id,
        name: object.name,
        type: object.type,
        rect: new pixi.Rectangle(object.x, object.y, object.width, object.height),
        properties: object.properties,
      }),
    ],
  });
}

// world.onStart dispatches every map object through this record by type.
// T1.11's level manager is the second consumer and can promote the pattern.
export const objectFactories: Record<string, (object: TilemapObject) => Entity> = {
  spawn: (object) => {
    let player = playerPool.create();
    let position = getPositionForBoundingBoxCenter(
      new Vector(object.x, object.y),
      player.getComponent(GraphicsComponent).boundingBox,
    );

    player.getComponent(MotionComponent).position.set(position.x, position.y);

    return player;
  },
  door: createTrigger,
  zone: createTrigger,
};
```

`source/game/playerPool.ts`: delete the `initialX`/`initialY` constants. `onCreate` positions at the origin (the spawn factory positions the entity after `create()`):

```ts
        new MotionComponent({
          position: new Vector(0, 0),
          velocity: new Vector(0, 0),
        }),
```

`onReset` stops setting the position:

```ts
  onReset: (entity) => {
    let motion = entity.getComponent(MotionComponent);

    // The spawn factory (or the map-center fallback) positions the entity
    // after create().
    motion.velocity.set(0, 0);
    motion.target = undefined;

    return entity;
  },
```

- [ ] **Step 4: Run the factory tests to verify they pass**

Run: `npx vitest run tests/objectFactories.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing world tests**

Create `tests/worldSpawn.test.ts` — this boots the REAL game world (`source/game/world.ts`) against stubbed assets, so it also covers registration order and teardown:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {toTileGid} from '../source/engine/tiled/TileGid.js';
import {Tilemap, type TilemapObject} from '../source/engine/tiled/Tilemap.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {playerPool} from '../source/game/playerPool.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {world} from '../source/game/world.js';

const SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

function spawnObject(overrides: Partial<TilemapObject> = {}): TilemapObject {
  return {
    id: 1,
    name: '',
    type: 'spawn',
    x: 32,
    y: 32,
    width: 0,
    height: 0,
    point: true,
    properties: {},
    ...overrides,
  };
}

function doorObject(id: number, target: number, x: number, y: number): TilemapObject {
  return {
    id,
    name: `door-${id}`,
    type: 'door',
    x,
    y,
    width: 16,
    height: 16,
    point: false,
    properties: {target},
  };
}

function zoneObject(id: number): TilemapObject {
  return {
    id,
    name: 'chime-zone',
    type: 'zone',
    x: 0,
    y: 48,
    width: 16,
    height: 16,
    point: false,
    properties: {sound: 'chime'},
  };
}

// A real 4x4 all-empty Tilemap (gid 0 renders nothing and Map.getTile never
// touches the tileset asset), one entities-class layer, plus the given
// objects. 'character' resolves to a minimal spritesheet bag for the Sprite
// constructor.
function stubAssets(objects: TilemapObject[]) {
  let tilemap = new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 4,
    rowCount: 4,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [
      {
        class: 'entities',
        tiles: Array.from({length: 16}, () => ({
          gid: toTileGid(0),
          flipHorizontal: false,
          flipVertical: false,
          flipDiagonal: false,
        })),
      },
    ],
    objectLayers: [{name: 'objects', objects}],
  });
  let character = {
    animations: Object.fromEntries(SPRITE_NAMES.map((name) => [name, [pixi.Texture.WHITE]])),
  };

  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap : name === 'character' ? character : undefined) as never);
}

describe('world spawn loop', () => {
  afterEach(() => {
    // A DEV-throw mid-onStart leaves the world running; stop() must still
    // clean up the module singletons for the next test.
    if (world.isRunning) {
      world.stop();
    }

    vi.restoreAllMocks();
  });

  test('spawns from map objects: player centered on the point, triggers added, teardown pools the player', () => {
    stubAssets([spawnObject(), doorObject(2, 3, 0, 0), doorObject(3, 2, 48, 48), zoneObject(4)]);

    world.start();

    let {position} = playersQuery.getFirst().getComponent(MotionComponent);

    // (32, 32) minus the box (0, 10, 16, 10) center offsets (8, 15).
    expect(position.x).toBe(24);
    expect(position.y).toBe(17);
    expect(world.entities.filter((entity) => entity.hasComponent(TriggerComponent))).toHaveLength(3);

    let poolSizeBefore = playerPool.getSize();

    world.stop();

    expect(playerPool.getSize()).toBe(poolSizeBefore + 1);
    expect(world.entities).toHaveLength(0);
  });

  test('throws in DEV on an unknown object type', () => {
    stubAssets([spawnObject(), {...zoneObject(9), type: 'treasure'}]);

    expect(() => {
      world.start();
    }).toThrow(/unknown type "treasure"/);
  });

  test('throws in DEV on a second spawn object', () => {
    stubAssets([spawnObject(), spawnObject({id: 2, x: 40, y: 40})]);

    expect(() => {
      world.start();
    }).toThrow(/second spawn/);
  });

  test('throws in DEV when no spawn object exists', () => {
    stubAssets([zoneObject(4)]);

    expect(() => {
      world.start();
    }).toThrow(/No spawn object/);
  });

  test('throws in DEV on a dangling door target', () => {
    stubAssets([spawnObject(), doorObject(2, 99, 0, 0)]);

    expect(() => {
      world.start();
    }).toThrow(/dangling target/);
  });
});
```

- [ ] **Step 6: Run the world tests to verify they fail**

Run: `npx vitest run tests/worldSpawn.test.ts`
Expected: FAIL — the world still hardcodes `playerPool.create()` and never reads object layers (position lands at (0, 0) after Step 3's pool change, no triggers, no throws).

- [ ] **Step 7: Rewrite `world.ts`'s lifecycle**

New imports:

```ts
import * as pixi from 'pixi.js';

import {Tilemap} from '../engine/tiled/Tilemap.js';
import {failUnsupported} from '../engine/utilities/failUnsupported.js';
import {Vector} from '../engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {LevelComponent} from './LevelComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {objectFactories} from './objectFactories.js';
import {TriggerComponent} from './TriggerComponent.js';
```

Delete the module-level `let playerEntity: Entity | null = null;` (keep `mapEntity`). After the existing `mapEntity = mapPool.create(); world.addEntity(mapEntity);` lines (keep their "Map must be added before player" comment), replace the two player lines with the spawn loop:

```ts
    // The spawn loop: every object of every object layer dispatches through
    // the game-owned factory record. Object layers live on the Tilemap asset
    // (not the rendered Map) — they are data for the game.
    let tilemap = pixi.Assets.get<Tilemap | undefined>('map');

    if (!(tilemap instanceof Tilemap)) {
      throw new Error(`Tilemap "map" wasn't found!`);
    }

    let hasSpawn = false;

    for (let objectLayer of tilemap.objectLayers) {
      for (let object of objectLayer.objects) {
        // Spawn-count enforcement lives in the loop, since a factory that
        // never runs cannot degrade anything: a second spawn is loud and
        // skipped before its factory runs (first wins).
        if (object.type === 'spawn') {
          if (hasSpawn) {
            failUnsupported(
              `Object "${object.name}" (id ${object.id}) is a second spawn! Keep exactly one spawn object; the first one wins and this one is skipped.`,
            );

            continue;
          }

          hasSpawn = true;
        }

        let factory = objectFactories[object.type];

        if (factory === undefined) {
          failUnsupported(
            `Object "${object.name}" (id ${object.id}) has unknown type "${object.type}"! Add a factory to objectFactories or fix the type in Tiled. The object is skipped.`,
          );

          continue;
        }

        world.addEntity(factory(object));
      }
    }

    // A missing player crashes every playersQuery.getFirst() consumer, so
    // prod falls back to one at the map center.
    if (!hasSpawn) {
      failUnsupported(
        'No spawn object in the map! Add a point object with type "spawn" in Tiled. Falling back to a player at the map center.',
      );

      let {map} = mapEntity.getComponent(LevelComponent);
      let player = playerPool.create();
      let position = getPositionForBoundingBoxCenter(
        new Vector(map.width / 2, map.height / 2),
        player.getComponent(GraphicsComponent).boundingBox,
      );

      player.getComponent(MotionComponent).position.set(position.x, position.y);
      world.addEntity(player);
    }

    // Door-target validation runs once, after the loop, so forward references
    // resolve (a system hook would fire on addSystem, before any trigger
    // entities exist). A failing door stays spawned and simply goes inert in
    // doorSystem.
    let triggers = world.entities
      .filter((entity) => entity.hasComponent(TriggerComponent))
      .map((entity) => entity.getComponent(TriggerComponent));

    for (let trigger of triggers) {
      if (trigger.type !== 'door') {
        continue;
      }

      // Tiled serializes an unset object property as value 0, which no
      // object id matches, so unset falls out as dangling.
      let target = trigger.properties['target'];

      if (typeof target !== 'number' || !triggers.some((other) => other.id === target)) {
        failUnsupported(
          `Door "${trigger.name}" (id ${trigger.id}) has a missing or dangling target! Set its "target" property to another door object in Tiled. The door is inert.`,
        );
      }
    }
```

TypeScript note: `mapEntity` is a module-level `let`, so if narrowing complains inside the fallback, hold the created entity in a local first (`let level = mapPool.create(); mapEntity = level; world.addEntity(level);`) and read `level.getComponent(...)`.

`onStop` becomes:

```ts
  onStop: () => {
    // Trigger entities are plain entities that World.stop removes; only the
    // pooled player and map need explicit teardown. World.stop runs onStop
    // before removing entities, so the query is still populated. The guard
    // (instead of getFirst()) keeps stop() able to clean up after a DEV
    // throw mid-spawn left no player — the worldSpawn tests rely on it.
    let playerEntity = playersQuery.entities[0];

    if (playerEntity) {
      playerPool.destroy(playerEntity);
    }

    if (mapEntity) {
      mapPool.destroy(mapEntity);
      mapEntity = null;
    }
  },
```

If the `type Entity` import is now unused, drop it.

- [ ] **Step 8: Run the world tests to verify they pass**

Run: `npx vitest run tests/worldSpawn.test.ts tests/objectFactories.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the object layer to `public/map.json`**

```bash
node - <<'EOF'
const fs = require('node:fs');
const map = JSON.parse(fs.readFileSync('public/map.json', 'utf8'));
map.layers.push({
  draworder: 'topdown',
  id: 5,
  name: 'objects',
  objects: [
    {height: 0, id: 1, name: 'spawn', point: true, rotation: 0, type: 'spawn', visible: true, width: 0, x: 152, y: 175},
    {height: 16, id: 2, name: 'door-hut', rotation: 0, type: 'door', visible: true, width: 16, x: 176, y: 176,
     properties: [{name: 'target', type: 'object', value: 3}]},
    {height: 16, id: 3, name: 'door-far', rotation: 0, type: 'door', visible: true, width: 16, x: 480, y: 480,
     properties: [{name: 'target', type: 'object', value: 2}]},
    {height: 48, id: 4, name: 'chime-zone', rotation: 0, type: 'zone', visible: true, width: 48, x: 192, y: 240,
     properties: [{name: 'sound', type: 'string', value: 'chime'}]},
  ],
  opacity: 1,
  type: 'objectgroup',
  visible: true,
  x: 0,
  y: 0,
});
map.nextlayerid = 6;
map.nextobjectid = 5;
fs.writeFileSync('public/map.json', JSON.stringify(map, null, 2) + '\n');
EOF
```

Verify with `git diff public/map.json`: one appended layer, `nextlayerid` 5→6, `nextobjectid` 1→5.

- [ ] **Step 10: Boot the real game**

Run the full suite once (`npm test` — the loud spawn loop now runs in every test that starts the world) and then `npm run develop`: New Game starts at the same position as before (the spawn point reproduces it), walking below the hut still collides as before. The doors and zone do nothing yet — no consumers.

- [ ] **Step 11: Lint, typecheck, commit (code + map together — landing order)**

```bash
npm run lint && npm run typecheck
git add source/game/objectFactories.ts source/game/playerPool.ts source/game/world.ts public/map.json tests/objectFactories.test.ts tests/worldSpawn.test.ts
git commit -m "Spawn map-authored objects through game-owned factories"
```

---

### Task 11: `doorSystem`

Consumes `triggerEnterChannel`: for enters whose trigger type is `door`, resolve the `target` id among the `TriggerComponent` entities, teleport the player (bounding box centered on the target rect's center), cancel any active tap target, and set the target's `isPlayerInside = true` so arrival inside door B fires nothing; B re-arms after a genuine exit. Channel buffering means the door reacts one frame after contact — invisible at 60fps. Dangling targets were already loud in `world.onStart`; here the door is simply inert.

**Files:**
- Create: `source/game/doorSystem.ts`
- Modify: `source/game/world.ts`
- Test: `tests/doorSystem.test.ts`

**Interfaces:**
- Consumes: `triggerEnterChannel` events `{entity, trigger}`, `TriggerComponent` (targets resolve against `system.entities` — the system declares `components: [TriggerComponent]`), `getPositionForBoundingBoxCenter`.
- Produces: no API — behavior only. Registered after `triggerSystem`, before `wallHitPopupSystem`.

- [ ] **Step 1: Write the failing tests**

Create `tests/doorSystem.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {doorSystem} from '../source/game/doorSystem.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {TriggerEnter} from '../source/game/TriggerEnter.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';
import {triggerExitChannel} from '../source/game/triggerExitChannel.js';
import {triggerSystem} from '../source/game/triggerSystem.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

function createDoor(id: number, target: number, x: number, y: number) {
  return new Entity({
    components: [
      new TriggerComponent({
        id,
        name: `door-${id}`,
        type: 'door',
        rect: new pixi.Rectangle(x, y, 16, 16),
        properties: {target},
      }),
    ],
  });
}

function createPlayer(x: number, y: number) {
  let motion = new MotionComponent({position: new Vector(x, y), velocity: new Vector(0, 0)});
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });

  return {player, motion};
}

let activeWorld: World | null = null;

afterEach(() => {
  activeWorld?.stop();
  activeWorld = null;
});

describe('doorSystem', () => {
  // Unit rig: doorSystem alone; enters are pushed by hand (uiBridge.test's
  // push-then-swap pattern makes them current for the next update).
  function createUnitWorld(triggerEntities: Entity[]) {
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(triggerEnterChannel);

        for (let entity of triggerEntities) {
          w.addEntity(entity);
        }

        w.addSystem(doorSystem);
      },
    });

    activeWorld = world;

    return world;
  }

  test('an enter on a door teleports the player onto the target center, cancels the tap target, and suppresses the arrival enter', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let world = createUnitWorld([doorA, doorB]);
    let {player, motion} = createPlayer(4, 4);

    world.start();
    motion.target = new Vector(2, 2);
    motion.velocity.set(1, 0);
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: doorA}));
    triggerEnterChannel.swap();
    world.update(tick());

    // Door B's rect center is (72, 8); the box (0, 0, 8, 8) centers at (68, 4).
    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);
    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(doorB.getComponent(TriggerComponent).isPlayerInside).toBe(true);
  });

  test('a dangling target leaves the door inert', () => {
    let doorC = createDoor(1, 99, 0, 0);
    let world = createUnitWorld([doorC]);
    let {player, motion} = createPlayer(4, 4);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: doorC}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });

  test('an enter on a non-door trigger is ignored', () => {
    let zone = new Entity({
      components: [
        new TriggerComponent({
          id: 1,
          name: 'zone',
          type: 'zone',
          rect: new pixi.Rectangle(0, 0, 16, 16),
          properties: {},
        }),
      ],
    });
    let world = createUnitWorld([zone]);
    let {player, motion} = createPlayer(4, 4);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: zone}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(motion.position.x).toBe(4);
  });
});

describe('doorSystem with triggerSystem (integration)', () => {
  test('a held direction walks out of door B without re-firing it; walking back in teleports back', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {player, motion} = createPlayer(20, 20);
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(triggerEnterChannel)
          .addEventChannel(triggerExitChannel)
          .addEntityQuery(playersQuery)
          .addSystem(triggerSystem)
          .addSystem(doorSystem)
          .addEntity(player)
          .addEntity(doorA)
          .addEntity(doorB);
      },
    });

    activeWorld = world;

    world.start();
    world.update(tick()); // seeds both doors: outside

    motion.position.set(4, 4); // step into door A
    world.update(tick()); // triggerSystem pushes enter A
    world.update(tick()); // doorSystem consumes it: teleport to B

    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);

    // "Hold right" out of B: the suppressed arrival plus the genuine exit.
    motion.position.set(74, 4);
    world.update(tick());
    motion.position.set(82, 4); // box 82..90 leaves B's rect 64..80
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(0); // B never re-fired
    expect(triggerExitChannel.events).toHaveLength(1); // one genuine exit

    // Walk back into B: it re-armed, so the pair teleports back to A.
    motion.position.set(68, 4);
    world.update(tick()); // enter B pushed
    world.update(tick()); // doorSystem teleports to A's center (8, 8)

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/doorSystem.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `doorSystem.ts`**

```ts
import {System} from '../engine/ecs/System.js';
import {Vector} from '../engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';

export const doorSystem = new System({
  displayName: 'Door system',
  // The component filter gives this system the trigger entities, which is
  // exactly the set door targets resolve against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    for (let {entity, trigger} of triggerEnterChannel.events) {
      let door = trigger.getComponent(TriggerComponent);

      if (door.type !== 'door') {
        continue;
      }

      let target = door.properties['target'];
      let targetTrigger;

      for (let other of system.entities) {
        let otherTrigger = other.getComponent(TriggerComponent);

        if (otherTrigger.id === target) {
          targetTrigger = otherTrigger;

          break;
        }
      }

      // Already loud in world.onStart's validation; the door is inert.
      if (targetTrigger === undefined) {
        continue;
      }

      let motion = entity.getComponent(MotionComponent);
      let {boundingBox} = entity.getComponent(GraphicsComponent);
      let position = getPositionForBoundingBoxCenter(
        new Vector(
          targetTrigger.rect.x + targetTrigger.rect.width / 2,
          targetTrigger.rect.y + targetTrigger.rect.height / 2,
        ),
        boundingBox,
      );

      motion.position.set(position.x, position.y);
      // Cancel an active tap target so motionSystem doesn't walk the player
      // straight back toward the door it just left.
      motion.target = undefined;
      motion.velocity.set(0, 0);
      // Arrival inside the target fires nothing; it re-arms after a genuine
      // exit (triggerSystem sees inside + isPlayerInside already true).
      targetTrigger.isPlayerInside = true;
    }
  },
});
```

- [ ] **Step 4: Register in the real world**

In `source/game/world.ts`: import `doorSystem`, add after the `triggerSystem` line:

```ts
    world.addSystem(doorSystem); // consumes last frame's trigger enters (buffered, one-frame delay)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/doorSystem.test.ts tests/worldSpawn.test.ts`
Expected: PASS.

- [ ] **Step 6: Try the doors in the running game**

`npm run develop`: walk below the hut into the doorway tile — you appear on the far side of the map inside door B silently; walk out and back in — you teleport back. A held direction never ping-pongs.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/game/doorSystem.ts source/game/world.ts tests/doorSystem.test.ts
git commit -m "Add doors that teleport within the map"
```

---

### Task 12: `zoneSystem` and the chime clip

Consumes `triggerEnterChannel`: for enters whose trigger type is `zone` and which carry a `sound` property, push `PlaySound({name: sound})`. A zone without `sound` is valid — its events still fire for future consumers. `chime` is a new placeholder clip: `bump` is already the wall-hit sound, so only a distinct clip lets the acceptance walk tell a zone enter from grazing a doorframe.

**Files:**
- Create: `source/game/zoneSystem.ts`
- Modify: `source/game/world.ts`, `scripts/generate-placeholder-audio.mjs`, `source/game/assets.ts`
- Create (generated): `public/chime.wav`
- Test: `tests/zoneSystem.test.ts`

**Interfaces:**
- Consumes: `triggerEnterChannel`, `playSoundChannel` + `PlaySound` (existing, `source/game/audio.js` / `source/engine/audio/PlaySound.js`).
- Produces: sound asset key `chime` in the `game` bundle.

- [ ] **Step 1: Write the failing tests**

Create `tests/zoneSystem.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {playSoundChannel} from '../source/game/audio.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {TriggerEnter} from '../source/game/TriggerEnter.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';
import {zoneSystem} from '../source/game/zoneSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

let entity = new Entity({components: []});

function createTrigger(type: string, properties: Record<string, boolean | number | string>) {
  return new Entity({
    components: [
      new TriggerComponent({
        id: 1,
        name: 'trigger',
        type,
        rect: new pixi.Rectangle(0, 0, 16, 16),
        properties,
      }),
    ],
  });
}

let activeWorld: World | null = null;

function createWorld(trigger: Entity) {
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel)
        .addEventChannel(playSoundChannel)
        .addSystem(zoneSystem)
        .addEntity(trigger);
    },
  });

  activeWorld = world;

  return world;
}

describe('zoneSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('a zone enter with a sound property pushes PlaySound', () => {
    let trigger = createTrigger('zone', {sound: 'chime'});
    let world = createWorld(trigger);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity, trigger}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(playSoundChannel.events).toHaveLength(1);
    expect(playSoundChannel.events[0]!.name).toBe('chime');
  });

  test('a zone without a sound property stays silent but valid', () => {
    let trigger = createTrigger('zone', {});
    let world = createWorld(trigger);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity, trigger}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(playSoundChannel.events).toHaveLength(0);
  });

  test('a door enter is ignored', () => {
    let trigger = createTrigger('door', {sound: 'chime'});
    let world = createWorld(trigger);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity, trigger}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(playSoundChannel.events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/zoneSystem.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `zoneSystem.ts`**

```ts
import {PlaySound} from '../engine/audio/PlaySound.js';
import {System} from '../engine/ecs/System.js';
import {playSoundChannel} from './audio.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';

export const zoneSystem = new System({
  components: [],
  displayName: 'Zone system',
  onUpdate: () => {
    for (let {trigger} of triggerEnterChannel.events) {
      let zone = trigger.getComponent(TriggerComponent);

      if (zone.type !== 'zone') {
        continue;
      }

      // A zone without a sound is valid: its enter/exit events still fire
      // for future consumers.
      let sound = zone.properties['sound'];

      if (typeof sound === 'string') {
        playSoundChannel.push(new PlaySound({name: sound}));
      }
    }
  },
});
```

Register in `source/game/world.ts` after `doorSystem`:

```ts
    world.addSystem(zoneSystem); // like doorSystem: last frame's enters, before wallHitPopupSystem
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/zoneSystem.test.ts tests/worldSpawn.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the chime clip and register it**

In `scripts/generate-placeholder-audio.mjs`, add to the `files` record after `'bump.wav'`:

```js
  // Zone-enter chime: a bright two-note ding, unmistakable next to the low
  // wall-hit bump.
  'chime.wav': loop({notes: [1047, 1568], noteMs: 120, repeats: 1}),
```

Run: `node scripts/generate-placeholder-audio.mjs`
Expected: `wrote public/chime.wav (0.24s)` (the other clips regenerate byte-identically — `git status` shows only `public/chime.wav` as new).

In `source/game/assets.ts`, the `game` bundle's sounds gain:

```ts
      sounds: {bump: ['bump.wav'], chime: ['chime.wav'], 'game-music': ['game-music.wav']},
```

- [ ] **Step 6: Hear it in the running game**

`npm run develop`: walk into the zone southeast of the spawn — one chime, not per frame; leave and re-enter — it fires again.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add source/game/zoneSystem.ts source/game/world.ts source/game/assets.ts scripts/generate-placeholder-audio.mjs public/chime.wav tests/zoneSystem.test.ts
git commit -m "Play a zone sound on trigger enter"
```

---

### Task 13: Authoring pipeline reset and the export script

A self-contained 16px Tiled project in `assets/` (untracked via a `*` `.gitignore`, like `$`), rebuilt from `$/maps/map2.tmx` (whose layer data matches the shipped `public/map.json`; only the tile size and tileset reference change — gids are untouched). `scripts/export-assets.mjs` drives the Tiled CLI to regenerate `public/map.json` and `public/tileset.json`, rewrites the tileset reference, and validates the outputs with the runtime schemas (via a vitest guard file that also runs in every `npm test`). Runtime code never sees TMX. Ends with the full §6 manual acceptance walk.

**Files:**
- Create: `assets/.gitignore`, `assets/somewhere.tiled-project`, `assets/tileset.tsx`, `assets/map.tmx`, `assets/tileset.png` (copy)
- Create: `scripts/export-assets.mjs`, `tests/exportedAssets.test.ts`
- Modify: `package.json` (npm script), `public/map.json` + `public/tileset.json` (re-exported)

**Interfaces:**
- Consumes: `tiledTilemapSchema`, `tiledUnsourcedTilesetSchema` (via the vitest guard — Node cannot import the TS schemas directly, vitest's resolver can).
- Produces: npm script `export-assets`. Tiled binary resolution order: `TILED_PATH` env var → `tiled` on PATH → `%ProgramFiles%\Tiled\tiled.exe`; hard error with an install hint when all three miss.

- [ ] **Step 1: Write the schema guard test (it must pass immediately — it guards the JSON already committed in Tasks 5/6/10)**

Create `tests/exportedAssets.test.ts`:

```ts
import {readFileSync} from 'node:fs';

import {describe, expect, test} from 'vitest';

import {tiledTilemapSchema} from '../source/tiled-tools/TiledTilemap.js';
import {tiledUnsourcedTilesetSchema} from '../source/tiled-tools/TiledTileset.js';

// The export script runs this file after every re-export; it also runs in
// every `npm test`, so a drifted hand edit fails just as loudly.
function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

describe('exported assets', () => {
  test('public/map.json parses with the runtime schema and keeps the T1.7 invariants', () => {
    let map = tiledTilemapSchema.parse(readJson('../public/map.json'));
    let tileLayers = map.layers.filter((layer) => layer.type === 'tilelayer');

    expect(map.infinite).toBe(false);

    // CSV-encoded layer data (arrays, not base64 strings).
    for (let layer of tileLayers) {
      expect(Array.isArray(layer.data)).toBe(true);
    }

    // Exactly one entity-layer marker.
    expect(tileLayers.filter((layer) => layer.class === 'entities')).toHaveLength(1);

    // The runtime loads the JSON tileset export, not the TMX-side .tsx.
    expect(map.tilesets[0]?.source).toBe('tileset.json');
  });

  test('public/tileset.json parses with the runtime schema and references the public image', () => {
    let tileset = tiledUnsourcedTilesetSchema.parse(readJson('../public/tileset.json'));

    expect(tileset.image).toBe('tileset.png');
  });
});
```

Run: `npx vitest run tests/exportedAssets.test.ts`
Expected: PASS (the committed JSON already satisfies every invariant; this file exists to catch future export drift).

- [ ] **Step 2: Write the export script**

Create `scripts/export-assets.mjs`:

```js
// Re-export public/map.json and public/tileset.json from the Tiled sources
// in assets/. Requires the Tiled editor (https://www.mapeditor.org); the
// Windows installer does not add it to PATH, hence the ProgramFiles probe.
// If Tiled's preference "Embed tilesets" or a non-CSV layer format sneaks
// into an export, the vitest guard at the end fails loud.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function resolveTiled() {
  if (process.env.TILED_PATH) {
    return process.env.TILED_PATH;
  }

  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['tiled']);

    return 'tiled';
  } catch {
    // not on PATH; fall through to the default install location
  }

  if (process.env.ProgramFiles) {
    let candidate = join(process.env.ProgramFiles, 'Tiled', 'tiled.exe');

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Tiled CLI not found! Install Tiled (https://www.mapeditor.org) and add it to PATH, or point the TILED_PATH environment variable at the tiled executable.',
  );
}

let tiled = resolveTiled();

execFileSync(tiled, [
  '--export-tileset',
  'json',
  join(root, 'assets/tileset.tsx'),
  join(root, 'public/tileset.json'),
]);
execFileSync(tiled, [
  '--export-map',
  'json',
  join(root, 'assets/map.tmx'),
  join(root, 'public/map.json'),
]);

// The exports keep the TMX-side references (tileset.tsx, the assets/ image);
// the runtime loads the JSON export next to the public/ image, so rewrite
// both before validating.
let mapPath = join(root, 'public/map.json');
let map = JSON.parse(readFileSync(mapPath, 'utf8'));

for (let tileset of map.tilesets) {
  if (tileset.source) {
    tileset.source = tileset.source.replace(/\.tsx$/, '.json');
  }
}

writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');

let tilesetPath = join(root, 'public/tileset.json');
let tileset = JSON.parse(readFileSync(tilesetPath, 'utf8'));

tileset.image = 'tileset.png';

writeFileSync(tilesetPath, JSON.stringify(tileset, null, 2) + '\n');

// Validate with the runtime schemas: vitest resolves the TS imports that a
// plain node script cannot.
execFileSync('npx', ['vitest', 'run', 'tests/exportedAssets.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// eslint-disable-next-line no-console -- one-shot export script
console.log('exported public/map.json and public/tileset.json');
```

In `package.json`, add to `scripts` (alphabetical, after `develop`):

```json
    "export-assets": "node scripts/export-assets.mjs",
```

- [ ] **Step 3: Build the `assets/` folder**

Create `assets/.gitignore` containing exactly:

```
*
```

Create `assets/somewhere.tiled-project`:

```json
{
    "automappingRulesFile": "",
    "commands": [
    ],
    "compatibilityVersion": 1100,
    "extensionsPath": "extensions",
    "folders": [
        "."
    ],
    "properties": [
    ],
    "propertyTypes": [
    ]
}
```

Copy the 1× image: `cp public/tileset.png assets/tileset.png`.

Create `assets/tileset.tsx` — collision synced from `public/tileset.json` (the 8-tile truth; the stale `$/maps/tileset.tsx` has 11 and stays untouched):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="tileset" tilewidth="16" tileheight="16" tilecount="4096" columns="64">
 <image source="tileset.png" trans="ff00cc" width="1024" height="1024"/>
 <tile id="64">
  <objectgroup draworder="index" id="2">
   <object id="1" x="2" y="8" width="12" height="8"/>
  </objectgroup>
 </tile>
 <tile id="66">
  <objectgroup draworder="index" id="2">
   <object id="1" x="2" y="8" width="12" height="8"/>
  </objectgroup>
 </tile>
 <tile id="128">
  <objectgroup draworder="index" id="2">
   <object id="1" x="2" y="0" width="14" height="16"/>
  </objectgroup>
 </tile>
 <tile id="129">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="12" width="16" height="4"/>
  </objectgroup>
 </tile>
 <tile id="130">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="0" width="14" height="16"/>
  </objectgroup>
 </tile>
 <tile id="192">
  <objectgroup draworder="index" id="2">
   <object id="1" x="2" y="0" width="14" height="11"/>
  </objectgroup>
 </tile>
 <tile id="193">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="0" width="16" height="8"/>
  </objectgroup>
 </tile>
 <tile id="194">
  <objectgroup draworder="index" id="2">
   <object id="1" x="0" y="0" width="14" height="11"/>
  </objectgroup>
 </tile>
</tileset>
```

- [ ] **Step 4: Rebuild `assets/map.tmx` from `$/maps/map2.tmx`**

Copy `$/maps/map2.tmx` to `assets/map.tmx`, then apply these text edits so the TMX reproduces the CURRENT `public/map.json` (compare against it, not against the spec, if in doubt):

1. On the `<map ...>` element: `tilewidth="64"` → `tilewidth="16"`, `tileheight="64"` → `tileheight="16"`, `nextobjectid="1"` → `nextobjectid="5"`, `nextlayerid="5"` → `nextlayerid="6"`.
2. `<tileset firstgid="1" source="tileset2.tsx"/>` → `<tileset firstgid="1" source="tileset.tsx"/>`.
3. The stuff layer element gains the class: `<layer id="2" name="stuff" width="40" height="40">` → `<layer id="2" name="stuff" class="entities" width="40" height="40">`.
4. In the stuff layer's CSV, row 20 (the 21st data line), replace the values at columns 20/22/24/26/28 (0-based) with `130`, `2147483778`, `1073741954`, `536871042`, `2684354690` — the Task 5 flip zoo.
5. Before `</map>`, add the object layer (TMX stores the object class in the `type` attribute since Tiled 1.10):

```xml
 <objectgroup id="5" name="objects">
  <object id="1" name="spawn" type="spawn" x="152" y="175">
   <point/>
  </object>
  <object id="2" name="door-hut" type="door" x="176" y="176" width="16" height="16">
   <properties>
    <property name="target" type="object" value="3"/>
   </properties>
  </object>
  <object id="3" name="door-far" type="door" x="480" y="480" width="16" height="16">
   <properties>
    <property name="target" type="object" value="2"/>
   </properties>
  </object>
  <object id="4" name="chime-zone" type="zone" x="192" y="240" width="48" height="48">
   <properties>
    <property name="sound" value="chime"/>
   </properties>
  </object>
 </objectgroup>
```

Open `assets/map.tmx` in the Tiled GUI once: it must load without warnings, show the map at 16px tiles with the object layer, and the stuff layer's Class field (Layer Properties) must read `entities`. If Tiled's export preferences are customized, make sure "Embed tilesets" and "Detach templates" are off and the tile layer format is CSV (the guard test catches all of these anyway).

- [ ] **Step 5: Round-trip through the export script**

Run: `npm run export-assets`
Expected: both files regenerate, the vitest guard passes, and the script prints the exported line. Then inspect `git diff public/` — acceptable differences are cosmetic only (`tiledversion`/`version` strings, key order, default-valued fields appearing or disappearing). Layer `data` arrays, the `class` marker, all four objects with their properties, and the tileset collision boxes must be semantically identical. If layer data differs, the TMX rebuild in Step 4 went wrong — fix the TMX, never the JSON.

Run the full suite: `npm test`
Expected: PASS.

- [ ] **Step 6: The §6 manual acceptance walk**

`npm run develop`, New Game:

- [ ] Walk into the zone southeast of the spawn: the chime fires once, not per frame.
- [ ] Leave and re-enter the zone: it fires again.
- [ ] Enter door A below the hut doorway: you appear at door B across the map, B stays silent.
- [ ] Walk out of B and back in: you teleport back to A.
- [ ] Visit the flip zoo (row of wall pieces east of the zone): tiles are visibly mirrored/rotated and collision matches the art on each variant.
- [ ] Pause > Save inside the zone, Quit to menu, Continue: no chime plays and no teleport happens on load (the seeded-trigger case; save inside door A to check the door side too).
- [ ] `assets/map.tmx` re-opens cleanly in Tiled after the walk.

- [ ] **Step 7: Lint, typecheck, commit**

`assets/` is untracked by its own `.gitignore` — nothing from it lands in git.

```bash
npm run lint && npm run typecheck
git add scripts/export-assets.mjs package.json tests/exportedAssets.test.ts public/map.json public/tileset.json
git commit -m "Add the Tiled export script and asset validation guard"
```

---

## Done criteria

All 13 task commits present; `npm test`, `npm run lint`, `npm run typecheck` green; the §6 acceptance walk checked off. The spec's §7 error table is fully implemented: object kinds/class properties/hex-120/non-square diagonal/non-rect collision/marker/unknown type/spawn count/door targets all DEV-throw with prod degradations, and the Tiled CLI resolution hard-errors with an install hint.
