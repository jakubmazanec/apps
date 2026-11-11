import {describe, expect, test} from 'vitest';

import {expandFrame, fitScreen} from '../source/shell/present.js';

describe(fitScreen, () => {
  test.each([
    [{width: 1920, height: 1080}, 1, {scale: 3, cssWidth: 1440, cssHeight: 816, exact: true}],
    [{width: 1920, height: 1080}, 2, {scale: 7, cssWidth: 1680, cssHeight: 952, exact: true}],
    [{width: 1536, height: 864}, 1.25, {scale: 3, cssWidth: 1152, cssHeight: 652.8, exact: false}],
    [{width: 1280, height: 720}, 1.5, {scale: 3, cssWidth: 960, cssHeight: 544, exact: false}],
    [{width: 300, height: 200}, 1, {scale: 1, cssWidth: 480, cssHeight: 272, exact: true}],
  ])('%o at %d', (viewport, devicePixelRatio, expected) => {
    expect(fitScreen(viewport, devicePixelRatio)).toEqual(expected);
  });
});

describe(expandFrame, () => {
  test('looks colours up in the palette', () => {
    let palette = new Uint8Array(256 * 3);
    palette.set([0xff, 0x7a, 0x2f], 6 * 3);
    let rgba = new Uint8ClampedArray(2 * 4);

    expandFrame(Uint8Array.from([0, 6]), palette, rgba);

    expect(rgba).toEqual(Uint8ClampedArray.from([0, 0, 0, 255, 255, 122, 47, 255]));
  });
});
