import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightEnd} from '../source/game/content/nightEnd.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type logScreen as logScreenValue} from '../source/game/screens/logScreen.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {FIXED_BAR, FIXED_BAR_LOCATION, FIXED_SQUARE} from './fixedWorld.js';
import {
  bootGame,
  chooseWayOut,
  closeStory,
  describeEntry,
  endStory,
  getButtonLabel,
  getMenuButton,
  getStoriesParts,
  getStoriesWindow,
  getStoryWindow,
  getWindowParts,
  type Harness,
  nextFrame,
  openSpot,
  pickDestination,
  press,
  pressThrough,
  readText,
  restartAt,
  startFrom,
  startNewGame,
  useFixedWorld,
  waitForNoStoriesWindow,
  waitForNoStoryWindow,
  waitForSpeaker,
  waitForTravelWindow,
} from './nightScreenHelpers.js';

// The labels of the choices the window offers.
function getLabels(storyWindow: StoryWindow): string[] {
  return getWindowParts(storyWindow).buttons.map((button) => getButtonLabel(button));
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

  // Orders the bartender's beer, ten minutes, and reads its text to the end.
  async function drinkBeer(): Promise<void> {
    let bartender = await openSpot(harness, 'The bartender');

    // Enter finishes the text, the arrow focuses the beer, and Enter takes it.
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await endStory(bartender);
  }

  // Focuses the choice at the index and takes it.
  async function takeChoice(storyWindow: StoryWindow, index: number): Promise<void> {
    let button = getWindowParts(storyWindow).buttons[index];

    if (button === undefined) {
      throw new Error(`The story window has no button ${index}!`);
    }

    harness.nightScreen.ui.focus(button);
    await press('Enter');
  }

  // Starts a night at the street with the keys at 23:40 and takes the flat's choice.
  async function sleepInTheFlat(search: string): Promise<StoryWindow> {
    await startFrom(harness, search);
    await closeStory(harness);

    let street = await openSpot(harness, 'The street');

    await pressThrough(harness, street);

    expect(getLabels(street)).toEqual([
      'Walk',
      'Take a taxi',
      'Walk to the flat and sleep',
      'Stay',
    ]);

    await takeChoice(street, 2);

    let flat = getStoryWindow(harness);

    expect(flat.dialogue.node?.speaker).toBe('The flat');
    expect(readText(harness.nightScreen.contents.statusText)).toBe('08:00   350 Kč   0.0');

    await endStory(flat);

    return waitForSpeaker(harness, 'Morning');
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
    delete nightStart.quest;
    delete nightStart.drunkenness;
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
    await closeStory(harness);
    game.app.ticker.add(readClosingFrame);

    try {
      // The beer takes the clock from 07:55 to 08:05, past the end and past the bar's hours.
      await drinkBeer();
      end = await waitForSpeaker(harness, 'Morning');
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
    expect(end.dialogue.node).toBe(nightEnd.nodes?.stranded);

    await endStory(end);
    await waitForLogScreen();

    let {regularLeaf, title} = getStoriesParts(getStoriesWindow(logScreen));

    expect(readText(title)).toBe('Stories  0 found');
    expect(readText(regularLeaf)).toBe('None');

    await press('Escape');
    await waitForNoStoriesWindow(logScreen);

    let {night} = nightScreen.contents;

    expect(nightScreen.state).toBe('attached');
    expect(logScreen.contents.night).toBe(night);
    expect(readText(logScreen.contents.statusText)).toBe('08:05   305 Kč   1.0');
    // The bar closed at 08:00, and its closing script never ran: the end came first. The end
    // text read the night's flags, none set, so the stranded ending.
    expect(night.log.map(describeEntry)).toEqual([
      ['text', 1915, 'The bar'],
      ['text', 1915, 'The bartender'],
      ['choice', 1915, 'Order a beer  10 min  45 Kč'],
      ['text', 1925, 'The bartender'],
      ['text', 1925, 'Morning'],
    ]);
  });

  test('a travel that arrives after 08:00 shows its text and then the end, never the destination', async () => {
    let {contents} = harness.nightScreen;

    // Still at 07:55: the walk to the bar takes 12 minutes and arrives at 08:07.
    await restartAt(harness, FIXED_SQUARE);
    await closeStory(harness);
    await chooseWayOut(harness, 'Walk');
    await pickDestination(harness, await waitForTravelWindow(harness), FIXED_BAR_LOCATION);

    let journey = await waitForSpeaker(harness, 'On foot');

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

    let end = await waitForSpeaker(harness, 'Morning');

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
    await endStory(await waitForSpeaker(harness, 'Morning'));
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
    await closeStory(harness);
    await drinkBeer();
    await waitForSpeaker(harness, 'Morning');
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

  test('a ticket in the pocket leaves on the 08:04', async () => {
    // From here on the tests run on the game's own content through startFrom, which the fixed
    // world the file booted in has none of the places for.
    restore();
    await startFrom(harness, '?place=hlavniNadraziHall&time=07:50&quest=ticket');
    await closeStory(harness);

    let benches = await openSpot(harness, 'The benches');

    await pressThrough(harness, benches);
    await takeChoice(benches, 0);

    expect(readText(harness.nightScreen.contents.statusText).startsWith('08:00')).toBe(true);

    await endStory(benches);

    let end = await waitForSpeaker(harness, 'Morning');

    expect(end.dialogue.node).toBe(nightEnd.nodes?.leave);

    await endStory(end);
    await waitForLogScreen();
  });

  test('the keys and the flat end the night on Dvořákova', async () => {
    let end = await sleepInTheFlat('?place=rotorBarStreet&time=23:40&money=350&quest=keys');
    let {contents} = harness.nightScreen;

    expect(end.dialogue.node).toBe(nightEnd.nodes?.stay);

    await endStory(end);
    await waitForLogScreen();

    expect(contents.night.log.slice(-3).map(describeEntry)).toEqual([
      ['choice', 1420, 'Walk to the flat and sleep'],
      ['text', 1920, 'The flat'],
      ['text', 1920, 'Morning'],
    ]);
  });

  test('with both the Morning text asks, and each answer leads to its ending', async () => {
    let search = '?place=rotorBarStreet&time=23:40&money=350&quest=keys,ticket';
    let end = await sleepInTheFlat(search);

    expect(end.dialogue.node).toBe(nightEnd.nodes?.both);

    await pressThrough(harness, end);

    expect(getLabels(end)).toEqual(['Take the train', 'Stay']);

    await takeChoice(end, 0);

    expect(end.dialogue.node).toBe(nightEnd.nodes?.leave);

    await endStory(end);
    await waitForLogScreen();

    expect(harness.nightScreen.contents.night.log.slice(-3).map(describeEntry)).toEqual([
      ['text', 1920, 'Morning'],
      ['choice', 1920, 'Take the train'],
      ['text', 1920, 'Morning'],
    ]);

    end = await sleepInTheFlat(search);
    await pressThrough(harness, end);
    await takeChoice(end, 1);

    expect(end.dialogue.node).toBe(nightEnd.nodes?.stay);
  });

  test('without the keys the flat is not offered, and the benches leave the player stranded', async () => {
    await startFrom(harness, '?place=rotorBarStreet&time=23:40');
    await closeStory(harness);

    let street = await openSpot(harness, 'The street');

    await pressThrough(harness, street);

    expect(getLabels(street)).toEqual(['Walk', 'Take a taxi', 'Stay']);

    await takeChoice(street, 2);
    await waitForNoStoryWindow(harness);
    await startFrom(harness, '?place=hlavniNadraziHall&time=23:00');
    await closeStory(harness);

    let benches = await openSpot(harness, 'The benches');

    await pressThrough(harness, benches);
    await takeChoice(benches, 0);
    await endStory(benches);

    let end = await waitForSpeaker(harness, 'Morning');

    expect(end.dialogue.node).toBe(nightEnd.nodes?.stranded);

    await endStory(end);
    await waitForLogScreen();
  });
});
