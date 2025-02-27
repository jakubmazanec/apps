import {type TupleCoordinates} from '../hex/index.js';
import {isNumber} from './isNumber.js';

/**
 * @category Coordinates
 */
export const isTuple = (value: unknown): value is TupleCoordinates =>
  Array.isArray(value) && isNumber(value[0]) && isNumber(value[1]);
