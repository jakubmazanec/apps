import {describe, expect, test} from 'vitest';

import {type Map} from '../source/engine/tiled/Map.js';
import {getClampedCameraPosition} from '../source/game/getClampedCameraPosition.js';

function mapStub(width: number, height: number, x = 0, y = 0): Map {
  return {position: {x, y}, width, height} as unknown as Map;
}

describe(getClampedCameraPosition, () => {
  test('centers on the player and snaps to whole device px', () => {
    let {x, y} = getClampedCameraPosition({
      map: mapStub(640, 640),
      playerX: 100.7,
      playerY: 200.3,
      viewportWidth: 100,
      viewportHeight: 60,
      pixelScale: 2,
    });

    expect(x).toBe(Math.floor((100.7 - 50) * 2) / 2);
    expect(y).toBe(Math.floor((200.3 - 30) * 2) / 2);
  });

  test('clamps to the map edges', () => {
    let options = {map: mapStub(640, 640), viewportWidth: 100, viewportHeight: 60, pixelScale: 1};

    expect(getClampedCameraPosition({...options, playerX: 0, playerY: 0})).toEqual({x: 0, y: 0});
    expect(getClampedCameraPosition({...options, playerX: 640, playerY: 640})).toEqual({
      x: 540,
      y: 580,
    });
  });

  test('a map smaller than the viewport pins to the map origin', () => {
    expect(
      getClampedCameraPosition({
        map: mapStub(240, 192),
        playerX: 120,
        playerY: 96,
        viewportWidth: 480,
        viewportHeight: 270,
        pixelScale: 1,
      }),
    ).toEqual({x: 0, y: 0});
  });

  test('honors a non-zero map position', () => {
    expect(
      getClampedCameraPosition({
        map: mapStub(640, 640, 32, 16),
        playerX: 0,
        playerY: 0,
        viewportWidth: 100,
        viewportHeight: 60,
        pixelScale: 1,
      }),
    ).toEqual({x: 32, y: 16});
  });
});
