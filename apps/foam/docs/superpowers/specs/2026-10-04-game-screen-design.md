# Game screen (Foam phase 2): design

Date: 2026-10-04. App: `apps/foam`. Status: approved design; the implementation plan is
[2026-10-04-game-screen.md](../plans/2026-10-04-game-screen.md). This is phase 2 of
[the direction document](../../direction.md).

## Background

Foam boots on Tellurion to a main menu with an Options window. New Game is shown but disabled.

Phase 2 builds the screen a night is played on, which this document calls the night screen. The
picture of a place fills the screen. Buttons placed freely on it stand for what the player can act
on. All text appears in a window over the dimmed scene, typed out. The screen shows sample content
only.

Somewhere (`apps/somewhere`) is a model to read: none of its code changes, and nothing moves into
Tellurion.

These facts about Tellurion shape the design:

- `Game` picks the pixel scale from the height of the screen (`getPixelScale`), once, when it is
  constructed. A 1080p screen is 480 × 270 art pixels. A phone held upright is about 146 × 262.
- The monogram font is 6 art pixels per character and 12 per line. Those two screens hold 80 × 22
  and 24 × 21 characters.
- Tellurion has no scrolling component.
- `Dialogue` is a runner with no drawing in it. It steps through a script of nodes, types a node's
  text at 40 characters per second, pauses at the offsets its owner sets with `setBreaks`, and
  offers the node's choices once the text is typed. `DialogueBox`, the bottom bar Somewhere uses, is
  a separate view of the same runner.
- `wrapText` wraps a text to a pixel width without adding or removing a character, so the start of a
  wrapped text never reflows while the rest is typed.
- `Modal` dims the screen, holds the keyboard focus, closes on the cancel command and can fade.
  Overlays stack: a modal can open over another.
- A `Button` takes a `layout`, so it can be placed at an absolute position. Arrow keys move the
  focus to the nearest focusable in that direction.
- Tellurion exports no function that measures text. `DialogueBox` measures through
  `pixi.BitmapFontManager`.
- `AudioMixer.playMusic()` starts the given track from its beginning, also when that track is
  already playing.

## Decisions (from brainstorming)

1. **Long text is cut into pages.** There is no scrolling component.
2. **The screen is designed for a wide screen and stays usable on a phone held upright.** The
   comfortable text size on such a phone is settled in phase 3.
3. **The picture is the background, and the scene buttons are placed freely on it.**
4. **All text appears in a window over the dimmed scene:** the description of the place, a scene
   button's text and choices, and the text that follows a choice.
5. **The text is typed out,** with Somewhere's blip sound.
6. **Tellurion's `Dialogue` runner drives the window.** The description and every scene button is a
   dialogue script. This decides what one button's text and choices look like in code. It does not
   decide the content model, which stays shelved.
7. **The description opens by itself on arrival.** A button labelled with the name of the place
   opens it again.
8. **The button in the top right corner is Menu.** It opens Resume, Options and Quit to menu.
   Quitting does not ask for confirmation, because nothing is saved.
9. **A visible Continue button turns the pages.**
10. **One sample choice changes the night's state,** so the status is seen to update.
11. **The font stays monogram.** Phase 2 uses the regular version, with an outline for labels and
    without one for body text, as phase 1 does. Nothing in phase 2 is set in italic.

## Design

### What the player sees

Entering:

1. New Game on the main menu is enabled. Activating it shows the night screen.
2. The description window opens by itself and types out the description of the place.

The scene:

3. A placeholder background fills the screen.
4. The top row holds the place button, then the time, the money and the state of mind, with the Menu
   button at the right end. On a screen narrower than 240 art pixels the status sits on a second
   line under the place button.
5. Each scene button sits at a fraction of the width and height of the area under the top row, and
   is kept fully on screen.
6. Arrow keys move the focus to the nearest button in that direction, Tab cycles through all of
   them, and Enter or Space activates.
7. The place button opens the description window again.

The window:

```
┌──────────────────────────────────────────────────┐
│ A patron                                         │
│                                                  │
│ He says he has been coming here since the place  │
│ opened, and that the beer was better then. He    │
│ starts to tell you about the night the ceil      │
│                                                  │
│ [ Continue                                     ] │
└──────────────────────────────────────────────────┘
```

8. A scene button opens the window with a 200 ms fade, and the scene is dimmed.
9. The window is as tall as its text and buttons need, up to the height of the area under the top
   row. It keeps one size for the whole node, so nothing moves while the text types or the pages
   turn.
10. The title is the node's `speaker`. The text types at 40 characters per second with the blip
    sound.
11. While text is typing or more pages remain, the window has one focused button, Continue. A press
    finishes the page if it is still typing; otherwise it turns the page. A tap on the text does the
    same.
12. When the last page of a node with choices is typed, the choices replace Continue, in room that
    was reserved from the start. The first choice is focused.
13. A choice leads to its next node, or closes the window if it has none.
14. After the last page of a node without choices, Continue closes the window.
15. Escape closes the window at any moment.
16. When the window closes, the focus returns to the button that opened it, and the status shows the
    current values.

A page without choices holds 47 characters × 15 lines on a 480 × 270 screen, about 115 words, and 20
× 13 on a 146 × 262 screen, about 43 words.

The menu:

17. The Menu button, or Escape on the scene with no window open, opens a window with the title
    "Menu" and the buttons Resume, Options and Quit to menu. Resume is focused.
18. Resume or Escape closes it.
19. Options opens the Options window on top of it. Closing that returns to the menu.
20. Quit to menu shows the main menu.

Sound:

21. The menu music keeps playing on the night screen. It starts again from its beginning when the
    main menu is shown.
22. Moving the focus plays the click sound, and a move with nowhere to go plays the error sound, as
    on the main menu.

### Files

New files, under `apps/foam/source/game/`:

| File                               | What it does                                                             |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `screens/nightScreen.ts`           | The screen: background, top row, scene buttons; opens the windows        |
| `screens/storyWindow.ts`           | `StoryWindow`, the window that a `Dialogue` runner drives                |
| `screens/menuModal.ts`             | `openMenuModal`: Resume, Options, Quit to menu                           |
| `screens/placeholderBackground.ts` | The placeholder picture                                                  |
| `core/night.ts`                    | The night's state and the status text                                    |
| `core/measureText.ts`              | The width of a string in one of the theme's fonts                        |
| `core/getPageBreaks.ts`            | Where each page ends in a wrapped text                                   |
| `core/getSceneArea.ts`             | The area under the top row for a given screen size                       |
| `core/getSpotPosition.ts`          | Where a scene button sits in that area                                   |
| `content/samplePlace.ts`           | The sample place: its name, description, scene buttons and their scripts |

Changed files, relative to `apps/foam/`:

| File                                    | Change                                            |
| --------------------------------------- | ------------------------------------------------- |
| `source/game/screens/mainMenuScreen.ts` | New Game is enabled and shows the night screen    |
| `source/routes/_index.tsx`              | Registers the night screen                        |
| `source/game/core/assets.ts`            | Adds the `blip` sound                             |
| `public/blip.wav`                       | Copied unchanged from `apps/somewhere/public/`    |
| `package.json`                          | Adds the dependency `pixi.js` `^8.19.0`           |
| `tests/mainMenu.browser.test.tsx`       | Follows the enabled New Game button (see Testing) |

Foam imports `pixi.js` directly for two things: measuring text and drawing the placeholder
background. `^8.19.0` is the range Somewhere and Tellurion use. The root `package-lock.json` records
the dependency.

`core/night.ts`, `core/getPageBreaks.ts`, `core/getSceneArea.ts` and `core/getSpotPosition.ts`
import neither `tellurion` nor `pixi.js`, so their tests run in the node project.

### Layout constants

All sizes are in art pixels.

| Name           | Value | Meaning                                                          |
| -------------- | ----- | ---------------------------------------------------------------- |
| Margin         | 4     | Space kept free at the edges of the screen                       |
| Line height    | 12    | One line of monogram                                             |
| Button height  | 16    | A button with a one-line label: the line plus 2 of padding twice |
| Narrow width   | 240   | Below this screen width the top row has two lines                |
| Window width   | 300   | Width of the story window, when the screen allows it             |
| Window padding | 8     | Inside the story window's panel                                  |
| Window gap     | 4     | Between title, text and buttons                                  |
| Button gap     | 2     | Between buttons in the story window                              |

`core/getSceneArea.ts` exports the margin, the line height, the button height and the narrow width,
because the scene and the story window both use them. The other four sizes are constants in
`screens/storyWindow.ts`.

### State (`core/night.ts`)

```ts
export type Night = {
  /** Minutes since midnight; 19:40 is 1180. */
  minutes: number;

  /** Money, in Kč. */
  money: number;

  /** State of mind, shown as written. */
  stateOfMind: string;
};

export function createNight(): Night;
export function formatStatus(night: Night): string;
```

- `createNight()` returns `{minutes: 1180, money: 350, stateOfMind: 'Sober'}`. These are sample
  values; the hours of the night are decided in phases 4 and 5.
- `formatStatus()` returns the time as `HH:MM`, the money followed by ` Kč`, and the state of mind,
  separated by three spaces: `19:40   350 Kč   Sober`. Minutes past midnight wrap, so 1470 is
  `00:30`.

The `Night` object is the context of every dialogue script. A node's `onEnter` changes it directly.

### Content (`content/samplePlace.ts`)

```ts
export type Spot = {
  /** Label of the scene button. */
  label: string;

  /** Centre of the button, as fractions of the scene area's width and height. */
  x: number;
  y: number;

  script: RunnableDialogueScript<Night>;
};

export type Place = {
  /** Label of the place button. */
  name: string;

  description: RunnableDialogueScript<Night>;
  spots: Spot[];
};

export const samplePlace: Place;
```

Every script is written with `defineDialogueScript<Night>()`, so a reference to a node that does not
exist is a type error.

The sample place is named "The bar". It is an invented place, not a bar in Brno. Its text is
temporary and is written with the implementation, within these limits:

- No word is longer than 16 characters, so every word fits a line on the narrowest phone.
- No person or place in it has a real name.
- Every node sets `speaker`: the place's name in the description, the spot's label in a spot's
  script.
- Every node's `text` is one string. The window cuts it into pages.

| Spot              | x    | y    | Script                                                                                                                                                                                                       |
| ----------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The bartender     | 0.25 | 0.2  | A short text and two choices. "Order a beer" leads to a node whose `onEnter` takes 45 from `money` and adds 10 to `minutes`. "Leave her alone" has no next node.                                             |
| Two women talking | 0.75 | 0.3  | One node with a short text and no choices.                                                                                                                                                                   |
| A patron          | 0.15 | 0.6  | A short text and two choices. "Talk to him" leads to a node with two further choices: "Ask about the ceiling" leads to the long text, and "Let him be" has no next node. "Ignore him" leads to a short text. |
| The door          | 0.8  | 0.85 | A short text and two choices. "Step outside" leads to a short text. "Stay" has no next node.                                                                                                                 |

The description is one node of about 60 words. The long text is about 300 words: it wraps to between
31 and 45 lines at 47 characters, which is three pages on a 480 × 270 screen.

### Text helpers (`core/measureText.ts`, `core/getPageBreaks.ts`)

```ts
export function measureText(text: string, role: 'body' | 'label' = 'body'): number;
```

`measureText` returns the rendered width of a string in art pixels, in the theme's font for that
role (`game.theme.text[role]`). It measures with `pixi.BitmapFontManager.measureText` and multiplies
the width by the returned scale, as `DialogueBox` does. It is the `measure` argument of every
`wrapText` call.

```ts
export function getPageBreaks(wrapped: string, linesPerPage: number): number[];
```

`getPageBreaks` takes a text already wrapped with `wrapText` and returns the offsets at which the
runner pauses: the offset just after the newline that ends each full page. The end of the text is
never a break. A text of `linesPerPage` lines or fewer has no breaks. A `linesPerPage` below 1
counts as 1.

### Scene layout (`core/getSceneArea.ts`, `core/getSpotPosition.ts`)

```ts
export type SceneArea = {
  /** Distance from the top of the screen to the area. */
  top: number;

  width: number;
  height: number;
};

export function getSceneArea(screenWidth: number, screenHeight: number): SceneArea;
```

The scene area is the screen under the top row. `top` is 24 on a screen at least 240 wide (margin,
button height, margin) and 40 on a narrower one (the status line and a gap of 4 more). `width` is
the screen width and `height` is the screen height minus `top`.

```ts
export type SpotPositionOptions = {
  x: number;
  y: number;

  /** Size of the button. */
  width: number;
  height: number;

  area: SceneArea;
};

export function getSpotPosition(options: SpotPositionOptions): {left: number; top: number};
```

`getSpotPosition` returns the top left corner of a scene button in screen coordinates, in whole
pixels:

- It puts the button's centre at `x × area.width` and `area.top + y × area.height`.
- It then moves the button so that it lies between the margin and the screen width minus the margin,
  and between `area.top` and the bottom of the screen minus the margin.

### Story window (`screens/storyWindow.ts`)

```ts
export type StoryWindowOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  script: RunnableDialogueScript<Night>;
  context: Night;
  area: SceneArea;

  /** Called once the window has closed. */
  onClosed: () => void;
};

export class StoryWindow {
  readonly dialogue: Dialogue<Night>;
  readonly modal: Modal;

  constructor(options: StoryWindowOptions);

  /** Text the window shows at the moment. */
  get text(): string;

  update(deltaMS: number): void;
  resize(area: SceneArea): void;
  destroy(): void;
}
```

`dialogue`, `modal` and `text` are public so that the screen and the tests can read the window's
state.

**Construction.** The constructor creates the runner, which enters the script's start node and runs
its `onEnter`. It creates a `Modal` that holds one `Panel`, with a 200 ms fade on the given
scheduler, adds it to `ui` as an overlay, and shows the start node. The modal centres the panel in
the scene area: its layout centres its content and has `area.top` as top padding.

**Showing a node.** The window shows a node when it is constructed, when the runner moves to another
node or page, and when it is resized:

1. The window is `min(window width, area.width − 2 × margin)` wide. The text is that width minus
   twice the window padding.
2. The page is wrapped with `wrapText` and `measureText`.
3. The button area is as tall as the node's choices need, each label wrapped in the label font to
   the inside of its button, with the button gap between them. A node without choices needs one
   button height, for Continue.
4. The lines per page are what remains of `area.height − 2 × margin` after the padding, the title,
   the gaps and the button area, divided by the line height and rounded down, and at least 1.
5. `getPageBreaks` gives the page ends, and the window hands them to the runner with `setBreaks`.
6. The panel's content is replaced with a title (`speaker`, in the label font), a text leaf (in the
   body font) and the button area holding Continue. A node without `speaker` has no title. The text
   leaf has a fixed size: the text width, and as many lines as the longest page of the node has. The
   button area has its full height from the start.
7. Continue is focused.

**Every frame.** `update` does nothing once the modal is closing or closed. Otherwise:

1. It ticks the runner with `deltaMS`.
2. If the runner is on another node or page than the one shown, or its count of revealed characters
   went down, it shows the node as above.
3. It shows the wrapped page from the start of the current page up to the revealed count. The
   current page starts at the last break that lies before the revealed count. This string is `text`.
4. It plays the `blip` sound on the `sfx` bus for newly revealed characters other than spaces and
   line ends: once per three such characters. A frame that reveals four or more characters at once
   plays it once at most.
5. When the runner is choosing and the choices are not built yet, it replaces Continue with one
   button per visible choice and focuses the first.
6. When the runner has ended, it calls `modal.close()`.

**Input.** Continue and a tap on the text leaf call `dialogue.advance()`, unless the runner is
choosing: there `advance()` would take the first choice. A choice button calls `dialogue.choose()`
with its index. None of these reaches the runner once the modal is closing. Escape closes the modal
through the engine's cancel command.

**Closing.** The modal's `onClosed` calls the window's `onClosed`. `destroy()` destroys the modal at
once, without the fade and without calling `onClosed`.

**Resizing.** `resize` stores the new area, sets the modal's top padding and shows the current node
again, with its choices if they were shown. The runner keeps its count of revealed characters and
ignores breaks that lie before it. `resize` does nothing once the modal is closed.

### Night screen (`screens/nightScreen.ts`)

`nightScreen` is a `GameScreen` with these contents:

```ts
type NightScreenContents = {
  background: PlaceholderBackground;
  menuModal: Modal | null;
  night: Night;
  optionsModal: Modal | null;
  placeButton: Button;
  spotButtons: Button[];
  statusText: Text;
  storyWindow: StoryWindow | null;
};
```

- `assetBundles` is `['default']` and `onFocusEvent` is `playFocusSound`.
- `onAttach` builds the top row (the place button, the status text and the Menu button) and one
  button per spot of `samplePlace`. A scene button has an absolute position and a fixed size: the
  width of its label by `measureText` plus 4, and the button height. The status text has a fixed
  size from `measureText` as well, set each time its text changes. The status text and the button
  labels are in the label font, which has an outline.
- `onShow` stores a fresh `createNight()`, writes the status text, adds the background to the view,
  lays the screen out for its current size and opens a story window with the place's description.
- A scene button's `onClick` opens a story window with that spot's script, and the place button's
  opens one with the description. Both do nothing while a story window is open.
- A story window's `onClosed` clears `storyWindow` and writes the status text from `night`.
- `onUpdate` calls `storyWindow.update(ticker.deltaMS)` when one is open. It opens the menu when the
  cancel command was pressed this frame and the UI root has no overlay.
- `onResize` computes the scene area with `getSceneArea`, puts the status text beside or under the
  place button, positions the scene buttons with `getSpotPosition`, resizes the background and calls
  `storyWindow.resize(area)` when one is open.
- `onHide` destroys the Options window, the menu and the story window, in that order, clears the
  three fields and removes the background from the view. It uses `destroy()`, never the animated
  close, by the same owning-screen rule as the main menu.

The menu's handlers live in the screen: `onOptions` opens `openOptionsModal` with the screen's `ui`
and `scheduler` and stores the modal in `optionsModal`; `onQuit` calls
`game.showScreen(mainMenuScreen)`.

`nightScreen` and `mainMenuScreen` import each other. Each reads the other only inside a click
handler, long after both modules have been evaluated, so the cycle is safe. Somewhere has the same
cycle between its menu and its world screen. The import carries the same `import/no-cycle` comment.

### Placeholder background (`screens/placeholderBackground.ts`)

```ts
export class PlaceholderBackground implements Renderable {
  readonly view: pixi.Container;

  resize(width: number, height: number): void;
  update(): void;
  destroy(): void;
}
```

It draws three horizontal bands of equal height that fill the given size: `0x1a1a2e` at the top,
`0x2a2350` in the middle and `0x3b2a4a` at the bottom. `update` does nothing. Phase 3 replaces it
with the animated background.

### Menu (`screens/menuModal.ts`)

```ts
export type MenuModalOptions = {
  ui: UiRoot;
  scheduler: Scheduler;
  onOptions: () => void;
  onQuit: () => void;

  /** Called once the window has closed. */
  onClosed: () => void;
};

export function openMenuModal(options: MenuModalOptions): Modal;
```

It builds a `Modal` with a centred `Panel`: the title "Menu" and the buttons Resume, Options and
Quit to menu. It fades for 200 ms and focuses Resume. Resume closes the modal. Options and Quit to
menu call `onOptions` and `onQuit`. The function adds the modal to `ui` as an overlay and returns
it, as `openOptionsModal` does.

### Main menu and boot

- In `mainMenuScreen.ts` the New Game button has an `onClick` that calls
  `game.showScreen(nightScreen)`, and it is not disabled.
- `routes/_index.tsx` imports `nightScreen` with the other game modules and registers it with
  `game.addScreen()`.
- `core/assets.ts` lists `blip: ['blip.wav']` among the sounds of the `default` bundle.

## Error handling

- **A script points at a node that does not exist.** `defineDialogueScript` makes it a type error.
  If it still happens, `Dialogue` throws in a development build. In a production build it logs a
  warning and ends the script, so the window closes.
- **A word is wider than the window's text.** `wrapText` throws in a development build and logs a
  warning in a production build. The narrowest phone fits 18 characters per line, so a test checks
  that no word in the sample content is longer than 16.
- **The screen is resized while a text types.** The window wraps the page again and hands the runner
  new page ends. The count of revealed characters is kept.
- **A press arrives as the window closes.** Once the modal is closing, `update` does nothing and the
  window passes no press on to the runner. This matters after Escape, when the runner has not ended
  and a choice could still change the night's state. The runner itself ignores `advance()` and
  `choose()` once it has ended.
- **The screen is hidden with a window open,** which happens when the error screen takes over.
  `onHide` destroys every open window at once.
- **The boot fails, or settings cannot be read or saved.** These behave as in phase 1.

## Testing

Unit tests, in the node project:

**`tests/getPageBreaks.test.ts`**

- A text with fewer lines than a page has no breaks, and so has a text with exactly one page of
  lines.
- A longer text has a break after every full page, each just after a newline.
- The end of the text is not a break, also when the last page is full.

**`tests/getSceneArea.test.ts`**

- A 480 × 270 screen gives `{top: 24, width: 480, height: 246}`.
- A 146 × 262 screen gives `{top: 40, width: 146, height: 222}`.
- A screen exactly 240 wide has the one-line top row.

**`tests/getSpotPosition.test.ts`**

- A spot at 0.5 and 0.5 is centred in the area.
- A spot near each of the four edges is moved fully on screen, the margin away from the edge.
- A spot at `y` 0 starts at `area.top`, so it never covers the top row.

**`tests/night.test.ts`**

- `createNight()` returns the starting values, and a second call returns a separate object.
- `formatStatus()` gives `19:40   350 Kč   Sober` for the starting values, pads hours and minutes to
  two digits, and wraps past midnight.

Browser tests. The two night screen files boot the real game once each through `bootGame` in
`tests/nightScreenHelpers.tsx`. It sets the viewport, imports the page's stylesheet so that the
canvas fills the viewport, and renders the index route inside React's strict mode, as
`tests/mainMenu.browser.test.tsx` does. The viewport is set before the game modules are imported,
because `Game` picks the pixel scale when its module is evaluated. Headless Chromium has a device
pixel ratio of 1. The helper file holds the JSX, so the two test files are `.ts` files.

**`tests/nightScreen.browser.test.ts`** uses a 1440 × 810 viewport, which is 480 × 270 art pixels.
It watches the calls the real mixer receives and plays through the screen:

1. Activating New Game makes the night screen the current screen.
2. The description window is open, and its runner is on a node whose `speaker` is the place's name.
3. Right after opening, `text` is shorter than the page. One press of Enter makes it the whole page.
4. The `blip` buffer reaches the mixer on the `sfx` bus while the text types.
5. Continue on the last page closes the window, and after the fade `storyWindow` is `null`.
6. The status text is `19:40   350 Kč   Sober`.
7. Every scene button lies fully inside the screen and under the top row.
8. No two scene buttons overlap, at 480 × 270 and, computed with `getSceneArea` and
   `getSpotPosition`, at 146 × 262.
9. Activating a scene button opens its window. When the text is typed, the choice buttons carry the
   node's choice texts and the first is focused.
10. A choice leads to its node.
11. The long text is shown in three pages, and no page has more than 15 lines.
12. After "Order a beer" and the closing of the window, the status text is `19:50   305 Kč   Sober`.
13. After a window closes, the focus is back on the button that opened it.
14. The place button opens the description again.
15. Escape closes a window in the middle of a text.
16. Escape on the scene opens the menu with Resume focused. Resume closes it.
17. Options opens the Options window over the menu. Escape closes it, and the menu is still open.
18. Quit to menu makes the main menu the current screen, and `storyWindow`, `menuModal` and
    `optionsModal` are `null`.
19. A second New Game shows the starting status and opens the description again.
20. No word in any text or choice of `samplePlace` is longer than 16 characters.
21. An arrow key moves the focus to the nearest scene button, and the click sound reaches the mixer
    on the `ui` bus.
22. A scene button and the place button do nothing while a story window is open.
23. A choice activated during the closing fade after Escape does not change the night's state.
24. A resize in the middle of the long text keeps the count of revealed characters, and the pages
    that follow fit the new window.
25. Hiding the screen with a story window open destroys the window at once, and the screen works
    when it is shown again.
26. A tap on the Menu button opens the menu, and a tap on Resume closes it.
27. The menu music is started once before Quit to menu, and once more when the main menu is shown
    again.

**`tests/nightScreenNarrow.browser.test.ts`** uses a 438 × 786 viewport, which is 146 × 262 art
pixels:

1. The status text lies under the place button.
2. Every scene button lies fully inside the screen and under the top row.
3. The story window is 138 wide.
4. The description takes more than one page, no page has more than 13 lines, and no line is wider
   than the text width.
5. The choice "Ask about the ceiling" wraps to two lines inside its button, and the window stays in
   the scene area.
6. Taps open a scene button's window, finish its text and take a choice. A tap on the text does
   nothing while the choices are offered.

**`tests/mainMenu.browser.test.tsx`** follows the enabled button: New Game is enabled, the first
focus command lands on New Game, and the next one lands on Options. Its other checks are unchanged.

Commands, run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
npm run develop --workspace foam
```

The first builds Tellurion when needed and must pass. The second serves the app on port 5000 for the
manual check in the next section.

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- The real background art, the palette, the panels and the buttons (phase 3).
- A comfortable text size on a phone held upright (phase 3).
- A real place, and rules for the clock, the money, the state of mind and dice (phase 4).
- Saving and Continue (phase 7).
- The journal.
- A confirmation before quitting.
- The game's own music.
- Choices that depend on a condition, and choice labels that show changing numbers.
- Text in italic.
- Changes to Tellurion or to Somewhere.
