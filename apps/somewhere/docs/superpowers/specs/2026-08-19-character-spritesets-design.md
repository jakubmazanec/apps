# Character spritesets from the generated tileset — design

Date: 2026-08-19 App: `apps/somewhere` Status: approved design, pending implementation plan

## Background

`public/` currently ships two unrelated formats for character art. `character.json`/`mira.json`/`npc.json`
(plus their `.png`s) are hand-authored **Spriteset** JSON (`spritesetSchema`, `source/engine/graphics/Spriteset.ts`):
named frames and named multi-frame `animations`, loaded via `GameAssets`'s `spritesets` bundle group into
`Spriteset` instances. `public/character-tileset.json`/`.png` is pipeline-**generated** — `npm run sync-tilesets`
produces it from `assets/character-tileset.tsx`/`.png` (a 192×640 atlas stitched from the SuperRetroWorld
character pack by `scripts/stitch-character-atlas.mjs`), in the same Tiled-tileset JSON shape as the map
tilesets. Nothing in `source/` references `character-tileset.json` — it is generated but unused.

Byte-comparing the hand-made files against the pack (`assets/raw/SuperRetroWorld_CharacterPack_Full.zip`,
`sprite_split/character_1..32/character_N_frame16x20.png`) showed `mira.png` is an exact match for pack
character #14; `character.png` (player) and `npc.png` (generic NPC placeholder) match none of the 32 and are
unrelated art.

Decision: stop shipping any hand-authored or per-character-generated JSON for characters. The already-generated
`character-tileset.json`/`.png` becomes the only asset characters load, fetched once; each character (player,
Mira, the generic NPC placeholder) is a small `packIndex` selecting a block of that shared atlas, resolved into
the existing `Spriteset` shape at runtime. This is also what makes tilesets and spritesets "the same JSON
format" in practice: there is only one format left in the character/NPC path, the tileset one, and `Spriteset`
becomes a thin runtime view over it rather than a second file format.

## Character pack layout (verified against `public/character-tileset.png`)

32 characters, 8 per combined sheet (`character_1-8.png` … `character_25-32.png`), 4 sheets stacked vertically
by the stitch script. Each character occupies a 3-tile-wide × 4-tile-tall block (16×20 art px tiles); within a
sheet, characters are numbered row-major across a 4×2 grid of blocks. Within a character's block, rows are
down/left/right/up (in that order) and, within a row, the 3 columns are walk frames with the middle column
doubling as the standing frame. Verified two ways: it reproduces `mira.json`'s existing frame numbering
(`"1","2","3","13","14","15","25","26","27","37","38","39"` relative to a 48×80 crop) exactly, and a rendered
contact sheet of all 32 blocks cut from `public/character-tileset.png` was visually cross-checked against the
pack's per-character reference images.

```ts
function blockOrigin(packIndex: number) { // 1..32
  let c = packIndex - 1;
  let sheet = Math.floor(c / 8);
  let withinSheet = c % 8;
  let colBlock = withinSheet % 4;
  let rowBlock = Math.floor(withinSheet / 4);

  return {
    tileCol: colBlock * 3, // 0-based tile column of the block's top-left tile
    tileRow: sheet * 8 + rowBlock * 4, // 0-based tile row
  };
}
// direction row offsets from tileRow: down 0, left 1, right 2, up 3
// frame column offsets from tileCol: 0/2 = walk step frames, 1 = standing frame
```

Character picks: player = **#27**, Mira = **#14** (already in use, unchanged), generic NPC placeholder = **#8**.

## Design

### `Spriteset.fromTileset` (new, `source/engine/graphics/Spriteset.ts`)

```ts
static fromTileset(tileset: Tileset, packIndex: number): Spriteset
```

Applies `blockOrigin` plus the tileset's own `columnCount` to compute each direction's 3 tile ids, pulls
`Tileset.getTile(id).textures[0]` for each, and assembles the standard 9 named animations:
`standing-down/left/right/up` (1 frame, the row's middle tile), `walking-down/left/right/up` (3 frames),
and `spin` (the 4 standing frames in down/left/up/right order, speed 0.3, `loop: false` — the exact clip
`character.json` hand-authored today). Every character gets all 9; nothing is character-specific in code,
only the `packIndex` differs. Returns a plain `Spriteset` — `Sprite`/`GraphicsComponent` need no changes.

### `GameAssets` (`source/engine/app/GameAssets.ts`)

New bundle field, `GameAssetBundle.characterSpritesets?: Record<string, {tileset: string; packIndex: number}>`
(sibling to the existing `spritesets`/`tilesets` — not part of the pixi manifest, since nothing is fetched for
it separately). `spriteset(name)` resolution order: an internal cache of already-built character spritesets;
else, if `name` is a configured `characterSpritesets` entry, resolve its `tileset` from `pixi.Assets.cache`
(must already be loaded — same ordering requirement bundles already have), build via `Spriteset.fromTileset`,
cache, and return; else fall back to today's pixi-cache-backed lookup (`ui`, `spark`, `portraits`,
`prompt-bubble`). `areBundlesLoaded` checks a `characterSpritesets` entry's readiness via its `tileset`'s cache
key instead of the entry's own name.

### `source/game/assets.ts`

```ts
tilesets: {tileset: ['tileset.json'], 'character-tileset': ['character-tileset.json']},
characterSpritesets: {
  character: {tileset: 'character-tileset', packIndex: 27},
  mira: {tileset: 'character-tileset', packIndex: 14},
  npc: {tileset: 'character-tileset', packIndex: 8},
},
```

Replaces the current `spritesets: {character: [...], mira: [...], npc: [...]}` entries. `spark`, `portraits`,
`prompt-bubble` stay as they are today.

### `source/game/objectFactories.ts`

The generic-NPC fallback (`sprite` property absent) now gets real 8-direction art like every other character,
so the "npc sheet lists its one frame under every clip name" workaround is dead: `NPC_SPRITE_NAMES` drops to
the same list `playerPool.ts` already uses (8 directions, +`spin` is player-only — NPCs don't read the `spin`
input). `NPC_WIDTH`/`NPC_HEIGHT` stay 16×20 (tile size is unchanged) but the comment pointing at
`public/npc.json` is stale and goes.

### Deletions

`public/character.json`, `public/character.png`, `public/mira.json`, `public/mira.png`, `public/npc.json`,
`public/npc.png`. `assets/character-tileset.tsx`/`.png` and the sync-tilesets config entry for it are unchanged
(already correct — this design only changes what consumes the generated output).

### Tests

`tests/exportedAssets.test.ts`: drop `character.json`/`npc.json`/`mira.json` from the Spriteset-schema
`test.each` list and the dedicated `spin` assertion (there's no longer a static file to parse); both get
replaced by direct tests of `Spriteset.fromTileset`. New/updated coverage:

- `Spriteset.fromTileset`: frame rects for a couple of known `packIndex` values (including #14, whose
  frames are independently known from today's `mira.json`) and the `spin` animation's exact frame order.
- `GameAssets`: `characterSpritesets` resolution and caching, and the `areBundlesLoaded`/tileset-readiness
  ordering.
- `objectFactories.test.ts`: generic-NPC fallback still produces a working 8-direction `GraphicsComponent`.

## Non-goals

- No changes to `ui.json`, `spark.json`, `portraits.json`, `prompt-bubble.json` — unrelated hand-drawn art,
  not sourced from the character pack.
- No collision/animation authoring on `character-tileset` in Tiled — characters don't need tile collision, and
  their walk-cycle "animation" is the new runtime `Spriteset.fromTileset`, not a Tiled per-tile `<animation>`.
- No change to the `sync-tilesets` pipeline or `tilesets.config.json` — `character-tileset.json`/`.png` are
  already generated correctly; this design only wires up their (previously missing) consumer.
