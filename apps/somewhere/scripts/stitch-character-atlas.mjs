// Stitches the 4 combined character sheets from the SuperRetroWorld
// character pack (8 characters each, 192x160 RGBA, 16x20 tiles) into one
// 192x640 atlas covering all 32 characters, stacked in numeric order. The
// pack ships no single atlas for its characters the way the exterior/interior
// packs do for tiles, so this is a one-off preprocessing step ahead of
// sync-tilesets, which then reconciles collision/animation data against
// assets/character-tileset.tsx from the result.
//
// Idempotent — re-running overwrites assets/character-tileset.png with
// identical bytes.
// Usage: node scripts/stitch-character-atlas.mjs

import {decode, encode} from 'fast-png';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHANNELS = 4; // RGBA
const SHEET_NAMES = [
  'character_1-8.png',
  'character_9-16.png',
  'character_17-24.png',
  'character_25-32.png',
];
let packDir = fileURLToPath(
  new URL('../assets/extracted/super-retro-world-character-pack-full/sprite/', import.meta.url),
);
let assetsDir = fileURLToPath(new URL('../assets/', import.meta.url));
let sheets = SHEET_NAMES.map((name) => {
  let png = decode(readFileSync(join(packDir, name)));

  if (png.depth !== 8 || png.channels !== 4) {
    throw new Error(
      `${name}: expected 8-bit RGBA, got depth ${png.depth} with ${png.channels} channels!`,
    );
  }

  return {name, width: png.width, height: png.height, data: png.data};
});
let {width} = sheets[0];

for (let sheet of sheets) {
  if (sheet.width !== width) {
    throw new Error(
      `${sheet.name}: width ${sheet.width} does not match ${sheets[0].name}'s ${width}!`,
    );
  }
}

let height = sheets.reduce((sum, sheet) => sum + sheet.height, 0);
let atlas = new Uint8Array(width * height * CHANNELS);
let y = 0;

for (let sheet of sheets) {
  atlas.set(sheet.data, y * width * CHANNELS);
  y += sheet.height;
}

writeFileSync(
  join(assetsDir, 'character-tileset.png'),
  encode({width, height, data: atlas, channels: CHANNELS}),
);
// eslint-disable-next-line no-console -- one-shot generator script feedback
console.log(`wrote assets/character-tileset.png (${width}x${height})`);
