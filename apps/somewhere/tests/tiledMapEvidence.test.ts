import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {collectTileUsage} from '../tools/tiled-pipeline/evidence/map.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';

function writeMap(name: string, layers: string[]): void {
  writeFileSync(
    join(appRoot, 'assets', name),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="3" nextobjectid="1">',
      ' <tileset firstgid="1" source="tileset.tsx"/>',
      ...layers,
      '</map>',
      '',
    ].join('\n'),
  );
}

function layer(name: string, layerClass: string | undefined, csv: string): string[] {
  let classAttribute = layerClass === undefined ? '' : ` class="${layerClass}"`;

  return [
    ` <layer id="1" name="${name}"${classAttribute} width="2" height="2">`,
    '  <data encoding="csv">',
    csv,
    '</data>',
    ' </layer>',
  ];
}

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'map-evidence-'));

  mkdirSync(join(appRoot, 'assets'));
});

// eslint-disable-next-line vitest/require-top-level-describe -- global afterEach shared by all describe blocks
afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe(collectTileUsage, () => {
  test('returns the tile ids used on a matching layer, firstgid subtracted', () => {
    writeMap('map.tmx', layer('stuff', 'entities', '1,2,\n65,0'));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([0, 1, 64]));
  });

  test('ignores layers whose class is not configured', () => {
    writeMap('map.tmx', [
      ...layer('ground', undefined, '5,5,\n5,5'),
      ...layer('stuff', 'entities', '1,0,\n0,0'),
    ]);

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([0]));
  });

  test('strips the flip flags from a gid', () => {
    // 0x80000000 | 2 = a horizontally flipped tile 1.
    writeMap('map.tmx', layer('stuff', 'entities', `${0x8000_0000 + 2},0,\n0,0`));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([1]));
  });

  test('ignores a tileset the map references but the config does not name', () => {
    writeMap('map.tmx', layer('stuff', 'entities', '1,0,\n0,0'));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/other.tsx',
      }),
    ).toStrictEqual(new Set());
  });

  test('unions across several maps and skips ones that do not exist', () => {
    writeMap('a.tmx', layer('stuff', 'entities', '1,0,\n0,0'));
    writeMap('b.tmx', layer('stuff', 'entities', '3,0,\n0,0'));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/a.tmx', 'assets/b.tmx', 'assets/missing.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([0, 2]));
  });

  test('bounds a gid to the tileset whose firstgid range contains it', () => {
    writeFileSync(
      join(appRoot, 'assets', 'two-tilesets.tmx'),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="3" nextobjectid="1">',
        ' <tileset firstgid="1" source="tileset.tsx"/>',
        ' <tileset firstgid="100" source="other.tsx"/>',
        ...layer('stuff', 'entities', '5,150,\n0,0'),
        '</map>',
        '',
      ].join('\n'),
    );

    // Gid 5 belongs to tileset.tsx (firstgid 1); gid 150 belongs to
    // other.tsx (firstgid 100) and must not be attributed to tileset.tsx.
    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/two-tilesets.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([4]));
  });

  test('finds the real demo map’s entity-layer usage', () => {
    let used = collectTileUsage({
      appRoot: realAppRoot,
      mapPaths: ['assets/map.tmx'],
      layerClasses: ['entities'],
      tilesetSource: 'assets/tileset.tsx',
    });

    expect(used.size).toBeGreaterThan(0);
    expect(used.has(64)).toBe(true);
  });
});
