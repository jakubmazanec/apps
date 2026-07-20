import * as pixi from 'pixi.js';

import {to2dArray} from '../../utilities/to2dArray.js';
import {failUnsupported} from '../utilities/failUnsupported.js';
import {Vector} from '../utilities/Vector.js';
import {Tilemap} from './Tilemap.js';

export type MapTile = {
  view: pixi.Container;
  collisionBoxes: pixi.Rectangle[]; // empty = no collision, cell-relative art px
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

  readonly entityLayerIndex: number;

  readonly #animatedSprites: pixi.AnimatedSprite[] = [];

  readonly columnCount: number;
  readonly rowCount: number;

  readonly width: number;
  readonly height: number;

  constructor({assetName}: MapOptions) {
    let tilemap = pixi.Assets.get<Tilemap | undefined>(assetName);

    if (!(tilemap instanceof Tilemap)) {
      throw new Error(`Tilemap "${assetName}" wasn't found!`);
    }

    // The single tile layer whose class is "entities": the collision source,
    // the y-sorted layer, and addToLayer's default. A stale export without
    // the marker degrades to index 1 (yesterday's hardcoded behavior) rather
    // than a collisionless map.
    let entityLayerIndexes = tilemap.layers.flatMap((tilemapLayer, index) =>
      tilemapLayer.class === 'entities' ? [index] : [],
    );

    if (entityLayerIndexes.length === 1) {
      this.entityLayerIndex = entityLayerIndexes[0]!;
    } else {
      failUnsupported(
        `Expected exactly one tile layer with class "entities", found ${entityLayerIndexes.length}! Set the class on the entity layer in Tiled (Layer > Layer Properties). Falling back to layer index 1.`,
      );

      this.entityLayerIndex = 1;
    }

    let layers: MapLayer[] = [];

    for (let tilemapLayer of tilemap.layers) {
      let layerView = new pixi.Container();
      let tiles: MapTile[] = [];

      for (let [tileIndex, layerTile] of tilemapLayer.tiles.entries()) {
        let tilesetTile = tilemap.getTile(layerTile.gid);
        let tile: MapTile = {view: new pixi.Container(), collisionBoxes: []};

        if (tilesetTile) {
          let sprite;

          if (tilesetTile.textures.length <= 1) {
            sprite = new pixi.Sprite(tilesetTile.textures[0]);
          } else {
            // Off Pixi's shared clock: mapSystem drives these via map.update()
            // on the world's update path, so a paused world freezes them by
            // construction (game UI design §3).
            let animatedSprite = new pixi.AnimatedSprite(tilesetTile.textures, false);

            animatedSprite.animationSpeed = 0.15;

            animatedSprite.play();

            this.#animatedSprites.push(animatedSprite);
            sprite = animatedSprite;
          }

          tile.view.addChild(sprite);

          let {flipHorizontal, flipVertical, flipDiagonal} = layerTile;

          // A diagonal flip is an x/y transpose; it has no home in a
          // non-square cell.
          if (flipDiagonal && tilemap.tileWidth !== tilemap.tileHeight) {
            failUnsupported(
              `A diagonally flipped tile sits on a non-square tile grid (${tilemap.tileWidth}x${tilemap.tileHeight})! Diagonal flips need square tiles; the tile renders untransposed.`,
            );

            flipDiagonal = false;
          }

          if (flipHorizontal || flipVertical || flipDiagonal) {
            // The flip combination becomes rotation plus scale signs on the
            // child sprite only: tile.view stays at the cell's top-left
            // corner, so camera math, the y-sort key, and motionSystem's
            // tile.view.x + box.x reads are untouched.
            sprite.anchor.set(0.5);
            sprite.position.set(tilemap.tileWidth / 2, tilemap.tileHeight / 2);

            // Tiled applies the diagonal flip (transpose) first, then
            // horizontal, then vertical.
            if (flipDiagonal) {
              sprite.angle = flipVertical && !flipHorizontal ? -90 : 90;
              sprite.scale.set(
                flipHorizontal && flipVertical ? -1 : 1,
                !flipHorizontal && !flipVertical ? -1 : 1,
              );
            } else {
              sprite.scale.set(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
            }
          }

          // Collision follows the art: the same D-then-H-then-V order,
          // applied within the cell.
          for (let tilesetBox of tilesetTile.collisionBoxes) {
            let box = tilesetBox.clone();

            if (flipDiagonal) {
              let {x, y, width, height} = box;

              box.x = y;
              box.y = x;
              box.width = height;
              box.height = width;
            }

            if (flipHorizontal) {
              box.x = tilemap.tileWidth - box.x - box.width;
            }

            if (flipVertical) {
              box.y = tilemap.tileHeight - box.y - box.height;
            }

            tile.collisionBoxes.push(box);
          }
        }

        let column = tileIndex % tilemap.columnCount;
        let row = Math.floor(tileIndex / tilemap.columnCount);

        tile.view.x = column * tilemap.tileWidth;
        tile.view.y = row * tilemap.tileHeight;

        // y-sort key: the max bottom edge over the collision boxes; boxless
        // tiles contribute 0, so their zIndex stays the bare row offset.
        let maxBottom = 0;

        for (let box of tile.collisionBoxes) {
          maxBottom = Math.max(maxBottom, box.y + box.height);
        }

        tile.view.zIndex = row * tilemap.tileHeight + maxBottom;

        layerView.addChild(tile.view);
        tiles.push(tile);
      }

      this.view.addChild(layerView);
      layers.push({
        view: layerView,
        tiles: to2dArray(tiles, tilemap.columnCount),
      });
    }

    // The entities-class layer (entityLayerIndex, addToLayer's default) is the entity layer: entity sprites are
    // inserted as siblings of its tiles, and both write the same y-sort key
    // to zIndex — the bottom edge of the collision box (tiles at construction
    // above, entities per frame in graphicsSystem). This flag makes Pixi
    // actually sort by it, so an entity can walk behind scenery. Other layers
    // keep insertion order: their stacking is layer-level by design (ground
    // below, overhead "air" above). The `false` writes are not redundant —
    // Pixi's addChild auto-flips sortableChildren on any container receiving
    // a child with nonzero zIndex (Container.addChild re-triggers
    // depthOfChildModified), so any layer with a nonzero-zIndex tile (row >= 1,
    // or row 0 with a collision box) arrives here already flipped true. The
    // reset holds only while a layer's children keep their zIndex: once
    // graphicsSystem writes an overlay sprite's zIndex (e.g. a wall-hit popup
    // in the top layer), Pixi re-flips that layer's flag and it sorts again.
    // T1.6's dedicated y-sorted RenderLayer is the durable fix; T2.16
    // addresses the per-frame sort cost over all layer-1 tiles.
    for (let [index, layer] of layers.entries()) {
      layer.view.sortableChildren = index === this.entityLayerIndex;
    }

    this.layers = layers;
    this.columnCount = tilemap.columnCount;
    this.rowCount = tilemap.rowCount;
    this.width = tilemap.columnCount * tilemap.tileWidth;
    this.height = tilemap.rowCount * tilemap.tileHeight;
  }

  // The topmost tile layer; foreground effects (e.g. hit sparks) render here so they sit above
  // the overhead ("air") layers instead of being occluded by them.
  get topLayerIndex(): number {
    return this.layers.length - 1;
  }

  addToLayer(view: pixi.Container, layerIndex = this.entityLayerIndex) {
    this.layers[layerIndex]?.view.addChild(view);
  }

  removeFromLayer(view: pixi.Container, layerIndex = this.entityLayerIndex) {
    this.layers[layerIndex]?.view.removeChild(view);
  }

  /** Advance the animated tile sprites on world time; `mapSystem` calls this once per frame. */
  update(ticker: pixi.Ticker) {
    for (let sprite of this.#animatedSprites) {
      sprite.update(ticker);
    }
  }
}
