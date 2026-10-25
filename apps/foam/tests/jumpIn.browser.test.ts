import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {todaySeed} from '../source/game/core/todaySeed.js';
import {type NightStart} from '../source/game/core/travel.js';
import {
  bootGame,
  getStoryWindow,
  type Harness,
  press,
  pressThrough,
  readText,
  startNewGame,
  waitForPlace,
} from './nightScreenHelpers.js';

// The bar's shader costs about 88 ms a frame in headless Chromium, and Rotor
// Bar uses it; the test checks the start, not the picture's pixels.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

describe('the jump-in', () => {
  let harness: Harness;
  let oldAddress = '';
  let oldStart: Pick<NightStart, 'minutes' | 'money' | 'place' | 'seed'>;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('foam:stories', JSON.stringify({titles: ['An old story']}));
    oldAddress = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;

    let {minutes, money, place, seed} = nightStart;

    oldStart = {minutes, money, place, seed};

    let url = new URL(globalThis.location.href);

    url.searchParams.set('place', 'rotorBarRoom');
    // Rotor Bar closes at 03:00, so at 04:00 the jump-in starts in a closed bar's room.
    url.searchParams.set('time', '04:00');
    url.searchParams.set('money', '120');
    url.searchParams.set('drunkenness', '2.5');
    url.searchParams.set('stories', 'none');
    url.searchParams.set('seed', '7');
    globalThis.history.replaceState(null, '', url);
    harness = await bootGame(960, 540, {screen: 'night'});
  }, 60_000);

  afterAll(() => {
    globalThis.history.replaceState(null, '', oldAddress);
    harness.unmount();

    // The boot's jump-in wrote its place, hour, money and seed into nightStart. They
    // are put back as they were before the boot, so nightStart leaves this
    // block as it came in: a block added after it in this file starts its New
    // Game from the game's own start, not from the jump-in's. The level of
    // drunkenness is not part of the game's own start, so it is removed rather
    // than put back; the quest flags are not part of it either, so they are removed too.
    Object.assign(nightStart, oldStart);
    delete nightStart.drunkenness;
    delete nightStart.quest;
    localStorage.clear();
  });

  test('stories=none starts with an empty collection and an empty store', async () => {
    let {collection} = await import('../source/game/core/stories.js');

    expect(collection.titles).toEqual([]);
    expect(localStorage.getItem('foam:stories')).toBeNull();
  });

  test('the game started with a jump-in shows that place, hour and money', () => {
    let {nightScreen} = harness;

    expect(nightScreen.state).toBe('shown');
    expect(nightScreen.contents.place?.id).toBe('rotorBarRoom');
    expect(readText(nightScreen.contents.statusText)).toBe('04:00   120 Kč   2.5');
    expect(getStoryWindow(harness).dialogue.node?.speaker).toBe('Rotor Bar');
  });

  test("the jump-in's seed is the night's", () => {
    let {nightScreen} = harness;

    expect(nightStart.seed).toBe(7);
    expect(nightScreen.contents.night.seed).toBe(7);
  });

  // The night looks at the hours after every window, the room's description too.
  test('the closing runs after the description of a closed bar', async () => {
    await pressThrough(harness, getStoryWindow(harness));
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(getStoryWindow(harness).dialogue.node?.speaker).toBe('Closing time');
      },
      {timeout: 10_000},
    );
    await pressThrough(harness, getStoryWindow(harness));
    await press('Enter');
    await waitForPlace(harness, 'rotorBarStreet');
  }, 60_000);

  test("Quit to menu and New Game keep the jump-in's place, hour and money, and take the window's date for the seed", async () => {
    let {game, mainMenuScreen, nightScreen} = harness;

    await game.showScreen(mainMenuScreen);
    await startNewGame(harness);

    expect(nightScreen.contents.night.seed).toBe(todaySeed());
    expect(nightScreen.contents.place?.id).toBe('rotorBarRoom');
    expect(readText(nightScreen.contents.statusText)).toBe('04:00   120 Kč   2.5');
  }, 60_000);
});
