import {type OffsetCoordinates} from '../hex/index.js';
import {isNumber} from './isNumber.js';
import {isObject} from './isObject.js';

/**
 * @category Coordinates
 */
export const isOffset = (value: unknown): value is OffsetCoordinates =>
  isObject<OffsetCoordinates>(value) && isNumber(value.col) && isNumber(value.row);
