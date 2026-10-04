import {describe, expect, test} from 'vitest';

import {getSpotPosition} from '../source/game/core/getSpotPosition.js';

const area = {top: 24, width: 480, height: 246};
const size = {width: 52, height: 16};

describe(getSpotPosition, () => {
  test('a spot at 0.5 and 0.5 is centred in the area', () => {
    expect(getSpotPosition({x: 0.5, y: 0.5, ...size, area})).toEqual({left: 214, top: 139});
  });

  test('a spot at the left edge is moved the margin away from it', () => {
    expect(getSpotPosition({x: 0, y: 0.5, ...size, area}).left).toBe(4);
  });

  test('a spot at the right edge is moved the margin away from it', () => {
    expect(getSpotPosition({x: 1, y: 0.5, ...size, area}).left).toBe(424);
  });

  test('a spot at the bottom edge is moved the margin away from it', () => {
    expect(getSpotPosition({x: 0.5, y: 1, ...size, area}).top).toBe(250);
  });

  test('a spot at y 0 starts at the top of the area, under the top row', () => {
    expect(getSpotPosition({x: 0.5, y: 0, ...size, area}).top).toBe(24);
  });

  test('the position is in whole pixels', () => {
    let {left, top} = getSpotPosition({x: 0.33, y: 0.33, width: 51, height: 16, area});

    expect(Number.isInteger(left)).toBe(true);
    expect(Number.isInteger(top)).toBe(true);
  });

  test('a button wider than the screen starts at the left margin', () => {
    expect(getSpotPosition({x: 0.5, y: 0.5, width: 600, height: 16, area}).left).toBe(4);
  });
});
