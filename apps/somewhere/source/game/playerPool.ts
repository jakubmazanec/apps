import * as pixi from 'pixi.js';

import {Entity} from '../engine/Entity.js';
import {ObjectPool} from '../engine/ObjectPool.js';
import {Vector} from '../engine/Vector.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {PlayerComponent} from './PlayerComponent.js';

const initialX = 64 * 9;
const initialY = 64 * 10;

// Requires the 'game' asset bundle to be loaded before .create() is called.
export const playerPool = new ObjectPool({
  onCreate: () =>
    new Entity({
      components: [
        new PlayerComponent({name: 'Jakub'}),
        new MotionComponent({
          position: new Vector(initialX, initialY),
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
          boundingBox: new pixi.Rectangle(0, 40, 64, 40),
        }),
      ],
    }),
  onReset: (entity) => {
    let motion = entity.getComponent(MotionComponent);

    motion.position.set(initialX, initialY);
    motion.velocity.set(0, 0);
    motion.target = undefined;

    return entity;
  },
});
