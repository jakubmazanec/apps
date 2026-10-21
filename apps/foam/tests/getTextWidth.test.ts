import {describe, expect, test} from 'vitest';

import {getTextWidth} from '../source/game/core/getSceneArea.js';

describe(getTextWidth, () => {
  test("is the story window's text width, or the screen's less the margins and the paddings", () => {
    expect(getTextWidth(480)).toBe(276);
    expect(getTextWidth(292)).toBe(260);
    expect(getTextWidth(146)).toBe(114);
    expect(getTextWidth(20)).toBe(1);
  });
});
