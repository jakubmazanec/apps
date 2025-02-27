import {type Hex} from '../../hex/index.js';
import {neighborOf} from '../functions/index.js';
import {type Direction, type Traverser} from '../types.js';

/**
 * @category Traverser
 */
export const move =
  <T extends Hex>(direction: Direction): Traverser<T> =>
  (createHex, cursor) => [neighborOf(createHex(cursor), direction)];
