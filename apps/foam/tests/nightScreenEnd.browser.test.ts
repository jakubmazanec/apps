import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type LogEntry} from '../source/game/core/log.js';
import {type logScreen as logScreenValue} from '../source/game/screens/logScreen.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {FIXED_BAR, FIXED_BAR_LOCATION, FIXED_SQUARE} from './fixedWorld.js';
import {
  bootGame,
  chooseWayOut,
  getMenuButton,
  getSpotButton,
  getStoryWindow,
  type Harness,
  nextFrame,
  pickDestination,
  press,
  pressThrough,
  readText,
  restartAt,
  startNewGame,
  useFixedWorld,
  waitForNoStoryWindow,
  waitForTravelWindow,
} from './nightScreenHelpers.js';

// A log entry as its kind, its minute and its title or label.
function describeEntry(entry: LogEntry): [LogEntry['kind'], number, string | undefined] {
  return [entry.kind, entry.minutes, entry.kind === 'text' ? entry.speaker : entry.text];
}

// Presses Enter until the text has ended; the last press closes the window.
async function endStory(storyWindow: StoryWindow): Promise<void> {
  for (let count = 0; count < 40 && storyWindow.dialogue.phase !== 'ended'; count += 1) {
    await press('Enter');
  }
}

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check the end of the night, not what
// the picture draws, so the main menu, which shows the bar, gets the
// pipeline's proof, a shader of a few lines, as the fixed world's places do.
// The bar's GLSL has its text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 960 × 540 CSS pixels are 480 × 270 art pixels. The night starts in the fixed
// bar at 07:55, five minutes before the end; the bar's hours end at 08:00. The
// frames of a headless browser are slow, and several times slower on a busy
// machine, so the tests get a long timeout. They follow each other in order:
// each starts where the one before it ended. A window that the night follows
// with another, the end text, leaves in the frame the next one opens, so the
// screen is never seen without a window between them: the tests close such a
// window with its last press and wait for the next window.
describe('the end of the night', {timeout: 180_000}, () => {
  let harness: Harness;
  let logScreen: typeof logScreenValue;
  let restore: () => void;

  async function openSpot(label: string): Promise<StoryWindow> {
    harness.nightScreen.ui.focus(getSpotButton(harness, label));
    await press('Enter');

    return getStoryWindow(harness);
  }

  // Ends a text without choices that no window follows, as the description at 07:55.
  async function closeStory(): Promise<void> {
    await pressThrough(harness, getStoryWindow(harness));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  }

  // The window the night opens after the last one has closed, by its speaker.
  async function waitForSpeaker(speaker: string): Promise<StoryWindow> {
    return vitest.waitFor(
      () => {
        let storyWindow = getStoryWindow(harness);

        if (storyWindow.dialogue.node?.speaker !== speaker) {
          throw new Error(`The story window is not the window of "${speaker}".`);
        }

        return storyWindow;
      },
      {timeout: 10_000},
    );
  }

  // Orders the bartender's beer, ten minutes, and reads its text to the end.
  async function drinkBeer(): Promise<void> {
    let bartender = await openSpot('The bartender');

    // Enter finishes the text, the arrow focuses the beer, and Enter takes it.
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await endStory(bartender);
  }

  async function waitForLogScreen(): Promise<void> {
    await vitest.waitFor(
      () => {
        if (logScreen.state !== 'shown') {
          throw new Error(`The log screen is ${logScreen.state}, not shown.`);
        }
      },
      {timeout: 10_000},
    );
  }

  beforeAll(async () => {
    // The fixed world goes in before the boot: the night screen builds its travel window when it
    // is attached, from the world nightStart holds then.
    restore = useFixedWorld({place: FIXED_BAR, minutes: 1915});
    harness = await bootGame(960, 540);
    ({logScreen} = await import('../source/game/screens/logScreen.js'));
  }, 60_000);

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('the action that crosses 08:00 finishes, the end text opens over black, and the log screen shows the log', async () => {
    let {game, nightScreen} = harness;
    // Whether the screen was changing places, read after each frame in which a window was
    // closing. The callback is added after the screen's update, so it runs after it, and a
    // window starts closing in one frame and ends its fade in a later one.
    let closingFrames: boolean[] = [];
    let readClosingFrame = (): void => {
      if (nightScreen.contents.storyWindow?.state === 'closing') {
        closingFrames.push(nightScreen.contents.isPlaceChanging);
      }
    };
    let end: StoryWindow;

    await startNewGame(harness);
    await closeStory();
    game.app.ticker.add(readClosingFrame);

    try {
      // The beer takes the clock from 07:55 to 08:05, past the end and past the bar's hours.
      await drinkBeer();
      end = await waitForSpeaker('Morning');
    } finally {
      game.app.ticker.remove(readClosingFrame);
    }

    // The beer's window took the scene to black as it closed, as a window that changes the
    // place does. The end text comes in from black with its window, as a journey's window does.
    expect([...new Set(closingFrames)]).toEqual([true]);
    expect(nightScreen.contents.isPlaceChanging).toBe(false);
    expect(nightScreen.contents.place).toBeNull();
    // By its id: a failure would print the place's picture, whose shader cannot be printed.
    expect(nightScreen.contents.nextPlace?.place.id ?? null).toBeNull();
    expect(nightScreen.contents.hasEnded).toBe(true);
    expect(readText(nightScreen.contents.statusText)).toBe('08:05   305 Kč   1.0');

    await endStory(end);
    await waitForLogScreen();

    let {night} = nightScreen.contents;

    expect(nightScreen.state).toBe('attached');
    expect(logScreen.contents.night).toBe(night);
    expect(readText(logScreen.contents.statusText)).toBe('08:05   305 Kč   1.0');
    // The bar closed at 08:00, and its closing script never ran: the end came first. The end
    // text read the night as the beer left it.
    expect(night.log.map(describeEntry)).toEqual([
      ['text', 1915, 'The bar'],
      ['text', 1915, 'The bartender'],
      ['choice', 1915, 'Order a beer  10 min  45 Kč'],
      ['text', 1925, 'The bartender'],
      ['text', 1925, 'Morning'],
    ]);
    expect(night.log.at(-1)?.text).toContain('305 Kč');
  });

  test('a travel that arrives after 08:00 shows its text and then the end, never the destination', async () => {
    let {contents} = harness.nightScreen;

    // Still at 07:55: the walk to the bar takes 12 minutes and arrives at 08:07.
    await restartAt(harness, FIXED_SQUARE);
    await closeStory();
    await chooseWayOut(harness, 'Walk');
    await pickDestination(harness, await waitForTravelWindow(harness), FIXED_BAR_LOCATION);

    let journey = await waitForSpeaker('On foot');

    // The screen builds the place a window leads to once the window is fully shown; it builds
    // none behind this one.
    await vitest.waitFor(
      () => {
        if (journey.state !== 'open') {
          throw new Error(`The journey's window is ${journey.state}, not open.`);
        }
      },
      {timeout: 10_000},
    );
    await nextFrame();
    await nextFrame();
    await nextFrame();

    expect(contents.nextPlace?.place.id ?? null).toBeNull();

    await endStory(journey);

    let end = await waitForSpeaker('Morning');

    expect(contents.place).toBeNull();

    await endStory(end);
    await waitForLogScreen();

    expect(contents.night.log.slice(-4).map(describeEntry)).toEqual([
      ['choice', 1915, 'Walk'],
      ['choice', 1915, 'Walk to The bar  12 min'],
      ['text', 1927, 'On foot'],
      ['text', 1927, 'Morning'],
    ]);
  });

  test('a night that starts at 08:00 ends after its description', async () => {
    let {contents} = harness.nightScreen;

    // What a jump-in with time=08:00 writes there.
    nightStart.minutes = 1920;
    await restartAt(harness, FIXED_BAR);
    await endStory(getStoryWindow(harness));
    await endStory(await waitForSpeaker('Morning'));
    await waitForLogScreen();

    expect(contents.night.log.map(describeEntry)).toEqual([
      ['text', 1920, 'The bar'],
      ['text', 1920, 'Morning'],
    ]);
  });

  test('Quit to menu above the end text shows the main menu, and New Game starts a fresh night', async () => {
    let {mainMenuScreen, nightScreen} = harness;
    let {contents, ui} = nightScreen;

    nightStart.minutes = 1915;
    await restartAt(harness, FIXED_BAR);
    await closeStory();
    await drinkBeer();
    await waitForSpeaker('Morning');
    // The end text's window declares no close, so Escape opens the menu.
    await press('Escape');

    let menu = contents.menuModal;

    if (menu === null) {
      throw new Error('The menu did not open!');
    }

    ui.focus(getMenuButton(menu, 'Quit to menu'));
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );
    await startNewGame(harness);

    expect(contents.hasEnded).toBe(false);
    expect(contents.night.log.map(describeEntry)).toEqual([['text', 1915, 'The bar']]);
    expect(readText(contents.statusText)).toBe('07:55   350 Kč   0.0');
  });
});
