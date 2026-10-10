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
// holds a jump-in. The viewport is set first: Game picks its pixel scale from
// the width and the height of the window when game.ts is evaluated. That is why
// the game modules are imported here, after the viewport is set, and why a test
// file never imports them at its top.
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

// A tap the game handles at once: a press and a release sent straight to the
// canvas, which Pixi hit tests and dispatches as it receives them, so no frame
// runs between them or after them. A test checks with it what a tap does at a
// given moment, such as in a fade, which a real tap's many frames would end.
export function tapNow({game}: Harness, box: Box): void {
  let canvas = document.querySelector('canvas');

  if (canvas === null) {
    throw new Error('The canvas is not mounted!');
  }

  let rect = canvas.getBoundingClientRect();
  let init = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + (box.left + box.width / 2) * game.pixelScale,
    clientY: rect.top + (box.top + box.height / 2) * game.pixelScale,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
  };

  canvas.dispatchEvent(new PointerEvent('pointerdown', {...init, buttons: 1}));
  canvas.dispatchEvent(new PointerEvent('pointerup', {...init, buttons: 0}));
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

// A window closes after a 100 ms fade, so closing is awaited.
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
// (only for a node with choices), a Container of Buttons. The panel's view
// holds two more parts out of the layout flow: the press surface, a Container
// that draws nothing and has a hit area, and the cursor, a Sprite.
export function getWindowParts(storyWindow: StoryWindow): {
  buttonArea: Container | null;
  buttons: Button[];
  cursor: pixi.Sprite;
  italicLeaf: Text;
  panel: Panel;
  pressSurface: pixi.Container;
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
  let outOfFlow = panel.view.overflowContainer.children;
  let cursor = outOfFlow.find((child) => child instanceof pixi.Sprite);
  let pressSurface = outOfFlow.find((child) => child.hitArea instanceof pixi.Rectangle);

  if (
    textBlock === undefined ||
    !(regularLeaf instanceof Text) ||
    !(italicLeaf instanceof Text) ||
    cursor === undefined ||
    pressSurface === undefined
  ) {
    throw new TypeError('The story window has no text block, no cursor or no press surface!');
  }

  if (titleBlock !== undefined && !(title instanceof Text)) {
    throw new TypeError('The title block has no title!');
  }

  return {
    buttonArea: buttonArea ?? null,
    buttons: (buttonArea?.children ?? []) as Button[],
    cursor,
    italicLeaf,
    panel,
    pressSurface,
    regularLeaf,
    textBlock,
    title: title instanceof Text ? title : null,
  };
}

// New choices fade in and take no tap until they are fully shown, so a test
// that taps a choice right after it appeared waits for that.
export async function waitForChoices(storyWindow: StoryWindow): Promise<void> {
  await vitest.waitFor(
    () => {
      let {buttonArea} = getWindowParts(storyWindow);

      if (buttonArea === null || buttonArea.children.length === 0) {
        throw new Error('The story window offers no choices.');
      }

      let {view} = buttonArea;

      if (view.alpha < 1 || view.eventMode === 'none') {
        throw new Error('The choices are still fading in.');
      }
    },
    {timeout: 10_000},
  );
}

// The travel window's modal holds one Panel. Its children are the title block,
// a Container whose first child is the title Text, and the body. A stacked body
// is a column of the row, the map area, the destination slot and Back; a
// side-by-side body is a row of the map area and a column of the row, the slot
// and Back. The row is a Container of one Button per way. The map area's view
// holds the map picture's view first, whose sprites show the layer and then the
// marks, then one Button per location, labelled with the location's id; the
// journey's own location has one too, not drawn. The slot holds the
// destination Button, with the name's Text and then the numbers' Text; it is
// not drawn while the way has no destination. `locations` and `destination`
// hold what the player sees; `allLocations` and `destinationButton` hold every
// button.
export function getTravelParts(travelWindow: TravelWindow): {
  allLocations: Map<string, Button>;
  back: Button;
  destination: Button | null;
  destinationButton: Button;
  layerSprite: pixi.Sprite;
  locations: Map<string, Button>;
  map: pixi.Container;
  mapArea: Container;
  marksSprite: pixi.Sprite;
  panel: Panel;
  slot: Container;
  title: Text;
  ways: Button[];
} {
  let [panel] = travelWindow.modal.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The travel window has no panel!');
  }

  let [titleBlock, body] = panel.children;
  let title = titleBlock instanceof Container ? titleBlock.children[0] : undefined;

  if (!(title instanceof Text) || !(body instanceof Container)) {
    throw new TypeError('The travel window has no title or no body!');
  }

  let [first, second, third, fourth] = body.children;
  let [row, mapArea, slot, back] =
    second instanceof Container && third === undefined ?
      [second.children[0], first, second.children[1], second.children[2]]
    : [first, second, third, fourth];
  let map = mapArea instanceof Container ? mapArea.view.children[0] : undefined;
  let [layerSprite, marksSprite] = map?.children ?? [];

  if (
    !(row instanceof Container) ||
    !(mapArea instanceof Container) ||
    map === undefined ||
    !(layerSprite instanceof pixi.Sprite) ||
    !(marksSprite instanceof pixi.Sprite) ||
    !(slot instanceof Container) ||
    !(back instanceof Button)
  ) {
    throw new TypeError('The travel window has no row, map area, map, slot or Back button!');
  }

  let [destinationButton] = slot.children;

  if (!(destinationButton instanceof Button)) {
    throw new TypeError('The travel window has no destination button!');
  }

  let allLocations = new Map(
    mapArea.children
      .filter((child) => child instanceof Button)
      .map((button) => [button.view.label, button]),
  );

  return {
    allLocations,
    back,
    destination: destinationButton.view.renderable ? destinationButton : null,
    destinationButton,
    layerSprite,
    locations: new Map([...allLocations].filter(([, button]) => button.view.renderable)),
    map,
    mapArea,
    marksSprite,
    panel,
    slot,
    title,
    ways: row.children.filter((child) => child instanceof Button),
  };
}

/** A texture's pixels as the renderer reads them: four bytes a pixel, row by row. */
export type Pixels = {pixels: Uint8ClampedArray; width: number; height: number};

export function readPixels(harness: Harness, texture: pixi.Texture): Pixels {
  return harness.game.app.renderer.extract.pixels({target: texture});
}

// The colour of a pixel as 0xRRGGBB, or -1 for a pixel that is not opaque.
export function getColor({pixels, width}: Pixels, x: number, y: number): number {
  let index = (y * width + x) * 4;

  if (pixels[index + 3] !== 255) {
    return -1;
  }

  return (
    (pixels[index] ?? 0) * 0x10000 + (pixels[index + 1] ?? 0) * 0x100 + (pixels[index + 2] ?? 0)
  );
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

// How many pages the runner made of the node's text: one for a string, one for
// each entry of a list. A text that is a function is called again with the
// night screen's night, which every story window of the tests runs on.
function countPages({nightScreen}: Harness, {dialogue}: StoryWindow): number {
  let text = dialogue.node?.text ?? '';
  let pages = typeof text === 'function' ? text(nightScreen.contents.night) : text;

  return typeof pages === 'string' ? 1 : pages.length;
}

// Whether a press goes on through the text without closing the window: the
// runner is typing, waits at a break inside its page, or waits at the end of a
// page that another page or the node's next node follows.
function hasTextLeft(harness: Harness, storyWindow: StoryWindow): boolean {
  let {dialogue} = storyWindow;

  if (dialogue.phase === 'revealing') {
    return true;
  }

  if (dialogue.phase !== 'idle') {
    return false;
  }

  return (
    dialogue.revealedCount < dialogue.pageText.length ||
    dialogue.pageIndex < countPages(harness, storyWindow) - 1 ||
    dialogue.node?.next !== undefined
  );
}

// Presses Enter through the text up to its last press, over every page and
// every next node: it stops with the choices offered, or with the last page
// shown and the window waiting for the press that closes it. That press is
// left to the test: once the window has closed, the focus is back on the
// button that opened it, and one more press would open the window again.
export async function pressThrough(harness: Harness, storyWindow: StoryWindow): Promise<void> {
  for (let count = 0; count < 40 && hasTextLeft(harness, storyWindow); count += 1) {
    await press('Enter');
  }
}
