import {isOpenAt} from '../core/hours.js';
import {type LocationId} from '../core/location.js';
import {type Night} from '../core/night.js';
import {type LocationData} from '../core/travel.js';
import entries from './data/locations.json';

// Read from the data itself, not from nightStart: nightStart imports the locations, they import
// their place files, and a door there imports isOpen, which would close a cycle. nightStart holds
// the same object, so a test that writes into its locationData changes what isOpen reads. The
// JSON's own type has no key for the train, which has no entry.
const locationData: LocationData = entries;

/** Whether the location is open now, by its hours in locations.json. */
export function isOpen(night: Night, location: LocationId): boolean {
  return isOpenAt(locationData[location]?.hours, night.minutes);
}
