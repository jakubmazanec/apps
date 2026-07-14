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

---

## 3. Tiled footguns: silent drops, stripped flip flags, ignored durations

### Findings

- The drop site is `Tilemap.from` (`Tilemap.ts:47-68`): only **finite, CSV-encoded tile
  layers with external tilesets** survive. Infinite maps (tiles live in `chunks`, never
  read), base64/compressed layers (`data` is a string), embedded tilesets, and
  object/image/group layers are validated by the zod schemas, then silently skipped — no
  warn, no throw. A schema *parse* failure does reject `loadBundle` (callers `console.error`
  it), but a silent drop produces no rejection at all.
- **Flip flags**: `getGid()` masks all four flag bits off at `Tilemap.ts:62`; the flags are
  discarded, not stashed. Decoder helpers (`getHorizontalFlip.ts` etc.) and a
  `TileGidWithFlags` type already exist as dead code — flag handling was intended, never
  wired up.
- **Frame durations**: the schema parses per-frame `duration`, but `Tileset.from` discards it
  at `Tileset.ts:57-61` (keeps only frame-name strings); `animationSpeed = 0.15` is
  hardcoded at `Map.ts:64` and `Sprite.ts:39`. A real fix means `Texture[]` →
  `FrameObject[]` (`{texture, time}`) — T1.3 (animation component) territory.
- DEV-invariant precedent: `ObjectPool.destroy` — `if (import.meta.env.DEV && bad) throw` —
  the only DEV guard in `source/`; no shared `invariant()` helper.
- The demo map exercises none of these paths (finite, CSV, external tileset, no flipped
  GIDs, no animations). `Tilemap.from`/`Tileset.from` have **no direct tests**.

### Options considered

- **A — loud failures only**: DEV-throw/prod-warn on every unsupported input, including flip
  bits; defer flip *rendering* to T1.7 and durations to T1.3. Pro: the designed Tier-0
  scope; converts all three footguns from silent to loud or explicitly deferred. Con: flips
  and durations remain unimplemented until their features.
- **B — loud failures + implement flips now**: also store flags and apply mirror/rotation in
  `Map`. Pro: fixes real wrongness. Con: the apply half is fiddly (center-anchor mirroring,
  diagonal = rotate+mirror), T1.7 owns it, and no shipped asset exercises it.
- **C — fix all three now**: also `FrameObject[]` durations. Con: front-runs T1.3's
  animation-component design and breaks the 0.15-keyed `Map`/`Sprite` tests as collateral.

### Decision

**Option A.** In `Tilemap.from`, detect and fail loud on every unsupported input, matching
the `ObjectPool.destroy` precedent (throw in DEV, `console.warn` in production — a warn
alone gets missed and reproduces the empty-layer bug):

- `infinite: true` maps;
- string layer `data` (base64 and/or compressed encodings);
- embedded (unsourced) tilesets;
- `objectgroup`, `imagelayer`, and `group` layers;
- any layer GID carrying flip/rotation bits (so "mirrored tiles render un-mirrored" becomes
  loud in DEV instead of silent until T1.7 implements rendering them).

Scope notes:

- Add the missing `Tilemap.from`/`Tileset.from` unit tests, covering each unsupported input
  (DEV throw) alongside the happy path.
- Ignored frame durations stay silent by choice: an animation still plays, just at a fixed
  tempo — degraded, not broken; T1.3 implements durations properly. Flip rendering lands
  with T1.7 (which relaxes the flip-bit check to actual support).
- The messages should say what to change in the Tiled export settings (e.g. "re-export with
  CSV tile layer format", "use an external tileset").

---

## 4. Carried-over code-review items: collision scan + TextInput container

### Findings

This item is a tracking pointer to two items `code-review-2026-07-03.md` already adjudicated
(collision scan: deferred 2026-07-11; TextInput: won't-fix 2026-07-05), not a new defect.

- **Collision scan**: confirmed as described — both axis passes in `motionSystem.ts` iterate
  the full 40×40 grid per moving entity per frame (~3,200 index+guard iterations), though
  only the player moves and ~8 tiles carry collision boxes. Microseconds per frame;
  invisible to a profiler at demo scale. The TODO at `motionSystem.ts:45-59` is a complete
  implementation spec: bounded swept column/row window over the existing `[column][row]`
  index, shared `sweepAxis` helper extraction, and the four behavioral constraints to
  preserve (X before Y; strict overlap for flush wall-sliding; `contactTile` first-hit
  column-major order; boundingBox-larger-than-cell caveat).
- **TextInput container — the review's premise is stale.** The old claim ("the container is
  *always* `document.body`" because construction happened in `onAdd`, before canvas mount)
  no longer holds: since the `mainScreen` → `mainMenuScreen`/`gameScreen` split, the only
  TextInput is built in `openOptionsModal` on the Options *click*, after mount, so
  `game.app.canvas.parentElement` resolves to the real container (`mainMenuScreen.ts:62`);
  `?? document.body` is a never-taken fallback. What remains is latent only: `TextInput`
  captures its container once at construction (`TextInput.ts:75`) and reads its
  `getBoundingClientRect()` in `startEditing` — mis-positioning would occur only if the
  canvas ever sat inside an offset/scrolled wrapper, which the app has no path to today
  (single full-viewport canvas at (0,0)).

### Options considered

- **A — re-affirm both deferrals, correct the record.** Pro: both items have owners and
  written rationale; neither is user-visible; overriding a fresh won't-fix without new
  evidence is churn. Con: the wasteful loop and 40-line copy-paste live on until Tier 3.
- **B — fix the collision scan now** (the TODO is a ready spec; wall-hit tests exist as the
  safety net; it is T3.23's tile half). Con: contradicts the still-valid "motion will be
  reworked" deferral — movement code gets touched heavily when T1.1 input replaces
  click-to-move anyway.
- **C — fix both** (also make `container` a thunk resolved at `startEditing`). Con: hardens
  a path the app cannot reach, against an explicit maintainer won't-fix.

### Decision

**Option A.** No code changes.

- The collision fix remains deferred to T3.23; the in-code TODO at `motionSystem.ts:45-59`
  is its authoritative spec.
- The TextInput won't-fix is re-affirmed with the premise correction above. Revisit
  condition: the canvas gets embedded in an offset/scrolled page layout (then resolve the
  container lazily at `startEditing`, e.g. a `() => HTMLElement` option) — natural home is
  the T2.13 widget work if it ever comes up.

---

## 5. Engine correctness details (Timer, EventChannel, Tween, deferred add/remove)

Four independent sub-defects; decided individually.

### 5a. Repeating `Timer` drifts and can't catch up

**Findings.** On fire, `Timer.update` subtracts exactly one period and returns a boolean
(`Timer.ts:42`), so it fires at most once per frame (documented contract, pinned by a test).
When the period is shorter than the frame time, each frame adds more than it subtracts, so
`#elapsed` grows without bound — and when the frame rate recovers, the timer fires every
frame until the banked surplus drains (a burst that can last minutes after a slow stretch).
No production caller uses repeating timers yet; latent but real.

**Decision: drain the surplus on fire.** Change `#elapsed -= duration` to
`#elapsed %= duration`. Effective cadence becomes `max(period, frame time)`, the residual is
always bounded below one period, no post-hitch bursts, phase realigns. The "at most once per
update" contract is unchanged. Add a test (repeat timer under sustained sub-period frames
keeps a bounded residual). True catch-up (`update()` returning a fire count, `Scheduler.every`
/ `timerSystem` firing N times) was considered and deferred: an API change nothing needs
today; add as a feature if a game ships a sub-frame cadence.

### 5b. Unregistered event channels grow unbounded

**Findings.** `push()` appends to `#nextEvents`; only `World.update` calls `swap()`, and only
for channels registered via `world.addEventChannel`. A pushed-but-never-registered channel
leaks every event forever (payloads hold live `Entity`/`MapTile` refs) while consumers read
an always-empty snapshot. Registration is a manual step separate from construction; both
current channels are registered (latent), but T1.2 audio adds more channels and the review
flags this exact trap for it.

**Decision: loud unregistered push.** `EventChannel` gets a registered flag that
`World.addEventChannel`/`removeEventChannel`/`stop` set and clear; `push()` on an
unregistered channel throws in DEV and warns once in production — the `ObjectPool.destroy` /
item-3 loud-failure pattern. Auto-registration was rejected (couples module-singleton
channels to a world; machinery). Add tests for the flag lifecycle and the DEV throw.

### 5c. `Tween` snapshots `from` at construction

**Findings.** Not a defect — a load-bearing, documented contract. `Modal`'s mid-fade
cancel-and-replace explicitly relies on capture-at-construction ("the replacement picks up
from the current alpha with no visual jump", `Modal.ts:154-158`), as do two design docs.
Every production caller constructs its tween at the moment it should start; there is no
delay option, so the stale-origin case has no current path. The existing test never covers
the stale case.

**Decision: document the contract and pin it.** Add a doc comment on `Tween` stating the
axiom — *`from` is captured at construction; construct tweens at the moment they should
start* — plus a test that constructs, mutates the target, then advances, pinning the capture
timing. No behavior change; the review item is reclassified from defect to documented
contract. Lazy capture on first update was considered and rejected: it silently changes a
semantics three documents describe as intentional, for the benefit of no current caller.

### 5d. Deferred double-add throws while double-remove is tolerated

**Findings.** In the post-update flush (`World.ts:340-357`), queued removals are guarded
(`if (this.entities.includes(entity))`, comment: "Tolerate repeats") but queued adds
re-enter `addEntity` unguarded and hit the synchronous double-add throw (`World.ts:269`) —
mid-flush, after systems ran, with a stack trace far from the offending call. Tests pin
idempotent double-remove and remove-then-re-add; deferred double-add is unpinned.

**Decision: symmetric idempotence.** Guard the flush-site add the same way (skip if already
present) and add the missing test. The axiom: *synchronous structural calls are strict
(throw on misuse); deferred structural changes are idempotent* — two systems expressing the
same intent converge to the same state. Remove-then-re-add keeps working (FIFO flush).
Enqueue-time duplicate detection (throw at the call site) was considered and rejected: it
needs effective-membership bookkeeping just to preserve a throw of debatable value.
