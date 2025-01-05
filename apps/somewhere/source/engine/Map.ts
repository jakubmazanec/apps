import * as pixi from 'pixi.js';

import {to2dArray} from '../utilities/to2dArray.js';
import {Tilemap} from './Tilemap.js';
import {Vector} from './Vector.js';

export type MapTile = {
  view: pixi.Container;
  boundingBox?: pixi.Rectangle;
};

export type MapLayer = {
  view: pixi.Container;
  tiles: MapTile[][];
};

export type MapOptions = {
  assetName: string;
};

export class Map {
  position: Vector = new Vector(0, 0);

  readonly view: pixi.Container = new pixi.Container();

  readonly layers: MapLayer[];

  readonly columnCount: number;
  readonly rowCount: number;

  readonly width: number;
  readonly height: number;

  constructor({assetName}: MapOptions) {
    let tilemap = pixi.Assets.get<Tilemap | undefined>(assetName);

    if (!(tilemap instanceof Tilemap)) {
      throw new Error(`Tilemap "${assetName}" wasn't found!`);
    }

    let layers: MapLayer[] = [];

    for (let tilemapLayer of tilemap.layers) {
      let layerView = new pixi.Container();
      let tiles: MapTile[] = [];

      layerView.sortableChildren = true;

      for (let [tileIndex, tileGid] of tilemapLayer.tileGids.entries()) {
        let tilesetTile = tilemap.getTile(tileGid);
        let tile: MapTile = {
          view: new pixi.Container(),
        };

        if (tilesetTile) {
          if (tilesetTile.textures.length <= 1) {
            tile.view.addChild(new pixi.Sprite(tilesetTile.textures[0]));
          } else {
            let animatedSprite = new pixi.AnimatedSprite(tilesetTile.textures);

            animatedSprite.animationSpeed = 0.15;

            animatedSprite.play();

            tile.view.addChild(animatedSprite);
          }

          if (tilesetTile.boundingBox) {
            tile.boundingBox = tilesetTile.boundingBox.clone();
          }
        }

        let column = tileIndex % tilemap.columnCount;
        let row = Math.floor(tileIndex / tilemap.columnCount);

        tile.view.x = column * tilemap.tileWidth;
        tile.view.y = row * tilemap.tileHeight;
        tile.view.zIndex =
          row * tilemap.tileHeight + (tile.boundingBox?.y ?? 0) + (tile.boundingBox?.height ?? 0);

        layerView.addChild(tile.view);
        tiles.push(tile);
      }

      this.view.addChild(layerView);
      layers.push({
        view: layerView,
        tiles: to2dArray(tiles, tilemap.columnCount),
      });
    }

    this.layers = layers;
    this.columnCount = tilemap.columnCount;
    this.rowCount = tilemap.rowCount;
    this.width = tilemap.columnCount * tilemap.tileWidth;
    this.height = tilemap.rowCount * tilemap.tileHeight;
  }

  addToLayer(view: pixi.Container) {
    this.layers[1]?.view.addChild(view);
  }

  removeFromLayer(view: pixi.Container) {
    this.layers[1]?.view.removeChild(view);
  }
}
