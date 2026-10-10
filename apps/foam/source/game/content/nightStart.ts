import {type NightStart} from '../core/travel.js';
import locationData from './data/locations.json';
import map from './data/map.json';
import travel from './data/travel.json';
import {locations, places} from './locations.js';

// Not frozen on purpose: the jump-in and the tests write into it.
export const nightStart: NightStart = {
  locations,
  places,
  locationData,
  travel,
  map,
  place: 'train',
  minutes: 960,
  money: 350,
};
