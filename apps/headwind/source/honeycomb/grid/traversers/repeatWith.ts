import {type Hex} from '../../hex/index.js';
import {type Traverser} from '../types.js';
import {concat} from './concat.js';

/**
 * @category Traverser
 */
export function repeatWith<T extends Hex>(
  sources: Array<Traverser<T>> | Traverser<T>,
  branches: Array<Traverser<T>> | Traverser<T>,
  // todo: isn't there a more elegant way than a config?
  {includeSource = true} = {},
): Traverser<T> {
  return function repeatWithTraverser(createHex, cursor) {
    const hexes: T[] = [];

    for (const sourceCursor of concat(sources)(createHex, cursor)) {
      if (includeSource) {
        hexes.push(sourceCursor);
      }
      for (const hex of concat(branches)(createHex, sourceCursor)) {
        hexes.push(hex);
      }
    }

    return hexes;
  };
}
