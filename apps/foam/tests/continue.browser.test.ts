import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {findStory} from '../source/game/core/night.js';
import {type PastNight} from '../source/game/core/nights.js';
import {type SavedNight} from '../source/game/core/save.js';
import {todaySeed} from '../source/game/core/todaySeed.js';
import {FIXED_BAR, FIXED_PAVEMENT, FIXED_SQUARE, FIXED_SQUARE_LOCATION} from './fixedWorld.js';
import {
  bootGame,
  chooseWayOut,
  closeStory,
  continueNight,
  describeEntry,
  endStory,
  getButtonLabel,
  getStoryWindow,
  getToastParts,
  getWindowButton,
  getWindowParts,
  type Harness,
  nextFrame,
  openSpot,
  pickDestination,
  press,
  quitToMenu,
  startFrom,
  startNewGame,
  useFixedWorld,
  waitForNoStoriesWindow,
  waitForNoStoryWindow,
  waitForPlace,
  waitForSpeaker,
  waitForToast,
  waitForTravelWindow,
} from './nightScreenHelpers.js';
import {readText} from './readText.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check what the game keeps, not what
// the picture draws, so the main menu, which shows the bar, gets the
// pipeline's proof, a shader of a few lines, as the fixed world's places do.
// The bar's GLSL has its text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// The night as the game saved it, read straight from the storage.
function readSavedNight(): SavedNight {
  return JSON.parse(localStorage.getItem('foam:night') ?? '') as SavedNight;
}

// 960 × 540 CSS pixels are 480 × 270 art pixels. The night starts in the fixed
// bar at 19:40, with nothing kept: the storage is cleared before the boot,
// which loads the stores. The frames of a headless browser are slow, and
// several times slower on a busy machine, so the tests get a long timeout.
// They follow each other in order: each starts where the one before it ended.
describe('saving and continue', {timeout: 180_000}, () => {
  let harness: Harness;
  let restore: () => void;

  beforeAll(async () => {
    localStorage.clear();
    // The fixed world goes in before the boot: the night screen builds its travel window when it
    // is attached, from the world nightStart holds then.
    restore = useFixedWorld();
    harness = await bootGame(960, 540);
  }, 60_000);

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('the texts read are keyed by path, and each is printed once', async () => {
    let info = vitest.spyOn(console, 'info');

    try {
      let {textsRead} = await import('../source/game/core/textsRead.js');
      let {ui} = harness.nightScreen;

      await startNewGame(harness, 7);
      await closeStory(harness);

      // Enter finishes the text, Talk to him leads on, and Let him be ends the window.
      let storyWindow = await openSpot(harness, 'A patron');

      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 1));
      await press('Enter');
      await waitForNoStoryWindow(harness);
      // Go out moves the player to the pavement, through the door's next node.
      storyWindow = await openSpot(harness, 'The door');
      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
      await endStory(storyWindow);
      await waitForPlace(harness, FIXED_PAVEMENT);
      await closeStory(harness);
      // The bar is open at this hour: its node is the one the start's function names.
      storyWindow = await openSpot(harness, 'The bar');
      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 1));
      await press('Enter');
      await waitForNoStoryWindow(harness);
      await chooseWayOut(harness, 'Walk');
      await pickDestination(harness, await waitForTravelWindow(harness), FIXED_SQUARE_LOCATION);
      await endStory(await waitForSpeaker(harness, 'On foot'));
      await waitForPlace(harness, FIXED_SQUARE);
      await closeStory(harness);

      let paths = [
        'testBar › description › start',
        'testBar › A patron › table',
        'testBar › A patron › talk',
        'testBar › The door › door',
        'testBar › The door › outside',
        'testPavement › description › start',
        'testPavement › The bar › open',
        'testPavement › The street › start',
        'journeys › walk › start',
        'testSquare › description › start',
      ];

      expect(textsRead.paths).toEqual(paths);
      expect(JSON.parse(localStorage.getItem('foam:textsRead') ?? '')).toEqual({paths});

      // A second night in the same bar reads its description again, and the path is not new.
      await harness.game.showScreen(harness.mainMenuScreen);
      await startNewGame(harness, 7);
      await closeStory(harness);

      expect(textsRead.paths).toEqual(paths);
      expect(
        info.mock.calls.filter(([message]) => message === 'Read: testBar › description › start'),
      ).toHaveLength(1);
    } finally {
      info.mockRestore();
    }
  });

  test("the night is saved with the collection when a window's text ends, and not before", async () => {
    // The test before left its night saved.
    await quitToMenu(harness);
    await startNewGame(harness, 7);

    expect(localStorage.getItem('foam:night')).toBeNull();

    await closeStory(harness);

    expect(readSavedNight()).toEqual({
      seed: 7,
      rolls: 0,
      minutes: 1180,
      money: 350,
      place: FIXED_BAR,
      drunkenness: {level: 0, at: 1180},
      roll: null,
      log: [{kind: 'text', minutes: 1180, speaker: 'The bar', text: expect.any(String) as unknown}],
      stories: [],
      quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false},
      events: [],
      ending: null,
      // The night is saved when the description's text ends, and the hello arrives only once the
      // window has closed.
      phone: {unread: [], read: []},
    });
    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({titles: []});
  });

  test("a journey's pick is saved with the destination before the journey's window ends", async () => {
    let {ui} = harness.nightScreen;
    // Go out moves the player to the pavement, through the door's next node.
    let storyWindow = await openSpot(harness, 'The door');

    await press('Enter');
    ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');
    await endStory(storyWindow);
    await waitForPlace(harness, FIXED_PAVEMENT);

    expect(readSavedNight().place).toBe(FIXED_PAVEMENT);

    await closeStory(harness);
    await chooseWayOut(harness, 'Walk');
    await pickDestination(harness, await waitForTravelWindow(harness), FIXED_SQUARE_LOCATION);

    let journey = await waitForSpeaker(harness, 'On foot');
    let saved = readSavedNight();

    expect(saved.place).toBe(FIXED_SQUARE);
    expect(saved.minutes).toBe(1192);
    expect(saved.log.at(-1)).toEqual({
      kind: 'choice',
      minutes: 1180,
      text: expect.any(String) as unknown,
    });

    await endStory(journey);
    await waitForPlace(harness, FIXED_SQUARE);
    await closeStory(harness);
  });

  test('the record is written and the save cleared when the log screen opens', async () => {
    let {logScreen} = await import('../source/game/screens/logScreen.js');
    let {textsRead} = await import('../source/game/core/textsRead.js');

    await startFrom(harness, `?place=${FIXED_BAR}&time=07:55&seed=7`);
    await closeStory(harness);

    // The beer takes the clock from 07:55 to 08:05, past the end.
    let bartender = await openSpot(harness, 'The bartender');

    // Enter finishes the text, the arrow focuses the beer, and Enter takes it.
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await endStory(bartender);

    // The beer's window saved the night as it closed; the Morning text has not ended yet.
    let end = await waitForSpeaker(harness, 'Morning');
    let saved = readSavedNight();

    expect(saved.minutes).toBe(1925);
    expect(saved.ending).toBeNull();

    await endStory(end);
    await vitest.waitFor(
      () => {
        expect(logScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(localStorage.getItem('foam:night')).toBeNull();
    expect(
      (JSON.parse(localStorage.getItem('foam:nights') ?? '') as {past: PastNight[]}).past,
    ).toEqual([{seed: 7, date: todaySeed(), ending: 'stranded', stories: []}]);
    expect(textsRead.paths).toContain('end › stranded');

    // The log screen opens with its Stories window, which takes the first Escape.
    await press('Escape');
    await waitForNoStoriesWindow(logScreen);
    await quitToMenu(harness, logScreen);
  });

  test('a find in an abandoned window is undone in the collection and the store on Quit to menu', async () => {
    let {collection} = await import('../source/game/core/stories.js');

    // The jump-in of the test before left nightStart at 07:55; this night starts at 19:40 again.
    useFixedWorld();
    await startNewGame(harness, 7);
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'A patron');

    // Enter finishes the text, and Enter on the second choice ignores him.
    await press('Enter');
    harness.nightScreen.ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForToast(harness);

    expect(collection.titles).toEqual(['The shrug', 'The glass']);
    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({titles: []});

    let {titles} = collection;

    await quitToMenu(harness);

    let {titles: titlesAfter} = collection;

    expect(titlesAfter).toEqual([]);
    expect(titlesAfter).toBe(titles);
    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({titles: []});
    expect(readSavedNight().stories).toEqual([]);
  });

  test("Continue with no window open resumes the place under its description at the same minute, and the undone find's choice is offered again", async () => {
    let {contents, ui} = harness.nightScreen;

    await continueNight(harness);

    expect(contents.place?.id).toBe(FIXED_BAR);
    expect(readText(contents.statusText)).toBe('19:40   350 Kč   0.0');
    expect(contents.night.seed).toBe(7);
    expect(getStoryWindow(harness).dialogue.node?.speaker).toBe('The bar');
    expect(contents.night.log.map(describeEntry)).toEqual([
      ['text', 1180, 'The bar'],
      ['text', 1180, 'The bar'],
    ]);
    expect(contents.night.stories).toEqual([]);

    await closeStory(harness);

    // Enter finishes the text, and Enter on the second choice ignores him.
    let storyWindow = await openSpot(harness, 'A patron');

    await press('Enter');

    expect(getWindowParts(storyWindow).buttons.map((button) => getButtonLabel(button))).toEqual([
      'Talk to him',
      'Ignore him',
    ]);

    ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);

    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({
      titles: ['The shrug', 'The glass'],
    });
  });

  test('a quit mid-window puts the money and the minutes back, and the finds of a resumed night get no toast', async () => {
    let {contents} = harness.nightScreen;

    // Enter finishes the text, the arrow focuses the beer, and Enter takes it.
    await openSpot(harness, 'The bartender');
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');

    expect(readText(contents.statusText)).toBe('19:50   305 Kč   1.0');

    await quitToMenu(harness);
    await continueNight(harness);

    expect(readText(contents.statusText)).toBe('19:40   350 Kč   0.0');
    expect(contents.night.rolls).toBe(0);
    expect(contents.night.drunkenness).toEqual({level: 0, at: 1180});
    expect(
      contents.night.log.filter((entry) => entry.kind === 'choice').map((entry) => entry.text),
    ).toEqual(['Ignore him']);

    await nextFrame();
    await nextFrame();
    await nextFrame();

    expect(contents.toast).toBeNull();
    expect(contents.toastQueue).toEqual([]);
    expect(contents.night.stories).toHaveLength(2);

    findStory(contents.night, 'The lamp');

    let toast = await waitForToast(harness);

    expect(readText(getToastParts(toast).text)).toBe('The lamp');

    await closeStory(harness);
  });

  test('the same roll comes up on the same choice after a quit', async () => {
    let {contents, ui} = harness.nightScreen;
    // Enter finishes the text, and Enter on the second choice knocks on the glass.
    let door = await openSpot(harness, 'The door');

    await press('Enter');
    ui.focus(getWindowButton(door, 1));
    await press('Enter');

    let first = contents.night.roll?.value;

    expect(first).toBeTypeOf('number');

    await quitToMenu(harness);
    await continueNight(harness);

    expect(contents.night.rolls).toBe(0);
    expect(contents.night.roll).toBeNull();

    await closeStory(harness);
    door = await openSpot(harness, 'The door');
    await press('Enter');
    ui.focus(getWindowButton(door, 1));
    await press('Enter');

    expect(contents.night.roll?.value).toBe(first);

    await endStory(door);
    await waitForNoStoryWindow(harness);
  });

  test("a quit during a journey's window resumes at the destination, with the pick paid and logged once", async () => {
    let {contents, ui} = harness.nightScreen;
    // Go out moves the player to the pavement, through the door's next node.
    let door = await openSpot(harness, 'The door');

    await press('Enter');
    ui.focus(getWindowButton(door, 0));
    await press('Enter');
    await endStory(door);
    await waitForPlace(harness, FIXED_PAVEMENT);
    await closeStory(harness);
    await chooseWayOut(harness, 'Walk');
    await pickDestination(harness, await waitForTravelWindow(harness), FIXED_SQUARE_LOCATION);
    await waitForSpeaker(harness, 'On foot');
    await quitToMenu(harness);
    await continueNight(harness);
    await waitForPlace(harness, FIXED_SQUARE);

    expect(readText(contents.statusText)).toBe('19:57   350 Kč   0.0');
    expect(contents.night.log.map(describeEntry).slice(-2)).toEqual([
      ['choice', 1185, expect.any(String) as unknown],
      ['text', 1197, 'The square'],
    ]);

    await closeStory(harness);
  });

  test('a quit during the closing resumes in the room, and the closing runs again', async () => {
    let {contents} = harness.nightScreen;

    await startFrom(harness, `?place=${FIXED_BAR}&time=22:55&seed=7`);
    await closeStory(harness);

    // The beer takes the clock from 22:55 to 23:05, when the bar is closed.
    let bartender = await openSpot(harness, 'The bartender');

    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await endStory(bartender);
    await waitForSpeaker(harness, 'Closing time');
    await quitToMenu(harness);
    await continueNight(harness);

    let description = await waitForSpeaker(harness, 'The bar');

    expect(readText(contents.statusText)).toBe('23:05   305 Kč   1.0');

    // The closing opens in the frame the description leaves (see endStory).
    await endStory(description);
    await endStory(await waitForSpeaker(harness, 'Closing time'));
    await waitForPlace(harness, FIXED_PAVEMENT);
  });

  test('Continue into the Morning text, and Quit to menu from the log leaves no Continue', async () => {
    let {logScreen} = await import('../source/game/screens/logScreen.js');
    let {mainMenuScreen, nightScreen} = harness;
    let {contents} = nightScreen;

    await startFrom(harness, `?place=${FIXED_BAR}&time=07:55&seed=7`);
    await closeStory(harness);

    // The beer takes the clock from 07:55 to 08:05, past the end.
    let bartender = await openSpot(harness, 'The bartender');

    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await endStory(bartender);
    await waitForSpeaker(harness, 'Morning');
    await quitToMenu(harness);
    await continueNight(harness);

    let end = await waitForSpeaker(harness, 'Morning');

    expect(contents.place).toBeNull();
    expect(contents.picture).toBeNull();
    expect(readText(contents.statusText)).toBe('08:05   305 Kč   1.0');

    await endStory(end);
    await vitest.waitFor(
      () => {
        expect(logScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(logScreen.contents.night?.ending).toBe('stranded');
    expect(
      logScreen.contents.night?.log.filter(
        (entry) => entry.kind === 'text' && entry.speaker === 'Morning',
      ),
    ).toHaveLength(1);

    // The log screen opens with its Stories window, which takes the first Escape.
    await press('Escape');
    await waitForNoStoriesWindow(logScreen);
    await quitToMenu(harness, logScreen);

    expect(mainMenuScreen.ui.children).not.toContain(mainMenuScreen.contents.continueButton);
  });

  test('a night that is over receives nothing: the beer past 08:00 leaves the lists as they were', async () => {
    let {contents} = harness.nightScreen;

    useFixedWorld();
    await startFrom(harness, `?place=${FIXED_BAR}&time=07:55&money=60&seed=7`);
    await closeStory(harness);
    await waitForToast(harness, 'Jakub');

    // Seed 7's night sends the hint.
    expect(contents.night.phone.unread).toEqual(['hello', 'hours', 'shop', 'bet', 'lastCall']);

    // The beer takes the clock from 07:55 to 08:05, past the end.
    let bartender = await openSpot(harness, 'The bartender');

    // Enter finishes the text, the arrow focuses the beer, and Enter takes it.
    await press('Enter');
    await press('ArrowDown');
    await press('Enter');
    await endStory(bartender);
    await waitForSpeaker(harness, 'Morning');

    // Under 50 Kč after 20:00: broke's condition holds now, but the night is over.
    expect(contents.night.money).toBe(15);
    expect(contents.night.minutes).toBe(1925);
    expect(contents.night.phone.unread).toEqual(['hello', 'hours', 'shop', 'bet', 'lastCall']);

    await quitToMenu(harness);
  });
});
