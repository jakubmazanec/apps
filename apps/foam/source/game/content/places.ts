import {type PlaceId} from '../core/night.js';
import {type Place} from '../core/place.js';
import {hlavniNadrazi} from './places/hlavniNadrazi.js';
import {malinovskehoNamesti} from './places/malinovskehoNamesti.js';
import {namestiRepubliky} from './places/namestiRepubliky.js';
import {rotorBar} from './places/rotorBar.js';
import {train} from './places/train.js';
import {whiskyShop} from './places/whiskyShop.js';
import {zidenice} from './places/zidenice.js';

export const places: Record<PlaceId, Place> = {
  train,
  zidenice,
  hlavniNadrazi,
  whiskyShop,
  rotorBar,
  namestiRepubliky,
  malinovskehoNamesti,
};
