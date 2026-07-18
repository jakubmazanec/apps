/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {FLIPPED_HORIZONTALLY_FLAG} from './constants.js';
import {type TileGidWithFlags} from './TileGidWithFlags.js';

export function getHorizontalFlip(gid: TileGidWithFlags): boolean {
  return !!(gid & FLIPPED_HORIZONTALLY_FLAG);
}
