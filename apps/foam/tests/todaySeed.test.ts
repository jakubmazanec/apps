import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

import {formatDate, todaySeed} from '../source/game/core/todaySeed.js';

describe(todaySeed, () => {
  beforeEach(() => {
    vitest.useFakeTimers();
  });

  afterEach(() => {
    vitest.useRealTimers();
  });

  test('is the date in local time as one number', () => {
    vitest.setSystemTime(new Date(2026, 9, 25, 23, 30));

    expect(todaySeed()).toBe(20261025);
  });

  test('pads the month and the day', () => {
    vitest.setSystemTime(new Date(2027, 0, 1));

    expect(todaySeed()).toBe(20270101);
  });

  test('reads the clock at each call', () => {
    vitest.setSystemTime(new Date(2026, 9, 25, 23, 59));

    expect(todaySeed()).toBe(20261025);

    vitest.setSystemTime(new Date(2026, 9, 26, 0, 0));

    expect(todaySeed()).toBe(20261026);
  });
});

describe(formatDate, () => {
  test("writes the day, the month's short name and the year", () => {
    expect(formatDate(20261027)).toBe('27 Oct 2026');
    expect(formatDate(20270101)).toBe('1 Jan 2027');
  });
});
