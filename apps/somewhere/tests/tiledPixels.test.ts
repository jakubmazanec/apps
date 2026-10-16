import {encode} from 'fast-png';
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {
  assertPngWithinBounds,
  type ReadImageOptions,
  readTilesetImage,
} from '../tools/tiled-pipeline/pixels.js';

const BASE_OPTIONS: ReadImageOptions = {
  tileWidth: 16,
  tileHeight: 16,
  margin: 0,
  spacing: 0,
  solidAlphaThreshold: 255,
};

// A 2x1-tile, 32x16 atlas: tile 0 has one opaque pixel at (1, 2), one
// half-alpha pixel at (3, 4) and one opaque colour-key pixel at (5, 6);
// tile 1 is empty.
function syntheticAtlas(): Uint8Array {
  let data = new Uint8Array(32 * 16 * 4);
  let put = (x: number, y: number, rgba: [number, number, number, number]) => {
    data.set(rgba, (y * 32 + x) * 4);
  };

  put(1, 2, [10, 20, 30, 255]);
  put(3, 4, [10, 20, 30, 128]);
  put(5, 6, [255, 0, 204, 255]);

  return encode({width: 32, height: 16, data, channels: 4, depth: 8});
}

function readReal(): Uint8Array {
  return readFileSync(new URL('../assets/tileset.png', import.meta.url));
}

// A standards-valid grayscale+alpha PNG: fast-png decodes this to channels === 2,
// which this module does not support.
function syntheticGrayscaleAlphaAtlas(): Uint8Array {
  let data = new Uint8Array(32 * 16 * 2);

  return encode({width: 32, height: 16, data, channels: 2, depth: 8});
}

describe(readTilesetImage, () => {
  test('recomputes the grid from the image with Tiled’s formula', () => {
    let image = readTilesetImage(readReal(), BASE_OPTIONS);

    expect(image.width).toBe(1024);
    expect(image.height).toBe(1024);
    expect(image.columns).toBe(64);
    expect(image.rows).toBe(64);
    expect(image.tileCount).toBe(4096);
  });

  test('reports the alpha profile of the real atlas', () => {
    let image = readTilesetImage(readReal(), BASE_OPTIONS);

    expect([...image.alphaLevels.keys()].sort((a, b) => a - b)).toStrictEqual([0, 76, 102, 255]);
    expect(image.alphaLevels.get(255)).toBe(156_332);
    expect(image.alphaLevels.get(102)).toBe(1686);
  });

  test('classifies only fully opaque, non-colour-key pixels as solid at the default threshold', () => {
    let image = readTilesetImage(syntheticAtlas(), {
      ...BASE_OPTIONS,
      transparentColor: '#ff00cc',
    });
    let mask = image.getTileMask(0);

    expect(mask.solid[2 * 16 + 1]).toBe(true); // opaque
    expect(mask.solid[4 * 16 + 3]).toBe(false); // alpha 128 < 255
    expect(mask.solid[6 * 16 + 5]).toBe(false); // colour key
    expect(image.getTileMask(1).solid.some(Boolean)).toBe(false);
  });

  test('a lower threshold admits the half-alpha pixel but never the colour key', () => {
    let image = readTilesetImage(syntheticAtlas(), {
      ...BASE_OPTIONS,
      solidAlphaThreshold: 1,
      transparentColor: '#ff00cc',
    });
    let mask = image.getTileMask(0);

    expect(mask.solid[4 * 16 + 3]).toBe(true);
    expect(mask.solid[6 * 16 + 5]).toBe(false);
  });

  test('without a transparentcolor the colour-key pixel is ordinary art', () => {
    let mask = readTilesetImage(syntheticAtlas(), BASE_OPTIONS).getTileMask(0);

    expect(mask.solid[6 * 16 + 5]).toBe(true);
  });

  test('getTilePixels returns the tile’s RGBA block', () => {
    let pixels = readTilesetImage(syntheticAtlas(), BASE_OPTIONS).getTilePixels(0);

    expect(pixels).toHaveLength(16 * 16 * 4);
    expect([...pixels.subarray((2 * 16 + 1) * 4, (2 * 16 + 1) * 4 + 4)]).toStrictEqual([
      10, 20, 30, 255,
    ]);
  });

  test.each([
    ['nonzero margin', {margin: 1}, /margin/],
    ['nonzero spacing', {spacing: 1}, /spacing/],
    ['a size the tile grid does not divide', {tileWidth: 5}, /divisible/],
  ])('rejects %s', (unused, overrides, pattern) => {
    expect(() => readTilesetImage(syntheticAtlas(), {...BASE_OPTIONS, ...overrides})).toThrow(
      pattern,
    );
  });

  test('rejects a non-RGBA (channels !== 4) PNG', () => {
    expect(() => readTilesetImage(syntheticGrayscaleAlphaAtlas(), BASE_OPTIONS)).toThrow(
      /channels/,
    );
  });
});

describe(assertPngWithinBounds, () => {
  test('accepts the real atlas', () => {
    expect(() => assertPngWithinBounds(readReal())).not.toThrow();
  });

  test('rejects a header claiming an absurd size before any decoding happens', () => {
    let bytes = Uint8Array.from(readReal());
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    view.setUint32(16, 100_000);
    view.setUint32(20, 100_000);

    expect(() => assertPngWithinBounds(bytes)).toThrow(/too large/);
  });

  test('rejects a file that is not a PNG', () => {
    expect(() => assertPngWithinBounds(new Uint8Array(32))).toThrow(/PNG/);
  });
});
