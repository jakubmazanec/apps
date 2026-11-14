import {describe, expect, test} from 'vitest';

import {expandFrame, fitPanel} from '../source/shell/present.js';

describe(fitPanel, () => {
  test.each([
    [{width: 1920, height: 1000}, 1, {zoom: 1, cssWidth: 1622, cssHeight: 647, exact: true}],
    [{width: 1920, height: 1000}, 2, {zoom: 2, cssWidth: 1622, cssHeight: 647, exact: true}],
    [{width: 1366, height: 700}, 1, {zoom: 1, cssWidth: 1622, cssHeight: 647, exact: true}],
    [
      {width: 1920, height: 1000},
      1.25,
      {zoom: 1, cssWidth: 1297.6, cssHeight: 517.6, exact: false},
    ],
    [{width: 3300, height: 1400}, 1, {zoom: 2, cssWidth: 3244, cssHeight: 1294, exact: true}],
    [{width: 4000, height: 1000}, 1, {zoom: 1, cssWidth: 1622, cssHeight: 647, exact: true}],
    [
      {width: 1000, height: 400},
      3,
      {zoom: 1, cssWidth: 540.6666666666666, cssHeight: 215.66666666666666, exact: true},
    ],
  ])(
    'the panel in %o at %d takes the largest whole zoom that fits',
    (viewport, ratio, expected) => {
      expect(fitPanel(viewport, ratio)).toEqual(expected);
    },
  );
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
