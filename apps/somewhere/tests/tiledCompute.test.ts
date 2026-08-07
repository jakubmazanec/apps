import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {computeAll, computeTileset} from '../tools/tiled-pipeline/compute.js';
import {loadConfig, tilesetsConfigSchema} from '../tools/tiled-pipeline/config.js';
import {readTilesetImage} from '../tools/tiled-pipeline/pixels.js';
import {reconcile} from '../tools/tiled-pipeline/reconcile.js';
import {formatTsx, parseTsx} from '../tools/tiled-pipeline/tsx.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';

// A throwaway app root holding only what the pipeline reads and writes, so a
// test can mutate sources without touching the working tree.
// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'tiled-pipeline-'));

  mkdirSync(join(appRoot, 'assets'));
  mkdirSync(join(appRoot, 'public'));
  cpSync(join(realAppRoot, 'assets/tileset.tsx'), join(appRoot, 'assets/tileset.tsx'));
  cpSync(join(realAppRoot, 'assets/tileset.png'), join(appRoot, 'assets/tileset.png'));
  cpSync(join(realAppRoot, 'public/tileset.json'), join(appRoot, 'public/tileset.json'));
  cpSync(join(realAppRoot, 'public/tileset.png'), join(appRoot, 'public/tileset.png'));
  cpSync(join(realAppRoot, 'tilesets.config.json'), join(appRoot, 'tilesets.config.json'));
});

// eslint-disable-next-line vitest/require-top-level-describe -- global afterEach shared by all describe blocks
afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe(computeTileset, () => {
  test('the committed artifacts are already up to date under the committed config', () => {
    let computed = computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!);

    expect(computed.drift).toStrictEqual([]);
    expect(computed.warnings).toStrictEqual([]);
  });

  test('is idempotent at the byte seam, with a re-parse in between', () => {
    let tileset = loadConfig(appRoot).tilesets[0]!;
    let once = computeTileset(appRoot, tileset).sourceText;

    writeFileSync(join(appRoot, 'assets/tileset.tsx'), once);

    expect(computeTileset(appRoot, tileset).sourceText).toBe(once);
  }, 30000);

  test('converges across a simulated Tiled save', () => {
    let config = tilesetsConfigSchema.parse({
      tilesets: [
        {
          name: 'tileset',
          source: 'assets/tileset.tsx',
          image: 'assets/tileset.png',
          output: 'public/tileset.json',
          outputImage: 'public/tileset.png',
          collision: {regions: [{range: [64, 66], mode: 'bbox'}]},
        },
      ],
    }).tilesets[0]!;
    let first = computeTileset(appRoot, config).sourceText;

    // A Tiled save round-trips the file through its own reader and writer. The
    // closest faithful stand-in available here is our own parse/format pair,
    // which is byte-exact by Task 4's acceptance test.
    writeFileSync(join(appRoot, 'assets/tileset.tsx'), formatTsx(parseTsx(first)));

    expect(computeTileset(appRoot, config).sourceText).toBe(first);
  });

  test('reports drift when the output JSON is stale', () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    let computed = computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!);

    expect(computed.drift.join(' ')).toMatch(/tileset\.json/);
  });

  test('reports drift when an output does not exist yet', () => {
    rmSync(join(appRoot, 'public/tileset.png'));

    expect(computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!).drift.join(' ')).toMatch(
      /tileset\.png/,
    );
  });

  test('carries the source image through to the output image byte-for-byte', () => {
    let computed = computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!);

    expect(Buffer.from(computed.imageBytes)).toStrictEqual(
      readFileSync(join(appRoot, 'assets/tileset.png')),
    );
  });

  test('does not leak Map or Set iteration order or a timestamp into its output', () => {
    let tileset = loadConfig(appRoot).tilesets[0]!;

    expect(computeTileset(appRoot, tileset).outputText).toBe(
      computeTileset(appRoot, tileset).outputText,
    );
  });
});

describe(computeAll, () => {
  test('continues past a failing tileset so every error surfaces in one run', () => {
    let config = tilesetsConfigSchema.parse({
      tilesets: [
        {
          name: 'missing',
          source: 'assets/nope.tsx',
          image: 'assets/nope.png',
          output: 'public/nope.json',
          outputImage: 'public/nope.png',
        },
        {
          name: 'also-missing',
          source: 'assets/nope2.tsx',
          image: 'assets/nope2.png',
          output: 'public/nope2.json',
          outputImage: 'public/nope2.png',
        },
      ],
    });
    let result = computeAll(appRoot, config);

    expect(result.errors).toHaveLength(2);
    expect(result.computed).toHaveLength(0);
  });

  test('computes every tileset when they all succeed', () => {
    let result = computeAll(appRoot, loadConfig(appRoot));

    expect(result.errors).toHaveLength(0);
    expect(result.computed).toHaveLength(1);
  });
});

describe('the reconcile-serialize seam', () => {
  test('reconcile leaves an already-reconciled document byte-identical', () => {
    let text = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');
    let image = readTilesetImage(readFileSync(join(appRoot, 'assets/tileset.png')), {
      tileWidth: 16,
      tileHeight: 16,
      margin: 0,
      spacing: 0,
      solidAlphaThreshold: 255,
      transparentColor: '#ff00cc',
    });
    let tileset = loadConfig(appRoot).tilesets[0]!;
    let document = parseTsx(text);

    reconcile(document, {tileset, image});

    let once = formatTsx(document);
    let again = parseTsx(once);

    reconcile(again, {tileset, image});

    expect(formatTsx(again)).toBe(once);
  });
});
