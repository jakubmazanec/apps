# Tiled tileset automation — design

Date: 2026-08-07 (revised 2026-08-08 after multi-agent plan review; see
`docs/replan/audit/2026-08-08-171232-replan-b9e7940.md`)
App: `apps/somewhere`
Status: approved design, pending implementation plan

## Background

Tilesets for the game are Tiled-format files. The current state, verified against the working
tree rather than assumed:

- `assets/tileset.tsx`, `assets/tileset.png`, `assets/map.tmx` and `assets/somewhere.tiled-project`
  are the Tiled sources. They existed on disk but were untracked, because `assets/.gitignore` was a
  bare `*`. They are now committed (`somewhere.tiled-session` stays ignored, being per-user editor
  state), so the pipeline runs from a fresh clone and in CI. The project file pins
  `compatibilityVersion: 1100`, which is what makes Tiled write `type` rather than `class` on
  objects; the ownership model below depends on it.
- The two sides have already silently diverged: `assets/tileset.tsx` gives tile 192 two identical
  collision objects where `public/tileset.json` has one. Nothing detected this.
- `assets/tileset.png` and `public/tileset.png` are byte-identical (`1e98baf2…`), so the `public/`
  image is already a copy rather than an independent asset.
- `public/tileset.json` is not in Tiled's own output format. `scripts/export-assets.mjs:74`
  reformats every export with `JSON.stringify(value, null, 2)`, so the committed shape is this
  repo's, not Tiled's.
- `source/tiled-tools/` contains Zod schemas for the Tiled JSON format (validation only, no
  writer). They are non-strict: parsing drops unknown keys and injects defaults.
- The engine (`source/engine/tiled/`) consumes a narrow slice of Tiled: collision as unrotated
  rectangles only; animations are played but per-frame durations are discarded
  (`Map.ts:96` hardcodes `animationSpeed = 0.15`); wangsets, tile properties and `spacing`/`margin`
  are ignored. Collision boxes also drive y-sort draw order on every layer, not only the collision
  layer (`Map.ts:171-179`, sort key is the box's bottom edge).
- Setting collision boxes and animations per tile in Tiled is manual, repetitive work. This design
  automates it while keeping manual editing in Tiled fully supported.

## Goals

1. **Real automation.** The pipeline decides collision geometry and animation timing by itself for
   the common cases, and asks a human only where the answer is genuinely a judgement call. A rule
   that automates the easy half and leaves the hard half manual does not clear the bar.
2. **Hybrid authoring.** Automatic generation and manual editing in the Tiled editor coexist on the
   same files. Manual data is never clobbered by regeneration; automation can be overridden per
   tile in both directions.
3. **Deterministic builds.** The artifact-producing step is a pure function of committed source. It
   never consults transient content such as a specific map.
4. **Fully programmatic path.** The pipeline runs with no Tiled binary installed (pure Node),
   suitable for CI.
5. **Multiple tilesets.** Nothing assumes a single tileset; adding one is a config entry.
6. **Meaningful animation timing.** The engine honors per-frame durations from the tileset data.

## Non-goals / out of scope

- The map pipeline: normalization, validation or regeneration of tilemaps. Maps may be *read* as
  optional evidence during analysis (see "Evidence and precedence"); they are never written, and
  never read by the build step.
- Collision shapes beyond unrotated rectangles (the engine rejects everything else).
- In-Tiled JS extensions.
- Wangsets/terrain, tile probability, spacing/margin support (both are 0 today, and nonzero values
  are a hard error rather than a silent miscomputation).

## Decisions

1. **`assets/tileset.tsx` is the source of truth.** It is Tiled's native format, `map.tmx` already
   references it, and it is what the editor round-trips losslessly. `public/tileset.json` and
   `public/tileset.png` become generated artifacts.
2. Workflow: **hybrid**. The pipeline and the Tiled editor operate on the same `.tsx`.
3. **Two phases with different rules.** `analyze` proposes and may read any configured evidence;
   `sync` builds and reads only the tileset, its image and the config. This is what keeps ad hoc
   context out of the build.
4. Automatic collision geometry: **bounding box of solid pixels**, where solid excludes drop
   shadows. Validated against the existing hand-authored boxes (see "Collision").
5. Automatic animations: **atlas layout convention** in config is the committed source; a
   **detector proposes** config entries during `analyze` but never writes tile data.
6. Engine fix for per-frame animation durations: **in scope**.
7. Tooling code lives in **`tools/`**, written in TypeScript, covered by typecheck and lint. This
   requires Carson override work; see "Wiring".
8. **One config file for all tilesets**: `apps/somewhere/tilesets.config.json`, at the app root
   rather than in `public/`.
9. Hand-authored data **is** used to validate the automatic rules. It is the only ground truth
   available, and a rule that contradicts it is wrong until argued otherwise.

> Superseded from the 2026-08-07 draft, recorded so the reasoning is not lost: `public/tileset.json`
> was the assumed source of truth (wrong, the `.tsx` exists); the config lived in `public/`;
> collision used a transparency-profile footprint rule; and decision 8 of that draft forbade
> deriving any default from hand-authored data. The review measured that footprint rule at 21%
> precision on the tiles the demo map actually uses, which is what prompted 4, 8 and 9 above.

## Architecture

### Source of truth and derived artifacts

```
assets/tileset.tsx   source, hand-edited in Tiled and written by the pipeline
assets/tileset.png   source, hand-edited in an image editor
        |
        |  sync-tilesets
        v
public/tileset.json  generated, never hand-edited
public/tileset.png   generated, a copy of the source image
```

`assets/map.tmx` remains the map source and `public/map.json` remains produced by
`scripts/export-assets.mjs` via the Tiled binary. That script's **tileset half is deleted**; if both
it and `sync-tilesets` wrote the tileset they would fight, and the `.mjs` would win with stale data.
Its map half keeps rewriting the map's tileset reference from `tileset.tsx` to `tileset.json`, which
`tests/exportedAssets.test.ts` asserts.

### Code layout

- `tools/tiled-pipeline/tsx.ts` — read and write Tiled `.tsx`. Reading uses `fast-xml-parser`;
  writing is bespoke, because no generic serializer reproduces Tiled's exact output (1-space indent
  per level, fixed non-alphabetical attribute order, self-closing empty elements). Acceptance
  criterion is a round-trip test: parse `assets/tileset.tsx`, write it back, assert byte-identical.
- `tools/tiled-pipeline/json.ts` — write `public/tileset.json` from the parsed tileset. Format is
  `JSON.stringify(value, null, 2) + '\n'`, matching what `export-assets.mjs` already committed, so
  only semantic equivalence with Tiled's export matters.
- `tools/tiled-pipeline/pixels.ts` — decode a tileset PNG (`fast-png`), slice into tiles, classify
  pixels as solid or not.
- `tools/tiled-pipeline/collision.ts` — pixel masks to boxes, per shape mode.
- `tools/tiled-pipeline/animation.ts` — region specs to `animation` arrays; the proposer.
- `tools/tiled-pipeline/resolve.ts` — the precedence chain that decides, per tile, whether and how
  automation applies.
- `tools/tiled-pipeline/reconcile.ts` — the merge: auto-owned versus manual data, stable object
  ids, canonical normalization. Mutates the parsed tree; never round-trips through Zod.
- `tools/tiled-pipeline/serialize.ts` — pure `(tileset) => string` for both formats. Kept out of the
  CLI so idempotence is testable at a byte seam.
- `tools/tiled-pipeline/evidence/` — optional analysis-only evidence sources. `map.ts` scans
  configured maps for tile usage by layer class. Imported by `analyze` only.
- `tools/tiled-pipeline/config.ts` — Zod schema for `tilesets.config.json`.
- `tools/sync-tilesets.ts` — CLI entry: argument parsing and file I/O, run via `tsx`. Uses
  `node:util` `parseArgs`; no CLI-parsing dependency.

Rules functions are kept separate from I/O for testability. `tools/` modules are ordinary Node code.
Dependency direction is one-way: `tools/` imports the schemas from `source/tiled-tools/`, and
nothing in `source/` imports from `tools/`. `tools/` must not import from `source/engine/`, which
uses `import.meta.env.DEV` and throws outside a bundler.

**Zod is a shape gate only.** It cannot express the cross-field invariants this pipeline needs:
out-of-range tile ids, negative box dimensions and `columns`/`tilecount` mismatches all parse as
valid today. Those are explicit checks in `reconcile.ts`. Parsing also injects defaults
(`fillmode`, `objectalignment`, `tilerendersize`, per-tile `x`/`y`, five objectgroup fields) and
drops unknown keys, which is why the reconciler mutates the raw parsed tree and never round-trips.

### Wiring

- New dependency: **`fast-xml-parser`** as a devDependency of `apps/somewhere`. This changes
  `package-lock.json`, approved 2026-08-08. `fast-png` is already an app devDependency. `tsx` is a
  root devDependency resolved by workspace hoisting, and `npm ls tsx` already reports
  `tsx@4.20.5 invalid: "^4.23.1"`, a pre-existing drift not to be "fixed" incidentally.
- `package.json`: `"sync-tilesets": "tsx tools/sync-tilesets.ts"`. Safe to add directly, because
  Carson generates `package.json` with `strategy: merge` (which is how `export-assets` survives).
- **`tsconfig.typecheck.json` must not be hand-edited.** It is Carson-generated with
  `strategy: overwrite` and no override hook, root `prepare` runs `carson update workspace` on every
  install, and CI fails on a dirty tree straight after `npm ci`. Worse, `@jakubmazanec/eslint-config`
  points `parserOptions.project` at that file, so a `tools/*.ts` outside it is a lint *parse error*,
  and `turbo.json` makes `test` depend on `lint`. Instead: add `tools/tsconfig.json` (no template
  writes that path) with `moduleResolution: "node16"`, register a `tools/**` parser override via
  `.carson/project.json` `overrides.eslintConfig`, and extend `typecheck` via
  `overrides.packageJson.scripts`. Note `lodash.merge` merges arrays by index, so an
  `overrides.tsconfig.include` array would replace entries rather than append.
- The tileset half of `scripts/export-assets.mjs` is deleted. Its Tiled-binary lookup is
  **re-implemented**, not imported: `resolveTiled()` is not exported and the module has top-level
  side effects. The lookup has three branches, not the two previously documented: `TILED_PATH`, then
  `where`/`which`, then the `%ProgramFiles%\Tiled\tiled.exe` probe that exists because the Windows
  installer does not touch `PATH`.
- CI: `--check` runs as a vitest test alongside `tests/exportedAssets.test.ts`, not as a workflow
  step. All workflows are Carson-generated, the only gate is `npm test`, and shelling out to `tsx`
  from vitest would add a subprocess dependency on a hoisted binary for no gain. The check must stay
  write-free: both PR workflows re-run a dirty-tree check after `npm test`.
- Tests live flat in `apps/somewhere/tests/`. The vitest node project is named `unit` and its
  include glob is `tests/**/*.test.*`, so tests colocated under `tools/` would silently not run.
  Fixtures may go in `tests/fixtures/`. Coverage is scoped to `source/**`, so `tools/` reports none.
- `erasableSyntaxOnly: true` applies: no enums, parameter properties or namespaces.

### Config

`apps/somewhere/tilesets.config.json`. At the app root, not in `public/`: `public/` is copied
verbatim into the build and served, and the draft's stated escape hatch ("excludable via Vite
config") does not exist, because `vite.config.ts` is Carson-overwrite with no override hook.

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
        "default": "none",
        "regions": [{"range": [128, 194], "mode": "bbox"}],
        "tileClasses": {"wall": "bbox", "prop": "footprint", "ground": "none"},
        "footprintMaxHeight": 8
      },
      "animations": {
        "regions": [{"start": 256, "frames": 4, "duration": 150}],
        "similarityThreshold": 0.1
      }
    }
  ],
  "analysis": {
    "maps": ["assets/map.tmx"],
    "collisionLayerClasses": ["entities"]
  }
}
```

Paths are relative to the app root (`apps/somewhere/`) and must resolve inside it: absolute paths
and `..` segments are rejected by the schema, and the resolved path is asserted to stay under the
app root. This is not a sandbox against hostile input; it exists so that running the tool on a
branch you have not read cannot overwrite files outside the app.

`tileSize` is deliberately absent. Tiled carries separate `tilewidth` and `tileheight` in the `.tsx`
and those are authoritative; a config that disagreed would be a second source of truth. Grid
metadata (`tilecount`, `columns`, `imagewidth`, `imageheight`) is recomputed from the image each
run, using Tiled's own formula `columns = (imagewidth - margin + spacing) / (tilewidth + spacing)`.
Nonzero `spacing` or `margin` is a hard error rather than a silently wrong slice.

`analysis` is read only by `analyze`. A config with no `analysis` block is complete and builds
identically.

## The two phases

### `sync-tilesets analyze`

Reads the tileset, its image and every configured evidence source. Writes nothing without saying
what it is about to write. Its job is to turn diffuse signal into durable, reviewable state.

What it reports and proposes:

- **Image profile.** Distinct alpha levels present, and the colours found at each. On the current
  atlas this prints one non-opaque level, `rgba(0, 0, 0, 102)`, which is the drop shadow. That is
  how `solidAlphaThreshold` gets chosen from evidence rather than guessed.
- **Tile inventory.** Counts of empty, fully solid and partial tiles, and their atlas distribution.
- **Candidate collision sets**, each with its provenance, so an ad hoc signal is visibly ad hoc:
  - tiles already carrying a manual box;
  - tiles whose Tiled class maps to a collision mode in `collision.tileClasses`;
  - tiles inside a configured `collision.regions` range;
  - tiles used on a layer whose class is in `analysis.collisionLayerClasses`, in a configured map.
- **Proposed geometry** per candidate, plus a diff against any existing box on that tile.
- **Proposed animation regions** from the detector.
- **Conflicts and gaps**: candidates with no proposal, existing auto data with no candidate, tiles
  whose art changed since the last run.

Modes: interactive by default (per group: accept, skip, mark as never), `--json` for scripting,
`--print-config` to emit a config fragment for pasting. Accepting a proposal writes it to durable
state: a `collision.regions` entry, a tile class, or a tile property. **Nothing accepted here leaves
a dependency on the evidence that suggested it.** Deleting the demo map afterwards changes no build
output.

### `sync-tilesets`

A pure function of `(tileset .tsx, image, config)`. Default mode reconciles every configured tileset
and writes when content changed. It does not open a map, and importing `evidence/` from the build
path is a lint-enforced boundary.

- `--check` computes everything and writes nothing.
- `--report` prints the resolved decision and geometry per tile without writing, for reviewing a
  rule change before it touches a file.
- `--import <file.tsx>` is deferred; see "Future work".

## Evidence and precedence

For each tile, `resolve.ts` produces one decision: a collision mode (`none`, `bbox`, `footprint`,
`full`) and an animation ownership flag. Highest precedence wins.

| # | Source | Where it lives | Set by |
|---|---|---|---|
| 1 | tile property `autoCollision` (`true`/`false`) | `.tsx` | Tiled, or `analyze` |
| 2 | a non-auto object already on the tile | `.tsx` | Tiled |
| 3 | `collision.regions` entry matching the tile id | config | `analyze`, or by hand |
| 4 | `collision.tileClasses` mapping for the tile's class | config + `.tsx` | Tiled, or `analyze` |
| 5 | `collision.default` | config | by hand |

`collision.default` defaults to `"none"`. Nothing is generated for a tile that nothing has spoken
for. This is the inversion the review argued for, and it is what makes the first run reviewable:
17 tiles touched rather than 805.

Rules 3 and 4 are both durable and both tileset-intrinsic. Rule 4 is the better long-term home,
because Tiled's per-tile class is first-class, editable in the editor, visible per tile and
independent of any map or id range; `analyze` can bulk-assign it. Rule 3 exists because id ranges
are cheap to write by hand and mirror how animation regions already work.

Layer classes from maps appear nowhere in this table. They are evidence for a proposal, not an
input to a decision.

## Automatic rules

### Collision

A pixel is **solid** iff its alpha is at least `solidAlphaThreshold` (default 255) and it does not
match the tileset's `transparentcolor`. The default excludes drop shadows, which matters because
shadows hang below a sprite and the box's bottom edge is also the y-sort key, so counting a shadow
as solid silently reorders drawing.

Shape modes:

- `bbox` — bounding box of the tile's solid pixels.
- `footprint` — as `bbox`, then clamped to the bottom `footprintMaxHeight` rows:
  `top = max(firstSolidRow, bottom - footprintMaxHeight + 1)`, with the horizontal span computed
  **within rows `top..bottom`**, not over the whole tile.
- `full` — the whole tile.
- `none` — no box.

All arithmetic is inclusive: `width = maxX - minX + 1`, `height = bottom - top + 1`.

The band-restricted span in `footprint` is a correctness fix, not a preference. Computing the span
over the whole tile while clamping the rows gives anything wider at the top than at the base a box
with the top's width at the base's height: tile 1281 (a wall cap over a 5px post) comes out `w:16`
instead of `w:5`, which is 11px of phantom collision exactly where the player walks. 47 of the
atlas's 805 partial tiles are affected, and the band-restricted result is identical everywhere the
two agree.

**Validation against ground truth.** With `solidAlphaThreshold: 255`, `bbox` reproduces the existing
hand-authored boxes on 7 of 8 tiles exactly:

| tile | authored | `bbox` |
|---|---|---|
| 64 | `{x:2, y:8, w:12, h:8}` | identical |
| 66 | `{x:2, y:8, w:12, h:8}` | identical |
| 128 | `{x:2, y:0, w:14, h:16}` | identical |
| 129 | `{x:0, y:12, w:16, h:4}` | identical |
| 130 | `{x:0, y:0, w:14, h:16}` | identical |
| 192 | `{x:2, y:0, w:14, h:11}` | identical |
| 193 | `{x:0, y:0, w:16, h:8}` | `h:7`, author rounded up over a shadow row |
| 194 | `{x:0, y:0, w:14, h:11}` | identical |

The two tiles where an alpha-greater-than-zero threshold would have failed (130 and 194, `w:16`
instead of 14) are exactly the tiles with a shadow column on the right edge, which is independent
confirmation that the shadow exclusion is the right call rather than a fitted constant.

`bbox` is the default mode for a tile that opts in, because the evidence says the author draws
bounding boxes. `footprint` remains available per region or per class for tilesets where the base
is what should collide.

Known limits, handled by override rather than cleverness: a tile with two separated solid regions
(a table, a bridge) gets one box spanning the gap, since single-rectangle output is an engine
constraint; a floating sprite gets a box whose bottom is mid-air, which then becomes its sort key.

### Animations

For each configured region `{start, frames, duration}`: tiles `start … start+frames-1` are the
frames in atlas order, and the first tile of the region carries the `animation` array
(`[{tileid, duration}, …]`). Only the tile carrying the array animates in this engine, so a map cell
placing a later frame renders static. Validation: `frames >= 2`, frames in range, regions
non-overlapping, `duration` a positive integer (Tiled truncates floats). Tiled does not itself
require the animated tile to be its own first frame; this is a convention this pipeline imposes.

Regions carry one duration for the whole run. A hand-tuned per-frame array is a manual claim and is
preserved, not flattened; see "Ownership".

**The proposer** (`analyze`) looks for runs of at least 3 consecutive non-empty tiles that differ
below `similarityThreshold` (default 0.1), measured over the **union** of the two tiles'
non-transparent masks. It rejects runs whose pairwise difference is exactly 0, which are duplicate
tiles rather than frames.

Naive pixel similarity does not work on this atlas and the draft's default of 0.4 would have printed
86 proposals for a tileset with zero animations, 51 of them 2-frame runs, with roughly zero
precision. The reason is structural: tile atlases are laid out in *variant families* (recolours,
edge variants) which are contiguous and similar, exactly the signature the detector was keyed on.
The discriminator that separates them is that a recolour applies a **consistent colour substitution
across the whole sprite**, while an animation frame differs in a **spatially localized** part of it.
So the proposer additionally rejects a run when the pixel differences between adjacent tiles form a
consistent bijective colour mapping over the shared mask. The draft's own example region (256-259)
is five colour variants of one awning with 100% RGB difference and identical masks; the mask-union
metric already scores it 1.0, and the bijection test is what would catch the harder cases where a
recolour is partial.

Proposals are accepted by writing a region into the config. The detector never writes tile data.

## Reconciliation and ownership

Ownership is recorded in the `.tsx` itself, using fields Tiled displays and edits natively.

- **Auto collision objects** carry object class `auto`. The key is `type`, not `class`:
  `TiledObject.ts:20` models only `type`, and Zod would silently strip a `class` key, so the
  post-mutation validation gate would not catch the mistake. Read `class ?? type` (Tiled's own
  reader prefers `class`, and its 1.9 compatibility mode writes it) and always write `type`.
- **Auto animations** carry tile property `autoAnimation: true` on the tile holding the array. The
  draft inferred animation ownership positionally from the current config, which cannot express
  deletion: moving a region's `start` orphaned the old array, the "outside all regions is manual"
  rule then preserved it forever, and `--check` reported no drift because recomputation matched. An
  explicit flag makes ownership symmetrical with collision and restores both the delete rule and
  the gate.
- **Claiming manually**: clear the `auto` class on a box, or add an animation without the flag. A
  non-auto object on a tile suppresses auto collision for that tile. A manual animation inside a
  region is skipped with a warning rather than overwritten.
- **Suppressing**: tile property `autoCollision: false` / `autoAnimation: false`, or a config rule
  resolving to `none`.

### The core invariant

State this as a post-condition on the tile, not as a rule about what gets emitted:

> After reconciliation, a tile carries exactly the auto-owned data the resolved rules say it should.
> Every auto-owned object or animation not in that set is deleted. Non-auto data is untouched.

The draft granted permission to delete auto objects but never obliged it, and separately defined
suppression as "emits nothing". Under that reading, setting `autoCollision: false` to fix a false
positive did not remove the false positive, and a tile edited to fully transparent kept its stale
box forever. The review found 26 of 40 collision state cells undefined; the invariant above closes
almost all of them, including the cross-cutting cases: a tileset dropped from the config, a region
removed, a tile whose art changed.

Remaining cases stated explicitly: `autoCollision: false` and an absent property differ (the former
also deletes); a flag property with a non-boolean type is a hard error, since the property schema is
a discriminated union and a string `"true"` would otherwise be ignored silently; a flag that can
never apply is a warning; an objectgroup left empty is removed, as is a tile entry left with no
payload, matching what Tiled itself prunes.

### Stable identity, stable diffs

- **Object ids**: the heuristic emits exactly one box per tile. Refreshing rewrites `x`, `y`,
  `width` and `height` only, preserving `name`, `visible`, `rotation` and any properties, so a user
  annotation on an auto box survives. If several auto objects exist and one is wanted, the lowest id
  survives and the rest are deleted. A new object takes `max(ids in the group) + 1`, or 1 for a new
  group. Delete-then-insert is forbidden: it reallocates ids every run and the file never converges.
  Ids are unique per objectgroup, not per tileset (every object in the current file is `id: 1`, and
  Tiled will not renumber them); duplicates are a hard error rather than a silent renumber.
- **New objectgroups** are written as `{id: 2, draworder: "index", name: "", opacity: 1,
  visible: true, x: 0, y: 0}`, matching what Tiled wrote for all eight existing tiles. `draworder`
  matters: the schema defaults it to `topdown`, so omitting it validates cleanly and then
  ping-pongs against Tiled on every save.
- **Normalized output**: the `.tsx` writer reproduces Tiled's formatting exactly, proven by the
  round-trip test. The JSON writer emits `JSON.stringify(value, null, 2) + '\n'` with keys sorted
  lexicographically at every level, which is what Tiled's own JSON export happens to produce because
  it serializes sorted `QVariantMap`s. Do not sort `objects` (order is semantic under
  `draworder: "index"`) or `animation` (it is a frame sequence). Do sort the `properties` array by
  property name, as Tiled does. Never use a `JSON.stringify` replacer array to impose key order: it
  drops unlisted keys, which would silently destroy the guarantee below.
- **Pipeline order** is fixed: mutate, prune, sort tiles by id, normalize key order, serialize.

### Never touched

Wangsets, custom properties beyond the pipeline's own flags, `transparentcolor`, terrain data and
any unknown field, guaranteed by mutating the parsed tree in place rather than round-tripping it.
Note the asymmetry worth knowing: the pipeline preserves unknown fields, but a Tiled save does not,
because Tiled's reader discards what it does not recognize.

## Engine change: honor animation durations

- `source/engine/tiled/Tileset.ts`: keep per-frame durations. Add a sibling
  `frameDurations?: number[]` to `TilesetTile` rather than changing the type of `textures`.
  `TilesetTile.textures: Texture[]` is constructed literally at nine sites across three test files
  (`tests/Map.test.ts`, `tests/Tileset.test.ts` and `tests/mapSign.browser.test.ts:135-139`);
  a sibling field breaks none of them, a type change breaks all of them. Note `Spritesheet`'s
  `animations` is `Dict<string[]>` and cannot carry durations, so they travel alongside and are
  zipped in.
- `source/engine/tiled/Map.ts`: build Pixi `FrameObject`s (`{texture, time}`, milliseconds) when
  durations are present, and **delete** `animationSpeed = 0.15`. Pixi still scales the duration path
  by `animationSpeed` (`elapsed = animationSpeed * deltaTime; lag += elapsed / 60 * 1e3`), so
  leaving it in place would play every authored duration 6.67 times too slow.

`tests/Map.test.ts:26-27` and `:127-137` encode the 0.15 arithmetic in comments and assertions and
need updating. This change is independently shippable and cannot regress anything today: no tile
carries an animation and the map's `animations` layer is empty, so its tests are necessarily
synthetic.

## Error handling

Two phases. **Compute** every tileset, continuing past failures so all errors surface in one run.
Enter the **write** phase only if every tileset computed cleanly. Every hard error below is a
compute-phase error, so this costs nothing and removes the half-updated working tree the draft would
have produced. Individual writes are atomic (temp file, then rename), so a crash cannot leave
truncated output in `public/`.

Exit codes: `0` clean, `1` drift (`--check` only), `2` hard error, with `2` winning when both occur.
The draft used nonzero for both, leaving CI unable to distinguish "run `sync-tilesets`" from "the
PNG is corrupt".

Hard errors: missing or undecodable source, image or PNG; image dimensions not divisible by the tile
size; nonzero `spacing` or `margin`; a config path escaping the app root; tile data out of range
after an image shrink; duplicate object ids within a group; config or output failing its schema; a
PNG whose declared dimensions exceed a sanity bound, checked from the IHDR header before decoding,
since a decompression bomb would otherwise exhaust memory before any other check runs.

`--check` is the default path with the write call removed, sharing one compute and serialize
implementation, so the two cannot disagree. A configured tileset with no output file yet counts as
drift.

## Testing

Merge semantics are table-driven, one case per cell of the state space, rather than a single
snapshot: a snapshot pins current behavior including bugs and reports *that* something changed
rather than *which rule*.

- `tsx.ts`: round-trip `assets/tileset.tsx` byte-identically. This is the acceptance criterion for
  the bespoke writer.
- `pixels.ts`: solid classification across alpha thresholds and the `transparentcolor` colour key.
  The colour key matches zero pixels in the real atlas, so it needs a synthetic fixture and cannot
  be assumed covered by the integration test.
- `collision.ts`: inclusive arithmetic; 1-pixel sprites; full-width props; the band-restricted span
  (a signpost fixture: wide board over a narrow post); `footprintMaxHeight` clamping; the eight
  authored boxes as a regression table.
- `resolve.ts`: the precedence chain, each level overriding the one below.
- `reconcile.ts`: the invariant, per cell. Auto replaced; manual preserved; claim-by-declassing;
  deletion on each suppression route; deletion when the art disappears; several auto objects
  collapsing to one; id stability and the delete-then-insert prohibition; objectgroup creation
  fields; pruning.
- Animations: region regeneration; orphan removal after a region moves or is deleted; a manual
  animation inside a region skipped with a warning; `autoAnimation: false`.
- `serialize.ts`: `serialize(reconcile(JSON.parse(once))) === once`. The re-parse matters. The
  draft's `reconcile(reconcile(x)) === reconcile(x)` is a type error if the function returns void
  and vacuously true by reference identity if it returns the mutated tree, so it is a test that
  cannot fail. Add determinism (no `Map`/`Set` iteration order or timestamps leaking in) and
  convergence under the real cycle, `reconcile` then a Tiled save then `reconcile`.
- The proposer: true positives on a synthetic 4-frame fixture, and rejection of a recolour family
  and of duplicate tiles.
- Error paths: exit codes, the all-or-nothing write phase, atomic writes, non-divisible dimensions,
  nonzero spacing, path escape, shrink-with-orphan-data.
- Shipped-asset gate: `--check` cleanliness of `public/tileset.json` against `assets/tileset.tsx`,
  failing CI on drift.
- Engine: extend `tests/Tileset.test.ts` to assert durations survive; update `tests/Map.test.ts` for
  `FrameObject` and the removal of `animationSpeed`.

Fixtures live in `tests/fixtures/` and are small and synthetic. Do not use `public/tileset.png` as
the integration fixture; snapshotting a 4096-tile atlas produces an unreviewable artifact.

## Adoption

The first run is a deliberate, reviewed change, not a side effect of installing the tool.

1. Ship the engine duration fix on its own. It is isolated and cannot regress anything.
2. Clean up the existing `.tsx` drift: the duplicate object on tile 192.
3. Run `analyze` and review what it proposes. On the current atlas, with the demo map configured as
   an evidence source, that is 17 candidate tiles: the 8 already authored (where the proposal should
   match what is there, on 7 of 8) and the 9 of a single 3×3 prop that has no boxes yet. Whether
   that prop should collide is a judgement call and is exactly what the interactive step is for.
4. Accept into config or tile classes, then run `sync-tilesets` and review the diff.
5. Turn on the `--check` gate once the output is clean.

## Future work

- Map pipeline: validate and normalize `map.json`, possibly regenerate the `animations` layer.
- `--import <file.tsx>` and the Tiled-binary adapter. Deferred rather than designed in: with the
  `.tsx` native and read directly, there is no current need, and since the surviving `.mjs` script
  cannot import a `.ts` module the binary lookup would have to exist twice in two languages. Goal 4
  is satisfied by not coupling to the binary, which requires no code.
- Additional evidence sources for `analyze` (wangsets and terrains are the obvious next ones, being
  places where the author has already grouped tiles semantically).
- Non-rectangular collision if the engine ever supports it.
