import {type Location} from '../../../core/location.js';
import {train as place} from './train.js';

// A location of one place, so that every place has a location. It is off the map: the train
// moves, and locations.json has no entry for it.
export const train: Location = {
  id: 'train',
  name: 'The train',
  places: [place],
  arrival: 'train',
};
