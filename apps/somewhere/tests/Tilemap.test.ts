import {describe, expect, test} from 'vitest';

import {FLIPPED_HORIZONTALLY_FLAG} from '../source/engine/tiled/constants.js';
import {Tilemap} from '../source/engine/tiled/Tilemap.js';

// Minimal valid orthogonal Tiled map: 2x1 tiles, one CSV tile layer, one
// external tileset. Tests override fields to produce each unsupported input.
function createTileLayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: [1, 2],
    encoding: 'csv',
    height: 1,
    id: 1,
    name: 'ground',
    opacity: 1,
    type: 'tilelayer',
    visible: true,
    width: 2,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function createTiledTilemap(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    compressionlevel: -1,
    height: 1,
    infinite: false,
    layers: [createTileLayer()],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 16,
    tilesets: [{firstgid: 1, source: 'tileset.tsx'}],
    tilewidth: 16,
    type: 'map',
    version: '1.10',
    width: 2,
    ...overrides,
  };
}

describe('Tilemap.from', () => {
  test('parses a finite CSV map with an external tileset', async () => {
    let tilemap = await Tilemap.from(createTiledTilemap());

    expect(tilemap.tileWidth).toBe(16);
    expect(tilemap.tileHeight).toBe(16);
    expect(tilemap.columnCount).toBe(2);
    expect(tilemap.rowCount).toBe(1);
    expect(tilemap.tilesets).toEqual([{assetName: 'tileset.tsx', firstTileGid: 1}]);
    expect(tilemap.layers).toEqual([{tileGids: [1, 2]}]);
  });

  test('throws in DEV on an infinite map', async () => {
    await expect(Tilemap.from(createTiledTilemap({infinite: true}))).rejects.toThrow(
      /Infinite tilemaps are not supported/,
    );
  });

  test('throws in DEV on an embedded tileset', async () => {
    let source = createTiledTilemap({
      tilesets: [
        {
          columns: 1,
          firstgid: 1,
          image: 'tileset.png',
          imageheight: 16,
          imagewidth: 16,
          margin: 0,
          name: 'embedded',
          spacing: 0,
          tilecount: 1,
          tiledversion: '1.10.2',
          tileheight: 16,
          tilewidth: 16,
          type: 'tileset',
          version: '1.10',
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/Embedded tilesets are not supported/);
  });

  test('throws in DEV on base64 layer data', async () => {
    let source = createTiledTilemap({
      layers: [createTileLayer({data: 'eJxjZGBgYAQAAAwAAw==', encoding: 'base64'})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/Tile Layer Format: CSV/);
  });

  test('throws in DEV on an object layer', async () => {
    let source = createTiledTilemap({
      layers: [
        {
          id: 2,
          name: 'objects',
          objects: [],
          opacity: 1,
          type: 'objectgroup',
          visible: true,
          x: 0,
          y: 0,
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "objectgroup"/);
  });

  test('throws in DEV on an image layer', async () => {
    let source = createTiledTilemap({
      layers: [
        {
          id: 3,
          image: 'background.png',
          name: 'background',
          opacity: 1,
          type: 'imagelayer',
          width: 32,
          x: 0,
          y: 0,
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "imagelayer"/);
  });

  test('throws in DEV on a group layer', async () => {
    let source = createTiledTilemap({
      layers: [
        {
          id: 4,
          layers: [],
          name: 'group',
          opacity: 1,
          type: 'group',
          width: 32,
          x: 0,
          y: 0,
        },
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "group"/);
  });

  test('throws in DEV on a tile GID carrying flip/rotation flags', async () => {
    let source = createTiledTilemap({
      layers: [createTileLayer({data: [1, FLIPPED_HORIZONTALLY_FLAG + 2]})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/flipped or rotated tile/);
  });
});
