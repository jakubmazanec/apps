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
