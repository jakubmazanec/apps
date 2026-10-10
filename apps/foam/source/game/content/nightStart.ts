import {type NightStart} from '../core/travel.js';
import locationData from './data/locations.json';
import map from './data/map.json';
import travel from './data/travel.json';
import {places} from './places.js';

// Not frozen on purpose: the jump-in and the tests write into it.
export const nightStart: NightStart = {
  places,
  locationData,
  travel,
  map,
  place: 'train',
  minutes: 1020,
  money: 350,
};
