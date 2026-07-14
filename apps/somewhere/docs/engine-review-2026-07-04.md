# Engine review & feature roadmap — 2026-07-04

Scope: full read of `source/engine/` (ecs, app, ui, scheduler, graphics, tiled), `source/pixi-tools/`,
`source/tiled-tools/`, and the demo game layer in `source/game/`, on branch `somewhere-update`.
Goal: assess the current state of the engine and propose the features needed to make it fully
usable for building browser pixel art games. Reflects the code state as of 2026-07-14.

---

## 1. Current state

### What exists and is genuinely solid

- **Pixel-art rendering defaults are right.** Pixi v8, `scaleMode: 'nearest'` set globally,
  `antialias: false`, `roundPixels: true`, `imageRendering: pixelated` on the canvas, integer
  (floored) camera coordinates, DPR-aware resize (`Game.ts:70`, `93-94`, `343`; resize in
  `Game.addRef`).
- **A small, well-tested ECS** (`engine/ecs/`): entities as component maps, `defineComponent`/
  `defineEvent` factories, AND-subset queries, systems as plain objects with lifecycle callbacks,
  double-buffered event channels (one-frame latency by design, zero per-frame allocation),
  deferred entity add/remove during update with idempotent removal, back-filling of entities into
  late-added systems/queries. Teardown ordering in `World.stop()` is deliberate and documented.
- **Pause.** `World.pause()`/`resume()`/`isPaused` (`World.ts:48-70`; `update()` early-returns
  on `#isPaused`), orchestrated by `game/pauseFlow.ts` with a pause overlay over the frozen,
  still-rendering world. World-bound schedulers freeze automatically because
  `timerSystem`/`tweenSystem` run inside the paused `world.update`.
- **World-driven animation.** Sprites and animated map tiles advance on world time
  (`autoUpdate: false`, ticked from `world.update`), so a paused world freezes them.
- **Two scheduling layers** (`engine/scheduler/`): a screen-level `Scheduler` (`after`, `every`,
  `tween`, promise-based `wait`, cancel-all with settled waits) and entity-bound
  `timerSystem`/`tweenSystem` that can emit ECS events on completion. 8 easing functions.
- **A canvas UI toolkit** (`engine/ui/`): flexbox layout via `@pixi/layout`, widgets (Container,
  Panel, Text, Button, Toggle, TextInput), a `Modal` primitive with focus scope and fade
  (`engine/ui/Modal.ts`, used by the pause menu and the Options dialog), a focus system with DFS
  tab order, spatial (arrow-key) navigation with distance scoring, focus scopes for modals, a
  live focus ring, and a genuinely sophisticated `TextInput` (hidden DOM input, mobile
  soft-keyboard handling, caret blink, device→CSS px conversion).
- **A Tiled asset pipeline**: zod schemas covering essentially the whole Tiled JSON format
  (`tiled-tools/`), Pixi Assets loader/cache parsers (`pixi-tools/`), tile layers with animated
  tiles, per-tile collision rectangles, GID flip-flag decoding.
- **App shell**: `Game`/`GameScreen` lifecycle with asset bundles per screen, loading screen,
  screen switching, React Router mount via `Renderer.tsx`, StrictMode-survivable init, resize
  handling, `DisposableStack`-based per-hide cleanup, auto-unsubscribing `screen.subscribe`.
- **A working demo**: click-to-move character on a Tiled map with swept-AABB tile collision
  (separated-axis, edge-triggered wall-hit events), camera clamped to map bounds, spark popups
  driven by tweens, a UI bridge from ECS event channels to the screen layer, a main-menu/game
  screen split with pause overlay and an Options modal backed by an in-memory `settings` module
  (`game/settings.ts`), and a menu exercising every widget. Good unit-test coverage across
  engine modules.

Overall: the architecture is thoughtful and the engineering quality is high for the parts that
exist. What's here is a **foundation**, not yet a usable game engine — several load-bearing
pieces are missing entirely (audio, input abstraction, save/load) and a few existing ones are
silently broken.

### Broken or misleading today (fix before adding features)

1. ~~**Depth sorting does nothing.** `Map.ts:82-83` and `graphicsSystem.ts:43` compute y-sort
   `zIndex` values, but `sortableChildren` is never set on any container, so in Pixi v8 draw
   order is insertion order. Characters will not walk behind/in front of scenery.~~
   ✅ **Decided** — Option A (enable `sortableChildren` on the entity layer), see
   [engine-fixes-design-2026-07-14.md](engine-fixes-design-2026-07-14.md).
2. ~~**A backgrounded tab produces a simulation jump.** There is no engine-level `deltaMS` clamp
   (only `motionSystem` caps it locally), no `timeScale`, and no `visibilitychange` handling.~~
   ✅ **Decided** — premise partly wrong: Pixi's `Ticker` already clamps `deltaMS` to 100 ms by
   default (`minFPS = 10`), so the worst case is a 100 ms step. Option A (pin the clamp
   explicitly in `Game.init` + test); `timeScale`/`visibilitychange` remain T1.9. See
   [engine-fixes-design-2026-07-14.md](engine-fixes-design-2026-07-14.md).
3. **Tiled footguns**: infinite maps, base64/compressed layers, embedded tilesets, and object
   layers are all *validated* by the schemas but silently dropped at runtime
   (`Tilemap.ts:49-67`) — an exported map can produce empty layers with no error. Tile flip
   flags are stripped and never re-applied, so mirrored tiles render un-mirrored. Tiled frame
   durations are ignored (fixed `animationSpeed = 0.15` everywhere).
4. **Still open from `code-review-2026-07-03.md`**: full-grid collision scans per entity per
   frame (deferred with a TODO in `motionSystem.ts`; fix tracked in T3.23) and the `TextInput`
   always-`document.body` container (won't fix/deferred).
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
  up front (`Map.ts:49-70`); large maps will hurt.
- **Boilerplate visible in the demo**: per-widget background sets re-typed everywhere (no
  theming), query-per-singleton files, 8-direction animation names copy-pasted to satisfy
  `graphicsSystem`'s hardcoded clip names, hardcoded collision-layer index `1`, magic bounding
  boxes flagged `TODO` in `playerSystem.ts:24-25`.

---

## 2. Feature proposal

"Completely usable for browser pixel art games" = a developer can build a small Zelda-like /
Stardew-like top-down game (or a simple platformer) without leaving the engine. Measured
against that bar, the gaps group into three tiers.

Target platform: desktop browser first (keyboard/gamepad/pointer). Mobile stays *compatible*,
not *optimized*: the hard-to-retrofit foundations are kept — proper audio unlock (T1.2),
WebGL context-loss recovery (T2.20), the per-device runtime pixel scale (T1.5),
eviction-tolerant storage (T1.8), and touch working at the pointer-action level (T1.1;
tap-to-move already works) — while mobile-optimized work (virtual joystick, orientation
guidance, regular device testing) waits until a specific game targets phones.

### Tier 0 — repairs (prerequisites, not features)

- Fix depth sorting via explicit render layers (see T1.6); `sortableChildren` appears nowhere
  in `source/`.
- Clamp `deltaMS` at the engine level. *(Re-scoped 2026-07-14: Pixi's ticker already clamps
  to 100 ms by default — pin it explicitly instead; see the fixes design doc, item 2.)*
- Make unsupported Tiled inputs **loud**: throw in DEV and warn in production on
  infinite/compressed/embedded-tileset maps instead of yielding empty layers, matching the
  existing `ObjectPool.destroy` DEV-invariant precedent. A `console.warn` alone gets missed
  and reproduces the empty-layer bug.

### Tier 1 — must-haves (the engine is not usable without these)

1. **Input system (biggest single gap).** Today the only gameplay input is `pointertap`;
   keyboard exists solely for UI focus and there is no path from a key to an ECS system.
   Build an action-mapping layer: named actions ("move-left", "interact") bound to keyboard
   keys, gamepad buttons/axes, and pointer/touch; per-frame edge states (`pressed`, `held`,
   `released`) and axis values. Expose it as a singleton-entity component read through an
   `EntityQuery`, exactly mirroring the existing `camera`/`level` pattern — not a module
   singleton, and not a "world resource" (an API that arrives with T2.15; migrate to
   resources then). The edge-state buffering contract: input latches on the render frame, the
   simulation drains edges once per sim step, each edge visible for exactly one step —
   written so it would survive a fixed timestep if one is ever retrofitted (see Cut). The
   action→key map is injectable
   config; there is no runtime-rebinding UI and no virtual joystick (see Cut) — touch
   participates at the pointer-action level. Gamepad API reality: it's poll-based
   (`navigator.getGamepads()` in the ticker loop) with connect/disconnect events, which fits
   the per-frame edge-state design exactly; existing JS action-map libraries are
   wrong-paradigm for an ECS or unmaintained, so building is justified.
2. **Audio.** There is zero audio code in the tree — no dependency, no playback, nothing.
   Build a thin in-house Web Audio wrapper, no dependency (howler.js is unmaintained,
   `@pixi/sound` has been dormant since 2024-07, and the needed surface is small): one
   `AudioContext`, a master/music/sfx `GainNode` bus graph with volume/mute, SFX as an
   `AudioBufferSourceNode` per playback, looping music, and `context.resume()` unlock on the
   first pointer/key gesture. Shape it as `new AudioMixer({...})` per the construction
   conventions. Sounds load through the per-screen asset bundles via a custom `Assets`
   loader parser (fetch → `decodeAudioData` → `AudioBuffer`) — the same pattern
   `pixi-tools` already uses for Tiled JSON. Volume settings persist through the validated
   storage wrapper (T1.8a). Wire it to ECS via an event pattern (`playSound` events) so
   systems don't hold audio handles — the one-frame channel latency is fine for SFX, and
   the channel must be registered on the world (see section 1 item 5's unbounded-channel
   bug). Music plays from decoded buffers — fine for short loops; a streaming
   `MediaElementAudioSourceNode` path can be added if a game ships long tracks.
3. **Sprite animation as a real feature.** Sprites and animated map tiles already advance on
   world time; what's missing is the authoring model. Replace the velocity-angle if/else
   ladder and hardcoded 8 clip names in `graphicsSystem` with an animation component (current
   clip, speed, loop/one-shot, finished-event), per-clip speeds, respect for Tiled frame
   durations (`animationSpeed = 0.15` is hardcoded everywhere), and a lightweight state
   machine (states + transitions on conditions) so characters, effects, and props don't each
   need bespoke system code. The "fake 8 names for a spark" workaround is mostly a
   `Sprite.show()` fallback/guard fix (see the TODO in `wallHitPopupSystem.ts`), independent
   of the state machine. No dependency on the `Spriteset` stub (T2.20): `Sprite` already
   reads named clips from a standard `pixi.Spritesheet` animations map.
4. **Camera as an engine feature.** Promote the camera from a demo component to
   `engine/camera/`: follow target with lerp smoothing and deadzone, world bounds clamping,
   screen shake, and implementation as a translation on a world container instead of three
   systems independently subtracting `cameraPosition` (`mapSystem`, `graphicsSystem`, and
   popups today). Adopt-vs-build: `pixi-viewport` is built around interactive pan/zoom the
   engine doesn't need (and fractional zoom would blur) — build.
5. **Runtime pixel scale.** Replace the baked ×4 asset upscale with a render-time system.
   Assets are authored at true 1× art-pixel scale (the asset generators drop their 4×4
   blocks; the Tiled map re-exports at 16px tiles) and the engine applies an integer
   `pixelScale` (e.g. 3-5), chosen per device at startup so the game reads similar-sized on
   a phone, a laptop and a 4K screen (today the baked ×4 renders 1:1, so apparent size
   swings with DPR), injected via options like other cross-cutting values. World coordinates
   keep their current semantics — device pixels, float precision, canvas at CSS×DPR — so
   movement stays device-pixel smooth and nothing ever resamples across a fractional DPR
   (the no-blur guarantee). NEAREST scaling at integer `pixelScale` renders pixel-identical
   chunkiness to the old baked assets, and texture memory drops 16×. Because `pixelScale`
   varies per device, every authored world quantity is expressed in art pixels and
   multiplied by `pixelScale` at construction: tile sizes, Tiled collision rects, bounding
   boxes, movement speeds, camera bounds, offsets. UI assets follow the same 1× authoring;
   widgets render at their own integer UI scale and `TextInput`'s device→CSS px math
   accounts for it. Live zoom is out of scope (changing `pixelScale` mid-game changes world
   distances); revisit if a game needs it. Post-processing (the commented-out CRT filter,
   `pixi-filters` is already a dependency) runs at device resolution under this model.
6. **Render layers + working y-sort.** Explicit named layers (background, ground, y-sorted
   entities, foreground/overhang, UI) built on Pixi v8's first-class `RenderLayer` API, which
   decouples render order from scene-graph parenting — an entity can stay parented under its
   map chunk yet render in a named layer — a better fit than nesting `sortableChildren`
   containers. Enable sorting only on the y-sorted layer. Fixes the inert-`zIndex` bug
   structurally.
7. **Tiled object layers.** Object layers are the standard way to author spawn points,
   triggers, doors, and collision volumes; today they're dropped. Parse them and provide an
   entity-factory registry (`type` → factory) so a map can populate the world. Read the
   collision layer by name/property instead of hardcoded index `1`, support multiple/nonrect
   collision shapes per tile (at least keep all rectangles), and apply flip flags to rendered
   tiles. Include **trigger volumes** (overlap events without blocking): doors and triggers
   need runtime overlap detection or the parsed objects have no behavior.
8. **Persistence.**
   **T1.8a — settings + small-blob storage (small; ship early).** `game/settings.ts` exists
   but is in-memory only. Add a small versioned `localStorage` wrapper with the *load side as
   a first-class concern*: every persisted payload parses through a zod schema (already in
   the tree) before touching state; parse/quota/corruption failures degrade to defaults, never
   throw into the game loop; a `version` field drives migration or explicit
   discard-on-mismatch. Settings (T1.2 volumes, `playerName`) and any future keymap all read
   through this one validated path — not several ad-hoc `JSON.parse`s. Persisted data is
   user-editable and, far more likely, corruptible (partial writes, stale schema from an old
   build).
   **T1.8b — game saves (the highest-risk Tier 1 item; do last).** Generic world
   snapshot/restore is a component-model redesign, not a wrapper: `Entity` has no id at all
   (identity is the object reference), events and components hold live object graphs
   (`MotionComponent.target`, `contactTile`, entity refs in `WallHit`) and even live pixi
   objects (`GraphicsComponent` constructs an `AnimatedSprite`), and `defineComponent` is
   `Object.assign` with no schema. Component sets staying fixed at construction (see Cut)
   at least keeps per-archetype schemas simple. Start with a bespoke hand-written save blob
   (player position, flags, inventory) through the T1.8a wrapper; defer the generic
   serializer until a concrete need forces it. Durability caveat: Safari ITP deletes *all*
   script-writable storage — localStorage AND IndexedDB — after 7 days without a site visit
   (home-screen PWAs exempt). Call `navigator.storage.persist()` where granted and offer
   manual save export/import.
9. **Time control.** Two clocks by construction. World time is defined as what
   `World.update` advances: `timeScale` is a `World` field applied to `deltaMS` at the top
   of `update()`, kept separate from `#isPaused` so pausing doesn't clobber a slow-mo
   setting and both stay queryable; gameplay motion, entity timers/tweens and world-driven
   animations all flow through it for free. The screen `Scheduler` is real-time by
   definition — `Modal` already drives its fade from it over the frozen world. The rule:
   anything that must freeze with the world runs through the world; overlay/menu effects use
   the screen scheduler (a screen-scheduler tween aimed at a world object won't freeze on
   pause — reviewable by this rule). `visibilitychange` auto-pauses the world only. Music
   keeps playing during pause by default (audio lives outside world time); ducking or
   pausing it is a per-game choice wired in `pauseFlow`. The `deltaMS` clamp is Tier 0.
10. **Dialogue / text-box system.** The defining content system of the target genres,
    currently absent: text boxes with typewriter reveal, portraits, branching choices, and an
    authoring format. (`Text` word wrap in T2.13 is not a substitute.) Bitmap fonts already
    exist (`monogram.fnt`), so the rendering substrate is there.
11. **Level/room manager.** Nothing loads map B when the player walks through a door in
    map A, carries player state across, spawns at the target door, and unloads the old map's
    entities. `GameScreen` is the wrong granularity — it's an app mode (menu/game/loading),
    not a room. This is the core loop of an exploration game and the natural consumer of
    T1.7 object layers and T2.14 transitions.

### Tier 2 — needed for a polished, shippable game

13. **UI theming + missing widgets.** A theme as **data** — asset names, nine-slice insets,
    font/color/padding tokens — that widgets consume to build their *own* sprites, never live
    sprite instances (widgets own and destroy their backgrounds; instances must never be
    shared), injected via each widget/screen's options object; no module-singleton
    `currentTheme`, no `ThemeService` helper module. The missing widget set: scroll
    container, slider, select/dropdown, progress bar, radio group. `Text` needs word wrap and
    richer styling (existing TODO).
14. **Screen transitions.** Fade/crossfade between screens (the `Scheduler`+`Tween` machinery
    already supports it; `showScreen` just needs hooks).
15. **ECS ergonomics: world resources/singletons.** Kills the query-per-singleton
    boilerplate (`cameraQuery`, `levelQuery`, ...); T1.1 ships on the query pattern and
    migrates here. Runtime component add/remove and `without` query filters are not planned
    (see Cut); entity component sets stay fixed at construction.
16. **Tilemap performance & rendering completeness.** One container per layer with plain
    sprites (drop the per-tile wrapper), viewport culling for off-screen tiles, layer
    opacity/offset/parallax support.
17. **Particles.** A small emitter built on Pixi v8's `ParticleContainer`
    (`@pixi/particle-emitter` is not a first-class v8 citizen): spawn rate, lifetime,
    velocity spread, alpha/scale over life — the spark popup shows the need; every game wants
    hits, dust, sparkles. v8 constraints: children are lightweight `Particle` objects only
    (no Sprites/AnimatedSprites, no per-particle children/filters/masks); all particles in a
    container should share one base texture; only `position` is dynamic by default, so
    alpha/scale/rotation over life must be declared in `dynamicProperties`; particles cannot
    be frame-animated — drive the look via scale/alpha/tint or swap textures manually. The
    spark popups (8 `AnimatedSprite`s per hit) do not port one-to-one.
18. **Object pooling migration.** Migrate the spark-popup allocation onto the existing
    constructor-injected `ObjectPool` (`engine/utilities/ObjectPool.ts`, with
    `onCreate`/`onReset`/`onDestroy`/`initialSize`, already used by `mapPool`/`playerPool`;
    `onReset` is the reset hook). Pooling stays constructor-injected — no engine service, no
    global registry.
19. **Fullscreen toggle** (Fullscreen API + resize integration). Feature-detect and fall back
    to CSS full-viewport where unsupported: iPhone Safari has no element fullscreen at all
    (video-only), and iPadOS gained it only in 16.4. Orientation guidance is mobile-optimized
    work (see Cut).
20. **Asset pipeline completion + GPU robustness.** Implement the `Spriteset` format
    (currently an empty stub), loading-progress reporting for the loading screen, and error
    UI for failed loads. Also WebGL context-loss recovery — re-create/re-upload GPU resources
    so a backgrounded mobile tab doesn't kill the game (a kept mobile-compatible foundation).

### Tier 3 — force multipliers (after the above)

21. **Debug overlay**: FPS, entity/system counts, collision-box and hit-area visualization,
    camera info; toggled by keybinding.
22. **Pathfinding** (grid A*) — natural fit for the existing click-to-move + tile collision.
23. **Collision improvements**: spatial partitioning (only test tiles in the swept range —
    the full-grid double scan is the known perf hotspot), moving-vs-moving entity collision.
    (Trigger volumes are part of T1.7.)

### Cut (YAGNI)

- **Runtime input rebinding** — the keymap is injectable config in source; revisit when a
  game ships a controls menu.
- **Virtual joystick / on-screen buttons, orientation guidance** — mobile-optimized work
  (the joystick is its own feature: multi-touch tracking, dead zones, UI-layer rendering);
  revisit when a specific game targets phones.
- **Runtime Wang/autotiling** — Tiled bakes autotiling at export time; the schemas parsing
  Wang sets is incidental.
- **Localization** — revisit if shipping in multiple languages becomes a goal; drags in
  bitmap-font glyph-coverage complexity.
- **Multiple worlds / world stacking** — pause-menu-over-frozen-world already works with one
  paused world; only a thin minigame justification remains. Don't de-singleton-ize
  `timerSystem`/`tweenSystem` speculatively.
- **Named system phases** — the hand-ordered `addSystem` calls with load-bearing comments
  work at this scale.
- **Fixed timestep / substepping** — not a problem now: swept-AABB collision doesn't tunnel,
  timers/tweens are ms-based, and the Tier 0 `deltaMS` clamp handles spikes. Keep per-frame
  math dt-correct (speeds × dt; smoothing as exponential decay, e.g. the T1.4 camera lerp).
  Revisit if a game ever needs determinism (replays, netcode) — an accumulator can be
  retrofitted inside `World.update` then.
- **Runtime component add/remove (+ `without` query filters)** — currently not planned;
  component sets stay fixed at construction, which also keeps T1.8b's per-archetype save
  schemas simple. Transient states (stun, i-frames, health) live as fields on permanent
  components with systems branching on them; destroy-and-rebuild remains the escape hatch.
  Revisit if branch-heavy systems start to hurt — promoting fields to components later is a
  localized migration.

---

## 3. Suggested order of attack

1. **Tier 0** — depth sorting/render layers, `deltaMS` clamp, loud Tiled failures.
2. **Validated storage wrapper** (T1.8a, small) — unblocks settings persistence now and
   T1.2/T1.8b later.
3. **Input system** (T1.1) — unblocks every genre beyond click-to-move.
4. **Runtime pixel scale + camera + render layers** (T1.4-6) — one rendering work package.
   It is really "rendering + asset migration": regenerate assets at 1×, re-export the map at
   16px tiles, convert authored world constants to art px × `pixelScale` (including
   `playerSystem`'s magic `-32`/`-60` offsets), and move the three camera-subtraction sites
   onto the world-container translation — so give each item an explicit "migrate `game/`"
   substep and keep the demo green as the acceptance test.
5. **Animation component/state machine** (T1.3) — removes the worst demo boilerplate.
6. **Audio** (T1.2) — independent of everything else, high perceived value.
7. **Tiled object layers + trigger volumes** (T1.7) — turns Tiled into the actual level
   editor; feeds the level/room manager.
8. **Dialogue system (T1.10) + level/room manager (T1.11)** — the content systems the target
   genres actually require.
9. **Time control** (T1.9).
10. **Game saves** (T1.8b) — last, after the gameplay component shapes have settled in
    practice.
11. Tier 2 in roughly the listed order; theming + widgets can proceed in parallel with world
    features since they touch disjoint code.

Verification note: the highest-value new items (pixel scaling, camera feel, screen shake,
audio unlock, particles) are the least unit-testable; budget a manual test-harness scene for
"feels right" checks alongside the unit-test discipline. Browser realities worth a line each
when their items start: iOS audio quirks beyond first-gesture unlock (silent switch,
low-power mode) and audio ducking/pausing on blur alongside `visibilitychange`.

With Tier 0 + Tier 1 done, the engine covers the full loop of a real pixel-art game: author a
level in Tiled, control it with keyboard/gamepad/touch, hear it, pause it, save it, talk to
its NPCs, walk between its rooms, and see it crisply integer-scaled. Tier 2 gets a game to
"shippable polish"; Tier 3 is acceleration.
