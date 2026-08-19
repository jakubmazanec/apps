import {type Opaque} from '../utilities/Opaque.js';

/**
 * Local Tile ID, i.e. local to a tileset, i.e. starts with 0, i.e. zero-based index.
 */
export type TileId = Opaque<number, 'TileId'>;

export function toTileId(value: number): TileId {
  return value as TileId;
}
