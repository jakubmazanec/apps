import {todaySeed} from '../core/todaySeed.js';
import {type NightStart} from '../core/travel.js';
import locationData from './data/locations.json';
import map from './data/map.json';
import travel from './data/travel.json';
import {locations, places} from './locations.js';

// Not frozen on purpose: the jump-in and the tests write into it. The seed is the date the page
// was loaded on; the New night window writes it before every night.
export const nightStart: NightStart = {
  locations,
  places,
  locationData,
  travel,
  map,
  seed: todaySeed(),
  place: 'train',
  minutes: 960,
  money: {min: 300, max: 500, step: 50},
};
