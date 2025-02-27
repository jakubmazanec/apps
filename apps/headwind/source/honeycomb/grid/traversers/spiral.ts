import {type Hex, type HexCoordinates} from '../../hex/index.js';
import {Direction, type Rotation, type Traverser} from '../types.js';
import {line} from './line.js';
import {repeatWith} from './repeatWith.js';
import {ring} from './ring.js';

/**
 * @category Traverser
 */
export function spiral<T extends Hex>({radius, start, rotation}: SpiralOptions): Traverser<T> {
  return function spiralTraverser(createHex, cursor) {
    const center = start ?? cursor ?? [0, 0];
    // radius excludes the center, so 1 is added to radius
    // only when there's a cursor but no start, radius can be used as-is, because then line() already increases its length by 1
    const length = !start && cursor ? radius : radius + 1;
    return repeatWith<T>(line({start, direction: Direction.N, length}), ring({center, rotation}))(
      createHex,
      cursor,
    );
  };
}

/**
 * @category Traverser
 */
export interface SpiralOptions {
  start?: HexCoordinates;
  radius: number;
  rotation?: Rotation;
}
