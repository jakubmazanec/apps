# Engine Code Review

Date: 2026-06-17
Scope: `source/engine/` (app, ecs, graphics, tiled, ui, utilities)
Method: 7-agent fan-out — one reviewer per module plus a cross-cutting consistency pass, then synthesised.

Each finding has a stable ID (e.g. `H1`, `M3`, `X2`, `L7`) so it can be cited in later conversations. IDs are not reassigned even if findings are later resolved.

---

## 1. Headline assessment

The engine has a clear, recognisable shape — `new X({options})`, composition over inheritance, `#private` fields, `DisposableStack` for teardown — but the per-module implementations of that shape have drifted. The biggest theme is duplication-and-divergence between sibling classes (Button/Toggle/TextInput, Container/Panel, System/EntityQuery, Game/GameScreen) and three or four different vocabularies for the same concept (events, lifecycle, error handling, defaults). Strongest pieces are `FocusManager`, the ECS event/component branding, and the React glue; weakest are the `tiled` flag pipeline (end-to-end broken) and `Vector`'s cached angle.

---

## 2. High-severity findings

### H1 — Tilemap.from masks off all flip/rotation bits before storage
`tiled/Tilemap.ts:62` does `tiledTilemapLayer.data.map((gid) => getGid(toTileGid(gid)))`, so `Map` (`tiled/Map.ts:47-69`) never sees flag bits and never applies flips. Combined with the dead `getHorizontalFlip`/`getVerticalFlip`/`getDiagonalFlip`/`getRotatedHex120` files and the unused `TileGidWithFlags` brand, the entire flag pipeline is either dead or silently broken.

### ~~H2 — Vector.length setter and `#angle` cache are entangled and bug-prone~~ ✅ FIXED (2026-06-17)
~~`utilities/Vector.ts:44-52` reads `isZero` (x/y only) to pick a branch using `#angle`, but mutators `add`/`subtract`/`multiply`/`divide`/`negate`/`lerp`/`normalize` (`utilities/Vector.ts:76-146`) write x/y directly and never refresh `#angle`. After a non-zero detour back to (0,0) the cached angle is stale; `normalize` bypasses `set()` and desyncs the invariant. The "remember last direction while at origin" contract is never actually maintained.~~

Resolved by routing every mutator through `set()` so it is the single chokepoint that maintains the `#angle` cache. Proven by `tests/Vector.test.ts` (`describe('direction memory after arithmetic mutators (H2)')`). Remaining known limitation: writing components directly to zero (`v.x = 0; v.y = 0`) still can't snapshot the angle — use `v.length = 0` or `v.set(0, 0)`.

### ~~H3 — ObjectPool has no double-destroy / double-create guard~~ ✅ FIXED (2026-06-17)
~~`utilities/ObjectPool.ts:34-52`: `destroy(x)` re-pushes blindly, so `pool.destroy(x); pool.destroy(x)` quietly hands the same instance to two callers on the next two `create()` calls. No `WeakSet` of pooled instances, no dev-mode assertion. For a primitive whose purpose is identity tracking, the foot-gun is severe.~~

Resolved by a dev-only assertion in `destroy()`: `if (import.meta.env.DEV && this.#objects.includes(object)) throw new Error('Object was already destroyed!')`. The conventional array free list, `create`, and `getSize` are untouched; the check throws on double-destroy in dev/test and is dead-code-eliminated from the production bundle (Vite substitutes `import.meta.env.DEV → false`, so it ships zero cost — verified by grepping the built bundle). Proven by `tests/ObjectPool.test.ts` (`throws on double destroy (H3)`). Scope note: foreign/cross-pool destroy is intentionally not guarded — `destroy(object: T)` only accepts a `T` and `create()` re-runs `onReset`, so TypeScript + reset already make shape a non-issue.

### H4 — Game.addRef does five unrelated jobs inline — 🔍 REVIEWED, NO CODE CHANGE (2026-06-22)
`app/Game.ts:180-312`: mounts canvas, lazily builds the `#disposables` stack (line 188 — so its lifetime is tied to ref-attachment, not to Game), wires `resize`, builds `handleKeyDown` with a 45-line `FocusCommand` switch (256-300) where four cases all call `ui.moveFocus(command)` and the rest are 1:1 pass-throughs to UiRoot methods. Resource ownership, DOM mounting, and input routing all sit at the same altitude.

**Disposition.** H4 decomposes into three independent subissues, reviewed with Jakub:

- **Subissue 1 — focus `switch` verbosity** (`Game.ts:256-300`): **kept as-is.** It is explicit and greppable; the four duplicate `ui.moveFocus(command)` cases are tolerable. A collapse is available later (a `FocusDirection = 'down'|'left'|'right'|'up'` type already exists at `ui/FocusManager.ts:6` and is exactly `moveFocus`'s parameter, so a `default` branch would typecheck) but is not warranted now.
- **Subissue 2 — `addRef` altitude** (132-line method): **kept as-is.** It is a cohesive attach/setup method; the engine deliberately uses inline method-local closures (no `#handle*` methods, no `.bind`), and the closure-identity-via-`DisposableStack.defer` teardown depends on that locality.
- **Subissue 3 — `#disposables` lazy + lifetime tied to `addRef`/`removeRef`**: **reassigned to [H5](#h5--asymmetric-game-lifecycle-init-has-no-destroy-counterpart)** as part of the Game-lifecycle rework.

Correction to the original write-up: the implied double-`addRef` listener leak does **not** occur. `addRef` is called from `source/ui/Renderer.tsx:9-19` in a `useEffect([game])` whose cleanup calls `removeRef`; React 18 StrictMode (`source/entry.client.tsx:8-11`) runs setup → cleanup → setup (`addRef → removeRef → addRef`), and `game` is a module singleton (`source/game/game.ts`) that transitions `undefined → game` once. Behavior is locked by `tests/Game.test.ts` (8 focus-routing tests).

### ~~H5 — Asymmetric Game lifecycle: `init()` has no `destroy()` counterpart~~ ✅ FIXED (2026-06-22)
~~`app/Game.ts:73-125` registers pixi extensions, kicks off `Assets.backgroundLoadBundle`, and constructs the Pixi Application; only `removeRef` exists for teardown (`app/Game.ts:314-322`), and it only unmounts the canvas. The Pixi app, extensions, background loads, and ticker callbacks all leak if Game is ever discarded.~~

~~Folded in from [H4](#h4--gameaddref-does-five-unrelated-jobs-inline--reviewed-no-code-change-2026-06-22) (subissue 3): the `#disposables` stack is built lazily inside `addRef` (`Game.ts:188`) with its lifetime scoped to the `addRef`/`removeRef` pair. That scoping is defensible (the deferred `resize`/`keydown` listeners are born and die there), but the unconditional `this.#disposables = new DisposableStack()` at line 188 overwrites any existing stack without disposing it — a latent foot-gun (not triggered today) that should be closed when a symmetric `init()`/`destroy()` (or equivalent) lifecycle is introduced here.~~

Resolved by a terminal `Game.destroy()` that disposes the `#disposables` stack, detaches the root view, and calls `app.destroy(true)` (renderer + ticker + canvas). `Game` is a process-lifetime singleton and is not restartable (unlike `World`), so `destroy()` exists for correctness, test isolation, and the React unmount path; `source/routes/_index.tsx` now wires it into the effect cleanup. `init()` is guarded by `#initialized` (re-callable across the dev StrictMode init→destroy→init cycle) and the process-global `Assets` bootstrap runs once via `#assetsBootstrapped`. The `pixi.extensions.add(...)` calls moved to module scope (register-once plugins, like `import '@pixi/layout'`). The folded-in H4 subissue-3 is closed by re-homing `#disposables`: it is now a single eager `readonly #disposables = new DisposableStack()` (matching `Button`/`UiRoot`), disposed once in `destroy()`, instead of being created/torn down per `addRef`/`removeRef`. `addRef` still registers the window `resize` + global `keydown` listeners and defers their teardown into that stack; `removeRef` only unmounts the canvas. (A `DisposableStack` cannot be reused after disposal — verified: `defer()` after `dispose()` throws `ReferenceError` — so a single readonly stack is sound only because `Game` is one-shot and never re-init'd after `destroy()`.) One consequence: focus routing now lives for the whole Game lifetime and is detached at `destroy()`, not at `removeRef()` (in this app `removeRef`+`destroy` happen together on unmount). `GameScreen` also gained a standalone `destroy()` (disposes its `UiRoot` + subscriptions) for tests/explicit disposal, **not** auto-called by `Game.destroy()` — the screens are reused module singletons and `setGame()` is one-shot, so cascade-destroying them would break reuse. Proven by `tests/Game.test.ts` (`Game focus key routing`: destroy detaches listeners, disposes the app, is idempotent, no-ops before init; `removeRef` keeps routing until destroy) and `tests/GameScreen.test.ts` (`GameScreen.destroy`).

### H6 — GameScreen.subscribe couples screens to a module-global `ui` emitter
`app/GameScreen.ts:1-6, 100-110` calls `ui.on(...)` against the imported `../ui/ui.js` singleton, not against anything injected. The screen's own `#ui` (a UiRoot) is a completely different object also named `ui`. Violates the "constructor injection over helpers" rule; cleanup at `hide()` only covers handlers registered via this exact method.

### ~~H7 — Buffered-mutation protocol in `World.update` is half-implemented~~ ✅ FIXED (2026-06-23)
~~`ecs/World.ts:213-265, 267-287`: `addEntity`/`removeEntity` defer to queues while `#isUpdating`, but `addSystem`/`removeSystem` (106-146), `addEntityQuery`/`removeEntityQuery` (148-188), and `addEventChannel`/`removeEventChannel` (190-211) have no such guard. A system that adds a system or channel during `onUpdate` mutates the array mid-iteration of `for (let system of this.systems)` (line 270).~~

Resolved by a fail-fast guard: all six topology methods (`add`/`remove` × `System`/`EntityQuery`/`EventChannel`) now `throw` if called while `#isUpdating`, mirroring the existing `stop()` guard (`Cannot stop the world during an update!`) and the engine's ECS throw-on-misuse policy ([M16](#m16--error-handling-convention-differs-ecs-throws-ui-returns-silently-tiled-does-both)/[X6](#x6--error-policy)). Deferral (mirroring `addEntity`/`removeEntity`) was deliberately **not** chosen: no caller needs mid-update topology changes (every `addSystem`/`addEntityQuery`/`addEventChannel` runs in `onStart`, every removal in `stop()`), it would duplicate the entity-queue machinery for zero benefit, carry surprising "my system silently skipped a frame" semantics, and make `stop()` inconsistent. The asymmetry is principled: **topology is fixed for the duration of a frame; only entity population is dynamic** (entities defer, topology throws). Proven by `tests/World.test.ts` (`topology mutation during an update throws (H7)`), a `test.each` over all six methods.

### ~~H8 — EventChannel's "safe next-frame" contract only holds inside `update`~~ 🔍 REVIEWED — assertion corrected (2026-06-24)
~~`ecs/EventChannel.ts:37-42`, `ecs/World.ts:284-286`. `swap()` runs at the end of `update`; anything pushed between frames lands in `#nextEvents`, surfaces next frame, and is then overwritten by the following `swap()` without ever being readable. The doc on `push` ("becomes current next frame") is true only for in-update producers.~~

The data-loss assertion is incorrect — no event is ever silently dropped. `World.update` (`ecs/World.ts:291-311`) runs every system, then performs **exactly one** `swap()` per channel as its last act (`308-310`); a `#currentEvents` batch is therefore bounded by two swaps with **exactly one system-run phase between them**. The sole consumer (`uiBridge`, `game/uiBridge.ts:9`) is a registered system, so it reads `events` on every frame (`world.update` is driven by the Pixi ticker via `game/mainScreen.ts:163` → `app/GameScreen.ts:146`). An off-cycle/between-frame push thus surfaces at the next swap and is read on the following `update()` — **delayed one frame, never overwritten unread**. "Never readable" would require two swaps with no intervening system phase, which the single-swap-per-`update` loop forbids. This matches the design doc's own contract — *"buffering naturally batches any off-cycle push into the next deterministic read"* (`docs/event-system.md:302-303`) — and is moot in practice: every `push` today is in-update (`game/motionSystem.ts:71,114`), with zero between-frame producers. The one legitimate residue (the inline `push` JSDoc was terse about off-cycle producers) is closed by a one-clause amendment to the `push` doc in `ecs/EventChannel.ts:26` and its `event-system.md` mirror. The only real losses are **intentional and documented**: the `clear()` at the `stop()` boundary discards the final frame's batch (`docs/event-system.md:244-245`) and `events` is empty on the first `update()` after `start()`. Proven by `tests/EventChannel.test.ts` (`event pushed between frames surfaces to an in-update consumer (H8)`: a between-frame push is invisible during the next frame's read and delivered the frame after, not lost).

### H9 — Button/Toggle/TextInput duplicate the entire state-backed background machine
`ui/Button.ts:31-74,203-218`; `ui/Toggle.ts:29-80,182-195`; `ui/TextInput.ts:43,77-107,390-404`. Each widget independently re-implements the `Record<State, Container>` of backgrounds, the `Object.values(...)` disposable-adoption loop (with byte-identical comments), the layout-listener-driven hit area rectangle, and the `#setState` swap with `removeChild`/`addChildAt(next, 0)`. Roughly 40 lines of mechanical duplication per widget.

### H10 — Hover/disable state machine duplicated across all three input widgets
`ui/Button.ts:76-90,177-197`; `ui/Toggle.ts:82-96,138-158`; `ui/TextInput.ts:147-161,363-383`. The pointerover/pointerout handlers are structurally identical (same disabled/hovered guards, same `#setState` calls); `enable()`/`disable()` bodies differ only in `'pointer'` vs `'text'` cursor. ~50 lines of duplicated control flow.

### H11 — Three different event/subscription vocabularies coexist
`ecs/EventChannel.ts:27-34` (pull, double-buffered, `channel.events` array) vs `app/Game.ts:127-152` and `ui/ui.ts:1-10` (eventemitter3 `on/once/off`) vs `app/GameScreen.ts:100-110` (`subscribe` with implicit auto-cleanup, no `unsubscribe`) vs widget options `onClick`/`onChange`/`onEnter` (Button.ts:17, Toggle.ts:18, TextInput.ts:22-23). A consumer cannot transfer intuition between any pair. See also [X1](#x1).

### H12 — Lifecycle hook naming differs across subsystems
ECS: `onAdd/onRemove/onUpdate/onAddEntity/onRemoveEntity` + `setWorld/unsetWorld` (`ecs/System.ts:8-29, 113-131`); `onStart/onStop` (`ecs/World.ts:12-15`). App: `onAdd/onShow/onHide/onUpdate/onResize` + `setGame` with no `unsetGame` (`app/GameScreen.ts:13-20, 71-78`). Game itself uses `init()`/`addRef`/`removeRef` with no `on*` options (`app/Game.ts:73-125`). The same conceptual moments are named differently per layer, and the `set*/unset*` pair is honoured only by System. See also [X2](#x2).

---

## 3. Medium-severity findings

### M1 — System.unsetWorld and World.stop disagree on whether `onRemove` sees entities
`ecs/World.ts:68-82`, `ecs/System.ts:122-131`. `World.stop` removes all entities first, then systems, so `onRemove` fires with `system.entities` empty — but the in-source comment says events "hug" pre-teardown state. `removeSystem` mid-flight has the same drain-then-callback ordering.

### M2 — System and EntityQuery share ~50 lines of literal duplication
`ecs/System.ts:36-158` vs `ecs/EntityQuery.ts:19-88`. Identical `world` getter, `setWorld`/`unsetWorld`, `addEntity`/`removeEntity`, `getFirst`. System is effectively `EntityQuery + lifecycle callbacks`.

### M3 — `@internal` lifecycle methods are public; the tag is the only fence
`ecs/System.ts:113,123,134,139,149`; `ecs/EntityQuery.ts:44,52,61,70`; `ecs/EventChannel.ts:37,45`. Any caller can call `system.addEntity(...)` directly and bypass World's bookkeeping; the most invariant-sensitive entry points are indistinguishable from the public API.

### M4 — World's generic add/remove methods are saturated with `as unknown as` casts
`ecs/World.ts:106-211`. Eight-plus `as unknown as System` / `EntityQuery` / `EventChannel` casts; the generics aren't buying type safety. Either drop the generic parameter on the World methods (the registered objects already carry `T`) or fix the variance.

### M5 — `addChild`/`removeChild` duplicated across every UI container
`ui/UiRoot.ts:80-102`, `ui/Button.ts:138-159`, `ui/Panel.ts:32-53`, `ui/Container.ts:29-50`. Four near-identical 8-line methods plus the `'view' in child ? child.view : child` adapter; UiRoot differs only because it must keep the overlay layer last.

### M6 — UiRoot is a shallow pass-through over FocusManager
`ui/UiRoot.ts:104-134`. Seven methods (`focus`, `moveFocus`, `focusNext`, `focusPrevious`, `activate`, `pushFocusScope`, `popFocusScope`, `clearFocus`) plus the `focused` getter are pure forwarding. Doubles the public surface for no policy or simplification.

### M7 — FocusManager.hideRing leaks ring-lifecycle ownership to UiRoot
`ui/FocusManager.ts:40-42,55-57`; `ui/UiRoot.ts:63-65`. FocusManager owns `#ringVisible` but UiRoot's global pointerdown handler reaches in to call `hideRing()`. Ring visibility is one concept split across two owners.

### M8 — Toggle's options API drifts from Button/TextInput
`ui/Toggle.ts:8-19` accepts neither `layout` nor `children`, while Button and TextInput accept `layout` and Button accepts `children`. Toggle hard-codes its size from `backgrounds.unchecked.width/height` (line 65). Toggle also implements `Focusable` but not `UiParent`, with no documented reason.

### M9 — Game.on/once/off pass-throughs expose the internal `view` container as the public event surface
`app/Game.ts:127-152`. Three forwarding methods typed against `pixi.FederatedEventMap`; callers can't tell whether they're listening on stage, canvas, or sub-container, and Game's internal Container choice becomes part of its contract.

### M10 — Tileset.getTile and Tilemap.getTile diverge on brand, return type, and error policy
`tiled/Tileset.ts:124-132` (raw `number`, throws on miss) vs `tiled/Tilemap.ts:80-91` (branded `TileGid`, returns `undefined`). `tiled/Map.ts:48-69` handles the undefined case but never the throw.

### M11 — Sprite.show silently no-ops on first call with the initial sprite
`graphics/Sprite.ts:44-60`. Constructor sets `currentSpriteName = spriteNames[0]` and leaves `view.visible = false` (line 35), but never plays it; `show(spriteNames[0])` then early-returns at line 46 because the name matches.

### M12 — Sprite hard-codes animationSpeed = 0.15 with no override
`graphics/Sprite.ts:36`. No per-sprite override in `SpriteOptions`; callers must reach into `sprite.sprites[name].animationSpeed`, which leaks the internal container.

### M13 — Map.addToLayer / removeFromLayer hard-code layer index 1
`tiled/Map.ts:97-103`. `this.layers[1]?.view.addChild(view)` — `?.` swallows missing-layer cases; method name implies generality but always targets layer 1.

### M14 — addToView/removeFromView duplicated on Game and GameScreen with subtly different semantics
`app/Game.ts:389-397` vs `app/GameScreen.ts:128-141`. Same name, but GameScreen's variant also calls `setChildIndex` to keep `#ui.view` on top — invisible from the signature.

### M15 — GameScreen.state silently undefined when onAdd omitted
`app/GameScreen.ts:29,71-78`. `state!: T` + `this.state = this.#onAdd?.(this, game) as T`. A `GameScreen<SomeState>` constructed without `onAdd` has `state === undefined` at runtime; the type lies.

### M16 — Error-handling convention differs: ECS throws, UI returns silently, tiled does both
ECS throws on every misuse (`ecs/World.ts:49-51,109-111,130-132`); UI `activate`/`enable`/`disable` are silent no-ops (`ui/Button.ts:169-197`, `ui/Toggle.ts:138-158`); tiled is split (`tiled/Map.ts:37-39` throws, `tiled/Map.ts:97-103` silent, `tiled/Tilemap.ts:80-91` returns `undefined`, `tiled/Tileset.ts:124-132` throws). See also [X6](#x6).

### M17 — Option-defaulting style differs from class to class
Four conventions in use: ECS-style `if (x !== undefined)` per-field guard (`ecs/World.ts:34-42`, `ecs/System.ts:69-87`, `app/GameScreen.ts:37-60`); default-in-destructuring (`ui/Button.ts:35`, `ui/Toggle.ts:32`); `??` fallback dictionaries for state backgrounds (`ui/Button.ts:42-47`, `ui/Toggle.ts:37-47`); and conditional inline spreads (`ui/Container.ts:21-25` vs `ui/Button.ts:129-133`). See also [X5](#x5).

### M18 — Subscription cleanup uses three different vehicles for similar work
`GameScreen.#uiSubscriptions: Array<() => void>` with manual loop (`app/GameScreen.ts:25,113-119`); `Game.#disposables: DisposableStack` allocated lazily (`app/Game.ts:53,188,316-317`); `UiRoot.#disposables` eager (`ui/UiRoot.ts:31,164-166`). GameScreen reinvents what `DisposableStack` already does. See also [X4](#x4).

### M19 — Map constructor is a tactical tornado
`tiled/Map.ts:34-95`. Sixty lines doing asset lookup, nested layer/tile iteration, sprite-vs-AnimatedSprite branching with magic `animationSpeed = 0.15`, bounding-box cloning, grid math duplicated from `Tileset.ts:43-45`, and z-index computation, with no helper structure.

### M20 — Vector.isZero uses a different epsilon criterion than isEqual
`utilities/Vector.ts:31-38` uses strict `< EPSILON && > -EPSILON`; `isEqual` (86-92) uses `Math.abs(...) < EPSILON`. `Vector(Number.EPSILON, 0).isZero` is `false` even though `a.isEqual(Vector.ORIGIN)` may be `true` at the boundary.

### M21 — `is*` getter / `disabled` field / state-introspection naming is inconsistent
Button exposes `get state` (`ui/Button.ts:161-167`); Toggle exposes both `get disabled` and `get isFocusable` (`ui/Toggle.ts:111-121`); TextInput has neither (`ui/TextInput.ts:294-310`). No consistent way to ask "is this widget disabled". See also [X7](#x7).

### M22 — GameScreen.state has no peer in System/World/EntityQuery
`app/GameScreen.ts:22-78`. The `state!: T` initialised by `onAdd` is a unique threading mechanism; the rest of the engine uses captured closure or constructor options. Either it's the right pattern (and should appear elsewhere) or it's an accidental localism.

---

## 4. Low-severity / nits

### L1
`EntityQuery.addEntity` error message says "system" — copy-paste from `ecs/System.ts:141`. (`ecs/EntityQuery.ts:63`)

### L2
`World.stop` has four near-identical reverse-iteration teardown loops. (`ecs/World.ts:68-98`)

### L3
`EntityQuery` lacks `onAdd`/`onRemove`/`onAddEntity`/`onRemoveEntity` while System has all four — asymmetric for sibling classes. (`ecs/EntityQuery.ts:6-58`, `ecs/System.ts:8-54`)

### L4
Brief inconsistent state inside `World.update` after `#isUpdating` clears but before `swap()`. (`ecs/World.ts:267-287`)

### L5
`Component` and `Event` files are byte-identical except for the brand tag. (`ecs/Component.ts`, `ecs/Event.ts`)

### L6
No system ordering/priority beyond insertion order. (`ecs/World.ts:23-26, 270-272`)

### L7
Commented-out CRTFilter block in `init()`. (`app/Game.ts:4, 106-124`)

### L8
Lazy `GameScreen.ui` getter mutates the scene graph on first read. (`app/GameScreen.ts:80-89`)

### L9
Per-property `if (x !== undefined)` constructor pattern repeated 5x in GameScreen, 2x in Game. (`app/GameScreen.ts:37-61`, `app/Game.ts:55-71`)

### L10
`Spriteset.ts` is a dead 5-line placeholder. (`graphics/Spriteset.ts:1-5`)

### L11
`ObjectPoolOptions<T,A>` vs `ObjectPool<P,T>` — inverted/renamed generics. (`utilities/ObjectPool.ts:1,8`)

### L12
`onCreate/onReset/onDestroy` naming clashes with the engine's event-observer `on*` convention. (`utilities/ObjectPool.ts:1-15`)

### L13
`Sprite.view`, `currentSpriteName`, and `sprites` map are public mutable. (`graphics/Sprite.ts:13-17`)

### L14
`Sprite` constructor allocates `sprites = {}` before throwing on missing spritesheet. (`graphics/Sprite.ts:20-25`)

### L15
`Tileset.from` writes `new Rectangle(0,0,0,0)` then four bang-bang field assignments. (`tiled/Tileset.ts:104-108`)

### L16
Magic `animationSpeed = 0.15`, hardcoded layer index 1, and unexplained z-index formula. (`tiled/Map.ts:59, 76-77, 98`)

### L17
`Tilemap.getTile` reverse-loops with no comment about Tiled's "highest firstgid wins" rule and an unsafe `as TilemapTileset` cast. (`tiled/Tilemap.ts:80-91`)

### L18
`Tileset.from`/`Tilemap.from` are async factories while `Map` reads `pixi.Assets` synchronously — three sibling classes, three construction shapes. (`tiled/Tileset.ts:36-122`, `tiled/Tilemap.ts:44-78`, `tiled/Map.ts:34`)

### L19
`FocusManager.#collectFocusables` relies on duck-typed `'view' in node` + `isFocusable === true`. (`ui/FocusManager.ts:189-215`)

### L20
`TextInput` registers a permanent global `pointerdown` listener per instance for blur-on-click. (`ui/TextInput.ts:253-263`)

### L21
`Text.layout` three-way runtime branch with a misleading type. (`ui/Text.ts:4-9, 27-35`)

### L22
Container forces flex defaults while Panel applies layout verbatim — naming gives no hint. (`ui/Container.ts:21-25` vs `ui/Panel.ts:25-27`)

### L23
Button has `activate()` + `onClick` callback (only pointer path stops propagation). (`ui/Button.ts:118-123, 169-175`)

### L24
`displayName` debug-label option exists only on ECS classes. (`ecs/System.ts:28`, `ecs/EntityQuery.ts:11`, `ecs/EventChannel.ts:7`)

### L25
World uses `start()/stop()` while every other class uses `add/show/hide` or `set/unset`. (`ecs/World.ts:34-104`)

### L26
File-organisation policy varies: `tiled/` one-helper-per-file, `ui/ui.ts` mini-barrel, `ecs/Event.ts` two-classes-with-eslint-disable.

### L27
`Renderable = {view, update}` is defined inside `GameScreen.ts` but consumed by both Game and GameScreen `addToView`. (`app/GameScreen.ts:8-11`, `app/Game.ts:389-397`)

---

## 5. Cross-module pattern divergences

The user-facing concern: "differences between various patterns used." Each row lists how one concept is handled differently across modules.

### X1 — Event / subscription mechanism
| Variant | Where |
|---|---|
| Pull-based double-buffered `channel.events` + `swap()` | `ecs/EventChannel.ts:27-34` |
| Push `on/once/off` via eventemitter3 | `app/Game.ts:127-152`, `ui/ui.ts:1-10` |
| `subscribe(event, handler)` with implicit auto-cleanup, no `unsubscribe`/`once` | `app/GameScreen.ts:100-110` |
| Widget options `onClick`/`onChange`/`onEnter` | `ui/Button.ts:17`, `ui/Toggle.ts:18`, `ui/TextInput.ts:22-23` |

### X2 — Lifecycle hook naming
| Variant | Where |
|---|---|
| `onAdd/onRemove/onUpdate/onAddEntity/onRemoveEntity` + `setWorld/unsetWorld` | `ecs/System.ts:8-29, 113-131` |
| `onStart/onStop` + `start()/stop()` | `ecs/World.ts:12-15, 48-104` |
| `onAdd/onShow/onHide/onUpdate/onResize` + `setGame`, no `unsetGame` | `app/GameScreen.ts:13-20` |
| `init()`/`addRef`/`removeRef`, no `on*` options | `app/Game.ts:73, 180, 314` |

### X3 — Destruction / disposal
| Variant | Where |
|---|---|
| `destroy()` + eager `DisposableStack` | `ui/Button.ts:33,199-201`, `ui/UiRoot.ts:31,164-166` |
| No `destroy()`, removed via `World.removeX` | `ecs/System.ts`, `ecs/EntityQuery.ts` |
| `.clear()` | `ecs/EventChannel.ts:45-48` |
| Lazy `#disposables` tied to `addRef` lifetime, no `destroy()` | `app/Game.ts:53, 188, 314-322` |

### X4 — Subscription-cleanup vehicle
| Variant | Where |
|---|---|
| Eager `DisposableStack.defer(...)` | `ui/TextInput.ts:246-279`, `ui/UiRoot.ts:31` |
| Lazy `DisposableStack` allocated in `addRef` | `app/Game.ts:53, 188` |
| Hand-rolled `Array<() => void>` looped in `hide()` | `app/GameScreen.ts:25, 113-119` |

### X5 — Option-defaulting style
| Variant | Where |
|---|---|
| Guarded `if (x !== undefined) { this.#x = x }` per field | `ecs/World.ts:34-42`, `ecs/System.ts:69-87`, `app/GameScreen.ts:37-60` |
| Default-in-destructuring | `ui/Button.ts:35`, `ui/Toggle.ts:32`, `ui/TextInput.ts:51-52` |
| Inline `?? backgrounds.normal` fallback map | `ui/Button.ts:42-47`, `ui/Toggle.ts:37-47`, `ui/TextInput.ts:77-81` |
| Conditional inline spread vs always-spread | `ui/Container.ts:21-25` vs `ui/Button.ts:129-133` |

### X6 — Error policy
| Variant | Where |
|---|---|
| Throws on every misuse | `ecs/World.ts:49-51,109-111,130-132`, `ecs/System.ts:96-102` |
| Silent no-op | `ui/Button.ts:169-197`, `ui/Toggle.ts:138-158` |
| Throws for missing asset | `tiled/Map.ts:37-39`, `tiled/Tileset.ts:124-132` |
| Silent / `undefined`-returning | `tiled/Map.ts:97-103`, `tiled/Tilemap.ts:80-91` |

### X7 — State introspection
| Variant | Where |
|---|---|
| `get state: ButtonState` | `ui/Button.ts:161-167` |
| `get disabled` + `get checked` (no `is*` prefix) | `ui/Toggle.ts:111-121` |
| No introspection getter | `ui/TextInput.ts:294-310` |
| `is*` prefix (`get isRunning`, `get isFocusable`, `get isRingVisible`) | `ecs/World.ts:44-46`, others |

### X8 — Construction shape
| Variant | Where |
|---|---|
| `new X({options})` synchronous | most of engine |
| `static async X.from(source)` factory | `tiled/Tileset.ts:36-122`, `tiled/Tilemap.ts:44-78` |
| Constructor reaches `pixi.Assets.get` synchronously | `tiled/Map.ts:34` |

### X9 — `addChild`/`removeChild` parent contract
| Variant | Where |
|---|---|
| Keeps overlay layer last | `ui/UiRoot.ts:80-102` |
| Plain push + `'view' in child ? child.view : child` adapter | `ui/Button.ts:138-159`, `ui/Panel.ts:32-53`, `ui/Container.ts:29-50` |

### X10 — `addToView`/`removeFromView` semantics
| Variant | Where |
|---|---|
| Plain `view.addChild` + `ticker.add` | `app/Game.ts:389-397` |
| Additionally calls `setChildIndex` to keep `#ui.view` on top | `app/GameScreen.ts:128-141` |

### X11 — Debug `displayName` option
| Variant | Where |
|---|---|
| Present | `ecs/System.ts:28`, `ecs/EntityQuery.ts:11`, `ecs/EventChannel.ts:7` |
| Absent | UI, app, tiled |

### X12 — File organisation policy
| Variant | Where |
|---|---|
| One-helper-per-file | `tiled/getGid.ts`, `tiled/get{Horizontal,Vertical,Diagonal}Flip.ts`, `tiled/getRotatedHex120.ts` |
| Single-export class file | most of `ui/`, `ecs/` |
| Two classes per file with eslint-disable | `ecs/Event.ts`, `ecs/Component.ts` |
| Mini-barrel | `ui/ui.ts` |

---

## 6. What's working well

- `FocusManager` is the cleanest module: single responsibility, well-commented, deep API.
- `defineComponent`/`defineEvent` branding via a tag is a small, sharp pattern that earns its place.
- Composition-over-inheritance is consistently applied; no class hierarchies anywhere.
- `#private` fields and `new X({options})` construction are honoured uniformly across modules.
- The ECS `EventChannel` double-buffering idea is the right primitive for system-to-system events (the bugs are around the edges, not the design).
- React glue in `app/` is minimal and doesn't leak React into the rest of the engine.

---

## 7. ID legend

- `H#` — high-severity finding (Section 2)
- `M#` — medium-severity finding (Section 3)
- `L#` — low-severity finding / nit (Section 4)
- `X#` — cross-module pattern divergence (Section 5)

Cite findings as e.g. "fix H1" or "address X4 and M18 together".
