import {Assets, type ISpritesheetFrameData, Rectangle, Spritesheet, Texture} from 'pixi.js';

import {tiledUnsourcedTilesetSchema} from '../tiled-tools.js';
import {type TileId, toTileId} from './TileId.js';

export type TilesetTile = {
  id: TileId;
  textures: Texture[];
  boundingBox?: Rectangle;
};

export type TilesetOptions = {
  tileWidth: number;
  tileHeight: number;
  columnCount: number;
  rowCount: number;
  tiles: TilesetTile[];
};

export class Tileset {
  protected tiles: TilesetTile[];

  tileWidth: number;
  tileHeight: number;
  columnCount: number;
  rowCount: number;

  constructor({tileWidth, tileHeight, columnCount, rowCount, tiles}: TilesetOptions) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.columnCount = columnCount;
    this.rowCount = rowCount;
    this.tiles = tiles;
  }

  static async from(source: unknown) {
    let tiledTileset = tiledUnsourcedTilesetSchema.parse(source);

    let frames: Record<string, ISpritesheetFrameData> = {};
    let animations: Record<string, string[]> = {};

    for (let i = 0; i < tiledTileset.tilecount; i++) {
      let tileId = i;
      let column = i % tiledTileset.columns;
      let row = Math.floor(i / tiledTileset.columns);

      frames[tileId] = {
        frame: {
          x: column * tiledTileset.tilewidth,
          y: row * tiledTileset.tileheight,
          w: tiledTileset.tilewidth,
          h: tiledTileset.tileheight,
        },
      };
    }

    for (let tiledTile of tiledTileset.tiles ?? []) {
      if (tiledTile.animation) {
        animations[tiledTile.id] = tiledTile.animation.map((animation) => `${animation.tileid}`);
      }
    }

    await Assets.load(tiledTileset.image);

    let spritesheet = new Spritesheet(Texture.from(tiledTileset.image), {
      frames,
      animations,
      meta: {
        scale: '1',
      },
    });

    await spritesheet.parse();

    let tiles: TilesetTile[] = [];

    for (let i = 0; i < tiledTileset.tilecount; i++) {
      let tileId = toTileId(i);
      let texture = spritesheet.textures[i];

      if (!texture) {
        throw new Error(`Texture "${i}" not found!`);
      }

      let tile: TilesetTile = {
        id: tileId,
        textures: [texture],
      };

      let textures = spritesheet.animations[i];

      if (textures) {
        tile.textures = textures;
      }

      tiles.push(tile);
    }

    if (tiledTileset.tiles) {
      for (let tilemapTile of tiledTileset.tiles) {
        let object = tilemapTile.objectgroup?.objects[0];

        if (object) {
          tiles[tilemapTile.id]!.boundingBox = new Rectangle(0, 0, 0, 0);
          tiles[tilemapTile.id]!.boundingBox!.x = object.x;
          tiles[tilemapTile.id]!.boundingBox!.y = object.y;
          tiles[tilemapTile.id]!.boundingBox!.width = object.width;
          tiles[tilemapTile.id]!.boundingBox!.height = object.height;
        }
      }
    }

    let tilesetOptions: TilesetOptions = {
      tileWidth: tiledTileset.tilewidth,
      tileHeight: tiledTileset.tileheight,
      columnCount: tiledTileset.columns,
      rowCount: Math.ceil(tiledTileset.tilecount / tiledTileset.columns),
      tiles,
    };

    return new this(tilesetOptions);
  }

  getTile(tileId: number): TilesetTile {
    let tile = this.tiles[tileId];

    if (!tile) {
      throw new Error(`Tile with ID "${tileId}" not found!`);
    }

    return tile;
  }
}
