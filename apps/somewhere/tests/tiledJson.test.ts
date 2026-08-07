import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {tiledUnsourcedTilesetSchema} from '../source/tiled-tools/TiledTileset.js';
import {formatJson, type JsonValue, toTilesetJson} from '../tools/tiled-pipeline/json.js';
import {parseTsx} from '../tools/tiled-pipeline/tsx.js';

function readTsx(): string {
  return readFileSync(new URL('../assets/tileset.tsx', import.meta.url), 'utf8');
}

describe(formatJson, () => {
  test('reproduces the committed public/tileset.json byte-for-byte', () => {
    let expected = readFileSync(new URL('../public/tileset.json', import.meta.url), 'utf8');

    expect(formatJson(parseTsx(readTsx()))).toBe(expected);
  });

  test('the output satisfies the runtime schema', () => {
    expect(() =>
      tiledUnsourcedTilesetSchema.parse(JSON.parse(formatJson(parseTsx(readTsx())))),
    ).not.toThrow();
  });

  test('maps the image element onto the flat JSON fields', () => {
    let json = toTilesetJson(parseTsx(readTsx()));

    expect(json.image).toBe('tileset.png');
    expect(json.imagewidth).toBe(1024);
    expect(json.imageheight).toBe(1024);
    expect(json.transparentcolor).toBe('#ff00cc');
    expect(json.margin).toBe(0);
    expect(json.spacing).toBe(0);
  });

  test('keeps animation frames in sequence and sorts properties by name', () => {
    let document = parseTsx(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
        ' <image source="t.png" width="32" height="32"/>',
        ' <tile id="0">',
        '  <properties>',
        '   <property name="zebra" type="bool" value="true"/>',
        '   <property name="alpha" value="text"/>',
        '  </properties>',
        '  <animation>',
        '   <frame tileid="2" duration="150"/>',
        '   <frame tileid="1" duration="90"/>',
        '  </animation>',
        ' </tile>',
        '</tileset>',
        '',
      ].join('\n'),
    );
    let tiles = toTilesetJson(document).tiles as Array<Record<string, JsonValue>>;

    expect(tiles[0]!.animation).toStrictEqual([
      {duration: 150, tileid: 2},
      {duration: 90, tileid: 1},
    ]);
    expect(tiles[0]!.properties).toStrictEqual([
      {name: 'alpha', type: 'string', value: 'text'},
      {name: 'zebra', type: 'bool', value: true},
    ]);
  });
});
