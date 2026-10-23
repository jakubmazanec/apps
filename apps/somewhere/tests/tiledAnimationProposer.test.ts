import {encode} from 'fast-png';
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {readTilesetImage} from '../tools/tiled-pipeline/pixels.js';
import {compareTiles, proposeAnimationRegions} from '../tools/tiled-pipeline/propose.js';

// Every fixture atlas is 8 tiles wide, 1 tile tall, 16px tiles.
function atlasFrom(painters: Array<(put: (x: number, y: number, rgba: number[]) => void) => void>) {
  let width = painters.length * 16;
  let data = new Uint8Array(width * 16 * 4);

  painters.forEach((paint, tileIndex) => {
    paint((x, y, rgba) => {
      data.set(rgba, (y * width + tileIndex * 16 + x) * 4);
    });
  });

  return readTilesetImage(encode({width, height: 16, data, channels: 4, depth: 8}), {
    tileWidth: 16,
    tileHeight: 16,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: 255,
  });
}

// A 12x12 body of one colour, with an optional 2x2 "flame" patch that moves.
function body(color: number[], flame?: {x: number; y: number; color: number[]}) {
  return (put: (x: number, y: number, rgba: number[]) => void) => {
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        put(x, y, color);
      }
    }

    if (flame) {
      let {x: flameX, y: flameY} = flame;

      for (let y = flameY; y < flameY + 2; y++) {
        for (let x = flameX; x < flameX + 2; x++) {
          put(x, y, flame.color);
        }
      }
    }
  };
}

function empty() {
  return () => {
    // nothing painted
  };
}

// A 6x6 patch of one colour on a transparent tile. Adjacent animation frames
// redraw the same sprite in a new pose, so two blobs at disjoint positions
// model a frame pair: same palette, almost every union pixel changed.
function blob(x: number, y: number, color: number[] = [230, 120, 40, 255]) {
  return (put: (x: number, y: number, rgba: number[]) => void) => {
    for (let py = y; py < y + 6; py++) {
      for (let px = x; px < x + 6; px++) {
        put(px, py, color);
      }
    }
  };
}

describe(compareTiles, () => {
  test('identical tiles differ by 0 and are flagged as a duplicate pair', () => {
    let image = atlasFrom([body([10, 20, 30, 255]), body([10, 20, 30, 255])]);
    let comparison = compareTiles(image.getTilePixels(0), image.getTilePixels(1));

    expect(comparison.difference).toBe(0);
  });

  test('a small localized change is a small difference', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255], {x: 3, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 5, y: 3, color: [255, 0, 0, 255]}),
    ]);

    expect(compareTiles(image.getTilePixels(0), image.getTilePixels(1)).difference).toBeLessThan(
      0.1,
    );
  });

  test('a whole-sprite recolour is flagged, however it scores', () => {
    let image = atlasFrom([body([10, 20, 30, 255]), body([200, 40, 60, 255])]);

    expect(compareTiles(image.getTilePixels(0), image.getTilePixels(1)).isRecolour).toBe(true);
  });

  test('a localized change is not a recolour', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255], {x: 3, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 5, y: 3, color: [255, 0, 0, 255]}),
    ]);

    expect(compareTiles(image.getTilePixels(0), image.getTilePixels(1)).isRecolour).toBe(false);
  });
});

describe(proposeAnimationRegions, () => {
  test('finds a four-frame run of rearranged same-palette frames', () => {
    let image = atlasFrom([empty(), blob(2, 2), blob(8, 8), blob(2, 8), blob(8, 2), empty()]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([
      {start: 1, frames: 4, duration: 150},
    ]);
  });

  test('rejects variant runs, whose frames differ too little', () => {
    // The old detector called this an animation: a static body with a small
    // patch that moves. On the real atlas that shape is furniture and roof
    // slices (couch 0.44, tent 0.59), not frames — real frames rearrange most
    // of the sprite (fire measures 0.77-1.0).
    let image = atlasFrom([
      empty(),
      body([10, 20, 30, 255], {x: 3, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 5, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 7, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 9, y: 3, color: [255, 0, 0, 255]}),
      empty(),
    ]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([]);
  });

  test('rejects neighbours that share no palette, however much they differ', () => {
    let image = atlasFrom([
      empty(),
      blob(2, 2, [230, 120, 40, 255]),
      blob(8, 8, [40, 80, 230, 255]),
      blob(2, 8, [230, 120, 40, 255]),
      empty(),
    ]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([]);
  });

  test('rejects a recolour family, which is what a naive detector reports', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255]),
      body([40, 50, 60, 255]),
      body([70, 80, 90, 255]),
      body([100, 110, 120, 255]),
    ]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0})).toStrictEqual([]);
  });

  test('rejects duplicate tiles, which differ by exactly 0', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255]),
      body([10, 20, 30, 255]),
      body([10, 20, 30, 255]),
    ]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([]);
  });

  test('rejects a run that closes on its first frame', () => {
    let image = atlasFrom([empty(), blob(2, 2), blob(8, 8), blob(2, 2), empty()]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([]);
  });

  // buildAnimationFrames emits region.start + index, so a region is a contiguous
  // span and cannot reference a tile id twice. Baking the reversed frames into
  // consecutive tiles is the only way to author a ping-pong for this tool, so
  // the proposer has to accept that layout.
  test('accepts a ping-pong run, which does not close on its first frame', () => {
    let image = atlasFrom([empty(), blob(2, 2), blob(8, 8), blob(2, 8), blob(8, 8), empty()]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([
      {start: 1, frames: 4, duration: 150},
    ]);
  });

  test('will not start a run on an empty tile', () => {
    let image = atlasFrom([empty(), empty(), empty()]);

    expect(proposeAnimationRegions({image, minimumFrameDifference: 0.7})).toStrictEqual([]);
  });

  test('proposes the four real fire strips and no furniture on the real atlas', () => {
    let image = readTilesetImage(readFileSync(new URL('../assets/tileset.png', import.meta.url)), {
      tileWidth: 16,
      tileHeight: 16,
      margin: 0,
      spacing: 0,
      solidAlphaThreshold: 255,
      transparentColor: '#ff00cc',
    });
    let proposals = proposeAnimationRegions({image, minimumFrameDifference: 0.7});

    // The atlas's fire is four 6-frame strips: tiny sparks (353), small flames
    // (417), medium flames (481), large flames (545), stacked one atlas row
    // apart so a 2-tile-tall fire reads top strip over bottom strip.
    for (let start of [353, 417, 481, 545]) {
      expect(proposals).toContainEqual({start, frames: 6, duration: 150});
    }

    // The furniture and roof segment runs that a similarity ceiling mistakes
    // for animations (left/middle/right slices of tents, couches, awnings)
    // must not come back: their adjacent slices differ far less than real
    // frames do.
    for (let start of [69, 133, 192, 197, 581, 645]) {
      expect(proposals.find((proposal) => proposal.start === start)).toBeUndefined();
    }
  });
});
