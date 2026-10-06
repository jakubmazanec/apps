import {describe, expect, test} from 'vitest';

import {getExpectedJourneys} from '../source/game/core/getExpectedJourneys.js';

const PLACES = {
  bar: {kind: 'place', nearestTramStop: {name: 'North'}},
  station: {kind: 'place', nearestTramStop: {name: 'Elsewhere'}},
  north: {kind: 'stop', tramStop: 'North'},
  south: {kind: 'stop', tramStop: 'South'},
};

function format(places: Parameters<typeof getExpectedJourneys>[0]): string[] {
  return getExpectedJourneys(places).map(({from, way, to}) => `${from} ${way} ${to}`);
}

describe(getExpectedJourneys, () => {
  test('returns the journeys the data has to hold, in order', () => {
    expect(format(PLACES)).toEqual([
      'bar walk station',
      'bar tram south',
      'bar taxi station',
      'station walk bar',
      'station tram north',
      'station tram south',
      'station taxi bar',
      'north walk bar',
      'north walk station',
      'north tram south',
      'north taxi bar',
      'north taxi station',
      'south walk bar',
      'south walk station',
      'south tram north',
      'south taxi bar',
      'south taxi station',
    ]);
  });

  test('a place without a nearest stop gets a tram journey to every stop', () => {
    let journeys = format({...PLACES, bar: {kind: 'place'}}).filter((line) =>
      line.startsWith('bar tram'),
    );

    expect(journeys).toEqual(['bar tram north', 'bar tram south']);
  });
});
