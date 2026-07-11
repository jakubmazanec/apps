# Code review — `somewhere-update` vs `development` (2026-07-03)

**Scope:** `git diff development...HEAD` — 151 files, ~9.7k insertions. New ECS engine (`source/engine/ecs`), Pixi UI toolkit (`source/engine/ui`), scheduler (`source/engine/scheduler`), app layer (`source/engine/app`), rewritten game systems (`source/game`), `patches/pixi.js+8.16.0.patch`, plus untracked `docs/` and `scripts/`.

**Method:** 8 independent finder angles (line-by-line, removed-behavior, cross-file, reuse, simplification, efficiency, altitude, conventions) → 40 candidates → 21 after dedup → one adversarial verifier per candidate. 11 CONFIRMED, 7 PLAUSIBLE, 3 REFUTED. No CLAUDE.md files govern the changed code, so the conventions angle returned nothing.

Findings are ranked most-severe first. CONFIRMED = demonstrable from the code; PLAUSIBLE = realistic but latent (typically new public API with no current caller on the failing path).

---

## Findings

### ~~1. `Game.init()` is re-entrant and double-initializes the renderer — CONFIRMED~~ ✅ FIXED

> **Resolved** in `7383738` + `c6a1d7f`: `init()` now guards on a single `#state` lifecycle machine, so a re-entrant call during the async span no-ops instead of re-running `Application.init()`.

`source/engine/app/Game.ts:78` — `#isRunning` is set only after all awaits resolve (line 112), so a second `init()` call during the async span passes the guard and re-runs `pixi.Application.init()` on the same `Application`. The game is a module singleton shared across route remounts, and the `_index.tsx` effect cleanup only aborts the caller's continuation — nothing tracks the in-flight init. A remount (route navigation, dev HMR) while the first init awaits `Assets.loadBundle` produces a second canvas, duplicated ticker plugin state, and a leaked WebGL context; repeated remounts hit "too many active WebGL contexts".

**Fix:** set an in-flight promise/flag at the top of `init()` and return it on re-entry.

### ~~2. Uncaught `loadBundle` rejection strands the loading screen — CONFIRMED~~ ✅ FIXED

> **Resolved** in `c6a1d7f`: the loading screen show + `loadBundle` are wrapped in `try/finally` so the spinner always hides, and the rejection now propagates out of `showScreen()`; the sole caller in `_index.tsx` catches and logs it. The transition state resets so the call is retriable.

`source/engine/app/Game.ts:435` — `pixi.Assets.loadBundle` is awaited with no try/catch anywhere in `showScreen`, after the loading screen was attached (429–431) and `currentScreen` cleared to null (422). The only caller is `void importedGame.showScreen(mainScreen)` in `routes/_index.tsx:37` with no `.catch`. A network failure fetching a bundle leaves the spinner running forever and the error becomes an unhandled promise rejection.

**Fix:** try/finally around the load so the loading screen always hides; surface or retry the error.

### ~~3. Banner panel and hit counter both render at (0,0) and overlap — CONFIRMED~~ ✅ FIXED

> **Resolved** in `5f99765`: the hit counter is now a child of the banner `Panel`, laid out below the "Somewhere" label by the panel's flex column, and the duplicate non-outline "Somewhere." label was deleted. Scope was limited to the overlap; repositioning the whole panel off (0,0) was intentionally deferred.

`source/game/mainScreen.ts:347` — `bannerPanel` and `hitCounter` are added as siblings to `screen.ui`, but `UiRoot.view` is a plain `pixi.Container` with no `layout` (`UiRoot.ts:44`), as is `GameScreen.view` — the @pixi/layout chain from `Game.view` is broken. Neither child has position/margin layout options or assigned x/y, and `onResize` is empty. The "Wall hits" counter draws on top of the banner panel's top-left corner, pinned to the screen corner at every window size.

**Fix:** give the UI root a layout (or position the two views explicitly in `onResize`).

### ~~4. TextInput DOM container is always `document.body` — CONFIRMED~~ ⏭️ WON'T FIX (deferred)

> **Deferred** (2026-07-05): intentionally skipped for now at the maintainer's discretion.

`source/game/mainScreen.ts:182` (and 289) — `container: game.app.canvas.parentElement ?? document.body` is evaluated in `onAdd`, which runs synchronously during `addScreen()` in `_index.tsx:36`, before `setGame()` re-renders and the `Renderer` effect appends the canvas (`Game.addRef`, `Game.ts:333`). `canvas.parentElement` is therefore always null. `TextInput` captures `#container` at construction (`TextInput.ts:71`) and uses it to append and position its hidden DOM input (lines 209, 358) — on any page where the canvas container is offset or scrolled, the input and the mobile IME focus target land at wrong viewport coordinates, and the inputs live outside the React root, surviving unmount.

**Fix:** resolve the container lazily (at `startEditing` time) or pass it after mount.

### ~~5. Disabled Toggle stays interactive and swallows taps — CONFIRMED~~ ✅ FIXED

> **Resolved** in this commit: `Toggle.disable()`/`enable()` now flip `view.eventMode` between `'none'` and `'static'` and the `pointertap` handler guards on `#state !== 'disabled'`, mirroring `Button`. A disabled toggle no longer swallows taps; regression covered in `tests/Toggle.test.ts`.

`source/engine/ui/Toggle.ts:146` — `disable()` only sets state and cursor; `view.eventMode` stays `'static'` (line 54), unlike `Button.ts:216` and `TextInput.ts:402` which set `eventMode = 'none'`. The `pointertap` handler (Toggle.ts:81–84) has no disabled guard and unconditionally calls `stopPropagation()`, so taps on a disabled Toggle are swallowed — they neither fall through to elements beneath nor reach UiRoot's tap handlers — and hover events keep firing on a control reporting `isDisabled = true`.

**Fix:** mirror Button: set `eventMode = 'none'` in `disable()` / restore in `enable()`.

### ~~6. Component-lifetime global pointerdown listeners, never destroyed — CONFIRMED~~ ✅ FIXED (partial — leak only)

> **Resolved** in this commit (Option B — minimal): the window `pointerdown` listener now attaches in `TextInput.startEditing()` and detaches in `stopEditing()`, so at most one exists and only while editing; idle inputs and hidden screens hold no app-wide listeners. `startEditing()` clears `#isOwnPointerDown` so the first outside tap isn't mistaken for the opening tap. The fragile federated-vs-window ordering coupling was left as-is (the more invasive "Option A" centralization at UiRoot was deliberately deferred).

`source/engine/ui/TextInput.ts:276` — each TextInput adds a `globalThis` pointerdown listener in its constructor, removed only by `destroy()` (278–280, 409). `GameScreen.hide()` only clears focus, and `mainScreen` never destroys `demoInput`/`delayInput`, so N inputs mean N window listeners firing on every tap app-wide, including from hidden screens. The "keep editing on in-field taps" fix depends on Pixi's federated pointerdown (135–139) setting `#isOwnPointerDown` before the window listener runs — a fragile ordering coupling.

**Fix:** one outside-tap owner at the UiRoot/Game level (which already has a global pointerdown listener for focus) tracking the single active editor; removes both the leak and the ordering coupling.

### ~~7. `pixi.js` semver range drifts from the pinned patch — PLAUSIBLE~~ ✅ FIXED

> **Resolved** in this commit: pinned via npm `overrides` in the root `package.json` (`"overrides": {"pixi.js": "8.16.0"}`) — the caret range `^8.15.0` in `apps/somewhere/package.json` is kept as-is, per the chosen option B. Overrides are only honored in the workspace root, and a fresh-resolve test confirmed they force exactly 8.16.0 where `^8.15.0` alone would drift to 8.19.0, so lockfile regeneration (e.g. Renovate's `rangeStrategy: "bump"`) can no longer desync the version from the patch. Upstream check: the fix is NOT in any pixi.js release up to 8.19.0 — it lives in stalled open PR pixijs/pixijs#11665 (issue #10791) — so `patches/pixi.js+8.16.0.patch` must stay and the pin guards it.

`package.json:38` (apps/somewhere) — declares `"pixi.js": "^8.15.0"` while the patch is `patches/pixi.js+8.16.0.patch`; only the lockfile (8.16.0) keeps them aligned. The Dockerfile does run `npx patch-package` after `npm ci --ignore-scripts`, so today's deploy is patched — the hazard is any future `npm update`/lockfile regeneration resolving 8.16.1+: patch-package then fails the build, or on a soft mismatch silently ships an unpatched bitmap-text pipe, vertically misaligning all Button/TextInput/Text labels.

**Fix:** pin `pixi.js` to exactly `8.16.0`.

### ~~8. `hideScreen` leaves `currentScreen` stale; re-show is impossible — PLAUSIBLE~~ ✅ FIXED

> **Resolved** in this commit (Option A — both parts): `Game.hideScreen()` now clears `currentScreen` — conditionally (`if (this.currentScreen === screen)`), because the loading screen is also hidden via `hideScreen` mid-transition but is never `currentScreen`, and an unconditional clear would wrongly null the real current screen. `GameScreen.hide()` is now idempotent via a private `#isShown` flag (set in `show()`, cleared in `hide()`): a double hide or a hide before any show is a no-op, protecting `onHide` side effects like `mainScreen`'s unconditional `world.stop()` from double invocation; `show()` was deliberately left unguarded to preserve the resume semantics. The now-redundant explicit `currentScreen = null` in `showScreen`'s internal transition path was removed. Regression tests: external `hideScreen(currentScreen)` clears the pointer and the same screen re-shows (no silent early-return); hiding the loading screen leaves `currentScreen` intact; double `hide()` runs `onHide` exactly once; `hide()` before `show()` is a no-op; `show()` after `hide()` re-arms `hide()`.

`source/engine/app/Game.ts:412` — `showScreen` early-returns when `currentScreen === screen`, but public `hideScreen()` (455–465) never clears `currentScreen`. After an external `hideScreen(currentScreen)`: re-showing the same screen hits the early return (permanently blank stage, no error); showing a different screen re-hides the hidden one (419), where `GameScreen.hide` has no double-hide guard and `mainScreen.onHide` calls `world.stop()` unconditionally, which throws `'World is not running!'` (`World.ts:57`). No current caller invokes `hideScreen` externally — a latent trap in new public API.

**Fix:** clear `currentScreen` in `hideScreen()` (and guard double-hide).

### ~~9. Loading screen show (incl. 200ms sleep) serializes ahead of asset loads — CONFIRMED~~ ✅ FIXED

> **Resolved** in this commit: `showScreen` now starts the bundle fetch before showing the loading screen and awaits both via `Promise.all`, so the fetch overlaps the show instead of waiting behind it (the error guarantees from the issue-2 fix are preserved: the `finally` still always hides the loading screen with its own hide error swallowed, a `loadBundle` rejection still propagates, and the transition stays retriable). `init()` now parallelizes `app.init` with the `Assets.init` → `loadBundle('default')` chain, with `TextureSource.defaultOptions.scaleMode = 'nearest'` moved ahead of the Assets chain (it must be set before any texture load or textures silently load linear-filtered); the renderer-dependent stage/view setup stays chained on `app.init` alone. The vestigial 200ms spinner delay in `loadingScreen.ts` was deleted outright (option C-i — the spinner it served is commented out). Overlapping is safe because the loading screen's own font (monogram) comes from the always-preloaded `default` bundle, so its rendering never depends on the bundle being fetched. Regression tests in `tests/Game.test.ts` pin the showScreen overlap, the init overlap, and the scaleMode-before-load ordering.

`source/engine/app/Game.ts:431` — `showScreen` awaits `loadingScreen.show()` — whose `onShow` ends in an unconditional 200ms `setTimeout` (`loadingScreen.ts:35–37`) — before `Assets.loadBundle` starts (435), adding 200ms+ dead time to every asset-gated transition. `Game.init` similarly serializes `app.init` → `Assets.init` → `loadBundle(['default'])` (82, 98, 109), delaying the ~20-file default bundle fetch behind renderer init. Verified safe to overlap; one caveat: `TextureSource.defaultOptions.scaleMode = 'nearest'` (line 96) must move before any asset loading starts.

**Fix:** start the load first, then show the loading screen, then await both; parallelize `app.init` with `Assets.init().then(() => loadBundle)`.

### ~~10. Collision scans the full tile grid twice per entity per frame — CONFIRMED~~ ⏭️ WON'T FIX (deferred)

> **Deferred** (2026-07-11): the collision/motion logic is an unfinished feature and will be reworked later; a self-contained TODO comment was added in this commit at the top of the axis passes in `motionSystem.ts`, capturing the swept-range fix, the shared `sweepAxis` extraction, and the behavioral constraints to preserve (X-before-Y order, strict overlap test, first-hit `contactTile` order, boundingBox-fits-cell invariant). Analysis note: the real map is 40×40 (3,200 checks per moving entity per frame, only 8 solid tiles) and effectively only the player moves, so the waste is real but not currently user-visible.

`source/game/motionSystem.ts:49` (and 92) — both the X and Y passes run `for (column…) for (row…)` over the entire map per moving entity, inside `onUpdate`. A 100×100 map is 20,000 tile checks per entity per frame at 60fps, nearly all on tiles with no `boundingBox`. The two passes are also ~40-line near-identical copies. Tiles are grid-aligned and `layer.tiles` is an indexed 2D array (`Map.ts:14`, 74–75), so the swept-box column/row range reduces each pass to a handful of tiles. Note: the inline overlap test is deliberately strict, unlike `utilities/doRectanglesIntersect.ts` (touching edges count), so reuse needs a strict option, not a drop-in call.

**Fix:** index the swept range; extract a shared `sweepAxis` helper.

### ~~11. State-background machinery copy-pasted across Button/Toggle/TextInput — CONFIRMED~~ ✅ FIXED

> **Resolved** in this commit (Option A — free functions): the four verbatim blocks are extracted as module-level helpers in `engine/ui` — `swapBackground(view, previous, next)`, `attachHitArea(view)` (which now owns the single copy of the stale-transform hit-test comment), `attachHoverHandlers(view, getState, setState)`, and `adoptDetachedBackgrounds(disposables, backgrounds)`. Toggle's drift was normalized: its destroy bookkeeping now uses the same `adopt`-style disposer as Button/TextInput and registers the per-background disposers before the `view.destroy` defer (Toggle keeps its own `flatMap` over its checked/unchecked matrix). The genuinely divergent machinery deliberately stays per-widget (YAGNI): the `previous === next` state-lookup heads (Button/TextInput index by state, Toggle reads `view.background`), `disable()`/`enable()` (cursor and `stopEditing()` differ), and Button/Toggle's `pointertap` vs TextInput's `pointerdown`/`pointerup`. No base class was introduced, keeping Button's inheritance slot free for issue 12.

`source/engine/ui/Button.ts:249` — the 4-line background swap is verbatim identical in Button.ts:249–252, Toggle.ts:193–196, TextInput.ts:422–425; likewise the hitArea + `'layout'` listener blocks (Button.ts:84–89, Toggle.ts:58–63, TextInput.ts:103–108), the guarded hover handlers, and the detached-background destroy bookkeeping. Toggle.ts:92 has already drifted (`disposables.defer` vs `adopt`). Any fix to the swap or the stale-transform hit-test workaround must be applied three times; the next stateful widget must copy four interacting guards correctly.

**Fix:** shared `swapBackground`/`attachHitAreaSync` helpers or a common stateful-widget base in `engine/ui`.

### ~~12. UiParent child bookkeeping duplicated four times — CONFIRMED~~ ⏭️ WON'T FIX

> **Won't fix** (2026-07-11): judged a non-issue at the maintainer's discretion — classic YAGNI over abstraction. The duplication is real but small (three byte-identical 30-line add/remove/destroy triads in `Container`/`Panel`/`Button`, plus a deviated copy in `UiRoot` whose focus-ring and stale-focus differences are pinned by tests), concentrated in trivial bookkeeping, and `UiRoot.removeChild` is about to change under issues 17/18 anyway. Deduplication machinery (shared helpers with UiRoot-only hooks, or the engine's first base class) would cost more than the ~60 duplicated lines it removes.

`source/engine/ui/Container.ts:30` — `addChild`/`removeChild` and the destroy loop appear verbatim in Container.ts:30–61, Panel.ts:32–63, Button.ts:153–184, and near-verbatim in UiRoot.ts:116–144 + 262–270. UiRoot's two deviations (focus ring kept topmost via `addChildAt`, stale-focus revalidation after removal) are hookable extensions.

**Fix:** a shared UiParent base/mixin with attach and post-remove hooks.

### ~~13. Spark popups allocate 8 AnimatedSprites each and bypass ObjectPool — CONFIRMED~~ ⏭️ WON'T FIX (deferred)

> **Deferred** (2026-07-11): part of the same unfinished collision/popup feature as issue 10 (this system is the direct consumer of `WallHit`) and will be reworked with it; a self-contained TODO was added in this commit above `SPARK_SPRITE_NAMES` in `wallHitPopupSystem.ts`, capturing the intended fix (graphicsSystem missing-animation fallback + `Sprite.show()` guard, single-sprite popup, optional pooling with its deferred-removal pitfalls). Analysis notes: the perf half is negligible today — `WallHit` is edge-triggered, one event per contact episode — the real defect is the render-API trap forcing every future non-character visual to fake all 8 character animation names or crash.

`source/game/wallHitPopupSystem.ts:62` — every wall hit builds a fresh Entity whose Sprite constructs one `pixi.AnimatedSprite` per name in `SPARK_SPRITE_NAMES` (8), with `spark.json` duplicating the same 16×16 frame under all 8 directional keys — solely because `graphicsSystem` hardcodes character animation names. The popup's velocity is always `(0,0)`, so only `'standing-right'` is ever shown; 7 of 8 sprites are pure waste, re-created per hit and destroyed 400ms later, while `playerPool`/`mapPool` already demonstrate ObjectPool recycling. `Sprite.show()` with an unregistered name crashes (`Sprite.ts:52–55`), so every future non-character visual must repeat the 8-fake-names trick.

**Fix:** missing-animation fallback (or opt-in directional mode) in graphicsSystem; pool the popups.

### 14. EntityQuery duplicates System; World keeps a parallel registry — PLAUSIBLE

`source/engine/ecs/EntityQuery.ts:14` — EntityQuery.ts:44–88 is System.ts:109–166 minus the callbacks, and World mirrors the whole registry (`addEntityQuery`/`removeEntityQuery` at World.ts:156–204 vs `addSystem`/`removeSystem` at 106–154) with duplicate membership loops in `addEntity` (247–257), `removeEntity` (275–285), and `stop` (85–91) — ~90 duplicated lines. Merge caveat: queries currently sync before all systems, and `graphicsSystem.onAddEntity` reads `levelQuery.getFirst()` — pin query registration order or document the invariant.

**Fix:** `EntityQuery extends System` (a System without `onUpdate` is already inert), registered via `addSystem`.

### 15. `destroy()` contradicts its documented StrictMode contract — PLAUSIBLE

`source/engine/app/Game.ts:372` — `destroy()` sets `#isDestroyed`, making `init()` permanently no-op (line 78), while the docstring (357–361) promises screens are reused across a "dev StrictMode init→destroy→init cycle" — which can never happen. `destroy()` also never hides `currentScreen` or stops the world, so a hypothetical re-show would throw `'World is already running!'`. No production caller today; the docstring also calls Game a process-lifetime singleton.

**Fix:** make init restartable after destroy, or fix the docstring and have `destroy()` hide the current screen.

### 16. `on`/`once`/`off` silently no-op outside the running window — PLAUSIBLE

`source/engine/app/Game.ts:139` (also 152, 165) — `if (!this.#isRunning) return this;` silently drops any subscription made before `init()` resolves and any `off()` after `destroy()`; the old Game forwarded unconditionally, and `this.view` exists from the constructor so pre-init subscriptions would work fine. Current callers (playerSystem.ts:32, 36) provably run post-init — latent API hazard only.

**Fix:** drop the guard on on/once/off, or throw instead of silently ignoring.

### 17. Focus scopes survive removal of their subtree — PLAUSIBLE

`source/engine/ui/UiRoot.ts:139` — `removeChild` revalidates `#focused` but never touches `#scopes`; `#collectFocusables` walks from `#scopes.at(-1)?.root` (366) pruning only on `view.visible` (351). Removing a scoped dialog without `popFocusScope` leaves its detached-but-visible subtree focusable: Tab cycles invisible components, Enter fires the dismissed dialog's handlers. No in-repo `pushFocusScope` caller yet; screen teardown's `clearFocus()` empties scopes.

**Fix:** `removeChild` should pop/invalidate scopes rooted in the removed subtree.

### 18. Destroyed-but-childed views crash the focus walk — PLAUSIBLE

`source/engine/ui/UiRoot.ts:343` — `#collectFocusables` prunes only on `view.visible`; empirically (installed pixi v8) a destroyed Container still reports `visible: true` while `getBounds()` throws `TypeError`. A component destroyed without `UiRoot.removeChild` first is walked and crashes in `#nearestInDirection`/`#nearestTopLeft` (376, 393, 403) on the next Tab/arrow press; the `destroyed` guard at line 236 protects only the focus-ring render path. All current call sites obey the unwritten remove-then-destroy order (mainScreen.ts:234–235, 362–363).

**Fix:** prune `view.destroyed` in `#collectFocusables`, or have component `destroy()` notify the UiRoot.

---

## Refuted candidates (for the record)

- **`Vector.normalize()` now mutates in place** — deliberate, consistent API style (`set`/`add`/`subtract`/… all return `this`, `clone()` provided), pinned by `tests/Vector.test.ts:205`, and no caller relies on the old copy-returning contract.
- **World's single FIFO change queue alters add/remove ordering** — intentional (commit "Replay deferred world changes in call order"), pinned by `tests/World.test.ts:439/468`, and no in-repo system pair removes-then-re-adds the same instance within one frame.
- **`playerPool.onReset` leaks `isTouchingWall`** — the omission is real but provably unobservable: respawn geometry (8px max first-frame travel vs 8px gap to the nearest wall collision box, strict overlap test) means the first moving frame can never be a contact frame, and that frame unconditionally clears the stale flag (`motionSystem.ts:140`). Worth a one-line hygiene reset at most.

## Unverified side note

~~`scripts/generate-spark-assets.mjs` hand-rolls a full PNG encoder (~60 lines of CRC32/chunk/IDAT) that duplicates `fast-png`'s `encode()`, which its two sibling scripts import — and `fast-png` is not declared in any package.json, so those sibling scripts cannot run as committed. (Untracked dev scripts; not part of the verified findings.)~~

> **Stale** (2026-07-11): the file no longer exists — no `scripts/` directory, no `generate-spark*` file, and no `fast-png` reference anywhere in the repo. Nothing to act on.
