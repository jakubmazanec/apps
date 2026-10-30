import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {createNight, findStory, type Night} from '../source/game/core/night.js';
import {type PastNight} from '../source/game/core/nights.js';
import {FIXED_BAR} from './fixedWorld.js';

const NIGHTS_KEY = 'foam:nights';
const RECORD = {
  past: [{seed: 7, date: 20261026, ending: 'stranded', stories: ['A']}],
  day: {date: 20261027, started: 2},
};
// nights.ts hydrates at module load, so each test re-imports a fresh copy after seeding
// localStorage, as stories.browser.test.ts does; see settings.browser.test.ts for why the
// specifier is a variable with a query and the real .ts extension.
let nightsImport = 0;

interface NightsModule {
  countStart: (date: number) => void;
  forgetNights: () => void;
  getNextSeed: (date: number) => number;
  nights: {past: PastNight[]; day: {date: number; started: number}};
  recordNight: (night: Night, date: number) => void;
}

async function importNights() {
  nightsImport += 1;

  return import(
    /* @vite-ignore */ `../source/game/core/nights.ts?fresh=${nightsImport}`
  ) as Promise<NightsModule>;
}

describe('the record of nights', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('nothing stored gives no nights and no start', async () => {
    let {nights} = await importNights();

    expect(nights).toEqual({past: [], day: {date: 0, started: 0}});
  });

  test('a stored record loads', async () => {
    localStorage.setItem(NIGHTS_KEY, JSON.stringify(RECORD));

    let {nights} = await importNights();

    expect(nights).toEqual(RECORD);
  });

  test('a bad list loads empty and keeps the count', async () => {
    localStorage.setItem(NIGHTS_KEY, JSON.stringify({past: 'x', day: RECORD.day}));

    let {nights} = await importNights();

    expect(nights).toEqual({past: [], day: RECORD.day});
  });

  test('a bad count loads as no start and keeps the list', async () => {
    let past = [{seed: 7, date: 20261026, ending: null, stories: []}];

    localStorage.setItem(NIGHTS_KEY, JSON.stringify({past, day: 'x'}));

    let {nights} = await importNights();

    expect(nights).toEqual({past, day: {date: 0, started: 0}});
  });

  test('recordNight appends the seed, the date, the ending and the titles, and saves', async () => {
    let {nights, recordNight} = await importNights();
    let night = createNight({seed: 7, place: FIXED_BAR, minutes: 1920, money: 50});

    night.ending = 'stay';
    findStory(night, 'A story');
    recordNight(night, 20261027);

    let past = {seed: 7, date: 20261027, ending: 'stay', stories: ['A story']};

    expect(nights.past).toEqual([past]);
    expect(JSON.parse(localStorage.getItem(NIGHTS_KEY) ?? '')).toEqual({
      past: [past],
      day: {date: 0, started: 0},
    });
  });

  test('countStart starts at 1 on a new date, adds one on the same, and saves in place', async () => {
    let {countStart, nights} = await importNights();
    let {day} = nights;

    countStart(20261027);

    expect(day).toEqual({date: 20261027, started: 1});

    countStart(20261027);

    expect(day).toEqual({date: 20261027, started: 2});

    countStart(20261028);

    let {day: dayAfter} = nights;

    expect(day).toEqual({date: 20261028, started: 1});
    expect(dayAfter).toBe(day);
    expect(JSON.parse(localStorage.getItem(NIGHTS_KEY) ?? '')).toEqual({past: [], day});
  });

  test('getNextSeed is the date with no start on it, and the date followed by the next number after', async () => {
    let {countStart, getNextSeed} = await importNights();

    expect(getNextSeed(20261027)).toBe(20261027);

    countStart(20261027);

    expect(getNextSeed(20261027)).toBe(202610272);

    countStart(20261027);

    expect(getNextSeed(20261027)).toBe(202610273);
    expect(getNextSeed(20261028)).toBe(20261028);
  });

  test('forgetNights empties both in place and removes the key', async () => {
    localStorage.setItem(NIGHTS_KEY, JSON.stringify(RECORD));

    let {forgetNights, nights} = await importNights();
    let {day, past} = nights;

    forgetNights();

    let {day: dayAfter, past: pastAfter} = nights;

    expect(past).toEqual([]);
    expect(day).toEqual({date: 0, started: 0});
    expect(pastAfter).toBe(past);
    expect(dayAfter).toBe(day);
    expect(localStorage.getItem(NIGHTS_KEY)).toBeNull();
  });
});
