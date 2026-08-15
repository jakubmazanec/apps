# Tileset automation

The game's tilesets are Tiled-format files. Setting up collision boxes and animations for hundreds
of tiles by hand in the Tiled editor is repetitive work, and the hand-maintained copies in `public/`
used to drift silently out of sync with the sources in `assets/`. The tileset automation pipeline
solves both problems: it decides collision geometry and animation wiring automatically for the
common cases, and it makes the shipped files a generated, verified product of the committed sources.

Manual editing in Tiled remains fully supported. The pipeline and the editor work on the same files,
and anything you author by hand is preserved; automation can be overridden per tile in both
directions.

## Sources and generated files

- `assets/tileset.tsx` and `assets/tileset.png` are the sources. The `.tsx` is edited both by you
  (in Tiled) and by the pipeline; the image is edited in an image editor.
- `public/tileset.json` and `public/tileset.png` are generated. Never edit them by hand; the next
  pipeline run would overwrite the edit.
- `tilesets.config.json` at the app root describes every tileset and the rules that apply to it.
  Adding a tileset to the game means adding an entry here.
- Tilesets built from extracted downloaded packs (see `npm run extract-assets`) point their `image`
  straight into the pack's folder under `assets/extracted/` when the atlas is already RGBA-encoded.
  Some packs ship a palette-encoded atlas, which the pipeline's PNG decoder rejects; those use a
  committed RGBA conversion in `assets/` instead, for example `assets/interior-tileset.png` (from
  `assets/extracted/super-retro-world-interior-pack-full/atlas_16x.png`) as well as the
  `assets/{fire-dungeon,nature-dungeon,desert,winter}-tileset.png` files. After re-extracting such a
  pack, regenerate them with
  `npx tsx tools/convert-png-to-rgba.ts <input.png> <output.png>`.

The map is not part of this pipeline. `assets/map.tmx` is still exported to `public/map.json` by
`npm run export-assets`, which needs the Tiled application installed. The tileset pipeline runs on
plain Node with no Tiled installation, so it works everywhere, including CI.

## The two commands

The feature has two halves with deliberately different rules.

**`npm run sync-tilesets -- analyze`** is the investigative half. It reads everything it can,
including the map, and turns what it finds into proposals for you to review. It never changes tile
data on its own; accepting a proposal records a durable rule, and the next sync applies it.

**`npm run sync-tilesets`** is the build half. It reads only the tileset, its image and the config,
applies the recorded rules and writes the source `.tsx` and the `public/` artifacts. Because it
never looks at the map or any other transient input, the build is deterministic: the same sources
always produce the same output.

This split is what keeps the generated files trustworthy. Evidence like "these tiles are used on the
collision layer of the demo map" can suggest a rule during analysis, but once you accept it, the
rule stands on its own; deleting the map afterwards changes nothing about the build.

## Flow: everyday work

1. Edit the tileset in Tiled or the image in an image editor, as usual.
2. Run `npm run sync-tilesets`. It reconciles every configured tileset and reports which files it
   wrote; if nothing changed, it writes nothing.
3. Review the diff and commit the sources together with the regenerated `public/` files.

A test in the regular suite verifies that the committed `public/` files match what the sources
produce, so CI fails if the two drift apart. When that happens, the fix is simply to run
`npm run sync-tilesets` and commit the result. You can run the same verification yourself with
`npm run sync-tilesets -- --check`, which computes everything and writes nothing.

To preview what a rule change would do before it touches any file, run
`npm run sync-tilesets -- --report`; it prints the resolved decision and collision geometry for
every tile.

## Flow: setting up collisions

Run `npm run sync-tilesets -- analyze`. For each tileset it prints a report:

- the image's alpha levels, which is how the "solid pixel" threshold gets chosen from evidence
  rather than guessed (drop shadows show up as a distinct semi-transparent level);
- an inventory of empty, fully solid and partially solid tiles;
- collision candidates, each labelled with where the suggestion came from: a box already authored on
  the tile, a tile class, a configured id range, or usage on a collision layer of a configured map;
- the proposed box for each candidate, with a diff against any existing box;
- conflicts and gaps, such as tiles whose art changed since the last run.

When run in a terminal, the report is followed by an interactive review. Candidates are grouped by
provenance, and for each group you answer:

- **accept**: the group is written into the config as a collision rule;
- **skip**: nothing happens, and the group will come up again next time;
- **never**: the tiles are permanently opted out, recorded on the tiles themselves in the `.tsx` so
  the decision survives and is visible in Tiled.

The command says which files it is about to write before writing them. After accepting, run
`npm run sync-tilesets` to actually generate the boxes, then review the diff.

For scripting there is `--json` (the full report as machine-readable output) and `--print-config` (a
ready-made config fragment to paste), and the interactive step is skipped when the command is not
run in a terminal.

### How a tile's collision is decided

Every tile resolves to one collision mode:

- `none`: no box.
- `bbox`: a box around the tile's solid pixels. Drop shadows do not count as solid, which matters
  because the bottom edge of the box also drives draw order.
- `footprint`: like `bbox`, but only the bottom few rows; for tall props where only the base should
  block movement.
- `full`: the whole tile.

Several rules can speak for one tile, and the most specific wins, in this order:

1. an explicit `autoCollision` true/false property on the tile (set in Tiled or by the "never"
   answer during analysis);
2. a hand-drawn box on the tile, which freezes that tile as fully manual;
3. a configured id range;
4. a mode mapped from the tile's class in Tiled;
5. the tileset's configured default mode.

## Flow: setting up animations

Animations are described in the config as regions: a starting tile, a frame count and a per-frame
duration in milliseconds. The tiles of a region are consecutive in the atlas, and the first tile
becomes the carrier of the animation. The sync run writes the animation onto that carrier tile in
the `.tsx` and the generated files.

`analyze` proposes regions by looking for runs of adjacent tiles that look like frames of one sprite
rather than variants or slices of a larger drawing. Detection is a heuristic and the atlas is full
of look-alikes, so proposals are meant to be reviewed, not trusted; the interactive accept/skip step
is the filter. The proposed duration is always a 150 ms placeholder, because timing cannot be read
from pixels; tune it in the config afterwards.

Two things to know when using an animation on the map:

- Only the carrier tile (the region's first tile) animates. Placing a later frame on the map shows
  that frame as a static image. So the map should place the carrier wherever the animation should
  play; the map's `animations` layer exists for exactly this.
- The engine honours each frame's configured duration, so frames can have different timings if you
  author them by hand in Tiled.

## Flow: overriding automation in Tiled

The hybrid model rests on ownership marks that Tiled itself displays and edits. Boxes generated by
the pipeline carry the class `auto`; generated animations are marked with an `autoAnimation`
property on their tile. Everything else is yours, and the pipeline will not touch it.

- **Take over a generated box**: clear its `auto` class in Tiled. From then on it is manual data;
  the pipeline preserves it exactly and stops generating for that tile.
- **Draw your own box**: any hand-drawn box on a tile suppresses automatic collision there.
- **Author your own animation**: add it in Tiled without the marker property. A manual animation
  inside a configured region is kept and reported as a warning rather than overwritten.
- **Turn automation off for a tile**: set `autoCollision: false` or `autoAnimation: false` on the
  tile. This also removes any previously generated data there.
- **Fine-tune generated data**: renaming a generated box or adding properties to it survives
  regeneration; only its geometry is refreshed.

After every sync, each tile carries exactly what the current rules say it should: stale generated
data is removed (for example when a rule is deleted or the art becomes transparent) and manual data
is never touched. Wangsets, terrain, custom properties and anything else the pipeline does not
understand pass through untouched.

## Flow: adding or removing a tileset

To add a tileset, add an entry to `tilesets.config.json` naming its source `.tsx`, source image and
the two output paths, then run `npm run sync-tilesets`. Rules (default collision mode, ranges, class
mappings, animation regions) can start empty and grow through the analyze flow. All paths are
relative to the app root and must stay inside it.

To remove one, first resolve all of its rules to `none` and run a sync so its generated data is
cleaned up, then delete the entry. Deleting the entry first would strand the generated data, since
nothing runs on that tileset again; the command prints a reminder about this.

## Safety

The pipeline computes everything for every tileset before writing anything, so one broken input
surfaces all of its errors in a single run and never leaves a half-updated working tree. Writes are
atomic, and clearly wrong inputs (an image not divisible into tiles, animation frames out of range,
paths escaping the app) are hard errors rather than silently wrong output. The `--check` mode
distinguishes "files are stale, run a sync" from "something is actually broken" by its exit code.
