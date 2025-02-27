import {type Hex} from '../hex.js';
import {type CubeCoordinates, type PartialCubeCoordinates} from '../types.js';
import {completeCube} from './completeCube.js';

/**
 * @category Hex
 */
export function translate<T extends Hex>(hex: T, delta: PartialCubeCoordinates): T;
export function translate(
  coordinates: PartialCubeCoordinates,
  delta: PartialCubeCoordinates,
): CubeCoordinates;
export function translate<T extends Hex>(
  input: PartialCubeCoordinates | T,
  delta: PartialCubeCoordinates,
): CubeCoordinates | T {
  const {q, r, s} = completeCube(input);
  const {q: deltaQ, r: deltaR, s: deltaS} = completeCube(delta);
  const translation = {q: q + deltaQ, r: r + deltaR, s: s + deltaS};

  return 'clone' in input ? input.clone(translation) : translation;
}
