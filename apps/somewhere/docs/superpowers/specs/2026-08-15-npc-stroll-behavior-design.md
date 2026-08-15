# NPC stroll behavior — design

Date: 2026-08-15 App: `apps/somewhere` Status: approved design, pending implementation plan

## Background

NPCs never move: the npc factory gives them a `MotionComponent` with zero velocity, and nothing ever
writes to it. Mira now has a full walk sheet (`public/mira.json`, all eight `standing-*`/`walking-*`
clips), so the rendering side of movement is already done — `graphicsSystem` picks
`walking-<direction>` from velocity, and `Vector`'s stored-angle behavior keeps her facing her
direction of travel after she stops.

The engine also already has everything needed to move an entity safely: `motionSystem`'s
seek-to-`target` mode (used by the player's tap-to-move) walks any Motion+Graphics entity toward
`motion.target` at `MAX_SPEED`, with tile collision, an arrive-clamp, and automatic stop-and-clear
on arrival. This design adds the one missing piece: something that periodically sets that target.

## Decisions (from brainstorming)

- **Pattern**: two-point stroll — spawn point ↔ one authored destination a few tiles away, walking
  back and forth with pauses. No multi-waypoint routes, no random wander.
- **Authoring**: two optional integer properties on the NPC object in Tiled, `stroll-x` and
  `stroll-y` — an offset **in tiles** (16 art px each) from the spawn point. TODO(map-native
  authoring): in the future, move this into map-native data (Tiled point/path objects referenced by
  the NPC) instead of raw offset numbers.
- **Timing**: random wait of 3–8 s at each end, hardcoded range, no authoring surface.
- **Interruption**: the NPC freezes only while a dialogue is active. It does not pause merely
  because the player stands near; the prompt bubble may drift with the NPC, and that is accepted.
- **Naming**: `BehaviorComponent` — this is the degenerate case of an NPC behavior ("dumb AI"), a
  discriminated union with a single `stroll` variant today so future behaviors slot in as new
  variants without renames.
- **Simplicity constraint**: no follower/attachment abstraction for UI that tracks the NPC. The
  prompt bubble already follows `motion.position`; the talk zone follows via two plain offset fields
  and one re-anchor line (see below). Nothing configurable, no generic mechanism.

## Design

### BehaviorComponent (new, `source/game/BehaviorComponent.ts`)

A class component (the `MotionComponent` pattern) holding one field, `behavior`, typed as a
discriminated union with a single member:

```ts
type StrollBehavior = {
  type: 'stroll';
  home: Vector; // spawn position (world px, entity position space)
  destination: Vector; // home + authored offset × 16
  goal: 'home' | 'destination'; // where the next/current walk heads
  phase: 'waiting' | 'walking' | 'paused';
  waitRemaining: number; // ms left in the current wait
};
```

Initial state: `phase: 'waiting'`, `goal: 'destination'`, `waitRemaining` random in 3–8 s — the NPC
lingers at spawn before its first stroll.

### Authoring and spawn (`objectFactories.ts`)

The npc factory reads `stroll-x`/`stroll-y` from the object's properties:

- Both absent → static NPC, no `BehaviorComponent` (today's behavior, and the default).
- Exactly one present, or a non-number value → `failUnsupported` at spawn (the loud-validation
  precedent set by door targets and the `dialogue` property).
- Both present → attach `BehaviorComponent` with `home` = the spawn position the factory already
  computes, `destination = home + (stroll-x, stroll-y) × 16`.

The factory also records the trigger rect's authored offset from the entity position (see "Talk zone
follows" below) and carries the TODO(map-native authoring) comment.

For Mira: `stroll-x: 3`, `stroll-y: 0` (3 tiles east — open ground away from the hut door), added to
`assets/map.tmx` and hand-mirrored into `public/map.json` as usual (Tiled app not available in this
environment).

### behaviorSystem (new, `source/game/behaviorSystem.ts`)

Runs over `BehaviorComponent + MotionComponent` entities. Registered in `world.ts` immediately after
`playerSystem`, for the same reason playerSystem sits there: it writes `motion.target`/ velocity
that `motionSystem` consumes later the same frame. Per entity, per frame, a small state machine on
`behavior.phase`:

1. **Dialogue freeze first.** If a dialogue is active (`dialogueQuery`, the playerSystem pattern):
   if mid-walk (`phase === 'walking'` with a live `motion.target`), clear the target,
   `velocity.set(0, 0)` (preserves facing via the stored angle), and set `phase: 'paused'`. Nothing
   else ticks during dialogue — wait timers hold.
2. **`paused`** (dialogue has ended): set `phase: 'walking'` and re-issue `motion.target` toward the
   current `goal` — the interrupted stroll resumes.
3. **`waiting`**: `waitRemaining -= deltaMS`; at ≤ 0, set `phase: 'walking'` and `motion.target` to
   the `goal` point.
4. **`walking` with `motion.target === undefined`**: the walk is over. `motionSystem` clears the
   target both on arrival and when fully blocked (clipped frame delta of zero). Either way: flip
   `goal`, set `phase: 'waiting'` with a fresh random 3–8 s wait. This is the self-healing rule — a
   blocked stroll turns into "give up, head back after the wait", with no pathfinding and no
   walking-in-place against a wall.

Randomness is `Math.random`-based at runtime; tests spy it.

### Talk zone follows the NPC

`triggerSystem` tests the player against `TriggerComponent.rect`, which is static today — a
strolling NPC would leave its talk zone behind. Fix, deliberately minimal:

- `TriggerComponent` gains two plain number fields, `rectOffsetX`/`rectOffsetY`, optional
  constructor options defaulting to 0 (doors and zones never pass them); the npc factory fills them
  at spawn (`rect.x − position.x`, `rect.y − position.y`).
- At the top of `triggerSystem`'s existing per-entity loop: if the entity has a `MotionComponent`,
  re-anchor `rect.x/y = position + offset` before the overlap test. `triggerSystem` runs right after
  `motionSystem`, so tracking is exact within the frame.

Doors and zones have no `MotionComponent` and are untouched. The prompt bubble already positions
itself from `motion.position` every frame (`dialogueBoxSystem`) — it follows for free. No other
mechanism is added.

### What falls out for free

- Walking animation and direction: `graphicsSystem` from velocity.
- Resting facing ≈ direction of approach: `Vector` keeps the last non-zero angle.
- Collision with walls and map bounds: `motionSystem`'s existing passes.
- Player stop on dialogue start: `dialogueSystem` already does it; the NPC-side stop is step 1
  above.

## Non-goals

- No pathfinding; the authored destination should be reachable in a straight seek.
- No NPC↔player collision — they pass through each other, as today.
- No facing scripts (turn toward player on dialogue start, initial-facing property) — explicitly
  deferred earlier; resting facing falls out of the approach direction only.
- No persistence of stroll state in saves: on load the NPC respawns at its map spawn like every
  entity.
- No multi-waypoint routes, schedules, or perception.
- No map-native waypoint objects yet — recorded as TODO(map-native authoring).

## Testing

Vitest, existing patterns and helpers (`stubSpritesheetAssets` etc.):

- `tests/objectFactories.test.ts`: stroll properties → `BehaviorComponent` attached with
  `destination = home + 3×16 px`; one property missing or non-numeric → loud failure; neither → no
  component; `rectOffsetX/Y` recorded.
- `tests/behaviorSystem.test.ts` (new): wait counts down and issues `motion.target`; a cleared
  target flips `goal` and re-enters `waiting` with a wait in the 3–8 s range (`Math.random` spied);
  an active dialogue clears target/velocity and sets `paused`; dialogue end resumes toward the same
  `goal`.
- `tests/triggerSystem.test.ts` (or the existing trigger tests' home): the rect tracks a moved NPC
  position via the offsets; triggers without motion stay put.

Full gates before merge: `npm run typecheck`, `npm run lint`, `npm test`.
