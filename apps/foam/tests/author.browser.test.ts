import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {getSeat, type Seat} from '../source/game/content/author.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {createNight} from '../source/game/core/night.js';
import {type NightStart} from '../source/game/core/travel.js';
import {
  bootGame,
  closeStory,
  continueNight,
  describeEntry,
  describeFocus,
  endStory,
  findSeed,
  getButtonLabel,
  getSpotButton,
  getStoryWindow,
  getToastParts,
  getWindowButton,
  getWindowParts,
  type Harness,
  press,
  pressThrough,
  quitToMenu,
  startFrom,
  waitForNoStoryWindow,
  waitForNoToast,
  waitForToast,
} from './nightScreenHelpers.js';
import {readText} from './readText.js';

// The bar's shader costs about 88 ms a frame in headless Chromium, and the main menu shows the
// bar; the tests check the meetings, not the picture's pixels.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// The seat is picked from the seed, so a test names a seed whose night picks the seat it plays.
function findSeatSeed(seat: Seat): number {
  return findSeed(
    (seed) => getSeat(createNight({seed, place: 'train', minutes: 960, money: 350})) === seat,
  );
}

const SHOP_SEED = findSeatSeed('shop');
const ROTOR_SEED = findSeatSeed('rotor');

// The world is the game's own content. Each test starts its night with a jump-in's query. The
// frames of a headless browser are slow, so the tests get a long timeout.
describe('the author', {timeout: 180_000}, () => {
  let harness: Harness;
  let oldStart: Pick<NightStart, 'minutes' | 'money' | 'place' | 'seed'>;

  beforeAll(async () => {
    localStorage.clear();

    let {minutes, money, place, seed} = nightStart;

    oldStart = {minutes, money, place, seed};
    harness = await bootGame(960, 540);
  }, 60_000);

  afterAll(() => {
    harness.unmount();
    Object.assign(nightStart, oldStart);
    delete nightStart.drunkenness;
    delete nightStart.quest;
    localStorage.clear();
  });

  test('a jump-in to the shop at 18:00 on a shop seed shows Jakub under the description, and the first meeting is the story', async () => {
    await startFrom(harness, `?place=whiskyShopRoom&time=18:00&money=350&seed=${SHOP_SEED}`);

    let {contents, ui} = harness.nightScreen;
    let jakub = getSpotButton(harness, 'Jakub');

    expect(getButtonLabel(jakub)).toBe('Jakub');
    expect(jakub.view.visible).toBe(true);

    await closeStory(harness);
    // The hello and the invitation arrive with the description's close, and their toasts pass
    // before the story's.
    await waitForNoToast(harness);
    ui.focus(jakub);
    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    expect(storyWindow.dialogue.node?.speaker).toBe('Jakub');

    let {text, title} = getToastParts(await waitForToast(harness, 'The author'));

    expect(readText(title)).toBe('A story');
    expect(readText(text)).toBe('The author');
    expect(contents.night.stories).toEqual([{title: 'The author', minutes: 1080}]);

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map((button) => getButtonLabel(button))).toEqual([
      'Take the dram  15 min',
      'Ask which bits are real',
      'Leave him to it',
    ]);

    ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(readText(contents.statusText)).toBe('18:15   350 Kč   1.0');
      },
      {timeout: 10_000},
    );
    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);

    expect(contents.night.log.slice(-4).map(describeEntry)).toEqual([
      ['story', 1080, 'The author'],
      ['text', 1080, 'Jakub'],
      ['choice', 1080, 'Take the dram  15 min'],
      ['text', 1095, 'Jakub'],
    ]);
  });

  test('on a Rotor seed the shop has no Jakub and Tab passes him over', async () => {
    await startFrom(harness, `?place=whiskyShopRoom&time=18:00&money=350&seed=${ROTOR_SEED}`);

    let {ui} = harness.nightScreen;
    let labels: string[] = [];

    expect(getSpotButton(harness, 'Jakub').view.visible).toBe(false);

    await closeStory(harness);
    ui.clearFocus();

    for (let index = 0; index < 8; index += 1) {
      ui.focusNext();
      labels.push(describeFocus(ui.focused));
    }

    expect(labels.slice(0, 6)).toEqual([
      'Whisky Shop',
      'Menu',
      'The shelves',
      'The shopkeeper',
      'Two regulars',
      'The door',
    ]);
    expect(labels).not.toContain('Jakub');
  });

  test('at Rotor at 22:00 on the Rotor seed he is there, a second meeting finds no story, and Continue shows him again', async () => {
    await startFrom(harness, `?place=rotorBarRoom&time=22:00&money=350&seed=${ROTOR_SEED}`);

    let {contents, ui} = harness.nightScreen;
    let jakub = getSpotButton(harness, 'Jakub');

    expect(jakub.view.visible).toBe(true);

    await closeStory(harness);
    ui.focus(jakub);
    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    expect(storyWindow.dialogue.node?.speaker).toBe('Jakub');
    expect(contents.night.stories).toEqual([]);
    expect(contents.toastQueue.map(({heading}) => heading)).not.toContain('A story');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map((button) => getButtonLabel(button))).toEqual([
      'Ask for a story  10 min',
      'Say nothing',
    ]);

    ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForNoStoryWindow(harness);

    expect(contents.night.minutes).toBe(1320);

    await quitToMenu(harness);
    await continueNight(harness);

    expect(getSpotButton(harness, 'Jakub').view.visible).toBe(true);

    await closeStory(harness);
  });
});
