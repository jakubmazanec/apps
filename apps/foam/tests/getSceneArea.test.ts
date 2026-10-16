import {describe, expect, test} from 'vitest';

import {getLabelRoom} from '../source/game/core/getLabelRoom.js';
import {
  BUTTON_PADDING_X,
  getSceneArea,
  GLYPH_WIDTH,
  MARGIN,
  MENU_BUTTON_WIDTH,
  STATUS_ROOM,
  TOP_ROW_WIDTH,
} from '../source/game/core/getSceneArea.js';
import {createNight, formatStatus} from '../source/game/core/night.js';

describe(getSceneArea, () => {
  test('a wide screen has a one-line top row', () => {
    expect(getSceneArea(480, 270)).toEqual({top: 24, width: 480, height: 246});
  });

  test('a narrow screen has a two-line top row', () => {
    expect(getSceneArea(146, 262)).toEqual({top: 40, width: 146, height: 222});
  });

  test('a screen exactly 292 wide has the one-line top row', () => {
    expect(getSceneArea(292, 270).top).toBe(24);
    expect(getSceneArea(291, 270).top).toBe(40);
  });
});

describe('TOP_ROW_WIDTH', () => {
  test('holds the widest place button, the status line and Menu', () => {
    let placeButtonWidth = getLabelRoom().placeButton * GLYPH_WIDTH + 2 * BUTTON_PADDING_X;

    expect(placeButtonWidth).toBe(96);
    expect(STATUS_ROOM * GLYPH_WIDTH).toBe(144);
    expect(MENU_BUTTON_WIDTH).toBe(36);
    expect(TOP_ROW_WIDTH).toBe(
      MARGIN +
        placeButtonWidth +
        MARGIN +
        STATUS_ROOM * GLYPH_WIDTH +
        MARGIN +
        MENU_BUTTON_WIDTH +
        MARGIN,
    );
    expect(TOP_ROW_WIDTH).toBe(292);
  });

  test('the status room holds the money to four digits with a sign and the level with one decimal', () => {
    let night = createNight({place: 'train', minutes: 1020, money: -1350, drunkenness: 12.5});

    expect(formatStatus(night)).toBe('17:00   -1350 Kč   12.5');
    expect(formatStatus(night).length).toBeLessThanOrEqual(STATUS_ROOM);
  });
});
