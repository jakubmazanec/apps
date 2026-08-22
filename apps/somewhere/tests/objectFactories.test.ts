import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {type TilemapObject} from '../source/engine/tiled/Tilemap.js';
import {assets} from '../source/game/assets.js';
import {BehaviorComponent} from '../source/game/BehaviorComponent.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {objectFactories} from '../source/game/objectFactories.js';
import {playerPool} from '../source/game/playerPool.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';

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

// playerPool and the npc factory build real Sprites from the shared
// 'characters' spriteset, prefixed per character (GraphicsComponent); a
// minimal animations bag covering every character this suite spawns
// satisfies the Sprite constructor regardless of prefix.
function stubSpritesheetAssets() {
  let sheet = new Spriteset({
    textures: {},
    animations: Object.fromEntries(
      ['character', 'mira', 'npc'].flatMap((character) =>
        SPRITE_NAMES.map((name) => [
          `${character}-${name}`,
          {textures: [pixi.Texture.WHITE], speed: 0.15, loop: true},
        ]),
      ),
    ),
  });

  vitest.spyOn(assets, 'spriteset').mockReturnValue(sheet);
}

function createObject(overrides: Partial<TilemapObject> = {}): TilemapObject {
  return {
    id: 1,
    name: '',
    type: '',
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    point: false,
    properties: {},
    ...overrides,
  };
}

describe('objectFactories', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('the record has exactly the five factories', () => {
    expect(Object.keys(objectFactories)).toEqual(['spawn', 'door', 'zone', 'exit', 'npc']);
  });

  test('spawn centers the player bounding box on the point', () => {
    stubSpritesheetAssets();

    let player = objectFactories.spawn!(
      createObject({type: 'spawn', x: 152, y: 175, width: 0, height: 0, point: true}),
    );
    let {position} = player.getComponent(MotionComponent);

    expect(position.x).toBe(144);
    expect(position.y).toBe(160);

    playerPool.destroy(player); // hand it back for the next test
  });

  test('door builds a TriggerComponent carrying id, name, type, rect, and properties', () => {
    let door = objectFactories.door!(
      createObject({
        id: 7,
        name: 'door-hut',
        type: 'door',
        x: 176,
        y: 176,
        properties: {target: 3},
      }),
    );
    let trigger = door.getComponent(TriggerComponent);

    expect(trigger.id).toBe(7);
    expect(trigger.name).toBe('door-hut');
    expect(trigger.type).toBe('door');
    expect(trigger.rect).toMatchObject({x: 176, y: 176, width: 16, height: 16});
    expect(trigger.properties).toEqual({target: 3});
    expect(trigger.isPlayerInside).toBeUndefined();
  });

  test('zone builds a trigger the same way', () => {
    let zone = objectFactories.zone!(
      createObject({id: 4, name: 'chime-zone', type: 'zone', properties: {sound: 'chime'}}),
    );

    expect(zone.getComponent(TriggerComponent).type).toBe('zone');
    expect(zone.getComponent(TriggerComponent).properties).toEqual({sound: 'chime'});
  });

  test('exit builds a trigger like door and zone', () => {
    let entity = objectFactories.exit!(
      createObject({
        id: 7,
        name: 'shop-exit',
        type: 'exit',
        x: 304,
        y: 112,
        properties: {map: 'shop-interior', entry: 'shop-door'},
      }),
    );
    let trigger = entity.getComponent(TriggerComponent);

    expect(trigger.id).toBe(7);
    expect(trigger.type).toBe('exit');
    expect(trigger.rect).toMatchObject({x: 304, y: 112, width: 16, height: 16});
    expect(trigger.properties).toEqual({map: 'shop-interior', entry: 'shop-door'});
  });

  test('npc builds the trigger zone plus a sprite centered on the rect', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        x: 240,
        y: 176,
        width: 24,
        height: 28,
        properties: {dialogue: 'mira'},
      }),
    );
    let trigger = npc.getComponent(TriggerComponent);
    let motion = npc.getComponent(MotionComponent);

    expect(trigger.type).toBe('npc');
    expect(trigger.rect).toMatchObject({x: 240, y: 176, width: 24, height: 28});
    expect(trigger.properties).toEqual({dialogue: 'mira'});

    // Rect center (252, 190) minus the 16x20 box center offsets (8, 10).
    expect(motion.position.x).toBe(244);
    expect(motion.position.y).toBe(180);
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
  });

  test('npc uses the character named by its sprite property', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        properties: {dialogue: 'mira', sprite: 'mira'},
      }),
    );

    expect(vitest.mocked(assets.spriteset)).toHaveBeenCalledWith('characters');
    expect(npc.getComponent(GraphicsComponent).spriteNamePrefix).toBe('mira-');
  });

  test('npc without a sprite property falls back to the generic npc character', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({id: 9, name: 'mira', type: 'npc', properties: {dialogue: 'mira'}}),
    );

    expect(vitest.mocked(assets.spriteset)).toHaveBeenCalledWith('characters');
    expect(npc.getComponent(GraphicsComponent).spriteNamePrefix).toBe('npc-');
  });

  test('npc with a missing dialogue property throws in DEV (spawns inert in prod)', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(createObject({id: 9, name: 'mira', type: 'npc', properties: {}})),
    ).toThrow(/dialogue/);
  });

  test('npc with an unregistered dialogue name throws in DEV', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(
        createObject({id: 9, name: 'mira', type: 'npc', properties: {dialogue: 'ghost'}}),
      ),
    ).toThrow(/unregistered/);
  });

  test('npc with stroll properties attaches a stroll behavior', () => {
    stubSpritesheetAssets();
    vitest.spyOn(Math, 'random').mockReturnValue(0.5);

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        x: 240,
        y: 176,
        width: 24,
        height: 28,
        properties: {dialogue: 'mira', 'stroll-x': 3, 'stroll-y': 0},
      }),
    );
    let {behavior} = npc.getComponent(BehaviorComponent);
    let {position} = npc.getComponent(MotionComponent);

    expect(behavior.type).toBe('stroll');
    expect(behavior.goal).toBe('destination');
    expect(behavior.phase).toBe('waiting');
    // Home is the spawn position by value, not the same (mutating) vector.
    expect(behavior.home).not.toBe(position);
    expect(behavior.home.x).toBe(244);
    expect(behavior.home.y).toBe(180);
    // Destination = home + (3, 0) tiles × 16 px.
    expect(behavior.destination.x).toBe(292);
    expect(behavior.destination.y).toBe(180);
    expect(behavior.waitRemaining).toBe(5500); // 3000 + 0.5 × 5000
  });

  test('npc without stroll properties stays static: no BehaviorComponent', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({id: 9, name: 'mira', type: 'npc', properties: {dialogue: 'mira'}}),
    );

    expect(npc.hasComponent(BehaviorComponent)).toBe(false);
  });

  test('npc with only one stroll property throws in DEV (static in prod)', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(
        createObject({
          id: 9,
          name: 'mira',
          type: 'npc',
          properties: {dialogue: 'mira', 'stroll-x': 3},
        }),
      ),
    ).toThrow(/stroll/);
  });

  test('npc with a non-numeric stroll property throws in DEV', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(
        createObject({
          id: 9,
          name: 'mira',
          type: 'npc',
          properties: {dialogue: 'mira', 'stroll-x': '3', 'stroll-y': 0},
        }),
      ),
    ).toThrow(/stroll/);
  });

  test('npc records the rect offset from the entity position', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        x: 240,
        y: 176,
        width: 24,
        height: 28,
        properties: {dialogue: 'mira'},
      }),
    );
    let trigger = npc.getComponent(TriggerComponent);

    // Authored rect (240, 176) minus entity position (244, 180).
    expect(trigger.rectOffsetX).toBe(-4);
    expect(trigger.rectOffsetY).toBe(-4);
  });

  test('door triggers default the rect offsets to zero', () => {
    let door = objectFactories.door!(createObject({id: 7, type: 'door', x: 176, y: 176}));

    expect(door.getComponent(TriggerComponent).rectOffsetX).toBe(0);
    expect(door.getComponent(TriggerComponent).rectOffsetY).toBe(0);
  });
});
