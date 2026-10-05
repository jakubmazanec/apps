import * as pixi from 'pixi.js';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {type Button, Container, type Game, Panel, Text} from 'tellurion';
import {vitest} from 'vitest';
import {page, userEvent} from 'vitest/browser';

import {samplePlace} from '../source/game/content/samplePlace.js';
import {type assets as assetsValue} from '../source/game/core/assets.js';
import {type measureText as measureTextValue} from '../source/game/core/measureText.js';
import {type mainMenuScreen as mainMenuScreenValue} from '../source/game/screens/mainMenuScreen.js';
import {type nightScreen as nightScreenValue} from '../source/game/screens/nightScreen.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import Index from '../source/routes/_index.js';

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
// app does, and waits for the main menu. The viewport is set first: Game picks
// its pixel scale from the height of the window when game.ts is evaluated.
// That is why the game modules are imported here, after the viewport is set,
// and why a test file never imports them at its top.
export async function bootGame(width: number, height: number): Promise<Harness> {
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

      if (mainMenuScreen.state !== 'shown') {
        throw new Error(`The main menu is ${mainMenuScreen.state}, not shown.`);
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

export function getSpotButton({nightScreen}: Harness, label: string): Button {
  let index = samplePlace.spots.findIndex((spot) => spot.label === label);
  let button = nightScreen.contents.spotButtons[index];

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

export function getStoryWindow({nightScreen}: Harness): StoryWindow {
  let {storyWindow} = nightScreen.contents;

  if (storyWindow === null) {
    throw new Error('No story window is open!');
  }

  return storyWindow;
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

// The window's only child is a Panel: the title, the text leaf and, for a
// node with choices, the button area (a Container of Buttons), in that order.
// A node without a speaker has no title. The marker is a Sprite the panel's
// view holds out of the layout flow.
export function getWindowParts(storyWindow: StoryWindow): {
  buttons: Button[];
  marker: pixi.Sprite;
  panel: Panel;
  textLeaf: Text;
  title: Text | null;
} {
  let [panel] = storyWindow.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The story window has no panel!');
  }

  let texts = panel.children.filter((child) => child instanceof Text);
  let buttonArea = panel.children.find((child) => child instanceof Container);
  let title = texts.length === 2 ? texts[0] : null;
  let textLeaf = texts.at(-1);
  let marker = panel.view.overflowContainer.children.find((child) => child instanceof pixi.Sprite);

  if (textLeaf === undefined || marker === undefined) {
    throw new TypeError('The story window has no text or no marker!');
  }

  return {
    buttons: (buttonArea?.children ?? []) as Button[],
    marker,
    panel,
    textLeaf,
    title: title ?? null,
  };
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
