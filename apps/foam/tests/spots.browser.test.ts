import {type Button} from 'tellurion';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type LocationId} from '../source/game/core/location.js';
import {
  FIXED_BAR,
  FIXED_BAR_LOCATION,
  FIXED_PAVEMENT,
  FIXED_SQUARE,
  FIXED_SQUARE_LOCATION,
  getFixedPlace,
} from './fixedWorld.js';
import {
  bootGame,
  chooseWayOut,
  closeStory,
  describeFocus,
  endStory,
  getBox,
  getButtonLabel,
  getSpotButton,
  getStoryWindow,
  getWindowButton,
  getWindowParts,
  type Harness,
  openSpot,
  pickDestination,
  press,
  pressThrough,
  setViewport,
  startNewGame,
  tap,
  useFixedWorld,
  waitForNoStoryWindow,
  waitForPlace,
  waitForSpeaker,
  waitForTravelWindow,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which slows every frame of
// these tests. They check the buttons, not what the picture draws, so the main menu, which shows
// the bar, gets the pipeline's proof, a shader of a few lines, as the fixed world's places do. The
// bar's GLSL has its text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 960 × 540 CSS pixels are 480 × 270 art pixels. The night starts in the fixed bar at 19:40; its
// regular sits at the counter from 20:00 to 20:30. The frames of a headless browser are slow, and
// several times slower on a busy machine, so the tests get a long timeout. They follow each
// other in order: each starts where the one before it ended.
describe('a spot with a condition', {timeout: 180_000}, () => {
  let harness: Harness;
  let rebuilt: Button;
  let regular: Button;
  let restore: () => void;

  // Direct calls, as Tab makes them: the labels of the targets it reaches.
  function tabThrough(count: number): string[] {
    let {ui} = harness.nightScreen;
    let labels: string[] = [];

    ui.clearFocus();

    for (let index = 0; index < count; index += 1) {
      ui.focusNext();
      labels.push(describeFocus(ui.focused));
    }

    return labels;
  }

  // The screen looks at the night in the update after a window has closed.
  async function waitForVisible(button: Button, visible: boolean): Promise<void> {
    await vitest.waitFor(
      () => {
        expect(button.view.visible).toBe(visible);
      },
      {timeout: 10_000},
    );
  }

  async function goOut(): Promise<void> {
    let storyWindow = await openSpot(harness, 'The door');

    await pressThrough(harness, storyWindow);
    harness.nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');
    await endStory(storyWindow);
    await waitForPlace(harness, FIXED_PAVEMENT);
    await closeStory(harness);
  }

  async function takeTaxi(location: LocationId): Promise<void> {
    await chooseWayOut(harness, 'Take a taxi');
    await pickDestination(harness, await waitForTravelWindow(harness), location);
    await endStory(await waitForSpeaker(harness, 'The taxi'));
  }

  beforeAll(async () => {
    localStorage.clear();
    // The fixed world goes in before the boot: the night screen builds its travel window when it
    // is attached, from the world nightStart holds then.
    restore = useFixedWorld();
    harness = await bootGame(960, 540);
    await startNewGame(harness);
  }, 60_000);

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('a spot whose condition does not hold has its button built hidden, and Tab skips it', async () => {
    let {contents, ui} = harness.nightScreen;

    regular = getSpotButton(harness, 'A regular');

    expect(contents.spotButtons).toHaveLength(getFixedPlace(FIXED_BAR).spots.length);
    expect(ui.children).toContain(regular);
    expect(regular.view.visible).toBe(false);

    await closeStory(harness);

    // The seventh is Phone once the hello has arrived, or the place button again.
    let labels = tabThrough(8);

    expect(labels.slice(0, 6)).toEqual([
      'The bar',
      'Menu',
      'The bartender',
      'Two women talking',
      'A patron',
      'The door',
    ]);
    expect(labels).not.toContain('A regular');
  });

  test("a place built ahead during a journey's window reads its conditions when it is shown", async () => {
    let {contents} = harness.nightScreen;

    await goOut();
    await takeTaxi(FIXED_SQUARE_LOCATION);
    await waitForPlace(harness, FIXED_SQUARE);
    await closeStory(harness);
    // The square is outdoors: its street is a spot of its own.
    await takeTaxi(FIXED_BAR_LOCATION);
    await waitForPlace(harness, FIXED_BAR);

    rebuilt = getSpotButton(harness, 'A regular');

    expect(rebuilt).not.toBe(regular);
    expect(rebuilt.view.visible).toBe(false);
    // Two taxis of 6 minutes and 120 Kč.
    expect(contents.night.minutes).toBe(1192);
    expect(contents.night.money).toBe(110);
  });

  test('a beer takes the clock past 20:00, and the button shows when the window closes, keeps its box and takes Enter', async () => {
    let {contents, ui} = harness.nightScreen;

    await closeStory(harness);

    let bartender = await openSpot(harness, 'The bartender');

    await pressThrough(harness, bartender);
    ui.focus(getWindowButton(bartender, 0));
    await press('Enter');
    await endStory(bartender);
    await waitForNoStoryWindow(harness);

    expect(contents.night.minutes).toBe(1202);

    await waitForVisible(rebuilt, true);
    // The layout gives the shown button its box in the next frame.
    await vitest.waitFor(
      () => {
        expect(getBox(harness, rebuilt)).toEqual({left: 183, top: 149, width: 66, height: 16});
      },
      {timeout: 10_000},
    );

    expect(tabThrough(7).at(-1)).toBe('A regular');

    ui.focus(rebuilt);
    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    expect(storyWindow.dialogue.node?.speaker).toBe('A regular');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
      'Sit a while  30 min',
      'Leave him be',
    ]);

    ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForNoStoryWindow(harness);

    expect(rebuilt.view.visible).toBe(true);
  });

  test('a resize keeps it', async () => {
    await setViewport(harness, 292, 524);

    expect(rebuilt.view.visible).toBe(true);

    await vitest.waitFor(
      () => {
        expect(getBox(harness, rebuilt)).toEqual({left: 33, top: 151, width: 66, height: 16});
      },
      {timeout: 10_000},
    );
    await setViewport(harness, 960, 540);
  });

  test('a place entered again at the hour is built with the button visible', async () => {
    let {contents, ui} = harness.nightScreen;

    await goOut();

    let bar = await openSpot(harness, 'The bar');

    await pressThrough(harness, bar);
    ui.focus(getWindowButton(bar, 0));
    await press('Enter');
    await endStory(bar);
    await waitForPlace(harness, FIXED_BAR);

    let again = getSpotButton(harness, 'A regular');

    expect(again).not.toBe(rebuilt);
    expect(again.view.visible).toBe(true);
    expect(contents.night.minutes).toBe(1202);

    rebuilt = again;
  });

  test('the window that runs past the hours hides the button when it closes, and the focus left on it is dropped', async () => {
    let {contents, ui} = harness.nightScreen;

    await closeStory(harness);

    // A keyboard player: Tab reaches him and shows the ring.
    expect(tabThrough(7).at(-1)).toBe('A regular');
    expect(ui.isRingVisible).toBe(true);

    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    await pressThrough(harness, storyWindow);
    ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');

    expect(contents.night.minutes).toBe(1232);

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);
    await waitForVisible(rebuilt, false);

    // The focus went back to the button that opened the window, and left it with the ring when the
    // button hid.
    expect(describeFocus(ui.focused)).toBe('nothing');
    expect(ui.isRingVisible).toBe(false);

    await press('Enter');

    expect(contents.storyWindow).toBeNull();

    await tap(harness, {left: 183, top: 149, width: 66, height: 16});

    expect(contents.storyWindow).toBeNull();

    ui.focusNext();

    expect(describeFocus(ui.focused)).toBe('The bar');
  });
});
