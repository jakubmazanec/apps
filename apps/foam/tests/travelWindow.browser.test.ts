import {type Button, Text} from 'tellurion';
import {afterAll, afterEach, beforeAll, describe, expect, test, vitest} from 'vitest';

import locationData from '../source/game/content/data/locations.json';
import map from '../source/game/content/data/map.json';
import travel from '../source/game/content/data/travel.json';
import {locations, places} from '../source/game/content/locations.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {fitMapFrame, MAP_INSET, toMapPixel} from '../source/game/core/fitMapFrame.js';
import {getMapPoint} from '../source/game/core/getMapPoint.js';
import {BUTTON_PADDING_X, LINE_HEIGHT, WINDOW_PADDING_Y} from '../source/game/core/getSceneArea.js';
import {
  getMapSize,
  getTravelLayout,
  TITLE_HEIGHT as LAYOUT_TITLE_HEIGHT,
} from '../source/game/core/getTravelLayout.js';
import {getHoursWords} from '../source/game/core/hours.js';
import {type LocationId} from '../source/game/core/location.js';
import {type Night, type Way} from '../source/game/core/night.js';
import {palette} from '../source/game/core/palette.js';
import {BUTTON_GAP} from '../source/game/core/placeMapButtons.js';
import {
  type Destination,
  getDestinations,
  type LocationData,
  type NightStart,
} from '../source/game/core/travel.js';
import {type MapPicture} from '../source/game/screens/mapPicture.js';
import {type TravelWindow} from '../source/game/screens/travelWindow.js';
import {
  FIXED_BAR_LOCATION,
  FIXED_SQUARE_LOCATION,
  FIXED_STOP,
  FIXED_STOP_LOCATION,
  fixedLocationData,
  fixedLocations,
} from './fixedWorld.js';
import {
  bootGame,
  type Box,
  describeFocus,
  doBoxesOverlap,
  getBox,
  getButtonLabel,
  getColor,
  getStoryWindow,
  getTravelParts,
  type Harness,
  nextFrame,
  type Pixels,
  press,
  pressThrough,
  readPixels,
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
// The window on 960 × 540 CSS pixels, 480 × 270 art pixels: the screen less a margin of 4 all
// round, side by side.
const WIDE_WINDOW = {width: 472, height: 262};
// On each screen of "each screen gets its layout", the square's name from the stop wraps to two
// lines and the numbers take a third: 3 lines of 12, and the padding of 2 above and below. The
// bar's `5 min  90 Kč  till 23:00` is 144 art pixels: in the label of 102 on the narrowest screen
// and of 108 in the side column it wraps under the name to two lines, three with the name; in the
// label of 151 on the stacked screen 195 wide it takes one line.
const DESTINATION_HEIGHT = 40;

// A destination's button holds the name's Text and then the numbers' Text.
function getDestinationTexts(button: Button): {name: Text; numbers: Text} {
  let [name, numbers] = button.children;

  if (!(name instanceof Text) || !(numbers instanceof Text)) {
    throw new TypeError('The destination has no name or no numbers!');
  }

  return {name, numbers};
}

// The destination button as it reads: the name and the numbers, or null without one.
function readDestination(travelWindow: TravelWindow): [string, string] | null {
  let {destination} = getTravelParts(travelWindow);

  if (destination === null) {
    return null;
  }

  let {name, numbers} = getDestinationTexts(destination);

  return [readText(name), readText(numbers)];
}

function getLocationButton(travelWindow: TravelWindow, location: LocationId): Button {
  let button = getTravelParts(travelWindow).locations.get(location);

  if (button === undefined) {
    throw new Error(`The map has no button for the location "${location}"!`);
  }

  return button;
}

function getWayButton(travelWindow: TravelWindow, way: Way): Button {
  let button = getTravelParts(travelWindow).ways[ALL_WAYS.indexOf(way)];

  if (button === undefined) {
    throw new Error(`The row has no button for "${way}"!`);
  }

  return button;
}

function getDestinationButton(travelWindow: TravelWindow): Button {
  let {destination} = getTravelParts(travelWindow);

  if (destination === null) {
    throw new Error('The window has no destination button!');
  }

  return destination;
}

function countColor(pixels: Pixels, color: number): number {
  let count = 0;

  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      if (getColor(pixels, x, y) === color) {
        count += 1;
      }
    }
  }

  return count;
}

// The pixels within `reach` of a pixel, on both axes, that hold `color`.
function countColorNear(
  pixels: Pixels,
  centre: {x: number; y: number},
  {reach, color}: {reach: number; color: number},
): number {
  let count = 0;

  for (let y = centre.y - reach; y <= centre.y + reach; y += 1) {
    for (let x = centre.x - reach; x <= centre.x + reach; x += 1) {
      if (getColor(pixels, x, y) === color) {
        count += 1;
      }
    }
  }

  return count;
}

function getCorner({left, top}: Box): {left: number; top: number} {
  return {left, top};
}

// A box grown by `by` on every side: a box that overlaps it lies closer than `by` on both axes.
function growBox({left, top, width, height}: Box, by: number): Box {
  return {left: left - by, top: top - by, width: width + 2 * by, height: height + 2 * by};
}

function expectInside(inner: Box, outer: Box): void {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top);
  expect(inner.left + inner.width).toBeLessThanOrEqual(outer.left + outer.width);
  expect(inner.top + inner.height).toBeLessThanOrEqual(outer.top + outer.height);
}

// 960 × 540 CSS pixels are 480 × 270 art pixels; 292 × 524 are 146 × 262, the
// narrowest screen. The window opens over the fixed world's stop, whose
// description is closed first, as the night screen opens it over a place. From
// the stop, walking reaches the bar (4 min) and the square (7 min), a taxi
// both (5 min, the bar 90 Kč and the square 60 Kč, the bar first by name), and
// the tram nothing. The frames of a headless browser are slow, and a real tap
// takes many frames, so the tests get a long timeout.
describe('travel window', {timeout: 180_000}, () => {
  let harness: Harness;
  let restore: () => void;
  let MapPictureClass: typeof MapPicture;
  let TravelWindowClass: typeof TravelWindow;
  let travelWindow: TravelWindow | null = null;
  let onClosing = vitest.fn<(destination: Destination | null) => void>();
  let onClosed = vitest.fn<(destination: Destination | null) => void>();

  // Shows a journey on a built window as the night screen does.
  function showJourney(
    builtWindow: TravelWindow,
    way: Way,
    {
      ways = ALL_WAYS,
      from = FIXED_STOP_LOCATION,
      night = harness.nightScreen.contents.night,
    }: {ways?: readonly Way[]; from?: LocationId; night?: Night} = {},
  ): TravelWindow {
    builtWindow.open({from, way, ways, night});

    return builtWindow;
  }

  // Builds a window for the screen's size and the start, with fresh onClosing
  // and onClosed spies, and shows a journey on it. A window a test built before
  // is destroyed first.
  function openTravel(
    way: Way,
    {
      ways = ALL_WAYS,
      start = nightStart,
      from = FIXED_STOP_LOCATION,
      night = harness.nightScreen.contents.night,
    }: {ways?: readonly Way[]; start?: NightStart; from?: LocationId; night?: Night} = {},
  ): TravelWindow {
    let {game, nightScreen} = harness;

    travelWindow?.modal.destroy();
    onClosing = vitest.fn<(destination: Destination | null) => void>();
    onClosed = vitest.fn<(destination: Destination | null) => void>();
    travelWindow = new TravelWindowClass({
      ui: nightScreen.ui,
      scheduler: nightScreen.scheduler,
      start,
      screenWidth: game.app.screen.width / game.pixelScale,
      screenHeight: game.app.screen.height / game.pixelScale,
      onClosing,
      onClosed,
    });

    return showJourney(travelWindow, way, {ways, from, night});
  }

  // The window closes after a 100 ms fade, so closing is awaited.
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
  async function waitForPanel(
    openWindow: TravelWindow,
    size: {width: number; height: number},
  ): Promise<void> {
    await vitest.waitFor(
      () => {
        let {width, height} = getBox(harness, getTravelParts(openWindow).panel);

        expect({width, height}).toEqual(size);
      },
      {timeout: 10_000},
    );
  }

  // Names the control of the window that has the focus, so that a failed check
  // prints a name and not a whole Button.
  function describeTravelFocus(openWindow: TravelWindow): string {
    let {focused} = harness.nightScreen.ui;
    let {destination, locations: locationButtons} = getTravelParts(openWindow);
    let location = [...locationButtons].find(([, button]) => button === focused)?.[0];

    if (location !== undefined) {
      return `location ${location}`;
    }

    return focused !== null && focused === destination ? 'destination' : describeFocus(focused);
  }

  // The map as the player sees it, read back: the marks where they are drawn,
  // which are opaque, and the layer under them everywhere else.
  function readMap(openWindow: TravelWindow): Pixels {
    let {layerSprite, marksSprite} = getTravelParts(openWindow);
    let layer = readPixels(harness, layerSprite.texture);
    let marks = readPixels(harness, marksSprite.texture);
    let pixels = new Uint8ClampedArray(layer.pixels);

    for (let index = 0; index < pixels.length; index += 4) {
      if (marks.pixels[index + 3] === 255) {
        pixels.set(marks.pixels.subarray(index, index + 4), index);
      }
    }

    return {pixels, width: layer.width, height: layer.height};
  }

  // The light's pixel on a map of the map area's size: the frame fits every
  // position of the start, as the window fits it.
  function getLight(openWindow: TravelWindow, start: NightStart, from: LocationId) {
    let {width, height} = getBox(harness, getTravelParts(openWindow).mapArea);
    let {origin} = start.map;
    let points = Object.values(start.locationData).flatMap(({position}) =>
      position === undefined ? [] : [getMapPoint(position, origin)],
    );
    let position = start.locationData[from]?.position;

    if (position === undefined) {
      throw new Error(`"${from}" has no position!`);
    }

    return toMapPixel(fitMapFrame(points, width, height, MAP_INSET), getMapPoint(position, origin));
  }

  beforeAll(async () => {
    harness = await bootGame(960, 540);
    ({TravelWindow: TravelWindowClass} = await import('../source/game/screens/travelWindow.js'));
    ({MapPicture: MapPictureClass} = await import('../source/game/screens/mapPicture.js'));
    restore = useFixedWorld({place: FIXED_STOP});
    await startNewGame(harness);
    await pressThrough(harness, getStoryWindow(harness));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  }, 60_000);

  afterEach(() => {
    // The window is kept when it closes; destroy() destroys it either way.
    travelWindow?.modal.destroy();
    travelWindow = null;
  });

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('it opens with the nearest destination selected and the focus on the destination button', async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let parts = getTravelParts(opened);

    expect(readText(parts.title)).toBe('On foot');
    expect(parts.ways.map((button) => getButtonLabel(button))).toEqual(['Walk', 'Tram', 'Taxi']);
    // The night starts at 19:40, and the bar closes at 23:00.
    expect(readDestination(opened)).toEqual(['The bar', '4 min  till 23:00']);
    expect(describeFocus(ui.focused)).toBe('The bar');
    expect(ui.focused).toBe(parts.destination);
    expect(ui.isRingVisible).toBe(true);
    // Every location with a position but the stop, in the order of the location data.
    expect([...parts.locations.keys()]).toEqual([FIXED_BAR_LOCATION, FIXED_SQUARE_LOCATION]);

    await waitForPanel(opened, WIDE_WINDOW);

    let mapArea = getBox(harness, parts.mapArea);

    for (let button of parts.locations.values()) {
      let box = getBox(harness, button);

      expect([box.width, box.height]).toEqual([8, 8]);

      expectInside(box, mapArea);
    }
  });

  test("a location's button selects its location and keeps the focus", () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let square = getLocationButton(opened, FIXED_SQUARE_LOCATION);
    let destination = getDestinationButton(opened);
    let expectSquare = (): void => {
      // The side column is 120 wide: the name wraps in the 108 inside the button's padding.
      expect(readDestination(opened)).toEqual(['The square by the\nold market', '7 min']);
      expect(ui.focused).toBe(square);
      // The button stays; only its texts change.
      expect(getTravelParts(opened).destination).toBe(destination);
    };

    ui.focus(square);
    ui.activate();
    expectSquare();
    // The selected location again changes nothing.
    ui.activate();
    expectSquare();
  });

  test('a disabled location takes no press and no focus', () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');

    ui.focus(getWayButton(opened, 'tram'));
    ui.activate();

    let {locations: locationButtons} = getTravelParts(opened);

    expect(locationButtons.size).toBe(2);

    for (let button of locationButtons.values()) {
      expect(button.isDisabled).toBe(true);
      expect(button.isFocusable).toBe(false);

      button.activate();
    }

    expect(opened.way).toBe('tram');
    expect(getTravelParts(opened).destination).toBeNull();
  });

  test("a way's button changes the title, the layer, the locations and the selection, and moves nothing", async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');

    await waitForPanel(opened, WIDE_WINDOW);

    let getBoxes = (): Box[] => {
      let {back, mapArea, panel, slot, ways} = getTravelParts(opened);

      return [panel, ...ways, mapArea, slot, back].map((part) => getBox(harness, part));
    };
    let boxesBefore = getBoxes();

    ui.focus(getLocationButton(opened, FIXED_SQUARE_LOCATION));
    await press('Enter');

    expect(readDestination(opened)?.[0]).toBe('The square by the\nold market');
    expect(countColor(readMap(opened), palette.magenta)).toBe(0);

    let taxiButton = getWayButton(opened, 'taxi');

    ui.focus(taxiButton);
    await press('Enter');

    expect(opened.way).toBe('taxi');
    expect(readText(getTravelParts(opened).title)).toBe('By taxi');
    // The selection is the way's nearest destination, not the square. Its numbers are wider than
    // the 108 of the side column's label, so the hours stand under the costs.
    expect(readDestination(opened)).toEqual(['The bar', '5 min  90 Kč\ntill 23:00']);
    expect(describeFocus(ui.focused)).toBe('Taxi');
    expect(ui.focused).toBe(taxiButton);

    for (let button of getTravelParts(opened).locations.values()) {
      expect(button.isDisabled).toBe(false);
    }

    expect(getBoxes()).toEqual(boxesBefore);
    expect(countColor(readMap(opened), palette.magenta)).toBe(0);

    let tramButton = getWayButton(opened, 'tram');
    let expectTram = (): void => {
      expect(opened.way).toBe('tram');
      expect(readText(getTravelParts(opened).title)).toBe('By tram');
      expect(readDestination(opened)).toBeNull();
      expect(ui.focused).toBe(tramButton);
      expect(getBoxes()).toEqual(boxesBefore);
    };

    ui.focus(tramButton);
    await press('Enter');
    expectTram();

    expect(countColor(readMap(opened), palette.magenta)).toBeGreaterThan(0);

    // Pressing the current way again changes nothing.
    await press('Enter');
    expectTram();
  });

  test('the destination button closes the window and reports the destination', async () => {
    openTravel('walk');
    await press('Enter');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith({
      location: fixedLocations[FIXED_BAR_LOCATION],
      way: 'walk',
      minutes: 4,
      price: 0,
    });
  });

  test('the destination button reports the destination as the fade starts', async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let bar = {location: fixedLocations[FIXED_BAR_LOCATION], way: 'walk', minutes: 4, price: 0};

    ui.focus(getDestinationButton(opened));
    ui.activate();

    expect(opened.modal.state).toBe('closing');
    expect(onClosing).toHaveBeenCalledExactlyOnceWith(bar);
    expect(onClosed).not.toHaveBeenCalled();

    await waitForClosed();

    expect(onClosing).toHaveBeenCalledExactlyOnceWith(bar);
    expect(onClosed).toHaveBeenCalledExactlyOnceWith(bar);
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
    // A frame runs first, as in play, where the travel window opens inside the night screen's
    // update: the screen judges the cancel command by the overlay on top at the end of that update.
    await nextFrame();
    await press('Escape');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
    // The window took the cancel command; the night screen opened no menu.
    expect(harness.nightScreen.contents.menuModal).toBeNull();
  });

  test('a way with no destination leaves the room empty and opens with the focus on Back', async () => {
    let {ui} = harness.nightScreen;
    // On foot, the dotted line runs from the light to the bar: some of its pixels lie within 8
    // of the light's centre, beyond the light's outer ring.
    let walk = openTravel('walk');

    await waitForPanel(walk, WIDE_WINDOW);

    let walkLight = getLight(walk, nightStart, FIXED_STOP_LOCATION);
    let walkPixels = readMap(walk);

    expect(getColor(walkPixels, walkLight.x, walkLight.y)).toBe(palette.white);
    expect(countColorNear(walkPixels, walkLight, {reach: 8, color: palette.dim})).toBeGreaterThan(
      0,
    );

    let tram = openTravel('tram');
    let parts = getTravelParts(tram);

    // The destination button stays, as the modal's initial focus, but it is not drawn and takes
    // no press, so the focus and the ring go to Back.
    expect(parts.destination).toBeNull();
    expect(parts.destinationButton.isDisabled).toBe(true);
    expect(describeFocus(ui.focused)).toBe('Back');
    expect(ui.focused).toBe(parts.back);
    expect(ui.isRingVisible).toBe(true);

    await waitForPanel(tram, WIDE_WINDOW);

    // No dotted line: the railway, the only other line in `dim`, lies about 40 pixels away.
    let light = getLight(tram, nightStart, FIXED_STOP_LOCATION);
    let pixels = readMap(tram);

    expect(getColor(pixels, light.x, light.y)).toBe(palette.white);
    expect(countColorNear(pixels, light, {reach: 8, color: palette.dim})).toBe(0);

    await press('Enter');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('a destination the night cannot pay is greyed out, and the window opens on Back', async () => {
    let {contents, ui} = harness.nightScreen;
    let night = {...contents.night, money: 70};
    let opened = openTravel('taxi', {night});
    let destination = getDestinationButton(opened);

    expect(readDestination(opened)).toEqual(['The bar', '5 min  90 Kč\ntill 23:00']);
    expect(destination.isDisabled).toBe(true);
    expect(describeTravelFocus(opened)).toBe('Back');
    expect(ui.isRingVisible).toBe(true);

    await waitForPanel(opened, WIDE_WINDOW);

    let box = getBox(harness, destination);

    ui.focus(getLocationButton(opened, FIXED_SQUARE_LOCATION));
    ui.activate();

    expect(readDestination(opened)).toEqual(['The square by the\nold market', '5 min  60 Kč']);
    expect(getDestinationButton(opened)).toBe(destination);
    expect(destination.isDisabled).toBe(false);

    ui.focus(getLocationButton(opened, FIXED_BAR_LOCATION));
    ui.activate();

    expect(destination.isDisabled).toBe(true);

    await nextFrame();

    expect(getBox(harness, destination)).toEqual(box);

    openTravel('taxi', {night});
    await press('Enter');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('the destination button says when the bar closes or opens at the minute of arrival, and keeps its size', async () => {
    let {contents, ui} = harness.nightScreen;
    // 22:50: the walk of 4 minutes arrives at 22:54, before the bar closes at 23:00.
    let opened = openTravel('walk', {night: {...contents.night, minutes: 1370}});

    expect(readDestination(opened)).toEqual(['The bar', '4 min  till 23:00']);

    await waitForPanel(opened, WIDE_WINDOW);

    let box = getBox(harness, getDestinationButton(opened));

    ui.focus(getLocationButton(opened, FIXED_SQUARE_LOCATION));
    ui.activate();

    // The square has no hours.
    expect(readDestination(opened)).toEqual(['The square by the\nold market', '7 min']);

    await nextFrame();

    expect(getBox(harness, getDestinationButton(opened))).toEqual(box);

    // 23:00, while the bar is closed; 08:00, after its last span; and 22:56, whose walk arrives at
    // 23:00 exactly, the end of the span, which the span does not hold.
    let arrivals: Array<[minutes: number, numbers: string]> = [
      [1380, '4 min  opens 23:30'],
      [1920, '4 min  closed'],
      [1376, '4 min  opens 23:30'],
    ];

    for (let [minutes, numbers] of arrivals) {
      let later = openTravel('walk', {night: {...contents.night, minutes}});

      expect({minutes, destination: readDestination(later)}).toEqual({
        minutes,
        destination: ['The bar', numbers],
      });

      await waitForPanel(later, WIDE_WINDOW);

      expect({minutes, box: getBox(harness, getDestinationButton(later))}).toEqual({minutes, box});
    }
  });

  test('a press while it fades does nothing', async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let {title} = getTravelParts(opened);
    let square = getLocationButton(opened, FIXED_SQUARE_LOCATION);
    let taxiButton = getWayButton(opened, 'taxi');
    let destination = getDestinationButton(opened);

    // Escape and then the presses, without a frame between them: on a slow
    // machine the whole fade can pass between two key presses.
    ui.cancel();

    expect(opened.modal.state).toBe('closing');
    expect(onClosing).toHaveBeenCalledExactlyOnceWith(null);

    for (let button of [square, taxiButton, destination]) {
      ui.focus(button);
      ui.activate();
    }

    expect(readText(title)).toBe('On foot');
    expect(opened.way).toBe('walk');
    expect(readDestination(opened)).toEqual(['The bar', '4 min  till 23:00']);

    await waitForClosed();

    expect(onClosing).toHaveBeenCalledExactlyOnceWith(null);
    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('real taps select a location, switch the way and travel', async () => {
    let opened = openTravel('walk');

    await waitForPanel(opened, WIDE_WINDOW);
    await tap(harness, getBox(harness, getLocationButton(opened, FIXED_SQUARE_LOCATION)));

    expect(readDestination(opened)?.[0]).toBe('The square by the\nold market');

    await tap(harness, getBox(harness, getWayButton(opened, 'taxi')));

    expect(opened.way).toBe('taxi');
    expect(readDestination(opened)?.[0]).toBe('The bar');

    await tap(harness, getBox(harness, getLocationButton(opened, FIXED_SQUARE_LOCATION)));

    expect(readDestination(opened)?.[0]).toBe('The square by the\nold market');

    await tap(harness, getBox(harness, getDestinationButton(opened)));
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith({
      location: fixedLocations[FIXED_SQUARE_LOCATION],
      way: 'taxi',
      minutes: 5,
      price: 60,
    });

    let second = openTravel('walk');

    await waitForPanel(second, WIDE_WINDOW);
    await tap(harness, getBox(harness, getTravelParts(second).back));
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('each screen gets its layout', async () => {
    let opened = openTravel('walk');
    let screens = [
      {cssWidth: 390, cssHeight: 700, kind: 'stacked'},
      {cssWidth: 292, cssHeight: 524, kind: 'stacked'},
      {cssWidth: 960, cssHeight: 540, kind: 'sideBySide'},
      {cssWidth: 700, cssHeight: 390, kind: 'sideBySide'},
    ] as const;

    try {
      for (let {cssWidth, cssHeight, kind} of screens) {
        let width = cssWidth / 2;
        let height = cssHeight / 2;
        let layout = getTravelLayout(width, height);

        await setViewport(harness, cssWidth, cssHeight);
        opened.resize(width, height);
        await waitForPanel(opened, layout.window);

        let parts = getTravelParts(opened);
        let panel = getBox(harness, parts.panel);
        let mapArea = getBox(harness, parts.mapArea);
        let row = getBox(harness, getWayButton(opened, 'walk'));
        let slot = getBox(harness, parts.slot);
        let back = getBox(harness, parts.back);
        let mapRight = mapArea.left + mapArea.width;
        let mapBottom = mapArea.top + mapArea.height;
        let bodies = {
          // A column: the row, the map, the destination and Back, 8 apart.
          stacked: {
            row: {left: mapArea.left, top: mapArea.top - 8 - 16},
            slot: {left: mapArea.left, top: mapBottom + 8},
            back: {left: mapArea.left, top: mapBottom + 8 + DESTINATION_HEIGHT + 8},
          },
          // A row: the map, and 8 to its right the column of the row, the
          // destination 8 under it, and Back at the bottom, level with the map's.
          sideBySide: {
            row: {left: mapRight + 8, top: mapArea.top},
            slot: {left: mapRight + 8, top: mapArea.top + 16 + 8},
            back: {left: mapRight + 8, top: mapBottom - 16},
          },
        };

        expect(layout.kind).toBe(kind);
        expect(slot.height).toBe(DESTINATION_HEIGHT);
        expect(back.height).toBe(16);
        expect({width: mapArea.width, height: mapArea.height}).toEqual(
          getMapSize(layout, DESTINATION_HEIGHT),
        );

        expectInside(panel, {left: 0, top: 0, width, height});

        expect({row: getCorner(row), slot: getCorner(slot), back: getCorner(back)}).toEqual(
          bodies[kind],
        );
        expect(doBoxesOverlap(back, slot)).toBe(false);
      }
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test('a resize keeps the way, the selection and the focus, also across layouts', async () => {
    let {ui} = harness.nightScreen;

    try {
      await setViewport(harness, 390, 700);

      let opened = openTravel('walk');

      await waitForPanel(opened, {width: 187, height: 342});
      ui.focus(getWayButton(opened, 'taxi'));
      ui.activate();

      let oldSquare = getLocationButton(opened, FIXED_SQUARE_LOCATION);

      ui.focus(oldSquare);
      ui.activate();

      expect(readDestination(opened)?.[0]).toBe('The square by the old\nmarket');
      expect(ui.focused).toBe(oldSquare);

      await setViewport(harness, 700, 390);
      opened.resize(350, 195);
      await waitForPanel(opened, {width: 342, height: 187});

      let parts = getTravelParts(opened);
      let mapArea = getBox(harness, parts.mapArea);
      let row = getBox(harness, getWayButton(opened, 'walk'));

      // Side by side: the row of ways stands right of the map.
      expect(row.top).toBe(mapArea.top);
      expect(row.left).toBeGreaterThan(mapArea.left + mapArea.width);
      expect(opened.way).toBe('taxi');
      expect(readText(parts.title)).toBe('By taxi');
      expect(readDestination(opened)).toEqual(['The square by the\nold market', '5 min  60 Kč']);
      // The controls stay through a resize; only their containers are built again.
      expect(getLocationButton(opened, FIXED_SQUARE_LOCATION)).toBe(oldSquare);
      expect(ui.focused).toBe(oldSquare);

      // The destination button, Back and a way keep the focus too, across a
      // change of layout each.
      let targets: Array<[string, () => Button]> = [
        ['destination', () => getDestinationButton(opened)],
        ['Back', () => getTravelParts(opened).back],
        ['Tram', () => getWayButton(opened, 'tram')],
      ];

      for (let [index, [name, getTarget]] of targets.entries()) {
        let target = getTarget();
        let [width, height] = index % 2 === 0 ? [195, 350] : [350, 195];

        ui.focus(target);
        opened.resize(width, height);

        expect(describeTravelFocus(opened)).toBe(name);
        expect(ui.focused).toBe(target);
      }
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test('the arrow keys reach the locations and the destination button', async () => {
    try {
      // Stacked: the locations lie in the map above the destination button.
      await setViewport(harness, 390, 700);

      let stacked = openTravel('walk');

      await waitForPanel(stacked, {width: 187, height: 342});
      await press('ArrowUp');

      expect(describeTravelFocus(stacked)).toMatch(/^location /);

      await press('ArrowDown');

      expect(describeTravelFocus(stacked)).toBe('destination');

      // Side by side: the map lies left of the side column. The fixed world's
      // locations lie at the map's top, level with the row of ways, so they are
      // left of Walk; left of the destination button, under the row, Walk is
      // nearer than any of them.
      await setViewport(harness, 960, 540);

      let sideBySide = openTravel('walk');

      await waitForPanel(sideBySide, WIDE_WINDOW);
      harness.nightScreen.ui.focus(getWayButton(sideBySide, 'walk'));
      await press('ArrowLeft');

      expect(describeTravelFocus(sideBySide)).toMatch(/^location /);

      await press('ArrowRight');

      expect(describeTravelFocus(sideBySide)).toBe('Walk');
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test("the layout's title block is the window title's height", async () => {
    let {TITLE_HEIGHT} = await import('../source/game/screens/windowTitle.js');

    expect(LAYOUT_TITLE_HEIGHT).toBe(TITLE_HEIGHT);
  });

  test('on a stacked window 240 or more wide the numbers stand level with the name, at the right end', async () => {
    let opened = openTravel('walk');
    // 600 × 700 CSS pixels are 300 × 350 art pixels: stacked, and not narrow.
    let layout = getTravelLayout(300, 350);
    // A new selection's texts are laid out in the next frames.
    let expectNumbersLevelWithName = async (location: LocationId): Promise<void> => {
      await vitest.waitFor(
        () => {
          let button = getDestinationButton(opened);
          let {name, numbers} = getDestinationTexts(button);
          let buttonBox = getBox(harness, button);
          let numbersBox = getBox(harness, numbers);

          expect(readText(name)).toBe(fixedLocations[location]?.name);
          expect(numbersBox.top).toBe(getBox(harness, name).top);
          expect(numbersBox.left + numbersBox.width).toBe(
            buttonBox.left + buttonBox.width - BUTTON_PADDING_X,
          );
        },
        {timeout: 10_000},
      );
    };

    expect(layout).toMatchObject({kind: 'stacked', isNarrow: false});

    try {
      await setViewport(harness, 600, 700);
      opened.resize(300, 350);
      await waitForPanel(opened, layout.window);
      // The bar, which the window opens on, and then the square.
      await expectNumbersLevelWithName(FIXED_BAR_LOCATION);
      harness.nightScreen.ui.focus(getLocationButton(opened, FIXED_SQUARE_LOCATION));
      harness.nightScreen.ui.activate();
      await expectNumbersLevelWithName(FIXED_SQUARE_LOCATION);
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test("the game's own locations fit the narrowest screen", async () => {
    let gameData: LocationData = locationData;
    let gameStart: NightStart = {
      ...nightStart,
      locations,
      places,
      travel,
      locationData: gameData,
      map,
    };
    let froms = Object.entries(gameData).flatMap(([id, entry]) =>
      entry.position === undefined || !Object.hasOwn(locations, id) ? [] : [id as LocationId],
    );
    let layout = getTravelLayout(146, 262);
    // 16:00, as the night starts: the Whisky Shop opens at 16:30, so the locations that reach it
    // before then read "opens 16:30", and Rotor Bar reads "till 03:00". Words that do not fit the
    // label of 102 beside the costs stand under them, and the slot keeps its height: the room
    // counts the longest numbers too, the taxi's from the main station to the Whisky Shop,
    // "11 min  180 Kč  opens 16:30", 162 art pixels.
    let night = {...harness.nightScreen.contents.night, minutes: 960};
    // The destinations whose numbers say their hours.
    let worded = 0;

    expect(froms.length).toBeGreaterThan(0);

    try {
      await setViewport(harness, 292, 524);

      // One window for the game's start shows every journey, as the night screen keeps one.
      let opened = openTravel('walk', {
        start: gameStart,
        from: froms[0] ?? FIXED_STOP_LOCATION,
        night,
      });

      for (let from of froms) {
        for (let way of ALL_WAYS) {
          let windowName = `${from}, ${way}`;

          // Off the UI root at once, as hiding the night screen takes it, and shown again.
          harness.nightScreen.ui.removeOverlay(opened.modal);
          showJourney(opened, way, {from, night});
          // The location buttons move in the next layout pass, which the next frame runs.
          await nextFrame();
          await waitForPanel(opened, layout.window);

          let parts = getTravelParts(opened);
          let panel = getBox(harness, parts.panel);
          let mapArea = getBox(harness, parts.mapArea);
          let slot = getBox(harness, parts.slot);
          let back = getBox(harness, parts.back);
          let boxes = [...parts.locations].map(([id, button]) => ({
            id,
            box: getBox(harness, button),
          }));
          let outside = boxes.filter(
            ({box}) =>
              box.left < mapArea.left ||
              box.top < mapArea.top ||
              box.left + box.width > mapArea.left + mapArea.width ||
              box.top + box.height > mapArea.top + mapArea.height,
          );
          // Two buttons closer than BUTTON_GAP on both axes.
          let crowded = boxes.flatMap((first, index) =>
            boxes
              .slice(index + 1)
              .filter((second) => doBoxesOverlap(growBox(first.box, BUTTON_GAP), second.box))
              .map((second) => `${first.id} and ${second.id}`),
          );

          expect(boxes.length).toBeGreaterThan(0);
          // The column fills the panel down to its padding, and the map has the size the layout
          // gives it: a title block or a destination taller than the layout counts on would push
          // Back out of the panel or squeeze the map.
          expect({windowName, backBottom: back.top + back.height}).toEqual({
            windowName,
            backBottom: panel.top + panel.height - WINDOW_PADDING_Y,
          });
          expect({windowName, width: mapArea.width, height: mapArea.height}).toEqual({
            windowName,
            ...getMapSize(layout, slot.height),
          });

          // The way's destination button, if it has one, fills the slot, and its label lies
          // inside it, the name as high as its lines. The numbers hold the hours words of the
          // way's nearest destination, which the window selects, whole.
          for (let button of parts.destination === null ? [] : [parts.destination]) {
            let destination = getBox(harness, button);
            let {name, numbers} = getDestinationTexts(button);
            let nameBox = getBox(harness, name);
            let [selected] = getDestinations(gameStart, from, way);

            if (selected === undefined) {
              throw new Error(`${windowName} has a destination button but no destination!`);
            }

            let words = getHoursWords(
              gameData[selected.location.id]?.hours,
              night.minutes + selected.minutes,
            );
            let numbersText = readText(numbers);
            // The words close the numbers, whole, on the costs' line or on one of their own.
            let end = numbersText.slice(numbersText.length - words.length);

            expect({windowName, destination}).toEqual({windowName, destination: slot});
            expect(nameBox.height).toBe(readText(name).split('\n').length * LINE_HEIGHT);
            expect({windowName, end}).toEqual({windowName, end: words});

            expectInside(nameBox, destination);
            expectInside(getBox(harness, numbers), destination);

            worded += words === '' ? 0 : 1;
          }

          expect({windowName, outside: outside.map(({id}) => id), crowded}).toEqual({
            windowName,
            outside: [],
            crowded: [],
          });
        }
      }

      expect(worded).toBeGreaterThan(0);
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test('a destination without a position is selected without a button', async () => {
    let warning = `No position for "${FIXED_BAR_LOCATION}": it has no button on the map.`;
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});
    let countWarnings = () => warn.mock.calls.filter(([message]) => message === warning).length;
    let start: NightStart = {
      ...nightStart,
      locationData: Object.fromEntries(
        Object.entries(fixedLocationData).filter(([id]) => id !== FIXED_BAR_LOCATION),
      ),
    };
    // The `dim` pixels within 8 of the light's centre, which only the dotted line has: the frame
    // fits the stop and the square, so the railway, the other line in `dim`, lies about 40 away.
    let countDotsNearLight = (openWindow: TravelWindow): number => {
      let light = getLight(openWindow, start, FIXED_STOP_LOCATION);
      let pixels = readMap(openWindow);

      expect(getColor(pixels, light.x, light.y)).toBe(palette.white);

      return countColorNear(pixels, light, {reach: 8, color: palette.dim});
    };

    try {
      let opened = openTravel('walk', {start});

      expect(readDestination(opened)).toEqual(['The bar', '4 min']);
      expect([...getTravelParts(opened).locations.keys()]).toEqual([FIXED_SQUARE_LOCATION]);
      // Once, though walking and a taxi both reach the bar, and not again on a resize.
      expect(countWarnings()).toBe(1);

      opened.resize(480, 270);

      expect(countWarnings()).toBe(1);

      await waitForPanel(opened, WIDE_WINDOW);

      // No dotted line for the bar, which has no button.
      expect(countDotsNearLight(opened)).toBe(0);

      await press('Enter');
      await waitForClosed();

      expect(onClosed).toHaveBeenCalledExactlyOnceWith({
        location: fixedLocations[FIXED_BAR_LOCATION],
        way: 'walk',
        minutes: 4,
        price: 0,
      });

      // The square has a button, and a dotted line once it is selected.
      let second = openTravel('walk', {start});

      await waitForPanel(second, WIDE_WINDOW);
      harness.nightScreen.ui.focus(getLocationButton(second, FIXED_SQUARE_LOCATION));
      harness.nightScreen.ui.activate();

      expect(readDestination(second)?.[0]).toBe('The square by the\nold market');
      expect(countDotsNearLight(second)).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  // The night screen builds one window and shows every journey on it: closing keeps it, and the
  // next journey moves the light and the location buttons, which stay the same objects.
  test('one window shows journeys from different locations, each without a button of its own', async () => {
    let {ui} = harness.nightScreen;
    let opened = openTravel('walk');
    let {allLocations} = getTravelParts(opened);

    await waitForPanel(opened, WIDE_WINDOW);

    expect([...getTravelParts(opened).locations.keys()]).toEqual([
      FIXED_BAR_LOCATION,
      FIXED_SQUARE_LOCATION,
    ]);

    ui.focus(getTravelParts(opened).back);
    await press('Enter');
    await waitForClosed();

    expect(opened.modal.state).toBe('closed');
    expect(opened.modal.view.destroyed).toBe(false);
    expect(ui.children).not.toContain(opened.modal);

    onClosed.mockClear();
    showJourney(opened, 'walk', {from: FIXED_BAR_LOCATION});
    // The location buttons move in the next layout pass, which the next frame runs.
    await nextFrame();

    let parts = getTravelParts(opened);

    for (let [id, button] of allLocations) {
      expect(parts.allLocations.get(id)).toBe(button);
    }

    // From the bar: the bar has no button, and walking reaches the square only.
    expect([...parts.locations.keys()]).toEqual([FIXED_SQUARE_LOCATION, FIXED_STOP_LOCATION]);
    expect(getLocationButton(opened, FIXED_STOP_LOCATION).isDisabled).toBe(true);
    expect(readDestination(opened)).toEqual(['The square by the\nold market', '12 min']);
    expect(ui.focused).toBe(parts.destinationButton);
    expect(ui.isRingVisible).toBe(true);

    let light = getLight(opened, nightStart, FIXED_BAR_LOCATION);

    expect(getColor(readMap(opened), light.x, light.y)).toBe(palette.white);

    await press('Enter');
    await waitForClosed();

    expect(onClosed).toHaveBeenCalledExactlyOnceWith({
      location: fixedLocations[FIXED_SQUARE_LOCATION],
      way: 'walk',
      minutes: 12,
      price: 0,
    });
  });

  // The streets are drawn when the window is built and on a new size only, so that showing a
  // journey costs a frame like any other.
  test('a journey, a selection and a way draw the marks only; a new size draws the layers', async () => {
    let drawLayers = vitest.spyOn(MapPictureClass.prototype, 'drawLayers');
    let drawMarks = vitest.spyOn(MapPictureClass.prototype, 'drawMarks');

    try {
      let opened = openTravel('walk');

      expect(drawLayers).toHaveBeenCalledTimes(1);

      opened.modal.close();
      await waitForClosed();
      drawLayers.mockClear();
      drawMarks.mockClear();
      // A journey, a new selection (the square, after the bar) and a new way.
      showJourney(opened, 'walk');
      harness.nightScreen.ui.focus(getLocationButton(opened, FIXED_SQUARE_LOCATION));
      harness.nightScreen.ui.activate();
      harness.nightScreen.ui.focus(getWayButton(opened, 'taxi'));
      harness.nightScreen.ui.activate();
      // The night screen lays itself out at every arrival: the same size draws nothing.
      opened.resize(480, 270);

      expect(drawLayers).not.toHaveBeenCalled();
      expect(drawMarks).toHaveBeenCalledTimes(3);

      opened.resize(479, 270);

      expect(drawLayers).toHaveBeenCalledTimes(1);
    } finally {
      drawLayers.mockRestore();
      drawMarks.mockRestore();
    }
  });
});
