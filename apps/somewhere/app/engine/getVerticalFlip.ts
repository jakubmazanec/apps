/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {FLIPPED_VERTICALLY_FLAG} from '../constants.js';
import {type TileGid} from './TileGid.js';

export function getVerticalFlip(gid: TileGid): boolean {
  return !!(gid & FLIPPED_VERTICALLY_FLAG);
}
