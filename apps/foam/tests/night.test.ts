import {describe, expect, test} from 'vitest';

import {
  addDrinks,
  createNight,
  formatStatus,
  getDrunkenness,
  roll,
} from '../source/game/core/night.js';

const START = {place: 'zidenice', minutes: 1020, money: 350} as const;

describe('night', () => {
  test("createNight returns the start's values, sober at the start's minutes, before any roll", () => {
    expect(createNight(START)).toEqual({
      minutes: 1020,
      money: 350,
      place: 'zidenice',
      leaving: null,
      drunkenness: {level: 0, at: 1020},
      roll: null,
      random: Math.random,
      log: [],
    });
  });

  test('createNight starts at the given level', () => {
    expect(createNight({...START, drunkenness: 2.5}).drunkenness).toEqual({level: 2.5, at: 1020});
  });

  test('createNight returns a separate object on each call', () => {
    let first = createNight(START);
    let second = createNight(START);

    first.money = 0;

    expect(second.money).toBe(350);
  });

  test('getDrunkenness falls one drink an hour and stops at 0', () => {
    let night = {...createNight(START), minutes: 1180};

    addDrinks(night, 2);

    expect(getDrunkenness(night)).toBe(2);

    night.minutes = 1210;

    expect(getDrunkenness(night)).toBe(1.5);

    night.minutes = 1300;

    expect(getDrunkenness(night)).toBe(0);

    night.minutes = 1400;

    expect(getDrunkenness(night)).toBe(0);
  });

  test('addDrinks adds to the level now and moves the mark to now', () => {
    let night = {...createNight(START), minutes: 1180};

    addDrinks(night, 2);

    expect(night.drunkenness).toEqual({level: 2, at: 1180});

    night.minutes = 1210;
    addDrinks(night, 1);

    expect(night.drunkenness).toEqual({level: 2.5, at: 1210});

    night.minutes = 1400;
    addDrinks(night, 1);

    expect(night.drunkenness).toEqual({level: 1, at: 1400});
  });

  test('roll writes the value, the odds and whether it won', () => {
    let night = {...createNight(START), random: () => 0.25};

    roll(night, 0.4);

    expect(night.roll).toEqual({value: 0.25, odds: 0.4, won: true});

    roll(night, 0.25);

    expect(night.roll).toEqual({value: 0.25, odds: 0.25, won: false});
  });

  test('odds of 1 or more always win and odds of 0 or less never', () => {
    let night = {...createNight(START), random: () => 0.999};

    roll(night, 1);

    expect(night.roll?.won).toBe(true);

    night.random = () => 0;
    roll(night, 0);

    expect(night.roll?.won).toBe(false);
  });

  test('formatStatus shows the time, the money and the level with one decimal', () => {
    let night = {...createNight(START), minutes: 1180};

    expect(formatStatus(night)).toBe('19:40   350 Kč   0.0');

    addDrinks(night, 1);
    night.minutes = 1210;

    expect(formatStatus(night)).toBe('20:10   350 Kč   0.5');
    expect(formatStatus(createNight({...START, drunkenness: 12.5}))).toBe('17:00   350 Kč   12.5');
  });

  test('formatStatus pads hours and minutes to two digits', () => {
    expect(formatStatus(createNight({...START, minutes: 545, money: 0}))).toBe(
      '09:05   0 Kč   0.0',
    );
  });

  test('formatStatus wraps past midnight', () => {
    expect(formatStatus({...createNight(START), minutes: 1470, money: 12})).toBe(
      '00:30   12 Kč   0.0',
    );
    expect(formatStatus({...createNight(START), minutes: 1440, money: 12})).toBe(
      '00:00   12 Kč   0.0',
    );
  });
});
