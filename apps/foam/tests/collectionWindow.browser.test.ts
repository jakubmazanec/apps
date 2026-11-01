import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type ListWindow} from '../source/game/screens/listWindow.js';
import {getStoriesParts, readLeaves} from './listParts.js';
import {bootGame, describeFocus, type Harness, press} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check the window, not what the picture
// draws, so the main menu, which shows the bar, gets the pipeline's proof, a
// shader of a few lines. The bar's GLSL has its text as its type, so the stub's
// text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 292 × 524 CSS pixels are the narrowest screen, 146 × 262 art pixels, where a
// line of the window's text holds 19 characters. The stories and the nights are
// stored before the boot, which loads them. The frames of a headless browser are
// slow, and several times slower on a busy machine, so the tests get a long
// timeout. They follow each other in order: each starts where the one before it
// ended.
describe('the Collection window', {timeout: 180_000}, () => {
  let harness: Harness;

  function getCollectionWindow(): ListWindow {
    let {collectionWindow} = harness.mainMenuScreen.contents;

    if (collectionWindow === null) {
      throw new Error('No Collection window is open!');
    }

    return collectionWindow;
  }

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem(
      'foam:stories',
      JSON.stringify({titles: Array.from({length: 12}, (_, index) => `Story ${index + 1}`)}),
    );
    localStorage.setItem(
      'foam:nights',
      JSON.stringify({
        past: [
          {seed: 3, date: 20261025, ending: null, stories: []},
          {seed: 7, date: 20261026, ending: 'stranded', stories: ['Story 1']},
          {seed: 202610272, date: 20261027, ending: 'stay', stories: ['Story 2', 'Story 3']},
        ],
        day: {date: 0, started: 0},
      }),
    );
    harness = await bootGame(292, 524);
  }, 60_000);

  afterAll(() => {
    harness.unmount();
    localStorage.clear();
  });

  test('the lists come in pages, Next reads them through, and the focus moves to Back at the end', async () => {
    let {contents, ui} = harness.mainMenuScreen;

    ui.focus(contents.collectionButton);
    await press('Enter');

    let {back, italicLeaf, next, regularLeaf} = getStoriesParts(getCollectionWindow());

    if (back === null || next === null) {
      throw new Error('The Collection window has no Back or no Next!');
    }

    expect(back.isDisabled).toBe(true);
    expect(next.isDisabled).toBe(false);
    expect(ui.focused).toBeNull();

    let pages = [readLeaves(regularLeaf, italicLeaf)];

    ui.focus(next);

    for (let count = 0; count < 10 && !next.isDisabled; count += 1) {
      await press('Enter');
      pages.push(readLeaves(regularLeaf, italicLeaf));
    }

    let text = pages.join('');
    let newest = text.indexOf('27 Oct 2026');

    expect(pages.length).toBeGreaterThan(1);
    expect(describeFocus(ui.focused)).toBe('Back');
    expect(text.startsWith('Stories  12 found\nStory 1\n')).toBe(true);
    expect(newest).toBeGreaterThan(0);
    expect(text.indexOf('26 Oct 2026')).toBeGreaterThan(newest);
    expect(text.indexOf('25 Oct 2026')).toBeGreaterThan(text.indexOf('26 Oct 2026'));
    expect(text).toContain('\n  Story 2\n  Story 3\n');
    expect(text).toContain('\n  Story 1\n');
    expect(text.endsWith('25 Oct 2026  Seed 3')).toBe(true);
    // No line is lost between pages: one heading, twelve titles, one blank, one heading and the
    // eight lines the nights wrap to at 19 characters a line.
    expect(text.split('\n').length - 1).toBe(22);
  });

  test('Back reads the pages back, and the window closes on Escape', async () => {
    let {contents, ui} = harness.mainMenuScreen;
    let {back} = getStoriesParts(getCollectionWindow());

    if (back === null) {
      throw new Error('The Collection window has no Back!');
    }

    for (let count = 0; count < 10 && !back.isDisabled; count += 1) {
      await press('Enter');
    }

    expect(describeFocus(ui.focused)).toBe('Next');

    await press('Escape');
    await vitest.waitFor(
      () => {
        expect(contents.collectionWindow).toBeNull();
      },
      {timeout: 10_000},
    );

    expect(describeFocus(ui.focused)).toBe('Collection');
  });
});
