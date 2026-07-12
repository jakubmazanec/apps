# Game UI Design — Main Menu, Game Screen, Pause Overlay

**Date:** 2026-07-12
**Status:** All sections resolved — awaiting final review before implementation planning.

## Context

The app currently boots into a single `mainScreen` that shows the running ECS world (tilemap + click-to-move character) together with a temporary widget showcase (toggles, text input, reminder-dialog demo). The "New game" button is an explicit placeholder awaiting a real game screen (`source/game/mainScreen.ts`).

This design restructures the UI into a conventional game flow: a **main menu screen**, a **game screen** (the existing world), and a **pause overlay** that freezes the game. All UI is Pixi-canvas-only (React is just the mount shell); no DOM/React UI.

Relevant engine facts (from exploration, 2026-07-12):

- Screens are full hide→show swaps via `Game.showScreen()`; no screen stacking exists (only the loading-screen overlap).
- No pause mechanism exists anywhere: `World.update` ignores `#isRunning`, both scheduler layers consume `deltaMS` directly, Pixi `AnimatedSprite`s play on Pixi's own clock, and input listeners stay live (documented in `docs/engine-review-2026-07-04.md`).
- No modal/dialog primitive, scrim, or full-screen input blocker exists. `UiRoot.pushFocusScope()`/`popFocusScope()` exist for exactly this purpose but are unused, with a known scope-removal gap deferred "until its first real consumer (modal dialogs)" (`source/engine/ui/UiRoot.ts`).

## Design sections

1. Screen flow & lifecycle — **Resolved**
2. Main menu screen — **Resolved**
3. Pause mechanics (engine) — **Resolved**
4. Modal/overlay primitive + pause menu UI — **Resolved**
5. Options — **Resolved**
6. Fate of the demo showcase — **Resolved**
7. Testing — **Resolved**

---

## 1. Screen flow & lifecycle (Resolved)

**Flow:**

- Boot: `game.init()` → **main menu screen** (replaces booting into `mainScreen`). No loading screen at boot — the menu's only bundle (`default`) is loaded by `init()` itself; the loading screen appears on New Game if the `game` bundle's background load hasn't finished.
- **New Game** → `game.showScreen(gameScreen)`. The game screen's `onShow` attaches the world and calls `world.start()` (as `mainScreen.onShow` does today).
- **Quit to menu** (from the pause overlay) → `game.showScreen(mainMenuScreen)`; hiding the game screen triggers its `onHide`, which performs the full teardown — `world.stop()` + detach from view/ticker (as `mainScreen.onHide` does today). Details in section 4.

**Decisions:**

- **Runs are ephemeral.** Quitting to the menu discards the run; the menu offers no Continue item. Every New Game is a fresh `world.start()`. Rationale: matches the existing `World` start/stop design; a Continue feature can be layered on later without redesign.
- **Screen transitions are instant swaps.** No changes to `Game.showScreen`; no fade/crossfade machinery in v1.
- **The pause overlay is not a screen.** It is a modal layer inside the game screen, so no screen-stacking machinery is needed. Pausing never triggers `showScreen`.
- **Pause is opened one way:** an **on-screen button in a corner** of the game screen. There is no Escape-key handling in v1 (dropped — it required a new screen-scoped keydown mechanism that isn't worth it); keyboard users reach the button through the focus system (Tab/arrows + Enter), and close via the Resume button, which holds initial focus.
- **Screen split.** The current `mainScreen` is dismantled into two new screens: `mainMenuScreen` and `gameScreen`. What happens to its demo-showcase widgets is decided in section 6.
- **All screens are registered in one place.** Screens are static for the rest of the game process, so `routes/_index.tsx` imports all three and registers them at boot — `addLoadingScreen(loadingScreen)`, `addScreen(mainMenuScreen)`, `addScreen(gameScreen)` — before `showScreen(mainMenuScreen)`. This matters because `Game.showScreen` silently no-ops on unregistered screens. The `mainMenuScreen` ↔ `gameScreen` static import cycle (New Game and Quit-to-menu handlers reference each other's screen) is accepted and documented with a comment at the import site: it is safe because each module reads the other's binding only inside event handlers, long after module evaluation.

---

## 2. Main menu screen (Resolved)

A new `mainMenuScreen` (`source/game/mainMenuScreen.ts`), shown right after boot.

**Menu items:** **New Game** and **Options** — nothing else in v1. New Game calls `game.showScreen(gameScreen)`. Options behavior is decided in section 5. No Quit item (browser game; there is nothing meaningful for it to do). No Continue item (runs are ephemeral, section 1).

**Composition:**

- Solid background — the app's existing black (`Game` init background); no world running behind the menu, no static artwork. Uses only assets that already exist.
- A centered banner `Panel` (existing banner nine-slice), column flex layout: game title `Text` ("Somewhere", `monogram-outline`, size 48), then a vertical stack of `Button`s (New Game, Options).
- Centering via flex layout on the screen root (`width/height: 100%`, centered), the same pattern `loadingScreen` uses — no manual positioning, so window resize is handled for free by the existing root-layout resize path.

**Assets:** only the `default` bundle is declared (`assetBundles: ['default']`); the `game` bundle is needed first by the game screen, and `Game.showScreen` already shows the loading screen for any not-yet-loaded bundle when New Game is pressed.

**Input:** the existing focus system covers keyboard for free (arrows/Tab to move, Enter/Space to activate); initial focus lands on New Game via the focus walk's nearest-top-left rule. Pointer clicks work via the widgets' own handlers. Focus ring configured as on the current `mainScreen`.

**Strings** stay hardcoded literals (consistent with the codebase; no i18n exists).

## 3. Pause mechanics — engine (Resolved)

**Design axiom: pausing the world means exactly one thing — a guard in `World.update()`.** If the world is paused, `update()` doesn't propagate. Everything that animates or advances must be driven by `world.update()`, so the guard freezes it inherently. There are no pause hooks and no per-object pause APIs; anything that would need them is instead moved onto the world's update path.

**Approach: explicit `world.pause()` / `world.resume()`** — chosen over ticker-detach (leaves pause state implicit, needs a detach-update-only mechanism) and a `timeScale` indirection (more general than v1 needs).

**`World` changes (`source/engine/ecs/World.ts`):**

- New `#isPaused` flag, `pause()`, `resume()`, and an `isPaused` getter. `World.update` returns early while paused: no system updates, no pending-change flush, no event-channel swaps. The early return is the **first statement** of `update()` — before `#isUpdating` is set — so a paused frame leaves no updating flag behind and entity adds/removals while paused keep taking their synchronous path (a return after the flag would wedge the world: deferred changes forever, `stop()` throwing). The world stays attached to the ticker, so its view keeps rendering the frozen frame behind the pause overlay.
- Guards: `pause()` requires running-and-unpaused, `resume()` requires paused. `stop()` remains callable while paused (the quit-to-menu flow stops a paused world) and resets the paused flag so the next `start()` begins unpaused.

**What freezes — everything, by construction:** all registered systems (currently 10), ECS timers/tweens (`timerSystem`/`tweenSystem` just don't run), and event-channel swaps (events pushed before pause stay buffered and deliver on the first resumed frame).

**Prerequisite — animations become world-driven:** `AnimatedSprite`s currently play on Pixi's shared ticker, autonomously, outside `world.update()` — a violation of the axiom, removed as part of this work:

- The engine `Sprite` wrapper constructs its `AnimatedSprite`s with `autoUpdate: false`; `graphicsSystem` — which already iterates every entity it owns each frame — advances the current sprite's animation in its `onUpdate` (`sprite.view.update(ticker)`).
- `Map` constructs its animated tile sprites with `autoUpdate: false`, collects them into an internal array at construction, and exposes an advance method (`map.update(ticker)`-style) that `mapSystem` calls each frame.
- Consequence beyond pause: animations now advance on world time uniformly — they also hold whenever the world isn't updating at all (invisible today, since the map and player are destroyed on `world.stop()`), and this is the substrate future `timeScale` work would want anyway.

**What deliberately keeps running:** the screen-level `GameScreen.scheduler`, which drives UI animations (the pause overlay's own fade needs it). Design rule going forward: gameplay timing must live in ECS timers/tweens, never on the screen scheduler.

**Input while paused:** click-to-move is blocked for free — the overlay's full-screen scrim is a UI element, and `UiRoot` already stops `pointertap` bubbling from UI to the game view, so the `playerSystem` handler never fires. Focus-key navigation keeps working (needed to operate the pause menu).

**Deferred (explicitly out of v1):** auto-pause on `visibilitychange` (the documented backgrounded-tab simulation jump stays as-is), and any `timeScale` support.

## 4. Modal/overlay primitive + pause menu UI (Resolved)

### Engine `Modal` primitive (`source/engine/ui/Modal.ts`)

A reusable modal, the engine-review's planned "modal/dialog primitive on top of the existing focus scopes"; the pause menu is its first consumer.

**Shape:** a flat widget in the existing `Container`/`Panel` idiom — `implements UiParent` (public `children` + `view`), no inheritance. The caller designs both the content (any `UiChild`, e.g. a banner `Panel`) and its **placement**: the `layout` option is passed through verbatim, exactly as `Container` does (a centered pause menu passes `{justifyContent: 'center', alignItems: 'center'}`; the primitive has no placement opinion). Options: `{children?, layout?, scrimAlpha?}` (default 0.5) plus `scheduler?` + `fadeDuration?` (both or neither — enables the fade) and `initialFocus?: Focusable`.

- **Scrim:** a full-screen `pixi.Graphics` black rectangle (~50% alpha — no art asset needed), a raw pixi child of the modal's view *behind* the layout children and deliberately **not** in `children`, so the focus walk never sees it. It sits out-of-flow (no `layout` of its own) at (0,0) — the same mixed layout/non-layout child behavior `loadingScreen`'s view already exercises (its non-layout `ui.view` sits untouched inside a flex view).
- **`open(ui)`:** the target `UiRoot` is a parameter of `open`, not the constructor (a modal is opened *into* a ui root). It adds the modal as the **last** UI child — above the HUD by insertion order, while `UiRoot.addChild` keeps the focus-ring overlay topmost, so the ring stays visible above the scrim. It then pushes the focus scope (scope root = the modal itself) and, if `initialFocus` was given, applies it via `ui.focus()` (programmatic — no ring shown). There is no "first focusable" auto-focus: `UiRoot` exposes no such lookup, and when `initialFocus` is omitted nothing is focused — same as screens, where focus appears on the first focus command. The pause menu passes its Resume button.
- **`resize(width, height)`:** dumb plumbing — sets the root view's layout width/height (giving the caller's `layout` something to resolve against) and redraws the scrim rectangle. The owning screen calls it once right after `open()` and again from its `onResize`; the modal never reads screen dimensions itself.
- **Ordering rule (close-completion and `destroy()`):** pop the focus scope **before** `ui.removeChild(modal)` — after the scope-invalidation fix below, removing first would drop the scope as stale and silently lose the `previousFocus` restoration that the Options flow (section 5) depends on.
- **Input blocking:** the scrim is interactive, so every pointer event lands on UI; `UiRoot` already stops taps on UI from reaching the game view, which blocks click-to-move for free (section 3).
- **Focus trapping:** the scope is pushed in `open()` (keys are trapped for the whole visible life of the modal, fades included) and popped when a close **completes** (not at close-start), restoring the previously focused widget. Deferring the pop keeps reopen-during-`closing` trivial — the scope and the focused widget are simply still there — and stops focus escaping to underlying UI while the scrim still blocks pointer input. Tab/arrow navigation is therefore confined to the modal while it is visible.
- **Required bug fix:** `UiRoot.removeChild` revalidates focus but never invalidates `#scopes`, so removing a scoped subtree without popping leaves detached widgets focusable (the gap deferred in commit `f7c928d` "until its first real consumer"). Fix: **lazy self-heal at the focus choke point** — before walking, `#collectFocusables` prunes from the **top** of `#scopes` every scope whose root view is `destroyed` or no longer attached under the ui root's view (checked via the pixi `view.parent` chain; component-level parent pointers don't exist), restoring the last-pruned scope's `previousFocus` if still collectible, mirroring `popFocusScope`. Dead scopes below a live top scope wait until they surface. This one check covers direct removal, deep removal (e.g. via `Panel.removeChild`), and plain `destroy()`; staleness between the mutation and the next focus command is unobservable (nothing reads the stack in between). The Modal pops its scope properly in all designed flows — this fix is the safety net for out-of-band removals.
- **Animation & state machine:** optional fade-in/out driven by the screen `Scheduler` (which deliberately keeps running while the world is paused), following the existing reminder-dialog tween precedent. A fading modal has four states: `closed → opening → open → closing → closed`. Toggling against an in-flight fade never reverses a tween (tweens don't support reversal): the modal **cancels** the running tween via the cancel handle `Scheduler.tween()` returns and starts a **new** tween toward the new endpoint — `Tween` captures its from-values from the target's current state at construction, so the replacement picks up from the current alpha with no visual jump. The only reachable mid-fade input is a close during `opening` (the modal's own buttons are clickable while it fades in); a reopen during `closing` cannot happen — every open trigger sits under the scrim until the close completes and the modal is removed. `open()` therefore strictly requires state `closed`, and per-open construction has no exceptions. `openModal` stays set until a close completes or `destroy()` runs.
- **Creation lifecycle:** a `Modal` is constructed **per open** (the pattern the reminder dialogs use today), by whatever handler opens it; the owning screen's state tracks the currently open instance (`openModal: Modal | null`). Nothing modal-related is built in `onAdd`, so re-showing the screen never meets a stale or destroyed modal.
- **`close()` vs `destroy()`:** `close()` is the user-facing path — enters `closing`, runs the optional fade-out, and on completion pops the focus scope, removes and destroys the views, and clears `openModal`. `destroy()` is the teardown path — cancels any in-flight tween, pops the scope if one is still pushed (tolerant of an already-empty stack), and synchronously removes + destroys, callable from any state. Reentrancy is defined by the state machine: `open()` is a no-op unless `closed`; `close()` is a no-op while `closing` or `closed`.
- **Lifecycle safety:** the owning screen's `onHide` calls `destroy()` only, never the animated `close()`. Rationale: `GameScreen.hide()` runs `ui.clearFocus()` (which wipes the focus-scope stack — the scope pop inside teardown is then a benign no-op, not a bug) and the deferred `scheduler.clear()` **before** `onHide`, so a fade scheduled from `onHide` would survive the clear, freeze when the screen leaves the ticker, and resume against destroyed views on the next show.

### Pause menu (game screen)

- **Content:** banner `Panel` with a "Paused" title `Text` and two `Button`s: **Resume** and **Quit to menu**. Initial focus on Resume (passed as the modal's `initialFocus`).
- **Open path:** a **pause `Button` in the top-right corner** of the game screen (text label, e.g. "Pause" — no icon asset exists yet; art can replace it later) — the only trigger; no Escape-key handling exists in v1. While the modal is open (fades included) the corner button sits under the scrim and is unreachable, so a reopen during `closing` is impossible by construction.
- **Behavior:**
  - Open (corner button): `world.pause()` then `modal.open()`.
  - **Resume:** `modal.close()` then `world.resume()` — the world unfreezes at close-**start**, behind the fading scrim, not after the fade completes. Clicking Resume during the fade-in is the one mid-animation input still reachable: `close()` from `opening` cancels the fade-in tween and replaces it (state machine above).
  - **Quit to menu:** `game.showScreen(mainMenuScreen)`; the game screen's `onHide` destroys the modal (synchronous `destroy()`, never the animated `close()` — see Lifecycle safety above) and does the world teardown (`world.stop()` works on a paused world and resets the paused flag, section 3).

## 5. Options (Resolved)

Options opens a **`Modal`** (the primitive's second consumer) from the main menu; the pause menu deliberately has no Options item (section 4). The content is constructed per open (section 4), so the widgets read the current `settings` values at build time — no re-sync code exists or is needed. No `initialFocus` is passed: nothing is focused on open, and the first focus command lands on a widget via the normal focus walk.

**Content:** an "Options" title `Text`, then two labeled rows and a close action:

- **Player name** — a `TextInput` (the existing widget) constructed with `value: settings.playerName`; its hidden-DOM-input host is `container: game.app.canvas.parentElement ?? document.body`, which under per-open construction is evaluated on the Options click — after the canvas is mounted — so it resolves correctly (healing the always-`document.body` issue deferred in the 2026-07-03 code review). Writes `settings.playerName` on change.
- **Sound** — a single on/off `Toggle` constructed with `checked: settings.soundEnabled`, writing `settings.soundEnabled`. **No-op for now**: nothing consumes the value until a sound system exists (none does today; the engine review lists audio as missing).
- **Close** — a `Button` that closes the modal (focus returns to the Options menu item via the focus-scope pop). Escape-to-close for modals is deferred; no Escape handling exists anywhere in v1.

**Settings storage:** a new tiny module `source/game/settings.ts`: `export const settings = {playerName: '', soundEnabled: true};` — a plain mutable object, no getter/setter ceremony. **In-memory only** — values reset on reload; the module carries a comment marking localStorage persistence as the intended future upgrade. **Consumers:** `soundEnabled` has none (no-op until a sound system exists); `playerName` is displayed on the game screen's HUD (section 6) — read in the screen's `onShow`, which is always fresh, since Options is reachable only from the main menu and runs are ephemeral, so the name cannot change mid-run. The hardcoded entity name in `playerPool` stays untouched.

## 6. Fate of the demo showcase (Resolved)

The current `mainScreen` is dismantled; every showcase piece either gets a real home or is deleted:

- **Title "Somewhere"** → moves to the main menu (section 2).
- **Wall-hit counter** → survives as a small HUD `Text` in the top-left corner of the game screen (the pause button takes the top-right), subscribed to `'world:wallHit'` exactly as today. It stays the live consumer of the ECS→UI bridge (`uiBridge` system + `wallHitChannel`), so that path keeps a real user.
- **Name `TextInput`** → becomes the player-name setting in Options (section 5).
- **Player-name HUD label** (new) → a small `Text` in the top-left area of the game screen alongside the wall-hit counter, showing `settings.playerName`; its text is set in `onShow` (an empty name renders an empty label).
- **"Sound" `Toggle`** → becomes the sound setting in Options (section 5).
- **"Enable sound" meta-toggle** (existed only to demonstrate the disabled widget state) → deleted; disabled-state coverage lives in the widget unit tests.
- **Reminder-dialog demo** (delay input + scheduled fading dialog) → deleted; the `Modal` primitive supersedes the pattern it demonstrated.
- **`mainScreen.ts` itself** → deleted once `mainMenuScreen` and `gameScreen` exist; `routes/_index.tsx` boots into `mainMenuScreen` and registers all screens in one place (section 1). The deletion and the `_index.tsx` import flip happen in the **same task**, so the app boots at every intermediate commit of the plan.

**`gameScreen` construction** (`source/game/gameScreen.ts`): `assetBundles: ['default', 'game']` as today's `mainScreen` (`default` for the HUD/pause-menu widgets, `game` for world assets — this is what makes New Game show the loading screen on a cold `game` bundle); the same `focusRing` object as the current `mainScreen` (required for visible keyboard navigation inside the pause modal); `events: uiEvents` (the wall-hit subscription); state `{hitCounter: Text, nameLabel: Text, pauseButton: Button, openModal: Modal | null}` — the pieces `onShow`/`onHide` and the pause handlers reference.

## 7. Testing (Resolved)

Vitest unit tests following the existing patterns in `tests/`. Implementation follows the **Red-Green TDD workflow**: for each behavior, first write a failing test and run it to confirm it fails for the expected reason (red), then write the minimal implementation to make it pass (green), then refactor with the test staying green. No implementation code is written before its failing test exists.

Coverage:

- **`World` pause/resume:** systems don't update and channels don't swap while paused; events pushed before pause deliver on the first resumed frame; `pause()`/`resume()` guards throw appropriately; `stop()` on a paused world works and resets the flag; after a paused `update()` call, `addEntity`/`removeEntity` apply synchronously and `stop()` doesn't throw (forces the guard before `#isUpdating`).
- **`UiRoot` scope invalidation:** after removing or destroying a subtree containing the active focus scope, the **next focus command** prunes that scope and restores its `previousFocus` if still collectible (lazy self-heal — assertions run after a focus command, not right after the mutation; closes the deferred `f7c928d` gap; extends the existing `pushFocusScope` tests).
- **`Modal`:** `open(ui)` adds the modal as the last UI child and pushes a focus scope (scope root = the modal); `initialFocus` is applied on open, nothing is focused when omitted; a completed close pops the scope (before `removeChild`) and restores prior focus; `resize()` sizes the root layout and redraws the scrim; the `layout` option passes through verbatim; state-machine reentrancy (`open()` no-op unless `closed`, `close()` no-op while `closing`/`closed`); a close during `opening` cancels the running tween and replaces it with one starting from the current alpha; `destroy()` cancels any in-flight tween from any state; owning-screen hide/destroy cleans up an open modal.
- **World-driven animations:** with `autoUpdate: false`, sprite and tile animations advance only when their owning system's update runs — frames advance across `world.update()` calls, hold when updates stop (paused world), and resume from the held frame.
- **Screens:** no real-screen integration harness — no test today imports a real screen module (the `game`/`world` singletons do import-time pixi/asset work, and the current mocks don't cover the widget classes), and none is built for this work. Screen-level logic worth unit-testing — the pause open/close handlers, the quit-to-menu ordering — is extracted into small functions that take their collaborators (`{world, modal, …}`) and is tested with fakes, following the suite's existing unit boundary. Their test file is `tests/pauseFlow.test.ts` — deliberately not `tests/gameScreen.test.ts`, which collides with the existing engine test `tests/GameScreen.test.ts` by case alone on case-insensitive filesystems (macOS checkouts). The full menu → game → pause → resume → quit loop is covered by the manual visual pass below.
- **`settings`:** defaults and mutation (trivial).

Visual verification (layout, scrim, focus ring, fades) is manual: run the dev app and walk the menu → game → pause → resume → quit loop.
