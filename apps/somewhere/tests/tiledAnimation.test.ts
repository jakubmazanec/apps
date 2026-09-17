import {describe, expect, test} from 'vitest';

import {
  animatedTileIds,
  buildAnimationFrames,
  validateAnimationRegions,
} from '../tools/tiled-pipeline/animation.js';

describe(buildAnimationFrames, () => {
  test('lays the frames out in atlas order at the region duration', () => {
    expect(buildAnimationFrames({start: 256, frames: 4, duration: 150})).toStrictEqual([
      {tileid: 256, duration: 150},
      {tileid: 257, duration: 150},
      {tileid: 258, duration: 150},
      {tileid: 259, duration: 150},
    ]);
  });
});

describe(animatedTileIds, () => {
  test('is the set of carrier tiles, not of every frame', () => {
    expect(
      animatedTileIds([
        {start: 256, frames: 4, duration: 150},
        {start: 300, frames: 2, duration: 90},
      ]),
    ).toStrictEqual(new Set([256, 300]));
  });
});

describe(validateAnimationRegions, () => {
  test('accepts adjacent, in-range regions', () => {
    expect(
      validateAnimationRegions(
        [
          {start: 0, frames: 4, duration: 150},
          {start: 4, frames: 2, duration: 150},
        ],
        16,
      ),
    ).toStrictEqual([]);
  });

  test('rejects a run that leaves the atlas', () => {
    expect(validateAnimationRegions([{start: 14, frames: 4, duration: 150}], 16)).toHaveLength(1);
    expect(validateAnimationRegions([{start: 14, frames: 4, duration: 150}], 16)[0]).toMatch(
      /out of range/,
    );
  });

  test('rejects overlapping regions', () => {
    expect(
      validateAnimationRegions(
        [
          {start: 0, frames: 4, duration: 150},
          {start: 3, frames: 2, duration: 150},
        ],
        16,
      )[0],
    ).toMatch(/overlap/);
  });

  test('rejects a single-frame run and a non-integer duration', () => {
    expect(validateAnimationRegions([{start: 0, frames: 1, duration: 150}], 16)[0]).toMatch(
      /at least 2/,
    );
    expect(validateAnimationRegions([{start: 0, frames: 2, duration: 1.5}], 16)[0]).toMatch(
      /positive integer/,
    );
  });

  test('reports every problem in one pass', () => {
    expect(
      validateAnimationRegions(
        [
          {start: 0, frames: 1, duration: 0},
          {start: 100, frames: 2, duration: 150},
        ],
        16,
      ).length,
    ).toBeGreaterThan(2);
  });
});
