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
2. Main menu screen — *Pending*
3. Pause mechanics (engine) — *Pending*
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

## 2. Main menu screen (Pending)

## 3. Pause mechanics — engine (Pending)

## 4. Modal/overlay primitive + pause menu UI (Pending)

## 5. Options scope (Pending)

## 6. Fate of the demo showcase (Pending)

## 7. Testing (Pending)
