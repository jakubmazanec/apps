import {type Point} from '../hex/index.js';
import {isNumber} from './isNumber.js';
import {isObject} from './isObject.js';

export const isPoint = (value: unknown): value is Point =>
  isObject<Point>(value) && isNumber(value.x) && isNumber(value.y);
