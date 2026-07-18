import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {Map} from '../source/engine/tiled/Map.js';
import {toTileGid} from '../source/engine/tiled/TileGid.js';
import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tilemap, type TilemapLayerTile} from '../source/engine/tiled/Tilemap.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';

function tile(gid: number): TilemapLayerTile {
  return {gid: toTileGid(gid), flipHorizontal: false, flipVertical: false, flipDiagonal: false};
}

function flippedTile(
  gid: number,
  flips: {h?: boolean; v?: boolean; d?: boolean},
): TilemapLayerTile {
  return {
    gid: toTileGid(gid),
    flipHorizontal: flips.h ?? false,
    flipVertical: flips.v ?? false,
    flipDiagonal: flips.d ?? false,
  };
}

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
      {id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []},
      {id: toTileId(1), textures: FRAMES, collisionBoxes: []},
    ],
  });
  let tilemap = new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [{class: 'entities', tiles: [tile(1), tile(2)]}],
    objectLayers: [],
  });

  // The whole-function cast sidesteps Assets.get's overload typing in the spy.
  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap : tileset) as never);
}

// A 1x2 map with two layers: layer 0 (ground) and layer 1 (the entity layer,
// addToLayer's default). Layer 1's row-1 tile carries a collision box, so its
// zIndex sort key is row * tileHeight + box.y + box.height
// = 16 + 8 + 8 = 32.
function stubDepthSortAssets() {
  let tileset = new Tileset({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 1,
    rowCount: 2,
    tiles: [
      {id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []},
      {
        id: toTileId(1),
        textures: [pixi.Texture.WHITE],
        collisionBoxes: [new pixi.Rectangle(0, 8, 16, 8)],
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
      {class: undefined, tiles: [tile(1), tile(1)]}, // ground
      {class: 'entities', tiles: [tile(1), tile(2)]}, // entity layer; row 1 has the collision-box tile
    ],
    objectLayers: [],
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

  test('the y-sort key is the max bottom edge over all collision boxes', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [
        {
          id: toTileId(0),
          textures: [pixi.Texture.WHITE],
          collisionBoxes: [new pixi.Rectangle(0, 2, 16, 4), new pixi.Rectangle(0, 5, 16, 6)],
        },
      ],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 2,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [{class: 'entities', tiles: [tile(1), tile(1)]}],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);

    let map = new Map({assetName: 'map'});

    // row 1 offset 16 + max(2 + 4, 5 + 6) = 27.
    expect(map.layers[0]!.tiles[0]![1]!.view.zIndex).toBe(27);
  });

  test('a boxless tile keeps the bare row offset as its y-sort key', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});

    expect(map.layers[0]!.tiles[0]![1]!.view.zIndex).toBe(16);
  });
});

function stubFlipAssets(
  tiles: TilemapLayerTile[],
  options: {tileHeight?: number; collisionBoxes?: pixi.Rectangle[]} = {},
) {
  let tileset = new Tileset({
    tileWidth: 16,
    tileHeight: options.tileHeight ?? 16,
    columnCount: 1,
    rowCount: 1,
    tiles: [
      {
        id: toTileId(0),
        textures: [pixi.Texture.WHITE],
        collisionBoxes: options.collisionBoxes ?? [],
      },
    ],
  });
  let tilemap = new Tilemap({
    tileWidth: 16,
    tileHeight: options.tileHeight ?? 16,
    columnCount: tiles.length,
    rowCount: 1,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [{class: 'entities', tiles}],
    objectLayers: [],
  });

  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap : tileset) as never);
}

describe('Map flip rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([
    [{}, 0, 1, 1],
    [{h: true}, 0, -1, 1],
    [{v: true}, 0, 1, -1],
    [{h: true, v: true}, 0, -1, -1],
    [{d: true}, 90, 1, -1],
    [{d: true, h: true}, 90, 1, 1],
    [{d: true, v: true}, -90, 1, 1],
    [{d: true, h: true, v: true}, 90, -1, 1],
  ])('flips %o render as angle %i, scale (%i, %i)', (flips, angle, scaleX, scaleY) => {
    stubFlipAssets([flippedTile(1, flips)]);

    let map = new Map({assetName: 'map'});
    let sprite = map.layers[0]!.tiles[0]![0]!.view.children[0] as pixi.Sprite;

    expect(sprite.angle).toBe(angle);
    expect(sprite.scale.x).toBe(scaleX);
    expect(sprite.scale.y).toBe(scaleY);
  });

  test('a flipped sprite is centered in its cell; an unflipped one keeps the top-left default', () => {
    stubFlipAssets([flippedTile(1, {h: true}), flippedTile(1, {})]);

    let map = new Map({assetName: 'map'});
    let flipped = map.layers[0]!.tiles[0]![0]!.view.children[0] as pixi.Sprite;
    let plain = map.layers[0]!.tiles[1]![0]!.view.children[0] as pixi.Sprite;

    expect(flipped.anchor.x).toBe(0.5);
    expect(flipped.anchor.y).toBe(0.5);
    expect(flipped.position.x).toBe(8);
    expect(flipped.position.y).toBe(8);
    expect(plain.anchor.x).toBe(0);
    expect(plain.position.x).toBe(0);
  });

  test.each([
    // Box (0, 12, 16, 4): a bottom strip.
    [{}, {x: 0, y: 12, width: 16, height: 4}], // identity: unchanged
    [{h: true}, {x: 0, y: 12, width: 16, height: 4}], // horizontally symmetric box: unchanged
    [{v: true}, {x: 0, y: 0, width: 16, height: 4}], // flips to a top strip
    [
      {h: true, v: true},
      {x: 0, y: 0, width: 16, height: 4},
    ], // H is a no-op here; V lifts it to a top strip
    [{d: true}, {x: 12, y: 0, width: 4, height: 16}], // transposes to a right-edge pole
    [
      {d: true, v: true},
      {x: 12, y: 0, width: 4, height: 16},
    ], // D makes a right-edge, full-height pole, so V is then a no-op; a
    // V-before-D order bug would instead produce a LEFT-edge pole
    [
      {d: true, h: true},
      {x: 0, y: 0, width: 4, height: 16},
    ], // rotate-right: left-edge pole
    [
      {d: true, h: true, v: true},
      {x: 0, y: 0, width: 4, height: 16},
    ], // D then H moves the pole to the left edge; V is then a no-op
  ])('collision boxes follow the art under flips %o', (flips, expected) => {
    stubFlipAssets([flippedTile(1, flips)], {
      collisionBoxes: [new pixi.Rectangle(0, 12, 16, 4)],
    });

    let map = new Map({assetName: 'map'});

    expect(map.layers[0]!.tiles[0]![0]!.collisionBoxes[0]).toMatchObject(expected);
  });

  test('the y-sort key uses the transformed boxes', () => {
    // D transposes (2, 0, 4, 16) to (0, 2, 16, 4): bottom edge 6, where the
    // untransformed box's bottom edge is 16.
    stubFlipAssets([flippedTile(1, {d: true})], {
      collisionBoxes: [new pixi.Rectangle(2, 0, 4, 16)],
    });

    let map = new Map({assetName: 'map'});

    // row 0 offset 0 + transposed bottom edge 2 + 4.
    expect(map.layers[0]!.tiles[0]![0]!.view.zIndex).toBe(6);
  });

  test('throws in DEV on a diagonal flip when tiles are not square', () => {
    expect(() => {
      stubFlipAssets([flippedTile(1, {d: true})], {tileHeight: 8});

      return new Map({assetName: 'map'});
    }).toThrow(/non-square/);
  });
});

describe('Map entity-layer marker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('resolves entityLayerIndex to the single entities-class layer', () => {
    stubDepthSortAssets();

    let map = new Map({assetName: 'map'});

    expect(map.entityLayerIndex).toBe(1);
  });

  test('throws in DEV when no tile layer carries class "entities"', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [{id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []}],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [{class: undefined, tiles: [tile(1)]}],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);

    expect(() => new Map({assetName: 'map'})).toThrow(/exactly one tile layer/);
  });

  test('throws in DEV when two tile layers carry class "entities"', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [{id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []}],
    });
    let tilemap = new Tilemap({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
      layers: [
        {class: 'entities', tiles: [tile(1)]},
        {class: 'entities', tiles: [tile(1)]},
      ],
      objectLayers: [],
    });

    vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
      name === 'map' ? tilemap : tileset) as never);

    expect(() => new Map({assetName: 'map'})).toThrow(/exactly one tile layer/);
  });
});
