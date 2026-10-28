import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {createNight} from '../source/game/core/night.js';
import {
  type clearSavedNight as clearSavedNightValue,
  type loadSavedNight as loadSavedNightValue,
  type SavedNight,
  type saveNight as saveNightValue,
} from '../source/game/core/save.js';
import {FIXED_BAR, fixedPlaces} from './fixedWorld.js';

const NIGHT_KEY = 'foam:night';
const SAVED: SavedNight = {
  seed: 7,
  rolls: 1,
  minutes: 1300,
  money: 120,
  place: FIXED_BAR,
  drunkenness: {level: 2, at: 1300},
  roll: {value: 0.25, odds: 0.5, won: true},
  log: [
    {kind: 'text', minutes: 1300, speaker: 'The bar', text: 'A line.'},
    {kind: 'text', minutes: 1300, speaker: undefined, text: 'A line with no one to say it.'},
    {kind: 'choice', minutes: 1300, text: 'Order a beer'},
  ],
  stories: [{title: 'A story', minutes: 1300}],
  quest: {hasBottle: false, bottleGiven: false, hasKeys: true, hasTicket: false},
  events: ['wallet'],
  ending: 'stay',
};

describe('the saved night', () => {
  let clearSavedNight: typeof clearSavedNightValue;
  let loadSavedNight: typeof loadSavedNightValue;
  let saveNight: typeof saveNightValue;

  beforeAll(async () => {
    ({clearSavedNight, loadSavedNight, saveNight} = await import('../source/game/core/save.js'));
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  afterAll(() => {
    localStorage.clear();
  });

  test('nothing stored gives null', () => {
    expect(loadSavedNight(fixedPlaces)).toBeNull();
  });

  test('a night saved and loaded is the same data, a text without a speaker included', () => {
    saveNight({...createNight({seed: 7, place: FIXED_BAR, minutes: 960, money: 0}), ...SAVED});

    expect(JSON.parse(localStorage.getItem(NIGHT_KEY) ?? '')).toEqual(SAVED);

    let loaded = loadSavedNight(fixedPlaces);

    expect(loaded).toEqual(SAVED);
    expect(Object.hasOwn(loaded?.log[1] ?? {}, 'speaker')).toBe(true);
  });

  test('an unknown key is stripped', () => {
    localStorage.setItem(
      NIGHT_KEY,
      JSON.stringify({...SAVED, extra: 1, quest: {...SAVED.quest, hasCar: true}}),
    );

    expect(loadSavedNight(fixedPlaces)).toEqual(SAVED);
  });

  test('text that is not JSON gives null', () => {
    localStorage.setItem(NIGHT_KEY, '{"seed": 7');

    expect(loadSavedNight(fixedPlaces)).toBeNull();
  });

  test('a payload missing a field, or a log entry of an unknown kind, gives null', () => {
    localStorage.setItem(NIGHT_KEY, JSON.stringify({seed: 7}));

    expect(loadSavedNight(fixedPlaces)).toBeNull();

    localStorage.setItem(
      NIGHT_KEY,
      JSON.stringify({...SAVED, log: [{kind: 'what', minutes: 1, text: 'x'}]}),
    );

    expect(loadSavedNight(fixedPlaces)).toBeNull();
  });

  test('a place not in the content gives null with a warning', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      localStorage.setItem(NIGHT_KEY, JSON.stringify({...SAVED, place: 'nowhere'}));

      expect(loadSavedNight(fixedPlaces)).toBeNull();
      expect(warn).toHaveBeenCalledWith('The saved night is in "nowhere", which is not a place.');
    } finally {
      warn.mockRestore();
    }
  });

  test('clearSavedNight removes the key', () => {
    saveNight({...createNight({seed: 7, place: FIXED_BAR, minutes: 960, money: 0}), ...SAVED});
    clearSavedNight();

    expect(localStorage.getItem(NIGHT_KEY)).toBeNull();
  });
});
