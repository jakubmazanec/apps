import {GraphicsComponent} from '../engine/GraphicsComponent.js';
import {LevelComponent} from '../engine/LevelComponent.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {System} from '../engine/System.js';
// import {Vector} from '../engine/Vector.js';
import {doRectanglesIntersect} from '../utilities/doRectanglesIntersect.js';
import {levelQuery} from './levelQuery.js';
import {world} from './world.js';

export const motionSystem = new System({
  world,
  components: [MotionComponent, GraphicsComponent],
  entityQueries: {
    level: levelQuery,
  },
  onUpdate: (delta, system) => {
    let {map} = system.entityQueries.level.getFirst().getComponent(LevelComponent);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);

      // set up velocity
      if (motion.target) {
        let deltaX = motion.target.x - motion.position.x;
        let deltaY = motion.target.y - motion.position.y;

        motion.velocity.x = deltaX > 0 ? Math.min(1, deltaX) : Math.max(-1, deltaX);
        motion.velocity.y = deltaY > 0 ? Math.min(1, deltaY) : Math.max(-1, deltaY);

        if (Math.abs(deltaX) < 2) {
          motion.velocity.x = 0;
        }

        if (Math.abs(deltaY) < 2) {
          motion.velocity.y = 0;
        }

        if (motion.velocity.length > 1) {
          motion.velocity.length = 1;
        }
      }

      // handle collisions
      let {boundingBox} = entity.getComponent(GraphicsComponent);
      let layer = map.layers[1]!;
      let canMove = true;

      for (let row = 0; row < map.rowCount; row++) {
        for (let column = 0; column < map.columnCount; column++) {
          let tile = layer.tiles[column]![row]!;

          if (tile.boundingBox) {
            let x1 = tile.view.x + tile.boundingBox.x;
            let y1 = tile.view.y + tile.boundingBox.y;
            let w1 = tile.boundingBox.width;
            let h1 = tile.boundingBox.height;
            let x2 = motion.position.x + motion.velocity.x * delta + boundingBox.x;
            let y2 = motion.position.y + motion.velocity.y * delta + boundingBox.y;
            let w2 = boundingBox.width;
            let h2 = boundingBox.height;

            let doIntersect = doRectanglesIntersect(x1, y1, w1, h1, x2, y2, w2, h2);

            if (doIntersect) {
              canMove = false;
              motion.target = undefined;
              motion.velocity.set(0, 0);
            }
          }
        }
      }

      if (canMove) {
        motion.position.add(motion.velocity, delta);
      }
    }
  },
});

world.addSystem(motionSystem);
