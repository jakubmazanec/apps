# Character Spritesets From The Generated Tileset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every character/NPC sprite in the game come from the already-generated `public/character-tileset.json`/`.png`, deleting the last hand-authored (and duplicate-generated) character JSON files.

**Architecture:** Add `Spriteset.fromTileset(tileset, packIndex)`, a pure function that slices one character's 4-direction, 3-frame walk block out of an already-loaded `Tileset` by arithmetic (no file, no config beyond a single integer). Give `GameAssets` a new `characterSpritesets` bundle group (`name → {tileset, packIndex}`) that resolves lazily through this function instead of fetching its own JSON. Point `character`/`mira`/`npc` at it with `packIndex` 27/14/8, delete the six now-unused hand-authored files, and correct the two objectFactories.ts comments that describe the old single-frame NPC placeholder.

**Tech Stack:** TypeScript, Pixi.js, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-character-spritesets-design.md`

## Global Constraints

- No changes to `spritesetSchema` or the `Spriteset` JSON file format — `Spriteset.fromTileset` builds the same in-memory shape the schema-driven `Spriteset.from()` already produces.
- No new JSON files, generated or hand-authored, for characters.
- `ui.json`, `spark.json`, `portraits.json`, `prompt-bubble.json` are unrelated UI/FX art — do not touch them.
- No changes to `npm run sync-tilesets`, `tools/tiled-pipeline/*`, or `tilesets.config.json` — `character-tileset.json`/`.png` are already generated correctly.
- Character pack layout formula (verified against the real atlas — do not re-derive):
  ```ts
  function characterBlockOrigin(packIndex: number): {tileRow: number; tileCol: number} {
    let index = packIndex - 1;
    let sheet = Math.floor(index / 8);
    let withinSheet = index % 8;
    let colBlock = withinSheet % 4;
    let rowBlock = Math.floor(withinSheet / 4);

    return {tileCol: colBlock * 3, tileRow: sheet * 8 + rowBlock * 4};
  }
  ```
  Direction row order from `tileRow`: `down` (+0), `left` (+1), `right` (+2), `up` (+3). Within a direction row,
  the 3 columns from `tileCol` are walk frames; column offset 1 (the middle) is also the standing frame.
- Character picks: player = `packIndex: 27`, Mira = `packIndex: 14`, generic NPC placeholder = `packIndex: 8`.
- All commands below run from `apps/somewhere` (the app root, same directory as `package.json`).

---

### Task 1: `Spriteset.fromTileset`

**Files:**
- Modify: `source/engine/graphics/Spriteset.ts`
- Test: `tests/Spriteset.test.ts`

**Interfaces:**
- Consumes: `Tileset` (`source/engine/tiled/Tileset.ts`) — `columnCount: number`, `getTile(tileId: number): {textures: pixi.Texture[]; ...}`.
- Produces: `Spriteset.fromTileset(tileset: Tileset, packIndex: number): Spriteset` — a static method on the existing `Spriteset` class, returning a normal `Spriteset` instance (same `.textures`/`.animations` shape `Spriteset.from()` produces). Later tasks call this exact signature.

- [ ] **Step 1: Write the failing tests**

`tests/Spriteset.test.ts` currently opens with:

```ts
import {describe, expect, test} from 'vitest';

import {Spriteset, spritesetSchema} from '../source/engine/graphics/Spriteset.js';
```

Replace it with (adds `pixi`, `toTileId`, and `Tileset`, in path-alphabetical order):

```ts
import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Spriteset, spritesetSchema} from '../source/engine/graphics/Spriteset.js';
import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';
```

Then add the following near the end of the file (after the existing `describe(Spriteset, ...)` block):

```ts
// A fake tileset the same shape as public/character-tileset.json (12
// columns, 16x20 tiles, 384 tiles / 32 characters). Each tile's texture is
// tagged with its own tile id so tests can assert on frame identity without
// real Pixi textures.
function createCharacterTileset(): Tileset {
  let tiles = Array.from({length: 384}, (_, id) => ({
    id: toTileId(id),
    textures: [{tileId: id} as unknown as pixi.Texture],
    collisionBoxes: [],
  }));

  return new Tileset({tileWidth: 16, tileHeight: 20, columnCount: 12, rowCount: 32, tiles});
}

function tileIds(textures: pixi.Texture[]): number[] {
  return textures.map((texture) => (texture as unknown as {tileId: number}).tileId);
}

describe('Spriteset.fromTileset', () => {
  test('packIndex 1 sits at the atlas origin: down/left/right/up in that row order', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 1);

    expect(tileIds(spriteset.animations['walking-down']!.textures)).toEqual([0, 1, 2]);
    expect(tileIds(spriteset.animations['standing-down']!.textures)).toEqual([1]);
    expect(tileIds(spriteset.animations['walking-left']!.textures)).toEqual([12, 13, 14]);
    expect(tileIds(spriteset.animations['walking-right']!.textures)).toEqual([24, 25, 26]);
    expect(tileIds(spriteset.animations['walking-up']!.textures)).toEqual([36, 37, 38]);
  });

  test('every walking/standing animation loops; the frame speed matches the hand-authored sheets', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 1);

    expect(spriteset.animations['walking-down']).toMatchObject({loop: true, speed: 0.15});
    expect(spriteset.animations['standing-down']).toMatchObject({loop: true, speed: 0.15});
  });

  test('spin cycles the 4 standing frames down/left/up/right, one-shot at 0.3', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 1);

    // Standing frames: down=1, left=13, up=37, right=25 (tile row offsets
    // 0/1/3/2 x 12 columns + column offset 1).
    expect(tileIds(spriteset.animations.spin!.textures)).toEqual([1, 13, 37, 25]);
    expect(spriteset.animations.spin).toMatchObject({loop: false, speed: 0.3});
  });

  // packIndex 14 is Mira (assets.ts); origin verified against
  // public/character-tileset.png (see the design doc).
  test('packIndex 14 (Mira) crosses into the second combined sheet', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 14);

    expect(tileIds(spriteset.animations['walking-down']!.textures)).toEqual([147, 148, 149]);
    expect(tileIds(spriteset.animations['walking-left']!.textures)).toEqual([159, 160, 161]);
    expect(tileIds(spriteset.animations['walking-right']!.textures)).toEqual([171, 172, 173]);
    expect(tileIds(spriteset.animations['walking-up']!.textures)).toEqual([183, 184, 185]);
  });

  // packIndex 27 is the player (assets.ts); origin verified against
  // public/character-tileset.png (see the design doc).
  test('packIndex 27 (player) crosses into the fourth combined sheet', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 27);

    expect(tileIds(spriteset.animations['walking-down']!.textures)).toEqual([294, 295, 296]);
    expect(tileIds(spriteset.animations['walking-left']!.textures)).toEqual([306, 307, 308]);
    expect(tileIds(spriteset.animations['walking-right']!.textures)).toEqual([318, 319, 320]);
    expect(tileIds(spriteset.animations['walking-up']!.textures)).toEqual([330, 331, 332]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Spriteset.test.ts`
Expected: FAIL — `Spriteset.fromTileset is not a function`.

- [ ] **Step 3: Implement `Spriteset.fromTileset`**

In `source/engine/graphics/Spriteset.ts`, the file currently opens with:

```ts
import * as pixi from 'pixi.js';
import {z} from 'zod';
```

Add a new, separate relative-import block right after it (matching this codebase's import grouping — see `source/pixi-tools/tiledTilesetAsset.ts` for the same pattern):

```ts
import * as pixi from 'pixi.js';
import {z} from 'zod';

import {type Tileset} from '../tiled/Tileset.js';
```

Add these module-level constants right above the `export class Spriteset` line:

```ts
// The SuperRetroWorld character pack's fixed layout: 8 characters per
// combined sheet (4 across, 2 down), 4 sheets stacked vertically by
// scripts/stitch-character-atlas.mjs into public/character-tileset.png.
// Each character is a 3-wide x 4-tall block of the tileset's 16x20 tiles.
const CHARACTERS_PER_SHEET = 8;
const CHARACTER_BLOCKS_PER_SHEET_ROW = 4;
const CHARACTER_BLOCK_WIDTH = 3; // tiles
const CHARACTER_BLOCK_HEIGHT = 4; // tiles

// Row order within a character's block, top to bottom. Verified against
// public/character-tileset.png and today's mira.json frame numbering.
const CHARACTER_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;

function characterBlockOrigin(packIndex: number): {tileRow: number; tileCol: number} {
  let index = packIndex - 1;
  let sheet = Math.floor(index / CHARACTERS_PER_SHEET);
  let withinSheet = index % CHARACTERS_PER_SHEET;
  let colBlock = withinSheet % CHARACTER_BLOCKS_PER_SHEET_ROW;
  let rowBlock = Math.floor(withinSheet / CHARACTER_BLOCKS_PER_SHEET_ROW);

  return {
    tileCol: colBlock * CHARACTER_BLOCK_WIDTH,
    tileRow: sheet * (CHARACTERS_PER_SHEET / CHARACTER_BLOCKS_PER_SHEET_ROW) * CHARACTER_BLOCK_HEIGHT +
      rowBlock * CHARACTER_BLOCK_HEIGHT,
  };
}
```

Add the static method inside the `Spriteset` class, after the existing `static async from(...)` method:

```ts
  /**
   * Builds a Spriteset for one character by slicing its block out of an
   * already-loaded character-tileset — no per-character file, generated or
   * hand-authored. `packIndex` is the character's 1-based position in the
   * SuperRetroWorld pack (see characterBlockOrigin).
   */
  static fromTileset(tileset: Tileset, packIndex: number): Spriteset {
    let {tileRow, tileCol} = characterBlockOrigin(packIndex);
    let textures: Record<string, pixi.Texture> = {};
    let animations: Record<string, SpritesetAnimation> = {};

    CHARACTER_DIRECTIONS.forEach((direction, rowOffset) => {
      let row = tileRow + rowOffset;
      let walkTextures = [0, 1, 2].map((columnOffset) => {
        let tileId = row * tileset.columnCount + tileCol + columnOffset;
        let texture = tileset.getTile(tileId).textures[0]!;

        textures[`${direction}-${columnOffset}`] = texture;

        return texture;
      });

      animations[`standing-${direction}`] = {textures: [walkTextures[1]!], speed: 0.15, loop: true};
      animations[`walking-${direction}`] = {textures: walkTextures, speed: 0.15, loop: true};
    });

    // The 4-frame player "spin" action (playerActionSystem.ts): the same
    // clip character.json hand-authored, now derived instead of authored.
    animations.spin = {
      textures: [
        animations['standing-down']!.textures[0]!,
        animations['standing-left']!.textures[0]!,
        animations['standing-up']!.textures[0]!,
        animations['standing-right']!.textures[0]!,
      ],
      speed: 0.3,
      loop: false,
    };

    return new this({textures, animations});
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/Spriteset.test.ts`
Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add source/engine/graphics/Spriteset.ts tests/Spriteset.test.ts
git commit -m "Add Spriteset.fromTileset to slice characters out of a tileset"
```

---

### Task 2: `GameAssets` — `characterSpritesets` bundle group

**Files:**
- Modify: `source/engine/app/GameAssetBundle.ts`
- Modify: `source/engine/app/GameAssets.ts`
- Test: `tests/GameAssets.browser.test.ts`

**Interfaces:**
- Consumes: `Spriteset.fromTileset(tileset: Tileset, packIndex: number): Spriteset` (Task 1); `Tileset` (`source/engine/tiled/Tileset.ts`), constructible directly as `new Tileset({tileWidth, tileHeight, columnCount, rowCount, tiles})`.
- Produces: `GameAssetBundle.characterSpritesets?: Record<string, {tileset: string; packIndex: number}>`. `GameAssets.spriteset(name)`/`GameAssets.texture(name, frame)` now also accept names from this group (union with the existing `spritesets` group) — no signature change for existing callers. Task 3 relies on both of these.

- [ ] **Step 1: Write the failing tests**

Add to `tests/GameAssets.browser.test.ts`. First, add an import after the existing `Spriteset` import (path-alphabetical: `app/GameAssets.js` < `graphics/Spriteset.js` < `tiled/Tileset.js`):

```ts
import {GameAssets, type GameAssets as GameAssetsClass} from '../source/engine/app/GameAssets.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';
```

Then add a new `describe` block at the end of the file:

```ts
function createAssetsWithCharacterSpritesets() {
  return new GameAssets({
    bundles: [
      {
        name: 'game',
        tilesets: {'character-tileset': ['character-tileset.json']},
        characterSpritesets: {mira: {tileset: 'character-tileset', packIndex: 14}},
      },
    ],
  });
}

function fakeTileset(): Tileset {
  return new Tileset({tileWidth: 16, tileHeight: 20, columnCount: 12, rowCount: 32, tiles: []});
}

describe('GameAssets characterSpritesets', () => {
  afterEach(() => {
    pixi.Assets.cache.reset();
    vitest.restoreAllMocks();
  });

  test('spriteset builds it from the backing tileset via Spriteset.fromTileset', () => {
    let assets = createAssetsWithCharacterSpritesets();
    let tileset = fakeTileset();
    let built = fakeSpriteset({});
    let spy = vitest.spyOn(Spriteset, 'fromTileset').mockReturnValue(built);

    pixi.Assets.cache.set('character-tileset', tileset);

    expect(assets.spriteset('mira')).toBe(built);
    expect(spy).toHaveBeenCalledWith(tileset, 14);
  });

  test('spriteset caches the built spriteset instead of rebuilding it', () => {
    let assets = createAssetsWithCharacterSpritesets();
    let spy = vitest.spyOn(Spriteset, 'fromTileset').mockReturnValue(fakeSpriteset({}));

    pixi.Assets.cache.set('character-tileset', fakeTileset());

    assets.spriteset('mira');
    assets.spriteset('mira');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('spriteset throws when the backing tileset is not loaded yet', () => {
    let assets = createAssetsWithCharacterSpritesets();

    expect(() => assets.spriteset('mira')).toThrow(`Tileset "character-tileset" wasn't loaded!`);
  });

  test('spriteset throws when the backing asset is not a tileset', () => {
    let assets = createAssetsWithCharacterSpritesets();

    pixi.Assets.cache.set('character-tileset', {});

    expect(() => assets.spriteset('mira')).toThrow('Asset "character-tileset" is not a tileset!');
  });

  test('areBundlesLoaded checks a characterSpritesets entry via its backing tileset', () => {
    let assets = createAssetsWithCharacterSpritesets();

    expect(assets.areBundlesLoaded(['game'])).toBe(false);

    pixi.Assets.cache.set('character-tileset', fakeTileset());

    expect(assets.areBundlesLoaded(['game'])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/GameAssets.browser.test.ts`
Expected: FAIL — `characterSpritesets` does not exist on the bundle type / `assets.spriteset('mira')` throws `Spriteset "mira" wasn't loaded!` instead of resolving.

- [ ] **Step 3: Add the bundle field**

In `source/engine/app/GameAssetBundle.ts`, replace the whole file with:

```ts
export type GameAssetSources = Record<string, string[]>; // asset name → source URLs

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
  // Spritesets built at runtime from a shared tileset instead of their own
  // file: each entry picks the packIndex-th character out of the named
  // tileset (see Spriteset.fromTileset). Not part of the pixi manifest —
  // nothing is fetched separately for these.
  characterSpritesets?: Record<string, {tileset: string; packIndex: number}>;
};
```

- [ ] **Step 4: Wire the resolution logic into `GameAssets`**

In `source/engine/app/GameAssets.ts`, the relative-import block currently reads:

```ts
import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
import {spritesetAsset} from '../../pixi-tools/spritesetAsset.js';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {Spriteset} from '../graphics/Spriteset.js';
import {type GameAssetBundle} from './GameAssetBundle.js';
```

Insert the new import in path-alphabetical order (matching this codebase's import sorting), between the `Spriteset` and `GameAssetBundle` imports:

```ts
import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
import {spritesetAsset} from '../../pixi-tools/spritesetAsset.js';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {Spriteset} from '../graphics/Spriteset.js';
import {Tileset} from '../tiled/Tileset.js';
import {type GameAssetBundle} from './GameAssetBundle.js';
```

Add a new type below the existing `AssetNames` type definition:

```ts
type SpritesetAssetNames<Bundles extends readonly GameAssetBundle[]> =
  AssetNames<Bundles, 'spritesets'> | AssetNames<Bundles, 'characterSpritesets'>;
```

Change the `spriteset` and `texture` methods' parameter type from `AssetNames<Bundles, 'spritesets'>` to `SpritesetAssetNames<Bundles>` (bodies unchanged):

```ts
  /** TBD */
  spriteset(name: SpritesetAssetNames<Bundles>): Spriteset {
    return this.#resolveSpriteset(name);
  }

  /** TBD */
  texture(spriteset: SpritesetAssetNames<Bundles>, frame: string): pixi.Texture {
    let texture = this.#resolveSpriteset(spriteset).textures[frame];

    if (!texture) {
      throw new Error(`Texture "${frame}" not found in the "${spriteset}" spriteset!`);
    }

    return texture;
  }
```

Add a private field, right after the existing `#bundles` field:

```ts
  /** TBD */
  readonly #characterSpritesetCache = new Map<string, Spriteset>();
```

Replace `areBundlesLoaded`'s body with (same loop, one addition after it):

```ts
  /** TBD */
  areBundlesLoaded(names: string[]): boolean {
    for (let name of names) {
      if (!this.#bundleNames.has(name)) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
      }

      let bundle = this.#bundles.find((candidate) => candidate.name === name);

      if (!bundle) {
        return false;
      }

      for (let group of ASSET_GROUPS) {
        for (let assetName of Object.keys(bundle[group] ?? {})) {
          if (!pixi.Assets.cache.has(assetName)) {
            return false;
          }
        }
      }

      for (let entry of Object.values(bundle.characterSpritesets ?? {})) {
        if (!pixi.Assets.cache.has(entry.tileset)) {
          return false;
        }
      }
    }

    return true;
  }
```

Replace `#resolveSpriteset` and add two new private methods right after it:

```ts
  // The cache check precedes Assets.get so a miss never triggers pixi's cache
  // warning.
  /** TBD */
  #resolveSpriteset(name: string): Spriteset {
    let cached = this.#characterSpritesetCache.get(name);

    if (cached) {
      return cached;
    }

    let characterEntry = this.#findCharacterSpriteset(name);

    if (characterEntry) {
      let tileset = this.#resolveTileset(characterEntry.tileset);
      let spriteset = Spriteset.fromTileset(tileset, characterEntry.packIndex);

      this.#characterSpritesetCache.set(name, spriteset);

      return spriteset;
    }

    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Spriteset "${name}" wasn't loaded!`);
    }

    let asset = pixi.Assets.get<unknown>(name);

    if (!(asset instanceof Spriteset)) {
      throw new Error(`Asset "${name}" is not a spriteset!`);
    }

    return asset;
  }

  /** TBD */
  #findCharacterSpriteset(name: string): {tileset: string; packIndex: number} | undefined {
    for (let bundle of this.#bundles) {
      let entry = bundle.characterSpritesets?.[name];

      if (entry) {
        return entry;
      }
    }

    return undefined;
  }

  /** TBD */
  #resolveTileset(name: string): Tileset {
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Tileset "${name}" wasn't loaded!`);
    }

    let asset = pixi.Assets.get<unknown>(name);

    if (!(asset instanceof Tileset)) {
      throw new Error(`Asset "${name}" is not a tileset!`);
    }

    return asset;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/GameAssets.browser.test.ts`
Expected: PASS, all tests including the 5 new ones. Also re-run Task 1's tests to confirm nothing broke: `npx vitest run tests/Spriteset.test.ts`.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add source/engine/app/GameAssetBundle.ts source/engine/app/GameAssets.ts tests/GameAssets.browser.test.ts
git commit -m "Add characterSpritesets bundle group to GameAssets"
```

---

### Task 3: Wire up `character`/`mira`/`npc`, delete the hand-authored files

**Files:**
- Modify: `source/game/assets.ts`
- Modify: `source/game/objectFactories.ts:16-32`
- Modify: `tests/exportedAssets.test.ts`
- Delete: `public/character.json`, `public/character.png`, `public/mira.json`, `public/mira.png`, `public/npc.json`, `public/npc.png`

**Interfaces:**
- Consumes: `GameAssetBundle.characterSpritesets` and the `tilesets` group (Task 2); `Spriteset.fromTileset` is exercised indirectly through `GameAssets`, not called directly here.
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Point `assets.ts` at the generated tileset**

In `source/game/assets.ts`, replace the whole file with:

```ts
import {GameAssets} from '../engine/app/GameAssets.js';

export const assets = new GameAssets({
  bundles: [
    {
      name: 'default',
      spritesets: {ui: ['ui.json']},
      fonts: {monogram: ['monogram.fnt'], 'monogram-outline': ['monogram-outline.fnt']},
      tilesets: {tileset: ['tileset.json']},
      sounds: {
        'ui-click': ['ui-click.wav'],
        'ui-key': ['ui-key.wav'],
        'ui-error': ['ui-error.wav'],
        'menu-music': ['menu-music.wav'],
      },
    },
    {
      name: 'game',
      spritesets: {
        spark: ['spark.json'],
        portraits: ['portraits.json'],
        'prompt-bubble': ['prompt-bubble.json'],
      },
      tilesets: {'character-tileset': ['character-tileset.json']},
      characterSpritesets: {
        character: {tileset: 'character-tileset', packIndex: 27},
        mira: {tileset: 'character-tileset', packIndex: 14},
        npc: {tileset: 'character-tileset', packIndex: 8},
      },
      tilemaps: {map: ['map.json']},
      sounds: {
        bump: ['bump.wav'],
        chime: ['chime.wav'],
        blip: ['blip.wav'],
        'game-music': ['game-music.wav'],
      },
    },
  ],
});
```

- [ ] **Step 2: Correct the now-stale NPC comments**

In `source/game/objectFactories.ts`, replace lines 16–19 (the comment above `NPC_SPRITE_NAMES`):

```ts
// All eight names so graphicsSystem's directional sprite.show always
// resolves: the npc sheet lists its one frame under every clip name (the
// documented duplicated-clip-names workaround until T1.3); the zero-velocity
// path shows 'standing-right'.
```

with:

```ts
// All eight names so graphicsSystem's directional sprite.show always
// resolves; the zero-velocity path shows 'standing-right'. The unnamed
// generic NPC (no "sprite" property) gets a real 8-direction sheet like
// every other character, via the "npc" characterSpriteset (assets.ts).
```

and replace line 30 (the comment above `NPC_WIDTH`):

```ts
// The npc placeholder frame is 16x20 (see public/npc.json).
```

with:

```ts
// Every character sheet uses 16x20 tiles (see character-tileset in assets.ts).
```

- [ ] **Step 3: Update `exportedAssets.test.ts`**

In `tests/exportedAssets.test.ts`, replace this block:

```ts
  test.each([
    'character.json',
    'npc.json',
    'mira.json',
    'spark.json',
    'portraits.json',
    'prompt-bubble.json',
    'ui.json',
  ])('public/%s parses with the runtime Spriteset schema', (fileName) => {
    let spriteset = spritesetSchema.parse(readJson(`../public/${fileName}`));

    expect(spriteset.image).toBe(fileName.replace(/\.json$/, '.png'));
  });
```

with (same shape, 3 entries removed — the callback is untouched, so the closing `});` still matches):

```ts
  test.each([
    'spark.json',
    'portraits.json',
    'prompt-bubble.json',
    'ui.json',
  ])('public/%s parses with the runtime Spriteset schema', (fileName) => {
    let spriteset = spritesetSchema.parse(readJson(`../public/${fileName}`));

    expect(spriteset.image).toBe(fileName.replace(/\.json$/, '.png'));
  });
```

Delete the whole `test("public/character.json's spin animation kept its migrated frames, speed, and one-shot loop", ...)` block (Task 1's `Spriteset.fromTileset` "spin" test now covers this).

- [ ] **Step 4: Delete the hand-authored files**

```bash
git rm public/character.json public/character.png public/mira.json public/mira.png public/npc.json public/npc.png
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS. Pay particular attention to `tests/objectFactories.test.ts`, `tests/worldSpawn.browser.test.ts`, `tests/Game.browser.test.ts`, and `tests/mapSign.browser.test.ts` — they exercise player/NPC spawning and stub `assets.spriteset` directly, so they should be unaffected, but confirm.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manually verify in the running game**

Run: `npm run develop`, open the game in a browser, and confirm the player renders with character #27's art (blonde hair, green tunic) and walks/stands correctly in all 4 directions, and that Mira (in the game world) still renders and animates exactly as before. Stop the dev server after checking.

- [ ] **Step 8: Commit**

```bash
git add source/game/assets.ts source/game/objectFactories.ts tests/exportedAssets.test.ts
git commit -m "Generate character/mira/npc spritesets from character-tileset"
```

---

## Plan Self-Review

**Spec coverage:** `Spriteset.fromTileset` (Task 1) ✓; `GameAssets` `characterSpritesets` group, resolution, caching, `areBundlesLoaded` (Task 2) ✓; `assets.ts` wiring with the 27/14/8 picks (Task 3 Step 1) ✓; `objectFactories.ts` stale-comment correction (Task 3 Step 2) ✓; deletion of the 6 hand-authored files (Task 3 Step 4) ✓; `exportedAssets.test.ts` update (Task 3 Step 3) ✓; non-goals (no changes to `ui.json`/etc., no sync-tilesets changes) — nothing in the plan touches them ✓.

**Placeholder scan:** no TBD/TODO/"add error handling"-style steps; every code step has full code.

**Type consistency:** `Spriteset.fromTileset(tileset: Tileset, packIndex: number): Spriteset` is the same signature in Task 1's implementation, Task 2's tests, and is exercised end-to-end (through `GameAssets`) in Task 3 — no drift. `GameAssetBundle.characterSpritesets` shape (`Record<string, {tileset: string; packIndex: number}>`) matches between Task 2's type definition and Task 3's `assets.ts` usage.
