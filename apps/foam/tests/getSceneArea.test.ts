import {describe, expect, test} from 'vitest';

import {getSceneArea} from '../source/game/core/getSceneArea.js';

describe(getSceneArea, () => {
  test('a wide screen has a one-line top row', () => {
    expect(getSceneArea(480, 270)).toEqual({top: 24, width: 480, height: 246});
  });

  test('a narrow screen has a two-line top row', () => {
    expect(getSceneArea(146, 262)).toEqual({top: 40, width: 146, height: 222});
  });

  test('a screen exactly 240 wide has the one-line top row', () => {
    expect(getSceneArea(240, 270).top).toBe(24);
    expect(getSceneArea(239, 270).top).toBe(40);
  });
});
