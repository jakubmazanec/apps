import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {type TilemapObject} from '../source/engine/tiled/Tilemap.js';
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
];

// playerPool and the npc factory build real Sprites from a spritesheet; a
// minimal animations bag satisfies the Sprite constructor for any sheet name.
function stubSpritesheetAssets() {
  let sheet = {
    animations: Object.fromEntries(SPRITE_NAMES.map((name) => [name, [pixi.Texture.WHITE]])),
  };

  vi.spyOn(pixi.Assets, 'get').mockImplementation((() => sheet) as never);
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
    vi.restoreAllMocks();
  });

  test('the record has exactly the four factories', () => {
    expect(Object.keys(objectFactories)).toEqual(['spawn', 'door', 'zone', 'npc']);
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
});
