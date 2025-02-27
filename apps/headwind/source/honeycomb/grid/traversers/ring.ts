import {type Hex, type HexCoordinates, toCube} from '../../hex/index.js';
import {isNumber} from '../../utils/index.js';
import {distance} from '../functions/index.js';
import {type Rotation, type Traverser} from '../types.js';

/**
 * @category Traverser
 */
export function ring<T extends Hex>(options: RingFromRadiusOptions | RingOptions): Traverser<T> {
  const {center, rotation = Rotation.CLOCKWISE} = options;

  return function ringTraverser(createHex, cursor) {
    const _rotation = rotation.toUpperCase() as Rotation;
    const hexes: T[] = [];
    let {radius} = options as RingFromRadiusOptions;
    const hasRadiusOption = isNumber(radius);
    let firstHex: T;

    if (hasRadiusOption) {
      firstHex = createHex(center).translate({q: radius, s: -radius});
    } else {
      firstHex = createHex((options as RingOptions).start ?? cursor);
      radius = distance(firstHex, center, firstHex);
    }

    // always start at coordinates radius away from the center, reorder the hexes later
    const {q, r, s} = toCube(firstHex, center);
    let _cursor = createHex({q, r: r - radius, s: s + radius});

    if (_rotation === Rotation.CLOCKWISE) {
      for (let direction = 0; direction < 6; direction++) {
        for (let i = 0; i < radius; i++) {
          const {q, r} = DIRECTION_COORDINATES[direction];
          _cursor = createHex({q: _cursor.q + q, r: _cursor.r + r});
          hexes.push(_cursor);
        }
      }
    } else {
      for (let direction = 5; direction >= 0; direction--) {
        for (let i = 0; i < radius; i++) {
          const {q, r} = DIRECTION_COORDINATES[direction];
          _cursor = createHex({q: _cursor.q - q, r: _cursor.r - r});
          hexes.push(_cursor);
        }
      }
    }

    // when a radius is passed in the options, it makes no sense to skip the first hex
    // see https://github.com/flauwekeul/honeycomb/issues/100
    const skipFirstHex = hasRadiusOption ? false : !(options as RingOptions).start && cursor;
    const startIndex = hexes.findIndex((hex) => hex.equals(firstHex));
    // move part of hexes array to the front so that firstHex is actually the first hex
    return hexes.slice(startIndex + (skipFirstHex ? 1 : 0)).concat(hexes.slice(0, startIndex));
  };
}

/**
 * @category Traverser
 */
export interface RingOptions {
  start?: HexCoordinates;
  center: HexCoordinates;
  rotation?: Rotation;
}

/**
 * @category Traverser
 */
export interface RingFromRadiusOptions {
  center: HexCoordinates;
  radius: number;
  rotation?: Rotation;
}

const DIRECTION_COORDINATES = [
  {q: 1, r: 0},
  {q: 0, r: 1},
  {q: -1, r: 1},
  {q: -1, r: 0},
  {q: 0, r: -1},
  {q: 1, r: -1},
];
