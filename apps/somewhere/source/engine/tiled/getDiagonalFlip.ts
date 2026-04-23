/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {FLIPPED_DIAGONALLY_FLAG} from './constants.js';
import {type TileGidWithFlags} from './TileGidWithFlags.js';

export function getDiagonalFlip(gid: TileGidWithFlags): boolean {
  return !!(gid & FLIPPED_DIAGONALLY_FLAG);
}
