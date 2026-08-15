import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Spriteset, spritesetSchema} from '../source/engine/graphics/Spriteset.js';
import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';

const VALID = {
  image: 'character.png',
  frames: {
    '1': {x: 0, y: 0, width: 16, height: 20},
    '2': {x: 16, y: 0, width: 16, height: 20},
    banner: {x: 0, y: 20, width: 146, height: 26, borders: {left: 3, top: 1, right: 3, bottom: 3}},
  },
  animations: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
    'walking-down': {frames: ['1', '2']},
    spin: {frames: ['2', '1'], speed: 0.3, loop: false},
  },
};

describe('spritesetSchema', () => {
  test('parses a valid file and applies defaults', () => {
    let result = spritesetSchema.parse(VALID);

    expect(result.animations['walking-down']).toEqual({
      frames: ['1', '2'],
      speed: 0.15,
      loop: true,
    });
    expect(result.animations.spin).toEqual({frames: ['2', '1'], speed: 0.3, loop: false});
  });

  test('animations key is optional (static sheets)', () => {
    let result = spritesetSchema.parse({
      image: 'ui.png',
      frames: {a: {x: 0, y: 0, width: 4, height: 4}},
    });

    expect(result.animations).toEqual({});
  });

  test('rejects an animation referencing a missing frame', () => {
    let invalid = {...VALID, animations: {bad: {frames: ['99']}}};

    expect(spritesetSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects non-positive speed', () => {
    let invalid = {...VALID, animations: {bad: {frames: ['1'], speed: 0}}};

    expect(spritesetSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects borders that do not fit inside the frame', () => {
    let invalid = {
      image: 'ui.png',
      frames: {
        a: {x: 0, y: 0, width: 4, height: 4, borders: {left: 2, top: 0, right: 2, bottom: 0}},
      },
    };

    expect(spritesetSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects unknown keys (strict)', () => {
    expect(spritesetSchema.safeParse({...VALID, meta: {image: 'x.png'}}).success).toBe(false);

    let typo = {
      image: 'ui.png',
      frames: {
        a: {x: 0, y: 0, width: 4, height: 4, border: {left: 1, top: 1, right: 1, bottom: 1}},
      },
    };

    expect(spritesetSchema.safeParse(typo).success).toBe(false);
  });

  test('rejects the old Pixi spritesheet format', () => {
    let old = {
      frames: {'1': {frame: {x: 0, y: 0, w: 16, h: 20}}},
      meta: {image: 'character.png'},
      // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
      animations: {'standing-down': ['1']},
    };

    expect(spritesetSchema.safeParse(old).success).toBe(false);
  });
});

describe(Spriteset, () => {
  test('constructor stores textures and animations', () => {
    let spriteset = new Spriteset({textures: {}, animations: {}});

    expect(spriteset.textures).toEqual({});
    expect(spriteset.animations).toEqual({});
  });
});

// A fake tileset the same shape as public/character-tileset.json (12
// columns, 16x20 tiles, 384 tiles / 32 characters). Each tile's texture is
// tagged with its own tile id so tests can assert on frame identity without
// real Pixi textures.
function createCharacterTileset(): Tileset {
  let tiles = Array.from({length: 384}, (_, id) => ({
    id: toTileId(id),
    textures: [{tileId: id} as unknown as pixi.Texture],
    collisionBoxes: [],
  }));

  return new Tileset({tileWidth: 16, tileHeight: 20, columnCount: 12, rowCount: 32, tiles});
}

// Same tile count as createCharacterTileset, but sliced into a different
// column count — the shape a mismatched (non-SuperRetroWorld) tileset would
// have.
function createTilesetWithColumnCount(columnCount: number): Tileset {
  let tiles = Array.from({length: 384}, (_, id) => ({
    id: toTileId(id),
    textures: [{tileId: id} as unknown as pixi.Texture],
    collisionBoxes: [],
  }));

  return new Tileset({
    tileWidth: 16,
    tileHeight: 20,
    columnCount,
    rowCount: Math.ceil(384 / columnCount),
    tiles,
  });
}

function tileIds(textures: pixi.Texture[]): number[] {
  return textures.map((texture) => (texture as unknown as {tileId: number}).tileId);
}

describe('Spriteset.fromTileset', () => {
  test('packIndex 1 sits at the atlas origin: down/left/right/up in that row order', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 1);

    expect(tileIds(spriteset.animations['walking-down']!.textures)).toEqual([0, 1, 2]);
    expect(tileIds(spriteset.animations['standing-down']!.textures)).toEqual([1]);
    expect(tileIds(spriteset.animations['walking-left']!.textures)).toEqual([12, 13, 14]);
    expect(tileIds(spriteset.animations['walking-right']!.textures)).toEqual([24, 25, 26]);
    expect(tileIds(spriteset.animations['walking-up']!.textures)).toEqual([36, 37, 38]);
  });

  test('every walking/standing animation loops; the frame speed matches the hand-authored sheets', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 1);

    expect(spriteset.animations['walking-down']).toMatchObject({loop: true, speed: 0.15});
    expect(spriteset.animations['standing-down']).toMatchObject({loop: true, speed: 0.15});
  });

  test('spin cycles the 4 standing frames down/left/up/right, one-shot at 0.3', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 1);

    // Standing frames: down=1, left=13, up=37, right=25 (tile row offsets
    // 0/1/3/2 x 12 columns + column offset 1).
    expect(tileIds(spriteset.animations.spin!.textures)).toEqual([1, 13, 37, 25]);
    expect(spriteset.animations.spin).toMatchObject({loop: false, speed: 0.3});
  });

  // packIndex 14 is Mira (assets.ts); origin verified against
  // public/character-tileset.png (see the design doc).
  test('packIndex 14 (Mira) crosses into the second combined sheet', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 14);

    expect(tileIds(spriteset.animations['walking-down']!.textures)).toEqual([147, 148, 149]);
    expect(tileIds(spriteset.animations['walking-left']!.textures)).toEqual([159, 160, 161]);
    expect(tileIds(spriteset.animations['walking-right']!.textures)).toEqual([171, 172, 173]);
    expect(tileIds(spriteset.animations['walking-up']!.textures)).toEqual([183, 184, 185]);
  });

  // packIndex 27 is the player (assets.ts); origin verified against
  // public/character-tileset.png (see the design doc).
  test('packIndex 27 (player) crosses into the fourth combined sheet', () => {
    let spriteset = Spriteset.fromTileset(createCharacterTileset(), 27);

    expect(tileIds(spriteset.animations['walking-down']!.textures)).toEqual([294, 295, 296]);
    expect(tileIds(spriteset.animations['walking-left']!.textures)).toEqual([306, 307, 308]);
    expect(tileIds(spriteset.animations['walking-right']!.textures)).toEqual([318, 319, 320]);
    expect(tileIds(spriteset.animations['walking-up']!.textures)).toEqual([330, 331, 332]);
  });

  test('throws for a packIndex outside 1-32', () => {
    let tileset = createCharacterTileset();

    expect(() => Spriteset.fromTileset(tileset, 0)).toThrow(/packIndex/);
    expect(() => Spriteset.fromTileset(tileset, 33)).toThrow(/packIndex/);
    expect(() => Spriteset.fromTileset(tileset, 1.5)).toThrow(/packIndex/);
  });

  test('throws when the tileset column count does not match the pack layout', () => {
    let tileset = createTilesetWithColumnCount(6);

    expect(() => Spriteset.fromTileset(tileset, 1)).toThrow(/columns/);
  });
});
