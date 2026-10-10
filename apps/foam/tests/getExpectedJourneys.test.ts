import {describe, expect, test} from 'vitest';

import {getExpectedJourneys} from '../source/game/core/getExpectedJourneys.js';

const ENTRIES = {
  bar: {},
  station: {tramStop: 'Main'},
  north: {tramStop: 'North'},
  south: {tramStop: 'South'},
};

function format(entries: Parameters<typeof getExpectedJourneys>[0]): string[] {
  return getExpectedJourneys(entries).map(({from, way, to}) => `${from} ${way} ${to}`);
}

describe(getExpectedJourneys, () => {
  test('returns the journeys the data has to hold, in order', () => {
    expect(format(ENTRIES)).toEqual([
      'bar walk station',
      'bar walk north',
      'bar walk south',
      'bar taxi station',
      'bar taxi north',
      'bar taxi south',
      'station walk bar',
      'station walk north',
      'station walk south',
      'station tram north',
      'station tram south',
      'station taxi bar',
      'station taxi north',
      'station taxi south',
      'north walk bar',
      'north walk station',
      'north walk south',
      'north tram station',
      'north tram south',
      'north taxi bar',
      'north taxi station',
      'north taxi south',
      'south walk bar',
      'south walk station',
      'south walk north',
      'south tram station',
      'south tram north',
      'south taxi bar',
      'south taxi station',
      'south taxi north',
    ]);
  });

  test('an entry without a tramStop has no tram journey, to or from', () => {
    let lines = format(ENTRIES).filter((line) => line.includes('tram'));

    expect(lines.filter((line) => line.includes('bar'))).toEqual([]);
  });
});
