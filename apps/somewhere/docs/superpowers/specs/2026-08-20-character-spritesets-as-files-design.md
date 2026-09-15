# Characters as one ordinary spriteset file

Date: 2026-08-20 App: `apps/somewhere` Status: approved design, pending implementation plan

Supersedes `docs/superpowers/specs/2026-08-19-character-spritesets-design.md`.

## Background

Yesterday's design moved character art onto runtime slicing: `Spriteset.fromTileset(tileset, packIndex)`
cuts a character's block out of the loaded `character-tileset`, and `GameAssets` resolves it through a
second, parallel code path. The API that fell out of it is wrong:

```ts
characterSpritesets: {
  character: {tileset: 'character-tileset', packIndex: 27},
  mira: {tileset: 'character-tileset', packIndex: 14},
  npc: {tileset: 'character-tileset', packIndex: 8},
},
```

Sharing one atlas is not the problem; it is the point, since every character then costs one request.
The problem is that `public/character-tileset.json` describes that atlas in the Tiled tileset format,
which carries tile ids and no animation names, so the missing information had to be reintroduced in
code as a pack index and a slicing routine.

There is no "character spriteset" file format. There is one spriteset format, `spritesetSchema`, and
`public/spark.json` already shows it carries everything characters need: an image, named frames, and
named animations with their own speed and loop. Describe the atlas in that format and the pack index,
the slicing routine, the bundle field and the parallel resolution path all become unnecessary.

## Design

### `public/characters.json`

One spriteset file, checked in like `spark.json` and `ui.json`, describing `character-tileset.png`.
All characters live in it, so loading them stays a single request for the JSON and a single request
for the atlas.

Frames are named `${character}-${direction}-${column}` for `down`/`left`/`right`/`up` and columns 0, 1
and 2, cut from each character's block in the atlas:

| Character            | Block origin (x, y) |
| -------------------- | ------------------- |
| `character` (player) | 96, 480             |
| `mira`               | 48, 240             |
| `npc`                | 144, 80             |

Every frame is 16x20; `x = originX + column * 16` and `y = originY + row * 20`, where the row offset
is 0 for `down`, 1 for `left`, 2 for `right` and 3 for `up`. These are the blocks the runtime slicing
produces today, so the art does not change.

Animations are named `${character}-standing-${direction}` showing that row's middle frame, and
`${character}-walking-${direction}` cycling the row's three frames. Both take the schema defaults
(`speed: 0.15`, `loop: true`), so neither key appears in the file. `character-spin` is the player's
four standing frames in down/left/up/right order at `speed: 0.3` with `loop: false`; Mira and the NPC
get no spin, because only the player reads the spin input and `NPC_SPRITE_NAMES` never asks for it.
That is 36 frames and 25 animations.

Mira's share of the file, as the template for the other two:

```json
{
  "image": "character-tileset.png",
  "frames": {
    "mira-down-0": {"x": 48, "y": 240, "width": 16, "height": 20},
    "mira-down-1": {"x": 64, "y": 240, "width": 16, "height": 20},
    "mira-down-2": {"x": 80, "y": 240, "width": 16, "height": 20},
    "mira-left-0": {"x": 48, "y": 260, "width": 16, "height": 20},
    "mira-left-1": {"x": 64, "y": 260, "width": 16, "height": 20},
    "mira-left-2": {"x": 80, "y": 260, "width": 16, "height": 20},
    "mira-right-0": {"x": 48, "y": 280, "width": 16, "height": 20},
    "mira-right-1": {"x": 64, "y": 280, "width": 16, "height": 20},
    "mira-right-2": {"x": 80, "y": 280, "width": 16, "height": 20},
    "mira-up-0": {"x": 48, "y": 300, "width": 16, "height": 20},
    "mira-up-1": {"x": 64, "y": 300, "width": 16, "height": 20},
    "mira-up-2": {"x": 80, "y": 300, "width": 16, "height": 20}
  },
  "animations": {
    "mira-standing-down": {"frames": ["mira-down-1"]},
    "mira-walking-down": {"frames": ["mira-down-0", "mira-down-1", "mira-down-2"]},
    "mira-standing-left": {"frames": ["mira-left-1"]},
    "mira-walking-left": {"frames": ["mira-left-0", "mira-left-1", "mira-left-2"]},
    "mira-standing-right": {"frames": ["mira-right-1"]},
    "mira-walking-right": {"frames": ["mira-right-0", "mira-right-1", "mira-right-2"]},
    "mira-standing-up": {"frames": ["mira-up-1"]},
    "mira-walking-up": {"frames": ["mira-up-0", "mira-up-1", "mira-up-2"]}
  }
}
```

The player's block starts at x 96, y 480 and the NPC's at x 144, y 80; both follow the same pattern
under the `character-` and `npc-` prefixes.

### `source/game/assets.ts`

```ts
spritesets: {
  spark: ['spark.json'],
  portraits: ['portraits.json'],
  'prompt-bubble': ['prompt-bubble.json'],
  characters: ['characters.json'],
},
```

`characterSpritesets` goes, and so does `tilesets: {'character-tileset': ['character-tileset.json']}`:
nothing loads the Tiled tileset any more, because `characters.json` references the atlas image
directly.

### Deletions

`source/engine/app/GameAssetBundle.ts`: the `CharacterSpritesetEntry` type and the
`characterSpritesets` field, leaving six uniform `GameAssetSources` groups.

`source/engine/graphics/Spriteset.ts`: `fromTileset`, `characterBlockOrigin`, the
`CHARACTERS_PER_SHEET` / `CHARACTER_BLOCKS_PER_SHEET_ROW` / `CHARACTER_BLOCK_WIDTH` /
`CHARACTER_BLOCK_HEIGHT` / `CHARACTER_DIRECTIONS` constants and the `Tileset` import. `Spriteset` is
file-backed only again.

`source/engine/app/GameAssets.ts`: `#characterSpritesetCache`, `#findCharacterSpriteset`, the
character branch in `#resolveSpriteset`, the `tilesetNames` set and the validation loop in the
constructor (the two field assignments stay), the `characterSpritesets` loop in `areBundlesLoaded`,
and the `SpritesetAssetNames` alias, whose uses become `AssetNames<Bundles, 'spritesets'>`.
`#resolveTileset` has no caller once the character branch is gone, so it and the `Tileset` import go
with it.

### Reaching a character's animations

One file means one flat `animations` record, so the keys carry the character and `show()` has to be
called with the full name. `pickDirectionalSpriteName` builds names at runtime from velocity and
returns a bare `walking-down`, so the character has to travel from spawn to the call site.

The smallest bridge, kept deliberately small because the loading and usage chain is due a proper look
of its own (see Follow-up): `GraphicsComponentOptions.spriteOptions` gains `character?: string`, and
`GraphicsComponent` stores the derived `spriteNamePrefix`, either `''` or `` `${character}-` ``. It
applies the prefix once when building the `Sprite`, so callers keep passing bare names:

```ts
this.spriteNamePrefix = spriteOptions.character ? `${spriteOptions.character}-` : '';
this.sprite = new Sprite({
  spriteset: assets.spriteset(spriteOptions.assetName as never),
  spriteNames: spriteOptions.spriteNames.map((name) => this.spriteNamePrefix + name),
});
```

The two `show()` call sites concatenate:

```ts
// graphicsSystem.ts:45
sprite.show(spriteNamePrefix + pickDirectionalSpriteName(motion.velocity));
// playerActionSystem.ts:33
sprite.show(`${spriteNamePrefix}spin`, {...});
```

`Sprite` and `Spriteset` are untouched, and the wall-hit spark passes no `character`, so its prefix is
empty and `spark` resolves exactly as today.

`playerPool` sets `assetName: 'characters'` with `character: 'character'` and keeps its nine bare
sprite names. `objectFactories` sets `assetName: 'characters'` with
`character: typeof sprite === 'string' ? sprite : 'npc'` and keeps `NPC_SPRITE_NAMES`, so map objects
carrying `sprite: "mira"` keep working unchanged. The comment at `objectFactories.ts:19` calls the
fallback art "the npc characterSpriteset (assets.ts)" and needs rewording to match.

### Tests

Delete `describe('Spriteset.fromTileset')` in `tests/Spriteset.test.ts` together with the
`createCharacterTileset`, `createTilesetWithColumnCount` and `tileIds` helpers if nothing else uses
them. Delete `describe('GameAssets characterSpritesets')` in `tests/GameAssets.browser.test.ts` with
its `createAssetsWithCharacterSpritesets` and `fakeTileset` helpers.

`tests/exportedAssets.test.ts` gains a `characters.json` case. It cannot join the existing `test.each`
list, whose assertion derives the image name from the JSON name; it asserts that the schema parses,
that `image` is `character-tileset.png`, that all three characters have their eight directional
animations, and that `character-spin` has `loop: false` with `speed: 0.3`. That last assertion
replaces the one yesterday's design moved into `Spriteset.test.ts`.

`tests/graphicsSystem.test.ts` and `tests/playerActionSystem.test.ts` construct Spritesets directly
and mock `assets.spriteset`; their fixtures pass no `character`, so the empty prefix keeps them
working unchanged. Each gains one case covering the prefixed path, asserting that a component built
with `character: 'mira'` shows `mira-walking-down` and that a prefixed player shows `character-spin`.

## Follow-up, not part of this work

How the character reaches `show()` deserves an analysis of the whole loading and usage chain rather
than the local fix above. This design keeps that bridge to one optional field and two concatenations
so it is cheap to replace.

## Non-goals

No change to the `sync-tilesets` pipeline or to `scripts/stitch-character-atlas.mjs`. The
`character-tileset` entry in `tilesets.config.json` still produces `public/character-tileset.png`,
which is what `characters.json` consumes; the `public/character-tileset.json` it also produces stops
having a reader in `source/`. Removing that dead output means giving the atlas another route into
`public/`, which is a question about the tileset tooling, not about this API.

No change to `ui.json`, `spark.json`, `portraits.json` or `prompt-bubble.json`, and no change to the
`Spriteset` file format itself.
