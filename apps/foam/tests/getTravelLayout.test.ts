import {describe, expect, test} from 'vitest';

import {getMapSize, getTravelLayout} from '../source/game/core/getTravelLayout.js';

describe(getTravelLayout, () => {
  test.each([
    {
      screen: [195, 350],
      kind: 'stacked',
      window: [187, 342],
      controlWidth: 163,
      isNarrow: true,
      map: [163, 223],
    },
    {
      screen: [146, 262],
      kind: 'stacked',
      window: [138, 254],
      controlWidth: 114,
      isNarrow: true,
      map: [114, 135],
    },
    {
      screen: [480, 270],
      kind: 'sideBySide',
      window: [472, 262],
      controlWidth: 120,
      isNarrow: true,
      map: [320, 227],
    },
    {
      screen: [350, 195],
      kind: 'sideBySide',
      window: [342, 187],
      controlWidth: 120,
      isNarrow: true,
      map: [190, 152],
    },
    {
      screen: [300, 300],
      kind: 'stacked',
      window: [292, 292],
      controlWidth: 268,
      isNarrow: false,
      map: [268, 173],
    },
  ])('$screen', ({screen, kind, window, controlWidth, isNarrow, map}) => {
    let layout = getTravelLayout(screen[0]!, screen[1]!);

    expect(layout).toEqual({
      kind,
      window: {width: window[0], height: window[1]},
      controlWidth,
      isNarrow,
    });
    expect(getMapSize(layout, 28)).toEqual({width: map[0], height: map[1]});
  });

  test('a tiny screen gives a map of 1 x 1', () => {
    expect(getMapSize(getTravelLayout(20, 20), 28)).toEqual({width: 1, height: 1});
  });
});
