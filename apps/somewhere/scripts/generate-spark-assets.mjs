// Generates public/spark.png + public/spark.json — a warm-yellow diamond at
// its true art-px size (4×4; the runtime pixelScale reproduces the old 16×16
// device-px footprint). The old sub-art-pixel diamond detail is gone — one of
// the migration's two flagged deliberate visual changes.
//
// The eight duplicated animation keys are load-bearing: graphicsSystem picks a
// sprite name from velocity direction and Sprite.show throws on a missing name
// (see the TODO in source/game/wallHitPopupSystem.ts).
//
// Idempotent — re-running overwrites both files with identical bytes.
// Usage: node scripts/generate-spark-assets.mjs

import {encode} from 'fast-png';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SIZE = 4; // art px
const CHANNELS = 4; // RGBA

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));

let center = (SIZE - 1) / 2;
let radius = SIZE / 2;
let data = new Uint8Array(SIZE * SIZE * CHANNELS);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (Math.abs(x - center) + Math.abs(y - center) <= radius) {
      data.set([255, 220, 40, 255], (y * SIZE + x) * CHANNELS);
    }
  }
}

let spriteNames = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

writeFileSync(
  join(publicDir, 'spark.png'),
  encode({width: SIZE, height: SIZE, data, channels: CHANNELS}),
);
writeFileSync(
  join(publicDir, 'spark.json'),
  `${JSON.stringify(
    {
      frames: {1: {frame: {x: 0, y: 0, w: SIZE, h: SIZE}}},
      meta: {image: 'spark.png'},
      animations: Object.fromEntries(spriteNames.map((name) => [name, ['1']])),
    },
    null,
    2,
  )}\n`,
);
// eslint-disable-next-line no-console -- one-shot generator script feedback
console.log(`wrote public/spark.png (${SIZE}x${SIZE}) and public/spark.json`);
