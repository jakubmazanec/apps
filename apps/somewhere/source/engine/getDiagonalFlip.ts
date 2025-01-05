/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {FLIPPED_DIAGONALLY_FLAG} from '../constants.js';
import {type TileGid} from './TileGid.js';

export function getDiagonalFlip(gid: TileGid): boolean {
  return !!(gid & FLIPPED_DIAGONALLY_FLAG);
}
