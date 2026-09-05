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

  test('public/shop-interior.json parses with the runtime schema and keeps the invariants', () => {
    let map = tiledTilemapSchema.parse(readJson('../public/shop-interior.json'));
    let tileLayers = map.layers.filter((layer) => layer.type === 'tilelayer');

    expect(map.infinite).toBe(false);

    for (let layer of tileLayers) {
      expect(Array.isArray(layer.data)).toBe(true);
    }

    expect(tileLayers.filter((layer) => layer.class === 'entities')).toHaveLength(1);
    expect(map.tilesets[0]?.source).toBe('interior-tileset.json');

    let objectLayer = map.layers.find((layer) => layer.type === 'objectgroup');

    if (objectLayer?.type !== 'objectgroup') {
      throw new Error('Expected an object layer!');
    }

    // Only the starting map has a spawn; travel supplies the entry.
    expect(objectLayer.objects.filter((object) => object.type === 'spawn')).toHaveLength(0);

    let exit = objectLayer.objects.find((object) => object.type === 'exit');
    let entry = objectLayer.objects.find((object) => object.type === 'entry');
    let npc = objectLayer.objects.find((object) => object.type === 'npc');

    expect(exit?.properties).toEqual(
      expect.arrayContaining([
        {name: 'entry', type: 'string', value: 'shop-door'},
        {name: 'map', type: 'string', value: 'map'},
      ]),
    );
    expect(entry?.name).toBe('entrance');
    expect(entry?.point).toBe(true);
    expect(npc?.properties).toEqual(
      expect.arrayContaining([{name: 'dialogue', type: 'string', value: 'shopkeeper'}]),
    );
  });

  test('shop-interior.json mirrors shop-interior.tmx (the hand-mirrored export pair)', () => {
    let tmx = readFileSync(new URL('../assets/shop-interior.tmx', import.meta.url), 'utf8');
    let map = tiledTilemapSchema.parse(readJson('../public/shop-interior.json'));

    for (let layer of map.layers) {
      if (layer.type !== 'tilelayer') {
        continue;
      }

      let block = new RegExp(
        `name="${layer.name}"[^>]*>\\s*<data encoding="csv">\\n([\\s\\S]*?)\\n</data>`,
        'u',
      ).exec(tmx);

      expect(block).not.toBeNull();

      let tmxData = block![1]!
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => !Number.isNaN(value));

      expect(layer.data).toEqual(tmxData);
    }

    let objectLayer = map.layers.find((layer) => layer.type === 'objectgroup');

    if (objectLayer?.type !== 'objectgroup') {
      throw new Error('Expected an object layer!');
    }

    for (let object of objectLayer.objects) {
      expect(tmx).toContain(
        `<object id="${object.id}" name="${object.name}" type="${object.type}" x="${object.x}" y="${object.y}"`,
      );
    }
  });

  test('the village references the exterior tileset and pairs its exit with the shop', () => {
    let map = tiledTilemapSchema.parse(readJson('../public/map.json'));

    expect(map.tilesets[1]).toMatchObject({firstgid: 4097, source: 'exterior-tileset.json'});

    let objectLayer = map.layers.find((layer) => layer.type === 'objectgroup');

    if (objectLayer?.type !== 'objectgroup') {
      throw new Error('Expected an object layer!');
    }

    let exit = objectLayer.objects.find((object) => object.type === 'exit');
    let entry = objectLayer.objects.find((object) => object.type === 'entry');

    expect(exit).toMatchObject({x: 304, y: 112, width: 16, height: 16});
    expect(exit?.properties).toEqual(
      expect.arrayContaining([
        {name: 'entry', type: 'string', value: 'entrance'},
        {name: 'map', type: 'string', value: 'shop-interior'},
      ]),
    );
    expect(entry).toMatchObject({name: 'shop-door', x: 312, y: 136, point: true});

    // The house door art sits on the sortable entities layer at the exit cell.
    let stuffLayer = map.layers.find((layer) => layer.class === 'entities');

    if (stuffLayer?.type !== 'tilelayer') {
      throw new Error('Expected the entities tile layer!');
    }

    expect((stuffLayer.data as number[])[7 * map.width + 19]).toBe(5155);
  });

  test('every exit references an existing entry point in its destination map', () => {
    let maps = {
      map: tiledTilemapSchema.parse(readJson('../public/map.json')),
      'shop-interior': tiledTilemapSchema.parse(readJson('../public/shop-interior.json')),
    };
    let objects = (map: (typeof maps)['map']) =>
      map.layers.filter((layer) => layer.type === 'objectgroup').flatMap((layer) => layer.objects);
    let entryNames = new Map(
      Object.entries(maps).map(([name, map]) => [
        name,
        new Set(
          objects(map)
            .filter((object) => object.type === 'entry')
            .map((object) => object.name),
        ),
      ]),
    );
    let exits = Object.values(maps).flatMap((map) =>
      objects(map).filter((object) => object.type === 'exit'),
    );

    expect(exits.length).toBeGreaterThanOrEqual(2);

    for (let exit of exits) {
      let destination = exit.properties?.find((property) => property.name === 'map')?.value;
      let entry = exit.properties?.find((property) => property.name === 'entry')?.value;

      expect(entryNames.get(destination as string)?.has(entry as string)).toBe(true);
    }
  });
});
