/* eslint-disable no-bitwise -- needed for the flipping and rotating flags */
import {FLIPPED_VERTICALLY_FLAG} from './constants.js';
import {type TileGidWithFlags} from './TileGidWithFlags.js';

export function getVerticalFlip(gid: TileGidWithFlags): boolean {
  return !!(gid & FLIPPED_VERTICALLY_FLAG);
}
