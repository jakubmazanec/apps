import {type Hex, type HexCoordinates} from '../../hex/index.js';
import {type Traverser} from '../types.js';

/**
 * @category Traverser
 */
export const fromCoordinates =
  <T extends Hex>(...coordinates: HexCoordinates[]): Traverser<T> =>
  (createHex) =>
    coordinates.map(createHex);
