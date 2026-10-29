import {Dialogue, type RunnableDialogueScript} from 'tellurion';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {hash} from '../source/game/core/hash.js';
import {createNight, type Night} from '../source/game/core/night.js';
import {type NightStart} from '../source/game/core/travel.js';
import {
  bootGame,
  closeStory,
  describeEntry,
  findSeed,
  getButtonLabel,
  getPlaceButton,
  getStoryWindow,
  getToastParts,
  getWindowButton,
  getWindowParts,
  type Harness,
  press,
  pressThrough,
  startFrom,
  waitForNoStoryWindow,
  waitForToast,
} from './nightScreenHelpers.js';
import {readText} from './readText.js';

// The bar's shader costs about 88 ms a frame in headless Chromium, and the main menu shows the
// bar; the tests check the events, not the picture's pixels.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

function getDescription(): RunnableDialogueScript<Night> {
  let place = nightStart.places.namestiRepubliky;

  if (place === undefined) {
    throw new Error('The content has no Náměstí Republiky!');
  }

  return place.description;
}

// The node of the description, found on the content by the key.
function getNode(key: string): unknown {
  return getDescription().nodes?.[key];
}

// The description picks its event from the seed, so a test that needs an event names the seed
// whose night opens on it.
function findArrivalSeed(key: string): number {
  return findSeed(
    (seed) =>
      new Dialogue({
        script: getDescription(),
        context: createNight({seed, place: 'namestiRepubliky', minutes: 1080, money: 350}),
      }).node === getNode(key),
  );
}

const WALLET_SEED = findArrivalSeed('wallet');
const NONE_SEED = findArrivalSeed('stop');

// The world is the game's own content. Each test starts its night with a jump-in's query. The
// frames of a headless browser are slow, so the tests get a long timeout.
describe('the events on arrival', {timeout: 180_000}, () => {
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

  test('a seed with the wallet opens the event on arrival, Keep the money pays what the text names, and the description follows', async () => {
    let {nightScreen} = harness;

    await startFrom(harness, `?place=namestiRepubliky&time=18:00&money=350&seed=${WALLET_SEED}`);

    let storyWindow = getStoryWindow(harness);

    expect(storyWindow.dialogue.node).toBe(getNode('wallet'));

    await pressThrough(harness, storyWindow);

    let amount = 100 + 100 * Math.floor(hash(WALLET_SEED, 'walletMoney') * 3);

    expect(getWindowParts(storyWindow).buttons.map((button) => getButtonLabel(button))).toEqual([
      'Keep the money',
      'Leave it',
    ]);
    expect(storyWindow.dialogue.pageText).toContain(`${amount} Kč`);

    nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');

    let toast = await waitForToast(harness, 'The wallet on the bench');

    expect(readText(getToastParts(toast).text)).toBe('The wallet on the bench');
    expect(readText(nightScreen.contents.statusText)).toBe(`18:00   ${350 + amount} Kč   0.0`);

    await pressThrough(harness, storyWindow);

    expect(storyWindow.dialogue.node).toBe(getNode('stop'));

    await press('Enter');
    await waitForNoStoryWindow(harness);
    nightScreen.ui.focus(getPlaceButton(harness));
    await press('Enter');

    expect(getStoryWindow(harness).dialogue.node).toBe(getNode('stop'));

    await closeStory(harness);

    expect(nightScreen.contents.night.log.map((entry) => describeEntry(entry))).toEqual([
      ['text', 1080, 'The bench'],
      ['choice', 1080, 'Keep the money'],
      ['story', 1080, 'The wallet on the bench'],
      ['text', 1080, 'The bench'],
      ['text', 1080, 'Náměstí Republiky'],
      ['text', 1080, 'Náměstí Republiky'],
    ]);
  });

  test('a seed with none opens the plain description at once', async () => {
    await startFrom(harness, `?place=namestiRepubliky&time=18:00&money=350&seed=${NONE_SEED}`);

    expect(getStoryWindow(harness).dialogue.node).toBe(getNode('stop'));

    await closeStory(harness);
  });
});
