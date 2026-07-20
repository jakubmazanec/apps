import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Vector} from '../source/engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from '../source/game/getPositionForBoundingBoxCenter.js';

describe('getPositionForBoundingBoxCenter', () => {
  test('centers the player box (0, 10, 16, 10) on a point', () => {
    // The demo spawn: centering on (152, 175) reproduces the old hardcoded
    // start position (144, 160).
    let position = getPositionForBoundingBoxCenter(
      new Vector(152, 175),
      new pixi.Rectangle(0, 10, 16, 10),
    );

    expect(position.x).toBe(144);
    expect(position.y).toBe(160);
  });

  test('an offset-free box centers symmetrically', () => {
    let position = getPositionForBoundingBoxCenter(
      new Vector(10, 10),
      new pixi.Rectangle(0, 0, 8, 8),
    );

    expect(position.x).toBe(6);
    expect(position.y).toBe(6);
  });
});
