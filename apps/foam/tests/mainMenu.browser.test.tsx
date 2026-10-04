import {StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {
  AudioMixer,
  Button,
  Container,
  type Game,
  type GameScreen,
  type Modal,
  Panel,
  Slider,
} from 'tellurion';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  type MockInstance,
  test,
  vitest,
} from 'vitest';

import {type assets as assetsValue} from '../source/game/core/assets.js';
import Index from '../source/routes/_index.js';

const SETTINGS_KEY = 'foam:settings';

type MainMenuScreen = GameScreen<{
  newGameButton: Button;
  openModal: Modal | null;
  optionsButton: Button;
}>;
type Settings = {volumes: {master: number; music: number; sfx: number; ui: number}};

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

// The window is a Modal holding one Panel: a title, four rows (a Container
// with a label and a Slider each) and the Close button, in that order.
function getPanel(modal: Modal): Panel {
  let [panel] = modal.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The Options window has no panel!');
  }

  return panel;
}

function getSliders(modal: Modal): Slider[] {
  return getPanel(modal).children.flatMap((row) =>
    row instanceof Container ? row.children.filter((child) => child instanceof Slider) : [],
  );
}

function getCloseButton(modal: Modal): Button {
  let closeButton = getPanel(modal).children.at(-1);

  if (!(closeButton instanceof Button)) {
    throw new TypeError('The Options window has no Close button!');
  }

  return closeButton;
}

describe('main menu', () => {
  let container: HTMLDivElement;
  let root: Root;
  let game: Game;
  let mainMenuScreen: MainMenuScreen;
  let settings: Settings;
  let assets: typeof assetsValue;
  let errorScreen: unknown;
  // The spies call through to the real mixer; they only record the calls.
  let setVolume: MockInstance<AudioMixer['setVolume']>;
  let playMusic: MockInstance<AudioMixer['playMusic']>;
  let play: MockInstance<AudioMixer['play']>;

  async function openOptions(): Promise<Modal> {
    mainMenuScreen.ui.focus(mainMenuScreen.contents.optionsButton);
    await press('Enter');

    let modal = mainMenuScreen.contents.openModal;

    if (modal === null) {
      throw new Error('The Options window did not open!');
    }

    return modal;
  }

  // The window closes after a 200 ms fade, so closing is awaited.
  async function waitForClosed(): Promise<void> {
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.contents.openModal).toBeNull();
      },
      {timeout: 5000},
    );
  }

  async function closeWithEscape(): Promise<void> {
    await press('Escape');
    await waitForClosed();
  }

  // The game is a process-lifetime singleton and init() runs once, so the file
  // boots it once and the tests share it. It boots through the index route,
  // the way the app does, inside StrictMode like entry.client.tsx: the boot
  // effect then runs twice and must still initialise the game once.
  beforeAll(async () => {
    // Seeded before anything imports settings.ts, which reads storage at
    // module load: the route imports the game modules dynamically, so they
    // evaluate after this line.
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({volumes: {master: 1, music: 0.4, sfx: 1, ui: 1}}),
    );

    // Installed before the route's dynamic imports evaluate audio.ts, which
    // sets the volumes at module load.
    setVolume = vitest.spyOn(AudioMixer.prototype, 'setVolume');
    playMusic = vitest.spyOn(AudioMixer.prototype, 'playMusic');
    play = vitest.spyOn(AudioMixer.prototype, 'play');

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
    ({settings} = await import('../source/game/core/settings.js'));
    ({assets} = await import('../source/game/core/assets.js'));
    ({errorScreen} = await import('../source/game/screens/errorScreen.js'));

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

  // A failed test must not leave the window open for the next one.
  afterEach(() => {
    let modal = mainMenuScreen.contents.openModal;

    if (modal !== null) {
      modal.destroy();
      mainMenuScreen.contents.openModal = null;
    }
  });

  afterAll(() => {
    setVolume.mockRestore();
    playMusic.mockRestore();
    play.mockRestore();
    root.unmount();
    container.remove();
    localStorage.clear();
  });

  test('the main menu is the current screen', () => {
    expect(game.currentScreen).toBe(mainMenuScreen);
  });

  test('the error screen is registered', () => {
    expect(game.errorScreen).toBe(errorScreen);
  });

  test('the stored volumes reach the mixer at boot', () => {
    expect(setVolume).toHaveBeenCalledWith('music', 0.4);
    expect(setVolume).toHaveBeenCalledWith('master', 1);
    expect(setVolume).toHaveBeenCalledWith('sfx', 1);
    expect(setVolume).toHaveBeenCalledWith('ui', 1);
  });

  test('the menu music starts once', () => {
    expect(playMusic).toHaveBeenCalledTimes(1);
    expect(playMusic.mock.calls[0]?.[0]).toBe(assets.sound('menu-music'));
  });

  test('New Game is disabled', () => {
    expect(mainMenuScreen.contents.newGameButton.isDisabled).toBe(true);
  });

  test('the first focus command lands on Options, skipping New Game', async () => {
    mainMenuScreen.ui.clearFocus();

    let clicks = (): number =>
      play.mock.calls.filter(([buffer]) => buffer === assets.sound('ui-click')).length;

    play.mockClear();

    expect(clicks()).toBe(0);

    await press('Tab');

    expect(mainMenuScreen.ui.focused).toBe(mainMenuScreen.contents.optionsButton);
    expect(play).toHaveBeenCalledWith(assets.sound('ui-click'), {bus: 'ui'});
    expect(clicks()).toBeGreaterThan(0);
  });

  test('activating Options opens the window', async () => {
    let modal = await openOptions();

    expect(mainMenuScreen.ui.topOverlay).toBe(modal);

    await closeWithEscape();
  });

  test('the window shows the stored volumes', async () => {
    let modal = await openOptions();
    let values = getSliders(modal).map((slider) => slider.value);

    expect(values).toHaveLength(4);
    expect(values[0]).toBeCloseTo(settings.volumes.master);
    expect(values[1]).toBeCloseTo(0.4);
    expect(values[2]).toBeCloseTo(settings.volumes.sfx);
    expect(values[3]).toBeCloseTo(settings.volumes.ui);

    await closeWithEscape();
  });

  test('the decrease key lowers the focused volume, and closing stores it', async () => {
    let modal = await openOptions();
    let [masterSlider] = getSliders(modal);
    let before = settings.volumes.master;

    await press('Tab');

    expect(mainMenuScreen.ui.focused).toBe(masterSlider);

    await press('Minus');

    expect(settings.volumes.master).toBeCloseTo(before - 0.1);

    let lastCall = setVolume.mock.calls.at(-1);

    expect(lastCall?.[0]).toBe('master');
    expect(lastCall?.[1]).toBeCloseTo(before - 0.1);

    await closeWithEscape();

    let stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Settings;

    expect(stored.volumes.master).toBeCloseTo(before - 0.1);
    expect(stored.volumes.music).toBeCloseTo(0.4);
    expect(mainMenuScreen.ui.focused).toBe(mainMenuScreen.contents.optionsButton);
  });

  test('a reopened window shows the changed volume', async () => {
    let before = settings.volumes.master;

    await openOptions();
    await press('Tab');
    await press('Minus');
    await closeWithEscape();

    let modal = await openOptions();
    let [masterSlider] = getSliders(modal);

    expect(masterSlider?.value).toBeCloseTo(settings.volumes.master);
    expect(masterSlider?.value).toBeCloseTo(before - 0.1);

    await closeWithEscape();
  });

  test('the Close button closes the window', async () => {
    let modal = await openOptions();

    mainMenuScreen.ui.focus(getCloseButton(modal));
    await press('Enter');
    await waitForClosed();

    expect(mainMenuScreen.ui.topOverlay).toBeNull();
  });
});
