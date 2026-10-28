import * as pixi from 'pixi.js';
import {StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {
  AudioMixer,
  Button,
  Container,
  type Focusable,
  type Game,
  type GameScreen,
  type Modal,
  Panel,
  Slider,
  Text,
  type TextInput,
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

import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type assets as assetsValue} from '../source/game/core/assets.js';
import {hash} from '../source/game/core/hash.js';
import {todaySeed} from '../source/game/core/todaySeed.js';
import {type PlacePicture} from '../source/game/screens/placePicture.js';
import Index from '../source/routes/_index.js';
import {getConfirmParts} from './confirmParts.js';
import {getNewNightParts} from './newNightParts.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check placement and speed, not the
// picture's pixels (tests/placePicture.browser.test.ts does), so the place gets
// the pipeline's proof, a shader of a few lines. The bar's GLSL has its text as
// its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

const SETTINGS_KEY = 'foam:settings';
const STORED_STORIES = {titles: ["The regulars' bottle", 'The timetable']};
const STORED_NIGHTS = {
  past: [
    {seed: 3, date: 20261025, ending: null, stories: []},
    {seed: 7, date: 20261026, ending: 'stranded', stories: []},
    {seed: 202610272, date: 20261027, ending: 'stay', stories: ['The timetable']},
  ],
  day: {date: 20200101, started: 5},
};
const STORED_NIGHT = {
  seed: 7,
  rolls: 0,
  minutes: 1000,
  money: 420,
  place: 'train',
  drunkenness: {level: 0, at: 1000},
  roll: null,
  log: [],
  stories: [],
  quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false},
  events: [],
  ending: null,
};

type MainMenuScreen = GameScreen<{
  confirmModal: Modal | null;
  continueButton: Button;
  newGameButton: Button;
  openModal: Modal | null;
  optionsButton: Button;
  picture: PlacePicture;
  plate: pixi.Graphics;
  title: Text;
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

function readText(text: Text): string {
  let [content] = text.view.children;

  if (!(content instanceof pixi.BitmapText)) {
    throw new TypeError('The text has no BitmapText!');
  }

  return content.text;
}

// Names the focused target, so a failed focus check prints a label and not a
// whole Button. A copy of the one in nightScreenHelpers.tsx, which this file
// does not import: their stylesheet import would change its canvas.
function describeFocus(target: Focusable | null): string {
  if (target === null) {
    return 'nothing';
  }

  // A destroyed button has lost its label, as when the focus stays on a button built again.
  if (target instanceof Button && target.view.destroyed) {
    return 'a destroyed button';
  }

  if (target instanceof Button) {
    let [label] = target.children;

    if (!(label instanceof Text)) {
      throw new TypeError('The button has no label!');
    }

    return readText(label);
  }

  if (target instanceof Slider) {
    return 'slider';
  }

  return target.constructor.name;
}

// The window is a Modal holding one Panel: the title block, four rows (a Container
// with a name, a Slider and a value each) and the Close button, in that order.
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
  let seed: number;
  // The spies call through to the real mixer and the console; they only record the calls.
  let setVolume: MockInstance<AudioMixer['setVolume']>;
  let playMusic: MockInstance<AudioMixer['playMusic']>;
  let play: MockInstance<AudioMixer['play']>;
  let info: MockInstance<typeof console.info>;

  async function openOptions(): Promise<Modal> {
    mainMenuScreen.ui.focus(mainMenuScreen.contents.optionsButton);
    await press('Enter');

    let modal = mainMenuScreen.contents.openModal;

    if (modal === null) {
      throw new Error('The Options window did not open!');
    }

    return modal;
  }

  async function openNewNight(): Promise<Modal> {
    mainMenuScreen.ui.focus(mainMenuScreen.contents.newGameButton);
    await press('Enter');

    let modal = mainMenuScreen.contents.openModal;

    if (modal === null) {
      throw new Error('The New night window did not open!');
    }

    return modal;
  }

  // Types into the field as the player does, through the hidden <input> Tellurion
  // appends to the canvas's container. A field not being edited is focused and
  // Enter starts the edit; in a field being edited, Enter would submit it.
  async function typeSeed(input: TextInput, text: string): Promise<void> {
    let element = document.querySelector('input');

    if (element === null) {
      throw new Error('The field has no hidden input!');
    }

    if (document.activeElement !== element) {
      mainMenuScreen.ui.focus(input);
      await press('Enter');
    }

    element.value = text;
    element.dispatchEvent(new Event('input'));
  }

  // The window closes after a 100 ms fade, so closing is awaited.
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

  // The confirmation fades as the window does.
  async function waitForNoConfirmation(): Promise<void> {
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.contents.confirmModal).toBeNull();
      },
      {timeout: 5000},
    );
  }

  // The game is a process-lifetime singleton and init() runs once, so the file
  // boots it once and the tests share it. It boots through the index route,
  // the way the app does, inside StrictMode like entry.client.tsx: the boot
  // effect then runs twice and must still initialise the game once.
  beforeAll(async () => {
    // The tests start nights, and each night's window writes its seed into the shared start.
    ({seed} = nightStart);

    // Seeded before anything imports settings.ts, stories.ts and nights.ts, which read storage at
    // module load: the route imports the game modules dynamically, so they
    // evaluate after these lines.
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({volumes: {master: 1, music: 0.4, sfx: 1, ui: 1}}),
    );
    localStorage.setItem('foam:stories', JSON.stringify(STORED_STORIES));
    localStorage.setItem('foam:nights', JSON.stringify(STORED_NIGHTS));

    // Installed before the route's dynamic imports evaluate audio.ts, which
    // sets the volumes at module load, and before the boot prints what the game keeps.
    setVolume = vitest.spyOn(AudioMixer.prototype, 'setVolume');
    playMusic = vitest.spyOn(AudioMixer.prototype, 'playMusic');
    play = vitest.spyOn(AudioMixer.prototype, 'play');
    info = vitest.spyOn(console, 'info');

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
  // The confirmation is the topmost, so it goes first.
  afterEach(() => {
    mainMenuScreen.contents.confirmModal?.destroy();
    mainMenuScreen.contents.openModal?.destroy();

    mainMenuScreen.contents.confirmModal = null;
    mainMenuScreen.contents.openModal = null;
  });

  afterAll(() => {
    setVolume.mockRestore();
    playMusic.mockRestore();
    play.mockRestore();
    info.mockRestore();
    root.unmount();
    container.remove();
    localStorage.clear();
    nightStart.seed = seed;
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

  test('the console names what the game keeps at boot', () => {
    expect(info).toHaveBeenCalledWith('Foam keeps 3 nights and 0 texts read.', []);
  });

  test('the menu music starts once', () => {
    expect(playMusic).toHaveBeenCalledTimes(1);
    expect(playMusic.mock.calls[0]?.[0]).toBe(assets.sound('menu-music'));
  });

  test('New Game is enabled', () => {
    expect(mainMenuScreen.contents.newGameButton.isDisabled).toBe(false);
  });

  test('the first focus command lands on New Game, and the next on Options', async () => {
    mainMenuScreen.ui.clearFocus();

    let clicks = (): number =>
      play.mock.calls.filter(([buffer]) => buffer === assets.sound('ui-click')).length;

    play.mockClear();

    expect(clicks()).toBe(0);

    await press('Tab');

    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('New Game');
    expect(play).toHaveBeenCalledWith(assets.sound('ui-click'), {bus: 'ui'});
    expect(clicks()).toBe(1);

    await press('Tab');

    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('Options');
    expect(clicks()).toBe(2);
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
    await openOptions();

    let before = settings.volumes.master;

    await press('Tab');

    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('slider');

    await press('Minus');

    expect(settings.volumes.master).toBeCloseTo(before - 0.1);

    let lastCall = setVolume.mock.calls.at(-1);

    expect(lastCall?.[0]).toBe('master');
    expect(lastCall?.[1]).toBeCloseTo(before - 0.1);

    await closeWithEscape();

    let stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Settings;

    expect(stored.volumes.master).toBeCloseTo(before - 0.1);
    expect(stored.volumes.music).toBeCloseTo(0.4);
    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('Options');
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

  test('the title is 96 × 48 and both buttons are 96 wide', () => {
    let {title, newGameButton, optionsButton} = mainMenuScreen.contents;
    let scale = game.pixelScale;
    let titleSize = title.view.layout?.computedLayout;
    let newGameSize = newGameButton.view.layout?.computedLayout;
    let optionsSize = optionsButton.view.layout?.computedLayout;

    expect([titleSize?.width, titleSize?.height]).toEqual([96, 48]);
    expect(newGameSize?.width).toBe(96);
    expect(optionsSize?.width).toBe(96);

    let titleBounds = title.view.getBounds();
    let newGameBounds = newGameButton.view.getBounds();
    let optionsBounds = optionsButton.view.getBounds();

    expect(newGameBounds.y / scale - titleBounds.maxY / scale).toBeCloseTo(24);
    expect(optionsBounds.y / scale - newGameBounds.maxY / scale).toBeCloseTo(6);
  });

  test('the main menu has no panel', () => {
    expect(mainMenuScreen.ui.children.some((child) => child instanceof Panel)).toBe(false);
  });

  test('the focus ring lies 2 pixels outside the focused button', async () => {
    mainMenuScreen.ui.clearFocus();
    await press('Tab');

    let scale = game.pixelScale;
    let ringHolder = mainMenuScreen.ui.view.children.at(-1);
    let ring = ringHolder?.children[0];

    expect(ringHolder?.children).toHaveLength(1);

    await nextFrame();

    let ringBounds = ring?.getBounds();
    let buttonBounds = mainMenuScreen.contents.newGameButton.view.getBounds();

    expect(ringBounds?.x).toBeCloseTo(buttonBounds.x - 2 * scale);
    expect(ringBounds?.y).toBeCloseTo(buttonBounds.y - 2 * scale);
    expect(ringBounds?.maxX).toBeCloseTo(buttonBounds.maxX + 2 * scale);
    expect(ringBounds?.maxY).toBeCloseTo(buttonBounds.maxY + 2 * scale);
  });

  test('the value after a slider follows the slider', async () => {
    let modal = await openOptions();
    // The title block is a Container too, but holds no slider.
    let rows = getPanel(modal).children.flatMap((child) =>
      child instanceof Container && child.children.some((part) => part instanceof Slider) ?
        [child]
      : [],
    );
    let readValues = (): string[] =>
      rows.map((row) => {
        let value = row.children[2];

        if (!(value instanceof Text)) {
          throw new TypeError('The row has no value!');
        }

        return readText(value);
      });
    let sliders = getSliders(modal);

    expect(rows).toHaveLength(4);
    expect(readValues()).toEqual(sliders.map((slider) => `${Math.round(slider.value * 100)}%`));

    let before = sliders[0]?.value ?? 0;

    await press('Tab');
    await press('Minus');

    expect(readValues()[0]).toBe(`${Math.round((before - 0.1) * 100)}%`);

    await closeWithEscape();
  });

  test('the main menu shows the picture', () => {
    let {picture} = mainMenuScreen.contents;
    let scale = game.pixelScale;
    let {children} = mainMenuScreen.view;
    let size = picture.view.getBounds();

    expect(picture.view.parent).toBe(mainMenuScreen.view);
    expect(children.indexOf(picture.view)).toBeLessThan(children.indexOf(mainMenuScreen.ui.view));
    expect(size.width / scale).toBeCloseTo(game.app.screen.width / scale);
    expect(size.height / scale).toBeCloseTo(game.app.screen.height / scale);
  });

  test("the title's plate lies behind the title and in front of the picture", () => {
    let {title, plate, newGameButton} = mainMenuScreen.contents;
    let scale = game.pixelScale;
    let titleBounds = title.view.getBounds();
    let plateBounds = plate.getBounds();
    let newGameBounds = newGameButton.view.getBounds();
    let {parent} = plate;

    if (parent === null) {
      throw new Error('The plate has no parent!');
    }

    expect(parent).toBe(title.view.parent);
    expect(parent.children.indexOf(plate)).toBeLessThan(parent.children.indexOf(title.view));
    expect(plateBounds.x / scale).toBeCloseTo(titleBounds.x / scale - 8);
    expect(plateBounds.y / scale).toBeCloseTo(titleBounds.y / scale - 8);
    expect(plateBounds.width / scale).toBeCloseTo(112);
    expect(plateBounds.height / scale).toBeCloseTo(64);
    expect(newGameBounds.y / scale - titleBounds.maxY / scale).toBeCloseTo(24);
  });

  test('the picture runs at half speed while Options is open', async () => {
    let {picture} = mainMenuScreen.contents;

    await nextFrame();

    expect(picture.speed).toBe(1);

    await openOptions();
    await nextFrame();

    expect(picture.speed).toBe(0.5);

    await closeWithEscape();
    await nextFrame();

    expect(picture.speed).toBe(1);
  });

  test("New Game opens the New night window with today's date in the field and nothing focused", async () => {
    let modal = await openNewNight();
    let {input, start} = getNewNightParts(modal);
    let [titleBlock] = getPanel(modal).children;
    let title = titleBlock instanceof Container ? titleBlock.children[0] : undefined;

    if (!(title instanceof Text)) {
      throw new TypeError('The New night window has no title!');
    }

    expect(readText(title)).toBe('New night');
    expect(input.value).toBe(String(todaySeed()));
    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('nothing');
    expect(start.isDisabled).toBe(false);
    expect(mainMenuScreen.ui.topOverlay).toBe(modal);

    await closeWithEscape();
  });

  test('letters and spaces typed into the field are dropped, the digits kept, and a sixteenth digit too', async () => {
    let {input, close} = getNewNightParts(await openNewNight());

    await typeSeed(input, '2a0 2b6');

    expect(input.value).toBe('2026');

    await typeSeed(input, '1234567890123456');

    expect(input.value).toBe('123456789012345');

    mainMenuScreen.ui.focus(close);
    await press('Enter');
    await waitForClosed();
  });

  test('an emptied field disables Start, and Enter does nothing', async () => {
    let modal = await openNewNight();
    let {input, start, close} = getNewNightParts(modal);

    await typeSeed(input, '');

    expect(start.isDisabled).toBe(true);

    await press('Enter');

    expect(mainMenuScreen.state).toBe('shown');
    expect(mainMenuScreen.contents.openModal).toBe(modal);

    await typeSeed(input, '7');

    expect(start.isDisabled).toBe(false);

    mainMenuScreen.ui.focus(close);
    await press('Enter');
    await waitForClosed();
  });

  test('Escape closes the window with the focus back on New Game', async () => {
    await openNewNight();
    await closeWithEscape();

    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('New Game');
    expect(mainMenuScreen.ui.topOverlay).toBeNull();
  });

  test('Close closes the window with the focus back on New Game', async () => {
    let {close} = getNewNightParts(await openNewNight());

    mainMenuScreen.ui.focus(close);
    await press('Enter');
    await waitForClosed();

    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('New Game');
  });

  test('the picture runs at half speed while the New night window is open', async () => {
    let {picture} = mainMenuScreen.contents;

    await nextFrame();

    expect(picture.speed).toBe(1);

    await openNewNight();
    await nextFrame();

    expect(picture.speed).toBe(0.5);

    await closeWithEscape();
    await nextFrame();

    expect(picture.speed).toBe(1);
  });

  test('the error screen has no picture', () => {
    let {view} = errorScreen as MainMenuScreen;
    let hasPicture = (node: pixi.Container): boolean =>
      (node instanceof pixi.Sprite && node.texture instanceof pixi.RenderTexture) ||
      node.children.some((child) => hasPicture(child));

    expect(hasPicture(view)).toBe(false);
  });

  // It leaves the night screen shown, for the test after it.
  test('a new game takes the picture off the main menu, and a frame draws nothing into it', async () => {
    let {picture} = mainMenuScreen.contents;
    let [sprite] = picture.view.children;

    if (!(sprite instanceof pixi.Sprite)) {
      throw new TypeError('The picture has no sprite!');
    }

    let {texture} = sprite;
    let {input, start} = getNewNightParts(await openNewNight());

    await typeSeed(input, '007');
    mainMenuScreen.ui.focus(start);
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.state).not.toBe('shown');
      },
      {timeout: 10_000},
    );

    // A boolean: printing a Pixi container in a failure message reaches a shader that throws.
    let hasParent = picture.view.parent !== null;

    expect(hasParent).toBe(false);

    let render = vitest.spyOn(game.app.renderer, 'render');

    try {
      // Two frames, so that the ticker runs at least once whichever callback the browser runs
      // first.
      await nextFrame();
      await nextFrame();

      // A count, not the calls: a call holds the mesh, which the failure message cannot print.
      let draws = render.mock.calls.filter(
        ([options]) => (options as {target?: unknown}).target === texture,
      ).length;

      expect(draws).toBe(0);
    } finally {
      render.mockRestore();
    }
  });

  // The game's own content: the night starts in the train at 16:00. The id,
  // not a sentence, so the test holds when the text is written. The hash gives
  // 0.398 for the seed 7, so the money is the second of the five amounts.
  test('Start plays the night of the typed seed in the train, with the money the hash gives it', async () => {
    let {nightScreen} = await import('../source/game/screens/nightScreen.js');

    await vitest.waitFor(
      () => {
        expect(nightScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(nightScreen.contents.place?.id).toBe('train');
    expect(nightStart.seed).toBe(7);
    expect(nightScreen.contents.night.seed).toBe(7);
    expect(nightScreen.contents.night.money).toBe(300 + 50 * Math.floor(hash(7, 'money') * 5));
    expect(readText(nightScreen.contents.statusText)).toBe('16:00   350 Kč   0.0');
  });

  // The hash gives 0.828 for the seed 20261026, so the money is the last of the five amounts.
  test('Enter in the field starts the night too', async () => {
    let {nightScreen} = await import('../source/game/screens/nightScreen.js');

    await game.showScreen(mainMenuScreen);

    let {input} = getNewNightParts(await openNewNight());

    await typeSeed(input, '20261026');
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(nightScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(nightScreen.contents.night.seed).toBe(20261026);
    expect(readText(nightScreen.contents.statusText)).toBe('16:00   500 Kč   0.0');
  });

  test('Continue is not on the menu without a stored night', async () => {
    await game.showScreen(mainMenuScreen);

    expect(mainMenuScreen.ui.children).not.toContain(mainMenuScreen.contents.continueButton);
  });

  test('Continue comes in above New Game when a window over the menu closes on a stored night', async () => {
    localStorage.setItem('foam:night', JSON.stringify(STORED_NIGHT));
    await openOptions();
    await closeWithEscape();
    await nextFrame();

    let {continueButton, newGameButton, title} = mainMenuScreen.contents;
    let {children} = mainMenuScreen.ui;
    let scale = game.pixelScale;

    expect(children.indexOf(continueButton)).toBe(children.indexOf(newGameButton) - 1);
    expect(children.indexOf(continueButton)).toBeGreaterThan(0);
    expect(continueButton.view.layout?.computedLayout.width).toBe(96);

    let titleBounds = title.view.getBounds();
    let continueBounds = continueButton.view.getBounds();
    let newGameBounds = newGameButton.view.getBounds();

    expect(continueBounds.y / scale - titleBounds.maxY / scale).toBeCloseTo(24);
    expect(newGameBounds.y / scale - continueBounds.maxY / scale).toBeCloseTo(6);
  });

  test('Continue opens the saved place with its status line, and stands until the night is saved again', async () => {
    let {nightScreen} = await import('../source/game/screens/nightScreen.js');
    let {continueButton} = mainMenuScreen.contents;

    mainMenuScreen.ui.focus(continueButton);
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(nightScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(nightScreen.contents.place?.id).toBe('train');
    expect(readText(nightScreen.contents.statusText)).toBe('16:40   420 Kč   0.0');
    expect(nightScreen.contents.night.seed).toBe(7);

    await game.showScreen(mainMenuScreen);

    expect(mainMenuScreen.ui.children.filter((child) => child === continueButton)).toHaveLength(1);
  });

  // Two nights were started in this file so far, and Continue counts none.
  test("the field reads the day's next seed after a start", async () => {
    let {input} = getNewNightParts(await openNewNight());

    expect(input.value).toBe(`${todaySeed()}3`);

    await closeWithEscape();
  });

  test('Start with a stored night opens the confirmation with Close focused, and Enter again closes it', async () => {
    let modal = await openNewNight();

    mainMenuScreen.ui.focus(getNewNightParts(modal).start);
    await press('Enter');

    let confirm = mainMenuScreen.contents.confirmModal;

    if (confirm === null) {
      throw new Error('The confirmation did not open!');
    }

    let {line, title} = getConfirmParts(confirm);

    expect(readText(title)).toBe('Night in progress');
    expect(readText(line)).toBe('Start ends the saved\nnight.');
    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('Close');
    expect(mainMenuScreen.ui.topOverlay).toBe(confirm);

    await press('Enter');
    await waitForNoConfirmation();

    expect(mainMenuScreen.state).toBe('shown');
    expect(mainMenuScreen.contents.openModal).toBe(modal);
    expect(mainMenuScreen.ui.topOverlay).toBe(modal);
    expect(localStorage.getItem('foam:night')).not.toBeNull();
    expect(describeFocus(mainMenuScreen.ui.focused)).toBe('Start');

    await press('Enter');

    expect(mainMenuScreen.contents.confirmModal).not.toBeNull();

    await press('Escape');
    await waitForNoConfirmation();
    await closeWithEscape();
  });

  test("the confirmation's Start plays the new night and clears the save", async () => {
    let {nightScreen} = await import('../source/game/screens/nightScreen.js');
    let {input, start} = getNewNightParts(await openNewNight());

    await typeSeed(input, '7');
    mainMenuScreen.ui.focus(start);
    await press('Enter');

    let confirm = mainMenuScreen.contents.confirmModal;

    if (confirm === null) {
      throw new Error('The confirmation did not open!');
    }

    mainMenuScreen.ui.focus(getConfirmParts(confirm).action);
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(nightScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(nightScreen.contents.night.seed).toBe(7);
    expect(localStorage.getItem('foam:night')).toBeNull();
    expect((JSON.parse(localStorage.getItem('foam:nights') ?? '') as {day: unknown}).day).toEqual({
      date: todaySeed(),
      started: 3,
    });

    await game.showScreen(mainMenuScreen);

    expect(mainMenuScreen.ui.children).not.toContain(mainMenuScreen.contents.continueButton);
  });
});
