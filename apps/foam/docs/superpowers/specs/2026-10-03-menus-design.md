# Menus (Foam phase 1): design

Date: 2026-10-03. App: `apps/foam`. Status: implemented by
[2026-10-04-menus.md](../plans/2026-10-04-menus.md). This is phase 1 of
[the direction document](../../direction.md).

## Background

Phase 1 starts from a React Router skeleton with a placeholder page: no `tellurion` dependency, no
`public/` folder and no tests.

Somewhere (`apps/somewhere`) already shows how an app boots on Tellurion and reaches a main menu
with an Options window. Phase 1 writes Foam's own version of that code. Somewhere is a model to
read: none of its code changes, and nothing moves into Tellurion.

Four facts about Tellurion shape the design:

- `Game.init()` loads the `default` asset bundle itself, before any screen exists. A registered
  loading screen is shown only by `Game.showScreen()`, when the next screen needs a bundle that is
  not loaded yet. With one bundle it can never appear.
- `Game.init()` fixes the look of every game today: a black background, pixel-art scale (270 art
  pixels of height, so about 480 × 270 on a 1080p screen) and a CRT scanline filter over the stage.
- A browser keeps an `AudioContext` suspended until the first click or key press.
  `AudioMixer.unlock()` resumes it on that gesture. Music started earlier begins playing then.
- A disabled `Button` is not focusable and ignores `activate()`.

## Decisions (from brainstorming)

1. **Sounds are Somewhere's files, as placeholders.** The menu music and the UI sounds are copied
   like the UI art and the font. A stock synthwave track replaces the music file later.
2. **New Game is shown but disabled.** Phase 2 builds the screen it opens.
3. **Options holds four volume sliders and Close.** There is no player name field: the player's
   avatar is not designed yet.
4. **No Tellurion loading screen.** It cannot appear with one bundle. The page shows a plain
   "Loading…" line while the game boots. The loading screen arrives with the first second bundle.
5. **The Options window lives in its own file.** Somewhere builds it inside its menu file.
6. **The look is not touched.** Foam uses Somewhere's art and font and keeps what `Game.init()`
   fixes. Foam's own look is phase 3.

## Design

### What the player sees

1. The page opens with "Loading…" in the centre of a black page.
2. The canvas replaces it and shows the main menu: a panel in the centre with the title "Foam", New
   Game (greyed out) and Options.
3. The menu music starts at the first click or key press and loops.
4. Moving focus between items plays the click sound. A move with nowhere to go plays the error
   sound.
5. Options opens a window that fades in over a dimmed menu. It has the title "Options", four rows
   (Master, Music, SFX, UI), each a label and a slider, and a Close button.
6. Changing a slider changes that volume at once.
7. Close or Escape closes the window with a fade, and focus returns to Options.
8. After a reload the sliders show the saved values, and the volumes are applied before any sound
   plays.

Controls are Somewhere's menu controls: arrows and Tab move focus, Enter and Space activate, Escape
cancels, `=` or Page Up and `-` or Page Down change a slider. Mouse and touch work on every control.

### Files

All paths are under `apps/foam/source/`.

| File                             | What it does                                           | Somewhere model                  |
| -------------------------------- | ------------------------------------------------------ | -------------------------------- |
| `routes/_index.tsx`              | Boots the game in the browser and shows the main menu  | `routes/_index.tsx`              |
| `ui/Renderer.tsx`                | Puts the canvas on the page                            | `ui/Renderer.tsx`                |
| `root.tsx`                       | The page shell                                         | `root.tsx`                       |
| `game/core/game.ts`              | The one `Game` object and the `window.game` debug name | `game/core/game.ts`              |
| `game/core/assets.ts`            | Lists the assets                                       | `game/core/assets.ts`            |
| `game/core/input.ts`             | Key bindings                                           | `game/core/input.ts`             |
| `game/core/theme.ts`             | Which art each UI component uses                       | `game/core/theme.ts`             |
| `game/core/settings.ts`          | Loads and saves settings                               | `game/core/settings.ts`          |
| `game/core/audio.ts`             | The mixer; applies the saved volumes                   | `game/core/audio.ts`             |
| `game/core/playFocusSound.ts`    | Turns focus events into UI sounds                      | `game/core/playFocusSound.ts`    |
| `game/screens/errorScreen.ts`    | The error screen                                       | `game/screens/errorScreen.ts`    |
| `game/screens/mainMenuScreen.ts` | The main menu                                          | `game/screens/mainMenuScreen.ts` |
| `game/screens/optionsModal.ts`   | The Options window                                     | part of `mainMenuScreen.ts`      |

`ui/Renderer.tsx`, `game/core/game.ts`, `game/core/theme.ts`, `game/core/audio.ts`,
`game/core/playFocusSound.ts` and `game/screens/errorScreen.ts` behave exactly as their models. The
theme is the same description because the art is the same file. The sections below cover the files
that differ.

### Boot (`routes/_index.tsx`, `root.tsx`)

The route follows Somewhere's: an effect imports the game modules dynamically, so Pixi and the
`AudioContext` never run on the server, and an `AbortController` makes the effect safe under React's
strict mode. It differs in three ways:

- It imports `game`, `errorScreen`, `mainMenuScreen` and `audio`, then registers the error screen
  and the main menu only.
- Until the game is ready it renders `Loading…` centred on the page instead of the renderer. The
  server renders the same line, so it is visible before any script runs.
- If the boot fails, it logs the error and renders
  `Foam could not start. Reload the page, or try another browser.` in the same place. See Error
  handling.

`audio` is imported before `game.init()` runs, as in Somewhere: the module hands the mixer's context
to the audio loader, and `init()` loads sounds.

In `root.tsx` the `body` has the classes `m-0 min-h-dvh bg-black text-white`. `min-h-dvh` matches
the renderer's `h-dvh` on phones, and the black background stops a white flash before the canvas
appears.

### Core modules (`game/core/`)

**`assets.ts`** has one bundle and no tileset:

```ts
export const assets = new GameAssets({
  bundles: [
    {
      name: 'default',
      spritesets: {ui: ['ui.json']},
      fonts: {monogram: ['monogram.fnt'], 'monogram-outline': ['monogram-outline.fnt']},
      sounds: {
        'ui-click': ['ui-click.wav'],
        'ui-error': ['ui-error.wav'],
        'menu-music': ['menu-music.wav'],
      },
    },
  ],
});
```

**`input.ts`** binds the ten focus commands with Somewhere's keys and has no `actions`.

**`settings.ts`** stores volumes only, under the key `foam:settings`:

```ts
const volume = z.number().min(0).max(1).default(1).catch(1);
const settingsSchema = z.object({
  volumes: z.object({master: volume, music: volume, sfx: volume, ui: volume}).prefault({}),
});
```

It exports the same three names as Somewhere: `settings` (a plain object loaded at module load),
`saveSettings()` and `saveSettingsSoon` (`saveSettings` debounced by 250 ms, with `flush()`). Each
field recovers on its own, so a later phase can add a field without breaking stored settings.

### Screens (`game/screens/`)

**`optionsModal.ts`** exports one function:

```ts
export type OptionsModalOptions = {
  ui: UiRoot;
  scheduler: Scheduler;
  onClosed: () => void;
};

export function openOptionsModal({ui, scheduler, onClosed}: OptionsModalOptions): Modal;
```

- It builds the window fresh on every call, so the sliders start from the current `settings`.
- Each slider's `onChange` calls `audio.setVolume(bus, value)`, writes `settings.volumes[bus]` and
  calls `saveSettingsSoon()`.
- The Close button calls `close()` on the modal. Escape closes it through the engine's cancel
  command.
- The modal fades for 100 ms on the given `scheduler`.
- When the close completes, it calls `saveSettingsSoon.flush()` and then the caller's `onClosed`.
- It adds the modal to `ui` as an overlay and returns it. Nothing is focused on open.

The function depends on `game.theme`, `audio` and `settings`, and on nothing from the main menu. Any
screen can open it by passing its own `ui` and `scheduler`.

**`mainMenuScreen.ts`** is a `GameScreen` whose contents are
`{newGameButton, optionsButton, openModal}`.

- `onAttach` centres a `Panel` holding the title text "Foam", the New Game button and the Options
  button. New Game has no `onClick` and is disabled right after it is built. Options calls
  `openOptionsModal` with the screen's `ui` and `scheduler`, stores the returned modal in
  `openModal`, and clears `openModal` in `onClosed`.
- `onShow` plays `menu-music` on the mixer.
- `onHide` destroys an open modal and clears `openModal`, by the same owning-screen rule as
  Somewhere.
- `onFocusEvent` is `playFocusSound`.
- `assetBundles` is `['default']`.

### Assets (`apps/foam/public/`)

Nine files are copied unchanged from `apps/somewhere/public/`: `ui.json`, `ui.png`, `monogram.fnt`,
`monogram_0.png`, `monogram-outline.fnt`, `monogram-outline_0.png`, `ui-click.wav`, `ui-error.wav`
and `menu-music.wav`.

`ui-key.wav` is not copied. It is the typing sound of Somewhere's name field.

When the synthwave track arrives it replaces `menu-music.wav`. Tellurion's audio loader accepts
`.wav` and `.ogg`, so a compressed track changes the file name in `assets.ts` and nothing else.

### Project setup

- `apps/foam/package.json` gains the dependency `"tellurion": "^0.0.0"`, as in Somewhere. No Foam
  source file imports `pixi.js` directly, so it is not added.
- `apps/foam/.carson/project.json` gains an `overrides` block with what Somewhere and Tellurion
  share for engine code:
  - `viteConfig.optimizeDeps.include`: Somewhere's list (`@pixi/layout`, `@pixi/layout/components`,
    `eventemitter3`, `pixi-filters`, `pixi.js`, `zod`).
  - `tsconfig.compilerOptions`: `module` `preserve` and `moduleResolution` `bundler`.
  - `eslintConfig`: the two rule blocks that Somewhere and Tellurion both have (the two rules turned
    off, and the comment, class-order and blank-line rules). Somewhere's `ignores` and `tools`
    blocks are not copied.
- The generated files (`vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `package.json`) are
  regenerated with `npx carson update workspace` at the repository root, never edited by hand.
  Carson adds the browser-test packages and the `unit` and `browser` test projects by itself once
  the app has a `*.browser.test.ts` file.

## Error handling

- **A screen fails to show.** `Game.showScreen()` catches the error and shows the error screen:
  "Something went wrong", and below it "Reload the page to continue." A development build shows the
  error's message instead of that second line. The screen has no buttons, as in Somewhere.
- **The boot fails.** A failed `init()` (no WebGL, a script or asset that did not load) cannot reach
  the error screen, because no renderer exists to draw it. Somewhere only logs it. Foam also
  replaces "Loading…" with the "could not start" line, so a visitor is not left waiting.
- **Stored settings are unreadable or invalid.** `PersistedStore` and the schema fall back to
  defaults, field by field.
- **Saving settings fails** (private mode, full storage). `PersistedStore` logs a warning. The
  volumes still apply for the session.

## Testing

All three test files run in the browser project.

**`tests/settings.browser.test.ts`**, modelled on Somewhere's:

- Nothing stored gives all four volumes at 1.
- A stored valid payload is loaded.
- A value of the wrong type resets alone and leaves the other volumes as stored.
- An out-of-range volume snaps back to 1 and leaves the others.
- Stored text that is not JSON gives the defaults, and so does a `volumes` value of the wrong type.
- `saveSettings()` writes the current object under `foam:settings`.
- `saveSettingsSoon()` waits, and its `flush()` writes at once.

**`tests/mainMenu.browser.test.tsx`** boots the real game once for the file by rendering the index
route inside React's strict mode, as the app does. The route runs `game.init()` with the real files
from `public/`, mounts the canvas, registers the screens and shows the main menu. A browser test
serves `public/` at the server root, so the asset paths resolve as they do in the app. The test
stores a music volume before the boot, watches the calls the real mixer receives, and then drives
the menu with key presses, as a player does:

- The main menu is the current screen.
- The error screen is registered on the game.
- The stored volumes reach the mixer at boot: music at the stored 0.4, the other buses at 1.
- The menu music starts exactly once, with the `menu-music` buffer.
- New Game is disabled.
- The first focus command lands on Options and plays the `ui-click` sound on the `ui` bus.
- Activating Options opens the window.
- The sliders show the stored volumes.
- With the Master slider focused, the decrease key lowers `settings.volumes.master`, and the mixer's
  master volume follows.
- Escape closes the window. After the fade no modal is open, `foam:settings` in `localStorage` holds
  the lowered value, and focus is back on Options.
- A window opened again shows the value lowered by its own key press.
- The Close button closes the window.

**`tests/bootFailure.browser.test.tsx`** replaces the game module with one whose `init()` fails,
renders the index route, and checks that "Loading…" gives way to the "could not start" line and that
the error is logged.

Commands, run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
npm run develop --workspace foam
```

The first builds Tellurion when needed and must pass. The second serves the app on port 5000 for the
manual check in the next section.

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed, including the saved
  volumes after a reload.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- The game screen, pause and quit (phase 2).
- Foam's own palette, font, panels and background (phase 3).
- Continue and saving of runs (phase 7).
- The Tellurion loading screen, until a second asset bundle exists.
- A player name or any setting other than the four volumes.
- Changes to Tellurion or to Somewhere.
- The final menu music.
