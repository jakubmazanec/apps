import {type Button} from 'tellurion';
import {afterAll, beforeAll, describe, expect, type MockInstance, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {getSceneArea} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {type PlacePicture} from '../source/game/screens/placePicture.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {FIXED_BAR, FIXED_SQUARE, FIXED_STOP, getFixedPlace} from './fixedWorld.js';
import {
  bootGame,
  describeFocus,
  getBox,
  getButtonLabel,
  getPicture,
  getPlace,
  getPlaceButton,
  getSpotButton,
  getStoryWindow,
  type Harness,
  nextFrame,
  press,
  pressThrough,
  restartAt,
  startNewGame,
  useFixedWorld,
  waitForNoStoryWindow,
  waitForPlace,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check places, buttons and windows,
// not the picture's pixels (tests/placePicture.browser.test.ts does), so the
// main menu, which shows the bar, gets the pipeline's proof, a shader of a few
// lines, as the fixed world's places do. The bar's GLSL has its text as its
// type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 960 × 540 CSS pixels are 480 × 270 art pixels. The frames of a headless
// browser are slow, and several times slower on a busy machine, so the tests
// get a long timeout. They follow each other in order: each starts where the
// one before it ended.
describe('night screen places', {timeout: 180_000}, () => {
  let harness: Harness;
  let restore: () => void;
  let warn: MockInstance<typeof console.warn>;
  // The square's picture and scene buttons, kept by the test that leaves the
  // square for the test after it.
  let squarePicture: PlacePicture;
  let squareButtons: Button[];

  async function openSpot(label: string): Promise<StoryWindow> {
    harness.nightScreen.ui.focus(getSpotButton(harness, label));
    await press('Enter');

    return getStoryWindow(harness);
  }

  // Ends a text without choices, as the description that opens on arrival.
  async function closeStory(): Promise<void> {
    await pressThrough(getStoryWindow(harness));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  }

  beforeAll(async () => {
    harness = await bootGame(960, 540);
    restore = useFixedWorld({place: FIXED_SQUARE});
    // A script that names an unknown place warns; the test reads the warning,
    // and the output stays clean.
    warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});
  }, 60_000);

  afterAll(() => {
    warn.mockRestore();
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('a place with a short name shows it on the place button', async () => {
    await startNewGame(harness);

    expect(getPlace(harness).name).toBe('The square by the old market');
    expect(getButtonLabel(getPlaceButton(harness))).toBe('The square');
    // The status line stands beside the place button: the margin, the ten
    // letters of the label with the button's padding, and the margin again.
    expect(getBox(harness, harness.nightScreen.contents.statusText).left).toBe(4 + 10 * 6 + 12 + 4);
  });

  test('a script that names an unknown place leaves the player where they are', async () => {
    let {nightScreen} = harness;

    await closeStory();

    let buttonsBefore = [...nightScreen.contents.spotButtons];

    await pressThrough(await openSpot('A wrong turn'));
    await press('Enter');
    await waitForNoStoryWindow(harness);
    await nextFrame();
    await nextFrame();

    let {night, spotButtons} = nightScreen.contents;

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nowhere"'));
    expect(night.place).toBe(FIXED_SQUARE);
    expect(spotButtons).toHaveLength(buttonsBefore.length);
    expect(spotButtons.every((button, index) => button === buttonsBefore[index])).toBe(true);
  });

  test('the place waits while the menu lies over the closing window', async () => {
    let {nightScreen} = harness;

    squarePicture = getPicture(harness);
    squareButtons = [...nightScreen.contents.spotButtons];

    let storyWindow = await openSpot('The passage');

    // What the last press of the text does, and Escape in the fade after it,
    // without a frame between them: on a slow machine the whole fade can pass
    // between two key presses of a test.
    for (let count = 0; count < 10 && storyWindow.dialogue.phase !== 'ended'; count += 1) {
      storyWindow.dialogue.advance();
    }

    storyWindow.update(0);

    expect(storyWindow.state).toBe('closing');

    nightScreen.contents.menuButton.activate();

    let menu = nightScreen.contents.menuModal;

    if (menu === null) {
      throw new Error('The menu did not open!');
    }

    await waitForNoStoryWindow(harness);
    await nextFrame();
    await nextFrame();

    expect(getPlace(harness).id).toBe(FIXED_SQUARE);
    expect(nightScreen.ui.topOverlay).toBe(menu);

    menu.close();
    await waitForPlace(harness, FIXED_BAR);
  });

  test('a script that sets night.place shows that place', async () => {
    let {measureText, nightScreen} = harness;
    let bar = getFixedPlace(FIXED_BAR);

    await nextFrame();

    let {contents, ui} = nightScreen;
    let {spotButtons} = contents;

    for (let button of squareButtons) {
      expect(button.view.destroyed).toBe(true);
      expect(ui.children).not.toContain(button);
    }

    expect(spotButtons.map(getButtonLabel)).toEqual(bar.spots.map((spot) => spot.label));

    for (let [index, spot] of bar.spots.entries()) {
      let button = spotButtons[index];
      let size = {width: measureText(spot.label, 'label') + 12, height: 16};
      let position = getSpotPosition({
        x: spot.x,
        y: spot.y,
        ...size,
        area: getSceneArea(480, 270),
      });

      if (button === undefined) {
        throw new Error(`The bar has no "${spot.label}" button!`);
      }

      expect(ui.children).toContain(button);
      expect(getBox(harness, button)).toEqual({...position, ...size});
    }

    expect(getButtonLabel(getPlaceButton(harness))).toBe('The bar');
    expect(getPicture(harness)).not.toBe(squarePicture);
    expect(squarePicture.view.destroyed).toBe(true);
    expect(getStoryWindow(harness).dialogue.node?.speaker).toBe('The bar');
  });

  // It starts in the bar the test before arrived in. Direct calls, as Tab
  // makes them.
  test('Tab goes from the place button to Menu and then to the scene buttons', async () => {
    let {ui} = harness.nightScreen;

    await closeStory();
    ui.clearFocus();
    ui.focusNext();

    expect(describeFocus(ui.focused)).toBe('The bar');

    ui.focusNext();

    expect(describeFocus(ui.focused)).toBe('Menu');

    ui.focusNext();

    expect(describeFocus(ui.focused)).toBe('The bartender');
  });

  // Last in the file: it leaves the error screen shown.
  test('a place whose picture does not compile shows the error screen', async () => {
    let {game} = harness;
    let {errorScreen} = await import('../source/game/screens/errorScreen.js');
    // The screen logs the error; the test reads it, and the output stays clean.
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await restartAt(harness, FIXED_STOP);
      await closeStory();
      await pressThrough(await openSpot('A dark lane'));
      await press('Enter');
      await vitest.waitFor(
        () => {
          expect(game.currentScreen).toBe(errorScreen);
        },
        {timeout: 10_000},
      );

      let error: unknown = consoleError.mock.calls[0]?.[0];

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/Picture shader failed to compile/u);
    } finally {
      consoleError.mockRestore();
    }
  });
});
