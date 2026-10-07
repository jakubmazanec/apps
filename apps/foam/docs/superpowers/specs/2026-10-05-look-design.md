# The look (Foam phase 3): design

Date: 2026-10-05. App: `apps/foam`. Status: implemented by
[2026-10-05-look.md](../plans/2026-10-05-look.md). This is the second of the three specs of phase 3
of [the direction document](../../direction.md). The first is Tellurion's
[pixel scale](../../../../../docs/superpowers/specs/2026-10-05-pixel-scale-design.md), and the third
is [the picture](2026-10-05-picture-design.md).

## Background

Phase 3 starts from the result of phase 2 and of its review: Foam boots to a main menu, and New Game
opens the night screen, with its story window, its menu and its options window. Everything is drawn
with art copied from Somewhere.

These facts shape the design:

- **All UI art is one image.** `public/ui.png` is 146 × 150 pixels and holds 20 frames, which
  `public/ui.json` names. It is a copy of Somewhere's file.
  `apps/somewhere/scripts/generate-ui-atlas.mjs` draws that file's frames from a list of colours,
  except the panel, which it copies from an image drawn by hand.
- **The theme maps frames to components.** `source/game/core/theme.ts` names a frame for every state
  of every component, gives the buttons their padding, the scrim its colour and the two text roles
  their font and colour. Tellurion's `UiTheme` type requires every group, also for components Foam
  does not use.
- **A button shows its state by its background only.** Tellurion's `Button` swaps one of four
  frames: normal, hovered, active (pressed) and disabled. It does not change the colour of its
  label.
- **Focus is not a button state.** The screen's `UiRoot` draws one ring, a nine-sliced frame, around
  the component that has the keyboard focus, `padding` pixels outside its bounds. The ring shows
  after a focus key and hides after a pointer press.
- **A slider is a track and a fill.** The track is a frame drawn at its own size. The fill is a
  frame stretched from the left edge of the track to the value, over the track's whole height.
- **A panel can hold raw Pixi objects** as well as components.
- **The story window draws a page as one `Text`** in one font, and shows the typed part of the page
  by setting that text to a slice of the wrapped page.
- **The font is monogram.** Every letter is 6 art pixels wide and 12 high. `public/` holds four
  files: regular and italic, each with and without a black outline. All 577 glyphs advance 6 pixels
  in all four. The two italic files carry the regular font's name (`face="monogram"`). Pixi
  registers a font under the name it is loaded by and also under the name in its file, so loading
  them as they are would put an italic font in the regular font's place.

## Decisions (from brainstorming)

1. **No art is AI-generated.** A deterministic Node.js script draws the UI art, as in Somewhere. An
   AI may write the script.
2. **The UI art is new** and does not look like Somewhere's.
3. **One list of colours serves the UI and the pictures alike:** black, a dark indigo in several
   strengths, white, and rose as the one accent.
4. **Fills are black, and borders are one pixel.** Every window, button and text input has a
   one-pixel border in an indigo grey.
5. **A window's title sits inside the window,** in rose, with a rule under it.
6. **Hover and press show on the control itself. Focus is a ring around it:** one rose pixel, with
   one empty pixel between the control and the ring, as CSS draws an `outline` with an offset.
7. **A choice in the story window and an entry in the menu are buttons.** The focused one has the
   ring. There is no bar and no mark for a "selected" row.
8. **The slider keeps Somewhere's shape:** a bordered track and a solid fill, without a handle. The
   fill is white, and the value is written after the slider as a percentage.
9. **The mark that shows a press will continue the text is a rose block** after the last word, as a
   text cursor.
10. **The main menu has no window.** The name is set large, in monogram at four times its size, with
    the two buttons under it.
11. **Italic marks single words inside a sentence.** The author writes `*better*` in the text.
12. **The font stays monogram.** No other font is added.

## Design

### What the player sees

Everywhere:

1. Windows and buttons are black with a thin indigo-grey border. Text is white.
2. A button under the pointer has a dark indigo fill and a lighter border. A pressed button has a
   lighter indigo fill and a white border.
3. After an arrow key or Tab, a rose ring shows around the focused control, one pixel away from it.
   After a click or a tap the ring hides.
4. When a window is open, the screen behind it is dimmed by black at 60%.

Main menu:

5. "Foam" is set in letters 24 × 48 art pixels each, in the middle of a black screen. New Game and
   Options are two buttons of the same width under it.

Night screen:

6. The place button, the Menu button and the scene buttons are black with a border, on the
   placeholder picture, which has three bands in the new colours.
7. The status line is white with a black outline.

Story window:

```
┌──────────────────────────────────────────────────┐
│ A patron                                         │
│ ──────────────────────────────────────────────── │
│ He says he has been coming here since the place  │
│ opened, and that the beer was better then. He    │
│ points a finger at the ceiling and waits to see  │
│ if you will ask.                                 │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ Ask about the ceiling                        │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ Let him be                                   │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

8. The title is rose and has a rule under it. A node without a speaker has neither.
9. The word "better" is in italic.
10. While a press would continue the text, a rose block blinks after the last letter shown.
11. The choices are buttons with a border, 4 pixels apart. None is focused when they appear.

Menu and options:

12. The menu is a window with the title "Menu" and three buttons of the same width. It opens with
    the ring on Resume.
13. The options window has the title "Options", four rows and a Close button. A row is the name of
    the volume, a slider, and the value, such as `80%`. The value changes while the slider moves.

Error screen:

14. The error screen is a window with the title "Something went wrong" on a black screen.

### Files

| File                                           | Change                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/generate-ui-atlas.mjs`                | New. Draws `public/ui.png` and writes `public/ui.json`             |
| `public/ui.png`, `public/ui.json`              | Replaced by the script's output                                    |
| `public/monogram-italic.fnt`                   | `face="monogram-italic"`                                           |
| `public/monogram-italic-outline.fnt`           | `face="monogram-italic-outline"`                                   |
| `package.json`                                 | `fast-png` as a development dependency                             |
| `source/game/core/palette.ts`                  | New. The list of colours                                           |
| `source/game/core/theme.ts`                    | New frames, paddings, scrim, ring and text styles                  |
| `source/game/core/assets.ts`                   | Loads `monogram-italic`                                            |
| `source/game/core/getSceneArea.ts`             | Exports the button's padding                                       |
| `source/game/core/markedText.ts`               | New. Reads the italic marks                                        |
| `source/game/screens/windowTitle.ts`           | New. Builds a window's title and its rule; the window sizes        |
| `source/game/screens/storyWindow.ts`           | New sizes, the title block, two text leaves, the cursor            |
| `source/game/screens/nightScreen.ts`           | Button widths from the new padding; the status in the outline font |
| `source/game/screens/menuModal.ts`             | Title block, buttons of one width                                  |
| `source/game/screens/optionsModal.ts`          | Title block, rows with a value                                     |
| `source/game/screens/mainMenuScreen.ts`        | The large title and two buttons, without a panel                   |
| `source/game/screens/errorScreen.ts`           | Title block                                                        |
| `source/game/screens/placeholderBackground.ts` | Band colours from the palette                                      |
| `tests/fixedWorld.ts`                          | Two words in italic                                                |
| `tests/`                                       | See Testing                                                        |

No file under `apps/somewhere/` or `packages/tellurion/` changes.

### Palette (`core/palette.ts`)

One module holds every colour of the game. The script, the theme and the screens read it. The third
spec adds the picture's inks to the same list.

| Name     | Value     | Used for                                                |
| -------- | --------- | ------------------------------------------------------- |
| `black`  | `#000000` | Fills of windows, buttons and inputs; the scrim         |
| `ground` | `#1f1a2d` | Fill of a hovered button                                |
| `shade`  | `#2d2735` | Border of a disabled control                            |
| `line`   | `#463c5c` | Borders, rules; fill of a pressed button                |
| `dim`    | `#8479a0` | Border of a hovered control and of the toggle; dim text |
| `white`  | `#ffffff` | Text; the slider's fill; the toggle's mark              |
| `rose`   | `#ff1b64` | Titles, the focus ring, the cursor                      |

`ground`, `shade`, `line` and `dim` are four strengths of one indigo. `shade` is too close to black
to draw a border that stays visible under the CRT filter, so borders use `line`.

The module exports the colours as numbers, as Pixi takes them:

```ts
export const palette = {
  black: 0x000000,
  ground: 0x1f1a2d,
  shade: 0x2d2735,
  line: 0x463c5c,
  dim: 0x8479a0,
  white: 0xffffff,
  rose: 0xff1b64,
} as const;
```

### UI art (`scripts/generate-ui-atlas.mjs`)

The script follows Somewhere's: it builds each frame pixel by pixel from the palette, stacks the
frames in one sheet with one transparent pixel between them, makes the sheet as wide as its widest
frame, encodes the sheet with `fast-png`, and writes `public/ui.png` and `public/ui.json`. Running
it again writes the same bytes. It reads no image file: every frame is drawn by the script.

It imports the colours from `source/game/core/palette.ts`. Node runs a TypeScript file of that kind
as it is; the repository requires Node 24.

The script has two parts: a function that returns the image bytes and the JSON text, and a few lines
that write them, asynchronously, when the file is run with `node scripts/generate-ui-atlas.mjs`. A
test calls the function and compares its result with the two files in `public/`, so the committed
art cannot differ from what the script draws.

| Frame                     | Size   | Nine-slice border | Drawing                                             |
| ------------------------- | ------ | ----------------- | --------------------------------------------------- |
| `window`                  | 3 × 3  | 1                 | `line` border, `black` centre                       |
| `button-normal`           | 3 × 3  | 1                 | `line` border, `black` centre                       |
| `button-hovered`          | 3 × 3  | 1                 | `dim` border, `ground` centre                       |
| `button-active`           | 3 × 3  | 1                 | `white` border, `line` centre                       |
| `button-disabled`         | 3 × 3  | 1                 | `shade` border, `black` centre                      |
| `text-input-normal`       | 3 × 3  | 1                 | `line` border, `black` centre                       |
| `text-input-hovered`      | 3 × 3  | 1                 | `dim` border, `black` centre                        |
| `text-input-disabled`     | 3 × 3  | 1                 | `shade` border, `black` centre                      |
| `toggle-unchecked`        | 8 × 8  | none              | `dim` border, `black` inside                        |
| `toggle-checked`          | 8 × 8  | none              | The same, with a 4 × 4 `white` square in the middle |
| `toggle-hovered`          | 8 × 8  | none              | `white` border, `black` inside                      |
| `toggle-hovered-checked`  | 8 × 8  | none              | The same, with the `white` square                   |
| `toggle-disabled`         | 8 × 8  | none              | `shade` border, `black` inside                      |
| `toggle-disabled-checked` | 8 × 8  | none              | The same, with a `line` square                      |
| `slider-track`            | 64 × 8 | none              | `line` border, `black` inside                       |
| `slider-track-hovered`    | 64 × 8 | none              | `dim` border, `black` inside                        |
| `slider-track-disabled`   | 64 × 8 | none              | `shade` border, `black` inside                      |
| `slider-fill`             | 4 × 4  | none              | `white`                                             |
| `focus-ring`              | 3 × 3  | 1                 | `rose` border, transparent centre                   |
| `rule`                    | 1 × 1  | none              | `line`                                              |
| `cursor`                  | 5 × 9  | none              | `rose`                                              |

All corners are square. The frame `banner` becomes `window`, and `advance-marker` becomes `cursor`.

Foam has no toggle and no text input on any screen. Their frames are drawn because the theme type
requires them.

### Theme (`core/theme.ts`)

- **Button:** the four frames above. Padding is 2 above and below and 6 left and right.
  `pressOffset` is left out, so a pressed label does not move.
- **Text input, slider, toggle:** the frames above.
- **Panel:** `window`.
- **Modal:** the scrim is `black` at 0.6.
- **Focus ring:** `focus-ring`, with a padding of 2. The ring is one pixel thick, so one empty pixel
  lies between it and the control.
- **Text:** both roles, `label` and `body`, are `monogram` at size 12 in `white`. Text that lies on
  the picture, which is the status line, is given `monogram-outline` where it is created.

### Fonts and italic words

**Font files.** In `monogram-italic.fnt` the `info` line says `face="monogram-italic"`, and in
`monogram-italic-outline.fnt` it says `face="monogram-italic-outline"`. Nothing else in the files
changes. If they are exported again from a tool, the name is set there.

**Loading.** `assets.ts` adds `'monogram-italic': ['monogram-italic.fnt']` to the fonts of the
`default` bundle. The outlined italic file is not loaded: nothing uses it yet.

**Marks in the text.** A `*` in a node's `text` switches italic on, and the next `*` switches it
off. The marks are not shown. They are read in a node's text only, not in its speaker and not in a
choice.

**`core/markedText.ts`** has two pure functions:

```ts
export const MARK = '*';

/** Returns the text without its marks. */
export function stripMarks(text: string): string;

/**
 * Splits a piece of a marked text into what the regular font and the italic font each show. Both
 * results have one character for every character of the piece that is not a mark: the letter where
 * that font draws it, and a space where the other font does. Line ends stay in both.
 */
export function splitMarked(
  text: string,
  start: number,
  end: number,
): {regular: string; italic: string};
```

`splitMarked` counts the marks before `start` to know whether the piece begins in italic, so a page
that starts inside an italic passage is right. It steps through the piece by UTF-16 unit, the unit
`start` and `end` count in, so an emoji, which is two units, gives two characters in both results
and the two leaves stay aligned.

**In the story window:**

1. The runner keeps the marks: they are characters of its text, and its revealed count includes
   them. A mark therefore costs one step of typing, 25 ms, and shows nothing.
2. The text is wrapped with a measure that ignores marks, `(text) => measureText(stripMarks(text))`,
   so a line holds as many letters as without them. `wrapText` adds and removes no character, so
   page breaks and the revealed count keep pointing at the same places.
3. The window has two text leaves of the same size at the same place, one in `monogram` and one in
   `monogram-italic`. For the shown slice of the page, `splitMarked` gives each leaf its string.
   Every letter is 6 pixels wide in both fonts, so each letter lands where it would in one text.
4. The blip counts letters only: marks are skipped as spaces are.
5. `StoryWindow.text`, which the tests read, is the shown text without marks.

A text with an odd number of marks is an author's mistake: everything after the last mark is italic.
`tests/checkContent.test.ts` reports such a text.

### Window title (`screens/windowTitle.ts`)

```ts
/** A window's title in rose and the rule under it, as one child for a panel. */
export function createWindowTitle(text: string, width: number): Container;
```

It returns a Tellurion `Container` with two children in a column, 2 pixels apart: a `Text` with the
`rose` fill, `width` wide and 12 high, and a Pixi sprite of the `rule` frame, `width` wide and 1
high. The block is 15 pixels high. Every window with a title uses it.

The module also holds the sizes every window shares: `WINDOW_PADDING_X` (12), `WINDOW_PADDING_Y`
(8), `WINDOW_PADDING`, which is the four paddings as a panel's layout takes them, and `TITLE_HEIGHT`
(15). Every window takes its padding from there, and the story window counts the title block's
height with `TITLE_HEIGHT`.

### Layout constants

In art pixels.

| Constant                              | Value                                |
| ------------------------------------- | ------------------------------------ |
| Button padding                        | 2 above and below, 6 left and right  |
| Button height, one line               | 16                                   |
| Window padding                        | 8 above and below, 12 left and right |
| Title                                 | 12, 2, the rule of 1, then 4         |
| Between the text and the first choice | 8                                    |
| Between two buttons in a window       | 4                                    |
| Story window width                    | 300 at most                          |
| Scrim                                 | Black at 60%                         |
| Slider                                | 64 × 8                               |

What follows from them:

| Screen in art pixels | Letters per line in the story window | Lines per page, with a title and no choices |
| -------------------- | ------------------------------------ | ------------------------------------------- |
| 480 × 270            | 46                                   | 16                                          |
| 195 × 350            | 27                                   | 22                                          |
| 146 × 262            | 19                                   | 14                                          |

A button is as wide as its label plus 12. On a 146-pixel screen the place button therefore holds 14
letters, and on a 195-pixel screen it holds 22. The longest label of the fixed bar, "Two women
talking", makes a button 114 wide, which fits both.

Buttons in a window are 4 apart so that the ring of one, which reaches 2 pixels out, does not touch
the next button.

### Limits on a narrow screen

Under the scale rule of the first spec, a phone held upright is about 180 to 240 art pixels wide.
The tests keep a window of 146 × 262 as the narrowest case.

| Thing                         | Width                    | At 180 and more | At 146                                    |
| ----------------------------- | ------------------------ | --------------- | ----------------------------------------- |
| Story window                  | The screen less 8        | Fits            | Fits; 19 letters per line                 |
| A choice's label              | The text's width less 12 | 22 letters      | 17 letters, then it wraps                 |
| Place button beside Menu      | The label plus 12        | 20 letters      | 14 letters                                |
| Menu window                   | 108                      | Fits            | Fits                                      |
| Options window                | 160                      | Fits            | 7 past each side of the screen; see below |
| Error window                  | 144                      | Fits            | Fits, 1 from each side                    |
| Main menu's title and buttons | 96                       | Fits            | Fits                                      |

The options window is the one thing that does not fit 146: its two side borders lie off the screen.
Every name, slider and value is on the screen, from 5 to 141. A screen that narrow is a browser
window under 300 device pixels wide, not a phone, so the window gets no second layout.

A label that is longer than its button allows is neither wrapped nor cut on the scene.

### Story window (`screens/storyWindow.ts`)

The window keeps its behaviour: how it opens and closes, what a press does, where its size comes
from, and that the size stays the same for a whole node. What changes:

- **Sizes.** The constants above. The room for text is the height of the scene area, less the
  margins (8), the window's padding (16), the title block and the gap under it (19, when the node
  has a speaker) and the room of the choices (8, each button, and 4 between two buttons).
- **Title.** `createWindowTitle(node.speaker, textWidth)` replaces the title text.
- **Text.** A `Container` of the text's width and height holds the two leaves, both placed at its
  top left corner. `#showRevealed` sets both from `splitMarked`.
- **Choices.** The buttons are as wide as the text and get the new padding, so a label is wrapped to
  the text's width less 12.
- **Cursor.** The marker sprite uses the `cursor` frame and sits after the last letter shown. Take
  the shown text without marks, and drop a line end at its very end: a page that is followed by
  another ends with one. `line` is then the number of line ends and `column` the number of letters
  after the last one. The cursor's left top corner is at `column × 6 + 2` and `line × 12 + 2` from
  the text's left top corner. It blinks on for 500 ms and off for 500 ms, while the runner is idle.
  A line that is full puts the cursor up to 7 pixels past the text, inside the window's padding
  of 12.
- **Press surface.** Unchanged. It covers the text and, for a node without choices, the rest of the
  window, so a tap on the cursor continues the text.

### Night screen (`screens/nightScreen.ts`)

- Button widths use the padding exported by `getSceneArea.ts`.
- The status text is created with `fontFamily: 'monogram-outline'`. The labels of buttons are in the
  plain font, which the theme gives them.
- Nothing else changes: the positions of the top row, the scene buttons at their fractions, the
  two-line top row below 292.

### Menu (`screens/menuModal.ts`)

The panel has the window padding, a column with a gap of 4 and `alignItems: 'stretch'`. Its children
are the title block and the three buttons. The buttons are as wide as the widest label plus 12, so
the window is 108 wide. The title block gets that inner width, 84.

### Options (`screens/optionsModal.ts`)

The panel has the window padding and a column with a gap of 4. Its children:

1. The title block, 136 wide.
2. Four rows, each 12 high: the name in a column 36 wide, the slider, and the value in a column 24
   wide, with 6 between them. The slider is 64 wide and 8 high and sits in the middle of the row. A
   row is 136 wide, and the window 160.
3. The Close button, 8 under the last row, as wide as the rows.

The value is a `Text` that the slider's `onChange` sets to the rounded percentage, such as `80%`. It
is created with the stored value.

### Main menu (`screens/mainMenuScreen.ts`)

The panel goes. The UI root's view centres a column with three children:

1. The title: `new Text({text: 'Foam', theme, fontSize: 48})`, 96 × 48.
2. New Game, 24 under the title.
3. Options, 6 under New Game.

Both buttons are 96 wide, and their labels are centred. The third spec puts the picture behind the
menu and a black plate behind the title.

### Error screen (`screens/errorScreen.ts`)

The panel gets the window padding, and `createWindowTitle('Something went wrong', 120)` replaces the
title text. The message's wrap width is 120, the width of the title. The window is then 144 wide and
fits a screen of 146. The comment above the wrap width explains these numbers.

### Placeholder background (`screens/placeholderBackground.ts`)

The three bands take `ground`, `shade` and `line` from the palette, from top to bottom. The third
spec replaces the class.

### Sample content (`tests/fixedWorld.ts`)

Two words get marks, so that italic is seen and tested: `*better*` in the patron's `talk` node, and
`*Nobody*` in "Nobody upstairs had moved a bed in thirty years" in his `ceiling` node. The second
lies on a later page of the long text.

### Where this differs from the mockups

The mockups of the brainstorming were drawn by a throwaway script. Five points differ:

- **A pressed button** was white with black text in the mockup. Tellurion's `Button` cannot recolour
  its label, and white text on white cannot be read. A pressed button is therefore a lighter indigo
  fill with a white border, and its label stays white.
- **A disabled button** was drawn with dim text. The frame dims by itself; the label does not. Foam
  has no disabled button. A screen that disables one gives its label the `dim` colour.
- **Spacing** is rounded to steps of 2 and 4: a window's padding is 8 above and below, where the
  mockup had 6 above and 10 below.
- **The choices** are as wide as the text. In the mockup they reached 4 pixels further out on each
  side.
- **The slider** is 64 wide, where the mockup had 96. With its name and its value, a slider of 96
  makes a window of 192, which does not fit a phone of 180 to 195 art pixels.

## Error handling

- **A frame the theme names is missing from the atlas.** `GameTheme.resolve()` fails inside
  `Game.init()`, and the page shows the line for a game that cannot start. The test that compares
  the script's output with `public/` and the test that checks every name of the theme against
  `ui.json` catch it earlier.
- **A font file cannot be loaded.** The boot fails with the same line.
- **A text has an odd number of marks.** The rest of the text is italic. Nothing throws.
- **A text has no marks.** The italic leaf is empty.

## Testing

Unit tests, in Node:

- `markedText`: no marks; one italic word; two; a piece that starts inside italic; a piece that ends
  inside italic; line ends kept in both results; both results as long as the piece without marks;
  one character in both results for each UTF-16 unit of an emoji; an odd number of marks.
- The UI atlas: the function's image bytes and JSON text equal `public/ui.png` and `public/ui.json`;
  two calls give the same bytes; every frame the theme names exists in the JSON; every frame lies
  inside the image and no two overlap; every frame's borders fit inside it; every opaque pixel is a
  colour of the palette.
- The game's places: the content checker finds no text with an odd number of marks.
- The tests of `getSceneArea`, `getSpotPosition`, `getPageBreaks` and `night`.

Browser tests of the parts and sizes:

- **The helper `getWindowParts`** in `tests/nightScreenHelpers.tsx` finds the title in the title
  block, the text in its container of two leaves, and the buttons. It returns both leaves and the
  cursor. Every story window test goes through it.
- **Numbers that come from the paddings:** a scene button's width is its label plus 12; a window
  without a title is shorter by 19; the text is 268 wide at 300 art pixels of screen width; on the
  narrow screen the text is 114 wide and a choice's label 102; a page has at most 16 lines, and on
  the narrow screen at most 14.
- **The cursor** lies just after the last letter of the complete page, inside the window, on a page
  that is followed by another, where the shown text ends with a line end, and on a last page.
- **A tap on the cursor** turns the page.
- **"no word in the sample bar is longer than 16 characters"** counts without marks.
- Tests that compare the window's text with the text of the fixed bar compare without marks.
- The main menu's tests find its buttons, which have no panel around them.
- The options window's tests find the sliders in their rows.

Comments that state the scale rule of the first spec:

- `tests/nightScreenNarrow.browser.test.ts` says that a phone held upright is about 180 to 240 art
  pixels wide, so 146 × 262 is a window narrower than any phone, kept as the smallest case.
- `tests/nightScreenHelpers.tsx` says above `bootGame` that `Game` picks its scale from the width
  and the height of the window.
- `source/game/screens/errorScreen.ts` explains its wrap width as the section on the error screen
  above says.

Browser tests of the italic words, the cursor, the ring, the menus and the narrow screen:

- The italic word of the patron's `talk` node is drawn by the italic leaf, and the regular leaf has
  spaces in its place. Its left edge lies where that column of the line starts.
- The long text has its italic word on the right page, and a page that follows it is not italic.
- The cursor is hidden while the text types and blinks when the page is complete.
- The focus ring's bounds are 2 pixels outside the focused button on every side.
- Two buttons in the menu are 4 apart.
- The value after a slider follows the slider.
- The main menu's title is 96 × 48, and both buttons are 96 wide.
- On the narrow screen the story window is 138 wide and the place button fits beside the Menu
  button.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --filter=tellurion --filter=somewhere --concurrency=1
```

Checks in the running app, by the author:

- The look of every screen in a wide window and on a phone held upright, under the CRT filter.
- Whether the one-pixel borders and the italic words stay readable under the filter's lines and
  noise.
- Whether the buttons on the picture are easy enough to tap on a phone.

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed.
- `node scripts/generate-ui-atlas.mjs` leaves `public/ui.png` and `public/ui.json` unchanged.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

At the review, the direction document is brought in line: its line on long names says that the place
button holds 17 letters on a phone, which becomes 14 on a screen of 146 and 20 or more on a phone.

## Non-goals

- The picture of the place, its movement, and the picture behind the main menu (the third spec).
- The pixel scale on phones (the first spec).
- A phone or any other real-world object as UI (phase 8).
- Italic in choices, titles or the status line; a way to write a literal `*`; the outlined italic
  font.
- A button whose label changes colour with its state, which would be a change to Tellurion.
- A toggle or a text input on any screen.
- New sounds or music.
- A setting for the colours.

## Rejected

- **Colours.** A list of eight pure colours for everything: black, white, and red, magenta and cyan
  in two strengths each; and that list for the picture with the present one for the UI. The author
  chose one list for both.
- **Frames.** A one-pixel frame with the title set into its top line; a frame that is a band of
  checkerboard dots; and no borders at all, with focus as a solid rose fill. The author chose black
  fills with borders, titles inside, and focus as a ring.
- **Slider.** A thin bar with a handle taller than the bar; a rose fill, which runs together with
  the rose ring; a grey fill.
- **Main menu.** A window on black; the same window on the picture.
- **Italic.** A whole text in italic, which is tiring over a full page and can be added later for
  the author's voice; italic window titles.
- **Who makes the art.** The author drawing it by hand; art from an image model, which is ruled out.
