import {type AxialCoordinates} from '../hex/index.js';
import {isNumber} from './isNumber.js';
import {isObject} from './isObject.js';

/**
 * @category Coordinates
 */
export const isAxial = (value: unknown): value is AxialCoordinates =>
  isObject<AxialCoordinates>(value) && isNumber(value.q) && isNumber(value.r);
