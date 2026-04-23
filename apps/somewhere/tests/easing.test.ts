import {describe, expect, test} from 'vitest';

import {
  easeInCubic,
  easeInOutCubic,
  easeInOutQuad,
  easeInOutSine,
  easeInQuad,
  easeOutCubic,
  easeOutQuad,
  type Easing,
  linear,
} from '../source/engine/scheduler/easing.js';

let all: Array<[string, Easing]> = [
  ['linear', linear],
  ['easeInQuad', easeInQuad],
  ['easeOutQuad', easeOutQuad],
  ['easeInOutQuad', easeInOutQuad],
  ['easeInCubic', easeInCubic],
  ['easeOutCubic', easeOutCubic],
  ['easeInOutCubic', easeInOutCubic],
  ['easeInOutSine', easeInOutSine],
];

describe('easing', () => {
  test.each(all)('%s maps 0 -> 0 and 1 -> 1', (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 10);
    expect(fn(1)).toBeCloseTo(1, 10);
  });

  test.each(all)('%s stays within [0, 1] across the domain', (_name, fn) => {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      let v = fn(Math.min(t, 1));

      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('known midpoints', () => {
    expect(linear(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInQuad(0.5)).toBeCloseTo(0.25, 10);
    expect(easeOutQuad(0.5)).toBeCloseTo(0.75, 10);
    expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInCubic(0.5)).toBeCloseTo(0.125, 10);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 10);
  });
});
