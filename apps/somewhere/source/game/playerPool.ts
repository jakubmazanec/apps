import * as pixi from 'pixi.js';

import {Entity} from '../engine/ecs/Entity.js';
import {ObjectPool} from '../engine/utilities/ObjectPool.js';
import {Vector} from '../engine/utilities/Vector.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {PlayerComponent} from './PlayerComponent.js';

// Requires the 'game' asset bundle to be loaded before .create() is called.
export const playerPool = new ObjectPool({
  onCreate: () =>
    new Entity({
      components: [
        new PlayerComponent({name: 'Jakub'}),
        new MotionComponent({
          position: new Vector(0, 0),
          velocity: new Vector(0, 0),
        }),
        new GraphicsComponent({
          spriteOptions: {
            assetName: 'character',
            spriteNames: [
              'standing-down',
              'walking-down',
              'standing-left',
              'walking-left',
              'standing-up',
              'walking-up',
              'standing-right',
              'walking-right',
            ],
          },
          boundingBox: new pixi.Rectangle(0, 10, 16, 10),
        }),
      ],
    }),
  onReset: (entity) => {
    let motion = entity.getComponent(MotionComponent);

    // The spawn factory (or the map-center fallback) positions the entity
    // after create().
    motion.velocity.set(0, 0);
    motion.target = undefined;

    return entity;
  },
});
