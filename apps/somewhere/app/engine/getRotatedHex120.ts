/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {ROTATED_HEXAGONAL_120_FLAG} from '../constants.js';
import {type TileGid} from './TileGid.js';

export function getRotatedHex120(gid: TileGid): boolean {
  return !!(gid & ROTATED_HEXAGONAL_120_FLAG);
}
