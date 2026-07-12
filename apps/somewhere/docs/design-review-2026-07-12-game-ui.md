# Design-doc review — `docs/superpowers/specs/2026-07-12-game-ui-design.md` (2026-07-12)

**Scope:** the resolved Game UI design doc (main menu, game screen, pause overlay, Options modal, `World.pause`, `Modal` primitive, `UiRoot` scope fix), reviewed against the codebase at `2677f74`. Goal: usual review targets **plus** every underspecified detail that would force the implementation planner to invent a decision.

**Method:** two independent reviewers (claim-verification against source; underspecification hunt from the planner's seat), findings merged, deduped, and every load-bearing file:line spot-checked by the main agent. The doc's factual claims about the engine are overwhelmingly accurate — issues below are mostly *gaps*, not errors.

Findings are ranked by how badly each would derail an implementation plan, worst first. **Blocker** = the plan cannot be written without inventing a decision; **Important** = the plan would embed a wrong or fragile assumption; **Minor** = doc correctness / wording.

---

## What holds up (verified — no need to re-litigate)

- Every "Relevant engine facts" bullet checks out (`World.ts:291-324`, `Game.ts:430-471`, `UiRoot.ts:211-228`; commit `f7c928d` is real and says what the doc claims).
- **Click-to-move blocked "for free" is genuinely correct**, for the right non-obvious reason: `playerSystem` listens for `pointertap` on the game view (`playerSystem.ts:32`) and `UiRoot.stopTap` stops exactly `pointertap` (`UiRoot.ts:39-41, 85`). An interactive full-screen scrim inside the UI root does block it.
- Pause/scheduler split is sound: `GameScreen.update` drives the screen `Scheduler` on its own ticker entry (`GameScreen.ts:117-121`), independent of `world.update`. `World.stop()` only requires `isRunning` (`World.ts:56-59`), so quit-from-paused works.
- What-freezes-automatically list is correct (all 10 systems, ECS timers/tweens, channel-swap deferral at `World.ts:321-323`).
- Focus-key navigation while paused works (`Game.ts:283-333` routes to `currentScreen.ui` regardless of world state); Escape is not in `focusKeys` (`game.ts:4-12`).
- `popFocusScope` restores `previousFocus` with revalidation (`UiRoot.ts:230-241`) and pointer taps set focus silently (`UiRoot.ts:75-79`), so "focus returns to the Options menu item" works for mouse users too.
- `TextInput` supports both initial `value` and `setValue()` (`TextInput.ts:19, 278-286`), so showing the current `settings.playerName` is satisfiable.
- Menu asset story: everything the menu needs is in the `default` bundle (`game.ts:14-37`); `showScreen` auto-shows loading for the unloaded `game` bundle.
- Section 6 demo-fate mapping matches `mainScreen.ts` piece for piece; `uiBridge`/`wallHitChannel` transfer verbatim.
- Existing `World`/`UiRoot` test harnesses extend naturally to the World-pause and scope-invalidation tests (`tests/World.test.ts`, `tests/UiRoot.test.ts:656-760`).

---

## Findings

### ~~1. Modal creation lifecycle is unspecified, and "close and destroy in `onHide`" is self-contradictory across re-shows — Blocker~~ ✅ FIXED

> **Resolved** in this commit (Option A — per-open construction): design doc §4 now specifies that a `Modal` is constructed per open (reminder-dialog precedent) with the owning screen tracking `openModal: Modal | null`; splits the API into animated `close()` (pops scope, fades, destroys on completion) vs synchronous `destroy()` (no tween, tolerates an empty scope stack); and sets the `onHide` contract to `destroy()` only, recording the hide-ordering rationale (`clearFocus` + deferred `scheduler.clear()` run before `onHide`). The Quit-to-menu bullet was updated to match.

Doc §4: *"the owning screen's `onHide` must close and destroy any open modal (as `mainScreen.onHide` does for `openDialogs` today)."*

`onAdd` runs **once** per screen lifetime (`GameScreen.setGame`, `GameScreen.ts:101-111`); `onHide` runs on **every** hide — and both new screens re-show repeatedly (game screen on every New Game, menu on every quit-to-menu). If the modal is built in `onAdd` and destroyed in `onHide`, the second run works against destroyed views. The cited `openDialogs` precedent is per-open creation + destroy-on-close (`mainScreen.ts:199-276`) — consistent, but the doc never says the pause/Options modal content is per-open.

Two ordering facts inside `GameScreen.hide()` (`GameScreen.ts:144-158`) make the sentence worse: `ui.clearFocus()` (wipes `#scopes`, `UiRoot.ts:151-155`) and `#disposables.dispose()` (runs the `scheduler.clear()` deferred at show, `GameScreen.ts:128`) both run **before** `onHide`. So in `onHide`: (a) `modal.close()`'s `popFocusScope()` finds an already-empty stack (benign, but the doc should say so), and (b) an "optional fade-out" scheduled by `close()` survives the clear, freezes when `Game.hideScreen` removes the screen from the ticker (`Game.ts:490-492`), and **resumes against already-destroyed views on the next show** — a zombie tween on the second New Game. `mainScreen.onHide` never does this: it removes and destroys dialogs synchronously, no animation (`mainScreen.ts:351-357`).

**Fix:** one paragraph in §4 deciding: (1) creation point — recommend per-open construction (matches the precedent); (2) API split — animated `close()` (pops scope, removes+destroys on tween complete) vs synchronous `destroy()` (no tween, tolerates an empty scope stack), with `onHide` calling only `destroy()`.

### ~~2. "Reentrancy-guarded (`isOpen`)" does not cover Escape-toggle during fades — Blocker~~ ✅ FIXED

> **Resolved** in this commit (Option B, with cancel-and-replace instead of tween reversal): design doc §4 now defines a `closed → opening → open → closing → closed` state machine; toggling mid-fade cancels the running tween (via the handle `Scheduler.tween()` returns) and starts a **new** tween that picks up from the current alpha (`Tween` captures from-values at construction — verified in `Tween.ts:31-35`). Reopen during `closing` reuses the closing instance (the one exception to per-open construction); the focus-scope pop moved to close-**completion** so reversal needs no re-push; the Escape handler branches on `world.isPaused`; `world.resume()` fires at close-start; `destroy()` cancels in-flight tweens from any state. §7's Modal test bullet now covers the spam cases.

Doc §4: *"`open()`/`close()` are reentrancy-guarded (`isOpen`)"*; *"Escape toggles."*

The guard blocks re-entry of the *same* operation, not the opposite one during an animation. During an animated `close()` (`isOpen` already false, fade-out tween owning `view.alpha`, onComplete about to remove/destroy content), the next Escape takes the *open* path: `world.pause()` succeeds and `open()` passes its guard — two tweens fight, and the old fade-out's onComplete then destroys the content the new `open()` just re-added. Mirror case for Escape during fade-in. Additionally `world.pause()` **throws** on double-pause (§3 guards), so a mis-ordered toggle crashes rather than degrades.

Also unstated: what the Escape handler branches on — `world.isPaused` or `modal.isOpen` (the doc uses both concepts without picking).

**Fix:** pick one in the doc: (a) **no fade for the pause modal in v1** (simplest; makes `isOpen` binary and Escape spam trivially safe), or (b) a three-state modal (`closed`/`open`/`closing`) where toggling cancels the in-flight tween (`Scheduler.tween` returns a cancel handle, `Scheduler.ts:52-58`) and Escape is ignored while `closing`. State the toggle's branch condition explicitly.

### ~~3. Modal API shape is missing: constructor, `UiChild`-ness, initial-focus mechanism, centering, resize, z-order — Blocker~~ ✅ FIXED

> **Resolved** in this commit (Shape 1 — `Container`-idiom widget, after rejecting an earlier over-abstracted framing): design doc §4 now specifies `Modal implements UiParent` (flat, no inheritance) with options `{children?, layout?, scrimAlpha?, scheduler? + fadeDuration?, initialFocus?}`. Placement is entirely caller-designed via the verbatim `layout` passthrough (no centering opinion in the primitive — the "centering" question from this finding was a non-decision once placement moved to the caller). Pinned: scrim is a raw out-of-flow pixi child excluded from `children` (invisible to the focus walk); `open(ui)` takes the `UiRoot` as a parameter, adds the modal as the last UI child (above HUD, under the focus-ring overlay) and applies the explicit `initialFocus` via `ui.focus()` — the unimplementable "first focusable" language is gone; `resize(width, height)` is dumb plumbing called by the owning screen (after open + from `onResize`); scope pop happens **before** `removeChild` on close-completion/destroy. §7's Modal test bullet updated to match.

Doc §4 describes structure and behavior but no API. The planner must invent:

- **Constructor/collaborators:** Modal needs the content `UiChild`, the `UiRoot` (addChild + scopes), the screen `Scheduler` (fades), and screen dimensions (`game.app.screen`). Is `Modal` itself a `UiChild` (one root `view` wrapping scrim + content) added via `screen.ui.addChild(modal)`? It must be — the scrim's tap only hits `UiRoot.stopTap` from inside the UI root, and content focusables are only discoverable through public `children` arrays (`UiRoot.ts:357-391`).
- **"Sets initial focus to the modal's first focusable" has no available mechanism:** `UiRoot.focus()` needs a `Focusable` reference (`UiRoot.ts:147-149`); `#collectFocusables` is private; `focusNext()` would set `#isRingVisible = true` (`UiRoot.ts:331`), showing the ring on pointer-initiated opens. Recommend an explicit `initialFocus?: Focusable` option applied via `ui.focus()` after `pushFocusScope` (Resume button / Options' chosen widget).
- **Centering:** manual math like the reminder dialog's hardcoded `width/2 − 160` (`mainScreen.ts:263-267`) or a layout wrapper? (Interacts with finding 4.)
- **Resize:** "re-sized via the screen's resize path" = the `onResize` callback (`GameScreen.ts:161-163`), which is `() => {}` on every screen today. So `Modal` must expose `resize()` and each consumer must wire it — new work, not existing machinery. Also: scrim resize via `Graphics` redraw or scaling?
- **Close ordering:** `close()` must `popFocusScope()` **before** `ui.removeChild(...)` — otherwise the doc's own new invalidation fix (finding 6) drops the scope first and the `previousFocus` restoration that §5 depends on is silently lost.
- **Z-order:** `UiRoot.addChild` inserts below the focus-ring overlay (`UiRoot.ts:116-124`); the modal must simply be added after the HUD children — say so.

**Fix:** pin the API in §4, e.g. `new Modal({ui, scheduler, content, getSize, alpha?, fadeDuration?, initialFocus?})`, `Modal implements UiChild`, methods `open()/close()/destroy()/resize()`.

### ~~4. "Centering via flex layout on the screen root, the same pattern `loadingScreen` uses" is half-true — the pattern doesn't reach focusable widgets, and no mechanism is given for the HUD corners — Blocker~~ ⏭️ WON'T FIX

> **Won't fix** (2026-07-12): rejected at the maintainer's discretion. Menu/HUD positioning stays as written in the design doc; any wiring specifics are left to implementation time.

Doc §2 (menu centering, "window resize handled for free") and §6 (*"HUD `Text` in the top-left corner… the pause button takes the top-right"*).

`loadingScreen` adds its label **directly to `screen.view`**, bypassing `UiRoot` (`loadingScreen.ts:26-34`) — fine for a non-focusable label. Menu buttons must live under `screen.ui` to be reachable by the focus walk, but `UiRoot.view` is a plain container with **no layout** (`UiRoot.ts:44-61`) sitting between `screen.view` and the banner (`GameScreen.ts:107-108`) — the `%`-layout chain from `game.view` (`Game.ts:102, 246`) breaks there. This exact gap is why the old banner rendered pinned to (0,0) (code-review-2026-07-03 finding 3, deferred). So "for free" requires a new, unprecedented piece of wiring: layout on `ui.view` (or a full-screen layout `Container` inside `ui`).

On the game screen it's riskier: `screen.view` also contains `world.view`; nothing verifies @pixi/layout leaves layout-less children (world view, focus-ring `#overlay`) untouched if `screen.view`/`ui.view` get flex layout. And nothing says how top-left/top-right corners are achieved (full-screen flex row with `justifyContent: 'space-between'` inside `ui`, vs manual `position.set` in `onResize` — which is empty today, `mainScreen.ts:359`).

**Fix:** §2/§6 should state the actual mechanism. Recommend: menu — a full-size centered layout container inside `ui` holding the banner; game screen — a full-screen non-interactive layout container inside `ui` for the two HUD corners, `screen.view` left un-layouted so the world is untouched; note the @pixi/layout-vs-plain-children assumption must be verified (or fall back to manual `onResize` positioning, the reminder-dialog precedent).

### 5. The "Screens" tests don't mirror existing test patterns — the promised harness doesn't exist, and Red-Green TDD needs the boundary decided first — Blocker

Doc §7: *"Screens: lifecycle tests mirroring the existing `Game`/`GameScreen` tests…"*

Existing `Game` tests use hand-rolled **fake screens** under a fully mocked `pixi.js` (`tests/Game.test.ts:3-49, 101-110`); `GameScreen` tests use a fake game (`tests/GameScreen.test.ts:57-66`). **No test today imports a real screen module** — because they do import-time singleton work: `game.ts` constructs a `pixi.Application` at module load (`Game.ts:59`), pools need loaded bundles (`playerPool.ts:13`, `mapPool.ts:5`; `Sprite.ts:20-25` throws without a spritesheet), and real screens construct `Button`/`Panel`/`Text`/`NineSliceSprite`/`Graphics`/`@pixi/layout` containers that no current mock provides. "Escape pauses the world and opens the modal" as a real-screen test is an integration test with a large new mock surface.

**Fix:** §7 must name the seam. Options: (a) a shared `tests/mocks/pixi.ts` (+ `@pixi/layout` stub) and real screens driven through a stubbed game (keydown via `globalThis.dispatchEvent` — precedent at `tests/Game.test.ts:112-118`); or (b) test extracted handlers (pause toggle, quit) with injected fakes and keep full menu→game→pause loops in the manual visual pass. Each choice yields a different task list; the plan can't sequence TDD without it.

### 6. `UiRoot` scope-invalidation fix: no containment test is specified, and none is trivially available — Blocker

Doc §4: *"`UiRoot` drops any focus scopes whose root lives in a removed/destroyed subtree."*

`UiChild` has no parent pointer (`UiChild.ts`), so "lives in a removed subtree" needs a defined test, and the candidates differ in coverage: (a) eager, at `removeChild(child)` time, walking the removed child's component `children` arrays — misses removals done deeper (e.g. via `Panel.removeChild`, which knows nothing about scopes) and misses destroyed-but-still-childed roots; (b) lazy validation in `#collectFocusables`/`popFocusScope` via the pixi `view.parent` chain + `destroyed` — self-healing, covers nested/destroyed cases, but drops scopes on the next focus command rather than at removal time. Also undecided: mid-stack scopes (splice one, or discard everything stacked above it?), and what happens to a dropped scope's `previousFocus`. The TODO at `UiRoot.ts:211-224` enumerates exactly these choices; the doc resolves none of them, yet §7 promises tests for the behavior.

**Fix:** pick one in §4 (recommend lazy pruning from the top of `#scopes` of any scope whose root view is destroyed or unreachable from `ui.view`, restoring the last pruned scope's `previousFocus` if still collectible, plus the eager direct-child check in `removeChild`) and state the mid-stack rule.

### 7. Pause wiring reach: how `onPause` enumerates sprites and reaches the `Map` — neither has the bookkeeping — Important

Doc §3: *"`Sprite.pause()`/`resume()`… applied to all entities with a `GraphicsComponent`"*; *"`Map.pauseAnimations()`/`resumeAnimations()` — stop/play the animated tile sprites."*

- **Enumeration:** `world.ts` has no query over `GraphicsComponent` (queries: camera/level/players, `world.ts:39-41`). Filter `world.entities` by component? Reuse `graphicsSystem.entities` (Motion+Graphics — happens to cover player and spark popups today)? Add a `graphicsQuery`? Each behaves differently if a Graphics-only entity ever appears. Map access: module-level `mapEntity` (`world.ts:29`) or `levelQuery`. Pick one.
- **`Map` keeps no references to its `AnimatedSprite`s** — they're anonymous children inside `tile.view` (`Map.ts:54-64`). `pauseAnimations()` needs either an `#animatedSprites` array collected at construction or a tree walk; decision + test design depend on it.
- **`Sprite.resume()` = unconditional `play()` is safe only by an unstated invariant:** the constructor never plays the initial animation (`Sprite.ts:34-41`); it's playing only because `graphicsSystem.onAddEntity` plays it (`graphicsSystem.ts:55`) and `show()` plays on switch. As a reusable engine API, `pause()` should capture `view.playing` and `resume()` restore it — one line each, and the doc's claim becomes unconditionally true. Also state whether `pause()` touches only the current `view` or all `sprites` (only the current one can be playing).

**Fix:** §3 gains three sentences: enumeration mechanism (recommend `world.entities` filtered on `GraphicsComponent` + `mapEntity`'s `LevelComponent.map`), `Map` collects animated sprites at construction, `Sprite.pause()` records `#wasPlaying`.

### 8. Escape listener: the prescribed "registers in `onShow`, disposes in `onHide`" has no supported mechanism, and the handler's guards are unstated — Important

Doc §4: *"a `keydown` listener the game screen registers in `onShow` and disposes in `onHide`."*

`GameScreen.#disposables` is private (`GameScreen.ts:36`) and the only public hook, `subscribe()`, is hard-wired to the screen's `EventEmitter` (`GameScreen.ts:132-142`). The real options are (a) a module-level handler variable in `gameScreen.ts` added/removed in `onShow`/`onHide` (the `playerSystem.pointerTapHandler` pattern, `playerSystem.ts:11-39`), or (b) a new public `GameScreen.defer(fn)` API — an engine change the doc doesn't mention. Also unstated: the `event.target instanceof HTMLInputElement` guard that `Game`'s own handler uses (`Game.ts:268-270`), and whether to `preventDefault()` (Game only prevents mapped keys; Escape is unmapped).

**Fix:** one sentence choosing (a) (recommended — no engine change) with the `HTMLInputElement` guard and no `preventDefault`, or explicitly adding `screen.defer()` to the engine work list.

### 9. `World.pause()` micro-semantics — Important

Doc §3 specifies guards but not: (a) **early-return placement** — if placed after `this.#isUpdating = true` (`World.ts:292`) without resetting it, every later `addEntity`/`removeEntity` defers into `#pendingChanges` forever and `stop()` throws (`World.ts:61-63`); the return must be the first statement (the §7 test list doesn't force this distinction). (b) **Hook ordering** — do `onPause`/`onResume` fire before or after the flag flips (matters if a hook reads `world.isPaused`)? (c) **`stop()` on a paused world must not fire `onResume`** when it resets the flag — the game's `onResume` would `play()` sprites that `onStop` is about to destroy; the doc is silent. (d) Should `resume()` also require `isRunning`?

**Fix:** four sentences in §3: early-return first statement of `update()`; `pause()` = guard → flag → `#onPause`; `resume()` = guard (running + paused) → flag → `#onResume`; `stop()` clears `#isPaused` silently.

### 10. Boot wiring: exact `_index.tsx` changes, screen registration, and the menu ↔ game import cycle — Important

Doc §§1/6 say only *"`routes/_index.tsx` boots into `mainMenuScreen` instead."* `Game.showScreen` silently no-ops for unregistered screens (`Game.ts:414-417`), so someone must `addScreen(gameScreen)` too — where? And the described flow creates a static import cycle: `mainMenuScreen.ts` needs `gameScreen` (New Game) and `gameScreen.ts` needs `mainMenuScreen` (Quit to menu). Runtime-safe in ESM (both used lazily in handlers), but the planner shouldn't discover it mid-implementation.

**Fix:** state in §1: `_index.tsx` imports and registers all three screens (`addLoadingScreen` + `addScreen` × 2), then `showScreen(mainMenuScreen)`; and either accept the cycle with a comment or break it (e.g. only `gameScreen` imports `mainMenuScreen`, and the menu's New Game resolves `gameScreen` via the registered `game.screens` / a tiny registry module).

### 11. `gameScreen` constructor config is entirely unstated — Important

The doc pins the menu's `assetBundles` and focus ring but for the game screen only describes behavior. The planner must invent: `assetBundles` (presumably `['default', 'game']` as today, `mainScreen.ts:25`), `focusRing` (needed for keyboard navigation in the pause modal; §2's sentence covers only the menu), `events: uiEvents` (needed for the wall-hit `subscribe`), and the state shape (`hitCounter`, `pauseButton`, `openModal`, …). Also the file path is never named (`source/game/gameScreen.ts` by convention).

**Fix:** one sentence in §1 or §6 enumerating the constructor options and the file name.

### 12. Options modal: per-open value refresh, DOM-input host, and initial focus — Important

Doc §5. If the modal content is rebuilt per open (finding 1's recommendation), `TextInput` takes `value: settings.playerName` and `Toggle` takes `checked: settings.soundEnabled` at construction — but the doc never picked the lifecycle, so it also never says reopening must re-sync (`setValue()` / `check()`/`uncheck()` exist). The `container` element should be stated (`game.app.canvas.parentElement ?? document.body`, `mainScreen.ts:182` — note code-review-2026-07-03 finding 4 deferred the fact that this resolves to `document.body`; the menu screen inherits that deferral). Initial focus inside the Options modal is unspecified (pause menu got "initial focus on Resume"; Options got nothing).

**Fix:** three sentences in §5 once finding 1 is decided.

### 13. `settings.ts`: default values, export shape, and whether `playerName` has any consumer — Important

Doc §5 gives the module and fields but not the **defaults** (`playerName: ''`? `soundEnabled: true`?), the export shape (mutable exported object vs getters — §7 promises "defaults and mutation" tests), or whether `settings.playerName` feeds `PlayerComponent` (currently hardcoded `'Jakub'`, `playerPool.ts:20`). Sound is explicitly "no-op for now"; playerName gets no such sentence, leaving an unplanned wiring question through `playerPool`.

**Fix:** give the literal object (recommend `{playerName: '', soundEnabled: true}`) and mirror the Sound bullet: playerName is write-only in v1, `playerPool` untouched.

### 14. File inventory gaps + test-file case collision — Minor

Only `mainMenuScreen.ts`, `Modal.ts`, `settings.ts` get explicit paths. The game screen's natural test file `tests/gameScreen.test.ts` differs from the existing engine test `tests/GameScreen.test.ts` **only by case** — a collision on case-insensitive filesystems (macOS checkouts). New test file names and the `mainScreen.ts` deletion ordering (imports in `_index.tsx` must flip in the same task to keep the app booting mid-plan) are unstated.

**Fix:** the plan should open with a full file manifest; pick a distinct game-screen test name.

### 15. Boot flow line is wrong: the loading screen will not appear at boot — Minor

Doc §1: *"Boot: `game.init()` → loading screen → main menu screen."* `init()` already awaits `loadBundle(['default'])` (`Game.ts:84-86`) and the menu declares only `default`, so `showScreen(mainMenuScreen)` skips the loading branch (`Game.ts:435`). Loading appears only on New Game (if the background load of `game` hasn't finished). Faster boot — but the flow text should match.

### 16. §7 test wording: "events pushed before pause deliver on the first resumed frame" needs sequencing — Minor

Delivery requires a swap between push and pause (`World.ts:321-323`). A test that pushes then immediately pauses (no intervening `update`) sees delivery on the *second* resumed update — a red test failing for the wrong reason under the doc's own Red-Green rule. Specify: push → update → pause → resume → update.

### 17. "Initial focus lands on New Game via the focus walk's nearest-top-left rule" is imprecise — Minor

Nearest-top-left is the arrow-key path (`UiRoot.ts:176-179`); Tab uses DFS order (`UiRoot.ts:335-338`). Both land on New Game here, but note there is no focus at all until the first focus command — nothing is focused on show. Reword to avoid a planner adding an unneeded "set initial focus" task (contrast with the modal, which *does* set focus explicitly — finding 3).

---

## Assessment

**Ready for implementation planning? With fixes.** The doc's exploration was real — its engine claims verify almost uniformly — but the `Modal` primitive is specified at the concept level, not the contract level: findings 1–3 are interlocking lifecycle gaps that a plan would inherit directly, and findings 4–6 each hide a mechanism the codebase doesn't yet have. Resolving 1–6 in the doc (a paragraph each) unblocks the plan; 7–13 are one-to-three-sentence pins; 14–17 are wording.
