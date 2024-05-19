import * as pixi from 'pixi.js';

import {tiledTilemapSchema} from '../tiled-tools.js';
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

    let tilesets: TilemapTileset[] = [];

    for (let tiledTilemapTileset of tiledTilemap.tilesets) {
      if (tiledTilemapTileset.source) {
        tilesets.push({
          assetName: tiledTilemapTileset.source,
          firstTileGid: toTileGid(tiledTilemapTileset.firstgid),
        });
      }
    }

    let layers: TilemapLayer[] = [];

    for (let tiledTilemapLayer of tiledTilemap.layers) {
      if (tiledTilemapLayer.type === 'tilelayer' && Array.isArray(tiledTilemapLayer.data)) {
        let tileGids = tiledTilemapLayer.data.map((gid) => getGid(toTileGid(gid)));

        layers.push({
          tileGids,
        });
      }
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
