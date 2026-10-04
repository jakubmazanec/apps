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
  await vitest.waitFor(() => {
    if (nightScreen.state !== 'shown') {
      throw new Error(`The night screen is ${nightScreen.state}, not shown.`);
    }
  });
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
// position times the pixel scale.
export async function tap({game}: Harness, box: Box): Promise<void> {
  let canvas = document.querySelector('canvas');

  if (canvas === null) {
    throw new Error('The canvas is not mounted!');
  }

  await userEvent.click(canvas, {
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
    {timeout: 5000},
  );
}

// The window is a Modal holding one Panel: the title, the text leaf and the
// button area (a Container of Buttons), in that order.
export function getWindowParts(storyWindow: StoryWindow): {
  buttons: Button[];
  panel: Panel;
  textLeaf: Text;
  title: Text;
} {
  let [panel] = storyWindow.modal.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The story window has no panel!');
  }

  let [title, textLeaf, buttonArea] = panel.children;

  if (
    !(title instanceof Text) ||
    !(textLeaf instanceof Text) ||
    !(buttonArea instanceof Container)
  ) {
    throw new TypeError('The story window has no title, no text or no button area!');
  }

  return {buttons: buttonArea.children as Button[], panel, textLeaf, title};
}

// The window's button at the given position: Continue, or a choice.
export function getWindowButton(storyWindow: StoryWindow, index: number): Button {
  let button = getWindowParts(storyWindow).buttons[index];

  if (button === undefined) {
    throw new Error(`The story window has no button ${index}!`);
  }

  return button;
}

// Presses Enter through the node's text and returns what the window showed
// each time a page was fully typed. It stops on the last page, with the node's
// choices offered or Continue waiting.
export async function readPages(storyWindow: StoryWindow): Promise<string[]> {
  let pages: string[] = [];

  for (;;) {
    // Finishes the page that is typing.
    await press('Enter');
    pages.push(storyWindow.text);

    if (storyWindow.dialogue.revealedCount >= storyWindow.dialogue.pageText.length) {
      return pages;
    }

    // Turns the page: typing goes on from the page end.
    await press('Enter');
  }
}
