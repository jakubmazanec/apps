# UI theme

## Goal

Game appearance — art, typography, focus ring — is declared once and consumed by
widgets directly. No game-code helper assembles widgets from parts.

Two supporting changes fall out of it: `GameAssets` gains the one accessor it is
missing, and `GameScreenOptions.focusRing` is deleted.

## Invariants

- **`GameAssets` returns only shared, cached assets.** Every value it hands out
  is owned by the pixi cache; callers never destroy one. It constructs no
  display objects.
- **`Game` is the engine's only seam onto `GameAssets`.** It already holds one
  (`Game.ts:43`); no widget, `Sprite`, or other engine class gets a handle. They
  receive resolved assets instead. This is what keeps widgets constructible in
  tests from `pixi.Texture.WHITE` with no asset pipeline.
- **Backgrounds are owned per widget.** A widget destroys its own backgrounds
  (`adoptDetachedBackgrounds`), so background *instances* are never shared and
  never live in the theme.

## `GameAssets`

Gains one method:

```ts
spriteset(name: AssetNames<Bundles, 'spritesets'>): Spriteset
```

A pure lookup, matching `texture()` and `sound()`. `texture()` and `spriteset()`
share a private resolver that checks `pixi.Assets.cache.has(name)` **before**
calling `pixi.Assets.get` — that ordering avoids a pixi cache warning and is
pinned by `tests/GameAssets.test.ts:132-139`.

Throws, in the existing message style:

- `Spriteset "X" wasn't loaded!` — not in the cache
- `Asset "X" is not a spriteset!` — cached value is not a `Spriteset`

No factory methods. Display objects are built by the code that owns their
lifetime.

## Theme

### Types

One generic shape, instantiated twice — once as declaration, once as resolved
data:

```ts
type UiTextStyle = {fontFamily: string; fontSize: number; fill: pixi.ColorSource};

type UiThemeOf<T> = {
  button: {normal: T; hovered: T; active: T; disabled: T};
  textInput: {normal: T; hovered: T; disabled: T};
  slider: {track: T; fill: T; hovered: T; disabled: T};
  toggle: {
    unchecked: T;
    checked: T;
    hovered: T;
    hoveredChecked: T;
    disabled: T;
    disabledChecked: T;
  };
  panel: {background: T};
  focusRing: {texture: T; padding: number};
  text: {label: UiTextStyle; body: UiTextStyle};
};

type UiThemeDescription = UiThemeOf<readonly [spriteset: string, frame: string]>;
type UiTheme = UiThemeOf<pixi.Texture>;
```

Both types live in the engine, beside the widgets that consume them. `text`
entries match the shape `DialogueBox.ts:41` already accepts, so
`dialogueBoxSystem` passes `theme.text.body` straight through.

### Declaration

`source/game/theme.ts` exports a `UiThemeDescription` literal. It names frames;
it holds no textures, so it is safe to evaluate at module load:

```ts
export const theme: UiThemeDescription = {
  button: {
    normal: ['ui', 'button-normal'],
    hovered: ['ui', 'button-hovered'],
    active: ['ui', 'button-active'],
    disabled: ['ui', 'button-disabled'],
  },
  focusRing: {texture: ['ui', 'focus-ring'], padding: 2},
  text: {
    label: {fontFamily: 'monogram-outline', fontSize: 12, fill: 0xffffff},
    body: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
  },
  // ...remaining art entries
};
```

### Resolution

`GameOptions` gains `theme: UiThemeDescription`, beside `assets` and `input`.
`source/game/game.ts` passes it at module level.

`Game.init()` resolves every `[spriteset, frame]` pair through
`GameAssets.texture()` immediately after `loadBundles(['default'])`
(`Game.ts:60-62`), and exposes the result as `game.theme: UiTheme`.

Resolving inside `init()` is what makes the load-order guarantee structural
rather than conventional: the description is static data, so nothing at a
declaration site needs deferring, and no resolved texture can be read before the
bundle carrying it has loaded.

**Constraint:** every frame named in the description must live in the `default`
bundle, since that is the only bundle loaded when resolution runs. All UI art
does.

### Consumption

Screens receive `game` in `onAttach(screen, game)` and read `game.theme`. Widget
options take an explicit `theme` property.

The theme is a default, not a mandate. `backgrounds` remains on every widget's
options, still typed `pixi.Container`, and an explicit value wins over the
theme's. `Text` likewise keeps `fontFamily` / `fontSize` / `fill` as overrides.
This preserves the escape hatch for one-offs and keeps the existing widget tests
working unchanged, since they pass backgrounds explicitly.

Most widget suites — `Button`, `Slider`, `Toggle`, `TextInput`, `UiRoot`,
`Modal`, `Game`, `GameScreen` — mock `pixi.js` wholesale and have no real
`Texture` at all. Theme fixtures for them must be opaque sentinels, not textures,
and no widget test can assert `Sprite` versus `NineSliceSprite`. That
distinction belongs to background realization, which is tested against real pixi
on its own.

## Background realization

A widget builds a background from a theme texture by one rule:

> **`texture.defaultBorders` present → `pixi.NineSliceSprite`; absent →
> `pixi.Sprite`.**

Insets already ship as per-frame `borders` in the atlas JSON and reach the
texture as `defaultBorders` (`Spriteset.ts:96-103`), so the atlas alone decides
whether a piece of art is nine-sliced. Adding `borders` to a frame changes its
rendering with no code change.

Deriving the rule from the texture rather than hard-coding it per widget also
makes pixi's silent fallback unreachable: `NineSliceGeometry.defaultOptions`
substitutes 10 px insets for a texture with no `defaultBorders`, and under this
rule such a texture never reaches `NineSliceSprite`.

This lives as an engine-internal module in `source/engine/ui/`, alongside
`resolveBackgrounds.ts`, `swapBackground.ts` and `adoptDetachedBackgrounds.ts`.

## Widgets

`Button`, `TextInput`, `Slider`, `Toggle`, `Panel`, `Text` and `UiRoot` accept
`theme` and default from it: each widget reads the entry named for it, `Panel`
reads `theme.panel.background`, and `UiRoot` reads `theme.focusRing`.

`Text` and `TextInput` additionally take `role?: 'label' | 'body'`, selecting
which `theme.text` style applies. It defaults to `'label'`, which covers ten of
the fourteen current sites.

`UiRoot` reads `theme.focusRing` for the ring it builds lazily
(`UiRoot.ts:316`, `UiRoot.ts:343-348`). `GameScreenOptions.focusRing` and the
thunk it required are deleted; a screen no longer configures a root-level
concern.

`FocusRingOptions` (`UiRoot.ts:10-17`) is kept as-is — `UiTheme['focusRing']`
is structurally identical to it, so `UiRoot` keeps its current parameter type
and simply receives the theme's entry.

`DialogueBox` takes the theme too, and its `panelBackground` and
`choiceBackgrounds` thunks are deleted. It builds its `Panel`s and choice
`Button`s internally (`DialogueBox.ts:337-341`, `DialogueBox.ts:381-385`), so
those widgets now build their own backgrounds from the theme. The
"fresh instance per call" contract the thunks existed to satisfy
(`DialogueBox.ts:38`) is satisfied by construction and its comment goes with
them.

Widgets contain no audio. `Button` calls `onClick` and nothing else. UI sound
stays where it already is: the `onFocusEvent` → `playFocusSound`
(`audio.ts:33-39`) path, which maps focus `move` to the `ui-click` clip, so
keyboard navigation is unaffected. Pointer clicks are silent.

## `Sprite`

`SpriteOptions` takes a resolved `spriteset: Spriteset` in place of
`assetName: string`. `Sprite`'s `pixi.Assets.get` call and its `instanceof
Spriteset` guard (`Sprite.ts:26-31`) are deleted — the type proves what the
guard checked.

`GraphicsComponentOptions` declares its own `{assetName, spriteNames}` instead
of passing the engine's `SpriteOptions` through, and `GraphicsComponent` resolves
via `assets.spriteset(assetName)` when it constructs the `Sprite`
(`GraphicsComponent.ts:32`). Resolution happens at entity spawn, after load.

Declaration sites are unchanged: `playerPool.ts:22`, `objectFactories.ts:89` and
`wallHitPopupSystem.ts:60` still name their asset, which is what a module-level
literal must do.

## Deleted

- `source/game/widgets.ts` — `nineSlice`, `createButton`, `CreateButtonOptions`
- `mainMenuScreen.ts:26-40` — `sliderSprite`, `sliderBackgrounds`
- `GameScreenOptions.focusRing` and the thunk it required
- `DialogueBoxOptions.panelBackground` and `DialogueBoxOptions.choiceBackgrounds`
- `Sprite.ts:26-31` — the `pixi.Assets.get` lookup and `instanceof` guard
- repeated `fontFamily` / `fontSize` / `fill` triples across screens (14 sites)

## Out of scope

- **Typed asset keys.** `texture()`'s `frame` argument and the theme
  description's frame names stay `string`.
- **`tilemap()` / `tileset()` accessors.** `Map.ts:40`, `Tilemap.ts:258` and
  `world.ts:116` keep their `pixi.Assets.get` calls.
- **`audioSystem.ts:16`**, which duplicates `sound()` but needs a non-throwing
  lookup.
- **`dialogueBoxSystem.ts:98`**, the documented non-throwing portrait probe.
- **`TextInput.ts:117`**, `pixi.Texture.WHITE` for the caret, which is not a
  manifest asset.

## Testing

`tests/GameAssets.test.ts` gains `spriteset()` cases: the resolved `Spriteset` is
returned, and both throw paths fire. Existing `texture()` and `sound()` tests stay
green unmodified — that is the regression signal for extracting the shared
resolver.

Background realization is tested directly against both branches: a texture with
`defaultBorders` yields a `NineSliceSprite` carrying those insets, one without
yields a `pixi.Sprite`.

Theme resolution is tested through `Game.init()`: every description entry
becomes a texture, and a frame missing from the atlas fails loudly at init rather
than at first render.

Widget tests keep constructing from `pixi.Texture.WHITE` via explicit
`backgrounds`, which also covers the override-beats-theme precedence.
