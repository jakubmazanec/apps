import * as pixi from 'pixi.js';
import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {toTileGid} from '../source/engine/tiled/TileGid.js';
import {Tilemap} from '../source/engine/tiled/Tilemap.js';
import {type Constructor} from '../source/engine/utilities/Constructor.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {DialogueCommand} from '../source/game/DialogueCommand.js';
import {dialogueCommandChannel} from '../source/game/dialogueCommandChannel.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {travelSystem} from '../source/game/travelSystem.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';

// levelManager.js now imports game.js (Task 10's camera preset); mock it
// before that import resolves (the dialogueBoxSystem.test pattern) so the
// real Game singleton, which reads `window` at construction, never runs in
// this node-environment suite. This file's tests never touch
// flushPendingTravel, so the stub's shape doesn't matter beyond existing.
vitest.mock(import('../source/game/game.js'), () => {
  let game = {app: {canvas: {width: 64, height: 64}}, pixelScale: 1};

  return {game: game as never};
});

const {assets} = await import('../source/game/assets.js');
const {getPendingTravel, requestTravel, resetLevelManager} =
  await import('../source/game/levelManager.js');

function tick(): pixi.Ticker {
  return {deltaMS: 0} as unknown as pixi.Ticker;
}

function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

// The destination tilemap only needs an entry point for validation.
function stubDestination(): void {
  let tilemap = new Tilemap({
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
    objectLayers: [
      {
        name: 'objects',
        objects: [
          {
            id: 1,
            name: 'entrance',
            type: 'entry',
            x: 32,
            y: 32,
            width: 0,
            height: 0,
            point: true,
            properties: {},
          },
        ],
      },
    ],
  });

  vitest
    .spyOn(assets, 'tilemap')
    .mockImplementation(((name: string) =>
      name === 'shop-interior' ? tilemap : undefined) as never);
}

function createExit(properties: Record<string, boolean | number | string>, id = 1): Entity {
  return new Entity({
    components: [
      new TriggerComponent({
        id,
        name: 'shop-exit',
        type: 'exit',
        rect: new pixi.Rectangle(0, 0, 16, 16),
        properties,
      }),
    ],
  });
}

let activeWorld: World | null = null;

function createHarness(triggers: Entity[], playerAt?: {x: number; y: number}) {
  let pos = playerAt ?? {x: 4, y: 4};
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      new MotionComponent({
        position: new Vector(pos.x, pos.y),
        velocity: new Vector(0, 0),
      }),
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEntityQuery(dialogueQuery)
        .addEntityQuery(playersQuery)
        .addSystem(travelSystem)
        .addEntity(dialogueEntity)
        .addEntity(player);

      for (let trigger of triggers) {
        w.addEntity(trigger);
      }
    },
  });

  activeWorld = world;

  return {world, dialogueEntity};
}

function pressInteract(): void {
  dialogueCommandChannel.push(new DialogueCommand({type: 'interact'}));
  dialogueCommandChannel.swap();
}

describe('travelSystem', () => {
  beforeEach(() => {
    resetLevelManager('map');
    stubDestination();
  });

  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
    vitest.restoreAllMocks();
  });

  test('interact on a prompted exit records the pending travel', () => {
    let {world} = createHarness([createExit({map: 'shop-interior', entry: 'entrance'})]);

    world.start();
    pressInteract();
    world.update(tick());

    expect(getPendingTravel()).toEqual({mapName: 'shop-interior', entryName: 'entrance'});
  });

  test('an active dialogue locks travel (paging can never travel)', () => {
    let {world, dialogueEntity} = createHarness([
      createExit({map: 'shop-interior', entry: 'entrance'}),
    ]);

    world.start();
    dialogueEntity.getComponent(DialogueComponent).active = new Dialogue({
      script: {start: {text: 'hi'}},
      context: flags,
    });
    pressInteract();
    world.update(tick());

    expect(getPendingTravel()).toBeNull();
  });

  test('a pending travel is never overwritten (double-press guard)', () => {
    let {world} = createHarness([createExit({map: 'shop-interior', entry: 'entrance'})]);

    world.start();
    requestTravel({mapName: 'map', entryName: 'village-entry'});
    pressInteract();
    world.update(tick());

    expect(getPendingTravel()).toEqual({mapName: 'map', entryName: 'village-entry'});
  });

  test('interact away from any exit does nothing', () => {
    let {world} = createHarness([createExit({map: 'shop-interior', entry: 'entrance'})], {
      x: 100,
      y: 100,
    });

    world.start();
    pressInteract();
    world.update(tick());

    expect(getPendingTravel()).toBeNull();
  });

  test('an inert exit (bad map or entry) does nothing, silently', () => {
    let {world} = createHarness([
      createExit({map: 'basement', entry: 'entrance'}, 1),
      createExit({map: 'shop-interior', entry: 'missing'}, 2),
    ]);

    world.start();
    pressInteract();
    world.update(tick());

    expect(getPendingTravel()).toBeNull();
  });

  test('a resolved npc never travels', () => {
    let npc = new Entity({
      components: [
        new TriggerComponent({
          id: 5,
          name: 'mira',
          type: 'npc',
          rect: new pixi.Rectangle(0, 0, 16, 16),
          properties: {dialogue: 'mira'},
        }),
      ],
    });

    npc.getComponent(TriggerComponent).isPlayerInside = true;

    let {world} = createHarness([npc, createExit({map: 'shop-interior', entry: 'entrance'}, 6)]);

    world.start();
    pressInteract();
    world.update(tick());

    expect(getPendingTravel()).toBeNull();
  });
});
