import {describe, expect, test} from 'vitest';

import {getPixelScale} from '../source/engine/app/getPixelScale.js';

describe(getPixelScale, () => {
  test('reproduces the ×4 feel on a 1080p DPR-1 viewport', () => {
    expect(getPixelScale(1080)).toBe(4);
  });

  test('rounds to the nearest integer scale', () => {
    expect(getPixelScale(768)).toBe(3); // 2.84 → 3
    expect(getPixelScale(620)).toBe(2); // 2.30 → 2
  });

  test('clamps tiny viewports to 2', () => {
    expect(getPixelScale(200)).toBe(2); // 0.74 → 1 → clamped
  });

  test('clamps huge viewports to 8', () => {
    expect(getPixelScale(4320)).toBe(8); // 16 → clamped
  });
});
