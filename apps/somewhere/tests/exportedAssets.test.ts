import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {tiledTilemapSchema} from '../source/tiled-tools/TiledTilemap.js';
import {tiledUnsourcedTilesetSchema} from '../source/tiled-tools/TiledTileset.js';

// The export script runs this file after every re-export; it also runs in
// every `npm test`, so a drifted hand edit fails just as loudly.
function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

describe('exported assets', () => {
  test('public/map.json parses with the runtime schema and keeps the T1.7 invariants', () => {
    let map = tiledTilemapSchema.parse(readJson('../public/map.json'));
    let tileLayers = map.layers.filter((layer) => layer.type === 'tilelayer');

    expect(map.infinite).toBeFalsy();

    // CSV-encoded layer data (arrays, not base64 strings).
    for (let layer of tileLayers) {
      expect(Array.isArray(layer.data)).toBeTruthy();
    }

    // Exactly one entity-layer marker.
    expect(tileLayers.filter((layer) => layer.class === 'entities')).toHaveLength(1);

    // The runtime loads the JSON tileset export, not the TMX-side .tsx.
    expect(map.tilesets[0]?.source).toBe('tileset.json');
  });

  test('public/tileset.json parses with the runtime schema and references the public image', () => {
    let tileset = tiledUnsourcedTilesetSchema.parse(readJson('../public/tileset.json'));

    expect(tileset.image).toBe('tileset.png');
  });
});
