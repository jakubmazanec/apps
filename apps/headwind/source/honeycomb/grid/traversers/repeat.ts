import {type Hex} from '../../hex/index.js';
import {type Traverser} from '../types.js';
import {concat} from './concat.js';

/**
 * @category Traverser
 */
export function repeat<T extends Hex>(
  times: number,
  traversers: Array<Traverser<T>> | Traverser<T>,
): Traverser<T> {
  return concat(Array.from({length: times}, () => concat(traversers)));
}
