import {type TupleCoordinates} from '../hex/index.js';

/**
 * @category Coordinates
 */
export const tupleToCube = ([q, r, s = -q - r]: TupleCoordinates) => ({q, r, s});
