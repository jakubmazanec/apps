import {describe, expect, test} from 'vitest';

import {createNight, formatStatus} from '../source/game/core/night.js';

const START = {place: 'zidenice', minutes: 1020, money: 350} as const;

describe('night', () => {
  test("createNight returns the start's values, a sober state of mind and no leaving", () => {
    expect(createNight(START)).toEqual({
      minutes: 1020,
      money: 350,
      stateOfMind: 'Sober',
      place: 'zidenice',
      leaving: null,
    });
  });

  test('createNight returns a separate object on each call', () => {
    let first = createNight(START);
    let second = createNight(START);

    first.money = 0;

    expect(second.money).toBe(350);
  });

  test('formatStatus shows the time, the money and the state of mind', () => {
    expect(formatStatus({...createNight(START), minutes: 1180})).toBe('19:40   350 Kč   Sober');
  });

  test('formatStatus pads hours and minutes to two digits', () => {
    expect(
      formatStatus({...createNight(START), minutes: 545, money: 0, stateOfMind: 'Tired'}),
    ).toBe('09:05   0 Kč   Tired');
  });

  test('formatStatus wraps past midnight', () => {
    expect(
      formatStatus({...createNight(START), minutes: 1470, money: 12, stateOfMind: 'Tipsy'}),
    ).toBe('00:30   12 Kč   Tipsy');
    expect(
      formatStatus({...createNight(START), minutes: 1440, money: 12, stateOfMind: 'Tipsy'}),
    ).toBe('00:00   12 Kč   Tipsy');
  });
});
