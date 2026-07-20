import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';

// A 1-column x 2-row tileset (16x32 image): tile 0 static, tile 1 animated
// (frames 0 -> 1) and carrying a collision box.
function createTiledTileset(): Record<string, unknown> {
  return {
    columns: 1,
    image: 'tileset.png',
    imageheight: 32,
    imagewidth: 16,
    margin: 0,
    name: 'test',
    spacing: 0,
    tilecount: 2,
    tiledversion: '1.10.2',
    tileheight: 16,
    tilewidth: 16,
    type: 'tileset',
    version: '1.10',
    tiles: [
      {
        id: 1,
        animation: [
          {duration: 100, tileid: 0},
          {duration: 100, tileid: 1},
        ],
        objectgroup: {
          draworder: 'index',
          id: 2,
          name: '',
          objects: [
            {
              height: 8,
              id: 1,
              name: '',
              rotation: 0,
              type: '',
              visible: true,
              width: 16,
              x: 0,
              y: 8,
            },
            {
              height: 4,
              id: 2,
              name: '',
              rotation: 0,
              type: '',
              visible: true,
              width: 6,
              x: 10,
              y: 0,
            },
          ],
          opacity: 1,
          type: 'objectgroup',
          visible: true,
          x: 0,
          y: 0,
        },
      },
    ],
  };
}

// Tileset.from loads the tileset image through Assets.load + Texture.from;
// stub both so the spritesheet parses against an in-memory 16x32 source.
function stubImage() {
  vi.spyOn(pixi.Assets, 'load').mockResolvedValue(undefined as never);
  vi.spyOn(pixi.Texture, 'from').mockReturnValue(
    new pixi.Texture({source: new pixi.TextureSource({width: 16, height: 32})}),
  );
}

describe('Tileset.from', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses dimensions and gives every tile a texture', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.tileWidth).toBe(16);
    expect(tileset.tileHeight).toBe(16);
    expect(tileset.columnCount).toBe(1);
    expect(tileset.rowCount).toBe(2);
    expect(tileset.getTile(0).textures).toHaveLength(1);
  });

  test('an animated tile gets one texture per animation frame', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.getTile(1).textures).toHaveLength(2);
  });

  test('every collision rectangle is collected; tiles without an objectgroup get an empty array', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.getTile(1).collisionBoxes).toHaveLength(2);
    expect(tileset.getTile(1).collisionBoxes[0]).toMatchObject({x: 0, y: 8, width: 16, height: 8});
    expect(tileset.getTile(1).collisionBoxes[1]).toMatchObject({x: 10, y: 0, width: 6, height: 4});
    expect(tileset.getTile(0).collisionBoxes).toEqual([]);
  });

  test('throws in DEV on a non-rectangle shape in a collision group', async () => {
    stubImage();

    let source = createTiledTileset() as {tiles: Array<{objectgroup: {objects: unknown[]}}>};

    source.tiles[0]!.objectgroup.objects.push({
      ellipse: true,
      height: 8,
      id: 3,
      name: '',
      rotation: 0,
      type: '',
      visible: true,
      width: 8,
      x: 0,
      y: 0,
    });

    await expect(Tileset.from(source)).rejects.toThrow(/collision group/);
  });
});

describe('Tileset.getTile', () => {
  test('throws on an unknown tile id', () => {
    let tileset = new Tileset({
      tileWidth: 16,
      tileHeight: 16,
      columnCount: 1,
      rowCount: 1,
      tiles: [{id: toTileId(0), textures: [pixi.Texture.WHITE], collisionBoxes: []}],
    });

    expect(() => tileset.getTile(1)).toThrow('Tile with ID "1" not found!');
  });
});
