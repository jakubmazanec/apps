import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {Map} from '../source/engine/tiled/Map.js';
import {toTileGid} from '../source/engine/tiled/TileGid.js';
import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tilemap} from '../source/engine/tiled/Tilemap.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';

// Three-frame animation at the engine's 0.15 animation speed: a deltaTime of 7
// advances 7 * 0.15 = 1.05 — exactly one frame per update() call.
const FRAMES = [pixi.Texture.WHITE, pixi.Texture.WHITE, pixi.Texture.WHITE];

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// Map resolves its Tilemap (and the Tilemap its Tilesets) through Assets.get
// and checks them with instanceof, so the stubs are real instances: a 1x2 map
// whose first tile is static and second is animated.
function stubAssets() {
  let tileset = new Tileset({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tiles: [
      {id: toTileId(0), textures: [pixi.Texture.WHITE]},
      {id: toTileId(1), textures: FRAMES},
    ],
  });
  let tilemap = new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [{tileGids: [toTileGid(1), toTileGid(2)]}],
  });

  // The whole-function cast sidesteps Assets.get's overload typing in the spy.
  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap : tileset) as never);
}

// A 1x2 map with two layers: layer 0 (ground) and layer 1 (the entity layer,
// addToLayer's default). Layer 1's row-1 tile carries a collision box, so its
// zIndex sort key is row * tileHeight + boundingBox.y + boundingBox.height
// = 16 + 8 + 8 = 32.
function stubDepthSortAssets() {
  let tileset = new Tileset({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tiles: [
      {id: toTileId(0), textures: [pixi.Texture.WHITE]},
      {
        id: toTileId(1),
        textures: [pixi.Texture.WHITE],
        boundingBox: new pixi.Rectangle(0, 8, 16, 8),
      },
    ],
  });
  let tilemap = new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [
      {tileGids: [toTileGid(1), toTileGid(1)]}, // ground
      {tileGids: [toTileGid(1), toTileGid(2)]}, // entity layer; row 1 has the collision-box tile
    ],
  });

  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap : tileset) as never);
}

describe('Map', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('animated tile sprites are off the shared clock (autoUpdate: false) and playing', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});
    let animated = map.layers[0]!.tiles[0]![1]!.view.children[0] as pixi.AnimatedSprite;

    expect(animated).toBeInstanceOf(pixi.AnimatedSprite);
    expect(animated.autoUpdate).toBeFalsy();
    expect(animated.playing).toBeTruthy();
  });

  test('static tiles stay plain sprites', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});
    let staticTile = map.layers[0]!.tiles[0]![0]!.view.children[0];

    expect(staticTile).toBeInstanceOf(pixi.Sprite);
    expect(staticTile).not.toBeInstanceOf(pixi.AnimatedSprite);
  });

  test('update() advances animated tiles; without it they hold, then resume', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});
    let animated = map.layers[0]!.tiles[0]![1]!.view.children[0] as pixi.AnimatedSprite;

    expect(animated.currentFrame).toBe(0);

    map.update(tick(7));

    expect(animated.currentFrame).toBe(1);

    // Holds between driven updates; the next driven update resumes from the
    // held frame.
    map.update(tick(7));

    expect(animated.currentFrame).toBe(2);
  });
});

describe('Map depth sorting (entity layer)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('only the entity layer (index 1) sorts its children by zIndex', () => {
    stubDepthSortAssets();

    let map = new Map({assetName: 'map'});

    expect(map.layers[1]!.view.sortableChildren).toBeTruthy();
    expect(map.layers[0]!.view.sortableChildren).toBeFalsy();
  });

  test('an entity draws behind a tile while its feet are above the tile collision-box bottom, in front once below', () => {
    stubDepthSortAssets();

    let map = new Map({assetName: 'map'});
    let layer = map.layers[1]!;
    let tileView = layer.tiles[0]![1]!.view; // row 1: zIndex 16 + 8 + 8 = 32

    // The entity enters the same container graphicsSystem uses and writes the
    // same sort key: position.y + boundingBox.y + boundingBox.height.
    let entityView = new pixi.Container();
    let boundingBox = new pixi.Rectangle(0, 12, 16, 4);

    map.addToLayer(entityView);

    // Feet at 12 + 12 + 4 = 28 < 32: renders behind the tile.
    entityView.position.y = 12;
    entityView.zIndex = entityView.position.y + boundingBox.y + boundingBox.height;
    layer.view.sortChildren();

    expect(layer.view.getChildIndex(entityView)).toBeLessThan(layer.view.getChildIndex(tileView));

    // Feet at 20 + 12 + 4 = 36 > 32: renders in front.
    entityView.position.y = 20;
    entityView.zIndex = entityView.position.y + boundingBox.y + boundingBox.height;
    layer.view.sortChildren();

    expect(layer.view.getChildIndex(entityView)).toBeGreaterThan(
      layer.view.getChildIndex(tileView),
    );
  });
});
