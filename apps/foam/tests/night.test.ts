import {describe, expect, test} from 'vitest';

import {createNight, formatStatus} from '../source/game/core/night.js';

describe('night', () => {
  test('createNight returns the starting values', () => {
    expect(createNight()).toEqual({minutes: 1180, money: 350, stateOfMind: 'Sober'});
  });

  test('createNight returns a separate object on each call', () => {
    let first = createNight();
    let second = createNight();

    first.money = 0;

    expect(second.money).toBe(350);
  });

  test('formatStatus shows the time, the money and the state of mind', () => {
    expect(formatStatus(createNight())).toBe('19:40   350 Kč   Sober');
  });

  test('formatStatus pads hours and minutes to two digits', () => {
    expect(formatStatus({minutes: 545, money: 0, stateOfMind: 'Tired'})).toBe(
      '09:05   0 Kč   Tired',
    );
  });

  test('formatStatus wraps past midnight', () => {
    expect(formatStatus({minutes: 1470, money: 12, stateOfMind: 'Tipsy'})).toBe(
      '00:30   12 Kč   Tipsy',
    );
    expect(formatStatus({minutes: 1440, money: 12, stateOfMind: 'Tipsy'})).toBe(
      '00:00   12 Kč   Tipsy',
    );
  });
});
