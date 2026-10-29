import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightStart} from '../source/game/content/nightStart.js';
import {messages} from '../source/game/content/phone/index.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {createNight} from '../source/game/core/night.js';
import {type SavedNight} from '../source/game/core/save.js';
import {type NightStart} from '../source/game/core/travel.js';
import {
  bootGame,
  closeStory,
  describeEntry,
  findSeed,
  getBox,
  getButtonLabel,
  getStoryWindow,
  getToastParts,
  getWindowButton,
  getWindowParts,
  type Harness,
  nextFrame,
  openSpot,
  press,
  pressThrough,
  startFrom,
  startNewGame,
  waitForNoStoryWindow,
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

// The night as the game saved it, read straight from the storage.
function readSavedNight(): SavedNight {
  return JSON.parse(localStorage.getItem('foam:night') ?? '') as SavedNight;
}

// The hint and the wrong number come by the seed, so this seed's night at 20:30 in Rotor's room
// with 350 Kč gets the hello, the invitation (which comes on every night at 16:30), the shop and
// the bet and nothing else.
const QUIET_SEED = findSeed((seed) => {
  let night = createNight({seed, place: 'rotorBarRoom', minutes: 1230, money: 350});

  return (
    messages
      .filter((message) => message.arrives(night))
      .map(({key}) => key)
      .join(',') === 'hello,invitation,shop,bet'
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

  test('a jump-in at 20:30 without the bottle brings four messages at once: the toasts follow one another and the button counts them', async () => {
    let {contents} = harness.nightScreen;

    await startFrom(harness, `?place=rotorBarRoom&time=20:30&money=350&seed=${QUIET_SEED}`);

    // A new night, before its first look.
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone');
    expect(contents.phoneButton.isDisabled).toBe(true);

    await closeStory(harness);
    await waitForToast(harness, 'Jakub');

    expect(contents.night.phone).toEqual({
      unread: ['hello', 'invitation', 'shop', 'bet'],
      read: [],
    });
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone 4');
    expect(contents.toastQueue).toEqual([
      {heading: 'A message', title: 'Jakub'},
      {heading: 'A message', title: 'Jakub'},
      {heading: 'A message', title: 'Jakub'},
    ]);

    await waitForNoToast(harness);
  });

  test('Phone opens the oldest message in a window titled by the sender, and a reply marks it read, saves it and logs it', async () => {
    let {contents, ui} = harness.nightScreen;

    ui.focus(contents.phoneButton);
    await press('Enter');

    let storyWindow = getStoryWindow(harness);
    let {title} = getWindowParts(storyWindow);

    expect(contents.reading).toBe('hello');
    expect(storyWindow.dialogue.node?.speaker).toBe('Jakub');
    expect(title === null ? null : readText(title)).toBe('Jakub');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
      'Hi',
      'Who is this?',
      'Mute',
    ]);

    ui.focus(getWindowButton(storyWindow, 2));
    await press('Enter');
    await waitForNoStoryWindow(harness);

    expect(contents.reading).toBeNull();
    expect(contents.night.phone).toEqual({unread: ['invitation', 'shop', 'bet'], read: ['hello']});
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone 3');
    expect(readSavedNight().phone).toEqual({
      unread: ['invitation', 'shop', 'bet'],
      read: ['hello'],
    });
    expect(contents.night.log.slice(-2).map(describeEntry)).toEqual([
      ['text', 1230, 'Jakub'],
      ['choice', 1230, 'Mute'],
    ]);
    // Reading costs nothing.
    expect(contents.night.minutes).toBe(1230);
    expect(contents.night.money).toBe(350);
  });

  test('the invitation says where Jakub is tonight, and Maybe closes it', async () => {
    let {contents, ui} = harness.nightScreen;

    ui.focus(contents.phoneButton);
    await press('Enter');

    expect(contents.reading).toBe('invitation');

    let storyWindow = getStoryWindow(harness);

    expect(storyWindow.dialogue.node?.speaker).toBe('Jakub');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual(['Maybe', 'Why?']);

    ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');
    await waitForNoStoryWindow(harness);

    expect(contents.night.phone).toEqual({unread: ['shop', 'bet'], read: ['hello', 'invitation']});
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone 2');
  });

  test('the next press opens the next message, whose reply marks the night', async () => {
    let {contents, ui} = harness.nightScreen;

    ui.focus(contents.phoneButton);
    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    expect(contents.reading).toBe('shop');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
      'Going',
      'Skipping it',
    ]);

    ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForNoStoryWindow(harness);

    expect(contents.night.events).toContain('skippedBottle');
    expect(contents.night.phone).toEqual({unread: ['bet'], read: ['hello', 'invitation', 'shop']});
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone 1');
  });

  test('the Phone button activated while a window is open does nothing', async () => {
    let {contents, ui} = harness.nightScreen;
    let storyWindow = await openSpot(harness, 'The bar');

    contents.phoneButton.activate();
    await nextFrame();

    expect(contents.reading).toBeNull();
    expect(getStoryWindow(harness)).toBe(storyWindow);
    expect(contents.night.phone.unread).toEqual(['bet']);

    await pressThrough(harness, storyWindow);
    // Not now ends the window.
    ui.focus(getWindowButton(storyWindow, 2));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  });

  test('reading the last message greys the button out again', async () => {
    let {contents, ui} = harness.nightScreen;

    ui.focus(contents.phoneButton);
    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    expect(contents.reading).toBe('bet');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual(['Bet', 'No']);

    ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForNoStoryWindow(harness);

    expect(contents.night.phone).toEqual({
      unread: [],
      read: ['hello', 'invitation', 'shop', 'bet'],
    });
    expect(getButtonLabel(contents.phoneButton)).toBe('Phone');
    expect(contents.phoneButton.isDisabled).toBe(true);
    expect(contents.night.events).not.toContain('bet');
  });
});
