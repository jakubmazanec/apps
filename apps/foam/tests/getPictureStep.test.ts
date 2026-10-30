import {describe, expect, test} from 'vitest';

import {advancePictureTime, getPictureStep} from '../source/game/core/getPictureStep.js';
import {palette} from '../source/game/core/palette.js';

const PICTURE_INKS = {
  pink: 0xff6281,
  plum: 0x5e0960,
  magenta: 0xc20265,
  blue: 0x004cec,
  cyan: 0x00c9ff,
  mint: 0x00ffb3,
};

describe(advancePictureTime, () => {
  test('a frame of 100 ms at speed 1 adds 0.1 seconds', () => {
    expect(advancePictureTime(0, 100, 1)).toBeCloseTo(0.1);
  });

  test('a frame of 100 ms at speed 0.5 adds 0.05 seconds', () => {
    expect(advancePictureTime(0, 100, 0.5)).toBeCloseTo(0.05);
  });

  test('at speed 0 the time stands', () => {
    expect(advancePictureTime(2, 100, 0)).toBeCloseTo(2);
  });
});

describe(getPictureStep, () => {
  test('time 0 is step 0', () => {
    expect(getPictureStep(0)).toBe(0);
  });

  test('a time just short of a thirtieth of a second is still step 0', () => {
    expect(getPictureStep(0.999 / 30)).toBe(0);
  });

  test('a thirtieth of a second is step 1', () => {
    expect(getPictureStep(1 / 30)).toBe(1);
  });

  test('10 seconds are step 300', () => {
    expect(getPictureStep(10)).toBe(300);
  });
});

describe('palette', () => {
  test('the palette has the six inks', () => {
    expect(palette).toMatchObject(PICTURE_INKS);
    expect(Object.keys(palette).slice(-6)).toEqual(Object.keys(PICTURE_INKS));
  });
});
