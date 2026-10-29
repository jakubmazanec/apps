import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightStart} from '../source/game/content/nightStart.js';
import {messages} from '../source/game/content/phone/index.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {createNight} from '../source/game/core/night.js';
import {type NightStart} from '../source/game/core/travel.js';
import {
  bootGame,
  closeStory,
  findSeed,
  getBox,
  getButtonLabel,
  getToastParts,
  type Harness,
  startFrom,
  startNewGame,
  waitForNoToast,
  waitForToast,
} from './nightScreenHelpers.js';
import {readText} from './readText.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check the phone, not what the picture
// draws, so the main menu, which shows the bar, gets the pipeline's proof, a
// shader of a few lines. The bar's GLSL has its text as its type, so the stub's
// text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// The hint and the wrong number come by the seed, so this seed's night at 20:30 in Rotor's room
// with 350 Kč gets the hello, the shop and the bet and nothing else.
const QUIET_SEED = findSeed((seed) => {
  let night = createNight({seed, place: 'rotorBarRoom', minutes: 1230, money: 350});

  return (
    messages
      .filter((message) => message.arrives(night))
      .map(({key}) => key)
      .join(',') === 'hello,shop,bet'
  );
});

// 960 × 540 CSS pixels are 480 × 270 art pixels. The game's own content: the
// night opens on the train, and the jump-in lands in Rotor's room. The storage
// is cleared before the boot, which loads the stores. The frames of a headless
// browser are slow, and several times slower on a busy machine, so the tests
// get a long timeout. They follow each other in order: each starts where the
// one before it ended.
describe('the phone', {timeout: 180_000}, () => {
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

  test("a new night starts with the Phone button greyed out, and the description's close brings the hello with its toast, its chime and the count", async () => {
    let play = vitest.spyOn((await import('../source/game/core/audio.js')).audio, 'play');

    try {
      await startNewGame(harness, QUIET_SEED);

      let {contents} = harness.nightScreen;

      expect(getButtonLabel(contents.phoneButton)).toBe('Phone');
      expect(contents.phoneButton.isDisabled).toBe(true);
      expect(getBox(harness, contents.phoneButton)).toEqual({
        left: 434,
        top: 250,
        width: 42,
        height: 16,
      });
      expect(contents.night.phone).toEqual({unread: [], read: []});

      await closeStory(harness);

      let {text, title} = getToastParts(await waitForToast(harness));
      let box = getBox(harness, contents.phoneButton);

      expect(readText(title)).toBe('A message');
      expect(readText(text)).toBe('Jakub');
      expect(contents.night.phone).toEqual({unread: ['hello'], read: []});
      expect(getButtonLabel(contents.phoneButton)).toBe('Phone 1');
      expect(contents.phoneButton.isDisabled).toBe(false);
      // The wider label grows to the left: the button keeps its right edge.
      expect(box.top).toBe(250);
      expect(box.left + box.width).toBe(476);
      expect(play.mock.calls.filter(([clip]) => clip === harness.assets.sound('phone'))).toEqual([
        [harness.assets.sound('phone'), {bus: 'ui'}],
      ]);
    } finally {
      play.mockRestore();
    }
  });

  test('a jump-in at 20:30 without the bottle brings three messages at once: the toasts follow one another and the button counts them', async () => {
    let {contents} = harness.nightScreen;

    await startFrom(harness, `?place=rotorBarRoom&time=20:30&money=350&seed=${QUIET_SEED}`);

    // A new night, before its first look.
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone');
    expect(contents.phoneButton.isDisabled).toBe(true);

    await closeStory(harness);
    await waitForToast(harness, 'Jakub');

    expect(contents.night.phone).toEqual({unread: ['hello', 'shop', 'bet'], read: []});
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone 3');
    expect(contents.toastQueue).toEqual([
      {heading: 'A message', title: 'Jakub'},
      {heading: 'A message', title: 'Jakub'},
    ]);

    await waitForNoToast(harness);
  });
});
