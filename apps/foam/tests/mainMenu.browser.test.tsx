import {StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {type Button, type Game, type GameScreen} from 'tellurion';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import Index from '../source/routes/_index.js';

type MainMenuScreen = GameScreen<{newGameButton: Button; optionsButton: Button}>;

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

// GameInput latches a key that went down and up between two frames, and the
// engine runs the focus command on its next ticker callback. Two frames cover
// both orders in which the browser may run that callback and this one.
async function press(code: string): Promise<void> {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', {code, cancelable: true}));
  globalThis.dispatchEvent(new KeyboardEvent('keyup', {code, cancelable: true}));
  await nextFrame();
  await nextFrame();
}

describe('main menu', () => {
  let container: HTMLDivElement;
  let root: Root;
  let game: Game;
  let mainMenuScreen: MainMenuScreen;

  // The game is a process-lifetime singleton and init() runs once, so the file
  // boots it once and the tests share it. It boots through the index route,
  // the way the app does, inside StrictMode like entry.client.tsx: the boot
  // effect then runs twice and must still initialise the game once.
  beforeAll(async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    root.render(
      <StrictMode>
        <Index />
      </StrictMode>,
    );

    ({game} = await import('../source/game/core/game.js'));
    ({mainMenuScreen} = await import('../source/game/screens/mainMenuScreen.js'));

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
  }, 30_000);

  afterAll(() => {
    root.unmount();
    container.remove();
    localStorage.clear();
  });

  test('the main menu is the current screen', () => {
    expect(game.currentScreen).toBe(mainMenuScreen);
  });

  test('New Game is disabled', () => {
    expect(mainMenuScreen.contents.newGameButton.isDisabled).toBe(true);
  });

  test('the first focus command lands on Options, skipping New Game', async () => {
    mainMenuScreen.ui.clearFocus();
    await press('Tab');

    expect(mainMenuScreen.ui.focused).toBe(mainMenuScreen.contents.optionsButton);
  });
});
