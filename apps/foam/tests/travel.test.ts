import {afterEach, beforeEach, describe, expect, type MockInstance, test, vitest} from 'vitest';

import {type Location, type LocationId} from '../source/game/core/location.js';
import {createNight, type Night, type PlaceId, type Way} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {
  formatTravel,
  getDestinations,
  getLocation,
  type NightStart,
  takeJourney,
} from '../source/game/core/travel.js';

function createPlace(id: PlaceId, name: string): Place {
  return {id, name, outdoors: true, description: {start: {text: 'x'}}, picture: '', spots: []};
}

function createLocation(
  id: LocationId,
  name: string,
  places: Place[],
  arrival: PlaceId,
  outside?: PlaceId,
): Location {
  return {id, name, places, arrival, ...(outside === undefined ? {} : {outside})};
}

const LOCATIONS: Record<string, Location> = {
  rotorBar: createLocation(
    'rotorBar',
    'Alpha',
    [createPlace('rotorBarRoom', 'Alpha'), createPlace('rotorBarStreet', 'Dvořákova')],
    'rotorBarRoom',
    'rotorBarStreet',
  ),
  zidenice: createLocation('zidenice', 'Beta', [createPlace('zidenice', 'Beta')], 'zidenice'),
  hlavniNadrazi: createLocation(
    'hlavniNadrazi',
    'Gamma',
    [createPlace('hlavniNadraziHall', 'Gamma'), createPlace('hlavniNadraziForecourt', 'Nádražní')],
    'hlavniNadraziForecourt',
  ),
};
const START: NightStart = {
  locations: LOCATIONS,
  places: Object.fromEntries(
    Object.values(LOCATIONS).flatMap((location) =>
      location.places.map((place) => [place.id, place]),
    ),
  ),
  locationData: {rotorBar: {hours: [[960, 1620]]}},
  travel: {
    whiskyShop: {
      walk: {
        hlavniNadrazi: {minutes: 10},
        zidenice: {minutes: 5},
        rotorBar: {minutes: 10},
        nowhere: {minutes: 1},
      },
      taxi: {rotorBar: {minutes: 11, price: 170}},
    },
  },
  map: {
    origin: {latitude: 49.2, longitude: 16.6},
    box: {left: -100, top: -100, right: 100, bottom: 100},
    minorStreets: [],
    mainStreets: [],
    railway: [],
    rivers: [],
    parks: [],
    tramLines: [],
  },
  place: 'train',
  minutes: 1020,
  money: 350,
};

// Takes the journey from the Whisky Shop by the way to the location, starting at the minute.
function travel(minutes: number, way: Way, to: LocationId): Night {
  let destination = getDestinations(START, 'whiskyShop', way).find(
    ({location}) => location.id === to,
  );
  let night = {...createNight(START), minutes, money: 350};

  if (destination === undefined) {
    throw new Error(`No ${way} destination "${to}"!`);
  }

  takeJourney(START, night, destination);

  return night;
}

describe(getDestinations, () => {
  test('by walk it gives the nearest location first, then by name, and warns once', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});
    let destinations = getDestinations(START, 'whiskyShop', 'walk');

    expect(destinations.map((destination) => destination.location.id)).toEqual([
      'zidenice',
      'rotorBar',
      'hlavniNadrazi',
    ]);
    expect(destinations.map((destination) => destination.price)).toEqual([0, 0, 0]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('nowhere');

    warn.mockRestore();
  });

  test('by tram it gives nothing, and from a location without travel too', () => {
    expect(getDestinations(START, 'whiskyShop', 'tram')).toEqual([]);
    expect(getDestinations(START, 'rotorBar', 'walk')).toEqual([]);
  });
});

describe(takeJourney, () => {
  let warn: MockInstance<typeof console.warn>;

  // The walk from the Whisky Shop names "nowhere", which warns; getDestinations' test checks that.
  beforeEach(() => {
    warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('arrives at the arrival while the location is open', () => {
    let night = travel(1180, 'taxi', 'rotorBar');

    expect(night.minutes).toBe(1191);
    expect(night.money).toBe(180);
    expect(night.place).toBe('rotorBarRoom');
  });

  test('arrives outside while closed, at the exact minute of the closing and before the opening', () => {
    let atClosing = travel(1609, 'taxi', 'rotorBar');
    // A jump-in can start a night before 16:00.
    let beforeOpening = travel(940, 'taxi', 'rotorBar');

    expect(atClosing.minutes).toBe(1620);
    expect(atClosing.place).toBe('rotorBarStreet');
    expect(beforeOpening.minutes).toBe(951);
    expect(beforeOpening.place).toBe('rotorBarStreet');
  });

  test('arrives at the arrival of a location without hours', () => {
    expect(travel(1180, 'walk', 'hlavniNadrazi').place).toBe('hlavniNadraziForecourt');
  });

  test('reads the hours at the minute of arrival, not of departure', () => {
    let night = travel(1615, 'taxi', 'rotorBar');

    expect(night.minutes).toBe(1626);
    expect(night.place).toBe('rotorBarStreet');
  });
});

describe(getLocation, () => {
  test('finds the location of a place', () => {
    expect(getLocation(START, 'rotorBarStreet')).toBe(START.locations.rotorBar);
  });

  test('gives undefined for a place in no location', () => {
    expect(getLocation(START, 'whiskyShopRoom')).toBeUndefined();
  });
});

describe(formatTravel, () => {
  test('names the way, the location and the numbers', () => {
    let alpha = START.locations.rotorBar;

    if (alpha === undefined) {
      throw new Error('The start has no rotorBar.');
    }

    expect(formatTravel({location: alpha, way: 'walk', minutes: 12, price: 0})).toBe(
      'Walk to Alpha  12 min',
    );
    expect(formatTravel({location: alpha, way: 'tram', minutes: 17, price: 25})).toBe(
      'Tram to Alpha  17 min  25 Kč',
    );
    expect(formatTravel({location: alpha, way: 'taxi', minutes: 11, price: 170})).toBe(
      'Taxi to Alpha  11 min  170 Kč',
    );
  });
});
