# Tiled tileset automation — animation detection analysis

Date: 2026-08-10 Status: SUPERSEDED — see the correction at the end; the tile identifications below
are wrong Related: commit `ba82d8b` "Add Tiled tileset automation"

## Question

The tileset contains flame animations and door animations. Why were they not detected as
automatically generated animations by the tiled pipeline?

## Findings

### The animations exist in the atlas and are used by the map

| Animation                    | Frames | Tiles                                         |
| ---------------------------- | ------ | --------------------------------------------- |
| Flame flicker (small)        | 3      | 69 (lean left), 70 (upright), 71 (lean right) |
| Flame flicker (medium)       | 3      | 133, 134, 135                                 |
| Flame flicker (large/red)    | 3      | 197, 198, 199                                 |
| Door (closed variants, knob) | 2–4    | 192, 193, 194                                 |
| Door (open doorway)          | —      | 196                                           |
| Torch flicker                | 3      | 581, 582, 583 + bases 645, 646, 647           |

The map (`assets/map.tmx`) uses these tiles:

- `stuff` layer places tiles 192/193/194 under the two `door` objects.
- `air` layer places the 581–583/645–647 torch strips at three positions.

However, no `<animation>` element ever existed in any `.tmx`/`.tsx` in git history, and the
pre-commit `public/tileset.json` export carried zero animations. The frames exist only as atlas art;
nothing wired them up as Tiled animations. The map's `animations` layer is empty.

### The detector cannot see them: threshold too strict

`proposeAnimationRegions` (`tools/tiled-pipeline/propose.ts:140-156`) only continues a run when the
adjacent-pair pixel difference is

```
difference > 0 && difference < similarityThreshold
```

with `similarityThreshold` defaulting to `0.1` (10% of the union of the two frames' pixels may
differ).

Measured adjacent-frame differences on the real atlas:

- Flame: 69→70 = 0.588, 70→71 = 0.593 (same for 133–135, 197–199, 581–583, 645–647)
- Door: 192→193 = 0.443, 193→194 = 0.430

All are 4–6× above the 0.1 threshold, so every run breaks on its first pair and the analyzer reports
`Animation proposals (0)`. Real animation frames (flames flickering, doors opening) change 40–60% of
their pixels between frames; the detector only catches near-identical runs.

### The plan's premise was wrong and tests baked it in

The plan (`docs/superpowers/plans/2026-08-08-tiled-tileset-automation.md`, Task 16) asserted "the
real atlas has no animations" and Task 19 expected "zero animation proposals". These expectations
were codified as assertions:

- `tests/tiledAnimationProposer.test.ts:164` — "reports nothing on the real atlas, which has no
  animations"
- `tests/tiledAnalyze.test.ts:48` — "proposes no animations on an atlas that has none"

The detector was deliberately tuned (threshold 0.1, minimum 3 frames, plus a recolour-family
rejection) so that on this atlas it outputs nothing. That false negative was validated as correct
behavior instead of being tested against the actual atlas content.

The plan's own threshold sweep showed the detector does fire as the threshold rises (0.15 → 1
proposal, 0.2 → 6, 0.4 → 26), but the flame/door runs only become visible around 0.45–0.6 — far past
the default 0.1 — and they are structurally different from the "variant families" (recolour blocks)
the detector was built to reject: they are `isRecolour: false`, localized frame-to-frame changes,
exactly what the plan said it wanted to catch.

## Root cause

The automatically generated animation pipeline is complete and green but effectively dead for this
tileset:

1. `similarityThreshold` (0.1) is an order of magnitude too strict for real flame/door frame
   differences (~0.43–0.60).
2. The plan and test suite codified "zero proposals" as the expected outcome based on the false
   premise that the atlas has no animations.
3. Nothing ever wired the atlas's existing flame/door frames into Tiled `<animation>` elements, so
   even the hand-authored path was unused.

## Evidence commands

```
npm run sync-tilesets -- analyze        # reports Animation proposals (0)
```

Pixel-difference measurements were produced by small scripts in `/tmp/opencode/anims/` using
`readTilesetImage` (`tools/tiled-pipeline/pixels.ts`) and `compareTiles`
(`tools/tiled-pipeline/propose.ts`).

## Recommended direction (not yet implemented)

- Raise / make configurable the detection threshold so flame/door runs (~0.45–0.60 difference) are
  proposable, while keeping the recolour-family rejection to preserve precision on variant blocks.
- Replace the "atlas has no animations" test expectations with assertions that the real flame/door
  runs ARE proposed.
- Then use the pipeline's accept flow to write the animation regions into `tilesets.config.json` and
  reconcile them into `assets/tileset.tsx` / `public/tileset.json`.

## Correction (2026-08-10, after the bad adoption shipped)

The findings table above misidentified the tiles. Rendering the atlas shows:

| Tiles             | Actually are                                                                            |
| ----------------- | --------------------------------------------------------------------------------------- |
| 69–71 / 133–135   | Orange tent roof, top/bottom rows — left/middle/right slices of one 3-tile-wide drawing |
| 192–194           | Couch, three slices                                                                     |
| 197–199           | Red awning, three slices                                                                |
| 581–583 / 645–647 | Green hut roof, top/bottom rows, three slices each                                      |

None of them are animation frames. Adopting them as animations and stamping their carriers over the
map made every hut roof cycle through its own left/middle/right slices — the "animated roof" bug.

The real animations in the atlas are four 6-frame fire strips, at column 33, rows 5–8. They are not
four fires: each strip is one row, and the rows pair up into **two** fires that are two tiles tall,
so a strip on its own draws half a flame:

| Tiles   | Animation               |
| ------- | ----------------------- |
| 353–358 | Small fire, top half    |
| 417–422 | Small fire, bottom half |
| 481–486 | Large fire, top half    |
| 545–550 | Large fire, bottom half |

The pairing is visible in the auto-derived collision boxes, which are just content bounding boxes:
353 and 481 hold their pixels at y 10–16, flush to the bottom edge of the tile, while 417 (y 0–12)
and 545 (y 0–10) sit flush to the top, so each pair meets exactly at the row seam. 417 and 481 do
not touch, which rules out the other pairing. A fire on the map therefore needs both carriers,
stacked in adjacent cells; the two halves stay in step because they share a frame count and duration
and `Map.update` advances every animated sprite from one clock.

(The waterfall crest 90–92 and the water sparkle overlays 94–96 / 158–160 / 222–224 are also genuine
strips; the map does not use them, so they are not adopted.)

Measured with the pipeline's own `compareTiles`: adjacent fire frames differ by 0.77–1.0 of their
union pixels while sharing 0.53–0.95 of their quantized palette; the furniture/roof slices differ by
only 0.43–0.61 and join seamlessly at the tile boundary (seam continuity 0.75–1.0 vs 0.00–0.44 for
real strips). A similarity CEILING therefore can never detect this atlas's animations — at any
setting it either reports nothing or reports furniture. The detector now uses
`minimumFrameDifference` (a floor, default 0.7) plus palette-overlap and seam-continuity gates; the
adopted regions in `tilesets.config.json` are the four fire strips.
