# Game UI Design — Main Menu, Game Screen, Pause Overlay

**Date:** 2026-07-12
**Status:** In progress — designed section by section; sections below are marked *Resolved* or *Pending*.

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
4. Modal/overlay primitive + pause menu UI — *Pending*
5. Options scope — *Pending*
6. Fate of the demo showcase — *Pending*
7. Testing — *Pending*

---

## 1. Screen flow & lifecycle (Resolved)

**Flow:**

- Boot: `game.init()` → loading screen → **main menu screen** (replaces booting into `mainScreen`).
- **New Game** → `game.showScreen(gameScreen)`. The game screen's `onShow` attaches the world and calls `world.start()` (as `mainScreen.onShow` does today).
- **Quit to menu** (from the pause overlay) → `world.stop()` + detach from view/ticker (full teardown, as `mainScreen.onHide` does today) → `game.showScreen(mainMenuScreen)`.

**Decisions:**

- **Runs are ephemeral.** Quitting to the menu discards the run; the menu offers no Continue item. Every New Game is a fresh `world.start()`. Rationale: matches the existing `World` start/stop design; a Continue feature can be layered on later without redesign.
- **Screen transitions are instant swaps.** No changes to `Game.showScreen`; no fade/crossfade machinery in v1.
- **The pause overlay is not a screen.** It is a modal layer inside the game screen, so no screen-stacking machinery is needed. Pausing never triggers `showScreen`.
- **Pause is opened two ways:** the **Escape key** and an **on-screen button in a corner** of the game screen (touch/pointer support). Both routes open the same overlay.
- **Screen split.** The current `mainScreen` is dismantled into two new screens: `mainMenuScreen` and `gameScreen`. What happens to its demo-showcase widgets is decided in section 6.

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

**Approach: explicit `world.pause()` / `world.resume()`** — chosen over ticker-detach (leaves pause state implicit, needs a detach-update-only mechanism) and a `timeScale` indirection (more general than v1 needs).

**`World` changes (`source/engine/ecs/World.ts`):**

- New `#isPaused` flag, `pause()`, `resume()`, and an `isPaused` getter. `World.update` returns early while paused: no system updates, no pending-change flush, no event-channel swaps. The world stays attached to the ticker, so its view keeps rendering the frozen frame behind the pause overlay.
- Guards: `pause()` requires running-and-unpaused, `resume()` requires paused. `stop()` remains callable while paused (the quit-to-menu flow stops a paused world) and resets the paused flag so the next `start()` begins unpaused.
- New `onPause` / `onResume` options (like `onStart`/`onStop`), where the game wires animation freezing.

**What freezes automatically:** all 10 systems, ECS timers/tweens (`timerSystem`/`tweenSystem` just don't run), and event-channel swaps (events pushed before pause stay buffered and deliver on the first resumed frame).

**What needs explicit freezing — Pixi-clock animations:** `AnimatedSprite`s play on Pixi's shared ticker regardless of world updates. Two small engine additions, both called from the game's `onPause`/`onResume` wiring in `world.ts`:

- `Map.pauseAnimations()` / `resumeAnimations()` — stop/play the animated tile sprites (stop holds the current frame).
- `Sprite.pause()` / `resume()` on the engine `Sprite` wrapper — stop/play the currently shown animation without resetting the frame. Applied to all entities with a `GraphicsComponent`.

**What deliberately keeps running:** the screen-level `GameScreen.scheduler`, which drives UI animations (the pause overlay's own fade needs it). Design rule going forward: gameplay timing must live in ECS timers/tweens, never on the screen scheduler.

**Input while paused:** click-to-move is blocked for free — the overlay's full-screen scrim is a UI element, and `UiRoot` already stops `pointertap` bubbling from UI to the game view, so the `playerSystem` handler never fires. Focus-key navigation keeps working (needed to operate the pause menu).

**Deferred (explicitly out of v1):** auto-pause on `visibilitychange` (the documented backgrounded-tab simulation jump stays as-is), and any `timeScale` support.

## 4. Modal/overlay primitive + pause menu UI (Pending)

## 5. Options scope (Pending)

## 6. Fate of the demo showcase (Pending)

## 7. Testing (Pending)
