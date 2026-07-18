import {describe, expect, test} from 'vitest';

import {doRectanglesOverlap} from '../source/utilities/doRectanglesOverlap.js';

describe('doRectanglesOverlap', () => {
  test('overlapping rectangles overlap', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBeTruthy();
  });

  test('a contained rectangle overlaps', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 2, 2, 4, 4)).toBeTruthy();
  });

  test('touching edges do not count (strict, unlike doRectanglesIntersect)', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBeFalsy();
    expect(doRectanglesOverlap(0, 0, 10, 10, 0, 10, 10, 10)).toBeFalsy();
  });

  test('separated rectangles do not overlap', () => {
    expect(doRectanglesOverlap(0, 0, 10, 10, 20, 0, 10, 10)).toBeFalsy();
    expect(doRectanglesOverlap(0, 0, 10, 10, 0, 20, 10, 10)).toBeFalsy();
  });
});
