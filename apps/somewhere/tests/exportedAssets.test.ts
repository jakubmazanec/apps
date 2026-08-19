import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {spritesetSchema} from '../source/engine/graphics/Spriteset.js';
import {tiledTilemapSchema} from '../source/engine/tiled-tools/TiledTilemap.js';
import {tiledUnsourcedTilesetSchema} from '../source/engine/tiled-tools/TiledTileset.js';

// The export script runs this file after every re-export; it also runs in
// every `npm test`, so a drifted hand edit fails just as loudly.
function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

describe('exported assets', () => {
  test('public/map.json parses with the runtime schema and keeps the T1.7 invariants', () => {
    let map = tiledTilemapSchema.parse(readJson('../public/map.json'));
    let tileLayers = map.layers.filter((layer) => layer.type === 'tilelayer');

    expect(map.infinite).toBe(false);

    // CSV-encoded layer data (arrays, not base64 strings).
    for (let layer of tileLayers) {
      expect(Array.isArray(layer.data)).toBe(true);
    }

    // Exactly one entity-layer marker.
    expect(tileLayers.filter((layer) => layer.class === 'entities')).toHaveLength(1);

    // The runtime loads the JSON tileset export, not the TMX-side .tsx.
    expect(map.tilesets[0]?.source).toBe('tileset.json');
  });

  test('the door graphic sits on the sortable entities layer, not the always-on-top air layer', () => {
    let map = tiledTilemapSchema.parse(readJson('../public/map.json'));
    let entitiesLayer = map.layers.find((layer) => layer.class === 'entities');
    let airLayer = map.layers.find((layer) => layer.name === 'air');
    let objectLayer = map.layers.find((layer) => layer.type === 'objectgroup');

    if (entitiesLayer?.type !== 'tilelayer' || airLayer?.type !== 'tilelayer') {
      throw new Error('Expected "entities" and "air" to be tile layers!');
    }

    if (objectLayer?.type !== 'objectgroup') {
      throw new Error('Expected an object layer!');
    }

    let doors = objectLayer.objects.filter((object) => object.type === 'door');

    expect(doors.length).toBeGreaterThan(0);

    let entitiesData = entitiesLayer.data as number[];
    let airData = airLayer.data as number[];

    for (let door of doors) {
      let column = door.x / map.tilewidth;
      // The door's own art sits one row above its walkable trigger tile.
      let doorRow = door.y / map.tileheight - 1;
      let index = doorRow * map.width + column;

      // Map.ts never y-sorts the air layer (by design, for overhead roofs),
      // so a door there always occludes the player regardless of position.
      expect(airData[index]).toBe(0);
      // The door's actual graphic (gid 1306), moved from air onto the
      // sortable entities layer, replacing the plain wall tile that used to
      // sit there.
      expect(entitiesData[index]).toBe(1306);
    }
  });

  test('public/tileset.json parses with the runtime schema and references the public image', () => {
    let tileset = tiledUnsourcedTilesetSchema.parse(readJson('../public/tileset.json'));

    expect(tileset.image).toBe('tileset.png');
  });

  test.each(['spark.json', 'portraits.json', 'prompt-bubble.json', 'ui.json'])(
    'public/%s parses with the runtime Spriteset schema',
    (fileName) => {
      let spriteset = spritesetSchema.parse(readJson(`../public/${fileName}`));

      expect(spriteset.image).toBe(fileName.replace(/\.json$/, '.png'));
    },
  );

  test('public/characters.json parses with the runtime Spriteset schema', () => {
    let spriteset = spritesetSchema.parse(readJson('../public/characters.json'));

    expect(spriteset.image).toBe('character-tileset.png');

    for (let character of ['character', 'mira', 'npc']) {
      for (let direction of ['down', 'left', 'right', 'up']) {
        expect(spriteset.animations[`${character}-standing-${direction}`]).toBeDefined();
        expect(spriteset.animations[`${character}-walking-${direction}`]).toBeDefined();
      }
    }

    expect(spriteset.animations['character-spin']).toMatchObject({loop: false, speed: 0.3});
  });
});
