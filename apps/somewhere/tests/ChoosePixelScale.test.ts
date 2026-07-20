import {describe, expect, test} from 'vitest';

import {defaultChoosePixelScale} from '../source/engine/app/ChoosePixelScale.js';

describe('defaultChoosePixelScale', () => {
  test('reproduces the ×4 feel on a 1080p DPR-1 viewport', () => {
    expect(defaultChoosePixelScale({width: 1920, height: 1080})).toBe(4);
  });

  test('rounds to the nearest integer scale', () => {
    expect(defaultChoosePixelScale({width: 1366, height: 768})).toBe(3); // 2.84 → 3
    expect(defaultChoosePixelScale({width: 1280, height: 620})).toBe(2); // 2.30 → 2
  });

  test('clamps tiny viewports to 2', () => {
    expect(defaultChoosePixelScale({width: 320, height: 200})).toBe(2); // 0.74 → 1 → clamped
  });

  test('clamps huge viewports to 8', () => {
    expect(defaultChoosePixelScale({width: 3840, height: 4320})).toBe(8); // 16 → clamped
  });
});
