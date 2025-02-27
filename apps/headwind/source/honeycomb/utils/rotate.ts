import {type Direction} from '../grid/index.js';
import {signedModulo} from './signedModulo.js';

export const rotate = (direction: number, steps: number): Direction =>
  signedModulo(direction + steps, 8);
