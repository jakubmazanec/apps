import {type Button, Text} from 'tellurion';
import {afterAll, afterEach, beforeAll, describe, expect, test, vitest} from 'vitest';

import travel from '../source/game/content/data/travel.json';
import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {places} from '../source/game/content/places.js';
import {type PlaceId, type Way} from '../source/game/core/night.js';
import {type Destination, getDestinations, type NightStart} from '../source/game/core/travel.js';
import {type TravelWindow} from '../source/game/screens/travelWindow.js';
import {FIXED_BAR, FIXED_STOP, getFixedPlace} from './fixedWorld.js';
import {
  bootGame,
  type Box,
  describeFocus,
  doBoxesOverlap,
  getBox,
  getButtonLabel,
  getStoryWindow,
  getTravelParts,
  type Harness,
  nextFrame,
  press,
  pressThrough,
  readText,
  setViewport,
  startNewGame,
  tap,
  useFixedWorld,
  waitForNoStoryWindow,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check the window, not the picture's
// pixels, so the main menu, which shows the bar, gets the pipeline's proof, a
// shader of a few lines, as the fixed world's places do. The bar's GLSL has
// its text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

const ALL_WAYS: readonly Way[] = ['walk', 'tram', 'taxi'];

// A destination's button holds the name's Text and then the numbers' Text.
function getDestinationTexts(button: Button): {name: Text; numbers: Text} {
  let [name, numbers] = button.children;

  if (!(name instanceof Text) || !(numbers instanceof Text)) {
    throw new TypeError('The destination has no name or no numbers!');
  }

  return {name, numbers};
}

// The list as it reads: the name and the numbers of each destination.
function readDestinations(travelWindow: TravelWindow): Array<[string, string]> {
  return getTravelParts(travelWindow).destinations.map((button) => {
    let {name, numbers} = getDestinationTexts(button);

    return [readText(name), readText(numbers)];
  });
}

function expectInsideNarrowScreen(box: Box): void {
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.left + box.width).toBeLessThanOrEqual(146);
  expect(box.top + box.height).toBeLessThanOrEqual(262);
}

// 960 × 540 CSS pixels are 480 × 270 art pixels; 292 × 524 are 146 × 262, the
// narrowest screen. The window opens over the fixed world's stop, whose
// description is closed first, as the night screen opens it over a place. The
// frames of a headless browser are slow, and a real tap takes many frames, so
// the tests get a long timeout.
describe('travel window', {timeout: 180_000}, () => {
  let harness: Harness;
  let restore: () => void;
  let TravelWindowClass: typeof TravelWindow;
  let travelWindow: TravelWindow | null = null;
  let onClosed = vitest.fn<(destination: Destination | null) => void>();

  // Opens a window as the night screen will, for the screen's width, with a
  // fresh onClosed spy. A window a test opened before is destroyed first.
  function openTravel(
    way: Way,
    {
      ways = ALL_WAYS,
      start = nightStart,
      from = FIXED_STOP,
    }: {ways?: readonly Way[]; start?: NightStart; from?: PlaceId} = {},
  ): TravelWindow {
    let {game, nightScreen} = harness;

    travelWindow?.modal.destroy();
    onClosed = vitest.fn<(destination: Destination | null) => void>();
    travelWindow = new TravelWindowClass({
      ui: nightScreen.ui,
      scheduler: nightScreen.scheduler,
      start,
      from,
      way,
      ways,
      screenWidth: game.app.screen.width / game.pixelScale,
      onClosed,
    });

    return travelWindow;
  }

  // The window closes after a 200 ms fade, so closing is awaited.
  async function waitForClosed(): Promise<void> {
    await vitest.waitFor(
      () => {
        if (onClosed.mock.calls.length === 0) {
          throw new Error('The travel window has not closed yet.');
        }
      },
      {timeout: 10_000},
    );
  }

  // The layout settles in the frames after the window is built.
  async function waitForPanelWidth(openWindow: TravelWindow, width: number): Promise<void> {
    await vitest.waitFor(
      () => {
        expect(getBox(harness, getTravelParts(openWindow).panel).width).toBe(width);
      },
      {timeout: 10_000},
    );
  }

  function expectNumbersUnderNames(openWindow: TravelWindow): void {
    for (let button of getTravelParts(openWindow).destinations) {
      let {name, numbers} = getDestinationTexts(button);
      let nameBox = getBox(harness, name);
      let numbersBox = getBox(harness, numbers);

      expect(numbersBox.top).toBeGreaterThanOrEqual(nameBox.top + nameBox.height);
      expect(numbersBox.left).toBe(nameBox.left);
    }
  }

  beforeAll(async () => {
    harness = await bootGame(960, 540);
    ({TravelWindow: TravelWindowClass} = await import('../source/game/screens/travelWindow.js'));
    restore = useFixedWorld({place: FIXED_STOP});
    await startNewGame(harness);
    await pressThrough(harness, getStoryWindow(harness));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  }, 60_000);

  afterEach(() => {
    // destroy() does nothing to a window that has closed.
    travelWindow?.modal.destroy();
    travelWindow = null;
  });

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('the title, the row and the list of each way', async () => {
    let walkWindow = openTravel('walk');
    let walk = getTravelParts(walkWindow);

    expect(readText(walk.title)).toBe('On foot');
    expect(walk.ways.map((button) => getButtonLabel(button))).toEqual(['Walk', 'Tram', 'Taxi']);
    expect(readDestinations(walkWindow)).toEqual([
      ['The bar', '4 min'],
      ['The square by the old market', '7 min'],
    ]);

    // On a wide screen the numbers stand level with the name, at the right
    // end of the button's label.
    await waitForPanelWidth(walkWindow, 300);

    for (let button of walk.destinations) {
      let buttonBox = getBox(harness, button);
      let {name, numbers} = getDestinationTexts(button);
      let numbersBox = getBox(harness, numbers);

      expect(numbersBox.top).toBe(getBox(harness, name).top);
      expect(numbersBox.left + numbersBox.width).toBe(buttonBox.left + buttonBox.width - 6);
    }

    let taxiWindow = openTravel('taxi');

    expect(readText(getTravelParts(taxiWindow).title)).toBe('By taxi');
    // Both are five minutes away, so they stand by name.
    expect(readDestinations(taxiWindow)).toEqual([
      ['The bar', '5 min  90 Kč'],
      ['The square by the old market', '5 min  90 Kč'],
    ]);

    let tram = getTravelParts(openTravel('tram'));

    expect(readText(tram.title)).toBe('By tram');
    expect(tram.destinations).toHaveLength(0);
  });

  test('the first destination has the focus and the ring', () => {
    let {ui} = harness.nightScreen;
    let walk = getTravelParts(openTravel('walk'));

    expect(describeFocus(ui.focused)).toBe('The bar');
    expect(ui.focused).toBe(walk.destinations[0]);
    expect(ui.isRingVisible).toBe(true);

    let tram = getTravelParts(openTravel('tram'));

    expect(describeFocus(ui.focused)).toBe('Back');
    expect(ui.focused).toBe(tram.back);
    expect(ui.isRingVisible).toBe(true);
  });

  test("a way's button switches the title and the list and keeps the focus", async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let before = getTravelParts(opened);
    let [walkButton, tramButton] = before.ways;

    if (walkButton === undefined || tramButton === undefined) {
      throw new Error('The row has no Walk or no Tram button!');
    }

    await waitForPanelWidth(opened, 300);

    let getBoxes = (): Box[] => {
      let {back, panel, ways} = getTravelParts(opened);

      return [panel, ...ways, back].map((part) => getBox(harness, part));
    };
    let boxesBefore = getBoxes();

    // The current way changes nothing: the list is not built again.
    ui.focus(walkButton);
    await press('Enter');

    let unchanged = getTravelParts(opened).destinations;

    expect(unchanged).toHaveLength(2);

    for (let [index, button] of unchanged.entries()) {
      expect(button).toBe(before.destinations[index]);
    }

    let expectTram = (): void => {
      let after = getTravelParts(opened);

      expect(opened.way).toBe('tram');
      expect(readText(after.title)).toBe('By tram');
      expect(after.destinations).toHaveLength(0);
      expect(describeFocus(ui.focused)).toBe('Tram');
      expect(ui.focused).toBe(tramButton);
      expect(getBoxes()).toEqual(boxesBefore);
    };

    ui.focus(tramButton);
    await press('Enter');
    expectTram();
    // Pressing the current way again changes nothing.
    await press('Enter');
    expectTram();

    // The window is as high as the longest list of all the ways needs, also
    // when it opens on a way with no destination.
    let openedOnTram = openTravel('tram');

    await waitForPanelWidth(openedOnTram, 300);

    expect(getBox(harness, getTravelParts(openedOnTram).panel)).toEqual(boxesBefore[0]);
  });

  test('Back closes it with nothing picked', async () => {
    let parts = getTravelParts(openTravel('walk'));

    harness.nightScreen.ui.focus(parts.back);
    await press('Enter');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('Escape closes it with nothing picked', async () => {
    openTravel('walk');
    await press('Escape');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
    // The window took the cancel command; the night screen opened no menu.
    expect(harness.nightScreen.contents.menuModal).toBeNull();
  });

  test('a pick closes it and reports the destination', async () => {
    openTravel('walk');
    await press('Enter');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith({
      place: getFixedPlace(FIXED_BAR),
      way: 'walk',
      minutes: 4,
      price: 0,
    });
  });

  test('a press while it fades does nothing', async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let {destinations, title, ways} = getTravelParts(opened);
    let [destination] = destinations;
    let taxiButton = ways[2];

    if (destination === undefined || taxiButton === undefined) {
      throw new Error('The window has no destination or no Taxi button!');
    }

    // Escape and then the presses, without a frame between them: on a slow
    // machine the whole fade can pass between two key presses.
    ui.cancel();

    expect(opened.modal.state).toBe('closing');

    ui.focus(destination);
    ui.activate();
    ui.focus(taxiButton);
    ui.activate();

    expect(readText(title)).toBe('On foot');
    expect(opened.way).toBe('walk');

    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('real taps switch the way, pick and go back', async () => {
    let opened = openTravel('walk');

    await waitForPanelWidth(opened, 300);

    let taxiButton = getTravelParts(opened).ways[2];

    if (taxiButton === undefined) {
      throw new Error('The row has no Taxi button!');
    }

    await tap(harness, getBox(harness, taxiButton));

    expect(opened.way).toBe('taxi');

    await nextFrame();

    let [firstDestination] = getTravelParts(opened).destinations;

    if (firstDestination === undefined) {
      throw new Error('The taxi list is empty!');
    }

    await tap(harness, getBox(harness, firstDestination));
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith({
      place: getFixedPlace(FIXED_BAR),
      way: 'taxi',
      minutes: 5,
      price: 90,
    });

    let second = openTravel('walk');

    await waitForPanelWidth(second, 300);
    await tap(harness, getBox(harness, getTravelParts(second).back));
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('on a 146 × 262 screen the row fits, the numbers stand under the name, and the window fits', async () => {
    try {
      await setViewport(harness, 292, 524);

      let opened = openTravel('walk');

      await waitForPanelWidth(opened, 138);

      let parts = getTravelParts(opened);
      let panel = getBox(harness, parts.panel);
      let wayBoxes = parts.ways.map((button) => getBox(harness, button));

      // The panel's inner box: the window's padding is 12 left and right, 8 above and below.
      for (let box of wayBoxes) {
        expect(box.left).toBeGreaterThanOrEqual(panel.left + 12);
        expect(box.left + box.width).toBeLessThanOrEqual(panel.left + panel.width - 12);
        expect(box.top).toBeGreaterThanOrEqual(panel.top + 8);
        expect(box.top + box.height).toBeLessThanOrEqual(panel.top + panel.height - 8);
      }

      for (let [index, box] of wayBoxes.entries()) {
        for (let other of wayBoxes.slice(index + 1)) {
          expect(doBoxesOverlap(box, other)).toBe(false);
        }
      }

      expectNumbersUnderNames(opened);

      // The bar is 4 minutes away, the square 7: the square stands second.
      let square = parts.destinations[1];

      if (square === undefined) {
        throw new Error('The walk list has no second destination!');
      }

      expect(readText(getDestinationTexts(square).name)).toBe('The square by the\nold market');

      expectInsideNarrowScreen(panel);
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test("the game's longest list fits 146 × 262", async () => {
    let gameStart: NightStart = {...nightStart, places, travel};
    let longest: {from: PlaceId; way: Way; count: number} = {
      from: FIXED_STOP,
      way: 'walk',
      count: 0,
    };

    for (let place of Object.values(places)) {
      for (let way of ALL_WAYS) {
        let count = getDestinations(gameStart, place.id, way).length;

        if (count > longest.count) {
          longest = {from: place.id, way, count};
        }
      }
    }

    expect(longest.count).toBeGreaterThan(0);

    try {
      await setViewport(harness, 292, 524);

      let opened = openTravel(longest.way, {start: gameStart, from: longest.from});

      await waitForPanelWidth(opened, 138);

      expect(getTravelParts(opened).destinations).toHaveLength(longest.count);

      expectInsideNarrowScreen(getBox(harness, getTravelParts(opened).panel));
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test('a resize from wide to narrow lays the list out again and keeps the way and the focus', async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('taxi');

    // An arrow key moves the focus by the buttons' places, which the first layout sets.
    await waitForPanelWidth(opened, 300);
    await press('ArrowDown');

    let oldSecond = getTravelParts(opened).destinations[1];

    expect(describeFocus(ui.focused)).toBe('The square by the old market');
    expect(ui.focused).toBe(oldSecond);

    try {
      await setViewport(harness, 292, 524);
      opened.resize(146);
      await waitForPanelWidth(opened, 138);

      let parts = getTravelParts(opened);

      expect(opened.way).toBe('taxi');
      expect(readText(parts.title)).toBe('By taxi');

      expectNumbersUnderNames(opened);

      expect(ui.focused).toBe(parts.destinations[1]);
      expect(parts.destinations[1]).not.toBe(oldSecond);
    } finally {
      await setViewport(harness, 960, 540);
    }
  });
});
