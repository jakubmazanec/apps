import * as pixi from 'pixi.js';

import {Entity} from '../engine/ecs/Entity.js';
import {type TilemapObject} from '../engine/tiled/Tilemap.js';
import {Vector} from '../engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playerPool} from './playerPool.js';
import {TriggerComponent} from './TriggerComponent.js';

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
};
