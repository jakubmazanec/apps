import {type Ticker} from 'pixi.js';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/barPicture.js';
import {stripMarks} from '../source/game/core/markedText.js';
import {
  bootGame,
  doBoxesOverlap,
  getBox,
  getButtonLabel,
  getSpotButton,
  getStoryWindow,
  getWindowButton,
  getWindowParts,
  type Harness,
  press,
  readPages,
  startNewGame,
  tap,
  waitForNoStoryWindow,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check placement, speed and windows,
// not the picture's pixels (tests/placePicture.browser.test.ts does), so the
// place gets the pipeline's proof, a shader of a few lines. The bar's GLSL has
// its text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 292 × 524 CSS pixels are 146 × 262 art pixels: headless Chromium has a
// device pixel ratio of 1, and the engine picks a pixel scale of 2, its
// smallest, so a frame draws as few pixels as the art allows. Under that scale
// rule a phone held upright is about 180 to 240 art pixels wide, so this is a
// window narrower than any phone, kept as the smallest case. The frames of a
// headless browser are slow, and several times slower on a busy machine, and a
// real tap takes many frames, so the tests get a long timeout.
describe('night screen on a narrow screen', {timeout: 180_000}, () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await bootGame(292, 524);
    await startNewGame(harness);
  }, 60_000);

  afterAll(() => {
    harness.unmount();
    localStorage.clear();
  });

  test('the screen is 146 × 262 art pixels', () => {
    let {game} = harness;

    expect(game.app.screen.width / game.pixelScale).toBe(146);
    expect(game.app.screen.height / game.pixelScale).toBe(262);
  });

  test('the status text lies under the place button', () => {
    let place = getBox(harness, harness.nightScreen.contents.placeButton);
    let status = getBox(harness, harness.nightScreen.contents.statusText);

    expect(status.top).toBeGreaterThanOrEqual(place.top + place.height);
    expect(status.left).toBe(4);
    expect(status.left + status.width).toBeLessThanOrEqual(146 - 4);
    // The scene area starts 40 from the top.
    expect(status.top + status.height).toBeLessThanOrEqual(40);
  });

  test('the place button fits beside the Menu button', () => {
    let {placeButton, menuButton} = harness.nightScreen.contents;
    let place = getBox(harness, placeButton);
    let menu = getBox(harness, menuButton);

    expect(place.left + place.width + 4).toBeLessThanOrEqual(menu.left);
  });

  test('every scene button lies inside the screen and under the top row', () => {
    for (let button of harness.nightScreen.contents.spotButtons) {
      let box = getBox(harness, button);

      expect(box.left).toBeGreaterThanOrEqual(4);
      expect(box.left + box.width).toBeLessThanOrEqual(146 - 4);
      expect(box.top).toBeGreaterThanOrEqual(40);
      expect(box.top + box.height).toBeLessThanOrEqual(262 - 4);
    }
  });

  // The description opened by itself on arrival and is still open here.
  test('the story window is 138 wide and lies in the scene area', () => {
    let box = getBox(harness, getWindowParts(getStoryWindow(harness)).panel);

    expect(box.width).toBe(138);
    expect(box.left).toBe(4);
    expect(box.top).toBeGreaterThanOrEqual(40 + 4);
    expect(box.top + box.height).toBeLessThanOrEqual(262 - 4);
  });

  test(
    'the text stops by itself at the end of a full page, and the cursor shows',
    {timeout: 240_000},
    async () => {
      let {game, nightScreen} = harness;
      let storyWindow = getStoryWindow(harness);
      let elapsed = 0;
      let addTime = (ticker: Ticker) => {
        elapsed += ticker.deltaMS;
      };

      // No press: the first page types to its end. Game time advances by at
      // most 100 ms per frame, so that takes seconds.
      await vitest.waitFor(
        () => {
          expect(storyWindow.dialogue.phase).toBe('idle');
        },
        {timeout: 120_000},
      );

      let revealed = storyWindow.dialogue.revealedCount;
      let shown = storyWindow.text;
      let {buttons, cursor} = getWindowParts(storyWindow);

      expect(revealed).toBeLessThan(storyWindow.dialogue.pageText.length);
      // A full page: 14 lines, the last ending where the page ends.
      expect(shown.trimEnd().split('\n')).toHaveLength(14);
      expect(shown.replaceAll('\n', ' ')).toBe(
        stripMarks(storyWindow.dialogue.pageText.slice(0, revealed)),
      );
      expect(buttons).toEqual([]);
      expect(nightScreen.ui.focused).toBeNull();

      // It blinks: on for 500 ms of game time, then off for as long.
      await vitest.waitFor(
        () => {
          expect(cursor.visible).toBe(true);
        },
        {timeout: 10_000},
      );

      // A second of game time would type 40 more characters.
      game.app.ticker.add(addTime);

      try {
        await vitest.waitFor(
          () => {
            expect(elapsed).toBeGreaterThanOrEqual(1000);
          },
          {timeout: 120_000},
        );
      } finally {
        game.app.ticker.remove(addTime);
      }

      expect(storyWindow.dialogue.phase).toBe('idle');
      expect(storyWindow.dialogue.revealedCount).toBe(revealed);
      expect(storyWindow.text).toBe(shown);
    },
  );

  // It starts where the test before ended, at the end of the first page.
  test('the description takes more than one page of at most 14 lines', async () => {
    let storyWindow = getStoryWindow(harness);
    let whole = storyWindow.dialogue.pageText;
    let pages = await readPages(storyWindow);

    expect(pages.length).toBeGreaterThan(1);

    for (let shown of pages) {
      let lines = shown.trimEnd().split('\n');

      expect(lines.length).toBeLessThanOrEqual(14);

      // The text is 138 wide less 12 of padding on both sides.
      for (let line of lines) {
        expect(harness.measureText(line)).toBeLessThanOrEqual(114);
      }
    }

    // Nothing is lost or repeated where one page ends and the next begins.
    expect(pages.join('').replaceAll('\n', ' ')).toBe(stripMarks(whole));

    await press('Enter');
    await waitForNoStoryWindow(harness);
  });

  test('a choice longer than a line wraps inside its button', async () => {
    let {nightScreen} = harness;

    nightScreen.ui.focus(getSpotButton(harness, 'A patron'));
    await press('Enter');

    let storyWindow = getStoryWindow(harness);

    // Finish the text, take "Talk to him", finish its text.
    await press('Enter');
    nightScreen.ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');
    await press('Enter');

    let {buttons, panel, textBlock} = getWindowParts(storyWindow);
    let panelBox = getBox(harness, panel);
    let [first, second] = buttons.map((button) => getBox(harness, button));

    expect(buttons.map(getButtonLabel)).toEqual(['Ask about the\nceiling', 'Let him be']);

    // A label is the text width of 114 less 6 of button padding on both sides.
    for (let line of buttons.flatMap((button) => getButtonLabel(button).split('\n'))) {
      expect(harness.measureText(line, 'label')).toBeLessThanOrEqual(102);
    }

    if (first === undefined || second === undefined) {
      throw new Error('The window has fewer than two choice buttons!');
    }

    for (let box of [first, second]) {
      expect(box.left).toBeGreaterThanOrEqual(panelBox.left + 12);
      expect(box.left + box.width).toBeLessThanOrEqual(panelBox.left + panelBox.width - 12);
      expect(box.top + box.height).toBeLessThanOrEqual(panelBox.top + panelBox.height - 8);
    }

    // 4 between two choices, and 8 between the text and the first one.
    expect(second.top - (first.top + first.height)).toBe(4);

    let textBox = getBox(harness, textBlock);

    expect(first.top - (textBox.top + textBox.height)).toBe(8);

    // Two lines and one line of 12, plus 2 of padding on both sides.
    expect(first.height).toBe(28);
    expect(second.height).toBe(16);
    expect(doBoxesOverlap(first, second)).toBe(false);
    expect(panelBox.top).toBeGreaterThanOrEqual(40 + 4);
    expect(panelBox.top + panelBox.height).toBeLessThanOrEqual(262 - 4);

    // "Let him be" has no next node.
    nightScreen.ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    await waitForNoStoryWindow(harness);
  });

  test('taps open a window, finish its text and take a choice', async () => {
    let {nightScreen} = harness;

    await tap(harness, getBox(harness, getSpotButton(harness, 'The door')));

    let storyWindow = getStoryWindow(harness);
    let doorNode = storyWindow.dialogue.node;

    expect(doorNode?.speaker).toBe('The door');

    // A real tap takes seconds, and the text may have typed to its end by
    // itself in that time. Otherwise the tap on the text finishes it.
    await tap(harness, getBox(harness, getWindowParts(storyWindow).textBlock));

    expect(storyWindow.dialogue.revealedCount).toBe(storyWindow.dialogue.pageText.length);
    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
      'Step outside',
      'Stay',
    ]);

    // A tap on the text does nothing while the choices are offered, and
    // focuses nothing.
    await tap(harness, getBox(harness, getWindowParts(storyWindow).textBlock));

    expect(storyWindow.dialogue.phase).toBe('choosing');
    expect(nightScreen.ui.focused).toBeNull();

    await tap(harness, getBox(harness, getWindowButton(storyWindow, 0)));

    expect(storyWindow.dialogue.node).not.toBe(doorNode);
    expect(getWindowParts(storyWindow).buttons).toEqual([]);

    // The keyboard finishes the text, if it is still typing, and closes the
    // window. The presses stop once the runner has ended: one more would open
    // the window again from the scene button that got the focus back.
    for (let count = 0; count < 3 && storyWindow.dialogue.phase !== 'ended'; count += 1) {
      await press('Enter');
    }

    await waitForNoStoryWindow(harness);

    expect(storyWindow.dialogue.phase).toBe('ended');
  });
});
