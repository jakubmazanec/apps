import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {computeCollisionBox} from '../tools/tiled-pipeline/collision.js';
import {readTilesetImage, type TileMask} from '../tools/tiled-pipeline/pixels.js';

// Each row string is one row of the tile; '#' is solid, '.' is not.
function maskFrom(rows: string[]): TileMask {
  return {
    width: rows[0]!.length,
    height: rows.length,
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- `row` is plain ASCII mask fixture text ('#'/'.'), no emoji/combining characters to mishandle
    solid: rows.flatMap((row) => [...row].map((character) => character === '#')),
  };
}

function realImage() {
  return readTilesetImage(readFileSync(new URL('../assets/tileset.png', import.meta.url)), {
    tileWidth: 16,
    tileHeight: 16,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: 255,
    transparentColor: '#ff00cc',
  });
}

describe(computeCollisionBox, () => {
  test('bbox uses inclusive arithmetic', () => {
    let mask = maskFrom(['....', '.##.', '.##.', '....']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toStrictEqual({x: 1, y: 1, width: 2, height: 2});
  });

  test('a single solid pixel is a 1x1 box', () => {
    let mask = maskFrom(['....', '..#.', '....', '....']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toStrictEqual({x: 2, y: 1, width: 1, height: 1});
  });

  test('a full-width prop keeps the full width', () => {
    let mask = maskFrom(['####', '####', '####', '####']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toStrictEqual({x: 0, y: 0, width: 4, height: 4});
  });

  test('an empty mask yields nothing', () => {
    let mask = maskFrom(['....', '....']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toBeUndefined();
    expect(computeCollisionBox(mask, 'footprint', 8)).toBeUndefined();
    expect(computeCollisionBox(mask, 'none', 8)).toBeUndefined();
  });

  test('full covers the whole tile even when the art does not', () => {
    let mask = maskFrom(['....', '..#.', '....', '....']);

    expect(computeCollisionBox(mask, 'full', 8)).toStrictEqual({x: 0, y: 0, width: 4, height: 4});
  });

  test('full covers the whole tile of an empty mask too', () => {
    let mask = maskFrom(['....', '....']);

    expect(computeCollisionBox(mask, 'full', 8)).toStrictEqual({x: 0, y: 0, width: 4, height: 2});
  });

  test('none never emits', () => {
    let mask = maskFrom(['####', '####']);

    expect(computeCollisionBox(mask, 'none', 8)).toBeUndefined();
  });

  test('footprint computes its span within the band, not over the whole tile', () => {
    // A signpost: a wide board over a narrow post. The whole-tile span would
    // give width 6 at the post's height; the band-restricted span gives 2.
    let mask = maskFrom(['######', '######', '..##..', '..##..', '..##..', '..##..']);

    expect(computeCollisionBox(mask, 'footprint', 4)).toStrictEqual({
      x: 2,
      y: 2,
      width: 2,
      height: 4,
    });
  });

  test('footprint does not clamp above the first solid row', () => {
    let mask = maskFrom(['....', '....', '.##.', '.##.']);

    expect(computeCollisionBox(mask, 'footprint', 8)).toStrictEqual({
      x: 1,
      y: 2,
      width: 2,
      height: 2,
    });
  });

  test('footprint and bbox agree when nothing overhangs', () => {
    let mask = maskFrom(['....', '.##.', '.##.', '....']);

    expect(computeCollisionBox(mask, 'footprint', 8)).toStrictEqual(
      computeCollisionBox(mask, 'bbox', 8),
    );
  });

  // The only ground truth available: a rule that contradicts it is wrong until
  // argued otherwise. 7 of 8 reproduce exactly; tile 193's author rounded up
  // over a shadow row.
  test.each([
    [64, {x: 2, y: 8, width: 12, height: 8}],
    [66, {x: 2, y: 8, width: 12, height: 8}],
    [128, {x: 2, y: 0, width: 14, height: 16}],
    [129, {x: 0, y: 12, width: 16, height: 4}],
    [130, {x: 0, y: 0, width: 14, height: 16}],
    [192, {x: 2, y: 0, width: 14, height: 11}],
    [193, {x: 0, y: 0, width: 16, height: 7}],
    [194, {x: 0, y: 0, width: 14, height: 11}],
  ])('bbox reproduces the hand-authored box on tile %i', (tileId, expected) => {
    expect(computeCollisionBox(realImage().getTileMask(tileId), 'bbox', 8)).toStrictEqual(expected);
  });

  test('the band-restricted span saves tile 1281 from 11px of phantom collision', () => {
    expect(computeCollisionBox(realImage().getTileMask(1281), 'footprint', 8)).toStrictEqual({
      x: 0,
      y: 8,
      width: 5,
      height: 8,
    });
  });
});
