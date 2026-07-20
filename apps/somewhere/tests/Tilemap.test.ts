import {describe, expect, test} from 'vitest';

import {
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  ROTATED_HEXAGONAL_120_FLAG,
} from '../source/engine/tiled/constants.js';
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

function createObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    height: 16,
    id: 1,
    name: 'door-a',
    rotation: 0,
    type: 'door',
    visible: true,
    width: 16,
    x: 32,
    y: 48,
    ...overrides,
  };
}

function createObjectLayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    draworder: 'topdown',
    id: 2,
    name: 'objects',
    objects: [createObject()],
    opacity: 1,
    type: 'objectgroup',
    visible: true,
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
    expect(tilemap.layers).toEqual([
      {
        class: undefined,
        tiles: [
          {gid: 1, flipHorizontal: false, flipVertical: false, flipDiagonal: false},
          {gid: 2, flipHorizontal: false, flipVertical: false, flipDiagonal: false},
        ],
      },
    ]);
    expect(tilemap.objectLayers).toEqual([]);
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
});

describe('Tilemap.from flip decode', () => {
  test.each([
    [0, false, false, false],
    [FLIPPED_HORIZONTALLY_FLAG, true, false, false],
    [FLIPPED_VERTICALLY_FLAG, false, true, false],
    [FLIPPED_HORIZONTALLY_FLAG + FLIPPED_VERTICALLY_FLAG, true, true, false],
    [FLIPPED_DIAGONALLY_FLAG, false, false, true],
    [FLIPPED_DIAGONALLY_FLAG + FLIPPED_HORIZONTALLY_FLAG, true, false, true],
    [FLIPPED_DIAGONALLY_FLAG + FLIPPED_VERTICALLY_FLAG, false, true, true],
    [
      FLIPPED_DIAGONALLY_FLAG + FLIPPED_HORIZONTALLY_FLAG + FLIPPED_VERTICALLY_FLAG,
      true,
      true,
      true,
    ],
  ])('decodes flags %i into H=%s V=%s D=%s with the gid stripped', async (flags, h, v, d) => {
    let tilemap = await Tilemap.from(
      createTiledTilemap({layers: [createTileLayer({data: [flags + 2, 1]})]}),
    );

    expect(tilemap.layers[0]!.tiles[0]).toEqual({
      gid: 2,
      flipHorizontal: h,
      flipVertical: v,
      flipDiagonal: d,
    });
  });

  test('throws in DEV on the hexagonal-120 rotation flag', async () => {
    let source = createTiledTilemap({
      layers: [createTileLayer({data: [1, ROTATED_HEXAGONAL_120_FLAG + 2]})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/hexagonal-120/);
  });
});

describe('Tilemap.from object layers', () => {
  test('parses a rectangle object into plain data', async () => {
    let tilemap = await Tilemap.from(
      createTiledTilemap({layers: [createTileLayer(), createObjectLayer()]}),
    );

    expect(tilemap.layers).toHaveLength(1);
    expect(tilemap.objectLayers).toEqual([
      {
        name: 'objects',
        objects: [
          {
            id: 1,
            name: 'door-a',
            type: 'door',
            x: 32,
            y: 48,
            width: 16,
            height: 16,
            point: false,
            properties: {},
          },
        ],
      },
    ]);
  });

  test('parses a point object (width/height 0, point true)', async () => {
    let source = createTiledTilemap({
      layers: [
        createObjectLayer({
          objects: [
            createObject({height: 0, point: true, type: 'spawn', width: 0, x: 152, y: 175}),
          ],
        }),
      ],
    });
    let tilemap = await Tilemap.from(source);

    expect(tilemap.objectLayers[0]!.objects[0]).toMatchObject({
      type: 'spawn',
      x: 152,
      y: 175,
      width: 0,
      height: 0,
      point: true,
    });
  });

  test('flattens properties: bool, int, float, string pass through; object becomes the referenced id; color and file become strings', async () => {
    let source = createTiledTilemap({
      layers: [
        createObjectLayer({
          objects: [
            createObject({
              properties: [
                {name: 'locked', type: 'bool', value: true},
                {name: 'count', type: 'int', value: 2},
                {name: 'speed', type: 'float', value: 1.5},
                {name: 'sound', type: 'string', value: 'chime'},
                {name: 'target', type: 'object', value: 3},
                {name: 'tint', type: 'color', value: '#ff00cc'},
                {name: 'clip', type: 'file', value: 'chime.wav'},
              ],
            }),
          ],
        }),
      ],
    });
    let tilemap = await Tilemap.from(source);

    expect(tilemap.objectLayers[0]!.objects[0]!.properties).toEqual({
      locked: true,
      count: 2,
      speed: 1.5,
      sound: 'chime',
      target: 3,
      tint: '#ff00cc',
      clip: 'chime.wav',
    });
  });

  test('throws in DEV on a class-typed property', async () => {
    let source = createTiledTilemap({
      layers: [
        createObjectLayer({
          objects: [
            createObject({
              properties: [{name: 'stats', type: 'class', propertytype: 'Stats', value: {}}],
            }),
          ],
        }),
      ],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported type "class"/);
  });

  test('skips invisible objects silently', async () => {
    let source = createTiledTilemap({
      layers: [createObjectLayer({objects: [createObject({visible: false})]})],
    });
    let tilemap = await Tilemap.from(source);

    expect(tilemap.objectLayers[0]!.objects).toEqual([]);
  });

  test.each([
    ['ellipse', {ellipse: true}],
    [
      'polygon',
      {
        polygon: [
          {x: 0, y: 0},
          {x: 8, y: 8},
          {x: 0, y: 8},
        ],
      },
    ],
    [
      'polyline',
      {
        polyline: [
          {x: 0, y: 0},
          {x: 8, y: 8},
        ],
      },
    ],
    ['text', {text: {text: 'hello'}}],
    ['tile object', {gid: 5}],
    ['template', {template: 'door.tx'}],
    ['rotation', {rotation: 45}],
  ])('throws in DEV on an unsupported object kind: %s', async (kind, overrides) => {
    let source = createTiledTilemap({
      layers: [createObjectLayer({objects: [createObject(overrides)]})],
    });

    await expect(Tilemap.from(source)).rejects.toThrow(/unsupported kind/);
  });

  test('captures the tile layer class', async () => {
    let tilemap = await Tilemap.from(
      createTiledTilemap({layers: [createTileLayer({class: 'entities'})]}),
    );

    expect(tilemap.layers[0]!.class).toBe('entities');
  });

  test('a tile layer without a class captures undefined', async () => {
    let tilemap = await Tilemap.from(createTiledTilemap());

    expect(tilemap.layers[0]!.class).toBeUndefined();
  });
});
