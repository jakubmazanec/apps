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
    findTramStops: vitest.fn<Lookups['findTramStops']>(
      overrides.findTramStops ?? (async () => reject('findTramStops')),
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
    lookups.findTramStops.mock.calls.length +
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
      places: {stop: {kind: 'stop', tramStop: 'A'}},
      travel: {},
      lookups,
    });

    expect(result.places.stop).toEqual({
      kind: 'stop',
      tramStop: 'A',
      position: {latitude: 49.100_02, longitude: 16.500_02},
      computed: true,
    });
    expect(result.added).toEqual(['places.json › stop › position']);
    expect(result.missing).toEqual([]);
  });

  test('gives a place the nearer of two stops, and a stop none', async () => {
    let near = {name: 'Near', position: {latitude: 49.2005, longitude: 16.6}};
    let far = {name: 'Far', position: {latitude: 49.21, longitude: 16.6}};
    let lookups = createLookups({findTramStops: async () => [far, near]});
    let result = await fillTravelData({
      places: {
        bar: {kind: 'place', position: BRNO},
        stop: {kind: 'stop', tramStop: 'A', position: BRNO},
      },
      travel: {},
      lookups,
    });

    expect(result.places.bar?.nearestTramStop).toEqual(near);
    expect(result.places.stop?.nearestTramStop).toBeUndefined();
    expect(result.added).toContain('places.json › bar › nearestTramStop');
    expect(lookups.findTramStops).toHaveBeenCalledTimes(1);
  });

  test('takes opening hours from a thing 100 m away and not from one 200 m away', async () => {
    let at = (metres: number): Position => ({
      latitude: BRNO.latitude + metres / 111_195,
      longitude: BRNO.longitude,
    });
    let places = {
      stop: {kind: 'stop', tramStop: 'A', position: BRNO},
      bar: {
        kind: 'place',
        osmName: 'Bar',
        position: BRNO,
        nearestTramStop: {name: 'A', position: BRNO},
      },
    };
    let near = await fillTravelData({
      places,
      travel: {},
      lookups: createLookups({
        findNamed: async () => [
          {position: at(200), openingHours: 'far'},
          {position: at(100), openingHours: 'near'},
        ],
      }),
    });
    let far = await fillTravelData({
      places,
      travel: {},
      lookups: createLookups({
        findNamed: async () => [{position: at(200), openingHours: 'far'}],
      }),
    });

    expect(near.places.bar?.openingHours).toBe('near');
    expect(near.places.bar?.computed).toBe(true);
    expect(far.places.bar?.openingHours).toBeUndefined();
    expect(far.missing).toContain('places.json › bar › openingHours');
  });

  test('computes walking and taxi journeys from routes, and tram without a lookup', async () => {
    let a = {latitude: 49.2, longitude: 16.6};
    let b = {latitude: 49.2, longitude: 16.6 + 0.0549};
    let lookups = createLookups({
      route: async (profile) =>
        profile === 'foot' ? {metres: 2000, seconds: 1500} : {metres: 4000, seconds: 600},
    });
    let {route} = lookups;
    let result = await fillTravelData({
      places: {
        one: {kind: 'place', position: a, nearestTramStop: {name: 'X', position: a}},
        two: {kind: 'place', position: b, nearestTramStop: {name: 'Y', position: b}},
        x: {kind: 'stop', tramStop: 'X', position: a},
        y: {kind: 'stop', tramStop: 'Y', position: b},
      },
      travel: {},
      lookups,
    });

    expect(result.travel.one?.walk?.two).toEqual({minutes: 25, computed: true});
    expect(result.travel.one?.taxi?.two).toEqual({minutes: 15, price: 200, computed: true});
    expect(result.travel.one?.tram?.y?.price).toBe(25);
    expect(result.travel.one?.tram?.y?.computed).toBe(true);
    expect(result.travel.one?.tram?.x).toBeUndefined();
    expect(route).toHaveBeenCalledWith('foot', a, b);
    expect(route).toHaveBeenCalledWith('car', a, b);
    expect(getCalls(lookups)).toBe(route.mock.calls.length);
    expect(result.missing).toEqual([]);
  });

  test('keeps the values that are there', async () => {
    let places = {
      one: {
        kind: 'place',
        position: BRNO,
        openingHours: 'typed',
        nearestTramStop: {name: 'X', position: BRNO},
        osmName: 'One',
      },
      two: {kind: 'place', position: BRNO, nearestTramStop: {name: 'X', position: BRNO}},
    };
    let travel = {
      one: {walk: {two: {minutes: 30}}, taxi: {two: {minutes: 9, price: 100}}},
      two: {walk: {one: {minutes: 1}}, taxi: {one: {minutes: 2, price: 3}}},
    };
    let lookups = createLookups();
    let result = await fillTravelData({places, travel, lookups});

    expect(result.places).toEqual(places);
    expect(result.travel).toEqual(travel);
    expect(result.added).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(getCalls(lookups)).toBe(0);
  });

  test('lists a rejected position, goes on, and lists the journeys that need it', async () => {
    let lookups = createLookups({findPositions: async () => reject('findPositions')});

    lookups.findPositions.mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce([BRNO]);

    let result = await fillTravelData({
      places: {
        one: {kind: 'place', address: 'A 1'},
        two: {kind: 'place', address: 'B 2', nearestTramStop: {name: 'X', position: BRNO}},
      },
      travel: {},
      lookups,
    });

    expect(lookups.findPositions).toHaveBeenCalledTimes(2);
    expect(result.places.one).toEqual({kind: 'place', address: 'A 1'});
    expect(result.places.two?.position).toEqual(BRNO);
    expect(result.missing).toContain('places.json › one › position');
    expect(result.missing).toContain('travel.json › one › walk › two');
    expect(result.missing).toContain('travel.json › two › taxi › one');
  });

  test('does not change its input', async () => {
    let places = {one: {kind: 'place', address: 'A 1'}};
    let travel = {};
    let before = structuredClone({places, travel});

    await fillTravelData({
      places,
      travel,
      lookups: createLookups({findPositions: async () => [BRNO]}),
    });

    expect({places, travel}).toEqual(before);
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
      places: {
        one: {kind: 'place', address: 'A 1'},
        two: {kind: 'place', address: 'B 2'},
      },
      travel: {},
      lookups: {
        findPositions: async () => slow([BRNO]),
        findTramStops: async () => slow([{name: 'X', position: BRNO}]),
        findNamed: async () => slow([]),
        route: async () => slow({metres: 100, seconds: 60}),
      },
    });

    expect(result.missing).toEqual([]);
    expect(most).toBe(1);
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
