/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {FLIPPED_HORIZONTALLY_FLAG} from '../constants.js';
import {type TileGid} from './TileGid.js';

export function getHorizontalFlip(gid: TileGid): boolean {
  return !!(gid & FLIPPED_HORIZONTALLY_FLAG);
}
