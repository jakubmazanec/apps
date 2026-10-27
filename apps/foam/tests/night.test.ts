import {describe, expect, test, vitest} from 'vitest';

import {hash} from '../source/game/core/hash.js';
import {
  addDrinks,
  createNight,
  formatStatus,
  getDrunkenness,
  hasMet,
  meet,
  type Night,
  roll,
} from '../source/game/core/night.js';

const START = {seed: 7, place: 'zidenice', minutes: 1020, money: 350} as const;
const RANGE = {min: 300, max: 500, step: 50};
const ODDS = {a: 0.5, b: 0.3, c: 0.2};

describe('night', () => {
  test("createNight returns the start's values, sober at the start's minutes, before any roll", () => {
    expect(createNight(START)).toEqual({
      seed: 7,
      rolls: 0,
      random: expect.any(Function) as unknown,
      pick: expect.any(Function) as unknown,
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
      events: [],
    });
  });

  test('random is the hash of the seed and the keys', () => {
    expect(createNight(START).random('money')).toBe(hash(7, 'money'));
    expect(createNight(START).random('roll', 3)).toBe(hash(7, 'roll', 3));
    expect(createNight({...START, seed: 8}).random('money')).toBe(hash(8, 'money'));
  });

  test("random keeps the seed the night was made with when the start's seed changes later", () => {
    let start: Parameters<typeof createNight>[0] = {...START};
    let night = createNight(start);

    start.seed = 8;

    expect(night.random('money')).toBe(hash(7, 'money'));
    expect(night.seed).toBe(7);
  });

  test('pick holds random against the odds in their written order', () => {
    let night = createNight(START);

    for (let [value, name] of [
      [0, 'a'],
      [0.49, 'a'],
      [0.5, 'b'],
      [0.79, 'b'],
      [0.8, 'c'],
      [0.99, 'c'],
    ] as const) {
      night.random = () => value;

      expect(night.pick('key', ODDS)).toBe(name);
    }
  });

  test('pick reads random once, with the key', () => {
    let night = createNight(START);

    night.random = vitest.fn<Night['random']>(() => 0.1);
    night.pick('cornerTable', ODDS);

    expect(night.random).toHaveBeenCalledTimes(1);
    expect(night.random).toHaveBeenCalledWith('cornerTable');
  });

  test('the same key gives the same name all night, and every name comes up over fifty seeds', () => {
    let night = createNight(START);
    let names = new Set<string>();

    for (let seed = 0; seed < 50; seed++) {
      names.add(createNight({...START, seed}).pick('friend', ODDS));
    }

    expect(night.pick('friend', ODDS)).toBe(night.pick('friend', ODDS));
    expect(night.pick('friend', ODDS)).toBe(createNight(START).pick('friend', ODDS));
    expect(names).toEqual(new Set(['a', 'b', 'c']));
  });

  test('the last name takes a sum just under 1', () => {
    let night = createNight(START);

    night.random = () => 0.9999999;

    expect(night.pick('key', {a: 0.5, b: 0.4999999})).toBe('b');

    night.random = () => 0.9999999999999999;

    expect(night.pick('key', {a: 0.7, b: 0.2, c: 0.1})).toBe('c');
  });

  test('events starts empty, or as the start lists them, in a list of its own', () => {
    let events = ['wallet'];
    let night = createNight({...START, events});

    expect(createNight(START).events).toEqual([]);
    expect(night.events).toEqual(['wallet']);

    meet(night, 'drunk');

    expect(events).toEqual(['wallet']);
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

describe(meet, () => {
  test('adds the key once', () => {
    let night = createNight(START);

    meet(night, 'wallet');
    meet(night, 'wallet');
    meet(night, 'drunk');

    expect(night.events).toEqual(['wallet', 'drunk']);
  });
});

describe(hasMet, () => {
  test('is false before meet and true after, by the key', () => {
    let night = createNight(START);

    expect(hasMet(night, 'wallet')).toBe(false);

    meet(night, 'wallet');

    expect(hasMet(night, 'wallet')).toBe(true);
    expect(hasMet(night, 'drunk')).toBe(false);
  });
});
