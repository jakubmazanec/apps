import {describe, expect, test} from 'vitest';

import {getLabelRoom} from '../source/game/core/getLabelRoom.js';

describe(getLabelRoom, () => {
  test('on the narrowest screen', () => {
    expect(getLabelRoom()).toEqual({title: 19, placeButton: 14, sceneButton: 21});
  });

  test('on a wide screen', () => {
    expect(getLabelRoom(480)).toEqual({title: 46, placeButton: 70, sceneButton: 76});
  });
});
