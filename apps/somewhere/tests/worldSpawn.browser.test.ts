import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {toTileGid} from '../source/engine/tiled/TileGid.js';
import {Tilemap, type TilemapObject} from '../source/engine/tiled/Tilemap.js';
import {assets} from '../source/game/assets.js';
import {dialogueEntity} from '../source/game/dialogue.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {flags} from '../source/game/flags.js';
import {getCurrentMapName} from '../source/game/levelManager.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {playerPool} from '../source/game/playerPool.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {applyStagedSave, clearStagedSave, stageContinue} from '../source/game/save.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {world} from '../source/game/world.js';

const SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
  'spin',
];

function spawnObject(overrides: Partial<TilemapObject> = {}): TilemapObject {
  return {
    id: 1,
    name: '',
    type: 'spawn',
    x: 32,
    y: 32,
    width: 0,
    height: 0,
    point: true,
    properties: {},
    ...overrides,
  };
}

function doorObject(id: number, target: number, x: number, y: number): TilemapObject {
  return {
    id,
    name: `door-${id}`,
    type: 'door',
    x,
    y,
    width: 16,
    height: 16,
    point: false,
    properties: {target},
  };
}

function zoneObject(id: number): TilemapObject {
  return {
    id,
    name: 'chime-zone',
    type: 'zone',
    x: 0,
    y: 48,
    width: 16,
    height: 16,
    point: false,
    properties: {sound: 'chime'},
  };
}

// A real 4x4 all-empty Tilemap (gid 0 renders nothing and Map.getTile never
// touches the tileset asset), one entities-class layer, plus the given
// objects.
function buildTilemap(objects: TilemapObject[]): Tilemap {
  return new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: 4,
    rowCount: 4,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [
      {
        class: 'entities',
        tiles: Array.from({length: 16}, () => ({
          gid: toTileGid(0),
          flipHorizontal: false,
          flipVertical: false,
          flipDiagonal: false,
        })),
      },
    ],
    objectLayers: [{name: 'objects', objects}],
  });
}

// Stubs pixi.Assets.get to resolve 'map' to the built tilemap and any other
// name through extraTilemaps (a second map for travel/Continue tests). The
// player's 'character-' prefixed names resolve to a minimal Spriteset for the
// Sprite constructor.
function stubAssets(objects: TilemapObject[], extraTilemaps: Record<string, Tilemap> = {}) {
  let tilemap = buildTilemap(objects);
  let character = new Spriteset({
    textures: {},
    animations: Object.fromEntries(
      SPRITE_NAMES.map((name) => [
        `character-${name}`,
        {textures: [pixi.Texture.WHITE], speed: 0.15, loop: true},
      ]),
    ),
  });

  vitest
    .spyOn(pixi.Assets, 'get')
    .mockImplementation(((name: string) =>
      name === 'map' ? tilemap : extraTilemaps[name]) as never);
  vitest.spyOn(assets, 'spriteset').mockReturnValue(character);
}

describe('world spawn loop', () => {
  afterEach(() => {
    // World.start() now rolls #state back to 'stopped' and rethrows when onStart throws, so a
    // DEV-throw mid-onStart leaves the world not running, and stop() would throw
    // 'World is not running!'. The partial registration onStart made before the throw
    // is undone here instead, mirroring the order World.stop() uses internally:
    // systems, then entities, then entity queries, then event channels.
    if (world.isRunning) {
      world.stop();
    } else {
      // eslint-disable-next-line unicorn/no-useless-spread -- real copy: removeSystem splices world.systems, so the live array would skip entries
      for (let system of [...world.systems]) {
        world.removeSystem(system);
      }

      // eslint-disable-next-line unicorn/no-useless-spread -- real copy: removeEntity splices world.entities, so the live array would skip entries
      for (let entity of [...world.entities]) {
        world.removeEntity(entity);
      }

      // eslint-disable-next-line unicorn/no-useless-spread -- real copy: removeEntityQuery splices world.entityQueries, so the live array would skip entries
      for (let entityQuery of [...world.entityQueries]) {
        world.removeEntityQuery(entityQuery);
      }

      // eslint-disable-next-line unicorn/no-useless-spread -- real copy: removeEventChannel splices world.eventChannels, so the live array would skip entries
      for (let channel of [...world.eventChannels]) {
        world.removeEventChannel(channel);
      }
    }

    vitest.restoreAllMocks();
    localStorage.clear();
    clearStagedSave();
  });

  test('spawns from map objects: player centered on the point, triggers added, teardown pools the player', () => {
    stubAssets([spawnObject(), doorObject(2, 3, 0, 0), doorObject(3, 2, 48, 48), zoneObject(4)]);

    world.start();

    let {position} = playersQuery.getFirst().getComponent(MotionComponent);

    // (32, 32) minus the box (0, 10, 16, 10) center offsets (8, 15).
    expect(position.x).toBe(24);
    expect(position.y).toBe(17);
    expect(world.entities.filter((entity) => entity.hasComponent(TriggerComponent))).toHaveLength(
      3,
    );

    let poolSizeBefore = playerPool.getSize();

    world.stop();

    expect(playerPool.getSize()).toBe(poolSizeBefore + 1);
    expect(world.entities).toHaveLength(0);
  });

  test('throws in DEV on an unknown object type', () => {
    stubAssets([spawnObject(), {...zoneObject(9), type: 'treasure'}]);

    expect(() => {
      world.start();
    }).toThrow(/unknown type "treasure"/);
  });

  test('throws in DEV on an object type that shadows a prototype member', () => {
    stubAssets([spawnObject(), {...zoneObject(9), type: 'toString'}]);

    expect(() => {
      world.start();
    }).toThrow(/unknown type "toString"/);
  });

  test('throws in DEV on a second spawn object', () => {
    stubAssets([spawnObject(), spawnObject({id: 2, x: 40, y: 40})]);

    expect(() => {
      world.start();
    }).toThrow(/second spawn/);
  });

  test('throws in DEV when no spawn object exists', () => {
    stubAssets([zoneObject(4)]);

    expect(() => {
      world.start();
    }).toThrow(/No spawn object/);
  });

  test('throws in DEV on a dangling door target', () => {
    stubAssets([spawnObject(), doorObject(2, 99, 0, 0)]);

    expect(() => {
      world.start();
    }).toThrow(/dangling target/);
  });

  test('world start resets flags and clears a leftover active dialogue', () => {
    stubAssets([spawnObject()]);

    // Module state outliving the previous run: a finished playthrough set the
    // flag, a mid-dialogue Quit left the runner assigned.
    flags.metMira = true;
    dialogueEntity.getComponent(DialogueComponent).active = new Dialogue({
      script: {start: {text: 'stale'}},
      context: flags,
    });

    world.start();

    expect(flags.metMira).toBe(false);
    expect(dialogueEntity.getComponent(DialogueComponent).active).toBeNull();
  });

  test('a staged save on a non-default map starts there quietly (Continue into the shop)', () => {
    let entry = {
      id: 1,
      name: 'entrance',
      type: 'entry',
      x: 32,
      y: 32,
      width: 0,
      height: 0,
      point: true,
      properties: {},
    };

    // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case map name matches the MapName union
    stubAssets([spawnObject()], {'shop-interior': buildTilemap([entry])});
    localStorage.setItem(
      'somewhere:save',
      JSON.stringify({player: {x: 40, y: 40}, flags: {metMira: false}, map: 'shop-interior'}),
    );
    stageContinue();

    // No spawn object in the shop map: the fallback must be quiet (no DEV
    // throw), because the staged position lands right after start().
    world.start();
    applyStagedSave();

    expect(getCurrentMapName()).toBe('shop-interior');

    let {position} = playersQuery.getFirst().getComponent(MotionComponent);

    expect(position.x).toBe(40);
    expect(position.y).toBe(40);
  });
});
