import * as pixi from 'pixi.js';

import {tiledTilemapSchema} from '../../tiled-tools/TiledTilemap.js';
import {getGid} from './getGid.js';
import {type TileGid, toTileGid} from './TileGid.js';
import {Tileset} from './Tileset.js';

export type TilemapTileset = {
  assetName: string;
  firstTileGid: TileGid;
};

export type TilemapLayer = {
  tileGids: TileGid[];
};

export type TilemapOptions = {
  tileWidth: number;
  tileHeight: number;
  columnCount: number;
  rowCount: number;
  tilesets: TilemapTileset[];
  layers: TilemapLayer[];
};

// DEV-throw / prod-warn on unsupported Tiled input (the ObjectPool.destroy
// precedent): a silent drop reproduces as an inexplicably empty map layer,
// and a warn alone gets missed in development.
function failUnsupported(message: string): void {
  if (import.meta.env.DEV) {
    throw new Error(message);
  }

  console.warn(message);
}

export class Tilemap {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly columnCount: number;
  readonly rowCount: number;

  readonly tilesets: readonly TilemapTileset[] = [];
  readonly layers: readonly TilemapLayer[] = [];

  constructor({tileWidth, tileHeight, columnCount, rowCount, tilesets, layers}: TilemapOptions) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.columnCount = columnCount;
    this.rowCount = rowCount;
    this.tilesets = tilesets;
    this.layers = layers;
  }

  static async from(source: unknown) {
    let tiledTilemap = tiledTilemapSchema.parse(source);

    if (tiledTilemap.infinite) {
      failUnsupported(
        'Infinite tilemaps are not supported! Re-export the map from Tiled with "Infinite" turned off (Map > Map Properties).',
      );
    }

    let tilesets: TilemapTileset[] = [];

    for (let tiledTilemapTileset of tiledTilemap.tilesets) {
      if (tiledTilemapTileset.source) {
        tilesets.push({
          assetName: tiledTilemapTileset.source,
          firstTileGid: toTileGid(tiledTilemapTileset.firstgid),
        });
      } else {
        failUnsupported(
          'Embedded tilesets are not supported! Export the tileset to its own file in Tiled and reference it from the map as an external tileset.',
        );
      }
    }

    let layers: TilemapLayer[] = [];

    for (let tiledTilemapLayer of tiledTilemap.layers) {
      if (tiledTilemapLayer.type !== 'tilelayer') {
        failUnsupported(
          `Layer "${tiledTilemapLayer.name}" has unsupported type "${tiledTilemapLayer.type}"! Only tile layers are supported; remove object, image, and group layers from the map.`,
        );

        continue;
      }

      if (typeof tiledTilemapLayer.data === 'string') {
        failUnsupported(
          `Tile layer "${tiledTilemapLayer.name}" uses base64 (and/or compressed) data! Re-export the map from Tiled with "Tile Layer Format: CSV" (Map > Map Properties).`,
        );

        continue;
      }

      // Flip/rotation flags are stripped below, so a flipped tile would
      // silently render un-flipped — loud until T1.7 implements flip
      // rendering (T1.7 relaxes this check to actual support).
      let flaggedIndex = tiledTilemapLayer.data.findIndex(
        (gid) => getGid(toTileGid(gid)) !== gid,
      );

      if (flaggedIndex >= 0) {
        failUnsupported(
          `Tile layer "${tiledTilemapLayer.name}" has a flipped or rotated tile (first at tile index ${flaggedIndex})! Flipped tiles render un-flipped; remove the flips/rotations in Tiled.`,
        );
      }

      let tileGids = tiledTilemapLayer.data.map((gid) => getGid(toTileGid(gid)));

      layers.push({
        tileGids,
      });
    }

    return new this({
      tileWidth: tiledTilemap.tilewidth,
      tileHeight: tiledTilemap.tileheight,
      columnCount: tiledTilemap.width,
      rowCount: tiledTilemap.height,
      tilesets,
      layers,
    });
  }

  getTile(tileGid: TileGid) {
    for (let i = this.tilesets.length - 1; i >= 0; --i) {
      let tilemapTileset = this.tilesets[i] as TilemapTileset;
      let tileset = pixi.Assets.get<Tileset | undefined>(tilemapTileset.assetName);

      if (tileset instanceof Tileset && tilemapTileset.firstTileGid <= tileGid) {
        return tileset.getTile(tileGid - tilemapTileset.firstTileGid);
      }
    }

    return undefined;
  }
}
