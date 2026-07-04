# Engine review & feature roadmap — 2026-07-04

Scope: full read of `source/engine/` (ecs, app, ui, scheduler, graphics, tiled), `source/pixi-tools/`,
`source/tiled-tools/`, and the demo game layer in `source/game/`, on branch `somewhere-update`.
Goal: assess the current state of the engine and propose the features needed to make it fully
usable for building browser pixel art games.

---

## 1. Current state

### What exists and is genuinely solid

- **Pixel-art rendering defaults are right.** Pixi v8, `scaleMode: 'nearest'` set globally,
  `antialias: false`, `roundPixels: true`, `imageRendering: pixelated` on the canvas, integer
  (floored) camera coordinates, DPR-aware resize (`Game.ts:82-96`, `212-246`, `334`).
- **A small, well-tested ECS** (`engine/ecs/`): entities as component maps, `defineComponent`/
  `defineEvent` factories, AND-subset queries, systems as plain objects with lifecycle callbacks,
  double-buffered event channels (one-frame latency by design, zero per-frame allocation),
  deferred entity add/remove during update with idempotent removal, back-filling of entities into
  late-added systems/queries. Teardown ordering in `World.stop()` is deliberate and documented.
- **Two scheduling layers** (`engine/scheduler/`): a screen-level `Scheduler` (`after`, `every`,
  `tween`, promise-based `wait`, cancel-all with settled waits) and entity-bound
  `timerSystem`/`tweenSystem` that can emit ECS events on completion. 8 easing functions.
- **A canvas UI toolkit** (`engine/ui/`): flexbox layout via `@pixi/layout`, widgets (Container,
  Panel, Text, Button, Toggle, TextInput), a focus system with DFS tab order, spatial
  (arrow-key) navigation with distance scoring, focus scopes for modals, a live focus ring, and a
  genuinely sophisticated `TextInput` (hidden DOM input, mobile soft-keyboard handling, caret
  blink, device→CSS px conversion).
- **A Tiled asset pipeline**: zod schemas covering essentially the whole Tiled JSON format
  (`tiled-tools/`), Pixi Assets loader/cache parsers (`pixi-tools/`), tile layers with animated
  tiles, per-tile collision rectangles, GID flip-flag decoding.
- **App shell**: `Game`/`GameScreen` lifecycle with asset bundles per screen, loading screen,
  screen switching, React Router mount via `Renderer.tsx`, StrictMode-survivable init, resize
  handling, `DisposableStack`-based per-hide cleanup, auto-unsubscribing `screen.subscribe`.
- **A working demo**: click-to-move character on a Tiled map with swept-AABB tile collision
  (separated-axis, edge-triggered wall-hit events), camera clamped to map bounds, spark popups
  driven by tweens, a UI bridge from ECS event channels to the screen layer, and a menu
  exercising every widget. Good unit-test coverage across engine modules.

Overall: the architecture is thoughtful and the engineering quality is high for the parts that
exist. What's here is a **foundation**, not yet a usable game engine — several load-bearing
pieces are missing entirely (audio, input abstraction, save/load) and a few existing ones are
silently broken.

### Broken or misleading today (fix before adding features)

1. **Depth sorting does nothing.** `Map.ts:76` and `graphicsSystem.ts:43` compute y-sort
   `zIndex` values, but `sortableChildren` is never set on any container, so in Pixi v8 draw
   order is insertion order. Characters will not walk behind/in front of scenery.
2. **No pause is possible.** `World.update` ignores `#isRunning` (`World.ts:291`); the only way
   to pause is detaching from the ticker. Neither scheduler layer is pause-aware. No
   `visibilitychange` handling, and no engine-level `deltaMS` clamp (only `motionSystem` caps it
   locally), so a backgrounded tab produces a simulation jump.
3. **Tiled footguns**: infinite maps, base64/compressed layers, embedded tilesets, and object
   layers are all *validated* by the schemas but silently dropped at runtime
   (`Tilemap.ts:49-67`) — an exported map can produce empty layers with no error. Tile flip
   flags are stripped and never re-applied, so mirrored tiles render un-mirrored. Tiled frame
   durations are ignored (fixed `animationSpeed = 0.15` everywhere).
4. **Known confirmed issues from `code-review-2026-07-03.md`** still open: re-entrant
   `Game.init()` (duplicate WebGL contexts on HMR), uncaught `loadBundle` rejection stranding
   the loading screen, `TextInput` global-listener leak and always-`document.body` container,
   UI root layout chain broken (banner and counter overlap at (0,0), `onResize` empty),
   full-grid collision scans per entity per frame.
5. **Engine correctness details**: repeating `Timer` drifts and can't catch up when period <
   frame time; event channels pushed to but never registered on the world grow unbounded;
   `Tween` snapshots `from` at construction (stale-origin footgun); deferred double-add of an
   entity throws while deferred double-remove is tolerated.

### Structural limitations to be aware of

- **No runtime component add/remove** — an entity's component set is fixed at construction
  (`Entity.ts:15-22`). "Add `Stunned` for 2s" requires destroy-and-rebuild, which re-fires all
  add/remove hooks and rescans all systems.
- **No fixed timestep** — simulation advances by raw `ticker.deltaMS`; frame-rate dependent and
  non-deterministic.
- **Manual system ordering** — correctness depends on hand-ordered `addSystem` calls with
  load-bearing comments (`game/world.ts:36-52`).
- **Linear query matching** — every entity add/remove scans all systems and queries; fine at
  demo scale, won't scale to hundreds of entities.
- **Single-world coupling** — `timerSystem`/`tweenSystem` are module singletons; two worlds
  can't coexist.
- **One tile = two display objects, no culling** — `Map` builds a `Container` + sprite per tile
  up front (`Map.ts:48-63`); large maps will hurt.
- **Boilerplate visible in the demo**: per-widget background sets re-typed everywhere (no
  theming), query-per-singleton files, 8-direction animation names copy-pasted to satisfy
  `graphicsSystem`'s hardcoded clip names, hardcoded collision-layer index `1`, magic bounding
  boxes flagged `TODO` in `playerSystem.ts:24-25`.

---

## 2. Feature proposal

"Completely usable for browser pixel art games" = a developer can build a small Zelda-like /
Stardew-like top-down game (or a simple platformer) without leaving the engine. Measured
against that bar, the gaps group into three tiers.

### Tier 0 — repairs (prerequisites, not features)

- Enable `sortableChildren` where y-sorting is intended, or better: introduce explicit render
  layers (see T1.6).
- Honor `#isRunning` in `World.update`; clamp `deltaMS` at the engine level.
- Fix the confirmed 2026-07-03 review findings (init re-entrancy, loadBundle rejection,
  TextInput leaks, UI root layout).
- Make unsupported Tiled inputs **loud**: throw or warn on infinite/compressed/embedded-tileset
  maps instead of yielding empty layers.

### Tier 1 — must-haves (the engine is not usable without these)

1. **Input system (biggest single gap).** Today the only gameplay input is `pointertap`;
   keyboard exists solely for UI focus and there is no path from a key to an ECS system.
   Build an action-mapping layer: named actions ("move-left", "interact") bound to keyboard
   keys, gamepad buttons/axes, and pointer/touch; per-frame edge states (`pressed`, `held`,
   `released`) and axis values; readable from systems via a world resource; rebindable at
   runtime. Include a virtual joystick/buttons option for mobile, since pointer-only control
   schemes don't cover most pixel-art genres.
2. **Audio.** There is zero audio code in the tree — no dependency, no playback, nothing.
   Integrate `@pixi/sound` (or howler): SFX + looping music, master/music/sfx buses with
   volume/mute, unlock-on-first-gesture handling, and persistence of volume settings. Wire it
   to ECS via an event pattern (`playSound` events) so systems don't hold audio handles.
3. **Sprite animation as a real feature.** Replace the velocity-angle if/else ladder and
   hardcoded 8 clip names in `graphicsSystem` with: an animation component (current clip,
   speed, loop/one-shot, finished-event), per-clip speeds, respect for Tiled frame durations,
   and a lightweight state machine (states + transitions on conditions) so characters,
   effects, and props don't each need bespoke system code. This also removes the
   "fake 8 names for a spark" workaround.
4. **Camera as an engine feature.** Promote the camera from a demo component to
   `engine/camera/`: follow target with lerp smoothing and deadzone, world bounds clamping,
   **integer zoom**, screen shake, and implementation as a transform on a world container
   instead of three systems independently subtracting `cameraPosition` (`mapSystem`,
   `graphicsSystem`, and popups today).
5. **Pixel-perfect viewport.** There is currently no zoom at all — the world renders 1:1
   texel-to-device-pixel, so the game is tiny on HiDPI screens. Add a fixed internal
   resolution (e.g. 320×180 or 640×360) rendered to the canvas with **integer upscaling** and
   letterboxing. This is the defining rendering feature of a pixel-art engine and interacts
   with camera zoom, UI layout, and pointer→world coordinate conversion, so it should come
   early.
6. **Render layers + working y-sort.** Explicit named layers (background, ground, y-sorted
   entities, foreground/overhang, UI) with `sortableChildren` enabled only on the y-sorted
   layer. Fixes the inert-`zIndex` bug structurally.
7. **Tiled object layers.** Object layers are the standard way to author spawn points,
   triggers, doors, and collision volumes; today they're dropped. Parse them and provide an
   entity-factory registry (`type` → factory) so a map can populate the world. Also: read the
   collision layer by name/property instead of hardcoded index `1`, support multiple/nonrect
   collision shapes per tile (at least keep all rectangles), and apply flip flags to rendered
   tiles.
8. **Save/load + settings persistence.** No persistence API is used anywhere. Add component
   serialization (needs stable entity IDs and a component schema/registry — `defineComponent`
   is the natural place), world snapshot/restore, and a small versioned storage wrapper
   (localStorage for settings, IndexedDB for saves).
9. **Pause & time control.** `world.pause()`/`resume()`, a `timeScale`, pause-aware schedulers,
   and pause-on-`visibilitychange`. Cheap once `#isRunning` is honored, and nearly every game
   needs a pause menu.
10. **Fixed-timestep option.** An accumulator with fixed simulation steps + variable render,
    so movement/collision behave identically at 60/120/144 Hz. Opt-in per world.

### Tier 2 — needed for a polished, shippable game

11. **UI theming + missing widgets.** A theme/skin object (nine-slice sets, fonts, colors,
    padding) consumed by widgets so backgrounds aren't re-typed per instance; then the missing
    widget set: scroll container, slider, select/dropdown, progress bar, radio group, and a
    modal/dialog primitive on top of the existing focus scopes. `Text` needs word wrap and
    richer styling (existing TODO).
12. **Screen transitions.** Fade/crossfade between screens (the `Scheduler`+`Tween` machinery
    already supports it; `showScreen` just needs hooks).
13. **ECS ergonomics.** Runtime component add/remove (or a sanctioned cheap swap), world
    resources/singletons (kills the query-per-singleton boilerplate), `without` query filters,
    and named system phases (input → simulation → reactions → render) to replace comment-driven
    ordering.
14. **Tilemap performance & rendering completeness.** One container per layer with plain
    sprites (drop the per-tile wrapper), viewport culling for off-screen tiles, layer
    opacity/offset/parallax support.
15. **Particles.** A small emitter on `pixi.ParticleContainer` (spawn rate, lifetime, velocity
    spread, alpha/scale over life) — the spark popup shows the need; every game wants hits,
    dust, sparkles.
16. **Object pooling as an engine service** with a component `reset` hook, so effects like the
    spark popups stop allocating 8 `AnimatedSprite`s per hit.
17. **Fullscreen toggle** (Fullscreen API + resize integration) and orientation guidance on
    mobile.
18. **Asset pipeline completion.** Implement the `Spriteset` format (currently an empty stub),
    loading-progress reporting for the loading screen, and error UI for failed loads.

### Tier 3 — force multipliers (after the above)

19. **Debug overlay**: FPS, entity/system counts, collision-box and hit-area visualization,
    camera info; toggled by keybinding.
20. **Pathfinding** (grid A*) — natural fit for the existing click-to-move + tile collision.
21. **Wang/autotiling support** at runtime (schemas already parse Wang sets).
22. **Localization** (string tables; bitmap-font glyph coverage strategy).
23. **Multiple worlds / world stacking** (requires de-singleton-izing `timerSystem`/
    `tweenSystem`) — enables pause-menu-over-frozen-world, minigames.
24. **Collision improvements**: spatial partitioning (only test tiles in the swept range —
    the full-grid double scan is the known perf hotspot), moving-vs-moving entity collision,
    trigger volumes (overlap events without blocking).

---

## 3. Suggested order of attack

1. **Tier 0 repairs** — everything else builds on a correct base.
2. **Input system** (T1.1) — unblocks every genre beyond click-to-move.
3. **Pixel-perfect viewport + camera + render layers** (T1.4-6) — one coherent rendering work
   package; they share the world-container transform.
4. **Animation component/state machine** (T1.3) — removes the worst demo boilerplate.
5. **Audio** (T1.2) — independent of everything else, high perceived value.
6. **Tiled object layers** (T1.7) — turns Tiled into the actual level editor.
7. **Pause/time control + fixed timestep** (T1.9-10).
8. **Save/load** (T1.8) — do after component schemas settle, since serialization shapes the
   component model.
9. Tier 2 in roughly the listed order; theming + widgets can proceed in parallel with world
   features since they touch disjoint code.

With Tier 0 + Tier 1 done, the engine covers the full loop of a real pixel-art game: author a
level in Tiled, control it with keyboard/gamepad/touch, hear it, pause it, save it, and see it
crisply integer-scaled. Tier 2 gets a game to "shippable polish"; Tier 3 is acceleration.
