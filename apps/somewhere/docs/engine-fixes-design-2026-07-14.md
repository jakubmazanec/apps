# Engine repairs design — 2026-07-14

Companion to `engine-review-2026-07-04.md`, section "Broken or misleading today (fix before
adding features)". One section per issue: what exploration confirmed, the options considered,
the decision, and the fix specification. Decisions are recorded here as they are made; each
decided issue is struck through in the review doc in the same commit.

---

## 1. Depth sorting does nothing

### Findings

- Exactly two `zIndex` writes exist, both computing the same "bottom of collision box" y-sort
  key, and nothing ever reads them or sorts:
  - `source/engine/tiled/Map.ts:82-83` — per tile, at construction:
    `row * tileHeight + boundingBox.y + boundingBox.height` (falls back to the row's y when
    the tile has no bounding box).
  - `source/game/graphicsSystem.ts:43` — per entity, every frame, on the currently visible
    sprite: `view.position.y + boundingBox.y + boundingBox.height`.
- `sortableChildren`, `sortChildren()`, and `RenderLayer` appear nowhere in `source/` (nor in
  `patches/`). In Pixi v8 that means draw order is pure insertion order.
- The sorting substrate is otherwise fully in place: entity sprites are added into the same
  per-layer container as that layer's tiles (`graphicsSystem.onAddEntity` →
  `map.addToLayer(sprite, 1)` → `Map.ts:109-111`), so tiles and entities are already siblings
  under `map.layers[1].view` sharing one zIndex convention. Tiles are inserted first, entities
  appended after — so entities always draw on top today.
- No test asserts draw order. Pixi is v8.16.0.

### Options considered

- **A — enable the existing design**: set `sortableChildren = true` on the entity layer
  container. Pro: one-line activation of exactly what the zIndex writes intended; fixes the
  bug now; cleanly superseded by T1.6. Con: the per-frame entity zIndex write dirties the
  sort, so Pixi re-sorts all of layer 1's children (every tile + entities) each frame —
  irrelevant at demo map sizes, wasteful on large maps (already tracked separately as T2.16).
- **B — pull T1.6 forward**: named Pixi v8 `RenderLayer`s now, sorting only the y-sorted
  layer. Pro: the structural end-state. Con: feature-sized; its design decisions (layer
  naming, occluder classification) belong to the T1.4-6 rendering work package and would risk
  being designed twice.
- **C — delete the dead zIndex writes**: fixes only the "misleading" half; characters still
  can't walk behind scenery until T1.6.

### Decision

**Option A.** Enable `sortableChildren` on the entity layer (`Map` constructor, layer
index 1 — the layer `addToLayer` defaults to). Keep both existing zIndex formulas unchanged;
they are correct and survive into T1.6, which later replaces the *mechanism*
(`sortableChildren` on a shared container → a dedicated y-sorted `RenderLayer`) without
changing the sort key.

Scope notes:

- Only the entity layer sorts; other tile layers keep insertion order (their stacking is
  layer-level by design — ground below, overhead "air" above).
- Add a draw-order test: build a real `Map` + entity-sprite sibling tree and assert that an
  entity whose feet are above a tile's collision-box bottom renders behind it (and in front
  when below).
- Per-frame sort cost over all layer-1 tiles is accepted at current map sizes; T2.16 (tilemap
  performance) and T1.6 (render layers) both reduce it later.

---

## 2. A backgrounded tab produces a simulation jump

### Findings

**The review's premise is partly wrong: Pixi already clamps this.** Pixi v8's `Ticker` clamps
elapsed time to `maxElapsedMS = 100` (derived from the default `minFPS = 10`) *before*
exposing `deltaMS`/`deltaTime` (`pixi.js/lib/ticker/Ticker.mjs`, `update()`). Since rAF does
not fire in background tabs, the return-from-background frame computes a huge elapsed time —
and immediately clamps it. Worst case today is a 100 ms step (~6 frames), not a seconds-long
jump.

- Nothing in `source/` sets or asserts this: no `minFPS`/`maxFPS`/`maxElapsedMS`/`speed`
  configuration anywhere. The guarantee is an undocumented third-party default.
- `motionSystem.ts:9,15` additionally caps `deltaTime` at 2 frames for movement (uncommented
  gameplay-feel cap; kept as-is).
- `World.update(ticker)` passes the whole Pixi ticker to every system (`World.ts:332-334`);
  consumers read only `.deltaMS`/`.deltaTime`. All test files fake the ticker as plain
  `{deltaMS}` or `{deltaTime}` objects.
- A single large delta is benign by design elsewhere: timers fire at most once per update,
  tweens snap to their end values.
- `timeScale` and `visibilitychange` auto-pause genuinely don't exist — both are scoped to
  T1.9 and explicitly deferred by the game-ui spec. Note for T1.9: `World.pause()` throws if
  already paused (`World.ts:57-59`), so an auto-pause must guard on `isPaused`.

### Options considered

- **A — pin and document Pixi's clamp**: set `app.ticker.minFPS` explicitly in `Game.init`
  with a contract comment, plus a test. Pro: the described bug doesn't exist; the honest
  repair is making the accidental guarantee intentional so a ticker config change can't
  silently remove it; zero behavior change. Con: the clamp lives in the ticker layer, not in
  `World`.
- **B — clamp inside `World.update`**: pass systems a derived `{deltaMS, deltaTime}` object.
  Pro: self-contained world time; the exact seam T1.9's `timeScale` needs. Con: a contract
  change, not a clamp — breaks every `{deltaTime}`-only test fixture, and is redundant today.
- **C — doc-only correction**: leaves the guarantee as an unpinned third-party default.

### Decision

**Option A.** In `Game.init`, explicitly set the app ticker's `minFPS` (i.e. pin
`maxElapsedMS = 100`) with a comment stating the engine contract: *one frame advances world
time by at most 100 ms, regardless of how long the tab was backgrounded or how badly a frame
hitched*. Add a test asserting `Game` configures the ticker.

Scope notes:

- The world-level time object (option B's machinery) is deliberately deferred to T1.9, where
  `timeScale` forces it anyway — the clamp can migrate into `World` as part of that design.
  Mutating the shared ticker is not an option there because the screen `Scheduler` must stay
  real-time, so T1.9 will need the derived-object seam regardless.
- `motionSystem`'s `MAX_DELTA_TIME = 2` stays: it is a stricter gameplay cap on movement, not
  a correctness clamp.
- The review's Tier 0 bullet "Clamp `deltaMS` at the engine level" is re-scoped by this
  decision to "pin the Pixi ticker clamp"; annotated in the review doc.
