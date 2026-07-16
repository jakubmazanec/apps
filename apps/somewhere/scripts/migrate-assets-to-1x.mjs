/* eslint-disable no-console -- one-shot migration script feedback */
// One-shot ×4 → 1× migration of public/ (runtime pixel scale, T1.5), in spec
// order: backup, audit, lossless downscale, numeric ÷4. NOT idempotent by
// design — the ×4-bake preconditions abort a second run loudly. Afterwards run
// the generators and delete the standalone UI PNGs (plan Task 10):
//   node scripts/migrate-assets-to-1x.mjs
//   node scripts/generate-ui-atlas.mjs
//   node scripts/generate-spark-assets.mjs

import {decode, encode} from 'fast-png';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  assertUniformBlocks,
  downscaleNearest,
  scaleCharacterJson,
  scaleFntContent,
  scaleMapJson,
  scaleTilesetJson,
} from './asset-migration.mjs';

const BLOCK = 4;

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let assetsDir = fileURLToPath(new URL('./assets/', import.meta.url));

/** @param {string} name */
function readImage(name) {
  let png = decode(readFileSync(join(publicDir, name)));

  if (png.depth !== 8 || png.channels !== 4) {
    throw new Error(
      `${name}: expected 8-bit RGBA, got depth ${png.depth} with ${png.channels} channels!`,
    );
  }

  return {width: png.width, height: png.height, channels: 4, data: png.data};
}

/**
 * @param {string} path
 * @param {{width: number, height: number, data: Uint8Array}} image
 */
function writeImage(path, {width, height, data}) {
  writeFileSync(path, encode({width, height, data, channels: 4}));
  console.log(`wrote ${path} (${width}x${height})`);
}

// —— 1. Backup first, mandatory: outside the repo and the Docker build
// context. An existing backup means a previous (possibly partial) run already
// touched public/ — never overwrite the pristine pre-migration copy.
let backupDir = join(tmpdir(), 'somewhere-public-backup');

if (existsSync(backupDir)) {
  throw new Error(
    `Backup directory ${backupDir} already exists — this migration ran before. Restore public/ from git (the primary rollback) or from the backup, delete the directory, then re-run!`,
  );
}

cpSync(publicDir, backupDir, {recursive: true});
console.log(`backed up public/ to ${backupDir}`);

// —— 2. Preconditions (the assets are still the ×4 bake) and the block audit.
let map = JSON.parse(readFileSync(join(publicDir, 'map.json'), 'utf8'));
let tileset = JSON.parse(readFileSync(join(publicDir, 'tileset.json'), 'utf8'));
let character = JSON.parse(readFileSync(join(publicDir, 'character.json'), 'utf8'));
let fonts = ['monogram.fnt', 'monogram-outline.fnt'].map((name) => ({
  name,
  content: readFileSync(join(publicDir, name), 'utf8'),
}));

if (map.tilewidth !== 64 || tileset.tilewidth !== 64) {
  throw new Error(
    `Expected the ×4 bake (tilewidth 64), found map ${map.tilewidth} / tileset ${tileset.tilewidth} — already migrated?`,
  );
}

for (let {name, content} of fonts) {
  if (!content.includes('size="48"')) {
    throw new Error(`${name}: expected the ×4 bake (size="48") — already migrated?`);
  }
}

let downscaleTargets = [
  'tileset.png',
  'character.png',
  'monogram_0.png',
  'monogram-outline_0.png',
  'banner.png',
  'banner-hover.png',
  'banner-active.png',
];
let images = new Map(downscaleTargets.map((name) => [name, readImage(name)]));

for (let [name, image] of images) {
  assertUniformBlocks(image, BLOCK, name);
}

console.log(`audit passed: ${downscaleTargets.length} PNGs are uniform ${BLOCK}x${BLOCK} blocks`);

// —— 3. Downscale ÷4 (nearest, lossless given the audit). The hand-made 1×
// banners become generator source art in scripts/assets/ — public/ keeps only
// shipped assets (the banner ships inside the ui atlas from Task 9 on).
mkdirSync(assetsDir, {recursive: true});

for (let [name, image] of images) {
  let isBanner = name.startsWith('banner');

  writeImage(join(isBanner ? assetsDir : publicDir, name), downscaleNearest(image, BLOCK));

  if (isBanner) {
    rmSync(join(publicDir, name));
  }
}

// —— 4. Numeric ÷4 with the divisibility guard.
writeFileSync(
  join(publicDir, 'map.json'),
  `${JSON.stringify(scaleMapJson(map, BLOCK), null, 2)}\n`,
);
writeFileSync(
  join(publicDir, 'tileset.json'),
  `${JSON.stringify(scaleTilesetJson(tileset, BLOCK), null, 2)}\n`,
);
writeFileSync(
  join(publicDir, 'character.json'),
  `${JSON.stringify(scaleCharacterJson(character, BLOCK), null, 2)}\n`,
);

for (let {name, content} of fonts) {
  writeFileSync(join(publicDir, name), scaleFntContent(content, 1 / BLOCK));
  console.log(`scaled ${name} by 1/${BLOCK}`);
}

console.log('numeric ÷4 done — now run the generators (see the header comment)');
