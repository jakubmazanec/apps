import {describe, expect, test} from 'vitest';

import {formatTime, getHoursWords, isOpenAt, isWithin} from '../source/game/core/hours.js';
import {createNight} from '../source/game/core/night.js';

const GUITARIST = [1320, 1500] as const;

function at(minutes: number): boolean {
  return isWithin(createNight({place: 'rotorBarRoom', minutes, money: 350}), GUITARIST);
}

describe(isWithin, () => {
  test('holds from the start of the span up to but not including its end', () => {
    expect(at(1319)).toBe(false);
    expect(at(1320)).toBe(true);
    expect(at(1499)).toBe(true);
    expect(at(1500)).toBe(false);
  });
});

describe(isOpenAt, () => {
  test('is always open without hours', () => {
    expect(isOpenAt(undefined, 0)).toBe(true);
    expect(isOpenAt(undefined, 2000)).toBe(true);
  });

  test('is never open with no spans', () => {
    expect(isOpenAt([], 1000)).toBe(false);
  });

  test('with one span, is open from its start up to its end', () => {
    let hours = [[960, 1620]];

    expect(isOpenAt(hours, 959)).toBe(false);
    expect(isOpenAt(hours, 960)).toBe(true);
    expect(isOpenAt(hours, 1619)).toBe(true);
    expect(isOpenAt(hours, 1620)).toBe(false);
  });

  test('with two spans, is open in either and closed between them', () => {
    let hours = [
      [960, 1380],
      [1410, 1920],
    ];

    expect(isOpenAt(hours, 1379)).toBe(true);
    expect(isOpenAt(hours, 1380)).toBe(false);
    expect(isOpenAt(hours, 1409)).toBe(false);
    expect(isOpenAt(hours, 1410)).toBe(true);
    expect(isOpenAt(hours, 1919)).toBe(true);
    expect(isOpenAt(hours, 1920)).toBe(false);
  });
});

describe(getHoursWords, () => {
  let two = [
    [960, 1380],
    [1410, 1920],
  ];

  test('says till the end of the span the minute lies in', () => {
    expect(getHoursWords([[960, 1620]], 1000)).toBe('till 03:00');
    expect(getHoursWords(two, 1500)).toBe('till 08:00');
  });

  test('says opens before a later span', () => {
    expect(getHoursWords([[990, 1260]], 960)).toBe('opens 16:30');
    expect(getHoursWords(two, 1390)).toBe('opens 23:30');
  });

  test('says closed after the last span, from the exact minute of the closing', () => {
    expect(getHoursWords([[960, 1620]], 1620)).toBe('closed');
    expect(getHoursWords([[960, 1620]], 1700)).toBe('closed');
    expect(getHoursWords([[990, 1260]], 1260)).toBe('closed');
  });

  test('says nothing without hours', () => {
    expect(getHoursWords(undefined, 1000)).toBe('');
  });
});

describe(formatTime, () => {
  test('pads hours and minutes to two digits', () => {
    expect(formatTime(545)).toBe('09:05');
    expect(formatTime(960)).toBe('16:00');
  });

  test('wraps past midnight', () => {
    expect(formatTime(1440)).toBe('00:00');
    expect(formatTime(1620)).toBe('03:00');
    expect(formatTime(1920)).toBe('08:00');
  });
});
