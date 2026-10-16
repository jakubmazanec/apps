import {describe, expect, test} from 'vitest';

import {fitMapFrame, toMapPixel} from '../source/game/core/fitMapFrame.js';

let points = [
  {x: -300, y: -200},
  {x: 300, y: -200},
  {x: 0, y: 300},
];

describe(fitMapFrame, () => {
  test('fits the box into the room less the inset', () => {
    let frame = fitMapFrame(points, 163, 223, 8);

    expect(frame.centre).toEqual({x: 0, y: 50});
    expect(frame.metresPerPixel).toBeCloseTo(600 / 147, 9);

    for (let point of points) {
      let pixel = toMapPixel(frame, point);

      expect(pixel.x).toBeGreaterThanOrEqual(8);
      expect(pixel.x).toBeLessThanOrEqual(155);
      expect(pixel.y).toBeGreaterThanOrEqual(8);
      expect(pixel.y).toBeLessThanOrEqual(215);
    }
  });

  test('the larger direction decides the scale', () => {
    let narrow = fitMapFrame(points, 163, 100, 8);
    let wide = fitMapFrame(points, 300, 100, 8);

    expect(narrow.metresPerPixel).toBeCloseTo(500 / 84, 9);
    expect(wide.metresPerPixel).toBeCloseTo(500 / 84, 9);
    expect(wide.width * wide.metresPerPixel).toBeGreaterThan(narrow.width * narrow.metresPerPixel);
  });

  test('one point gets 10 metres per pixel', () => {
    let frame = fitMapFrame([{x: 10, y: 20}], 50, 50, 8);

    expect(frame.centre).toEqual({x: 10, y: 20});
    expect(frame.metresPerPixel).toBe(10);
  });

  test('a room of less than 1 pixel counts as 1', () => {
    expect(fitMapFrame(points, 10, 10, 8).metresPerPixel).toBe(600);
  });
});

describe(toMapPixel, () => {
  test('rounds around the middle of the map', () => {
    let frame = {width: 100, height: 50, metresPerPixel: 2, centre: {x: 0, y: 0}};

    expect(toMapPixel(frame, {x: 10, y: -4})).toEqual({x: 55, y: 23});
  });
});
