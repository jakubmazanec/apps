import {describe, expect, test} from 'vitest';

import {dragClicks, isPush, PIXELS_PER_CLICK, wheelClicks} from '../source/shell/knob.js';

describe(dragClicks, () => {
  test('4 px per click, up is positive', () => {
    expect(PIXELS_PER_CLICK).toBe(4);
    expect(dragClicks(100, 91)).toBe(2);
    expect(dragClicks(100, 103)).toBe(0);
    expect(dragClicks(100, 108)).toBe(-2);
  });

  test('a click needs all 4 px and the start gives no click', () => {
    expect(dragClicks(100, 100)).toBe(0);
    expect(dragClicks(100, 97)).toBe(0);
    expect(dragClicks(100, 96)).toBe(1);
    expect(dragClicks(100, 104)).toBe(-1);
    expect(dragClicks(100, 100.5)).toBe(0);
    expect(dragClicks(100, 99.5)).toBe(0);
  });

  test('a long drag gives more clicks than the core takes in one input', () => {
    expect(dragClicks(600, 0)).toBe(150);
  });
});

describe(wheelClicks, () => {
  test('the wheel adds up 100 px per click', () => {
    let first = wheelClicks(0, {deltaY: -40, deltaMode: 0});
    let second = wheelClicks(first.rest, {deltaY: -40, deltaMode: 0});
    let third = wheelClicks(second.rest, {deltaY: -40, deltaMode: 0});

    expect([first, second, third]).toStrictEqual([
      {clicks: 0, rest: -40},
      {clicks: 0, rest: -80},
      {clicks: 1, rest: -20},
    ]);
  });

  test('down is negative', () => {
    expect(wheelClicks(0, {deltaY: 100, deltaMode: 0})).toStrictEqual({clicks: -1, rest: 0});
    expect(wheelClicks(60, {deltaY: 60, deltaMode: 0})).toStrictEqual({clicks: -1, rest: 20});
  });

  test('a turn the other way first cancels the rest', () => {
    expect(wheelClicks(-80, {deltaY: 30, deltaMode: 0})).toStrictEqual({clicks: 0, rest: -50});
  });

  test('3 lines are one click', () => {
    expect(wheelClicks(0, {deltaY: -3, deltaMode: 1})).toStrictEqual({clicks: 1, rest: 0});
    expect(wheelClicks(0, {deltaY: 3, deltaMode: 1})).toStrictEqual({clicks: -1, rest: 0});
    expect(wheelClicks(0, {deltaY: 6, deltaMode: 1})).toStrictEqual({clicks: -2, rest: 0});

    let rest = 0;
    let clicks = 0;

    for (let line = 0; line < 3; line++) {
      ({clicks, rest} = wheelClicks(rest, {deltaY: 1, deltaMode: 1}));
    }

    expect(clicks).toBe(-1);
    expect(Math.abs(rest)).toBeLessThan(1e-9);
  });

  test('a page delta moves nothing', () => {
    expect(wheelClicks(-40, {deltaY: 1, deltaMode: 2})).toStrictEqual({clicks: 0, rest: -40});
  });
});

describe(isPush, () => {
  test('a release without movement and clicks is a push', () => {
    expect(isPush(0, 0)).toBe(true);
    expect(isPush(3.9, 0)).toBe(true);
  });

  test('4 px of movement or a click makes it a drag', () => {
    expect(isPush(4, 0)).toBe(false);
    expect(isPush(3, 1)).toBe(false);
    expect(isPush(20, -2)).toBe(false);
  });
});
