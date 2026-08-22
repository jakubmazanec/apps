import * as pixi from 'pixi.js';

import {type Component} from '../engine/ecs/Component.js';
import {Entity} from '../engine/ecs/Entity.js';
import {type TilemapObject} from '../engine/tiled/Tilemap.js';
import {failUnsupported} from '../engine/utilities/failUnsupported.js';
import {Vector} from '../engine/utilities/Vector.js';
import {BehaviorComponent, randomStrollWait} from './BehaviorComponent.js';
import {dialogueRegistry} from './dialogueRegistry.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playerPool} from './playerPool.js';
import {TriggerComponent} from './TriggerComponent.js';

// All eight names so graphicsSystem's directional sprite.show always
// resolves; the zero-velocity path shows 'standing-right'. The unnamed
// generic NPC (no "sprite" property) gets a real 8-direction sheet like
// every other character, via the "npc" prefix into the shared characters
// spriteset (assets.ts).
const NPC_SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
] as const;
// Every character sheet uses 16x20 tiles (see character-tileset in assets.ts).
const NPC_WIDTH = 16;
const NPC_HEIGHT = 20;
// Stroll offsets are authored in tiles; one tile is 16 art px.
const TILE_SIZE = 16;

// Doors and zones are the same data shape: a TriggerComponent entity that
// triggerSystem tests and doorSystem/zoneSystem interpret by type.
function createTrigger(object: TilemapObject): Entity {
  return new Entity({
    components: [
      new TriggerComponent({
        id: object.id,
        name: object.name,
        type: object.type,
        rect: new pixi.Rectangle(object.x, object.y, object.width, object.height),
        properties: object.properties,
      }),
    ],
  });
}

// world.onStart dispatches every map object through this record by type.
// T1.11's level manager is the second consumer and can promote the pattern.
export const objectFactories: Record<string, (object: TilemapObject) => Entity> = {
  spawn: (object) => {
    let player = playerPool.create();
    let position = getPositionForBoundingBoxCenter(
      new Vector(object.x, object.y),
      player.getComponent(GraphicsComponent).boundingBox,
    );

    player.getComponent(MotionComponent).position.set(position.x, position.y);

    return player;
  },
  door: createTrigger,
  zone: createTrigger,
  exit: createTrigger,
  npc: (object) => {
    // The Tiled rect is the interaction zone; the sprite renders at its
    // center. Validation is spawn-time and loud (the door-target precedent):
    // a bad dialogue name leaves the NPC inert; dialogueSystem re-checks at
    // start and no-ops, so an inert NPC can never start a script.
    let {dialogue, sprite} = object.properties;

    if (typeof dialogue !== 'string' || !Object.hasOwn(dialogueRegistry, dialogue)) {
      failUnsupported(
        `NPC "${object.name}" (id ${object.id}) has a missing or unregistered "dialogue" property! Register the script in dialogueRegistry or fix the property in Tiled. The NPC is inert.`,
      );
    }

    let graphics = new GraphicsComponent({
      // A per-NPC character (a prefix into the shared characters spriteset,
      // assets.ts) comes from the object's optional "sprite" property; an
      // unknown name fails loudly at spawn inside the Sprite constructor.
      // Without the property, the NPC falls back to the generic "npc"
      // character (assets.ts).
      spriteOptions: {
        assetName: 'characters',
        character: typeof sprite === 'string' ? sprite : 'npc',
        spriteNames: [...NPC_SPRITE_NAMES],
      },
      boundingBox: new pixi.Rectangle(0, 0, NPC_WIDTH, NPC_HEIGHT),
    });
    let position = getPositionForBoundingBoxCenter(
      new Vector(object.x + object.width / 2, object.y + object.height / 2),
      graphics.boundingBox,
    );
    let components: Component[] = [
      new TriggerComponent({
        id: object.id,
        name: object.name,
        type: object.type,
        rect: new pixi.Rectangle(object.x, object.y, object.width, object.height),
        properties: object.properties,
        rectOffsetX: object.x - position.x,
        rectOffsetY: object.y - position.y,
      }),
      new MotionComponent({position, velocity: new Vector(0, 0)}),
      graphics,
    ];
    // TODO(map-native authoring): move the stroll destination into map-native
    // data (a Tiled point/path object referenced by the NPC) instead of raw
    // tile-offset numbers.
    let strollX = object.properties['stroll-x'];
    let strollY = object.properties['stroll-y'];

    if (strollX !== undefined || strollY !== undefined) {
      if (typeof strollX === 'number' && typeof strollY === 'number') {
        components.push(
          new BehaviorComponent({
            behavior: {
              type: 'stroll',
              // Cloned: motionSystem mutates motion.position in place, and
              // home must keep pointing at the spawn point.
              home: position.clone(),
              destination: new Vector(
                position.x + strollX * TILE_SIZE,
                position.y + strollY * TILE_SIZE,
              ),
              goal: 'destination',
              phase: 'waiting',
              waitRemaining: randomStrollWait(),
            },
          }),
        );
      } else {
        failUnsupported(
          `NPC "${object.name}" (id ${object.id}) has invalid stroll properties! Author both "stroll-x" and "stroll-y" as int tile offsets in Tiled, or neither. The NPC stays put.`,
        );
      }
    }

    return new Entity({components});
  },
};
