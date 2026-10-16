import {describe, expect, test} from 'vitest';

import {getMapPoint, getMapPosition} from '../source/game/core/getMapPoint.js';

let origin = {latitude: 49.2, longitude: 16.6};

describe(getMapPoint, () => {
  test('the origin is the zero point', () => {
    expect(getMapPoint(origin, origin)).toEqual({x: 0, y: 0});
  });

  test('north is negative y', () => {
    let point = getMapPoint(
      {latitude: origin.latitude + 0.001, longitude: origin.longitude},
      origin,
    );

    expect(point.y).toBeCloseTo(-111.132, 3);
    expect(point.x).toBe(0);
  });

  test('east is positive x, scaled by the latitude', () => {
    let point = getMapPoint(
      {latitude: origin.latitude, longitude: origin.longitude + 0.001},
      origin,
    );

    expect(point.x).toBeCloseTo(111.32 * Math.cos((49.2 * Math.PI) / 180), 6);
  });
});

describe(getMapPosition, () => {
  test('is the inverse of getMapPoint', () => {
    let position = {latitude: 49.21186, longitude: 16.63002};
    let back = getMapPosition(getMapPoint(position, origin), origin);

    expect(back.latitude).toBeCloseTo(position.latitude, 9);
    expect(back.longitude).toBeCloseTo(position.longitude, 9);
  });
});
