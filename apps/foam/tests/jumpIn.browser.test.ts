import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {bootGame, getStoryWindow, type Harness, readText} from './nightScreenHelpers.js';

// The bar's shader costs about 88 ms a frame in headless Chromium, and Rotor
// Bar uses it; the test checks the start, not the picture's pixels.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

describe('the jump-in', () => {
  let harness: Harness;
  let oldAddress = '';

  beforeAll(async () => {
    oldAddress = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;

    let url = new URL(globalThis.location.href);

    url.searchParams.set('place', 'rotorBar');
    url.searchParams.set('time', '23:10');
    url.searchParams.set('money', '120');
    globalThis.history.replaceState(null, '', url);
    harness = await bootGame(960, 540, {screen: 'night'});
  }, 60_000);

  afterAll(async () => {
    globalThis.history.replaceState(null, '', oldAddress);
    harness.unmount();

    // The jump-in wrote into nightStart; the other tests of this file's worker
    // run in their own module graph, so only the start is put back.
    let {nightStart} = await import('../source/game/content/nightStart.js');

    Object.assign(nightStart, {place: 'train', minutes: 1020, money: 350});
  });

  test('the game started with a jump-in shows that place, hour and money', () => {
    let {nightScreen} = harness;

    expect(nightScreen.state).toBe('shown');
    expect(nightScreen.contents.place?.id).toBe('rotorBar');
    expect(readText(nightScreen.contents.statusText)).toBe('23:10   120 Kč   Sober');
    expect(getStoryWindow(harness).dialogue.node?.speaker).toBe('Rotor Bar');
  });
});
