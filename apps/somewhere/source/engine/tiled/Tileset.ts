import {Assets, Rectangle, Spritesheet, type SpritesheetFrameData, Texture} from 'pixi.js';

import {tiledUnsourcedTilesetSchema} from '../tiled-tools/TiledTileset.js';
import {failUnsupported} from '../utilities/failUnsupported.js';
import {type TileId, toTileId} from './TileId.js';

export type TilesetTile = {
  id: TileId;
  textures: Texture[];
  frameDurations?: number[]; // parallel to textures; absent on static tiles
  collisionBoxes: Rectangle[]; // empty = no collision
};

export type TilesetOptions = {
  tileWidth: number;
  tileHeight: number;
  columnCount: number;
  rowCount: number;
  tiles: TilesetTile[];
};

export class Tileset {
  /** TBD */
  columnCount: number;

  /** TBD */
  rowCount: number;

  /** TBD */
  tileHeight: number;

  /** TBD */
  tileWidth: number;

  /** TBD */
  readonly #tiles: TilesetTile[];

  constructor({tileWidth, tileHeight, columnCount, rowCount, tiles}: TilesetOptions) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.columnCount = columnCount;
    this.rowCount = rowCount;
    this.#tiles = tiles;
  }

  /** TBD */
  static async from(source: unknown) {
    let tiledTileset = tiledUnsourcedTilesetSchema.parse(source);
    let frames: Record<string, SpritesheetFrameData> = {};
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

    let frameDurations: Record<number, number[]> = {};

    for (let tiledTile of tiledTileset.tiles ?? []) {
      if (tiledTile.animation) {
        animations[tiledTile.id] = tiledTile.animation.map((animation) => `${animation.tileid}`);
        frameDurations[tiledTile.id] = tiledTile.animation.map((animation) => animation.duration);
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
        collisionBoxes: [],
      };
      let textures = spritesheet.animations[i];
      let durations = frameDurations[i];

      if (textures) {
        tile.textures = textures;
      }

      if (durations) {
        tile.frameDurations = durations;
      }

      tiles.push(tile);
    }

    if (tiledTileset.tiles) {
      for (let tilemapTile of tiledTileset.tiles) {
        for (let object of tilemapTile.objectgroup?.objects ?? []) {
          if (
            object.ellipse ||
            object.polygon ||
            object.polyline ||
            object.text ||
            object.point ||
            object.gid !== undefined ||
            (object.rotation ?? 0) !== 0
          ) {
            failUnsupported(
              `Tile ${tilemapTile.id} has a non-rectangle shape in its collision group! Only unrotated rectangles are supported; the rectangles are kept.`,
            );

            continue;
          }

          tiles[tilemapTile.id]!.collisionBoxes.push(
            new Rectangle(object.x, object.y, object.width, object.height),
          );
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

  /** TBD */
  getTile(tileId: number): TilesetTile {
    let tile = this.#tiles[tileId];

    if (!tile) {
      throw new Error(`Tile with ID "${tileId}" not found!`);
    }

    return tile;
  }
}
