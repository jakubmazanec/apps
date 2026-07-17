# GameAssets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three scattered asset-access idioms (`uiTexture`, raw
`pixi.Assets.get<AudioBuffer>` calls, `Game`-owned manifest/loading) with one engine class,
`GameAssets`, that owns the manifest, `pixi.Assets` init, bundle loading and fail-loud
compile-time-typed lookup.

**Architecture:** A new `GameAssets<const Bundles>` engine class infers asset names from the
manifest object literal passed to its constructor (the `Sprite<const N>` pattern), grouped under
`spritesheets`/`sounds`/`fonts`/`tilemaps`/`tilesets` keys. `Game` hands its manifest/loading
responsibilities to a `GameAssets` instance received via `GameOptions`; game code reaches typed
accessors through a `game/assets.ts` module singleton (the `game/audio.ts` pattern).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
pixi.js v8, vitest + happy-dom (module-mocked pixi), ESLint.

**Spec:** `docs/superpowers/specs/2026-07-17-game-assets-design.md`

## Global Constraints

- Working directory: `/workspaces/apps/apps/somewhere`. All paths below are relative to it.
- Definition of done for EVERY task: `npm run typecheck` && `npm run lint` && `npm test` all green.
  Typecheck is load-bearing: vitest strips types without checking them, so the `@ts-expect-error`
  cases only verify under `npm run typecheck` (its tsconfig includes `tests/`).
- Error messages verbatim from the spec (exact strings, including punctuation):
  - `` `Asset bundle "${name}" doesn't exist!` ``
  - `` `Sound "${name}" wasn't loaded!` ``
  - `` `Spritesheet "${name}" wasn't loaded!` ``
  - `` `Texture "${frame}" not found in the "${sheet}" spritesheet!` ``
  - `` `Asset "${name}" is not a spritesheet!` ``
  - `` `Asset "${name}" is not a sound!` ``
- The `readonly` default type argument on `GameAssets` (`= readonly GameAssetBundle[]`) is
  load-bearing; never change it to a mutable default (it makes every concrete instance unassignable
  to the bare `GameAssets` — TS2322).
- House style: `let` for locals (not `const`), `#private` class fields, `.js` extensions on relative
  imports in implementation files, commit messages are imperative sentence case without
  conventional-commit prefixes (match `git log`: "Add audio system").
- Untouched by this plan: engine-internal name resolvers (`Sprite`, `Map`, `Tilemap`, `Tileset`,
  `audioSystem`), `loadingScreen.ts`, `GameScreen.ts` (its `assetBundles: string[]` screen option is
  runtime data and stays).

---

## File Structure

| File                                        | Action           | Responsibility                                                                                                     |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `source/engine/app/GameAssets.ts`           | Create (Task 1)  | The class: parser registrations, manifest flatten + `Assets.init`, bundle load/validate, typed fail-loud accessors |
| `tests/GameAssets.test.ts`                  | Create (Task 1)  | Unit tests for everything above                                                                                    |
| `source/engine/app/GameAssetBundle.ts`      | Rewrite (Task 2) | Grouped `GameAssetBundle` + `GameAssetSources` types                                                               |
| `source/engine/app/GameAssetBundleAsset.ts` | Delete (Task 2)  | Obsolete `{name, sources}` shape                                                                                   |
| `source/engine/app/GameOptions.ts`          | Modify (Task 2)  | `assets: GameAssets` replaces `assetBundles`                                                                       |
| `source/engine/app/Game.ts`                 | Modify (Task 2)  | Drops parsers/manifest/loading; calls `#assets`                                                                    |
| `source/game/assets.ts`                     | Create (Task 2)  | The game's manifest + `assets` singleton                                                                           |
| `source/game/game.ts`                       | Modify (Task 2)  | Shrinks to `new Game({assets, focusKeys})`                                                                         |
| `tests/Game.test.ts`                        | Modify (Task 2)  | New constructor shape, cache mock, overlap assertion                                                               |
| `source/game/widgets.ts`                    | Modify (Task 3)  | `uiTexture` deleted; built on `assets.texture()`                                                                   |
| `source/game/audio.ts`                      | Modify (Task 3)  | `playFocusSound` uses `assets.sound()`                                                                             |
| `source/game/mainMenuScreen.ts`             | Modify (Task 3)  | All lookups via `assets`                                                                                           |
| `source/game/gameScreen.ts`                 | Modify (Task 3)  | All lookups via `assets`                                                                                           |

Sequencing note: the grouped types are **defined in `GameAssets.ts` in Task 1** and **moved to
`GameAssetBundle.ts` in Task 2**. Rewriting `GameAssetBundle.ts` in Task 1 would break the old
`Game.ts` (which still reads `bundle.assets`) and leave the task red; the temporary placement keeps
every task independently green.

---

### Task 1: `GameAssets` engine class

**Files:**

- Create: `source/engine/app/GameAssets.ts`
- Test: `tests/GameAssets.test.ts`

**Interfaces:**

- Consumes: `pixi.Assets` (`init`, `loadBundle`, `backgroundLoadBundle`, `get`, `cache.has`),
  `pixi.Spritesheet`, the three parser modules in `source/pixi-tools/`.
- Produces (later tasks rely on these exact signatures):
  - `class GameAssets<const Bundles extends readonly GameAssetBundle[] = readonly GameAssetBundle[]>`
  - `constructor({bundles}: GameAssetsOptions<Bundles>)`
  - `init(): Promise<void>` — flattens groups into pixi's `{alias, src}` manifest and calls
    `pixi.Assets.init`
  - `loadBundles(names: string[]): Promise<void>` — throws on unknown bundle name
  - `backgroundLoadAll(): void`
  - `areBundlesLoaded(names: string[]): boolean`
  - `texture(sheet: AssetNames<Bundles, 'spritesheets'>, frame: string): pixi.Texture`
  - `sound(name: AssetNames<Bundles, 'sounds'>): AudioBuffer`
  - Exported types: `GameAssetsOptions`, and (temporarily, until Task 2 moves them)
    `GameAssetSources`, `GameAssetBundle`

- [ ] **Step 1: Write the failing test file**

Create `tests/GameAssets.test.ts`. It mocks `pixi.js` in `Game.test.ts`'s style (plain functions +
`vi.spyOn`, restore in `afterEach`), plus a `Spritesheet` class, `Assets.get`/`Assets.cache`, and a
stubbed global `AudioBuffer` (happy-dom has none) for `sound()`'s instanceof check:

```ts
import {afterEach, describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  extensions: {add() {}},
  Spritesheet: class Spritesheet {
    textures: Record<string, unknown> = {};
  },
  Assets: {
    init: async () => {},
    loadBundle: async () => {},
    backgroundLoadBundle: async () => {},
    get: (): unknown => undefined,
    cache: {has: (): boolean => false},
  },
}));

vi.mock('../source/pixi-tools/tiledTilesetAsset.js', () => ({tiledTilesetAsset: {}}));
vi.mock('../source/pixi-tools/tiledTilemapAsset.js', () => ({tiledTilemapAsset: {}}));
vi.mock('../source/pixi-tools/audioBufferAsset.js', () => ({audioBufferAsset: {}}));

// happy-dom has no AudioBuffer; sound()'s instanceof check needs the global.
class StubAudioBuffer {}

vi.stubGlobal('AudioBuffer', StubAudioBuffer);

const {GameAssets} = await import('../source/engine/app/GameAssets.js');
const pixi = await import('pixi.js');

// A two-bundle manifest exercising every group kind the accessors touch.
function createAssets() {
  return new GameAssets({
    bundles: [
      {
        name: 'default',
        fonts: {monogram: ['monogram.fnt']},
        sounds: {'ui-click': ['ui-click.wav']},
        spritesheets: {ui: ['ui.json']},
      },
      {
        name: 'game',
        sounds: {bump: ['bump.wav']},
        tilemaps: {map: ['map.json']},
      },
    ],
  });
}

// Backs pixi.Assets.cache/get with a plain object for one test.
function fillCache(entries: Record<string, unknown>) {
  vi.spyOn(pixi.Assets.cache, 'has').mockImplementation((key) => String(key) in entries);
  vi.spyOn(pixi.Assets, 'get').mockImplementation(((key: string) => entries[key]) as never);
}

// The mocked class has a no-arg constructor; the cast sidesteps the real
// Spritesheet constructor signature (Sprite.test.ts precedent for cast-heavy
// pixi fakes).
function fakeSpritesheet(textures: Record<string, unknown>): unknown {
  let sheet = new (pixi.Spritesheet as unknown as new () => {
    textures: Record<string, unknown>;
  })();

  sheet.textures = textures;

  return sheet;
}

describe('GameAssets accessors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('texture returns the frame from a loaded spritesheet', () => {
    let assets = createAssets();
    let frame = {};

    fillCache({ui: fakeSpritesheet({'focus-ring': frame})});

    expect(assets.texture('ui', 'focus-ring')).toBe(frame);
  });

  test('texture throws when the spritesheet is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.texture('ui', 'focus-ring')).toThrow(`Spritesheet "ui" wasn't loaded!`);
  });

  test('texture throws when the frame is missing from the sheet', () => {
    let assets = createAssets();

    fillCache({ui: fakeSpritesheet({})});

    expect(() => assets.texture('ui', 'focus-ring')).toThrow(
      'Texture "focus-ring" not found in the "ui" spritesheet!',
    );
  });

  test('texture throws when the cached value is not a spritesheet', () => {
    let assets = createAssets();

    fillCache({ui: {}});

    expect(() => assets.texture('ui', 'focus-ring')).toThrow('Asset "ui" is not a spritesheet!');
  });

  test('sound returns a loaded AudioBuffer', () => {
    let assets = createAssets();
    let buffer = new StubAudioBuffer();

    fillCache({'ui-click': buffer});

    expect(assets.sound('ui-click')).toBe(buffer);
  });

  test('sound throws when the sound is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.sound('ui-click')).toThrow(`Sound "ui-click" wasn't loaded!`);
  });

  test('sound throws when the cached value is not an AudioBuffer', () => {
    let assets = createAssets();

    fillCache({'ui-click': {}});

    expect(() => assets.sound('ui-click')).toThrow('Asset "ui-click" is not a sound!');
  });

  test('accessors never call Assets.get on the miss path (no pixi cache warning)', () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'get');

    expect(() => assets.sound('ui-click')).toThrow();
    expect(() => assets.texture('ui', 'focus-ring')).toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  test('asset names are compile-time checked per group', () => {
    let assets = createAssets();

    expect(() => {
      // @ts-expect-error -- 'ui-click' is a sound name, not a spritesheet name
      assets.texture('ui-click', 'frame');
    }).toThrow();
    expect(() => {
      // @ts-expect-error -- 'nope' is not a declared asset name in any group
      assets.sound('nope');
    }).toThrow();
    expect(() => {
      // @ts-expect-error -- 'ui' is a spritesheet name, not a sound name
      assets.sound('ui');
    }).toThrow();
  });

  test('a concretely typed instance is assignable to the bare GameAssets type', () => {
    // Regression guard for the readonly default type argument: with a mutable
    // default this line is a TS2322 and Game wiring breaks.
    let bare: GameAssets = createAssets();

    expect(bare).toBeInstanceOf(GameAssets);
  });
});

describe('GameAssets loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('init passes the flattened {alias, src} manifest to pixi.Assets.init', async () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'init');

    await assets.init();

    expect(spy).toHaveBeenCalledWith({
      manifest: {
        bundles: [
          {
            name: 'default',
            assets: [
              {alias: 'monogram', src: ['monogram.fnt']},
              {alias: 'ui-click', src: ['ui-click.wav']},
              {alias: 'ui', src: ['ui.json']},
            ],
          },
          {
            name: 'game',
            assets: [
              {alias: 'bump', src: ['bump.wav']},
              {alias: 'map', src: ['map.json']},
            ],
          },
        ],
      },
    });
  });

  test('loadBundles rejects a bundle name missing from the manifest', async () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'loadBundle');

    await expect(assets.loadBundles(['nope'])).rejects.toThrow(
      `Asset bundle "nope" doesn't exist!`,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  test('loadBundles forwards known names to pixi.Assets.loadBundle', async () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'loadBundle');

    await assets.loadBundles(['default', 'game']);

    expect(spy).toHaveBeenCalledWith(['default', 'game']);
  });

  test('backgroundLoadAll passes every bundle name to backgroundLoadBundle', () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'backgroundLoadBundle');

    assets.backgroundLoadAll();

    expect(spy).toHaveBeenCalledWith(['default', 'game']);
  });

  test('areBundlesLoaded is true only when every asset across the groups is cached', () => {
    let assets = createAssets();

    fillCache({monogram: {}, 'ui-click': {}, ui: {}});

    expect(assets.areBundlesLoaded(['default'])).toBeTruthy();
    // bump and map are not cached, so the grouped 'game' bundle reports cold.
    expect(assets.areBundlesLoaded(['default', 'game'])).toBeFalsy();
  });

  test('areBundlesLoaded is false for an unknown bundle without touching the cache', () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets.cache, 'has');

    expect(assets.areBundlesLoaded(['nope'])).toBeFalsy();
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/GameAssets.test.ts` Expected: FAIL — cannot resolve
`../source/engine/app/GameAssets.js` (module does not exist yet).

- [ ] **Step 3: Implement `GameAssets`**

Create `source/engine/app/GameAssets.ts`:

```ts
import * as pixi from 'pixi.js';

import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';

// Loader plumbing lives with the loader owner: these parsers must be
// registered before pixi.Assets is initialized, and this module's class is
// the only thing that initializes it.
pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);
pixi.extensions.add(audioBufferAsset);

// Task 2 moves these two types into GameAssetBundle.ts; they live here for
// now so the old Game/GameOptions keep compiling until they migrate.
export type GameAssetSources = Record<string, string[]>; // asset name → source URLs

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesheets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
};

type GameAssetGroup = Exclude<keyof GameAssetBundle, 'name'>;

const ASSET_GROUPS = [
  'fonts',
  'sounds',
  'spritesheets',
  'tilemaps',
  'tilesets',
] as const satisfies readonly GameAssetGroup[];

// Distributes over the bundle union so each bundle contributes its own keys.
type BundleAssetNames<Bundle, Group extends GameAssetGroup> =
  Bundle extends GameAssetBundle ? keyof NonNullable<Bundle[Group]> & string : never;

type AssetNames<
  Bundles extends readonly GameAssetBundle[],
  Group extends GameAssetGroup,
> = BundleAssetNames<Bundles[number], Group>;

export type GameAssetsOptions<Bundles extends readonly GameAssetBundle[]> = {
  bundles: Bundles;
};

/**
 * One owner for the asset manifest, pixi.Assets initialization, bundle
 * loading and fail-loud typed lookup. Asset names are compile-time typed,
 * inferred from the manifest passed to the constructor; kinds are declared by
 * grouping (`spritesheets`, `sounds`, ...) because pixi detects `.json` kinds
 * by file content, which the type system cannot see. Only kinds that game
 * code reads directly get accessors: `fonts`, `tilemaps` and `tilesets`
 * exist for loading and bundle checks only.
 */
export class GameAssets<
  // The readonly default is load-bearing: `const` inference types the
  // constructor argument as a readonly tuple, and GameAssets<readonly [...]>
  // is not assignable to GameAssets<GameAssetBundle[]>, so a mutable default
  // would make every concrete instance unassignable to the bare GameAssets.
  const Bundles extends readonly GameAssetBundle[] = readonly GameAssetBundle[],
> {
  readonly #bundles: Bundles;

  constructor({bundles}: GameAssetsOptions<Bundles>) {
    this.#bundles = bundles;
  }

  async init(): Promise<void> {
    await pixi.Assets.init({
      manifest: {
        bundles: this.#bundles.map((bundle) => ({
          name: bundle.name,
          assets: ASSET_GROUPS.flatMap((group) =>
            Object.entries(bundle[group] ?? {}).map(([alias, src]) => ({alias, src})),
          ),
        })),
      },
    });
  }

  // pixi.Assets.loadBundle resolves silently for unknown bundle ids
  // (Resolver.resolveBundle skips them, despite its JSDoc @throws), so
  // without this check a typo'd name loads nothing and surfaces nowhere.
  async loadBundles(names: string[]): Promise<void> {
    for (let name of names) {
      if (!this.#bundles.some((bundle) => bundle.name === name)) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
      }
    }

    await pixi.Assets.loadBundle(names);
  }

  backgroundLoadAll(): void {
    void pixi.Assets.backgroundLoadBundle(this.#bundles.map((bundle) => bundle.name));
  }

  areBundlesLoaded(names: string[]): boolean {
    for (let name of names) {
      let bundle = this.#bundles.find((candidate) => candidate.name === name);

      // An unknown bundle reports false before touching pixi.Assets.cache.
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
    }

    return true;
  }

  texture(sheet: AssetNames<Bundles, 'spritesheets'>, frame: string): pixi.Texture {
    let texture = this.#spritesheet(sheet).textures[frame];

    if (!texture) {
      throw new Error(`Texture "${frame}" not found in the "${sheet}" spritesheet!`);
    }

    return texture;
  }

  sound(name: AssetNames<Bundles, 'sounds'>): AudioBuffer {
    // Gating on cache.has keeps pixi's console warning off the miss path.
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Sound "${name}" wasn't loaded!`);
    }

    let sound = pixi.Assets.get<unknown>(name);

    // Grouping is type-level only, so the runtime kind is verified here: a
    // file filed under the wrong group fails precisely, not as a confusing
    // missing-frame error or a mistyped return value.
    if (!(sound instanceof AudioBuffer)) {
      throw new Error(`Asset "${name}" is not a sound!`);
    }

    return sound;
  }

  #spritesheet(name: string): pixi.Spritesheet {
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Spritesheet "${name}" wasn't loaded!`);
    }

    let spritesheet = pixi.Assets.get<unknown>(name);

    if (!(spritesheet instanceof pixi.Spritesheet)) {
      throw new Error(`Asset "${name}" is not a spritesheet!`);
    }

    return spritesheet;
  }
}
```

Notes for the implementer:

- Both `Game.ts` and this module call `pixi.extensions.add` for the same parsers until Task 2
  removes Game's copies. That never double-registers at runtime: nothing imports `GameAssets.ts` for
  value yet except `tests/GameAssets.test.ts`, where pixi is mocked.
- Typecheck runs with `noUncheckedIndexedAccess`, so `textures[frame]` is `pixi.Texture | undefined`
  and the `if (!texture)` narrow is required, not defensive.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/GameAssets.test.ts` Expected: PASS (all tests).

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm run lint && npm test` Expected: all green. If lint flags a rule on a
cast or mock, fix the style without weakening the runtime checks; do not add broad eslint-disable
blocks.

- [ ] **Step 6: Commit**

```bash
git add source/engine/app/GameAssets.ts tests/GameAssets.test.ts
git commit -m "Add GameAssets engine class"
```

---

### Task 2: `Game` integration and game wiring

**Files:**

- Rewrite: `source/engine/app/GameAssetBundle.ts`
- Delete: `source/engine/app/GameAssetBundleAsset.ts`
- Modify: `source/engine/app/GameAssets.ts` (import the moved types)
- Modify: `source/engine/app/GameOptions.ts`
- Modify: `source/engine/app/Game.ts`
- Create: `source/game/assets.ts`
- Modify: `source/game/game.ts`
- Test: `tests/Game.test.ts`

**Interfaces:**

- Consumes: `GameAssets` from Task 1 — `init()`, `loadBundles(names: string[])`,
  `backgroundLoadAll()`, `areBundlesLoaded(names: string[])`.
- Produces:
  - `GameOptions.assets: GameAssets` (bare type: `Game` needs only the loading half, which takes
    plain strings; concretely-typed instances are assignable thanks to the readonly default)
  - `source/game/assets.ts` exports `assets` — the singleton Task 3's call sites import; its
    manifest declares exactly today's assets, grouped
  - `GameAssetBundle.ts` exports the grouped `GameAssetBundle` and `GameAssetSources` types

- [ ] **Step 1: Update `tests/Game.test.ts` to the new API (failing first)**

Four mechanical changes plus one new assertion:

1. In the `vi.mock('pixi.js', ...)` factory, extend `Assets` with a cache stub (loadBundles now
   validates names and a declared-but-cold bundle must still trip the loading-screen branch):

```ts
  Assets: {
    init: async () => {},
    loadBundle: async () => {},
    backgroundLoadBundle: async () => {},
    cache: {has: (): boolean => false},
  },
```

2. After the existing dynamic imports (`GameAssets` must load after the `vi.mock` calls, like
   `Game`):

```ts
const {GameAssets} = await import('../source/engine/app/GameAssets.js');
```

3. Replace the `Game` construction in `createGame` (the helper serves the fake screens that name the
   `game` bundle, so its manifest declares both bundles, the cold one with one asset):

```ts
async function createGame(focusKeys?: typeof FOCUS_KEYS) {
  let game = new Game({
    assets: new GameAssets({
      bundles: [{name: 'default'}, {name: 'game', sounds: {bump: ['bump.wav']}}],
    }),
    ...(focusKeys === undefined ? {} : {focusKeys}),
  });
```

4. Replace every other `new Game({assetBundles: [], ...})` construction (about 14 direct sites in
   the `destroy`/`init`/`pipeline overlap`/`ticker`/`pixelScale`/`scaled root` tests):
   `assetBundles: []` becomes `assets: new GameAssets({bundles: [{name: 'default'}]})`, keeping the
   other options intact. Examples of each variant:

```ts
let game = new Game({assets: new GameAssets({bundles: [{name: 'default'}]})});

let game = new Game({
  assets: new GameAssets({bundles: [{name: 'default'}]}),
  choosePixelScale: chooser,
});
```

The `default` bundle must exist in every manifest because `Game.init` now runs
`loadBundles(['default'])`, which throws for names missing from the manifest. `createFakeScreen` and
its `assetBundles: string[]` screen option are untouched.

5. Replace the `init starts the asset pipeline before app.init resolves` test with this extended
   version — the new assertion pins the other half of the overlap (serializing assets _ahead_ of
   `app.init` keeps the old assertion green while killing the overlap):

```ts
test('init starts the asset pipeline before app.init resolves', async () => {
  let game = new Game({assets: new GameAssets({bundles: [{name: 'default'}]})});
  let resolveAppInit!: () => void;
  let appInitStartedAtBundleLoad: boolean | null = null;

  cleanups.push(() => {
    game.destroy();
  });

  let appInitSpy = vi.spyOn(game.app, 'init').mockImplementation(
    async () =>
      new Promise<void>((resolve) => {
        resolveAppInit = resolve;
      }),
  );

  let assetsInitSpy = vi.spyOn(pixi.Assets, 'init');

  vi.spyOn(pixi.Assets, 'loadBundle').mockImplementation(async () => {
    appInitStartedAtBundleLoad = appInitSpy.mock.calls.length > 0;
  });

  let initPromise = game.init();

  // Assets.init must already have been called while app.init is still
  // pending; if this fails, the two pipelines re-serialized.
  expect(assetsInitSpy).toHaveBeenCalledTimes(1);

  resolveAppInit();
  await initPromise;

  // And app.init must already have started when the asset chain reached its
  // bundle load; if this fails, assets were serialized ahead of app.init.
  expect(appInitStartedAtBundleLoad).toBeTruthy();
});
```

All other tests (screen lifecycle, failed-bundle-retry, scaleMode, ticker, pixelScale) keep their
bodies: the `pixi.Assets` spies keep working because `GameAssets` calls the same mocked functions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Game.test.ts` Expected: FAIL — `Game` does not accept `assets` yet
(constructor destructures `assetBundles`, so `this.assetBundles` is `undefined` and `init()` crashes
mapping it).

- [ ] **Step 3: Move the grouped types to `GameAssetBundle.ts`**

Replace the entire content of `source/engine/app/GameAssetBundle.ts` with:

```ts
export type GameAssetSources = Record<string, string[]>; // asset name → source URLs

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesheets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
};
```

Delete the obsolete asset type:

```bash
git rm source/engine/app/GameAssetBundleAsset.ts
```

In `source/engine/app/GameAssets.ts`, delete the temporary `GameAssetSources`/`GameAssetBundle`
definitions (and their explanatory comment) and import instead:

```ts
import {type GameAssetBundle} from './GameAssetBundle.js';
```

`GameAssetGroup`, `BundleAssetNames` and `AssetNames` stay private to `GameAssets.ts`.

- [ ] **Step 4: Update `GameOptions.ts`**

Replace the entire content of `source/engine/app/GameOptions.ts` with:

```ts
import {ChoosePixelScale} from './ChoosePixelScale';
import {FocusKeys} from './FocusKeys';
import {GameAssets} from './GameAssets';

export type GameOptions = {
  assets: GameAssets;
  choosePixelScale?: ChoosePixelScale;
  focusKeys?: FocusKeys;
};
```

- [ ] **Step 5: Update `Game.ts`**

Six edits, all in `source/engine/app/Game.ts`:

1. Delete the parser imports and registrations (they moved to `GameAssets.ts` in Task 1) and the
   `GameAssetBundle` import; add the `GameAssets` type import. The import block becomes:

```ts
import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

// import {CRTFilter} from 'pixi-filters';
import {isTextEntryTarget} from '../ui/isTextEntryTarget.js';
import {type ChoosePixelScale, defaultChoosePixelScale} from './ChoosePixelScale.js';
import {type FocusCommand} from './FocusCommand.js';
import {type GameAssets} from './GameAssets.js';
import {type GameOptions} from './GameOptions.js';
import {type GameScreen, type Renderable} from './GameScreen.js';
import {type GameState} from './GameState.js';

import '@pixi/layout';
```

(The three `pixi.extensions.add(...)` lines below the imports are deleted. The type-only
`GameAssets` import is erased at runtime — the registrations run when `game/assets.ts` evaluates the
module for value, before any load.)

2. Delete the public `assetBundles: GameAssetBundle[];` field. Next to the other private fields
   (below `#choosePixelScale`), add:

```ts
  readonly #assets: GameAssets;
```

3. Constructor — destructure and store `assets` instead of `assetBundles`:

```ts
  constructor({assets, choosePixelScale, focusKeys}: GameOptions) {
    this.#assets = assets;
    this.#choosePixelScale = choosePixelScale ?? defaultChoosePixelScale;
```

4. In `init()`, replace the whole `let assetsReady = pixi.Assets.init({...}).then(...)` block with
   (keeping the comment above it):

```ts
// Start the asset pipeline alongside app.init so the ~20-file default
// bundle fetch is not serialized behind WebGL context creation.
let assetsReady = this.#assets.init().then(async () => {
  await this.#assets.loadBundles(['default']);
});
```

and replace the `void pixi.Assets.backgroundLoadBundle(...)` statement after
`await Promise.all([appReady, assetsReady]);` with:

```ts
this.#assets.backgroundLoadAll();
```

5. Delete the `isAssetBundleLoaded` and `areAssetBundlesLoaded` methods entirely (nothing outside
   `Game` calls them; the loop logic now lives in `GameAssets.areBundlesLoaded`).

6. In `showScreen()`, swap the three asset touchpoints:

```ts
      if (screen.assetBundles.length && !this.#assets.areBundlesLoaded(screen.assetBundles)) {
```

```ts
            await Promise.all([
              this.loadingScreen.show(),
              this.#assets.loadBundles(screen.assetBundles),
            ]);
          } else {
            await this.#assets.loadBundles(screen.assetBundles);
          }
```

(The surrounding comments in `showScreen` stay as they are.)

- [ ] **Step 6: Create `source/game/assets.ts` and shrink `game.ts`**

Create `source/game/assets.ts` (mirrors `game/audio.ts`: a game-owned module singleton):

```ts
import {GameAssets} from '../engine/app/GameAssets.js';

export const assets = new GameAssets({
  bundles: [
    {
      name: 'default',
      spritesheets: {ui: ['ui.json']},
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
      spritesheets: {character: ['character.json'], spark: ['spark.json']},
      tilemaps: {map: ['map.json']},
      sounds: {bump: ['bump.wav'], 'game-music': ['game-music.wav']},
    },
  ],
});
```

(This is today's `game.ts` manifest regrouped by kind — same bundle names, same asset names, same
source files, nothing added or dropped.)

In `source/game/game.ts`, replace the `assetBundles` option with `assets` — the file keeps its
`window.game` block and becomes:

```ts
import {Game} from '../engine/app/Game.js';
import {assets} from './assets.js';

export const game = new Game({
  assets,
  focusKeys: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    next: ['Tab'],
    previous: ['Shift+Tab'],
    activate: ['Enter', 'Space'],
  },
});

declare global {
  interface Window {
    game: typeof game;
  }
}

/* eslint-disable unicorn/prefer-global-this -- browser-only debug handle: SSR-guarded by `typeof window` and typed via the `Window` augmentation above; `globalThis` would force a `var` global (vars-on-top) and a no-typeof-undefined/no-unnecessary-condition conflict on the guard */
if (typeof window !== 'undefined') {
  window.game = game;
}
/* eslint-enable unicorn/prefer-global-this */
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/Game.test.ts tests/GameAssets.test.ts` Expected: PASS (all tests in both
files).

- [ ] **Step 8: Full verification**

Run: `npm run typecheck && npm run lint && npm test` Expected: all green. Task 3 has not run yet,
but the tree still compiles because the call sites (`widgets.ts`, screens, `audio.ts`) go through
`pixi.Assets.get` directly, which is untouched by this task. Also confirm the old `Game`-side shape
is fully gone:

Run: `grep -rn "assetBundles" source/engine/app/` Expected: hits only in `GameScreen.ts` (the
screen-side `assetBundles: string[]` option is runtime data and stays, as do the screens'
`assetBundles: ['default']`-style declarations under `source/game/`).

- [ ] **Step 9: Commit**

```bash
git add -A source/engine/app source/game/assets.ts source/game/game.ts tests/Game.test.ts
git commit -m "Move asset manifest and loading from Game into GameAssets"
```

---

### Task 3: Call-site migration

**Files:**

- Modify: `source/game/widgets.ts`
- Modify: `source/game/audio.ts:32-38` (playFocusSound)
- Modify: `source/game/mainMenuScreen.ts`
- Modify: `source/game/gameScreen.ts`

**Interfaces:**

- Consumes (from Task 2's `source/game/assets.ts` singleton):
  `assets.texture(sheet, frame): pixi.Texture` where `sheet` autocompletes to
  `'ui' | 'character' | 'spark'`, and `assets.sound(name): AudioBuffer` where `name` autocompletes
  to the eight declared sound names. Frame names (second `texture` argument) stay runtime-checked
  strings.
- Produces: `widgets.ts` no longer exports `uiTexture` (deleted); `nineSlice` and `createButton`
  keep their exact signatures.
- Import graph stays acyclic: `assets.ts` imports engine only; `audio.ts`, `widgets.ts` and the
  screens import `assets.ts`.

This is a pure refactor with no behavior change; the type system and the existing suites are the
test, so there is no new test file. Typecheck failing on a typo'd asset name is the feature landing.

- [ ] **Step 1: Migrate `widgets.ts`**

Replace the entire content of `source/game/widgets.ts` with (`uiTexture` is deleted, `nineSlice`
builds on `assets.texture`, the button click sound goes through `assets.sound`; everything else is
unchanged):

```ts
import * as pixi from 'pixi.js';

import {Button} from '../engine/ui/Button.js';
import {Text} from '../engine/ui/Text.js';
import {assets} from './assets.js';
import {audio} from './audio.js';

// All widget art lives in the `ui` spritesheet (default bundle, 1× art px).
// Nine-slice insets ship as per-frame `borders` in the atlas JSON and land on
// `texture.defaultBorders`, so consumers never pass insets in code.
export function nineSlice(name: string): pixi.NineSliceSprite {
  return new pixi.NineSliceSprite({texture: assets.texture('ui', name)});
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
      audio.play(assets.sound('ui-click'), {bus: 'ui'});
      onClick();
    },
    layout: {padding: 2, ...(typeof layout === 'object' ? layout : undefined)},
  });
}
```

- [ ] **Step 2: Migrate `audio.ts`**

In `source/game/audio.ts`:

1. Delete `import * as pixi from 'pixi.js';` (playFocusSound was its only user) and add
   `import {assets} from './assets.js';` immediately before the `./settings.js` import (keeping the
   sorted import order).
2. Replace the body of `playFocusSound`:

```ts
export function playFocusSound(event: UiFocusEvent): void {
  if (event.type === 'move') {
    audio.play(assets.sound('ui-click'), {bus: 'ui'});
  } else {
    audio.play(assets.sound('ui-error'), {bus: 'ui'});
  }
}
```

(No cycle: `assets.ts` imports only the engine, and `audio.ts` → `assets.ts` is one-directional.)

- [ ] **Step 3: Migrate `mainMenuScreen.ts`**

In `source/game/mainMenuScreen.ts`, five point edits:

1. Imports: add `import {assets} from './assets.js';` (before the `./audio.js` import) and drop
   `uiTexture` from the widgets import:

```ts
import {createButton, nineSlice} from './widgets.js';
```

(The `import * as pixi` stays — `pixi.Sprite` is still used.)

2. `toggleSprite` (in `toggleBackgrounds`):

```ts
let toggleSprite = (name: string) => new pixi.Sprite(assets.texture('ui', name));
```

3. `nameInput`'s `onChange`:

```ts
audio.play(assets.sound('ui-key'), {bus: 'ui'});
```

4. `soundToggle`'s `onChange`:

```ts
audio.play(assets.sound('ui-click'), {bus: 'ui'});
```

5. The screen options — `focusRing` and the music line in `onShow`:

```ts
  focusRing: () => ({texture: assets.texture('ui', 'focus-ring'), padding: 2}),
```

```ts
audio.playMusic(assets.sound('menu-music'));
```

- [ ] **Step 4: Migrate `gameScreen.ts`**

In `source/game/gameScreen.ts`, three point edits:

1. Imports: delete `import * as pixi from 'pixi.js';` (the `game-music` lookup was its only
   remaining use), add `import {assets} from './assets.js';` (before the `./audio.js` import), and
   drop `uiTexture` from the widgets import:

```ts
import {createButton, nineSlice} from './widgets.js';
```

2. The screen's `focusRing` option:

```ts
  focusRing: () => ({texture: assets.texture('ui', 'focus-ring'), padding: 2}),
```

3. The music line in `onShow`:

```ts
audio.playMusic(assets.sound('game-music'));
```

- [ ] **Step 5: Verify the migration is complete**

Run: `grep -rn "uiTexture\|Assets\.get" source/game/` Expected: no output — every game-layer lookup
now goes through `assets`. (Engine-internal `pixi.Assets.get` calls in `Sprite`, `Map`, `Tilemap`,
`Tileset` and `audioSystem` remain by design; they resolve names arriving at runtime.)

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test` Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add source/game/widgets.ts source/game/audio.ts source/game/mainMenuScreen.ts source/game/gameScreen.ts
git commit -m "Migrate game asset lookups to the assets singleton"
```
