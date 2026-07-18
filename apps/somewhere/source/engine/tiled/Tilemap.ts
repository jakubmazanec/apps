import * as pixi from 'pixi.js';

import {type TiledProperty} from '../../tiled-tools/TiledProperty.js';
import {tiledTilemapSchema} from '../../tiled-tools/TiledTilemap.js';
import {failUnsupported} from '../utilities/failUnsupported.js';
import {getDiagonalFlip} from './getDiagonalFlip.js';
import {getGid} from './getGid.js';
import {getHorizontalFlip} from './getHorizontalFlip.js';
import {getRotatedHex120} from './getRotatedHex120.js';
import {getVerticalFlip} from './getVerticalFlip.js';
import {type TileGid, toTileGid} from './TileGid.js';
import {type TileGidWithFlags} from './TileGidWithFlags.js';
import {Tileset} from './Tileset.js';

export type TilemapTileset = {
  assetName: string;
  firstTileGid: TileGid;
};

export type TilemapLayerTile = {
  gid: TileGid; // flags stripped
  flipHorizontal: boolean;
  flipVertical: boolean;
  flipDiagonal: boolean;
};

export type TilemapLayer = {
  class: string | undefined; // Tiled layer class; marks the entity layer
  tiles: TilemapLayerTile[];
};

export type TilemapObject = {
  id: number; // Tiled object id, unique per map; door targets reference it
  name: string;
  type: string; // '' when unset; factories dispatch on this
  x: number; // art px; top-left for rects, the point itself for points
  y: number;
  width: number; // 0 for points
  height: number;
  point: boolean;
  properties: Record<string, boolean | number | string>;
};

export type TilemapObjectLayer = {
  name: string;
  objects: TilemapObject[];
};

export type TilemapOptions = {
  tileWidth: number;
  tileHeight: number;
  columnCount: number;
  rowCount: number;
  tilesets: TilemapTileset[];
  layers: TilemapLayer[];
  objectLayers: TilemapObjectLayer[];
};

// The flattening is lossy by design: an object-typed property becomes the
// referenced object id, indistinguishable from a plain count — id validation
// (door targets) is the safety net.
function normalizeProperties(
  tiledProperties: readonly TiledProperty[] | undefined,
): Record<string, boolean | number | string> {
  let properties: Record<string, boolean | number | string> = {};

  for (let tiledProperty of tiledProperties ?? []) {
    switch (tiledProperty.type) {
      case 'bool':
      case 'float':
      case 'int':
      case 'string': {
        properties[tiledProperty.name] = tiledProperty.value;

        break;
      }

      case 'class': {
        failUnsupported(
          `Property "${tiledProperty.name}" has unsupported type "class"! Use string, int, float, bool, color, file, or object properties. The property is dropped.`,
        );

        break;
      }

      case 'color':
      case 'file': {
        properties[tiledProperty.name] = tiledProperty.value as string;

        break;
      }

      case 'object': {
        // An object property's value is the referenced object's id.
        properties[tiledProperty.name] = tiledProperty.value as number;

        break;
      }
    }
  }

  return properties;
}

export class Tilemap {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly columnCount: number;
  readonly rowCount: number;

  readonly tilesets: readonly TilemapTileset[] = [];
  readonly layers: readonly TilemapLayer[] = [];
  readonly objectLayers: readonly TilemapObjectLayer[] = [];

  constructor({
    tileWidth,
    tileHeight,
    columnCount,
    rowCount,
    tilesets,
    layers,
    objectLayers,
  }: TilemapOptions) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.columnCount = columnCount;
    this.rowCount = rowCount;
    this.tilesets = tilesets;
    this.layers = layers;
    this.objectLayers = objectLayers;
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
    let objectLayers: TilemapObjectLayer[] = [];

    for (let tiledTilemapLayer of tiledTilemap.layers) {
      if (tiledTilemapLayer.type === 'objectgroup') {
        let objects: TilemapObject[] = [];

        for (let tiledObject of tiledTilemapLayer.objects) {
          // The standard Tiled way to keep disabled objects in a map.
          if (!tiledObject.visible) {
            continue;
          }

          if (
            tiledObject.ellipse ||
            tiledObject.polygon ||
            tiledObject.polyline ||
            tiledObject.text ||
            tiledObject.gid !== undefined ||
            tiledObject.template !== undefined ||
            (tiledObject.rotation ?? 0) !== 0
          ) {
            failUnsupported(
              `Object "${tiledObject.name}" (id ${tiledObject.id}) in layer "${tiledTilemapLayer.name}" has an unsupported kind! Only unrotated rectangles and points are supported; remove ellipses, polygons, polylines, text, tile objects, templates, and rotations. The object is skipped.`,
            );

            continue;
          }

          objects.push({
            id: tiledObject.id,
            name: tiledObject.name,
            type: tiledObject.type ?? '',
            x: tiledObject.x,
            y: tiledObject.y,
            width: tiledObject.width,
            height: tiledObject.height,
            point: tiledObject.point ?? false,
            properties: normalizeProperties(tiledObject.properties),
          });
        }

        objectLayers.push({name: tiledTilemapLayer.name, objects});

        continue;
      }

      if (tiledTilemapLayer.type !== 'tilelayer') {
        failUnsupported(
          `Layer "${tiledTilemapLayer.name}" has unsupported type "${tiledTilemapLayer.type}"! Only tile and object layers are supported; remove image and group layers from the map.`,
        );

        continue;
      }

      if (typeof tiledTilemapLayer.data === 'string') {
        failUnsupported(
          `Tile layer "${tiledTilemapLayer.name}" uses base64 (and/or compressed) data! Re-export the map from Tiled with "Tile Layer Format: CSV" (Map > Map Properties).`,
        );

        continue;
      }

      let tiles = tiledTilemapLayer.data.map((value, tileIndex) => {
        // The brand has no constructor, so the parse boundary casts once.
        let gidWithFlags = value as TileGidWithFlags;

        if (getRotatedHex120(gidWithFlags)) {
          failUnsupported(
            `Tile layer "${tiledTilemapLayer.name}" has a tile with the hexagonal-120 rotation flag (tile index ${tileIndex})! The flag only applies to hexagonal maps; remove the rotation in Tiled. The tile renders unrotated.`,
          );
        }

        return {
          gid: getGid(gidWithFlags),
          flipHorizontal: getHorizontalFlip(gidWithFlags),
          flipVertical: getVerticalFlip(gidWithFlags),
          flipDiagonal: getDiagonalFlip(gidWithFlags),
        };
      });

      layers.push({
        class: tiledTilemapLayer.class,
        tiles,
      });
    }

    return new this({
      tileWidth: tiledTilemap.tilewidth,
      tileHeight: tiledTilemap.tileheight,
      columnCount: tiledTilemap.width,
      rowCount: tiledTilemap.height,
      tilesets,
      layers,
      objectLayers,
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
