# GameAssets Design — One Owner for Manifest, Loading and Typed Lookup

Replaces the loose asset-access helpers (`uiTexture`/`nineSlice` reaching into `pixi.Assets`, plus
`pixi.Assets.get<AudioBuffer>('...')` calls scattered across game code) with a single engine class,
`GameAssets`, that owns the asset manifest, `pixi.Assets` initialization, bundle loading and
fail-loud typed accessors.

Scope decisions made during brainstorming:

- **All assets, not just the `ui` sheet.** The sound lookups have the same smell as `uiTexture`
  (stringly-typed, hand-written generic, no fail-loud check) and move behind the same class.
- **Asset names are compile-time typed**, inferred from the manifest injected into the constructor;
  no hand-written type arguments at call sites.
- **Kinds are declared by grouping, not per-asset tags.** Pixi detects `.json` kinds by file
  *content* (`frames` for spritesheets, internal `"type": "map"`/`"tileset"` for Tiled files),
  which the type system cannot see, so the manifest groups names under `spritesheets`, `sounds`,
  `fonts`, `tilemaps` and `tilesets` keys. One declaration per group, no `kind` field per asset,
  no filename or folder conventions.
- **`GameAssets` owns loading too.** The `pixi.Assets.init`/`loadBundle` plumbing moves out of
  `Game`; `Game` receives the instance and calls it. A lookup-only facade over a cache another
  class fills was rejected as a thin pass-through layer.
- **Display-object construction stays out.** `nineSlice()` and `createButton()` remain widget
  builders in `widgets.ts`, now built on `assets.texture()`. Engine classes that already resolve
  assets internally by name (`Sprite`, `Map`, `Tilemap`, `Tileset`, `audioSystem`) are untouched.

## Context

Asset access today is split across three idioms:

1. `widgets.ts` exports `uiTexture(name)` (fail-loud texture fetch from the `ui` spritesheet) and
   `nineSlice(name)` on top of it.
2. `audio.ts`, `widgets.ts`, `mainMenuScreen.ts` and `gameScreen.ts` call
   `pixi.Assets.get<AudioBuffer>('ui-click')` and friends directly, each with a hand-written type
   argument and no existence check.
3. `Game` owns the manifest (`new Game({assetBundles})`), builds the pixi manifest in `init()`,
   loads bundles on screen transitions and exposes `isAssetBundleLoaded`/`areAssetBundlesLoaded`
   that nothing outside `Game` calls.

The engine convention for cross-cutting singletons is a game-owned module instance
(`game/audio.ts` exports `audio = new AudioMixer(...)`); `GameAssets` follows it via
`game/assets.ts`. The generic-inference pattern follows `Sprite<const N extends readonly
string[]>`: the type parameter infers from the constructor argument.

## 1. Engine surface: `GameAssets` (`source/engine/app/GameAssets.ts`)

The three `pixi.extensions.add(...)` parser registrations (`tiledTilesetAsset`,
`tiledTilemapAsset`, `audioBufferAsset`) move from `Game.ts` to the top of this module; they are
loader plumbing and belong with the loader owner.

### Types

```ts
type GameAssetSources = Record<string, string[]>; // asset name → source URLs

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesheets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
};

type GameAssetGroup = Exclude<keyof GameAssetBundle, 'name'>;

// Distributes over the bundle union so each bundle contributes its own keys.
type BundleAssetNames<Bundle, Group extends GameAssetGroup> = Bundle extends GameAssetBundle
  ? keyof NonNullable<Bundle[Group]> & string
  : never;

type AssetNames<
  Bundles extends readonly GameAssetBundle[],
  Group extends GameAssetGroup,
> = BundleAssetNames<Bundles[number], Group>;
```

`GameAssetSources` and `GameAssetBundle` live in `GameAssetBundle.ts`, rewritten to this grouped
shape; `GameAssetGroup`, `BundleAssetNames` and `AssetNames` stay private to `GameAssets.ts`.
`GameAssetBundleAsset.ts` (`{name, sources}`) is deleted.

### Class

```ts
export type GameAssetsOptions<Bundles extends readonly GameAssetBundle[]> = {
  bundles: Bundles;
};

export class GameAssets<
  const Bundles extends readonly GameAssetBundle[] = readonly GameAssetBundle[],
> {
  constructor({bundles}: GameAssetsOptions<Bundles>);

  // Loading half, called by Game
  async init(): Promise<void>;                      // pixi.Assets.init with the flattened manifest
  async loadBundles(names: string[]): Promise<void>; // throws on a name missing from the manifest
  backgroundLoadAll(): void;                        // background-loads every bundle
  areBundlesLoaded(names: string[]): boolean;

  // Typed lookup half, called by game code
  texture(sheet: AssetNames<Bundles, 'spritesheets'>, frame: string): pixi.Texture;
  sound(name: AssetNames<Bundles, 'sounds'>): AudioBuffer;
}
```

- Literal group keys infer from the object literal passed to the constructor (object keys don't
  widen), so accessor names autocomplete and typos are compile errors. The `readonly` default
  type argument is load-bearing: `const` inference types the argument as a readonly tuple, and
  `GameAssets<readonly [...]>` is not assignable to `GameAssets<GameAssetBundle[]>` (TS2322), so
  a mutable default would make every concrete instance unassignable to the bare `GameAssets`.
- `init()` flattens the groups into pixi's `{alias, src}` manifest entries (the same mapping
  `Game.init` performs today) and calls `pixi.Assets.init({manifest})`.
- `loadBundles` takes plain `string[]` because screens' `assetBundles` are runtime data. It
  validates each name against the manifest and throws `` `Asset bundle "nope" doesn't exist!` ``:
  `pixi.Assets.loadBundle` resolves silently for unknown bundle ids (`Resolver.resolveBundle`
  skips them, despite its JSDoc `@throws`), so without the check a typo'd name loads nothing and
  surfaces nowhere.
- `areBundlesLoaded` keeps the logic of today's `Game.areAssetBundlesLoaded`, iterating all
  names across each bundle's groups against `pixi.Assets.cache`; an unknown bundle name reports
  `false` before touching `pixi.Assets.cache`, preserving today's short-circuit. Today's public
  `isAssetBundleLoaded` has no external callers and survives only as the loop body.
- Frame names inside a spritesheet (`'focus-ring'`) live in the atlas JSON at runtime and stay
  runtime-checked strings.
- Only kinds that game code reads directly get accessors. `fonts`, `tilemaps` and `tilesets`
  exist for loading and bundle checks only: fonts are referenced by family name in `Text`, and
  the Tiled classes resolve their assets internally by name. No caller needs a whole
  `pixi.Spritesheet` either, so sheet resolution (including the mislabeled-group check) is a
  private helper inside `texture()`.

## 2. Game wiring: `game/assets.ts` and `game.ts`

New module `source/game/assets.ts`, mirroring `game/audio.ts`:

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

`game.ts` shrinks to `new Game({assets, focusKeys})`.

## 3. `Game` integration

- `GameOptions.ts` swaps `assetBundles: GameAssetBundle[]` for `assets: GameAssets` (its
  `GameAssetBundle` import goes away).
- Deleted from `Game`: the public `assetBundles` field, the manifest-mapping block in `init()`,
  `isAssetBundleLoaded` and `areAssetBundlesLoaded` (nothing outside `Game` calls them). A
  private `#assets` field takes over.
- `init()` starts `this.#assets.init().then(() => this.#assets.loadBundles(['default']))` as a
  promise chain alongside `this.app.init(...)` — not `await`ed serially ahead of it — and settles
  both with the existing `Promise.all`, preserving the pipeline overlap. After both settle,
  `this.#assets.backgroundLoadAll()`.
- Screen transitions call `this.#assets.areBundlesLoaded(screen.assetBundles)` and
  `this.#assets.loadBundles(screen.assetBundles)` where they use the `Game` methods and
  `pixi.Assets.loadBundle` today.

`Game` needs only the loading half, which takes plain strings, so `GameOptions` types the option
as the bare `GameAssets`. Concretely-typed instances are assignable because the class default is
`readonly GameAssetBundle[]` (see §1); with a mutable default this wiring is a hard TS2322.

## 4. Call-site migration

- `widgets.ts`: `uiTexture` deleted. `nineSlice(name)` becomes
  `new pixi.NineSliceSprite({texture: assets.texture('ui', name)})`; the button click sound
  becomes `audio.play(assets.sound('ui-click'), {bus: 'ui'})`.
- `audio.ts` (`playFocusSound`): `assets.sound('ui-click')` / `assets.sound('ui-error')`.
- `mainMenuScreen.ts`: `toggleSprite` uses `new pixi.Sprite(assets.texture('ui', name))`; the
  `focusRing` option uses `assets.texture('ui', 'focus-ring')`; `ui-key` and `ui-click` lookups
  use `assets.sound(...)`; `audio.playMusic(assets.sound('menu-music'))`.
- `gameScreen.ts`: the focus ring uses `assets.texture('ui', 'focus-ring')`;
  `audio.playMusic(assets.sound('game-music'))`.
- Untouched: engine-internal lookups in `Sprite`, `Map`, `Tilemap`, `Tileset` and `audioSystem`
  (which resolves names arriving in `PlaySound` events at runtime).

Import graph stays acyclic: `assets.ts` imports engine only; `audio.ts` and the screens import
`assets.ts`.

## 5. Error handling

Accessors are fail-loud in the style of `uiTexture` and `Sprite` today:

- Missing asset: `` `Sound "ui-click" wasn't loaded!` `` (and the spritesheet equivalent), thrown
  when the name is absent from `pixi.Assets.cache`. Accessors gate on `pixi.Assets.cache.has`
  before reading, so the miss path throws our error without pixi's `[Assets] ... was not found in
  the Cache` console warning that `Assets.get` logs on every miss.
- Missing frame: `` `Texture "focus-ring" not found in the "ui" spritesheet!` `` (today's message).
- Mislabeled group: grouping is type-level only — it never affects how pixi loads a file — so
  each accessor verifies the runtime type. `texture()` checks the resolved sheet is
  `instanceof pixi.Spritesheet` and throws `` `Asset "map" is not a spritesheet!` ``; `sound()`
  checks `instanceof AudioBuffer` and throws `` `Asset "map" is not a sound!` ``. Filing a Tiled
  JSON under the wrong group fails precisely instead of as a confusing missing-frame error or a
  mistyped return value.

## 6. Testing

New `tests/GameAssets.test.ts`, module-mocking `pixi.js` in `Game.test.ts`'s style but extended
with what the accessors touch: `Assets.get`, `Assets.cache`, a `Spritesheet` class, an
`extensions.add` stub and the three parser-module stubs; a minimal stubbed global `AudioBuffer`
class serves `sound()`'s instanceof check. Cases:

- Accessor happy paths and every fail-loud throw in §5, including a non-`Spritesheet` cached
  value for the mislabeled-group errors.
- `loadBundles` rejects a name missing from the manifest and forwards known names to
  `pixi.Assets.loadBundle`.
- `areBundlesLoaded` across grouped bundles, including a bundle name that does not exist
  (returns `false` without touching `pixi.Assets.cache`).
- `init()` passes the flattened `{alias, src}` manifest to `pixi.Assets.init`;
  `backgroundLoadAll()` passes every bundle name to `pixi.Assets.backgroundLoadBundle`.
- Compile-time cases via `@ts-expect-error`: a sound name passed to `texture()`, an unknown name
  in either group. Only `npm run typecheck` verifies these (vitest strips types without checking
  them), so typecheck is part of the definition of done.

`Game.test.ts`: every `new Game({assetBundles: ...})` construction (about 18 sites plus the
`createGame` helper) becomes `new Game({assets: new GameAssets({bundles: [{name: 'default'}]})})`,
keeping the other options (`choosePixelScale`, `focusKeys`) intact; `GameAssets` is imported
dynamically after the `vi.mock` calls. Tests whose fake screens name asset bundles declare those
bundles in the manifest with one asset (`{name: 'game', sounds: {bump: ['bump.wav']}}`) and the
pixi mock gains `cache: {has: () => false}`: `loadBundles` now validates names, and a
declared-but-cold bundle must still trip the loading screen. The `pixi.Assets` spies keep working
because `GameAssets` calls the same mocked functions; the pipeline-overlap and failed-bundle-retry
tests stay, with the overlap test also asserting `app.init` was called before the asset chain
resolves (serializing assets ahead of `app.init` keeps the existing assertion green while killing
the overlap).

Verification: `npm run typecheck`, `npm run lint`, `npm test`.

## Open decisions

None.
