import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {nightStart} from '../source/game/content/nightStart.js';
import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type PlaceId} from '../source/game/core/night.js';
import {type NightStart} from '../source/game/core/travel.js';
import {
  bootGame,
  closeStory,
  endStory,
  getButtonLabel,
  getStoryWindow,
  getToastParts,
  getWindowButton,
  getWindowParts,
  type Harness,
  openSpot,
  press,
  pressThrough,
  readText,
  startFrom,
  waitForNoStoryWindow,
  waitForPlace,
  waitForSpeaker,
  waitForToast,
} from './nightScreenHelpers.js';

// The bar's shader costs about 88 ms a frame in headless Chromium, and the main menu shows the
// bar; the tests check the quest, not the picture's pixels.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// The node of the spot's script, found on the content by the label.
function getNode(place: PlaceId, label: string, key: string): unknown {
  let spot = nightStart.places[place]?.spots.find((candidate) => candidate.label === label);

  return spot?.script.nodes?.[key];
}

// The world is the game's own content, with the threads in its places. Each test starts its scene
// with a jump-in's query. The frames of a headless browser are slow, so the tests get a long
// timeout.
describe('the quest', {timeout: 180_000}, () => {
  let harness: Harness;
  let oldStart: Pick<NightStart, 'minutes' | 'money' | 'place'>;

  beforeAll(async () => {
    localStorage.clear();

    let {minutes, money, place} = nightStart;

    oldStart = {minutes, money, place};
    harness = await bootGame(960, 540);
  }, 60_000);

  afterAll(() => {
    harness.unmount();
    Object.assign(nightStart, oldStart);
    delete nightStart.drunkenness;
    delete nightStart.quest;
    localStorage.clear();
  });

  test('the bag and the timetable set the quest up on the train', async () => {
    await startFrom(harness, '?place=train&time=16:00');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The bag');

    expect(storyWindow.dialogue.pageText).toContain('Keys are with me');

    await pressThrough(harness, storyWindow);

    expect(storyWindow.dialogue.pageIndex).toBe(1);

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);

    storyWindow = await openSpot(harness, 'The timetable');

    expect(storyWindow.dialogue.pageText).toContain('08:04');

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);
  });

  test('the machine sells the ticket and reads it back', async () => {
    let {nightScreen} = harness;

    await startFrom(harness, '?place=hlavniNadraziHall&time=23:00');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The ticket machine');

    await pressThrough(harness, storyWindow);

    let {buttons} = getWindowParts(storyWindow);

    expect(buttons.map((button) => getButtonLabel(button))).toEqual([
      'Buy a ticket home  300 Kč',
      'Walk away',
    ]);

    nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');

    expect(readText(nightScreen.contents.statusText)).toBe('23:00   50 Kč   0.0');
    expect(nightScreen.contents.night.quest.hasTicket).toBe(true);

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);

    storyWindow = await openSpot(harness, 'The ticket machine');

    expect(storyWindow.dialogue.node).toBe(
      getNode('hlavniNadraziHall', 'The ticket machine', 'ticketed'),
    );
    expect(storyWindow.dialogue.visibleChoices).toEqual([]);

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);
  });

  test('with 100 Kč the ticket is greyed out', async () => {
    await startFrom(harness, '?place=hlavniNadraziHall&time=23:00&money=100');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The ticket machine');

    await pressThrough(harness, storyWindow);

    let button = getWindowButton(storyWindow, 0);

    expect(getButtonLabel(button)).toBe('Buy a ticket home  300 Kč');
    expect(button.isDisabled).toBe(true);
    expect(getStoryWindow(harness)).toBe(storyWindow);
  });

  test('the back room offers the search with its odds, and a won search hands over the keys', async () => {
    let {nightScreen} = harness;

    await startFrom(harness, '?place=rotorBarRoom&time=17:30');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The back room');

    await pressThrough(harness, storyWindow);

    expect(getWindowParts(storyWindow).buttons.map((button) => getButtonLabel(button))).toEqual([
      'Look for them  10 min  70%',
      'Not now',
    ]);

    nightScreen.contents.night.random = () => 0.1;
    nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');

    let toast = await waitForToast(harness);

    expect(readText(getToastParts(toast).text)).toBe('The keys');
    expect(nightScreen.contents.night.quest.hasKeys).toBe(true);
    expect(readText(nightScreen.contents.statusText)).toBe('17:40   350 Kč   0.0');

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);

    storyWindow = await openSpot(harness, 'The back room');

    expect(storyWindow.dialogue.node).toBe(getNode('rotorBarRoom', 'The back room', 'chat'));

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);
  });

  test('a lost search costs an hour', async () => {
    let {nightScreen} = harness;

    await startFrom(harness, '?place=rotorBarRoom&time=17:30');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The back room');

    await pressThrough(harness, storyWindow);

    nightScreen.contents.night.random = () => 0.9;
    nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');

    expect(readText(nightScreen.contents.statusText)).toBe('18:40   350 Kč   0.0');
    expect(nightScreen.contents.night.quest.hasKeys).toBe(false);
    expect(storyWindow.dialogue.node).toBe(getNode('rotorBarRoom', 'The back room', 'missed'));

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);
  });

  test('at three drinks the odds read 40%', async () => {
    await startFrom(harness, '?place=rotorBarRoom&time=17:30&drunkenness=3');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The back room');

    await pressThrough(harness, storyWindow);

    expect(getButtonLabel(getWindowButton(storyWindow, 0))).toBe('Look for them  10 min  40%');

    harness.nightScreen.ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  });

  test('at 20:30 the back room is away', async () => {
    await startFrom(harness, '?place=rotorBarRoom&time=20:30');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The back room');

    expect(storyWindow.dialogue.node).toBe(getNode('rotorBarRoom', 'The back room', 'away'));
    expect(storyWindow.dialogue.visibleChoices).toEqual([]);

    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);
  });

  test('a lost search after half past two lands after the close', async () => {
    let {nightScreen} = harness;

    await startFrom(harness, '?place=rotorBarRoom&time=02:30');
    await closeStory(harness);

    let storyWindow = await openSpot(harness, 'The back room');

    await pressThrough(harness, storyWindow);

    nightScreen.contents.night.random = () => 0.9;
    nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');

    expect(readText(nightScreen.contents.statusText).startsWith('03:40')).toBe(true);

    await endStory(storyWindow);

    let closing = await waitForSpeaker(harness, 'Closing time');

    await endStory(closing);
    await waitForPlace(harness, 'rotorBarStreet');
  });

  test("the bartender's answer changes with the hour", async () => {
    let answers: string[] = [];

    for (let time of ['16:30', '21:00']) {
      await startFrom(harness, `?place=rotorBarRoom&time=${time}`);
      await closeStory(harness);

      let storyWindow = await openSpot(harness, 'The bar');

      await pressThrough(harness, storyWindow);

      let {buttons} = getWindowParts(storyWindow);

      expect(buttons.map((button) => getButtonLabel(button))).toEqual([
        'Order a beer  10 min  45 Kč',
        'Ask after your friend',
        'Not now',
      ]);

      harness.nightScreen.ui.focus(getWindowButton(storyWindow, 1));
      await press('Enter');
      answers.push(storyWindow.dialogue.pageText);
      await endStory(storyWindow);
      await waitForNoStoryWindow(harness);
    }

    expect(answers[1]).not.toBe(answers[0]);
    expect(answers[1]).toContain('eleven');
  });
});
