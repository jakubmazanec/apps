import {fileURLToPath} from 'node:url';
import prettier from 'prettier';
import {describe, expect, test, vitest} from 'vitest';

import {
  fillTravelData,
  formatData,
  getDistance,
  getTaxiJourney,
  getTramJourney,
  getWalkJourney,
  readOpeningHours,
} from '../scripts/fill-travel-data.mjs';

type Position = {latitude: number; longitude: number};
type Lookups = Parameters<typeof fillTravelData>[0]['lookups'];

const BRNO = {latitude: 49.2, longitude: 16.6};

async function reject(name: string): Promise<never> {
  throw new Error(`Unexpected lookup ${name}.`);
}

/** Fakes that record their calls; anything not overridden rejects. */
function createLookups(overrides: Partial<Lookups> = {}) {
  return {
    findPositions: vitest.fn<Lookups['findPositions']>(
      overrides.findPositions ?? (async () => reject('findPositions')),
    ),
    findNamed: vitest.fn<Lookups['findNamed']>(
      overrides.findNamed ?? (async () => reject('findNamed')),
    ),
    route: vitest.fn<Lookups['route']>(overrides.route ?? (async () => reject('route'))),
  };
}

function getCalls(lookups: ReturnType<typeof createLookups>) {
  return (
    lookups.findPositions.mock.calls.length +
    lookups.findNamed.mock.calls.length +
    lookups.route.mock.calls.length
  );
}

describe(getDistance, () => {
  test('is 0 for one point twice', () => {
    expect(getDistance(BRNO, BRNO)).toBe(0);
  });

  test('is 111 195 m for one degree of latitude', () => {
    expect(getDistance({latitude: 0, longitude: 0}, {latitude: 1, longitude: 0})).toBeCloseTo(
      111_195,
      0,
    );
  });
});

describe(getWalkJourney, () => {
  test('gives the route time in minutes, at least one', () => {
    expect(getWalkJourney({metres: 2000, seconds: 1500})).toEqual({minutes: 25});
    expect(getWalkJourney({metres: 10, seconds: 20})).toEqual({minutes: 1});
  });
});

describe(getTaxiJourney, () => {
  test('adds the wait and prices the distance', () => {
    expect(getTaxiJourney({metres: 4000, seconds: 600})).toEqual({minutes: 15, price: 200});
    expect(getTaxiJourney({metres: 2500, seconds: 30})).toEqual({minutes: 6, price: 150});
  });
});

describe(getTramJourney, () => {
  test('adds the walk, the wait and the ride', () => {
    expect(getTramJourney(480, 2400)).toEqual({minutes: 23, price: 25});
    expect(getTramJourney(0, 0)).toEqual({minutes: 5, price: 25});
  });
});

describe(fillTravelData, () => {
  test('takes the mean of the points as a missing position', async () => {
    let lookups = createLookups({
      findPositions: async () => [
        {latitude: 49.1, longitude: 16.5},
        {latitude: 49.100_04, longitude: 16.500_04},
      ],
    });
    let result = await fillTravelData({
      locations: {stop: {tramStop: 'A'}},
      travel: {},
      lookups,
    });

    expect(result.locations.stop).toEqual({
      tramStop: 'A',
      position: {latitude: 49.100_02, longitude: 16.500_02},
      computed: true,
    });
    expect(result.added).toEqual(['locations.json › stop › position']);
    expect(result.missing).toEqual([]);
  });

  test('turns the opening hours of the nearest thing within 150 m into spans', async () => {
    let at = (metres: number): Position => ({
      latitude: BRNO.latitude + metres / 111_195,
      longitude: BRNO.longitude,
    });
    let locations = {bar: {osmName: 'Bar', position: BRNO}};
    let near = await fillTravelData({
      locations,
      travel: {},
      lookups: createLookups({
        findNamed: async () => [
          {position: at(200), openingHours: '24/7'},
          {position: at(100), openingHours: 'Mo-Su 16:30-21:00'},
        ],
      }),
    });
    let far = await fillTravelData({
      locations,
      travel: {},
      lookups: createLookups({
        findNamed: async () => [{position: at(200), openingHours: '24/7'}],
      }),
    });

    expect(near.locations.bar?.hours).toEqual([[990, 1260]]);
    expect(near.locations.bar?.computed).toBe(true);
    expect(near.added).toContain('locations.json › bar › hours');
    expect(far.locations.bar?.hours).toBeUndefined();
    expect(far.missing).toContain('locations.json › bar › hours');
  });

  test('lists a tag the library cannot read as missing', async () => {
    let locations = {bar: {osmName: 'Bar', position: BRNO}};
    let result = await fillTravelData({
      locations,
      travel: {},
      lookups: createLookups({
        findNamed: async () => [{position: BRNO, openingHours: 'nonsense'}],
      }),
    });

    expect(result.locations.bar).toEqual(locations.bar);
    expect(result.missing).toContain('locations.json › bar › hours');
  });

  test('computes walking and taxi journeys from routes, and the tram from stop to stop without a lookup', async () => {
    let a = {latitude: 49.2, longitude: 16.6};
    let b = {latitude: 49.2, longitude: 16.6 + 0.0549};
    let lookups = createLookups({
      route: async (profile) =>
        profile === 'foot' ? {metres: 2000, seconds: 1500} : {metres: 4000, seconds: 600},
    });
    let {route} = lookups;
    let result = await fillTravelData({
      locations: {
        one: {position: a},
        x: {tramStop: 'X', position: a},
        y: {tramStop: 'Y', position: b},
      },
      travel: {},
      lookups,
    });

    expect(result.travel.one?.walk?.x).toEqual({minutes: 25, computed: true});
    expect(result.travel.one?.taxi?.x).toEqual({minutes: 15, price: 200, computed: true});
    expect(result.travel.x?.tram?.y).toEqual({minutes: 22, price: 25, computed: true});
    expect(result.travel.one?.tram).toBeUndefined();
    expect(result.travel.x?.tram?.one).toBeUndefined();
    expect(route).toHaveBeenCalledTimes(12);
    expect(route).toHaveBeenCalledWith('foot', a, b);
    expect(route).toHaveBeenCalledWith('car', a, b);
    expect(getCalls(lookups)).toBe(route.mock.calls.length);
    expect(result.missing).toEqual([]);
  });

  test('keeps the values that are there', async () => {
    let locations = {
      one: {osmName: 'One', position: BRNO, hours: [[960, 1200]]},
      two: {position: BRNO},
    };
    let travel = {
      one: {walk: {two: {minutes: 30}}, taxi: {two: {minutes: 9, price: 100}}},
      two: {walk: {one: {minutes: 1}}, taxi: {one: {minutes: 2, price: 3}}},
    };
    let lookups = createLookups();
    let result = await fillTravelData({locations, travel, lookups});

    expect(result.locations).toEqual(locations);
    expect(result.travel).toEqual(travel);
    expect(result.added).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(getCalls(lookups)).toBe(0);
  });

  test('lists a rejected position, goes on, and lists the journeys that need it', async () => {
    let lookups = createLookups({findPositions: async () => reject('findPositions')});

    lookups.findPositions.mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce([BRNO]);

    let result = await fillTravelData({
      locations: {
        one: {address: 'A 1'},
        two: {address: 'B 2'},
      },
      travel: {},
      lookups,
    });

    expect(lookups.findPositions).toHaveBeenCalledTimes(2);
    expect(result.locations.one).toEqual({address: 'A 1'});
    expect(result.locations.two?.position).toEqual(BRNO);
    expect(result.missing).toContain('locations.json › one › position');
    expect(result.missing).toContain('travel.json › one › walk › two');
    expect(result.missing).toContain('travel.json › two › taxi › one');
  });

  test('does not change its input', async () => {
    let locations = {one: {address: 'A 1'}};
    let travel = {};
    let before = structuredClone({locations, travel});

    await fillTravelData({
      locations,
      travel,
      lookups: createLookups({findPositions: async () => [BRNO]}),
    });

    expect({locations, travel}).toEqual(before);
  });

  test('asks one thing at a time', async () => {
    let running = 0;
    let most = 0;
    let slow = async <T>(value: T): Promise<T> => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
      running -= 1;

      return value;
    };
    let result = await fillTravelData({
      locations: {
        one: {address: 'A 1'},
        two: {address: 'B 2'},
      },
      travel: {},
      lookups: {
        findPositions: async () => slow([BRNO]),
        findNamed: async () => slow([]),
        route: async () => slow({metres: 100, seconds: 60}),
      },
    });

    expect(result.missing).toEqual([]);
    expect(most).toBe(1);
  });
});

describe(readOpeningHours, () => {
  test('reads a Friday night from the tag, past midnight into Saturday', () => {
    expect(readOpeningHours('Mo-Th 16:00-01:00, Fr 16:00-03:00, Sa 17:00-03:00')).toEqual([
      [960, 1620],
    ]);
    expect(readOpeningHours('Mo-Su 16:30-21:00')).toEqual([[990, 1260]]);
    expect(readOpeningHours('24/7')).toEqual([[960, 1920]]);
  });

  test('gives one span for each stretch of the night, and none for a day shift', () => {
    expect(readOpeningHours('Fr 16:00-20:00; Sa 00:00-03:00')).toEqual([
      [960, 1200],
      [1440, 1620],
    ]);
    expect(readOpeningHours('Mo-Th 10:00-12:00')).toEqual([]);
  });

  test('reads a public holiday rule for a Friday that is none', () => {
    expect(readOpeningHours('Mo-Su 10:00-02:00; PH off')).toEqual([[960, 1560]]);
  });

  test('throws on a tag it cannot read', () => {
    expect(() => readOpeningHours('nonsense')).toThrow('Unexpected token');
  });
});

describe(formatData, () => {
  test('gives the text Prettier keeps, a journey on one line', async () => {
    let travel = {one: {tram: {two: {minutes: 23, computed: true}}}};
    let file = fileURLToPath(new URL('../source/game/content/data/travel.json', import.meta.url));
    let text = await formatData(travel, file);

    expect(text).toBe(
      await prettier.format(JSON.stringify(travel), {
        ...(await prettier.resolveConfig(file)),
        filepath: file,
      }),
    );
    expect(text).toContain('{"minutes": 23, "computed": true}');
  });
});
