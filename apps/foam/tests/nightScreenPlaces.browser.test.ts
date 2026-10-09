import * as pixi from 'pixi.js';
import {type Button, type Modal, Text} from 'tellurion';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

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
  type Pixels,
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

type Rgb = [number, number, number];
type Point = {x: number; y: number};

// The colour of a pixel of a screen read. The extract leaves a pixel with no
// picture under it not opaque, and the screen shows the black background there.
function readRgb({pixels, width}: Pixels, x: number, y: number): Rgb {
  let index = (y * width + x) * 4;

  if (pixels[index + 3] !== 255) {
    return [0, 0, 0];
  }

  return [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
}

function getSum([red, green, blue]: Rgb): number {
  return red + green + blue;
}

// What the screen shows, rendered again from the stage.
function readScreen({game}: Harness): Pixels {
  let {renderer, screen, stage} = game.app;

  return renderer.extract.pixels({
    target: stage,
    frame: new pixi.Rectangle(0, 0, screen.width, screen.height),
  });
}

// How bright a pixel is against its undimmed colour: 1 undimmed, 0.4 dimmed, 0 black.
function getLight(color: Rgb, undimmed: Rgb): number {
  let light = 0;

  for (let [index, channel] of undimmed.entries()) {
    if (channel > 0) {
      light = Math.max(light, (color[index] ?? 0) / channel);
    }
  }

  return light;
}

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check places, buttons, windows and
// the dimming of the scene, not what the picture draws (the tests in
// tests/placePicture.browser.test.ts do), so the main menu, which shows the
// bar, gets the pipeline's proof, a shader of a few lines, as the fixed
// world's places do. The bar's GLSL has its text as its type, so the stub's
// text is cast to it.
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

  // Whether the night screen's travel window, which it keeps, is on the UI
  // root: opening, open or closing.
  function isTravelShown(): boolean {
    return harness.nightScreen.contents.travelWindow.modal.state !== 'closed';
  }

  // The screen opens the travel window in its next frame after the way out's
  // window has closed.
  async function waitForTravelWindow(): Promise<TravelWindow> {
    return vitest.waitFor(
      () => {
        let {travelWindow} = harness.nightScreen.contents;

        if (!isTravelShown()) {
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
        if (isTravelShown()) {
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

  // Waits until the screen has built the place a window leads to, and returns its picture.
  async function waitForNextPlace(place: PlaceId): Promise<PlacePicture> {
    return vitest.waitFor(
      () => {
        let {nextPlace} = harness.nightScreen.contents;

        if (nextPlace?.place.id !== place) {
          throw new Error(`The screen has not built "${place}" yet.`);
        }

        return nextPlace.picture;
      },
      {timeout: 10_000},
    );
  }

  // Leaves the square by a way out's choice and a destination, and returns the
  // journey's window.
  async function startJourney(choice: string, destination: PlaceId): Promise<StoryWindow> {
    await chooseWayOut(choice);
    await pickDestination(await waitForTravelWindow(), destination);

    return waitForStoryWindow();
  }

  // What hiding the screen leaves: no window, no place, and in the UI only the
  // status line, Menu and the backdrop. The travel window's modal is kept for
  // the next night, whether it closed before or the screen took it off.
  function expectNothingLeft(travelModal: Modal): void {
    let {contents, ui} = harness.nightScreen;

    expect(travelModal).toBe(contents.travelWindow.modal);
    expect(travelModal.state).toBe('closed');
    expect(travelModal.view.destroyed).toBe(false);
    expect(contents.storyWindow).toBeNull();
    expect(contents.place).toBeNull();
    expect(contents.placeButton).toBeNull();
    expect(contents.picture).toBeNull();
    expect(contents.nextPlace).toBeNull();
    expect(ui.children).toHaveLength(3);
    expect(ui.children).toContain(contents.statusText);
    expect(ui.children).toContain(contents.menuButton);
    expect(ui.children).toContain(contents.backdrop);
  }

  beforeAll(async () => {
    // The fixed world goes in before the boot: the night screen builds its travel window when it
    // is attached, from the world nightStart holds then.
    restore = useFixedWorld({place: FIXED_SQUARE});
    harness = await bootGame(960, 540);
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

    expect(isTravelShown()).toBe(false);
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

  // The screen builds its travel window once, when it is attached, so that opening it costs a
  // frame like any other: every way out shows the same window, kept between journeys and nights.
  test('every way out shows the one travel window the screen keeps', async () => {
    let {contents} = harness.nightScreen;
    let kept = contents.travelWindow;
    let keptModal = kept.modal;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut('Walk');

    await expect(waitForTravelWindow()).resolves.toBe(kept);

    await press('Escape');
    await waitForNoTravelWindow();

    expect(keptModal.view.destroyed).toBe(false);

    await chooseWayOut('Take a taxi');

    let reopened = await waitForTravelWindow();

    expect(reopened).toBe(kept);
    expect(reopened.modal).toBe(keptModal);
    expect(reopened.way).toBe('taxi');

    await press('Escape');
    await waitForNoTravelWindow();
  });

  test('a journey, from the door to the arrival', async () => {
    let {contents, ui} = harness.nightScreen;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();

    let oldButtons = [getPlaceButton(harness), ...contents.spotButtons];
    // A taxi to the bar: 6 minutes and 120 Kč.
    let storyWindow = await startJourney('Take a taxi', FIXED_BAR);

    // The screen writes the status in its update, after the journey has changed the night.
    await vitest.waitFor(
      () => {
        expect(readText(contents.statusText)).toBe('19:46   230 Kč   0.0');
      },
      {timeout: 10_000},
    );

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

  // The ticker is stopped, and these tests run the frames themselves at 60 fps, so a 100 ms fade
  // takes six frames, and they read the frames from the screen. The scene's light is read on the
  // square's picture in the bottom left corner, where no window reaches, and on the brightest
  // pixel of Menu's label: 1 undimmed, 0.4 dimmed, 0 black. The picture's colours drift a little
  // as it runs, so the scene counts as dimmed below 0.5 and as lit above 0.8. It is black below
  // 0.05, and a step of 0.2 or more from one frame to the next is a cut; a 100 ms fade from the
  // dimmed level to black takes steps of about 0.1.
  describe('the dimmed scene', () => {
    let time: number;
    let wasAutoStart: boolean;
    // The square with no window open. The picture is a checkerboard of two colours with a white
    // row that moves down, so the picture is read at two pixels two rows apart, which have the
    // same colour: the darker of them has it, and the white row lights one of them at most.
    let undimmed: Pixels;
    // Two pixels of the picture in the corner, outside every window.
    let corner: Point[];
    let menuPixel: {x: number; y: number; color: Rgb};

    function runFrames(count: number): void {
      for (let index = 0; index < count; index += 1) {
        time += 1000 / 60;
        harness.game.app.ticker.update(time);
      }
    }

    function getPictureColor(points: Point[]): Rgb {
      let [color = [0, 0, 0]] = points
        .map(({x, y}) => readRgb(undimmed, x, y))
        .toSorted((first, second) => getSum(first) - getSum(second));

      return color;
    }

    function getPictureLight(pixels: Pixels, points: Point[]): number {
      let color = getPictureColor(points);

      return Math.min(...points.map(({x, y}) => getLight(readRgb(pixels, x, y), color)));
    }

    function readLight(pixels = readScreen(harness)): {menu: number; picture: number} {
      return {
        menu: getLight(readRgb(pixels, menuPixel.x, menuPixel.y), menuPixel.color),
        picture: getPictureLight(pixels, corner),
      };
    }

    // Opens the square's way out, reads it to its choices and takes one, all by hand.
    function chooseWayOutByHand(label: string): void {
      let {ui} = harness.nightScreen;

      ui.focus(getSpotButton(harness, 'The street'));
      ui.activate();

      let wayOut = getStoryWindow(harness);

      for (let count = 0; count < 200 && wayOut.dialogue.phase !== 'choosing'; count += 1) {
        wayOut.dialogue.advance();
        runFrames(1);
      }

      runFrames(10);

      let choice = getWindowParts(wayOut).buttons.find(
        (button) => getButtonLabel(button) === label,
      );

      if (choice === undefined) {
        throw new Error(`The way out has no "${label}" choice!`);
      }

      ui.focus(choice);
      ui.activate();
    }

    // Takes a taxi from the square to the bar by hand, one frame at a time, and reads the
    // screen after each frame, until the bar's description is open. The journey's text goes on
    // once its window is fully shown, as a reader's press does.
    function travelToTheBarByHand(onFrame: (pixels: Pixels, frame: number) => void): void {
      let {contents, ui} = harness.nightScreen;
      let hasSelected = false;

      chooseWayOutByHand('Take a taxi');

      for (let frame = 1; frame <= 400; frame += 1) {
        runFrames(1);
        onFrame(readScreen(harness), frame);

        let {storyWindow, travelWindow} = contents;
        let speaker = storyWindow?.dialogue.node?.speaker;

        if (travelWindow.modal.state === 'open') {
          // Two frames: the place's button selects it, then the destination button travels.
          let {destination, places} = getTravelParts(travelWindow);
          let target = hasSelected ? destination : (places.get(FIXED_BAR) ?? null);

          if (target === null) {
            throw new Error('The travel window has no button to press!');
          }

          ui.focus(target);
          ui.activate();
          hasSelected = true;
        } else if (speaker === 'The taxi' && storyWindow?.state === 'open') {
          storyWindow.dialogue.advance();
        } else if (speaker === 'The bar' && storyWindow?.state === 'open') {
          return;
        }
      }

      throw new Error("The journey has not reached the bar's description!");
    }

    // Runs frames until the screen has no window, and then the 300 ms a backdrop may take to
    // fade out.
    function runUntilNoWindow(): void {
      let {contents} = harness.nightScreen;

      for (
        let count = 0;
        count < 200 && (contents.storyWindow !== null || isTravelShown());
        count += 1
      ) {
        contents.storyWindow?.dialogue.advance();
        runFrames(1);
      }

      expect(contents.storyWindow).toBeNull();
      expect(isTravelShown()).toBe(false);

      runFrames(18);
    }

    beforeEach(async () => {
      let {game, nightScreen} = harness;
      let {screen, ticker} = game.app;

      await restartAt(harness, FIXED_SQUARE);
      await closeStory();
      wasAutoStart = ticker.autoStart;
      ticker.autoStart = false;
      ticker.stop();
      time = ticker.lastTime;
      // Half a second with no window, for any fade to end.
      runFrames(30);

      undimmed = readScreen(harness);

      let [menuLabel] = nightScreen.contents.menuButton.children;

      if (!(menuLabel instanceof Text)) {
        throw new TypeError('Menu has no label!');
      }

      // The label lies on the button's fill, so every pixel of its box is Menu's own.
      let menuBox = getBox(harness, menuLabel);

      corner = [
        {x: game.pixelScale, y: screen.height - 2 * game.pixelScale},
        {x: game.pixelScale, y: screen.height - 4 * game.pixelScale},
      ];
      menuPixel = {x: 0, y: 0, color: [0, 0, 0]};

      for (let y = menuBox.top; y < menuBox.top + menuBox.height; y += 1) {
        for (let x = menuBox.left; x < menuBox.left + menuBox.width; x += 1) {
          let point = {x: x * game.pixelScale, y: y * game.pixelScale};
          let color = readRgb(undimmed, point.x, point.y);

          if (getSum(color) > getSum(menuPixel.color)) {
            menuPixel = {...point, color};
          }
        }
      }
    });

    afterEach(() => {
      let {ticker} = harness.game.app;

      ticker.autoStart = wasAutoStart;
      ticker.start();
    });

    test('the corner shows the picture and Menu has a lit pixel', () => {
      expect(getSum(getPictureColor(corner))).toBeGreaterThan(0);
      expect(getSum(menuPixel.color)).toBeGreaterThan(0);
    });

    // One window follows another from a way out's choice to the arrival's description: neither
    // the place being left nor the one arrived at shows undimmed between two windows, nor does
    // Menu. The travel window's panel covers Menu, so Menu is read while the travel window is
    // not open.
    test('the scene stays dimmed from a way out to the arrival', () => {
      let {contents} = harness.nightScreen;
      let brightFrames: string[] = [];

      travelToTheBarByHand((pixels, frame) => {
        let light = readLight(pixels);
        let isMenuCovered = isTravelShown();

        if (light.picture >= 0.5 || (!isMenuCovered && light.menu >= 0.5)) {
          brightFrames.push(
            `frame ${frame} in "${contents.place?.id ?? 'no place'}": the picture at ${light.picture.toFixed(2)}, Menu at ${light.menu.toFixed(2)}`,
          );
        }
      });

      expect(contents.place?.id).toBe(FIXED_BAR);
      expect(getStoryWindow(harness).state).toBe('open');
      expect(brightFrames).toEqual([]);
    });

    // The travel window's panel covers all of the square but a ring at the edge of the screen.
    // When the destination button travels, the square fades to black with the window, under its
    // panel too, and the bar comes in from black with its description: the picture never comes
    // up under the fading panel, nor does it cut from one light to another.
    test('the place being left fades out with the travel window, and the next fades in', () => {
      let {contents} = harness.nightScreen;
      let lights: number[] = [];
      let underPanel: Point[] | null = null;
      let underPanelLights: number[] = [];

      travelToTheBarByHand((pixels) => {
        let {travelWindow} = contents;

        lights.push(getPictureLight(pixels, corner));

        if (!isTravelShown()) {
          return;
        }

        if (underPanel === null) {
          // In the panel's bottom padding, inside its border.
          let box = getBox(harness, getTravelParts(travelWindow).panel);
          let x = (box.left + 3) * harness.game.pixelScale;
          let bottom = (box.top + box.height) * harness.game.pixelScale;

          underPanel = [
            {x, y: bottom - 3 * harness.game.pixelScale},
            {x, y: bottom - 5 * harness.game.pixelScale},
          ];
        }

        if (travelWindow.modal.state === 'closing') {
          underPanelLights.push(getPictureLight(pixels, underPanel));
        }
      });

      let steps = lights.slice(1).map((light, index) => Math.abs(light - (lights[index] ?? 0)));

      expect(underPanelLights.length).toBeGreaterThan(3);
      expect(Math.max(...underPanelLights)).toBeLessThan(0.15);
      expect(Math.min(...lights)).toBeLessThan(0.05);
      expect(Math.max(...steps)).toBeLessThan(0.2);
      expect(lights.at(-1)).toBeGreaterThan(0.2);
    });

    // The frame that shows the next place lies on black, and a slow one would hold the black, so
    // the place is built while the window that leads there is open, its picture hidden.
    test('the place a journey leads to is built while its window is open', () => {
      let {contents} = harness.nightScreen;
      let builtAhead = new Set<PlacePicture | null>();

      travelToTheBarByHand(() => {
        let {nextPlace, storyWindow} = contents;

        if (storyWindow?.dialogue.node?.speaker === 'The taxi' && storyWindow.state === 'open') {
          builtAhead.add(nextPlace?.picture ?? null);
        }
      });

      let [picture] = builtAhead;

      expect(builtAhead.size).toBe(1);
      expect(contents.picture).not.toBeNull();
      expect(picture).toBe(contents.picture);
      expect(picture?.view.visible).toBe(true);
      expect(contents.nextPlace).toBeNull();
    });

    // The window that moves the player takes the square out with it, and the bar comes in from
    // black with its description. The fixed world's places share a picture, so a cut from one to
    // the other would not show; the black between them does.
    test('a script that moves the player goes through black', () => {
      let {contents, ui} = harness.nightScreen;
      let lights: number[] = [];
      let builtAhead: PlacePicture | null = null;

      ui.focus(getSpotButton(harness, 'The passage'));
      ui.activate();

      for (let frame = 1; frame <= 200; frame += 1) {
        runFrames(1);
        lights.push(getPictureLight(readScreen(harness), corner));

        let {nextPlace, storyWindow} = contents;
        let speaker = storyWindow?.dialogue.node?.speaker;

        if (speaker === 'The passage' && storyWindow?.state === 'open') {
          builtAhead ??= nextPlace?.picture ?? null;
          storyWindow.dialogue.advance();
        } else if (speaker === 'The bar' && storyWindow?.state === 'open') {
          break;
        }
      }

      let steps = lights.slice(1).map((light, index) => Math.abs(light - (lights[index] ?? 0)));

      expect(contents.place?.id).toBe(FIXED_BAR);
      expect(builtAhead).not.toBeNull();
      expect(contents.picture).toBe(builtAhead);
      expect(getStoryWindow(harness).state).toBe('open');
      expect(Math.min(...lights)).toBeLessThan(0.05);
      expect(Math.max(...steps)).toBeLessThan(0.2);
      expect(lights.at(-1)).toBeGreaterThan(0.2);
    });

    test('the scene is lit again once the last window has closed', () => {
      let {ui} = harness.nightScreen;

      ui.focus(getPlaceButton(harness));
      ui.activate();
      runFrames(10);

      let dimmed = readLight();

      expect(dimmed.picture).toBeLessThan(0.5);
      expect(dimmed.menu).toBeLessThan(0.5);

      runUntilNoWindow();

      let lit = readLight();

      expect(lit.picture).toBeGreaterThan(0.8);
      expect(lit.menu).toBeGreaterThan(0.8);
    });

    test('Back on the travel window lights the scene again', () => {
      let {contents, ui} = harness.nightScreen;

      chooseWayOutByHand('Take a taxi');
      runFrames(20);

      if (!isTravelShown()) {
        throw new Error('The travel window is not open!');
      }

      // The travel window's panel covers Menu.
      expect(readLight().picture).toBeLessThan(0.5);

      ui.focus(getTravelParts(contents.travelWindow).back);
      ui.activate();
      runUntilNoWindow();

      let lit = readLight();

      expect(contents.place?.id).toBe(FIXED_SQUARE);
      expect(lit.picture).toBeGreaterThan(0.8);
      expect(lit.menu).toBeGreaterThan(0.8);
    });

    // The first place's description opens with the night, and the place is dimmed from the
    // night's first frame.
    test('a night starts with the scene dimmed', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;

      await game.showScreen(mainMenuScreen);
      await game.showScreen(nightScreen);
      runFrames(1);

      let light = readLight();

      expect(light.picture).toBeLessThan(0.5);
      expect(light.menu).toBeLessThan(0.5);
    });
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
    let {game, mainMenuScreen, nightScreen} = harness;

    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut('Walk');

    let travelWindow = await waitForTravelWindow();

    await pickDestination(travelWindow, FIXED_BAR);
    await waitForStoryWindow();

    let builtAhead = await waitForNextPlace(FIXED_BAR);

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

    expect(builtAhead.view.destroyed).toBe(true);

    await startNewGame(harness);
    // Quit was a key press, which the screen hid inside its frame. A fade of the
    // backdrop left from that frame would have lit the scene by the time the new
    // night's description has faded in.
    await vitest.waitFor(
      () => {
        expect(getStoryWindow(harness).state).toBe('open');
      },
      {timeout: 10_000},
    );

    expect(getPlace(harness).id).toBe(FIXED_SQUARE);
    expect(readText(nightScreen.contents.statusText)).toBe('19:40   350 Kč   0.0');
    expect(nightScreen.contents.backdrop.alpha).toBe(game.theme.modal.scrimAlpha);
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
      expect(isTravelShown()).toBe(false);

      // A later window that has nothing to do with it opens no travel window,
      // and the screen warns no more.
      ui.focus(getPlaceButton(harness));
      await press('Enter');
      await closeStory();
      await nextFrame();
      await nextFrame();

      expect(isTravelShown()).toBe(false);
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
      let builtAhead = await waitForNextPlace(FIXED_BAR);

      nightScreen.contents.night.place = 'nowhere' as PlaceId;
      await nextFrame();

      // The night does not lead to the bar any more.
      expect(nightScreen.contents.nextPlace).toBeNull();
      expect(builtAhead.view.destroyed).toBe(true);

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
    let {game, nightScreen} = harness;
    let {errorScreen} = await import('../source/game/screens/errorScreen.js');
    // The screen logs the error; the test reads it, and the output stays clean.
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await restartAt(harness, FIXED_STOP);
      await closeStory();
      // The lane's text moves the player as it starts, and the screen builds the place as soon as
      // the window is fully shown.
      nightScreen.ui.focus(getSpotButton(harness, 'A dark lane'));
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
