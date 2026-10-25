import {describe, expect, test, vitest} from 'vitest';

import {hash} from '../source/game/core/hash.js';
import {
  addDrinks,
  createNight,
  formatStatus,
  getDrunkenness,
  type Night,
  roll,
} from '../source/game/core/night.js';

const START = {seed: 7, place: 'zidenice', minutes: 1020, money: 350} as const;
const RANGE = {min: 300, max: 500, step: 50};

describe('night', () => {
  test("createNight returns the start's values, sober at the start's minutes, before any roll", () => {
    expect(createNight(START)).toEqual({
      seed: 7,
      rolls: 0,
      random: expect.any(Function) as unknown,
      minutes: 1020,
      money: 350,
      place: 'zidenice',
      leaving: null,
      drunkenness: {level: 0, at: 1020},
      roll: null,
      log: [],
      collection: {titles: []},
      stories: [],
      quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false},
    });
  });

  test('random is the hash of the seed and the keys', () => {
    expect(createNight(START).random('money')).toBe(hash(7, 'money'));
    expect(createNight(START).random('roll', 3)).toBe(hash(7, 'roll', 3));
    expect(createNight({...START, seed: 8}).random('money')).toBe(hash(8, 'money'));
  });

  test('keeps a number for the money', () => {
    expect(createNight({...START, money: 120}).money).toBe(120);
  });

  test('draws the money from a range in its steps, the same for the same seed', () => {
    let draws = new Set<number>();

    for (let seed = 0; seed < 50; seed++) {
      let {money} = createNight({...START, seed, money: RANGE});

      expect(money).toBe(300 + 50 * Math.floor(hash(seed, 'money') * 5));

      draws.add(money);
    }

    expect(draws).toEqual(new Set([300, 350, 400, 450, 500]));
    expect(createNight({...START, seed: 20261025, money: RANGE}).money).toBe(300);
    expect(createNight({...START, seed: 7, money: RANGE}).money).toBe(350);
    expect(createNight({...START, seed: 20261026, money: RANGE}).money).toBe(500);
    expect(createNight({...START, seed: 7, money: RANGE}).money).toBe(
      createNight({...START, seed: 7, money: RANGE}).money,
    );
  });

  test('keeps a draw inside a range whose step does not divide it', () => {
    let draws = new Set<number>();

    for (let seed = 0; seed < 50; seed++) {
      let {money} = createNight({...START, seed, money: {min: 300, max: 500, step: 70}});

      expect([300, 370, 440]).toContain(money);

      draws.add(money);
    }

    expect(draws).toEqual(new Set([300, 370, 440]));
  });

  test('createNight keeps the flags a start names and leaves the others false', () => {
    expect(createNight({...START, quest: {hasKeys: true, hasTicket: true}}).quest).toEqual({
      hasBottle: false,
      bottleGiven: false,
      hasKeys: true,
      hasTicket: true,
    });
  });

  test('createNight holds the collection passed in', () => {
    let collection = {titles: ['A']};

    expect(createNight(START, collection).collection).toBe(collection);
  });

  test('createNight gives each night an empty collection of its own', () => {
    expect(createNight(START).collection).not.toBe(createNight(START).collection);
    expect(createNight(START).collection).toEqual({titles: []});
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

  test('roll reads the count as its key and counts', () => {
    let night = createNight(START);

    night.random = vitest.fn<Night['random']>(() => 0.25);
    roll(night, 0.4);

    expect(night.random).toHaveBeenLastCalledWith('roll', 0);
    expect(night.rolls).toBe(1);
    expect(night.roll).toEqual({value: 0.25, odds: 0.4, won: true});

    roll(night, 0.25);

    expect(night.random).toHaveBeenLastCalledWith('roll', 1);
    expect(night.rolls).toBe(2);
    expect(night.roll).toEqual({value: 0.25, odds: 0.25, won: false});
  });

  test('two nights with one seed roll alike and two seeds roll apart', () => {
    let [first, second, third] = [1, 1, 2].map((seed) => {
      let night = createNight({...START, seed});

      return Array.from({length: 3}, () => {
        roll(night, 0.5);

        return night.roll?.value;
      });
    });

    expect(first).toEqual(second);
    expect(first?.[0]).toBe(hash(1, 'roll', 0));
    expect(first).not.toEqual(third);
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
