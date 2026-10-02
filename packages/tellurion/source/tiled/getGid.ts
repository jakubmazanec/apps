/* eslint-disable no-bitwise -- bitwise operators are really needed */
import {
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  ROTATED_HEXAGONAL_120_FLAG,
} from './constants.js';
import {type TileGid} from './TileGid.js';
import {type TileGidWithFlags} from './TileGidWithFlags.js';

export function getGid(gid: TileGidWithFlags): TileGid {
  return (gid &
    ~(
      FLIPPED_HORIZONTALLY_FLAG |
      FLIPPED_VERTICALLY_FLAG |
      FLIPPED_DIAGONALLY_FLAG |
      ROTATED_HEXAGONAL_120_FLAG
    )) as TileGid;
}
