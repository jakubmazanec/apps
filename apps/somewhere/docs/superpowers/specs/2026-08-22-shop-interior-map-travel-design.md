# Shop interior map and map travel — design

Date: 2026-08-22 App: `apps/somewhere` Status: approved design, pending implementation plan

## Background

The game has exactly one map: `world.onStart` reads the hardcoded `'map'` tilemap asset, walks its
object layers through `objectFactories`, and spawns everything. `doorSystem` teleports within that
map (door → target door by Tiled object id). The save blob has no notion of "which map am I on".

Most of what multi-map needs already exists:

- The `objectFactories` dispatch is map-agnostic — the comment on it ("T1.11's level manager is the
  second consumer and can promote the pattern") anticipated this exact promotion.
- `World` defers `addEntity`/`removeEntity` during an update but applies them synchronously
  otherwise, so a swap executed outside the update loop is atomic between frames.
- Character sprites are parented into the map's layer containers by `graphicsSystem`'s
  `onAddEntity`/`onRemoveEntity` hooks, so removing and re-adding the player re-parents its sprites
  through existing code.
- The interact-prompt machinery (`findPromptEntity` shared by `dialogueBoxSystem`'s bubble and
  `dialogueSystem`'s interact consumer, tap-to-interact via the bubble's `pointertap`) is exactly
  the activation surface travel needs.
- `interior-tileset` is already built through the tileset pipeline (`public/interior-tileset.json`),
  so shop-interior art exists.

## Decisions (from brainstorming)

- **Scope**: the shop interior is a second map with a shopkeeper NPC on the existing dialogue
  system. Its purpose is to drive the travel system. No commerce, items, or inventory.
- **Transition**: instant cut. No fade machinery; a fade can be layered later without redesign.
- **Map state**: rebuild fresh on every entry — NPCs back at authored spawn points, zones re-armed.
  Dialogue flags live in the global `flags` store and persist untouched.
- **Approach**: level-manager swap inside the running world (not a world restart, not keep-alive
  maps). The world never stops; flags, audio, HUD, and save wiring are untouched by travel.
- **Activation**: prompt-activated, not walk-in. Standing at an exit shows the interact bubble;
  the `interact` press (or bubble tap on mobile) travels. Walking into an exit rect does nothing.

## Design

### Tiled authoring model

Two new object types alongside `spawn`/`door`/`zone`/`npc`:

- **`exit`** — a rect trigger with two string properties: `map` (destination tilemap asset name)
  and `entry` (name of an entry point in that map). The same-map `door` type is untouched.
- **`entry`** — a named point object marking where the player appears. It spawns no entity and has
  no factory; the level manager reads it from the destination tilemap asset at travel time and
  centers the player's bounding box on it (`getPositionForBoundingBoxCenter`).

Content changes:

- **`map.tmx` (village)**: an `exit` rect on the shop facade's doorway (existing exterior tileset
  art) with `map: shop-interior`, `entry: entrance`; an `entry` point named `shop-door` just
  outside the doorway.
- **New `assets/shop-interior.tmx` → `public/shop-interior.json`** (hand-mirrored export, the
  map.json precedent — no Tiled app in this environment): a small room (~15×12 tiles) built from
  `interior-tileset`; walls/floor/counter; a shopkeeper `npc` (shared `characters` spriteset via
  the `sprite` property, new dialogue script registered in `dialogueRegistry`); an `exit` at the
  door with `map: map`, `entry: shop-door`; an `entry` named `entrance` just inside the door. No
  `spawn` object — only the starting map has one.

### Level manager (new, `source/game/levelManager.ts`)

The promoted spawn loop plus the state that outlives a single map:

- `mapNames = ['map', 'shop-interior'] as const` and `DEFAULT_MAP_NAME = 'map'` — the single
  source of truth for known maps (the save schema's enum reuses it).
- Module state: `currentMapName`, the current map entity, the tracked map-scoped entities (every
  entity spawned from the current map's object layers except the player), and `pendingTravel:
  {mapName, entryName} | null`.
- `spawnMap(world, mapName, {includeSpawn})` — the loop extracted from `world.onStart`: create the
  map entity from the per-map pool, dispatch object layers through `objectFactories`, record what
  was spawned. `entry` objects are skipped (data, not entities). `spawn` objects are honored only
  with `includeSpawn: true` (the initial New Game/Continue build) and skipped silently on travel,
  so a map that has one can still be a travel destination without ever creating a second player.
  The spawn-count, door-target, and new exit/entry validation all live here.
- `resetLevelManager(startingMapName)` — the `resetFlags` precedent: called from `world.onStart`
  before spawning; clears `pendingTravel` and the tracked lists, sets `currentMapName`. The
  starting name is a parameter (`world.onStart` passes `getStagedMapName()`) so the level manager
  never imports `save.ts` — `save.ts` imports `mapNames` and a `getCurrentMapName()` getter from
  the level manager, and the dependency stays one-way.
- `mapPool` generalizes from one hardcoded `'map'` entity to a pool per map name (`get(mapName)`),
  so each map's pixi view is built once and reused across visits; `onReset` keeps zeroing the map
  position. `world.onStop` returns the current map entity to its pool (replacing today's
  module-level `mapEntity` in `world.ts`, which moves into the level manager).

`world.onStart` shrinks to: reset the level manager, `spawnMap(world, currentMapName,
{includeSpawn: true})`, and the existing no-spawn player fallback.

### Prompt integration

`findPromptEntity` generalizes: in its first-match-wins loop over trigger entities, an `exit`
whose rect the player is in or near (the zones' `isPlayerNearRect` band — exits sit in doorway
geometry the player may only brush against) resolves as the prompt entity, alongside today's
npc-inside and zone-near cases. Consequences fall out for free:

- `dialogueBoxSystem` renders the bubble for whatever the resolver returns; its rect-positioned
  branch (the zone/sign path) already handles motionless triggers, so the bubble appears above the
  exit rect with no new rendering code. The bubble's existing `pointertap` → `interact` command
  gives tap-to-travel on mobile.
- The invariant the code comments care about holds: the bubble advertises exactly what an interact
  press will do — talk or travel.
- `dialogueSystem`'s `interact` case gains a guard: if the resolved entity is an `exit`, it does
  nothing (travel is `travelSystem`'s job). Overlapping npc/exit resolve by spawn order, the
  existing overlapping-trigger behavior.

### travelSystem (new, `source/game/travelSystem.ts`)

Registered next to `doorSystem`; component filter `[TriggerComponent]` (the resolver's input set).
Consumes the buffered `interact` commands from `dialogueCommandChannel` — that channel is
effectively the generic interact-press bus (`dialogueInputSystem` translates the key edge, the
bubble tap pushes the same command). On `interact` it:

1. Skips if a dialogue is active (the `playerActionSystem` lock) — paging a conversation can never
   travel.
2. Skips if `pendingTravel` is already set (double-press guard).
3. Resolves via the shared `findPromptEntity`; acts only when the result is an `exit`.
4. Re-validates `map`/`entry` (already loud at spawn; silently inert here — the door precedent)
   and records `pendingTravel = {mapName, entryName}`.

It mutates nothing else. The swap itself happens between frames:

### Travel executor — the between-frames swap

`levelManager.flushPendingTravel(world)` runs as a HIGH-priority pixi ticker callback, registered
by `worldScreen.onShow` (and removed by `onHide` via the existing disposables pattern). Pixi runs
HIGH-priority callbacks before the world's NORMAL-priority `update` and renders at LOW priority
afterward, so the executor always runs outside the `updating` state: entity changes apply
synchronously and atomically — no frame ever renders half-swapped. When `pendingTravel` is set
(and the world is running), it:

1. Builds the destination's entities via `spawnMap(world, mapName, {includeSpawn: false})` —
   components exist immediately, but nothing is added yet.
2. Removes, in order: the player first, then the old map-scoped entities, then the old map entity
   — so every `graphicsSystem.onRemoveEntity` (which re-reads `levelQuery`) still sees the old map
   while detaching sprites from its layers. The old map entity returns to its pool; old scoped
   entities are dropped (the same lifecycle `world.stop` gives them).
3. Adds, in order: the new map entity first, then its scoped entities, then the player last — so
   every `onAddEntity` sees the new map and parents sprites into its layers. This is the player
   sprite re-parenting, done entirely by existing hooks.
4. Centers the player on the `entry` point, clears `motion.target`, zeroes velocity.
   `Vector` preserves the stored angle through `velocity.set(0, 0)`, so the player keeps facing
   their direction of approach — the NPC-stroll facing rule, for free.
5. Arms every destination trigger whose rect overlaps the player (`isPlayerInside = true`): no
   spurious zone enters or same-map-door teleports on arrival; each re-arms after a genuine exit,
   exactly like doors today. Landing beside the destination's own exit just shows the bubble again
   — a fresh interact press is required, so bounce-back is impossible.
6. Presets the camera via the clamp math extracted from `cameraSystem` into a shared pure helper
   (`getClampedCameraPosition`, which `cameraSystem` now also calls). Presetting matters because
   `mapSystem` positions the map view before `cameraSystem` runs: without it, the first frame
   after a cut would draw the new map with the old camera.
7. Sets `currentMapName` and clears `pendingTravel`.

The next update then runs every system against a fully consistent new world; `cameraSystem`
recomputes the identical camera; the first rendered frame after activation is already correct.
Total latency from press to cut: two frames (one for the buffered command, one for the flush) —
imperceptible.

Edge cases: a pause between activation and flush is harmless (add/remove work in the `paused`
state; the world resumes in the new map). Quit-to-menu with a pending travel saves the old map and
position (the flush never ran), and `resetLevelManager` clears the stale pending on the next
start. Music is untouched — `game-music` plays across travel.

### Save and Continue

The schema gains `map: z.enum(mapNames)`. Per the existing policy in `save.ts`, an old save that
fails the new schema simply resets — no migration.

- `writeSave()` records `currentMapName` alongside position and flags. All existing save paths
  (pause-menu Save, visibility-hidden, `onHide`) go through it, so saving in the shop and
  continuing later restores the shop.
- `save.ts` exposes `getStagedMapName()`: the staged save's map, or `DEFAULT_MAP_NAME` without a
  stage. `world.onStart` passes it into `resetLevelManager` to pick the starting map *before*
  spawning; `applyStagedSave()` afterwards applies position and flags exactly as today.
  `worldScreen.onShow`'s call order is unchanged; New Game stays correct for free (no stage →
  default map).

### Assets

In `assets.ts`, the `game` bundle gains `tilemaps: {..., 'shop-interior': ['shop-interior.json']}`
and an explicit `'interior-tileset': ['interior-tileset.json']` tileset entry — the tilemap loader
would lazily fetch the tileset anyway, but the explicit entry makes loading deterministic behind
the existing loading screen. The shopkeeper uses an existing character prefix in the shared
`characters` spriteset; no new art anywhere.

## Error handling

All loud-`failUnsupported`-then-inert, the established pattern:

- An `exit` with a missing/non-string `map` or `entry`, a `map` not in `mapNames`, or an `entry`
  name absent from the destination tilemap: loud at spawn (all tilemaps are preloaded, so
  cross-map validation is possible there), inert at runtime.
- Duplicate `entry` names within one map: loud at that map's spawn validation; first wins.
- A travel destination containing a `spawn` object: silently skipped (documented above), never a
  second player.
- Unknown object types in the new map still fail loudly via the existing factory-dispatch check.

## Non-goals

- No fade or slide transitions; no per-map music; no travel sound.
- No commerce, items, or inventory — the shopkeeper only talks.
- No walk-in travel; exits are prompt-activated only.
- No persistence of per-map entity state across entries (rebuild fresh) or in saves.
- No authored facing on entry points; facing falls out of the approach direction.
- No changes to same-map doors.

## Testing

Vitest, existing patterns and helpers:

- `tests/levelManager.test.ts` (new): `spawnMap` builds and tracks the right entities; `spawn`
  honored only with `includeSpawn`; `entry` objects spawn nothing; per-map pool reuse across
  visits; validation failures loud (bad exit `map`/`entry`, duplicate entry names).
- `tests/travelSystem.test.ts` (new): interact on a prompted exit records `pendingTravel`;
  dialogue-active lock; double-press guard; interact away from an exit or on an inert exit does
  nothing.
- Travel-executor coverage (in `levelManager.test.ts`): the flush swaps entity sets in the
  documented order (player sprites end up in the new map's layers); player centered on the entry
  with cleared target and zero velocity; overlapping destination triggers armed; camera preset to
  the clamped position; pending cleared; paused-world flush harmless.
- `tests/findPromptEntity.test.ts` (extend): exits resolve via the near band; first-match-wins
  across npc/exit overlap; `dialogueSystem` ignores a resolved exit.
- `tests/save.browser.test.ts` (extend): schema round-trips `map`; an old save without `map`
  resets; `getStagedMapName()` returns staged vs default.
- Asset-level: `shop-interior.json` consistent with `shop-interior.tmx` (the `exportedAssets`
  precedent); bundle entries present.
- Existing `doorSystem`/`zoneSystem`/`worldSpawn` suites keep passing untouched.

Full gates before merge: `npm run typecheck`, `npm run lint`, `npm test`.
