import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

import {
  loadConfig,
  resolveInsideAppRoot,
  tilesetsConfigSchema,
} from '../tools/tiled-pipeline/config.js';

let appRoot = fileURLToPath(new URL('../', import.meta.url));

function minimalConfig(): {tilesets: Array<Record<string, unknown>>} {
  return {
    tilesets: [
      {
        name: 'tileset',
        source: 'assets/tileset.tsx',
        image: 'assets/tileset.png',
        output: 'public/tileset.json',
        outputImage: 'public/tileset.png',
      },
    ],
  };
}

describe('tilesetsConfigSchema', () => {
  test('fills in every optional block so a minimal config is complete', () => {
    let config = tilesetsConfigSchema.parse(minimalConfig());
    let tileset = config.tilesets[0]!;

    expect(tileset.solidAlphaThreshold).toBe(255);
    expect(tileset.collision.default).toBe('none');
    expect(tileset.collision.regions).toStrictEqual([]);
    expect(tileset.collision.tileClasses).toStrictEqual({});
    expect(tileset.collision.footprintMaxHeight).toBe(8);
    expect(tileset.animations.regions).toStrictEqual([]);
    expect(tileset.animations.minimumFrameDifference).toBe(0.7);
    expect(config.analysis).toBeUndefined();
  });

  test.each([
    ['a Windows absolute path', 'D:/elsewhere/tileset.tsx'],
    ['a POSIX absolute path', '/etc/passwd'],
    ['a parent-directory escape', '../../secrets.tsx'],
    ['an escape mid-path', 'assets/../../secrets.tsx'],
  ])('rejects %s', (unused, source) => {
    let config = minimalConfig();

    config.tilesets[0]!.source = source;

    expect(() => tilesetsConfigSchema.parse(config)).toThrow(Error);
  });

  test('rejects an inverted collision region range', () => {
    let config = minimalConfig();

    config.tilesets[0]!.collision = {regions: [{range: [200, 100], mode: 'bbox'}]};

    expect(() => tilesetsConfigSchema.parse(config)).toThrow(Error);
  });

  test('rejects an animation region shorter than two frames', () => {
    let config = minimalConfig();

    config.tilesets[0]!.animations = {regions: [{start: 256, frames: 1, duration: 150}]};

    expect(() => tilesetsConfigSchema.parse(config)).toThrow(Error);
  });
});

describe(resolveInsideAppRoot, () => {
  test('resolves a relative path against the app root', () => {
    expect(resolveInsideAppRoot(appRoot, 'assets/tileset.tsx')).toContain('tileset.tsx');
  });

  test('throws when the resolved path escapes the app root', () => {
    expect(() => resolveInsideAppRoot(appRoot, 'assets/../../../etc/passwd')).toThrow(/app root/);
  });
});

describe('the committed tilesets.config.json', () => {
  test('parses and points at the real files', () => {
    let config = loadConfig(appRoot);
    let tileset = config.tilesets[0]!;

    expect(config.tilesets.map((entry) => entry.name)).toStrictEqual([
      'tileset',
      'interior-tileset',
      'exterior-tileset',
      'exterior-odyssey-tileset',
      'character-tileset',
    ]);
    expect(tileset.source).toBe('assets/tileset.tsx');
    expect(tileset.output).toBe('public/tileset.json');
  });

  test('adopts the four fire animation strips', () => {
    let tileset = loadConfig(appRoot).tilesets[0]!;

    expect(tileset.animations.minimumFrameDifference).toBe(0.7);
    expect(tileset.animations.regions).toStrictEqual([
      {start: 353, frames: 6, duration: 150},
      {start: 417, frames: 6, duration: 150},
      {start: 481, frames: 6, duration: 150},
      {start: 545, frames: 6, duration: 150},
    ]);
  });

  test('is prettier-shaped, so `npm run format` never rewrites it', () => {
    let text = readFileSync(new URL('../tilesets.config.json', import.meta.url), 'utf8');

    // JSON.stringify(value, null, 2) is NOT prettier-stable: prettier collapses
    // short arrays. Anything that writes this file must format through prettier.
    expect(text).toContain('"maps": ["assets/map.tmx", "assets/shop-interior.tmx"]');
    expect(text.endsWith('\n')).toBe(true);
  });
});
