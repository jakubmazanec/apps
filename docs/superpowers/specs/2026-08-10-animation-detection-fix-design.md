# Fix the Tiled animation detector and wire up the real animations

Date: 2026-08-10
Status: approved design, not yet implemented
Related: `docs/animation-detection-analysis.md` (apps/somewhere), plan `2026-08-08-tiled-tileset-automation.md`

## Problem

The animation detector in the Tiled tileset pipeline is effectively dead for
the real atlas: `similarityThreshold` defaults to `0.1`, but the atlas's real
animation frames (flames 69-71, 133-135, 197-199; door 192-194; torches
581-583, 645-647) differ by 0.43-0.60 between adjacent frames. The plan and
test suite codified "zero proposals on the real atlas" as the expected
outcome, based on the false premise that the atlas has no animations.

Beyond the detector: nothing wires the atlas's existing flame/door frames into
Tiled `<animation>` elements, and the map places animation frames as static
side-by-side strips (doors 193/194/195, torches 582/583/584 + 646/647/648)
instead of placing carrier tiles, so nothing can animate in the game.

## Verified facts (measured 2026-08-10)

1. **The six documented animation strips are real and cleanly detectable at
   `similarityThreshold: 0.7`.** Adjacent-pair differences, all
   `isRecolour: false`:

   | Run | Pairs | Pair diffs |
   |---|---|---|
   | Flame small 69-71 | 69→70, 70→71 | 0.588, 0.593 |
   | Flame medium 133-135 | 133→134, 134→135 | 0.586, 0.605 |
   | Door 192-194 | 192→193, 193→194 | 0.443, 0.430 |
   | Flame large 197-199 | 197→198, 198→199 | 0.588, 0.593 |
   | Torch 581-583 | 581→582, 582→583 | 0.588, 0.593 |
   | Torch base 645-647 | 645→646, 646→647 | 0.586, 0.605 |

   All six runs are bounded by near-total differences (0.97-1.00) at their
   edges, so at 0.7 each emerges as a clean 3-frame region (verified by
   running `proposeAnimationRegions({image, similarityThreshold: 0.7})`:
   exactly `{start: 69|133|192|197|581|645, frames: 3, duration: 150}`).

2. **Threshold sweep on the real atlas** (current detector, varying
   `similarityThreshold`): 0.2 → 6 proposals, 0.4 → 26, 0.6 → 48 (two of the
   six runs still missing), 0.7 → 68 (all six present), 0.8 → 96. The bulk of
   proposals at 0.6-0.8 are variant families (different objects sharing a
   base, e.g. 737-739, 80-83, 540-543) that pass the `isRecolour` check
   because they are not strict bijections. Precision is inherently low at
   animation-catching thresholds; the interactive accept flow is the intended
   filter, and noise is an accepted trade-off.

3. **The atlas contains more genuine animation strips than the six adopted
   here** (candle 578-580, ping-pong torch 641-644, fruit-flicker tree
   648-651, swaying plant 1281-1283, and others). They are out of scope;
   adopting them is the natural follow-up.

4. **The map's actual placements differ from the analysis doc's claims.** The
   analysis said the map uses 192/193/194 and 581-583/645-647; the map
   actually places, statically:
   - `stuff` layer: doors `193,194,195` at (10,10)-(12,10) and (29,29)-(31,29)
     (under arch frames `129,130,131` at y-1); flame-family tiles 137/138/139
     at (10,24)-(12,24); lamps 73/75/77 at (6,31),(8,31),(10,31); trees
     585/586, 649/650; wall pieces 65/67, 129-131, 521-525, 1233-1235,
     1297-1299, 1361-1363, 457-459.
   - `air` layer: torch strips `582,583,584` at (10,7)-(12,7),
     (5,22)-(7,22), (29,26)-(31,26); base strips `646,647,648` at
     (10,8)-(12,8), (5,23)-(7,23), (29,27)-(31,27); door decorations
     1242/1306/2049.
   - `animations` layer: empty.
   The third cell of each torch/base strip is a bush (584, 648), not a torch
   frame.

5. **The engine only animates the carrier tile** (region.start): a map cell
   placing a later frame renders static (`animatedTileIds` in
   `tools/tiled-pipeline/animation.ts`; the Map.ts AnimatedSprite path keys
   off `tilesetTile.textures.length`). So the map's frame strips cannot
   animate until replaced by carrier tiles.

6. **Gids are plain tile ids (firstgid 1) in both `assets/map.tmx` (CSV data)
   and `public/map.json` (plain arrays, no encoding/compression),** so the
   map edit can be applied to both files by script without the Tiled binary
   (not installed here).

## Design

### Section 1 — Detector fix

- `tools/tiled-pipeline/config.ts`: schema default `similarityThreshold`
  `0.1` → `0.7`.
- `tilesets.config.json`: set `animations.similarityThreshold: 0.7`
  explicitly alongside the six regions.
- Replace the two false-premise tests with assertions that the six runs ARE
  proposed:
  - `tests/tiledAnimationProposer.test.ts:164` ("reports nothing on the real
    atlas, which has no animations") → asserts proposals include starts
    69, 133, 192, 197, 581, 645 with `frames: 3` at threshold 0.7.
  - `tests/tiledAnalyze.test.ts:48` ("proposes no animations on an atlas that
    has none") → asserts the same six runs appear in
    `analyzeReal().animationProposals`.
  - `tests/tilesetsConfig.test.ts:37-38`: the real config now has 6 regions
    and threshold 0.7.
- Synthetic-fixture tests (explicit `similarityThreshold: 0.1` and `1`) are
  untouched; they still verify localized-change runs, recolour rejection,
  duplicate rejection, and ping-pong runs.

### Section 2 — Adoption through the pipeline

- `tilesets.config.json` gains six animation regions, all
  `frames: 3, duration: 150` (pipeline placeholder; timing cannot be known
  from pixels):
  `{start: 69}`, `{start: 133}`, `{start: 192}`, `{start: 197}`,
  `{start: 581}`, `{start: 645}`.
- Run `npm run sync-tilesets` to reconcile: `assets/tileset.tsx` gains
  `<animation>` elements on tiles 69, 133, 192, 197, 581, 645 (frame
  `tileid` = start + index, `duration="150"`), and `public/tileset.json`
  mirrors them.
- Commit the regenerated artifacts so the CI gate
  (`tests/tilesetArtifacts.test.ts`, which diffs `computeAll` against the
  committed files) stays green; `tests/exportedAssets.test.ts` validates the
  JSON against the runtime schema, which already supports per-frame
  durations.

### Section 3 — Map placement

Apply the same replacements to `assets/map.tmx` (CSV data) and
`public/map.json` (plain arrays) at the exact same cells:

- Doors: `193,194,195` → `192,192,192` at (10,10)-(12,10) and
  (29,29)-(31,29).
- Torches: `582,583,584` → `581,581,581` at (10,7)-(12,7), (5,22)-(7,22),
  (29,26)-(31,26). The bush cell (584) becomes a carrier.
- Torch bases: `646,647,648` → `645,645,645` at (10,8)-(12,8), (5,23)-(7,23),
  (29,27)-(31,27). The bush cell (648) becomes a carrier.
- `animations` layer (currently empty): place carriers 69 at (6,33), 133 at
  (8,33), 197 at (10,33) — a visible row directly under the lamp row at y=31.
- `public/map.json` is patched in place by script (preserving formatting);
  `exportedAssets.test.ts` remains green (data arrays, exactly one
  class="entities" layer — the animations layer has no class).

Result in-game: both doors cycle through their 3 frames, all torch strips
flicker in sync, and three flame sizes flicker on the showcase row.

## Verification

1. `npm test` — CI gate (tilesetArtifacts), exported-assets schema checks,
   the updated detector/analyze/config tests, and the map-sign browser test
   on the real map all pass.
2. `npm run typecheck` and `npm run lint`.
3. Manual: `npm run develop`, walk the scene — doors animate open/closed,
   torches flicker, flames flicker at (6,33)/(8,33)/(10,33).

## Out of scope / follow-ups

- Adopting the other genuine strips (candle 578-580, ping-pong 641-644, fruit
  tree 648-651, swaying plant 1281-1283, and the rest of the ~68 proposals
  that are real).
- Improving detector precision to cut variant-family noise (a structural
  discriminator) — explicitly declined in favor of accepting the noise.
- Tuning durations (150ms placeholder).
- The `animations` layer is classless, so it does not collide with the
  entities-layer invariant.
