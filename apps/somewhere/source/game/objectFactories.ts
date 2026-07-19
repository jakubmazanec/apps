import * as pixi from 'pixi.js';

import {Entity} from '../engine/ecs/Entity.js';
import {type TilemapObject} from '../engine/tiled/Tilemap.js';
import {failUnsupported} from '../engine/utilities/failUnsupported.js';
import {Vector} from '../engine/utilities/Vector.js';
import {dialogueRegistry} from './dialogueRegistry.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playerPool} from './playerPool.js';
import {TriggerComponent} from './TriggerComponent.js';

// All eight names so graphicsSystem's directional sprite.show always
// resolves: the npc sheet lists its one frame under every clip name (the
// documented duplicated-clip-names workaround until T1.3); the zero-velocity
// path shows 'standing-right'.
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

// The npc placeholder frame is 16x20 (see public/npc.json).
const NPC_WIDTH = 16;
const NPC_HEIGHT = 20;

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
  npc: (object) => {
    // The Tiled rect is the interaction zone; the sprite renders at its
    // center. Validation is spawn-time and loud (the door-target precedent):
    // a bad dialogue name leaves the NPC inert; dialogueSystem re-checks at
    // start and no-ops, so an inert NPC can never start a script.
    let {dialogue} = object.properties;

    if (typeof dialogue !== 'string' || !Object.hasOwn(dialogueRegistry, dialogue)) {
      failUnsupported(
        `NPC "${object.name}" (id ${object.id}) has a missing or unregistered "dialogue" property! Register the script in dialogueRegistry or fix the property in Tiled. The NPC is inert.`,
      );
    }

    let entity = new Entity({
      components: [
        new TriggerComponent({
          id: object.id,
          name: object.name,
          type: object.type,
          rect: new pixi.Rectangle(object.x, object.y, object.width, object.height),
          properties: object.properties,
        }),
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {assetName: 'npc', spriteNames: [...NPC_SPRITE_NAMES]},
          boundingBox: new pixi.Rectangle(0, 0, NPC_WIDTH, NPC_HEIGHT),
        }),
      ],
    });
    let position = getPositionForBoundingBoxCenter(
      new Vector(object.x + object.width / 2, object.y + object.height / 2),
      entity.getComponent(GraphicsComponent).boundingBox,
    );

    entity.getComponent(MotionComponent).position.set(position.x, position.y);

    return entity;
  },
};
