import {describe, expect, test} from 'vitest';

import {doRectanglesIntersect} from '../source/utilities/doRectanglesIntersect.js';

describe('doRectanglesIntersect', () => {
  test.each([
    // Rectangles intersect
    {
      label: '#1',
      x1: 0,
      y1: 0,
      width1: 10,
      height1: 10,
      x2: 5,
      y2: 5,
      width2: 10,
      height2: 10,
      expected: true,
    },
    {
      label: '#2',
      x1: -5,
      y1: -5,
      width1: 10,
      height1: 10,
      x2: 0,
      y2: 0,
      width2: 5,
      height2: 5,
      expected: true,
    },
    {
      label: '#3',
      x1: 0,
      y1: 0,
      width1: 10,
      height1: 10,
      x2: 10,
      y2: 10,
      width2: 5,
      height2: 5,
      expected: true,
    },

    // Rectangles do not intersect
    {
      label: '#4',
      x1: 0,
      y1: 0,
      width1: 10,
      height1: 10,
      x2: 15,
      y2: 15,
      width2: 10,
      height2: 10,
      expected: false,
    },
    {
      label: '#5',
      x1: 0,
      y1: 0,
      width1: 10,
      height1: 10,
      x2: 20,
      y2: 0,
      width2: 10,
      height2: 10,
      expected: false,
    },
    {
      label: '#6',
      x1: 0,
      y1: 0,
      width1: 10,
      height1: 10,
      x2: -10,
      y2: -10,
      width2: 5,
      height2: 5,
      expected: false,
    },
  ])(
    'should return the expected result for $label',
    ({x1, y1, width1, height1, x2, y2, width2, height2, expected}) => {
      expect(doRectanglesIntersect(x1, y1, width1, height1, x2, y2, width2, height2)).toBe(
        expected,
      );
    },
  );
});
