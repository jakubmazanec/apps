import {type Button, type Modal} from 'tellurion';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {getSceneArea} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {type PlaceId} from '../source/game/core/night.js';
import {type PlacePicture} from '../source/game/screens/placePicture.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {type TravelWindow} from '../source/game/screens/travelWindow.js';
import {FIXED_BAR, FIXED_SQUARE, FIXED_STOP, getFixedPlace} from './fixedWorld.js';
import {
  bootGame,
  describeFocus,
  getBox,
  getButtonLabel,
  getMenuButton,
  getPicture,
  getPlace,
  getPlaceButton,
  getSpotButton,
  getStoryWindow,
  getTravelParts,
  getWindowParts,
  type Harness,
  nextFrame,
  press,
  pressThrough,
  readText,
  restartAt,
  setViewport,
  startNewGame,
  useFixedWorld,
  waitForNoStoryWindow,
  waitForPlace,
} from './nightScreenHelpers.js';

// What the screen warns when a script names "nowhere" in the fixed square.
const UNKNOWN_PLACE_WARNING = `No place "nowhere"; the night stays in "${FIXED_SQUARE}".`;

// Presses Enter until the text has ended; the last press closes the window.
// The game's own journey is one node, but its text can run to a second page.
async function endStory(storyWindow: StoryWindow): Promise<void> {
  for (let count = 0; count < 40 && storyWindow.dialogue.phase !== 'ended'; count += 1) {
    await press('Enter');
  }
}

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
    await pressThrough(harness, getStoryWindow(harness));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  }

  // Opens the square's way out and picks one of its choices.
  async function chooseWayOut(label: string): Promise<void> {
    let storyWindow = await openSpot('The street');

    await pressThrough(harness, storyWindow);

    let choice = getWindowParts(storyWindow).buttons.find(
      (button) => getButtonLabel(button) === label,
    );

    if (choice === undefined) {
      throw new Error(`The way out has no "${label}" choice!`);
    }

    harness.nightScreen.ui.focus(choice);
    await press('Enter');
  }

  // The screen opens the travel window in its next frame after the way out's
  // window has closed.
  async function waitForTravelWindow(): Promise<TravelWindow> {
    return vitest.waitFor(
      () => {
        let {travelWindow} = harness.nightScreen.contents;

        if (travelWindow === null) {
          throw new Error('The travel window is not open.');
        }

        return travelWindow;
      },
      {timeout: 10_000},
    );
  }

  // The travel window closes after a 100 ms fade, so closing is awaited.
  async function waitForNoTravelWindow(): Promise<void> {
    await vitest.waitFor(
      () => {
        if (harness.nightScreen.contents.travelWindow !== null) {
          throw new Error('The travel window is still open.');
        }
      },
      {timeout: 10_000},
    );
  }

  // Picks a destination of the travel window: presses the place's button on
  // the map, which selects it, and then the destination button.
  async function pickDestination(travelWindow: TravelWindow, place: PlaceId): Promise<void> {
    let {ui} = harness.nightScreen;
    let button = getTravelParts(travelWindow).places.get(place);

    if (button === undefined) {
      throw new Error(`The travel window's map has no "${place}" button!`);
    }

    ui.focus(button);
    await press('Enter');

    let {destination} = getTravelParts(travelWindow);

    if (destination === null) {
      throw new Error('The travel window has no destination button!');
    }

    ui.focus(destination);
    await press('Enter');
  }

  // The journey's window opens once the travel window has faded out.
  async function waitForStoryWindow(): Promise<StoryWindow> {
    return vitest.waitFor(() => getStoryWindow(harness), {timeout: 10_000});
  }

  // Leaves the square by a way out's choice and a destination, and returns the
  // journey's window.
  async function startJourney(choice: string, destination: PlaceId): Promise<StoryWindow> {
    await chooseWayOut(choice);
    await pickDestination(await waitForTravelWindow(), destination);

    return waitForStoryWindow();
  }

  // What hiding the screen leaves: no window, no place, and in the UI only the
  // status line and Menu. The travel window's modal is destroyed, whether it
  // closed before or the screen destroyed it.
  function expectNothingLeft(travelModal: Modal): void {
    let {contents, ui} = harness.nightScreen;

    expect(contents.travelWindow).toBeNull();
    expect(contents.storyWindow).toBeNull();
    expect(contents.place).toBeNull();
    expect(contents.placeButton).toBeNull();
    expect(contents.picture).toBeNull();
    expect(ui.children).toHaveLength(2);
    expect(ui.children).toContain(contents.statusText);
    expect(ui.children).toContain(contents.menuButton);
    expect(travelModal.view.destroyed).toBe(true);
  }

  beforeAll(async () => {
    harness = await bootGame(960, 540);
    restore = useFixedWorld({place: FIXED_SQUARE});
  }, 60_000);

  afterAll(() => {
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
    // The screen warns about the unknown place; the test reads every warning
    // of its own, and the output stays clean.
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await closeStory();

      let buttonsBefore = [...nightScreen.contents.spotButtons];

      await pressThrough(harness, await openSpot('A wrong turn'));
      await press('Enter');
      await waitForNoStoryWindow(harness);
      await nextFrame();
      await nextFrame();

      let {night, spotButtons} = nightScreen.contents;

      expect(warn.mock.calls).toEqual([[UNKNOWN_PLACE_WARNING]]);
      expect(night.place).toBe(FIXED_SQUARE);
      expect(spotButtons).toHaveLength(buttonsBefore.length);
      expect(spotButtons.every((button, index) => button === buttonsBefore[index])).toBe(true);
    } finally {
      warn.mockRestore();
    }
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

  // The tests from here on start a new night in the square, whose street is a
  // way out with all three ways.
  test("a way out's choice opens the travel window on that way", async () => {
    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut('Take the tram');

    let travelWindow = await waitForTravelWindow();

    expect(travelWindow.way).toBe('tram');
    expect(harness.nightScreen.contents.night.leaving).toBeNull();
  });

  test('Stay closes the way out and opens nothing', async () => {
    let {contents} = harness.nightScreen;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();

    let nightBefore = {...contents.night};

    await chooseWayOut('Stay');
    await waitForNoStoryWindow(harness);
    await nextFrame();
    await nextFrame();

    expect(contents.travelWindow).toBeNull();
    expect(contents.night).toEqual(nightBefore);
  });

  test('Escape closes the travel window and nothing has changed', async () => {
    let {contents} = harness.nightScreen;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();

    let nightBefore = {...contents.night};
    let buttonsBefore = [...contents.spotButtons];

    await chooseWayOut('Walk');
    await waitForTravelWindow();
    await press('Escape');
    await waitForNoTravelWindow();

    expect(contents.night).toEqual(nightBefore);
    expect(contents.spotButtons).toHaveLength(buttonsBefore.length);
    expect(contents.spotButtons.every((button, index) => button === buttonsBefore[index])).toBe(
      true,
    );
    // The travel window declares close, so Escape closed it and opened no menu.
    expect(contents.menuModal).toBeNull();
  });

  test('a journey, from the door to the arrival', async () => {
    let {contents, ui} = harness.nightScreen;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();

    let oldButtons = [getPlaceButton(harness), ...contents.spotButtons];
    // A taxi to the bar: 6 minutes and 120 Kč.
    let storyWindow = await startJourney('Take a taxi', FIXED_BAR);

    expect(readText(contents.statusText)).toBe('19:46   230 Kč   Sober');
    expect(contents.night.place).toBe(FIXED_BAR);
    expect(storyWindow.dialogue.node?.speaker).toBe('The taxi');
    expect(contents.place).toBeNull();
    expect(contents.placeButton).toBeNull();
    expect(contents.picture).toBeNull();
    expect(contents.spotButtons).toHaveLength(0);

    for (let button of oldButtons) {
      expect(button.view.destroyed).toBe(true);
      expect(ui.children).not.toContain(button);
    }

    // The status line takes the place button's spot.
    await vitest.waitFor(
      () => {
        expect(getBox(harness, contents.statusText)).toMatchObject({left: 4, top: 6});
      },
      {timeout: 10_000},
    );

    await endStory(storyWindow);
    await waitForPlace(harness, FIXED_BAR);

    expect(getStoryWindow(harness).dialogue.node?.speaker).toBe('The bar');
  });

  // 292 × 524 CSS pixels are 146 × 262 art pixels, the narrowest screen.
  test('a resize during a journey', async () => {
    let {contents} = harness.nightScreen;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();

    let storyWindow = await startJourney('Walk', FIXED_BAR);

    try {
      await setViewport(harness, 292, 524);
      // With no place shown, the status line stands under the top row.
      await vitest.waitFor(
        () => {
          expect(getBox(harness, getWindowParts(storyWindow).panel).width).toBe(138);
          expect(getBox(harness, contents.statusText)).toMatchObject({left: 4, top: 24});
        },
        {timeout: 10_000},
      );

      expect(contents.storyWindow).toBe(storyWindow);
    } finally {
      await setViewport(harness, 960, 540);
    }

    // Back in the top row, where the place button would stand.
    await vitest.waitFor(
      () => {
        expect(getBox(harness, contents.statusText)).toMatchObject({left: 4, top: 6});
      },
      {timeout: 10_000},
    );
  });

  test('a resize with the travel window open lays it out again', async () => {
    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut('Walk');

    let travelWindow = await waitForTravelWindow();
    // The window takes the screen less a margin of 4 all round: side by side on 480 × 270, stacked
    // and at most 300 wide on 146 × 262. Its height shows the screen's height reached it.
    let getPanelSize = () => {
      let {width, height} = getBox(harness, getTravelParts(travelWindow).panel);

      return {width, height};
    };

    await vitest.waitFor(
      () => {
        expect(getPanelSize()).toEqual({width: 472, height: 262});
      },
      {timeout: 10_000},
    );

    try {
      await setViewport(harness, 292, 524);
      await vitest.waitFor(
        () => {
          expect(getPanelSize()).toEqual({width: 138, height: 254});
        },
        {timeout: 10_000},
      );
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test('Quit to menu with the travel window open leaves nothing behind', async () => {
    let {game, mainMenuScreen} = harness;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut('Walk');

    let travelWindow = await waitForTravelWindow();

    await game.showScreen(mainMenuScreen);

    expect(mainMenuScreen.state).toBe('shown');

    expectNothingLeft(travelWindow.modal);
  });

  test('Quit to menu during a journey leaves nothing behind', async () => {
    let {mainMenuScreen, nightScreen} = harness;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut('Walk');

    let travelWindow = await waitForTravelWindow();

    await pickDestination(travelWindow, FIXED_BAR);
    await waitForStoryWindow();
    // The journey's window declares no close, so Escape opens the menu.
    await press('Escape');

    let menu = nightScreen.contents.menuModal;

    if (menu === null) {
      throw new Error('The menu did not open!');
    }

    nightScreen.ui.focus(getMenuButton(menu, 'Quit to menu'));
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expectNothingLeft(travelWindow.modal);

    await startNewGame(harness);

    expect(getPlace(harness).id).toBe(FIXED_SQUARE);
    expect(readText(nightScreen.contents.statusText)).toBe('19:40   350 Kč   Sober');
  });

  // No spot of the fixed world sets both, so the night is changed by hand while
  // the description is open, as a script's onEnter would change it.
  test('an unknown place drops the way out chosen with it', async () => {
    let {contents, ui} = harness.nightScreen;
    // The screen warns about the unknown place; the test reads every warning
    // of its own, and the output stays clean.
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await restartAt(harness, FIXED_SQUARE);

      contents.night.place = 'nowhere' as PlaceId;
      contents.night.leaving = {way: 'walk', ways: ['walk', 'tram', 'taxi']};
      await closeStory();
      await nextFrame();
      await nextFrame();

      expect(warn.mock.calls).toEqual([[UNKNOWN_PLACE_WARNING]]);
      expect(contents.night.place).toBe(FIXED_SQUARE);
      expect(contents.night.leaving).toBeNull();
      expect(contents.travelWindow).toBeNull();

      // A later window that has nothing to do with it opens no travel window,
      // and the screen warns no more.
      ui.focus(getPlaceButton(harness));
      await press('Enter');
      await closeStory();
      await nextFrame();
      await nextFrame();

      expect(contents.travelWindow).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  // A journey always ends in a place of nightStart; the night is changed by
  // hand to reach what cannot happen. The test after it starts from the error
  // screen.
  test('a journey that ends in no place shows the error screen', async () => {
    let {nightScreen} = harness;
    let {errorScreen} = await import('../source/game/screens/errorScreen.js');
    // The screen logs the error; the test reads it, and the output stays clean.
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await restartAt(harness, FIXED_SQUARE);
      await closeStory();

      let storyWindow = await startJourney('Walk', FIXED_BAR);

      nightScreen.contents.night.place = 'nowhere' as PlaceId;
      await endStory(storyWindow);
      await vitest.waitFor(
        () => {
          expect(errorScreen.state).toBe('shown');
        },
        {timeout: 10_000},
      );

      let error: unknown = consoleError.mock.calls[0]?.[0];

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'The journey ended in "nowhere", which is not a place!',
      );
    } finally {
      consoleError.mockRestore();
    }
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
      await pressThrough(harness, await openSpot('A dark lane'));
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
