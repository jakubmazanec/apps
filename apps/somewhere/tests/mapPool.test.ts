import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {toTileGid} from '../source/engine/tiled/TileGid.js';
import {Tilemap} from '../source/engine/tiled/Tilemap.js';
import {LevelComponent} from '../source/game/LevelComponent.js';
import {getMapPool} from '../source/game/mapPool.js';

// A real all-empty Tilemap (gid 0 renders nothing, so Map never touches a
// tileset asset) with the single entities-class layer Map requires.
function stubTilemap(): Tilemap {
  return new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 2,
    rowCount: 2,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [
      {
        class: 'entities',
        tiles: Array.from({length: 4}, () => ({
          gid: toTileGid(0),
          flipHorizontal: false,
          flipVertical: false,
          flipDiagonal: false,
        })),
      },
    ],
    objectLayers: [],
  });
}

describe(getMapPool, () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('same name returns the same pool; a destroyed entity is reused with its position reset', () => {
    vitest.spyOn(pixi.Assets, 'get').mockImplementation((() => stubTilemap()) as never);

    let pool = getMapPool('map');

    expect(getMapPool('map')).toBe(pool);

    let entity = pool.create();

    entity.getComponent(LevelComponent).map.position.set(5, 7);
    pool.destroy(entity);

    let reused = pool.create();

    expect(reused).toBe(entity);
    expect(reused.getComponent(LevelComponent).map.position.x).toBe(0);
    expect(reused.getComponent(LevelComponent).map.position.y).toBe(0);
  });

  test('different names get different pools', () => {
    vitest.spyOn(pixi.Assets, 'get').mockImplementation((() => stubTilemap()) as never);

    expect(getMapPool('map')).not.toBe(getMapPool('shop-interior'));
  });
});
