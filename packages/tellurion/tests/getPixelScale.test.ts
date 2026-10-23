import {describe, expect, test} from 'vitest';

import {getPixelScale} from '../source/app/getPixelScale.js';

describe(getPixelScale, () => {
  test('gives 4 on a 1920 × 1080 screen', () => {
    expect(getPixelScale(1920, 1080)).toBe(4);
  });

  test('lets the height decide on a wide screen', () => {
    expect(getPixelScale(1366, 768)).toBe(3); // 6.83 and 2.84
    expect(getPixelScale(1100, 620)).toBe(2); // 5.5 and 2.30
  });

  test('lets the width decide on a tall screen', () => {
    expect(getPixelScale(1170, 2100)).toBe(6); // 5.85 and 7.78
    expect(getPixelScale(1081, 2402)).toBe(5); // 5.41 and 8.9
    expect(getPixelScale(720, 1280)).toBe(4); // 3.6 and 4.74
  });

  test('rounds to the nearest whole number', () => {
    expect(getPixelScale(1100, 2100)).toBe(6); // 5.5
    expect(getPixelScale(1090, 2100)).toBe(5); // 5.45
  });

  test('keeps a tiny screen at 2', () => {
    expect(getPixelScale(200, 200)).toBe(2);
  });

  test('keeps a huge screen at 8', () => {
    expect(getPixelScale(7680, 4320)).toBe(8);
  });
});
