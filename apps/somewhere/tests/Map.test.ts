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
