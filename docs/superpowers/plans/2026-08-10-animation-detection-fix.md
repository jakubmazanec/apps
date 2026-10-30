# Animation Detection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Tiled animation detector (dead at the default `similarityThreshold: 0.1`) so the real atlas's six flame/door/torch strips are proposed and adopted, wire them into `assets/tileset.tsx` / `public/tileset.json` as `<animation>` elements, and replace the map's static frame strips with carrier tiles so the game animates doors, torches, and flames.

**Architecture:** A threshold default change (`config.ts`) plus explicit config (`tilesets.config.json`) makes the existing detector propose the six strips at 0.7; the existing `sync-tilesets` pipeline regenerates the tileset artifacts; a small one-shot Node script patches the map's CSV (`assets/map.tmx`, CRLF) and JSON (`public/map.json`, LF) at the same cells, verified by a new test that locks in the final map state.

**Tech Stack:** TypeScript (Node 24, ESM), Zod 4 (config shape), `tsx` (sync runner), Vitest 4 (tests), plain Node for the map patch script, Pixi 8 (engine — untouched).

## Global Constraints

Every task's requirements implicitly include this section. Values are copied from the spec or verified against the working tree on 2026-08-10.

- **App root is `apps/somewhere/`** (this is the working directory for every command below). All paths below are relative to it.
- **The six animation regions are `{start: 69|133|192|197|581|645, frames: 3, duration: 150}`.** `duration: 150` is a pipeline placeholder — timing cannot be known from pixels; do NOT tune it.
- **The detector's noise is accepted.** At 0.7 the real atlas yields 68 proposals; only the six adopted regions go into the config. Do NOT add a structural discriminator to cut variant-family noise (explicitly declined in the spec).
- **Out of scope:** the other genuine strips (candle 578-580, ping-pong torch 641-644, fruit-flicker tree 648-651, swaying plant 1281-1283, etc.), the flame-family tiles 137/138/139 the map already places, and the door decorations 1242/1306/2049.
- **Line endings (committed bytes, `core.autocrlf=false`):** `assets/tileset.tsx` and `assets/map.tmx` are CRLF; `public/tileset.json`, `public/map.json`, `tilesets.config.json` are LF. Writers must preserve each file's own newlines.
- **`tilesets.config.json` is prettier-shaped.** `JSON.stringify(value, null, 2)` is NOT prettier-stable for it; hand-write it in the collapsed-array shape shown in Task 3. The committed test asserts `"maps": ["assets/map.tmx"]` and a trailing newline.
- **`assets/tileset.tsx` and `public/tileset.json` are pipeline-owned.** Never hand-edit their animation data — `npm run sync-tilesets` regenerates both. The CI gate (`tests/tilesetArtifacts.test.ts`) diffs `computeAll` against the committed files, so every artifact change must be committed together with its config change.
- **Code style** (enforced by `@jakubmazanec/eslint-config` + prettier): `let` not `const` in `.ts`/`.tsx` (existing `.mjs` scripts use `const` — follow the file's own convention), single quotes, semicolons, trailing commas, `bracketSpacing: false` (`{start: 69, ...}`), `printWidth: 100`, blank line after the import block and before `return`.
- **Tests live flat in `tests/`** (vitest node project glob `tests/**/*.test.?(c|m)[jt]s?(x)`). Targeted runs: `npx vitest run tests/<file>.test.ts -v`. Full gate: `npm test`, `npm run typecheck`, `npm run lint`.
- **The `animations` layer is classless and must stay that way** — the runtime requires exactly one `class="entities"` tile layer; `tests/exportedAssets.test.ts` enforces it.
- **The engine is untouched.** `Map.ts` keys the animated path off `tilesetTile.textures.length` (carrier only) and `Tileset.ts` reads per-frame `duration`; both already support what this plan produces.
- **Exit codes for the map script:** `0` success; non-zero with a message naming the layer and cell on any unexpected value, writing nothing (verify everything before writing anything).

## Verified facts and corrections to the spec

These were measured against the working tree while writing this plan. Where they contradict the spec, **this plan is the one that was measured**.

1. **The six strips are exactly proposable at 0.7.** Ran `proposeAnimationRegions({image, similarityThreshold: 0.7})` on `assets/tileset.png` (16px tiles, `solidAlphaThreshold: 255`, `transparentColor: '#ff00cc'`): **68** proposals, including exactly `{start: 69, frames: 3, duration: 150}`, `{start: 133, ...}`, `{start: 192, ...}`, `{start: 197, ...}`, `{start: 581, ...}`, `{start: 645, ...}`. At 0.1 the same call returns `[]` (the current false-premise test still passes).
2. **The map's actual cells (0-indexed, 40x40) match the spec:** `stuff` doors `193,194,195` at (10..12, 10) and (29..31, 29); `air` torches `582,583,584` at (10..12, 7), (5..7, 22), (29..31, 26) and bases `646,647,648` at (10..12, 8), (5..7, 23), (29..31, 27); `animations` layer is all zeros; `stuff` lamps at (6,31),(8,31),(10,31). The third cell of each torch/base strip (584, 648) is a bush.
3. **Line endings verified:** `assets/tileset.tsx` CRLF-only (5014 CRLF, 0 LF), `assets/map.tmx` CRLF-only, `public/tileset.json` / `public/map.json` / `tilesets.config.json` LF-only.
4. **Spec's test line numbers are approximate.** The spec says `tests/tilesetsConfig.test.ts:37-38` for "the real config now has 6 regions and threshold 0.7": lines 37-38 are actually the *schema-default* assertions (line 38 is `similarityThreshold` default 0.1 → becomes 0.7 in Task 1); the *committed-config* assertions go in the `describe('the committed tilesets.config.json')` block (Task 3).
5. **No other test asserts the 0.1 default.** `tiledAnalyze.test.ts` fixture tilesets (lines 130, 251) pass explicit `similarityThreshold: 0.1` and stay untouched; synthetic proposer tests pass explicit thresholds and stay untouched.
6. **The map-sign browser tests are unaffected structurally:** their blocking cells (rows 11-12 and 28 at columns 12-13 / 29-31) are not among the replaced cells; only the door-row cells (row 10, 29) change tile id, both with solid boxes. They are still run in Task 5 to confirm.
7. **`sync-tilesets` output shape for a carrier tile:** `<properties>` (with `autoAnimation` true, spliced in UTF-16 code-unit order before `autoCollision`), then the existing `objectgroup`, then `<animation>` with one `<frame tileid="start+index" duration="150"/>` per frame; the JSON export gets `"animation": [{duration, tileid}, ...]` (lexicographic keys, `duration` first).
8. **Config-only changes make the drift gate red before regeneration:** after Task 3 the committed `assets/tileset.tsx` and `public/tileset.json` no longer match `computeAll`, so `tests/tilesetArtifacts.test.ts` fails until Task 4 runs `sync-tilesets`. This is the intended red phase, not a regression.

## Deviations from the spec

Flagged so they can be vetoed before implementation starts.

1. **The map patch script is committed as `scripts/place-animation-carriers.mjs`**, matching the `scripts/asset-migration.mjs` precedent for one-shot asset scripts. The spec only says "by script"; a committed script documents the change and lets a re-exported map be re-patched without Tiled.
2. **The map state is locked in by a new test file (`tests/mapAnimationPlacement.test.ts`),** which the spec's Verification section does not call for. The design's verification (schema tests + map-sign browser tests) would not fail if a later Tiled export reverted the placements; a direct assertion on both map files closes that gap. The replacement table is hardcoded in the test on purpose — the test is the spec, the script is the implementation; a table-driven test would trust the script it is meant to check.

---

### Task 1: Raise the detector's default similarity threshold to 0.7

**Files:**
- Modify: `tools/tiled-pipeline/config.ts:55`
- Modify: `tests/tilesetsConfig.test.ts:38`

**Interfaces:**
- Consumes: nothing.
- Produces: the schema default `tilesetsConfigSchema[...].animations.similarityThreshold` = `0.7`, so any config without an `animations` block proposes at 0.7. Task 3's analyze test and the map-sign browser tests rely on this.

- [ ] **Step 1: Write the failing assertion**

In `tests/tilesetsConfig.test.ts:38`, change the schema-default expectation:

```ts
    expect(tileset.animations.similarityThreshold).toBe(0.7);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tilesetsConfig.test.ts -v`
Expected: FAIL — `expected 0.7, received 0.1`

- [ ] **Step 3: Change the schema default**

In `tools/tiled-pipeline/config.ts:55`, change:

```ts
      similarityThreshold: z.number().min(0).max(1).default(0.1),
```

to:

```ts
      similarityThreshold: z.number().min(0).max(1).default(0.7),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tilesetsConfig.test.ts -v`
Expected: PASS (all tests in the file, including the prettier-shape test)

- [ ] **Step 5: Commit**

```bash
git add tools/tiled-pipeline/config.ts tests/tilesetsConfig.test.ts
git commit -m "Raise animation detection threshold default to 0.7"
```

---

### Task 2: Assert the six real animation strips are proposed

**Files:**
- Modify: `tests/tiledAnimationProposer.test.ts:164-175` (replace the "reports nothing on the real atlas" test)

**Interfaces:**
- Consumes: `proposeAnimationRegions({image, similarityThreshold})` from `tools/tiled-pipeline/propose.js`, `readTilesetImage` from `tools/tiled-pipeline/pixels.js` — already imported at the top of the file.
- Produces: the durable contract that the six strips are detectable at 0.7, which Task 3's config adoption and Task 4's regenerated artifacts are measured against.

- [ ] **Step 1: Replace the false-premise test**

Replace the test at `tests/tiledAnimationProposer.test.ts:164-175` ("reports nothing on the real atlas, which has no animations") with:

```ts
  test('proposes the six real animation strips at 0.7', () => {
    let image = readTilesetImage(readFileSync(new URL('../assets/tileset.png', import.meta.url)), {
      tileWidth: 16,
      tileHeight: 16,
      margin: 0,
      spacing: 0,
      solidAlphaThreshold: 255,
      transparentColor: '#ff00cc',
    });

    expect(
      [69, 133, 192, 197, 581, 645].map((start) =>
        proposeAnimationRegions({image, similarityThreshold: 0.7}).find(
          (proposal) => proposal.start === start,
        ),
      ),
    ).toStrictEqual([
      {start: 69, frames: 3, duration: 150},
      {start: 133, frames: 3, duration: 150},
      {start: 192, frames: 3, duration: 150},
      {start: 197, frames: 3, duration: 150},
      {start: 581, frames: 3, duration: 150},
      {start: 645, frames: 3, duration: 150},
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run tests/tiledAnimationProposer.test.ts -v`
Expected: PASS — the detector already works at 0.7 (verified fact 1); this task is a behavior lock-in, not a code change. The synthetic-fixture tests around it (localized runs, recolour rejection, duplicate rejection, ping-pong) are untouched and must still pass.

- [ ] **Step 3: Commit**

```bash
git add tests/tiledAnimationProposer.test.ts
git commit -m "Assert the six real animation strips are proposed"
```

---

### Task 3: Adopt the six animation regions in the tileset config

**Files:**
- Modify: `tilesets.config.json`
- Modify: `tests/tilesetsConfig.test.ts` (add a test in the `describe('the committed tilesets.config.json')` block)
- Modify: `tests/tiledAnalyze.test.ts:48-50` (replace the "proposes no animations on an atlas that has none" test)

**Interfaces:**
- Consumes: the 0.7 default from Task 1; `loadConfig(appRoot)` from `tools/tiled-pipeline/config.js`; `analyzeReal()` defined at `tests/tiledAnalyze.test.ts:13-17`.
- Produces: the committed config with `animations: {similarityThreshold: 0.7, regions: [six regions]}` — the input Task 4 feeds to `sync-tilesets`.

- [ ] **Step 1: Write the failing committed-config test**

Add this test to the `describe('the committed tilesets.config.json')` block in `tests/tilesetsConfig.test.ts` (after the existing "parses and points at the real files" test):

```ts
  test('adopts the six animation regions at threshold 0.7', () => {
    let tileset = loadConfig(appRoot).tilesets[0]!;

    expect(tileset.animations.similarityThreshold).toBe(0.7);
    expect(tileset.animations.regions).toStrictEqual([
      {start: 69, frames: 3, duration: 150},
      {start: 133, frames: 3, duration: 150},
      {start: 192, frames: 3, duration: 150},
      {start: 197, frames: 3, duration: 150},
      {start: 581, frames: 3, duration: 150},
      {start: 645, frames: 3, duration: 150},
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tilesetsConfig.test.ts -v`
Expected: FAIL — the committed config has no `animations` block, so `regions` is `[]` (and `similarityThreshold` comes from the Task 1 default).

- [ ] **Step 3: Add the animations block to the config**

Rewrite `tilesets.config.json` to exactly this content (prettier shape: collapsed short arrays, trailing newline, LF):

```json
{
  "tilesets": [
    {
      "name": "tileset",
      "source": "assets/tileset.tsx",
      "image": "assets/tileset.png",
      "output": "public/tileset.json",
      "outputImage": "public/tileset.png",
      "solidAlphaThreshold": 255,
      "collision": {
        "default": "bbox"
      },
      "animations": {
        "similarityThreshold": 0.7,
        "regions": [
          {"start": 69, "frames": 3, "duration": 150},
          {"start": 133, "frames": 3, "duration": 150},
          {"start": 192, "frames": 3, "duration": 150},
          {"start": 197, "frames": 3, "duration": 150},
          {"start": 581, "frames": 3, "duration": 150},
          {"start": 645, "frames": 3, "duration": 150}
        ]
      }
    }
  ],
  "analysis": {
    "maps": ["assets/map.tmx"],
    "collisionLayerClasses": ["entities"]
  }
}
```

- [ ] **Step 4: Run the config tests to verify they pass**

Run: `npx vitest run tests/tilesetsConfig.test.ts -v`
Expected: PASS — including the prettier-shape test (still contains `"maps": ["assets/map.tmx"]` and a trailing newline).

- [ ] **Step 5: Replace the analyze test's false premise**

Replace the test at `tests/tiledAnalyze.test.ts:48-50` ("proposes no animations on an atlas that has none") with:

```ts
  test('proposes the six animation strips on the real atlas', () => {
    let proposals = analyzeReal().animationProposals;

    expect(
      [69, 133, 192, 197, 581, 645].map((start) =>
        proposals.find((proposal) => proposal.start === start),
      ),
    ).toStrictEqual([
      {start: 69, frames: 3, duration: 150},
      {start: 133, frames: 3, duration: 150},
      {start: 192, frames: 3, duration: 150},
      {start: 197, frames: 3, duration: 150},
      {start: 581, frames: 3, duration: 150},
      {start: 645, frames: 3, duration: 150},
    ]);
  });
```

- [ ] **Step 6: Run the analyze tests to verify they pass**

Run: `npx vitest run tests/tiledAnalyze.test.ts -v`
Expected: PASS — `analyzeReal()` reads the threshold (0.7) and the regions from the config; the other tests in the file (alpha levels, inventory, candidates, `formatReport`, `toConfigFragment`) are unaffected.

- [ ] **Step 7: Commit**

```bash
git add tilesets.config.json tests/tilesetsConfig.test.ts tests/tiledAnalyze.test.ts
git commit -m "Adopt the six animation regions in the tileset config"
```

---

### Task 4: Regenerate the tileset artifacts with the six animations

**Files:**
- Modify (regenerated, do not hand-edit): `assets/tileset.tsx`, `public/tileset.json`

**Interfaces:**
- Consumes: the Task 3 config; the existing `computeAll`/`reconcile`/`formatTsx`/`formatJson` pipeline (`tools/tiled-pipeline/`).
- Produces: committed `<animation>` elements on tiles 69, 133, 192, 197, 581, 645 in `assets/tileset.tsx` (frames `start..start+2`, `duration="150"`, `autoAnimation` property) and matching `"animation"` arrays in `public/tileset.json` — the data the game engine consumes and the drift gate (`tests/tilesetArtifacts.test.ts`) checks.

- [ ] **Step 1: Verify the drift gate is red**

Run: `npx vitest run tests/tilesetArtifacts.test.ts -v`
Expected: FAIL — drift messages name `assets/tileset.tsx is out of date` and `public/tileset.json is out of date` (verified fact 8). This red state exists by design between Task 3 and this task; do not commit it.

- [ ] **Step 2: Regenerate the artifacts**

Run: `npm run sync-tilesets`
Expected: exits 0 and logs `wrote <appRoot>/public/tileset.json` (plus `assets/tileset.tsx`).

- [ ] **Step 3: Inspect the diff**

Run: `git diff --stat && git diff assets/tileset.tsx | head -120 && git diff public/tileset.json | head -80`
Expected: each of the six carrier tiles (69, 133, 192, 197, 581, 645) in `assets/tileset.tsx` gains a `<properties>` block with `<property name="autoAnimation" type="bool" value="true"/>` and an `<animation>` element with three `<frame>` entries (`tileid` = start + 0/1/2, `duration="150"`); tile 581 and 645 keep their existing `autoCollision` property. `public/tileset.json` gains a matching `"animation"` array on the same six tiles. Line endings stay CRLF (tsx) / LF (json). If `git diff` also touches `public/tileset.png`, that is a problem — stop and inspect.

- [ ] **Step 4: Run the artifact gates**

Run: `npx vitest run tests/tilesetArtifacts.test.ts tests/tiledCompute.test.ts tests/exportedAssets.test.ts -v`
Expected: PASS — no drift, no warnings, and `public/tileset.json` still parses with the runtime schema (`tiledUnsourcedTilesetSchema`, which supports per-frame `duration`).

- [ ] **Step 5: Commit**

```bash
git add assets/tileset.tsx public/tileset.json
git commit -m "Regenerate tileset artifacts with the six animations"
```

---

### Task 5: Place the animation carriers on the map

**Files:**
- Create: `tests/mapAnimationPlacement.test.ts`
- Create: `scripts/place-animation-carriers.mjs`
- Modify (patched by the script): `assets/map.tmx` (CSV, CRLF), `public/map.json` (arrays, LF)

**Interfaces:**
- Consumes: `parseXmlDocument`, `findChild`, `findChildren`, `getAttribute` from `tools/tiled-pipeline/tsx.js` (the test only); the design doc's cell table (below).
- Produces: `assets/map.tmx` and `public/map.json` in which every static frame-strip cell holds the carrier tile id, the `animations` layer holds the three flame carriers at (6,33), (8,33), (10,33), and no cell anywhere holds a frame id (193-195, 582-584, 646-648).

- [ ] **Step 1: Write the failing map-placement test**

Create `tests/mapAnimationPlacement.test.ts` with exactly this content:

```ts
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {findChild, findChildren, getAttribute, parseXmlDocument} from '../tools/tiled-pipeline/tsx.js';

// The spec's placement table, hardcoded on purpose: the test is the spec, the
// script is the implementation, so a script that reads the wrong cell fails
// the test instead of being trusted by it.
const STRIPS = [
  {layer: 'stuff', from: [193, 194, 195], to: 192, anchors: [{x: 10, y: 10}, {x: 29, y: 29}]},
  {
    layer: 'air',
    from: [582, 583, 584],
    to: 581,
    anchors: [{x: 10, y: 7}, {x: 5, y: 22}, {x: 29, y: 26}],
  },
  {
    layer: 'air',
    from: [646, 647, 648],
    to: 645,
    anchors: [{x: 10, y: 8}, {x: 5, y: 23}, {x: 29, y: 27}],
  },
];

const CARRIERS = [
  {layer: 'animations', x: 6, y: 33, tile: 69},
  {layer: 'animations', x: 8, y: 33, tile: 133},
  {layer: 'animations', x: 10, y: 33, tile: 197},
];

function tmxRows(name: string): number[][] {
  let text = readFileSync(new URL('../assets/map.tmx', import.meta.url), 'utf8');
  let layer = findChildren(parseXmlDocument(text).root, 'layer').find(
    (entry) => getAttribute(entry, 'name') === name,
  )!;
  let data = findChild(layer, 'data')!;

  return data
    .text!.split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split(',').filter((token) => token !== '').map(Number));
}

function jsonRows(name: string): number[][] {
  let map = JSON.parse(
    readFileSync(new URL('../public/map.json', import.meta.url), 'utf8'),
  ) as {width: number; layers: Array<{name: string; data?: number[]}>};
  let data = map.layers.find((layer) => layer.name === name)?.data!;

  return Array.from({length: map.width}, (unused, y) =>
    data.slice(y * map.width, (y + 1) * map.width),
  );
}

function expectStrips(readRows: (name: string) => number[][]) {
  for (let strip of STRIPS) {
    for (let anchor of strip.anchors) {
      let row = readRows(strip.layer)[anchor.y]!;

      for (let offset = 0; offset < strip.from.length; offset++) {
        expect(row[anchor.x + offset]).toBe(strip.to);
      }
    }
  }
}

function expectCarriers(readRows: (name: string) => number[][]) {
  for (let carrier of CARRIERS) {
    expect(readRows(carrier.layer)[carrier.y]![carrier.x]).toBe(carrier.tile);
  }
}

function expectNoFrameTiles(readRows: (name: string) => number[][]) {
  let frameIds = new Set(STRIPS.flatMap((strip) => strip.from));

  for (let strip of STRIPS) {
    for (let row of readRows(strip.layer)) {
      for (let gid of row) {
        expect(frameIds.has(gid)).toBe(false);
      }
    }
  }
}

describe('the map animation carriers', () => {
  test('assets/map.tmx places carriers and no static frame strips', () => {
    expectStrips(tmxRows);
    expectCarriers(tmxRows);
    expectNoFrameTiles(tmxRows);
  });

  test('public/map.json mirrors the TMX placement', () => {
    expectStrips(jsonRows);
    expectCarriers(jsonRows);
    expectNoFrameTiles(jsonRows);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mapAnimationPlacement.test.ts -v`
Expected: FAIL — `expectStrips` sees the frame ids (193/582/646...) where carriers should be, `expectCarriers` sees 0 where 69/133/197 should be, and `expectNoFrameTiles` finds frame ids on the map.

- [ ] **Step 3: Write the patch script**

Create `scripts/place-animation-carriers.mjs` with exactly this content:

```js
// Replace the map's static animation-frame strips with carrier tiles, in both
// the Tiled source (assets/map.tmx, CSV layers) and the runtime export
// (public/map.json, plain arrays). The engine only animates the carrier tile
// (region.start), so a cell placing a later frame renders static. Verify-then-
// write, all-or-nothing: a cell that does not hold the expected frame aborts
// the run before either file is touched.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const STRIPS = [
  {layer: 'stuff', from: [193, 194, 195], to: 192, anchors: [{x: 10, y: 10}, {x: 29, y: 29}]},
  {
    layer: 'air',
    from: [582, 583, 584],
    to: 581,
    anchors: [{x: 10, y: 7}, {x: 5, y: 22}, {x: 29, y: 26}],
  },
  {
    layer: 'air',
    from: [646, 647, 648],
    to: 645,
    anchors: [{x: 10, y: 8}, {x: 5, y: 23}, {x: 29, y: 27}],
  },
];

const CARRIERS = [
  {layer: 'animations', x: 6, y: 33, from: 0, to: 69},
  {layer: 'animations', x: 8, y: 33, from: 0, to: 133},
  {layer: 'animations', x: 10, y: 33, from: 0, to: 197},
];

function placements() {
  let entries = [];

  for (let strip of STRIPS) {
    for (let anchor of strip.anchors) {
      for (let [offset, from] of strip.from.entries()) {
        entries.push({layer: strip.layer, x: anchor.x + offset, y: anchor.y, from, to: strip.to});
      }
    }
  }

  return [...entries, ...CARRIERS];
}

function patchTmx(text) {
  return text.replace(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/gu, (whole, attributes, body) => {
    let name = /name="([^"]*)"/u.exec(attributes)?.[1];
    let data = /<data encoding="csv">\r?\n([\s\S]*?)\r?\n<\/data>/u.exec(body)?.[1];
    let cells = placements().filter((entry) => entry.layer === name);

    if (name === undefined || data === undefined || cells.length === 0) {
      return whole;
    }

    let rows = data
      .split(/\r?\n/u)
      .filter((line) => line !== '')
      .map((line) => line.split(',').filter((token) => token !== '').map(Number));

    for (let cell of cells) {
      if ((rows[cell.y]?.[cell.x] ?? 0) !== cell.from) {
        throw new Error(
          `assets/map.tmx ${name} layer cell (${cell.x}, ${cell.y}) holds gid ${rows[cell.y]?.[cell.x]}, expected ${cell.from}!`,
        );
      }

      rows[cell.y][cell.x] = cell.to;
    }

    let rebuilt = rows
      .map((row, index) => row.join(',') + (index < rows.length - 1 ? ',' : ''))
      .join('\r\n');

    return `<layer${attributes}>${body.replace(data, rebuilt)}</layer>`;
  });
}

function patchMapJson(text) {
  let map = JSON.parse(text);

  for (let cell of placements()) {
    let layer = map.layers.find((entry) => entry.type === 'tilelayer' && entry.name === cell.layer);
    let index = cell.y * map.width + cell.x;

    if (layer.data[index] !== cell.from) {
      throw new Error(
        `public/map.json ${cell.layer} layer cell (${cell.x}, ${cell.y}) holds gid ${layer.data[index]}, expected ${cell.from}!`,
      );
    }

    layer.data[index] = cell.to;
  }

  return `${JSON.stringify(map, null, 2)}\n`;
}

// Both patches are computed before either write: a stale map aborts both files.
let tmx = patchTmx(readFileSync(`${root}/assets/map.tmx`, 'utf8'));
let mapJson = patchMapJson(readFileSync(`${root}/public/map.json`, 'utf8'));

writeFileSync(`${root}/assets/map.tmx`, tmx);
writeFileSync(`${root}/public/map.json`, mapJson);

// eslint-disable-next-line no-console -- one-shot placement script
console.log('placed animation carriers on assets/map.tmx and public/map.json');
```

- [ ] **Step 4: Run the script**

Run: `node scripts/place-animation-carriers.mjs`
Expected: prints `placed animation carriers on assets/map.tmx and public/map.json` and exits 0. Then run `git diff --stat` — the diff must touch only `assets/map.tmx` and `public/map.json`; no other bytes may change (CRLF preserved in the TMX, `JSON.stringify(map, null, 2)` + `\n` in the JSON).

- [ ] **Step 5: Verify the diff is surgical**

Run: `git diff assets/map.tmx | grep -cE '^[-+][^+-]' && git diff public/map.json | grep -cE '^[-+][^+-]'`
Expected: exactly **27 changed cells per file** (6 door cells + 9 torch cells + 9 base cells + 3 flame carriers). The TMX diff is 18 lines (9 deleted + 9 added rows: rows 7, 8, 10, 22, 23, 26, 27, 29, 33 of `air`/`stuff`/`animations`, each with 3 changed values) and nothing outside the CSV data blocks; the map.json diff is 6 lines (the `stuff`, `air` and `animations` data arrays) containing only the values `192`, `581`, `645`, `69`, `133`, `197`. If anything else moved, inspect before committing.

- [ ] **Step 6: Run the placement tests to verify they pass**

Run: `npx vitest run tests/mapAnimationPlacement.test.ts -v`
Expected: PASS (both tests).

- [ ] **Step 7: Run the schema and real-map browser tests**

Run: `npx vitest run tests/mapAnimationPlacement.test.ts tests/exportedAssets.test.ts tests/mapSign.browser.test.ts -v`
Expected: PASS — `public/map.json` still parses with the runtime schema (exactly one `class="entities"` layer — the `animations` layer is classless), and the real-map sign walkthroughs are unaffected (verified fact 6).

- [ ] **Step 8: Commit**

```bash
git add assets/map.tmx public/map.json scripts/place-animation-carriers.mjs tests/mapAnimationPlacement.test.ts
git commit -m "Place animation carriers on the map"
```

---

### Task 6: Full gate and manual verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — including the CI gates (`tests/tilesetArtifacts.test.ts` drift check, `tests/exportedAssets.test.ts` schema checks), the updated detector/analyze/config tests, `tests/syncTilesets.test.ts`, and the browser tests on the real map.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck` and `npm run lint`
Expected: PASS for both. The new `.mjs` script is linted (scripts are not ignored); its `console.log` carries the `eslint-disable-next-line no-console` comment.

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --short`
Expected: empty.

- [ ] **Step 4: Manual in-game verification**

Run: `npm run develop`, walk the scene (spawn at (152,175), then to the hut door and the far door):
- Both doors cycle through their 3 frames.
- All three torch strips (and their bases) flicker in sync.
- Three flame sizes flicker on the showcase row at (6,33), (8,33), (10,33) in the `animations` layer.
- The keep-out sign and Mira dialogues still work.

**Done.** If any gate fails, fix forward with a new commit — do not amend.

---

## Self-review

Run against the spec (`docs/superpowers/specs/2026-08-10-animation-detection-fix-design.md`) after writing this plan:

1. **Spec coverage:**
   - Section 1 (detector fix): schema default 0.1 → 0.7 (Task 1), explicit `similarityThreshold: 0.7` + six regions in config (Task 3), the two false-premise tests replaced (Task 2 proposer, Task 3 analyze), synthetic fixture tests untouched (Task 2 verify step). ✓
   - Section 2 (adoption): six regions `frames: 3, duration: 150` (Task 3), `npm run sync-tilesets` regeneration with `<animation>` on tiles 69/133/192/197/581/645 and JSON mirrors (Task 4), regenerated artifacts committed so the `tilesetArtifacts` gate stays green (Task 4 Step 4), `exportedAssets` schema check (Task 4 Step 4). ✓
   - Section 3 (map placement): doors 193/194/195 → 192 at (10,10)-(12,10) and (29,29)-(31,29); torches 582/583/584 → 581 at all three strips; bases 646/647/648 → 645 at all three strips; carriers 69/133/197 at (6,33)/(8,33)/(10,33) in the classless `animations` layer; both `assets/map.tmx` and `public/map.json` patched at the same cells (Task 5). ✓
   - Verification: `npm test`, typecheck, lint, manual walkthrough (Task 6). ✓
   - Out of scope respected: no other strips adopted, no detector precision work, durations stay 150, `animations` layer stays classless. ✓

2. **Placeholder scan:** no TBD/TODO; every step has exact file content or the exact command and expected output.

3. **Type consistency:** region shape `{start, frames, duration}` used identically in Tasks 1-4; the six starts (69, 133, 192, 197, 581, 645) appear verbatim in the config, both test files, and the placement table; strip anchors match the spec cell table; `readRows` signatures match between the test helpers and the assertions.
