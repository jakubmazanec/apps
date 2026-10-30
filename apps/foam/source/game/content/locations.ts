import {type Location, type LocationId} from '../core/location.js';
import {type Place} from '../core/place.js';
import {hlavniNadrazi} from './locations/hlavniNadrazi/location.js';
import {malinovskehoNamesti} from './locations/malinovskehoNamesti/location.js';
import {namestiRepubliky} from './locations/namestiRepubliky/location.js';
import {rotorBar} from './locations/rotorBar/location.js';
import {train} from './locations/train/location.js';
import {whiskyShop} from './locations/whiskyShop/location.js';
import {zidenice} from './locations/zidenice/location.js';

export const locations: Record<LocationId, Location> = {
  train,
  zidenice,
  hlavniNadrazi,
  whiskyShop,
  rotorBar,
  namestiRepubliky,
  malinovskehoNamesti,
};

// Derived once from the locations, so that a place is written in one place only.
export const places: Readonly<Record<string, Place>> = Object.fromEntries(
  Object.values(locations).flatMap((location) => location.places.map((place) => [place.id, place])),
);
