import {type Opaque} from '../utilities/Opaque.js';

/**
 * Global tile ID with cleared flags for flipping and stuff.
 */
export type TileGid = Opaque<number, 'TileGid'>;

export function toTileGid(value: number): TileGid {
  return value as TileGid;
}
