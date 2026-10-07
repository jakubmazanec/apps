# Story window controls (Foam, after phase 2): design

Date: 2026-10-04. App: `apps/foam`. Status: implemented. It follows from the review of phase 2 and
changes the screen that [phase 2](2026-10-04-game-screen-design.md) built.

## Background

Phase 2 built the night screen. Its story window is a Tellurion `Modal` with a panel, driven by a
`Dialogue` runner. A focused Continue button turns the pages, and when the last page of a node with
choices is typed, the choices take Continue's place and the first one takes the focus.

The review of phase 2 found three things to change:

- **A press meant for Continue takes the first choice.** Enter twice, a double tap on Continue, or a
  text that ends just before a press all confirm a choice the player has not read. Somewhere's
  dialogue box does not have this: it has no Continue button. The player continues by pressing on
  the text, a small marker shows when a press will continue, and a press on the text is dropped
  while choices are offered.
- **Escape closes a story window, and a touch player has no Escape.** A keyboard player can read the
  choices and leave at no cost; a touch player cannot.
- **The menu opens with Resume focused and nothing marks it.**

Tellurion's rule for overlays is that declaring `close` is what makes the cancel command dismiss an
overlay. `Modal` always declares it. Somewhere's dialogue box is an overlay class of its own that
declares none, and Somewhere's world screen opens its pause menu on the cancel command whenever the
topmost overlay declares no `close`, so the pause menu opens above the dialogue box.

## Decisions

1. **The story window has no Continue button.** A press on the text or on the room under it, where
   the choices appear, or Enter or Space, continues the text. A press on the text and a press in the
   room under it, at the same moment, do the same. A marker shows when a press will continue.
2. **The choices are the window's only buttons, and they appear with nothing focused.** A tap takes
   one. The first arrow or Tab press focuses the first choice, and Enter or Space takes the focused
   one. New choices fade in over 100 ms and take a tap only once fully shown: the first tap of a
   double tap under the text can finish the text, and the choices then appear under the finger. A
   second tap that lands within the fade, about 100 ms after the choices appear, reaches the press
   surface and does nothing; a later second tap takes the choice under it. Keys need no such time:
   the choices appear with nothing focused, so a second Enter does not take one.
3. **Nobody closes a story window before its end.** It ends through its text or through a choice.
   Every node with choices offers a way out that costs nothing; this is a rule for the content.
4. **The story window is an overlay of its own, without `close`,** as Somewhere's dialogue box is.
   It draws its own scrim and runs its own fade.
5. **Escape opens the menu, also above a story window.** The text waits while the menu is open.
6. **The menu declares Resume as its initial focus.** With the Tellurion addition
   [overlay initial focus](../../../../docs/superpowers/specs/2026-10-04-ui-overlay-initial-focus-design.md)
   the menu then opens with the ring on Resume.

These stay as phase 2 built them: a touch player cannot open the menu while a story window is open,
because the Menu button lies under the dimmed scene; the description opens by itself at every New
Game; the main menu opens with nothing focused.

Rejected:

- **Only taking the focus off the first choice.** It does nothing for a tap on the spot where
  Continue was.
- **A row of its own for Continue under the choices.** It does nothing for keys, and it costs two
  lines of text per page on every node with choices.
- **A close mark in the window's corner, or closing by a tap on the dimmed scene.** Both keep the
  early way out and give it to touch players too. The window was made impossible to leave early
  instead.
- **Keeping Escape as a way out for keys only.** The two inputs would stay unequal.
- **A `Modal` that the cancel command passes over,** through a flag on the `Overlay` type or a
  `cancel` method on overlays. Both redefine the rule that declaring `close` is what makes an
  overlay dismissible, which Tellurion's overlay spec of 2026-09-25 decided and which Somewhere's
  world screen reads when it opens its pause menu.
- **Tellurion's `DialogueBox` as the story window.** It has no Continue button and is not
  dismissible, but it is a bottom bar with a fixed height, without a scrim or a fade, with one font,
  and it always focuses its first choice.
- **A scrim component or a second general overlay class in Tellurion.** One user does not justify
  either; the window draws its own scrim and runs its own fade.

## Design

### What the player sees

1. A scene button, or the place button, opens the window with a 100 ms fade, and the scene is
   dimmed. The window has a title and a text that types out with the blip sound.
2. A tap or click on the text or on the room under it, where the choices appear, or Enter or Space,
   finishes the page that is typing. When the page is complete, the same press turns the page, or
   closes the window after the last page of a node without choices.
3. While such a press would turn the page or close the window, a small marker blinks after the last
   letter of the page. It is hidden while text types and while choices are offered.
4. When the last page of a node with choices is typed, the choices appear in room that was reserved
   from the start. None is focused. They fade in over 100 ms and take a tap once fully shown.
5. A tap or click on a choice takes it. The first arrow or Tab press focuses the first choice; Enter
   or Space takes the focused one.
6. While choices are offered, a tap on the text, between two choices or on choices that are still
   fading in does nothing, and Enter or Space does nothing as long as no choice is focused.
7. A choice leads to its next node, or closes the window if it has none. When the window closes, the
   focus returns to the button that opened it, and the status shows the current values.
8. Escape does not close the window. It opens the menu above it. While the menu is open the text
   does not type and the window takes no press. Resume or Escape closes the menu and the text goes
   on; Quit to menu shows the main menu.
9. The menu opens with Resume focused. With the Tellurion addition the focus ring is on Resume when
   the menu opens, whatever opened it.

A page of a node with a title and no choices holds 46 characters × 16 lines on a 480 × 270 screen
and 19 × 14 on a 146 × 262 screen. A node with two one-line choices keeps 13 and 11 lines.

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

**An overlay without `close`.** `StoryWindow` implements `Overlay` and declares no `close`, so the
cancel command passes over it. It does not add itself: the night screen calls
`screen.ui.addOverlay(storyWindow)`, and `UiRoot` calls `attach` and `detach`. The option `ui` and
the member `modal` of phase 2 are gone.

**View.** `view` covers the screen: it is positioned absolutely at 0, 0 with 100 % width and height,
centres its content and has `area.top` as top padding, as the `Modal` of phase 2 had. Its first
child is a scrim, a rectangle in the theme's `modal.scrimColor` and `modal.scrimAlpha` that takes
every pointer event. Its second child is the `Panel`, the only entry of `children`.

**Fade and state.** The state starts as `closed`. `attach` records the root, sets the state to
`opening`, sets the view's alpha to 0 and fades it to 1 in 100 ms on the scheduler with
`easeOutQuad`; the state is then `open`. Choices whose fade a detach cancelled fade in again from
the start. When the runner has ended, the window sets the state to `closing` and fades to 0; when
the fade is over it calls `ui.removeOverlay(this)`, destroys itself and calls `onClosed`. `detach`
cancels the running fades, the window's and the choices', forgets the root and sets the state to
`closed`. `destroy()` leaves the root if the window is still attached and destroys the view at once,
from any state, without the fade and without calling `onClosed`; a second call does nothing.
`attach` throws when the window is already attached, and `detach` when it is not, as `Modal` does.

**Showing a node.** As in phase 2, with these differences:

- A node without choices reserves no room under the text. The lines per page are what remains of
  `area.height − 2 × margin` after the padding and the title, divided by the line height.
- A node with choices reserves the window gap and the room its choices need, as before.
- No Continue button is built, and nothing is focused.

**The marker.** A `pixi.Sprite` with the texture `cursor` of the `ui` spriteset, a solid rose
rectangle of 5 × 9 art pixels, placed out of the layout flow in the panel's coordinates, after the
last letter shown. On a page that another page follows, it stays on the page's last line. It is
visible while the runner's phase is `idle` and the blink is on; the blink turns every 500 ms of
`update` time and starts in the on state whenever the phase becomes `idle`.

**Every frame.** `update` does nothing unless the window's state is `open` or `opening` and the
window is the topmost overlay of its root. Otherwise:

1. If Enter or Space went down this frame (`input.focusPressed('activate')`), no component has the
   focus and this is not the window's first `update`, the window continues the text. The first
   `update` is left out because the press that opened the window is still the frame's press. A press
   that a focused choice took leaves the focus on that choice until the window shows the next node,
   so it does not continue the next text.
2. It ticks the runner, shows the node again when the runner is on another node or page, shows the
   revealed text and plays the blips, as in phase 2.
3. When the runner is choosing and the choices are not built yet, it builds one button per visible
   choice and focuses none. It fades them in over 100 ms on the scheduler with `easeOutQuad`. While
   they fade, the button area takes no pointer events (`eventMode` is `'none'`); after the fade it
   takes them again (`'passive'`, Pixi's default).
4. It shows or hides the marker.
5. When the runner has ended, it starts the closing fade.

**Continuing the text.** A tap on the press surface and the key rule of step 1 call the same
function. It calls `dialogue.advance()` unless the runner is choosing, where `advance()` would take
the first choice, and unless the state is `closing` or `closed`.

The press surface spans the panel's width from its top edge. For a node without choices it reaches
the panel's bottom edge, so a tap on the marker or on the padding around it continues the text. For
a node with choices it reaches the bottom of the room the choices fill, without the panel's bottom
padding, so a tap in that room does what a tap on the text does at the same moment. The surface
draws nothing and lies above the title and the text and under the choices: Pixi's hit test stops at
the first part under a tap, interactive or not, so a letter drawn above the surface would keep a tap
from it. The marker lies on top and takes no pointer events. The surface is a container of its own
beside the choices, not their parent, so a tap on a choice does not reach it; a tap between two
choices does, and does nothing while the runner is choosing.

**Resizing.** As in phase 2: it stores the area, sets the top padding and shows the current node
again. When one of the choices had the focus, the choice at the same position has it afterwards.
Choices that were fully shown come back fully shown and take a tap at once; choices that were fading
in start their fade again. A window that is not attached only stores the area.

### Night screen (`screens/nightScreen.ts`)

- `openStory` builds the window and calls `screen.ui.addOverlay(storyWindow)`.
- `onUpdate` opens the menu when the cancel command went down this frame and the topmost overlay
  declares no `close`: `input.focusPressed('cancel') && screen.ui.topOverlay?.close === undefined`.
  That holds with no overlay and with a story window on top, and not with the menu or the Options
  window on top.
- `openMenu` opens the menu also while a story window is open. It refuses only while the screen is
  not shown and while a menu is open.
- `onHide` destroys the Options window, the menu and the story window, in that order, as before.

### Menu (`screens/menuModal.ts`)

The Resume button is built before the modal and passed as `initialFocus`. The call
`ui.focus(resumeButton)` after `addOverlay` is gone. Resume's `onClick` closes the modal through a
variable that is assigned when the modal is built.

### Key bindings (`core/input.ts`)

The comment on `cancel` says what it does: it closes the menu or the Options window when one is on
top, and otherwise opens the menu, also above a story window.

### Sample content (`tests/fixedWorld.ts`)

Every node with choices of the fixed world's bar offers a way out that costs nothing: "Leave her
alone", "Ignore him", "Let him be" and "Stay".

## Error handling

- **A press arrives during a fade.** While the window fades in, a press continues the text as it
  does afterwards. While it fades out, the runner has ended and the window takes no press.
- **A double tap under the text.** The first tap finishes the text, and the runner offers the
  choices at once. A second tap that lands within the fade, about 100 ms after they appear, reaches
  the press surface and does nothing, as a second tap on the text does; a later second tap takes the
  choice under it.
- **The screen is hidden with a window open.** `onHide` destroys every open window at once.
- **The menu is open above a story window and the player quits.** `onHide` destroys the menu and
  then the window.
- **A script points at a node that does not exist, or a word is wider than the text.** As in
  phase 2.

One limit is known and left as it is. After a choice is taken with Enter, the UI root's focus still
points at the removed choice button, and Tellurion drops such a focus only at the next focus
command. When the next node offers choices, the first arrow or Tab press therefore does nothing that
can be seen, and the second one focuses the first choice. Enter and Space are not affected. The same
holds after a tap on the text finished it. A resize while the menu is open above the window loses
which choice had the focus.

## Testing

`tests/nightScreenHelpers.tsx` follows the new window: its parts are read from
`storyWindow.children`, there is no Continue button, and `readPages` presses Enter as before. Its
parts include the button area and the press surface. `tapNow` sends a tap straight to the canvas,
which Pixi handles at once, with no frame in between, and `waitForChoices` waits until the choices
are fully shown.

`tests/nightScreen.browser.test.ts` keeps the checks of phase 2 that still apply and changes or adds
these:

1. The window is the topmost overlay of the screen and declares no `close`.
2. While text types, the window has no button and the marker is hidden. Enter finishes the page.
3. On a complete page that a press would turn or close, the marker becomes visible; while choices
   are offered it stays hidden.
4. Enter on the last page of a node without choices closes the window, and after the fade
   `storyWindow` is `null`.
5. When the text of a node with choices is typed, the choice buttons carry the node's choice texts
   and no component has the focus.
6. Enter with no choice focused does nothing: the runner is still choosing and the night's state is
   unchanged.
7. An arrow key focuses the first choice, and Enter takes it.
8. A choice taken with Enter leaves the next node's text typing: the press does not finish it.
9. The press that opens a window does not finish its first page.
10. Escape in a story window leaves the window open, opens the menu above it and focuses Resume. The
    revealed count does not grow while the menu is open. Resume closes the menu, the window is the
    topmost overlay again and the text goes on.
11. Quit to menu from a menu above a story window makes the main menu the current screen, and
    `storyWindow`, `menuModal` and `optionsModal` are `null`.
12. The menu opens with Resume focused and the focus ring shown, after Escape and after a tap on the
    Menu button.
13. A page of a node without choices has at most 16 lines, and the long text takes more than one
    page.
14. A resize keeps the focus on the choice that had it, after an arrow key focused it.
15. With no press, the choices appear when the text is typed to its end, with nothing focused.
16. A tap on a choice does not also finish the next text. The test taps each choice once the choices
    are fully shown.
17. A tap on the text finishes the page, and the next tap turns it.
18. On a complete page of a node without choices, a tap on the marker turns the page, and so does a
    tap on the padding under the text.
19. A tap under the text, in the room of the choices, finishes a page that is typing, and turns a
    complete page that another page follows.
20. A second tap under the text, right after the first one finished it, reaches the press surface
    and not the choice that appeared under it, and takes nothing. Once the choices are fully shown,
    a tap there takes the choice. The window keeps its size while the choices fade in and
    afterwards.
21. A resize starts the fade of fading choices again and brings fully shown ones back at once.
22. A window attached again fades in the choices whose fade its detach cut short.

Checks 8, 16, 17 and 18 use the long text, whose pages take more than ten seconds to type, so that a
tap of a few seconds cannot be mistaken for the text finishing by itself. Check 19 uses a window the
test builds, whose node has two pages and two choices and whose pages each take more than ten
seconds to type, for the same reason. Check 20 taps with `tapNow` and calls `update` itself, and
check 21 calls `advance`, `update` and `resize` itself, and check 22 `advance`, `update`,
`removeOverlay` and `addOverlay`, so no frame runs before they look and the fade cannot end first.

The checks of phase 2 that Escape closes a story window, and that a press during the closing fade
after Escape does not reach the choices, are gone with the behaviour.

`tests/nightScreenNarrow.browser.test.ts`:

1. A page of the description has at most 14 lines.
2. Taps open a scene button's window, finish its text on a tap on the text, and take a choice once
   the choices are fully shown. A tap on the text does nothing while the choices are offered.
3. With no press, the description stops at the end of its first page and the marker becomes visible.

Commands, run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
npm run develop --workspace foam
```

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- No file under `apps/somewhere/` has changed, and `packages/tellurion/` has changed only as its own
  spec says.

## Non-goals

- A way for a touch player to open the menu while a story window is open.
- Skipping the description on arrival.
- A marked default on the main menu.
- A test for the rule that every node with choices offers a way out that costs nothing; costs come
  with phase 4.
- The look of the marker, the scrim and the window (phase 3).
