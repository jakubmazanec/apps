# Game screen (Foam phase 2): design

Date: 2026-10-04. App: `apps/foam`. Status: implemented by
[2026-10-04-game-screen.md](../plans/2026-10-04-game-screen.md). This is phase 2 of
[the direction document](../../direction.md).

## Background

Phase 2 starts from the result of phase 1: Foam boots on Tellurion to a main menu with an Options
window, and New Game is shown but disabled.

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
9. **A press on the window turns the pages.** A small marker shows when a press would turn a page or
   close the window.
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
   button at the right end. On a screen narrower than 292 art pixels the status sits on a second
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
│ starts to tell you about the night the ceiling   │
│ fell in.▮                                        │
└──────────────────────────────────────────────────┘
```

8. A scene button opens the window with a 100 ms fade, and the scene is dimmed.
9. The window is as tall as its text and choices need, up to the height of the area under the top
   row. It keeps one size for the whole node, so nothing moves while the text types or the pages
   turn.
10. The title is the node's `speaker`. The text types at 40 characters per second with the blip
    sound.
11. A press on the text or on the room under it, where the choices appear, or Enter or Space,
    finishes the page while it is still typing; otherwise it turns the page, or closes the window
    after the last page of a node without choices. While such a press would turn the page or close
    the window, a marker blinks after the last letter. It is hidden while text types and while
    choices are offered. No button is built and nothing is focused until the choices appear.
12. When the last page of a node with choices is typed, the choices appear in room that was reserved
    from the start. None is focused: the first arrow or Tab press focuses the first choice, and
    Enter or Space takes the focused one. The choices fade in over 100 ms and take a tap once fully
    shown. While the choices are offered, a press on the text, between two choices or on choices
    that are still fading in does nothing.
13. A choice leads to its next node, or closes the window if it has none.
14. After the last page of a node without choices, a press closes the window.
15. Escape opens the menu above the window. While the menu is open the text does not type and the
    window takes no press. Resume or Escape closes the menu, and the text goes on.
16. When the window closes, the focus returns to the button that opened it, and the status shows the
    current values.

A node without choices reserves no room under the text. With a title, a page holds 46 characters ×
16 lines on a 480 × 270 screen, about 120 words, and 19 × 14 on a 146 × 262 screen, about 43 words.
A node with choices reserves the window gap and the room its choices need.

The menu:

17. The Menu button, or Escape on the scene with a story window open or not, opens a window with the
    title "Menu" and the buttons Resume, Options and Quit to menu. Resume is focused.
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
| `content/places.ts`                | The game's places by id: each one's name, description, picture and spots |

Changed files, relative to `apps/foam/`:

| File                                    | Change                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `source/game/screens/mainMenuScreen.ts` | New Game is enabled and shows the night screen                                       |
| `source/routes/_index.tsx`              | Registers the night screen                                                           |
| `source/game/core/assets.ts`            | Adds the `blip` sound                                                                |
| `public/blip.wav`                       | Copied unchanged from `apps/somewhere/public/`                                       |
| `package.json`                          | Adds the dependency `pixi.js` `^8.19.0`                                              |
| `tests/mainMenu.browser.test.tsx`       | Follows the enabled New Game button (see Testing)                                    |
| `source/game/core/input.ts`             | The comment on the cancel command covers the story window and the menu               |
| `.gitignore`                            | Ignores `tests/__screenshots__/`, where a failed browser test leaves its screenshots |

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
| Narrow width   | 240   | Below this screen width a window takes its narrow layout         |
| Top row width  | 292   | From this screen width the top row has one line                  |
| Window width   | 300   | Width of the story window, when the screen allows it             |
| Button padding | 6, 2  | A button's label to its edge, left and right, above and below    |
| Window padding | 12, 8 | Inside a window's panel, left and right, above and below         |
| Window gap     | 4     | Between title and text                                           |
| Choices gap    | 8     | Between the text and the first choice                            |
| Button gap     | 4     | Between buttons in the story window                              |

`core/getSceneArea.ts` exports the margin, the line height, the button padding, the button height,
the narrow width, the window padding, the window width and the top row width, because the scene and
the windows use them. The window gap, the choices gap and the button gap are constants in
`screens/storyWindow.ts`.

### Limits on a 146 × 262 screen

The layout takes every label at its measured width, 6 art pixels per character, and neither wraps
nor cuts it. Only the window's text and its choices wrap. A label longer than its room runs off:

| Element            | Room                       | Fits          | Beyond that                                                 |
| ------------------ | -------------------------- | ------------- | ----------------------------------------------------------- |
| Status line        | 138                        | 23 characters | Runs off the right edge                                     |
| Window title       | 114                        | 19 characters | Runs past the window's edge                                 |
| Scene button label | 126                        | 21 characters | The button starts at the left margin and runs off the right |
| Place button label | 86, beside the Menu button | 14 characters | The button covers the Menu button                           |

On a wider screen the status sits beside the place button, so a long place name pushes the status
into the Menu button.

Scene buttons are kept apart at the two screen sizes the tests check. On a screen that is both
narrower than about 188 and shorter than about 200 art pixels, which is a browser window under
roughly 376 × 400 CSS pixels, "The bartender" and "Two women talking" overlap. No phone has that
size.

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

### Places (`core/place.ts`)

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
  id: PlaceId;

  /** The real name. The travel window lists the place by it. */
  name: string;

  /** Label of the place button, for a name that does not fit it. */
  shortName?: string;

  description: RunnableDialogueScript<Night>;

  /** GLSL of the place: the function that draws its picture. */
  picture: string;

  spots: Spot[];
};
```

The game's places are `source/game/content/places/*.ts`, recorded by id in `content/places.ts`. The
night screen shows `nightStart.places[night.place]`. The night screen tests run on the fixed world's
bar, `FIXED_BAR`, which `tests/fixedWorld.ts` holds with `fixedPlaces` and `getFixedPlace`.

Every script is written with `defineDialogueScript<Night>()`, so a reference to a node that does not
exist is a type error.

The fixed world's bar is named "The bar". It is an invented place, not a bar in Brno. Its text lies
within these limits:

- No word is longer than 16 characters, so every word fits a line on the narrowest phone.
- No person or place in it has a real name.
- Every node sets `speaker`: the place's name in the description, the spot's label in a spot's
  script.
- Every node's `text` is one string. The window cuts it into pages.

| Spot              | x    | y    | Script                                                                                                                                                                                                       |
| ----------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The bartender     | 0.22 | 0.51 | A short text and two choices. "Order a beer" leads to a node whose `onEnter` takes 45 from `money` and adds 10 to `minutes`. "Leave her alone" has no next node.                                             |
| Two women talking | 0.7  | 0.84 | One node with a short text and no choices.                                                                                                                                                                   |
| A patron          | 0.14 | 0.93 | A short text and two choices. "Talk to him" leads to a node with two further choices: "Ask about the ceiling" leads to the long text, and "Let him be" has no next node. "Ignore him" leads to a short text. |
| The door          | 0.91 | 0.4  | A short text and two choices. "Step outside" leads to a short text. "Stay" has no next node.                                                                                                                 |

The description is one node of about 60 words. The long text is about 300 words: it takes more than
one page on a 480 × 270 screen.

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

The scene area is the screen under the top row. `top` is 24 on a screen at least 292 wide (margin,
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
  /** Scheduler of the screen that opens the window; it drives the fade. */
  scheduler: Scheduler;

  script: RunnableDialogueScript<Night>;
  context: Night;
  area: SceneArea;

  /** Called once the window has closed. */
  onClosed: () => void;
};

export type StoryWindowState = 'closed' | 'closing' | 'open' | 'opening';

export class StoryWindow implements Overlay {
  readonly children: UiChild[];
  readonly dialogue: Dialogue<Night>;
  readonly view: pixi.Container;

  constructor(options: StoryWindowOptions);

  get state(): StoryWindowState;

  /** Text the window shows at the moment. */
  get text(): string;

  /** @internal Called by `UiRoot`. */
  attach(ui: UiRoot): void;

  /** @internal Called by `UiRoot`. */
  detach(): void;

  destroy(): void;
  resize(area: SceneArea): void;
  update(deltaMS: number): void;
}
```

`dialogue`, `children`, `view` and `text` are public so that the screen and the tests can read the
window's state.

**An overlay without `close`.** `StoryWindow` implements `Overlay` and declares no `close`, so the
cancel command passes over it: the window ends only through its text or through a choice. The night
screen calls `screen.ui.addOverlay(storyWindow)`, and `UiRoot` calls `attach` and `detach`.

**View.** `view` covers the screen: it is positioned absolutely at 0, 0 with 100 % width and height,
centres its content and has `area.top` as top padding. Its first child is a scrim, a rectangle in
the theme's `modal.scrimColor` and `modal.scrimAlpha` that takes every pointer event. Its second
child is the `Panel`, the only entry of `children`.

**Construction.** The constructor creates the runner, which enters the script's start node and runs
its `onEnter`, builds the panel and the scrim, and shows the start node.

**Fade and state.** The state starts as `closed`. `attach` records the root, sets the state to
`opening`, sets the view's alpha to 0 and fades it to 1 in 100 ms on the scheduler with
`easeOutQuad`; the state is then `open`. Choices whose fade a detach cancelled fade in again from
the start. When the runner has ended, the window sets the state to `closing` and fades to 0; when
the fade is over it destroys itself and calls `onClosed`. `detach` cancels the running fades, the
window's and the choices', forgets the root and sets the state to `closed`. `destroy()` leaves the
root if the window is still attached and destroys the view at once, from any state, without the fade
and without calling `onClosed`.

**Showing a node.** The window shows a node when it is constructed, when the runner moves to another
node or page, and when it is resized:

1. The window is `min(window width, area.width − 2 × margin)` wide. The text is that width minus
   twice the window padding.
2. The page is wrapped with `wrapText` and `measureText`.
3. The button area is as tall as the node's choices need, each label wrapped in the label font to
   the inside of its button, with the button gap between them. A node without choices reserves no
   room under the text. A node with choices reserves the window gap and the button area.
4. The lines per page are what remains of `area.height − 2 × margin` after the padding, the title,
   the gaps and the room reserved for choices, divided by the line height and rounded down, and at
   least 1.
5. `getPageBreaks` gives the page ends, and the window hands them to the runner with `setBreaks`.
6. The panel's content is replaced with a title (`speaker`, in the label font), a text leaf (in the
   body font) and, for a node with choices, the empty button area. A node without `speaker` has no
   title. The text leaf has a fixed size: the text width, and as many lines as the longest page of
   the node has. The button area has its full height from the start.
7. No button is built and nothing is focused.

**The marker.** A sprite, the `cursor` texture of the `ui` spriteset, sits out of the layout flow
after the last letter shown. On a page that another page follows, it stays on the page's last line.
It is visible while the runner's phase is `idle`, that is while a press would turn the page or close
the window, and the blink is on. The blink turns every 500 ms of `update` time and starts in the on
state whenever the phase becomes `idle`.

**Every frame.** `update` does nothing unless the window's state is `open` or `opening` and the
window is the topmost overlay of its root, so the text waits while the menu lies above it and a
window that fades out takes no press. Otherwise:

1. If Enter or Space went down this frame (`input.focusPressed('activate')`), no component has the
   focus and this is not the window's first `update`, the window continues the text. The first
   `update` is left out because the press that opened the window is still the frame's press. A press
   that a focused choice took leaves the focus on that choice, so it does not continue the next
   text.
2. It ticks the runner with `deltaMS`.
3. If the runner is on another node or page than the one shown, or its count of revealed characters
   went down, it shows the node as above.
4. It shows the wrapped page from the start of the current page up to the revealed count. The
   current page starts at the last break that lies before the revealed count. This string is `text`.
5. It plays the `blip` sound on the `sfx` bus for newly revealed characters other than spaces and
   line ends: once per three such characters. A frame that reveals four or more characters at once
   plays it once at most.
6. When the runner is choosing and the choices are not built yet, it builds one button per visible
   choice, in the room the node reserved, and focuses none. It fades them in over 100 ms on the
   scheduler with `easeOutQuad`, and while they fade the button area takes no pointer events. A
   second tap of a double tap under the text that lands within the fade, about 100 ms after the
   first tap finished the text, reaches the press surface and does nothing; a later second tap takes
   the choice under it.
7. It shows or hides the marker.
8. When the runner has ended, it starts the closing fade.

**Input.** A tap on the press surface, and the key rule of step 1 of the frame, call
`dialogue.advance()`, unless the runner is choosing: there `advance()` would take the first choice.
Nothing reaches the runner while the state is `closing` or `closed`. The press surface is a
container of its own beside the choices, not their parent, so a tap on a choice does not reach it.
It spans the panel's width from its top edge. For a node without choices it reaches the panel's
bottom edge, so a tap on the marker or on the padding around it continues the text. For a node with
choices it reaches the bottom of the room the choices fill, without the panel's bottom padding, so a
tap in that room does what a tap on the text does at the same moment. It lies above the title and
the text and under the choices, and the marker, on top, takes no pointer events. A choice button
calls `dialogue.choose()` with its index; a tap reaches it once the choices are fully shown, and
Enter or Space whenever it has the focus. Escape does not close the window: the night screen opens
the menu above it.

**Closing.** When the closing fade is over, `destroy()` takes the window off the root and `onClosed`
is called.

**Resizing.** `resize` stores the new area, sets the view's top padding and shows the current node
again, with its choices if they were built, and with the focus on the choice at the same position
when one of the window's choices had it. Choices that were fully shown come back fully shown, and
choices still fading in start their fade again. The runner keeps its count of revealed characters
and ignores breaks that lie before it. A window that is not attached only stores the area.

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
  button per spot of the shown place, `nightStart.places[night.place]`. A scene button has an
  absolute position and a fixed size: the width of its label by `measureText` plus 12, and the
  button height. The status text has a fixed size from `measureText` as well, set each time its text
  changes. The status text and the button labels are in the label font, which has an outline.
- `onShow` stores a fresh `createNight()`, writes the status text, adds the background to the view,
  lays the screen out for its current size and opens a story window with the place's description.
- A scene button's `onClick` opens a story window with that spot's script, and the place button's
  opens one with the description. Both do nothing while a story window is open.
- A story window's `onClosed` clears `storyWindow` and writes the status text from `night`.
- `openStory` builds the window and calls `screen.ui.addOverlay(storyWindow)`.
- `onUpdate` calls `storyWindow.update(ticker.deltaMS)` when one is open. It opens the menu when the
  cancel command was pressed this frame and the overlay that was on top at the end of the screen's
  last update declares no `close`:
  `input.focusPressed('cancel') && lastTopOverlay?.close === undefined`. That holds with no overlay
  and with a story window on top, and not with the menu or the Options window on top. The screen
  judges by the last update's overlay because a frame of 100 ms, the length of a UI fade, can finish
  that overlay's close before `onUpdate`, and the overlay on top then is gone. `onUpdate` records
  the overlay on top after it applies the rule.
- The menu opens only while the screen is shown and no menu is open. Quit to menu hides the screen
  inside its click, and an Escape in the same frame still reaches `onUpdate`.
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
Quit to menu. It fades for 100 ms and declares Resume as its initial focus. Resume closes the modal.
Options and Quit to menu call `onOptions` and `onQuit`, and do nothing once the modal is closing.
The function adds the modal to `ui` as an overlay and returns it, as `openOptionsModal` does.

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
  warning in a production build. The narrowest phone fits 19 characters per line, so a test checks
  that no word in the sample content is longer than 16.
- **The screen is resized while a text types.** The window wraps the page again and hands the runner
  new page ends. The count of revealed characters is kept.
- **A press arrives during a fade.** While the window fades in, a press continues the text as it
  does afterwards. While new choices fade in, a tap on them reaches the press surface and does
  nothing. While the window fades out, the runner has ended and the window takes no press; the
  runner itself ignores `advance()` and `choose()` once it has ended. The menu's Options and Quit to
  menu do nothing once the menu is closing, so Escape and then Enter neither quits the night nor
  opens Options over a closing menu.
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
- An empty line counts as a line.
- A page size below 1 counts as 1.

**`tests/getSceneArea.test.ts`**

- A 480 × 270 screen gives `{top: 24, width: 480, height: 246}`.
- A 146 × 262 screen gives `{top: 40, width: 146, height: 222}`.
- A screen exactly 292 wide has the one-line top row, and one 291 wide has two lines.
- The top row width is 292: a margin, a place button holding the 14 characters that `getLabelRoom()`
  gives the place button on the narrowest screen, a margin, the status line's 24 characters, a
  margin, the Menu button and a margin.
- The status line's 24 characters hold `17:00   -1350 Kč   Sober`.

**`tests/getSpotPosition.test.ts`**

- A spot at 0.5 and 0.5 is centred in the area.
- A spot at the left, right or bottom edge is moved fully on screen, the margin away from that edge.
- A spot at `y` 0 starts at `area.top`, so it never covers the top row.
- The position is in whole pixels.
- A button wider than the screen starts at the left margin.

**`tests/night.test.ts`**

- `createNight()` returns the starting values, and a second call returns a separate object.
- `formatStatus()` gives `19:40   350 Kč   Sober` for the starting values, pads hours and minutes to
  two digits, and wraps past midnight.

Browser tests. The two night screen files boot the real game once each through `bootGame` in
`tests/nightScreenHelpers.tsx`. It sets the viewport, imports the page's stylesheet so that the
canvas fills the viewport, and renders the index route inside React's strict mode, as
`tests/mainMenu.browser.test.tsx` does. It returns the game modules a test needs, and the
`StoryWindow` class for a test that opens a window with a script of its own. The viewport is set
before the game modules are imported, because `Game` picks the pixel scale when its module is
evaluated. Headless Chromium has a device pixel ratio of 1. Both viewports give a pixel scale of 2,
the smallest, so that a frame draws as few pixels as the art allows: the frames of a headless
browser are slow, and several times slower on a busy machine. The helper file holds the JSX, so the
two test files are `.ts` files.

Vitest's browser server for Foam listens on port 63317, set through `.carson/project.json`. Foam's
and Somewhere's Vite configs both insist on their port, and the pull request checks run the two
apps' tests at the same time, so they cannot share the default port 63315.

**`tests/nightScreen.browser.test.ts`** uses a 960 × 540 viewport, which is 480 × 270 art pixels. It
watches the calls the real mixer receives and plays through the screen:

1. Activating New Game makes the night screen the current screen.
2. The description window is open, and its runner is on a node whose `speaker` is the place's name.
3. Right after opening, `text` is shorter than the page. One press of Enter makes it the whole page.
4. The `blip` buffer reaches the mixer on the `sfx` bus while the text types.
5. Enter on the last page of a node without choices closes the window, and after the fade
   `storyWindow` is `null`.
6. The press that opens a window does not finish its first page.
7. The marker is hidden while the text types and blinks when the page is complete. It sits after the
   last letter, also on a page that another page follows and after a line that fills the text width.
8. The status text is `19:40   350 Kč   Sober`.
9. Every scene button lies fully inside the screen and under the top row.
10. No two scene buttons overlap, at 480 × 270 and, computed with `getSceneArea` and
    `getSpotPosition`, at 146 × 262.
11. Activating a scene button opens its window. When the text is typed, the choice buttons carry the
    node's choice texts and no component has the focus.
12. Enter with no choice focused does nothing: the runner is still choosing.
13. An arrow key focuses the first choice, and Enter takes it. A choice leads to its node.
14. A choice taken with Enter, and a tap on a choice, do not also finish the next node's text.
15. A tap on the text finishes the page, and the next tap turns it. On a complete page of a node
    without choices, a tap on the marker turns the page, and so does a tap on the padding under the
    text.
16. The long text is shown in more than one page. The first page fills 16 lines, because a node
    without choices reserves no room under the text, and no page has more than 16.
17. After "Order a beer" and the closing of the window, the status text is `19:50   305 Kč   Sober`.
18. After a window closes, the focus is back on the button that opened it.
19. The place button opens the description again.
20. Escape in a story window leaves it open and opens the menu above it with Resume focused. The
    revealed count does not grow while the menu is open. Resume closes the menu, and the text goes
    on.
21. Escape on the scene opens the menu with Resume focused. Resume closes it.
22. Options opens the Options window over the menu. Escape closes it, and the menu is still open.
23. Quit to menu makes the main menu the current screen, and `storyWindow`, `menuModal` and
    `optionsModal` are `null`.
24. A second New Game shows the starting status and opens the description again.
25. No word in any text or choice of the fixed bar is longer than 16 characters. In
    `tests/content.test.ts` the content checker finds no problem in the game's places.
26. An arrow key moves the focus to the nearest scene button, and the click sound reaches the mixer
    on the `ui` bus.
27. A scene button and the place button do nothing while a story window is open.
28. A resize in the middle of the long text keeps the count of revealed characters, and the pages
    that follow fit the new window.
29. Hiding the screen with a story window open destroys the window at once, and the screen works
    when it is shown again.
30. A tap on the Menu button opens the menu, and a tap on Resume closes it.
31. The menu music is started once before Quit to menu, and once more when the main menu is shown
    again.
32. With no press, the choices appear when the text is typed to its end, and none is focused.
33. The window keeps its size when the choices appear and once they have faded in.
34. The window keeps its size on every page of the long text.
35. A resize while the choices are shown keeps the focus on the choice that had it.
36. A node without `speaker` has no title, and its window is shorter by the title's line and gap.
    Enter closes it.
37. Options, activated during the menu's closing fade after Escape, opens no Options window.
38. Quit to menu, activated during the menu's closing fade after Escape, leaves the night screen the
    current screen.
39. With Quit to menu focused, Enter and Escape in one frame show the main menu and leave no menu on
    the hidden night screen.
40. A tap on Quit to menu makes the main menu the current screen, and `storyWindow`, `menuModal` and
    `optionsModal` are `null`.
41. The background fills the screen.
42. A choice without a next node closes the window, and the status text keeps its values.
43. Escape closes the menu.
44. A tap under the text, in the room of the choices, finishes a page that is typing, and turns a
    complete page that another page follows.
45. A second tap under the text, right after the first one finished it, takes no choice while the
    choices fade in; once they are fully shown, a tap there takes the choice. The window keeps its
    size while the choices fade in.
46. A resize starts the fade of fading choices again and brings fully shown ones back at once.
47. A window attached again fades in the choices whose fade its detach cut short.

**`tests/nightScreenNarrow.browser.test.ts`** uses a 292 × 524 viewport, which is 146 × 262 art
pixels:

1. The status text lies under the place button.
2. Every scene button lies fully inside the screen and under the top row.
3. The story window is 138 wide and lies in the scene area.
4. The description takes more than one page, no page has more than 14 lines, and no line is wider
   than the text width.
5. The choice "Ask about the ceiling" wraps to two lines inside its button, and the window stays in
   the scene area.
6. Taps open a scene button's window, finish its text and take a choice once the choices are fully
   shown. A tap on the text does nothing while the choices are offered.
7. With no press, the description stops at the end of its first page: the window shows a full page
   of 14 lines, no button is built, nothing is focused, the marker blinks, and no more text appears.
8. The screen is 146 × 262 art pixels.

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
