# Input System Design — Action Map, Edge States, Demo Migration

Implements T1.1 of [engine-review-2026-07-04.md](../../engine-review-2026-07-04.md): an
action-mapping layer from devices to ECS systems. Scope decisions made during brainstorming:
keyboard + pointer only in v1 (gamepad later; the design leaves its seam), buttons only (no axis
values until an analog device exists), and the demo gains keyboard movement while keeping
tap-to-move.

## Context

Today the only gameplay input is a `pointertap` listener registered inside `playerSystem.onAdd`;
keyboard exists solely for UI focus navigation. There is no path from a key to an ECS system.

## 1. Two input layers, not one

The engine has two input consumers with different native shapes, and they stay two separate stacks:

|          | UI layer (exists, untouched)                 | Gameplay layer (new)           |
| -------- | -------------------------------------------- | ------------------------------ |
| Consumer | Widgets, focus system                        | ECS systems                    |
| Shape    | Event handlers (pixi events, `FocusCommand`) | Polled per-frame state         |
| Pause    | Keeps working (the pause menu depends on it) | Frozen for free                |
| Config   | `focusKeys` in `GameOptions`                 | `bindings` in `new Input({})`  |
| Lifetime | Process (`Game.addRef`)                      | While the game screen is shown |

**Boundary rule:** keys that drive screens/UI (focus navigation, activate, any future
Escape-to-pause — necessarily screen-level, since a paused world cannot unpause itself) belong to
the Game/screen layer. Keys that drive the simulation belong to the action map. The action map never
routes to widgets; focus commands never feed ECS.

**Arbitration rule:** when one physical key appears in both maps, both layers act — the engine does
not referee. Conflicts are game-config responsibility (the demo binds WASD only and leaves arrows to
UI navigation; `UiRoot.moveFocus` grabs the nearest focusable when nothing is focused, so
arrow-bound movement would light the HUD focus ring). While paused, gameplay input does not advance
(§3), so modal UIs get exclusive keys without any mechanism.

**Why polled state and not event handlers (load-bearing decision).** The browser speaks in events;
the simulation speaks in frames; `Input`'s entire job is that translation. An event-subscription API
(`input.on('move-left:down', …)`) was considered and rejected: every consumer system would
re-integrate transitions into held-state flags (plus per-consumer stuck-key handling on window
blur), every one-shot handler would need a `world.isPaused` guard that polling makes structurally
unnecessary, and it reintroduces the `onAdd`/`onRemove` listener dance that is the worst shape in
the current `playerSystem`. Where events _are_ the right shape — discrete UI commands — the
event-driven path already exists (`focusKeys`).

## 2. Engine surface: `Input` (`source/engine/input/Input.ts`)

```ts
type InputBinding = {
  keys?: string[]; // KeyboardEvent.code values; no modifier syntax (Shift itself can be an action)
  pointerTap?: boolean; // bound to pixi 'pointertap' on the attached view
};

class Input {
  constructor({bindings}: {bindings: Record<string, InputBinding>});

  attach(view: pixi.Container): void; // window keydown/keyup/blur + view 'pointertap' listener
  detach(): void;

  /** @internal Called by `inputSystem` once per world update; one call = one sim step. */
  update(): void;

  pressed(action: string): boolean; // went down this step
  held(action: string): boolean; // down now
  released(action: string): boolean; // went up this step

  readonly tapPosition: Vector; // position of the last latched tap, view coordinates (device px)
}
```

Semantics:

- **Raw accumulation vs step boundary.** Listeners maintain a live set of down key codes and a tap
  buffer; they may fire at any moment between frames. A tap stores its own position in the buffer;
  multiple taps in one frame collapse to one, last position wins. `update()` is the step boundary:
  it shifts the current snapshot to previous, snapshots the live set, and drains the tap buffer into
  a per-step tap latch (setting `tapPosition` from the drained tap) — the same double-buffer flip as
  `EventChannel.swap()`, internal plumbing that game code never calls. Reads are computed on read:
  `held` is membership in the current snapshot; `pressed` fires on the snapshot diff (in current,
  not in previous) **or** a tap latched this step; `released` fires on the reverse diff **or** a tap
  latched this step. The tap latch never enters the down-set, which is what makes the tap contract
  below hold. An action bound to both `keys` and `pointerTap` needs no special rule — these
  definitions already give it the union of the two sources. Reads are stable for the whole step
  because DOM events cannot interleave with a synchronous `world.update()`.
- **Edge contract** (from T1.1, written to survive a fixed-timestep retrofit): input latches on the
  render frame; the simulation drains edges once per sim step; each edge is visible for exactly one
  step. Today one render frame ≡ one sim step, so `update()` is both; under a fixed timestep it
  would split into latch-per-render-frame + drain-per-step with game code unchanged.
- **Tap** is instantaneous: on its step `pressed = true`, `released = true`, `held = false`.
  `tapPosition` is the latched tap's own position and changes only at the step boundary, so a
  pointer move between the tap and the next `update()` cannot retarget it — the same event-time
  semantics as the current `event.global` read. There is no continuous pointer tracking: `attach()`
  registers no `pointermove`/`pointerdown` listeners; a tap carries the only pointer payload
  anything consumes (hover/aim tracking is a named seam, §7). Taps deliberately do **not** flow
  through an `EventChannel`: channels carry one-frame latency by design, and a second
  differently-shaped API next to keys would break uniformity — systems consume keys and taps
  identically.
- **Pause needs no special code.** Listeners stay attached while paused (the down-set keeps
  tracking), but `inputSystem` does not run in a paused world, so the step boundary never advances.
  On resume the snapshot diff yields correct edges: pressed-and-released during pause → no edge;
  still held → one `pressed` edge. Taps during pause never arrive: `UiRoot` stops `pointertap`
  propagation on UI, and the pause modal's full-screen interactive scrim guarantees every tap during
  pause targets UI — so no tap reaches `game.view`. Since `pointertap` is Input's only pointer
  listener, nothing pointer-side mutates while paused either; the §1 "frozen for free" cell holds
  with no exceptions.
- **Text-entry guard (shared machinery).** Keyboard events are ignored when
  `isTextEntryTarget(event)` returns true — a predicate exported next to `TextInput`, so the module
  that creates the hidden editing element owns the knowledge of what counts as one. Both `Game`'s
  focusKeys handler and `Input`'s key listeners call it (the focusKeys handler's inline
  `instanceof HTMLInputElement` check migrates to the predicate as part of this work).
- **Conventions shared with the focus layer** (shared convention, no shared machinery):
  `preventDefault()` fires only for bound codes. Additionally — a new rule, since `Input` is the
  engine's first stateful keyboard consumer — `blur` clears the down-set (released edges on the next
  step).
- **House style:** options-object constructor, `#`-private fields, `Vector` for positions,
  `DisposableStack` for listener cleanup, strict lifecycle throws (double `attach`, `detach` while
  detached — matching `setWorld`/`unsetWorld`), loud throw on an unknown action name, and a loud
  constructor throw on impossible binding codes — any code containing `+`, with an error message
  naming the difference from the focusKeys `Shift+` grammar, so a binding like `'Shift+KeyW'` fails
  at construction instead of silently never matching.

## 3. ECS integration (`source/engine/input/`)

- `InputComponent.ts` — `defineComponent<{input: Input}>()`. Purely discoverability: game systems
  find input through a query, the way `playerSystem` finds the camera through `cameraQuery`.
  Singleton entity + query per T1.1 — not a module singleton, not a world resource (that API arrives
  with T2.15; the query reads migrate to resource reads then).
- `inputSystem.ts` — module-level `System` in the `timerSystem`/`tweenSystem` idiom
  (`displayName: 'Input system'`), `components: [InputComponent]`. Its update reads the singleton
  via `getFirst()` (which throws loudly when the entity is missing, matching house style — the
  `cameraSystem` precedent) and calls `input.update()` exactly once per world update; that single
  call is the "drain once per sim step" contract, owned by the system rather than by an entity-count
  assumption. It is added **first** in system order. It holds no module state, so it does not deepen
  the known single-world limitation.
- **No new event machinery.** Input introduces zero event logic into the ECS; `EventChannel` remains
  the single event mechanism. A game wanting "emit an event when interact is pressed" polls in its
  own system and pushes onto its own channel, exactly as `motionSystem` pushes `WallHit`.

## 4. Game wiring (mirrors the camera pattern file-for-file)

- `game/input.ts` — the `Input` instance plus `inputEntity` (like `camera.ts`). Demo bindings:
  `move-up`/`move-down`/`move-left`/`move-right` = `KeyW`/`KeyS`/`KeyA`/`KeyD` (WASD only — arrows
  stay UI, per the arbitration rule), `move-to` = pointer tap.
- `game/inputQuery.ts` — like `cameraQuery.ts`.
- `game/world.ts` — add `inputQuery`; add `inputSystem` **first** with a load-bearing comment
  ("every system this frame reads the same freshly-advanced input"); add `inputEntity` alongside
  `camera`. `playerSystem` moves **before** `motionSystem`: it now writes velocity that
  `motionSystem` consumes the same frame (it sat late in the order only because it used to just
  register listeners).
- `game/gameScreen.ts` — `onShow`: `input.attach(game.view)` just before `world.start()`; `onHide`:
  `input.detach()` after `teardownGameScreen(...)`. `pauseFlow.ts` is untouched.

## 5. Demo migration: `playerSystem`

The `onAdd`/`onRemove` listener registration and the module-level handler variable are deleted.
`onUpdate` becomes:

1. Movement keys held → clear `motion.target`, set velocity to the normalized held direction ×
   `MAX_SPEED` (normalized so diagonals are not faster). `MAX_SPEED = 4` is a new constant exported
   from `motionSystem.ts` and used by its target-path speed clamp, so keyboard speed and the clamp
   cannot drift apart — the clamp itself only runs when `motion.target` is set, so the keyboard path
   must carry the same value, not rely on the clamp.
2. Else `pressed('move-to')` → set `motion.target` from `tapPosition` + camera position − the
   existing `-32`/`-60` bounding-box offsets (the TODO stays; that is T1.4/T1.5 territory), zero
   velocity — the existing tap flow.
3. Else no target → zero velocity.

Keys beat taps in a same-frame tie (rule 1 runs first).

## 6. Testing

Top-level `tests/`, one file per module, matching the suite:

- `tests/Input.test.ts` — real `KeyboardEvent`s on `window`, pixi events on an attached container:
  pressed→held→released sequencing across `update()` calls; two keys on one action (release one →
  still held, no `released` edge); blur → `released` next step; the text-entry guard via
  `isTextEntryTarget`; `preventDefault` only on bound codes; tap edge shape, multi-tap collapse;
  `tapPosition` is the tap's own position — a `pointermove` after the tap and before `update()` does
  not change it; strict attach/detach throws and listener removal; unknown action throws; a binding
  code containing `+` throws at construction.
- `tests/inputSystem.test.ts` — exactly one `update()` per world update; loud throw when the
  singleton entity is missing; pause axiom observably: an edge latched before `pause()` stays
  readable across paused frames and resolves to plain `held` on the first frame after `resume()`.
- `tests/playerSystem.test.ts` — held keys → velocity set, target cleared, diagonal normalized; tap
  → target set with camera offset; neither → velocity zeroed; keys beat tap.
- Manual pass in the demo: WASD feel, tap-to-move intact, hold-W-through-pause resumes correctly,
  release-during-pause stops correctly.

## 7. Out of scope (seams named)

- **Gamepad** — a new binding field plus `navigator.getGamepads()` polling inside `update()`
  (connect/disconnect listeners in `attach`/`detach`); the poll design absorbs it without reshaping
  any API.
- **Axes / analog values** — arrive with the gamepad; buttons only until then.
- **Hover / continuous pointer tracking** — nothing in v1 reads a live pointer position;
  `tapPosition` carries the only consumed payload. A future hover or aim consumer adds `pointermove`
  tracking (a live `pointerPosition` alongside `tapPosition`) without reshaping the edge API.
- **Compile-time action-name checking** — `pressed(action: string)` plus the runtime throw is the
  whole contract. A typed action union would be erased at the component read path anyway
  (`InputComponent`'s field is bare `Input`); if ever wanted, it arrives with a read path that can
  carry the type (the T2.15 resource API).
- **World resources (T2.15)** — `inputQuery.getFirst()` reads become resource reads; a localized
  migration the review already schedules.
- **Runtime rebinding** — cut per the review; a future controls menu reconstructs `Input`.
- **Virtual joystick / on-screen buttons** — cut; if UI must ever cause a gameplay action, the
  crossing point is the game layer's `uiEvents` seam, not either input stack.
- **Escape-to-pause** — stays descoped (button only); if revived it is a screen-layer key by the
  boundary rule.
