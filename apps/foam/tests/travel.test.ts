import {describe, expect, test, vitest} from 'vitest';

import {createNight, type PlaceId} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {getDestinations, type NightStart, takeJourney} from '../source/game/core/travel.js';

function createPlace(id: PlaceId, name: string): Place {
  return {id, name, description: {start: {text: 'x'}}, picture: '', spots: []};
}

const START: NightStart = {
  places: {
    rotorBar: createPlace('rotorBar', 'Alpha'),
    zidenice: createPlace('zidenice', 'Beta'),
    hlavniNadrazi: createPlace('hlavniNadrazi', 'Gamma'),
  },
  locationData: {},
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

describe(getDestinations, () => {
  test('by walk it gives the nearest first, then by name, and warns once', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});
    let destinations = getDestinations(START, 'whiskyShop', 'walk');

    expect(destinations.map((destination) => destination.place.id)).toEqual([
      'zidenice',
      'rotorBar',
      'hlavniNadrazi',
    ]);
    expect(destinations.map((destination) => destination.price)).toEqual([0, 0, 0]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('nowhere');

    warn.mockRestore();
  });

  test('by tram it gives nothing, and from a place without travel too', () => {
    expect(getDestinations(START, 'whiskyShop', 'tram')).toEqual([]);
    expect(getDestinations(START, 'rotorBar', 'walk')).toEqual([]);
  });
});

describe(takeJourney, () => {
  test('adds the minutes, takes the price and sets the place', () => {
    let taxi = getDestinations(START, 'whiskyShop', 'taxi')[0];
    let night = {...createNight(START), minutes: 1180, money: 350};

    if (taxi === undefined) {
      throw new Error('No taxi destination!');
    }

    takeJourney(night, taxi);

    expect(night.minutes).toBe(1191);
    expect(night.money).toBe(180);
    expect(night.place).toBe('rotorBar');
  });
});
