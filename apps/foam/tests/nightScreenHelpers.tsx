import * as pixi from 'pixi.js';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {
  Button,
  Container,
  type Focusable,
  type Game,
  type Modal,
  Panel,
  Slider,
  Text,
} from 'tellurion';
import {vitest} from 'vitest';
import {page, userEvent} from 'vitest/browser';

import {nightStart} from '../source/game/content/nightStart.js';
import {type assets as assetsValue} from '../source/game/core/assets.js';
import {type measureText as measureTextValue} from '../source/game/core/measureText.js';
import {type PlaceId} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {type NightStart} from '../source/game/core/travel.js';
import {type mainMenuScreen as mainMenuScreenValue} from '../source/game/screens/mainMenuScreen.js';
import {type nightScreen as nightScreenValue} from '../source/game/screens/nightScreen.js';
import {type PlacePicture} from '../source/game/screens/placePicture.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {type TravelWindow} from '../source/game/screens/travelWindow.js';
import Index from '../source/routes/_index.js';
import {fixedStart} from './fixedWorld.js';

// The page's stylesheet gives the canvas the size of the viewport, as in the
// running app. Without it the canvas has no height the tests can rely on.
import '../source/tailwind.css';

export type Harness = {
  assets: typeof assetsValue;
  game: Game;
  mainMenuScreen: typeof mainMenuScreenValue;
  measureText: typeof measureTextValue;
  nightScreen: typeof nightScreenValue;

  /** The class, for a test that opens a window with a script of its own. */
  StoryWindow: typeof StoryWindow;

  /** Removes the page the game was booted on. */
  unmount: () => void;
};

/** A rectangle in art pixels, from the top left corner of the screen. */
export type Box = {left: number; top: number; width: number; height: number};

export async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

// GameInput latches a key that went down and up between two frames, and the
// engine runs the focus command on its next ticker callback. Two frames cover
// both orders in which the browser may run that callback and this one.
export async function press(code: string): Promise<void> {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', {code, cancelable: true}));
  globalThis.dispatchEvent(new KeyboardEvent('keyup', {code, cancelable: true}));
  await nextFrame();
  await nextFrame();
}

// Boots the real game once, through the index route inside StrictMode, as the
// app does, and waits for the main menu, or the night screen when the address
// holds a jump-in. The viewport is set first: Game picks
// its pixel scale from the width and the height of the window when game.ts is
// evaluated.
// That is why the game modules are imported here, after the viewport is set,
// and why a test file never imports them at its top.
export async function bootGame(
  width: number,
  height: number,
  {screen = 'mainMenu'}: {screen?: 'mainMenu' | 'night'} = {},
): Promise<Harness> {
  await page.viewport(width, height);

  let container = document.createElement('div');

  document.body.append(container);

  let root = createRoot(container);

  root.render(
    <StrictMode>
      <Index />
    </StrictMode>,
  );

  let {game} = await import('../source/game/core/game.js');
  let {assets} = await import('../source/game/core/assets.js');
  let {measureText} = await import('../source/game/core/measureText.js');
  let {mainMenuScreen} = await import('../source/game/screens/mainMenuScreen.js');
  let {nightScreen} = await import('../source/game/screens/nightScreen.js');
  let storyWindowModule = await import('../source/game/screens/storyWindow.js');

  await vitest.waitFor(
    () => {
      if (container.querySelector('canvas') === null) {
        throw new Error('The canvas is not mounted yet.');
      }

      let expected = screen === 'night' ? nightScreen : mainMenuScreen;

      if (expected.state !== 'shown') {
        throw new Error(`The ${screen} screen is ${expected.state}, not shown.`);
      }
    },
    {timeout: 20_000},
  );

  return {
    assets,
    game,
    mainMenuScreen,
    measureText,
    nightScreen,
    StoryWindow: storyWindowModule.StoryWindow,
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

// Sets the viewport and waits for the screen to take its size.
export async function setViewport({game}: Harness, width: number, height: number): Promise<void> {
  await page.viewport(width, height);
  await vitest.waitFor(
    () => {
      let {screen} = game.app;

      if (screen.width !== width || screen.height !== height) {
        throw new Error('The screen does not have its new size yet.');
      }
    },
    {timeout: 10_000},
  );
}

// Activates New Game on the main menu and waits for the night screen and its
// first layout.
export async function startNewGame({mainMenuScreen, nightScreen}: Harness): Promise<void> {
  mainMenuScreen.ui.focus(mainMenuScreen.contents.newGameButton);
  await press('Enter');
  await vitest.waitFor(
    () => {
      if (nightScreen.state !== 'shown') {
        throw new Error(`The night screen is ${nightScreen.state}, not shown.`);
      }
    },
    {timeout: 10_000},
  );
  await nextFrame();
}

// Puts the fixed world into nightStart, with the given values over its own,
// and returns the function that puts the game's own values back. The next
// New Game starts the night from them.
export function useFixedWorld(
  start: Partial<Pick<NightStart, 'minutes' | 'money' | 'place'>> = {},
): () => void {
  let own = {...nightStart};

  Object.assign(nightStart, fixedStart, start);

  return () => {
    Object.assign(nightStart, own);
  };
}

// Starts a new night in the given place: quits to the main menu and activates
// New Game.
export async function restartAt(harness: Harness, place: PlaceId): Promise<void> {
  nightStart.place = place;
  await harness.game.showScreen(harness.mainMenuScreen);
  await startNewGame(harness);
}

// The screen changes the place in its next frame after a story window has
// closed, so the change is awaited.
export async function waitForPlace({nightScreen}: Harness, place: PlaceId): Promise<void> {
  await vitest.waitFor(
    () => {
      let shown = nightScreen.contents.place?.id ?? 'no place';

      if (shown !== place) {
        throw new Error(`The night screen shows "${shown}", not "${place}".`);
      }
    },
    {timeout: 10_000},
  );
}

// Text has no getter for its string, so the tests read the BitmapText inside.
export function readText(text: Text): string {
  let [content] = text.view.children;

  if (!(content instanceof pixi.BitmapText)) {
    throw new TypeError('The text has no BitmapText!');
  }

  return content.text;
}

// The box the layout gave a component. toGlobal includes the engine's pixel
// scale, so it is divided out.
export function getBox({game}: Harness, {view}: {view: pixi.Container}): Box {
  let computed = view.layout?.computedLayout;

  if (!computed) {
    throw new Error('The view has no computed layout!');
  }

  let origin = view.toGlobal({x: 0, y: 0});

  return {
    left: origin.x / game.pixelScale,
    top: origin.y / game.pixelScale,
    width: computed.width,
    height: computed.height,
  };
}

export function doBoxesOverlap(first: Box, second: Box): boolean {
  return (
    first.left < second.left + second.width &&
    second.left < first.left + first.width &&
    first.top < second.top + second.height &&
    second.top < first.top + first.height
  );
}

// A real tap in the middle of a box, then two frames for the game to act on
// it. The canvas fills the viewport, so a position on the canvas is the art
// position times the pixel scale. Playwright moves the mouse to the canvas
// and presses and releases it there. force skips only its checks that the
// canvas is visible, stable and not covered: they wait for animation frames
// and double the cost of a tap, and a tap that missed the canvas would fail
// the test anyway.
export async function tap({game}: Harness, box: Box): Promise<void> {
  let canvas = document.querySelector('canvas');

  if (canvas === null) {
    throw new Error('The canvas is not mounted!');
  }

  await userEvent.click(canvas, {
    force: true,
    position: {
      x: (box.left + box.width / 2) * game.pixelScale,
      y: (box.top + box.height / 2) * game.pixelScale,
    },
  });
  await nextFrame();
  await nextFrame();
}

export function getSpotButton(harness: Harness, label: string): Button {
  let index = getPlace(harness).spots.findIndex((spot) => spot.label === label);
  let button = harness.nightScreen.contents.spotButtons[index];

  if (button === undefined) {
    throw new Error(`The scene has no "${label}" button!`);
  }

  return button;
}

export function getButtonLabel(button: Button): string {
  let [label] = button.children;

  if (!(label instanceof Text)) {
    throw new TypeError('The button has no label!');
  }

  return readText(label);
}

// Names the focused target, so a failed focus check prints a label and not a
// whole Button.
export function describeFocus(target: Focusable | null): string {
  if (target === null) {
    return 'nothing';
  }

  // A destroyed button has lost its label, as when the focus stays on a button built again.
  if (target instanceof Button && target.view.destroyed) {
    return 'a destroyed button';
  }

  if (target instanceof Button) {
    return getButtonLabel(target);
  }

  if (target instanceof Slider) {
    return 'slider';
  }

  return target.constructor.name;
}

export function getStoryWindow({nightScreen}: Harness): StoryWindow {
  let {storyWindow} = nightScreen.contents;

  if (storyWindow === null) {
    throw new Error('No story window is open!');
  }

  return storyWindow;
}

// The place members are null while no place is shown.
export function getPlace({nightScreen}: Harness): Place {
  let {place} = nightScreen.contents;

  if (place === null) {
    throw new Error('No place is shown!');
  }

  return place;
}

export function getPlaceButton({nightScreen}: Harness): Button {
  let {placeButton} = nightScreen.contents;

  if (placeButton === null) {
    throw new Error('The screen has no place button!');
  }

  return placeButton;
}

export function getPicture({nightScreen}: Harness): PlacePicture {
  let {picture} = nightScreen.contents;

  if (picture === null) {
    throw new Error('The screen has no picture!');
  }

  return picture;
}

// A window closes after a 200 ms fade, so closing is awaited.
export async function waitForNoStoryWindow({nightScreen}: Harness): Promise<void> {
  await vitest.waitFor(
    () => {
      if (nightScreen.contents.storyWindow !== null) {
        throw new Error('The story window is still open.');
      }
    },
    {timeout: 10_000},
  );
}

// The window's only child is a Panel. Its children are, in this order: the title
// block (only for a node with a speaker), a Container whose view holds the
// title Text and the rule Sprite; the text block, a Container of two Texts of
// the same size, the regular one and then the italic one; and the button area
// (only for a node with choices), a Container of Buttons. The cursor is a
// Sprite the panel's view holds out of the layout flow.
export function getWindowParts(storyWindow: StoryWindow): {
  buttons: Button[];
  cursor: pixi.Sprite;
  italicLeaf: Text;
  panel: Panel;
  regularLeaf: Text;
  textBlock: Container;
  title: Text | null;
} {
  let [panel] = storyWindow.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The story window has no panel!');
  }

  let containers = panel.children.filter((child) => child instanceof Container);
  let titleBlock = containers.find((container) =>
    container.view.children.some((child) => child instanceof pixi.Sprite),
  );
  let textBlock = containers.find(
    (container) =>
      container.children.length === 2 && container.children.every((child) => child instanceof Text),
  );
  let buttonArea = containers.find(
    (container) => container !== titleBlock && container !== textBlock,
  );
  let title = titleBlock?.children[0];
  let [regularLeaf, italicLeaf] = textBlock?.children ?? [];
  let cursor = panel.view.overflowContainer.children.find((child) => child instanceof pixi.Sprite);

  if (
    textBlock === undefined ||
    !(regularLeaf instanceof Text) ||
    !(italicLeaf instanceof Text) ||
    cursor === undefined
  ) {
    throw new TypeError('The story window has no text block or no cursor!');
  }

  if (titleBlock !== undefined && !(title instanceof Text)) {
    throw new TypeError('The title block has no title!');
  }

  return {
    buttons: (buttonArea?.children ?? []) as Button[],
    cursor,
    italicLeaf,
    panel,
    regularLeaf,
    textBlock,
    title: title instanceof Text ? title : null,
  };
}

// The travel window's modal holds one Panel. Its children are, in this order:
// the title block, a Container whose first child is the title Text; the row, a
// Container of one Button per way; the list, a Container of one Button per
// destination, each holding the name's Text and then the numbers' Text; and
// the Back Button.
export function getTravelParts(travelWindow: TravelWindow): {
  back: Button;
  destinations: Button[];
  panel: Panel;
  title: Text;
  ways: Button[];
} {
  let [panel] = travelWindow.modal.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The travel window has no panel!');
  }

  let [titleBlock, row, list, back] = panel.children;
  let title = titleBlock instanceof Container ? titleBlock.children[0] : undefined;

  if (
    !(title instanceof Text) ||
    !(row instanceof Container) ||
    !(list instanceof Container) ||
    !(back instanceof Button)
  ) {
    throw new TypeError('The travel window has no title, row, list or Back button!');
  }

  return {
    back,
    destinations: list.children.filter((child) => child instanceof Button),
    panel,
    title,
    ways: row.children.filter((child) => child instanceof Button),
  };
}

// The menu is a Modal holding one Panel: the title, then the buttons Resume,
// Options and Quit to menu.
export function getMenuButton(menu: Modal, label: string): Button {
  let [panel] = menu.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The menu has no panel!');
  }

  let button = panel.children.find(
    (child) => child instanceof Button && getButtonLabel(child) === label,
  );

  if (!(button instanceof Button)) {
    throw new TypeError(`The menu has no "${label}" button!`);
  }

  return button;
}

// The window's choice at the given position.
export function getWindowButton(storyWindow: StoryWindow, index: number): Button {
  let button = getWindowParts(storyWindow).buttons[index];

  if (button === undefined) {
    throw new Error(`The story window has no button ${index}!`);
  }

  return button;
}

// Presses Enter through the node's text and returns what the window showed
// each time a page was fully typed, calling onPage at each of those moments.
// It starts on a page that is typing or that waits at its end, and stops on
// the last page, with the node's choices offered or the window waiting for the
// press that closes it.
export async function readPages(storyWindow: StoryWindow, onPage?: () => void): Promise<string[]> {
  let pages: string[] = [];

  for (;;) {
    // Finishes the page that is typing. A page that typed to its end by
    // itself waits for no press.
    if (storyWindow.dialogue.phase === 'revealing') {
      await press('Enter');
    }

    pages.push(storyWindow.text);
    onPage?.();

    if (storyWindow.dialogue.revealedCount >= storyWindow.dialogue.pageText.length) {
      return pages;
    }

    // Turns the page: typing goes on from the page end.
    await press('Enter');
  }
}

// Whether a press shows more of the text: the runner is typing, or waits at a
// break inside its page.
function hasTextLeft({dialogue}: StoryWindow): boolean {
  return (
    dialogue.phase === 'revealing' ||
    (dialogue.phase === 'idle' && dialogue.revealedCount < dialogue.pageText.length)
  );
}

// Presses Enter through the text up to its last press: it stops with the
// node's choices offered, or with the whole page shown and the window waiting
// for the press that closes it. That press is left to the test: once the
// window has closed, the focus is back on the button that opened it, and one
// more press would open the window again.
export async function pressThrough(storyWindow: StoryWindow): Promise<void> {
  for (let count = 0; count < 40 && hasTextLeft(storyWindow); count += 1) {
    await press('Enter');
  }
}
