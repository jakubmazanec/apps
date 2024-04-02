import {GraphicsComponent} from '../engine/GraphicsComponent.js';
import {LevelComponent} from '../engine/LevelComponent.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {System} from '../engine/System.js';
// import {Vector} from '../engine/Vector.js';
// import {doRectanglesIntersect} from '../utilities/doRectanglesIntersect.js';
import {levelQuery} from './levelQuery.js';
import {world} from './world.js';

export const motionSystem = new System({
  world,
  components: [MotionComponent, GraphicsComponent],
  entityQueries: {
    level: levelQuery,
  },
  // TODO: fix this
  // eslint-disable-next-line complexity -- TODO
  onUpdate: (delta, system) => {
    let {map} = system.entityQueries.level.getFirst().getComponent(LevelComponent);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);

      // set up velocity
      if (motion.target) {
        motion.velocity.x = motion.target.x - motion.position.x;
        motion.velocity.y = motion.target.y - motion.position.y;

        if (Math.abs(motion.velocity.x) < 1) {
          motion.velocity.x = 0;
        }

        if (Math.abs(motion.velocity.y) < 1) {
          motion.velocity.y = 0;
        }

        if (motion.velocity.length > 2) {
          motion.velocity.length = 2;
        }
      }

      // handle collisions
      let {boundingBox} = entity.getComponent(GraphicsComponent);
      let layer = map.layers[1]!;
      let deltaX = motion.velocity.x * delta;
      let deltaY = motion.velocity.y * delta;

      if (!(deltaX === 0 && deltaY === 0)) {
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

              if (
                !(
                  x1 + w1 < x2 - Number.EPSILON ||
                  x2 + w2 < x1 - Number.EPSILON ||
                  y1 + h1 < y2 - Number.EPSILON ||
                  y2 + h2 < y1 - Number.EPSILON
                )
              ) {
                if (motion.velocity.x > 0) {
                  let newDeltaX = deltaX - (x2 + w2 - x1);

                  if (
                    (newDeltaX > 0 && newDeltaX < 0.001) ||
                    (newDeltaX < 0 && newDeltaX > -0.001)
                  ) {
                    deltaX = 0;
                  } else if (newDeltaX > 0 && newDeltaX < deltaX) {
                    deltaX = newDeltaX;
                  }
                } else if (motion.velocity.x < 0) {
                  let newDeltaX = deltaX + (x1 + w1 - x2);

                  if (
                    (newDeltaX > 0 && newDeltaX < 0.001) ||
                    (newDeltaX < 0 && newDeltaX > -0.001)
                  ) {
                    deltaX = 0;
                  } else if (newDeltaX < 0 && newDeltaX > deltaX) {
                    deltaX = newDeltaX;
                  }
                }

                if (motion.velocity.y > 0) {
                  let newDeltaY = deltaY - (y2 + h2 - y1);

                  if (
                    (newDeltaY > 0 && newDeltaY < 0.001) ||
                    (newDeltaY < 0 && newDeltaY > -0.001)
                  ) {
                    deltaY = 0;
                  } else if (newDeltaY > 0 && newDeltaY < deltaY) {
                    deltaY = newDeltaY;
                  }
                } else if (motion.velocity.y < 0) {
                  let newDeltaY = deltaY + (y1 + h1 - y2);

                  if (
                    (newDeltaY > 0 && newDeltaY < 0.001) ||
                    (newDeltaY < 0 && newDeltaY > -0.001)
                  ) {
                    deltaY = 0;
                  } else if (newDeltaY < 0 && newDeltaY > deltaY) {
                    deltaY = newDeltaY;
                  }
                }
              }
            }
          }
        }
      }

      if (deltaX <= Number.EPSILON && deltaX >= -Number.EPSILON) {
        deltaX = 0;
      }

      if (deltaY <= Number.EPSILON && deltaY >= -Number.EPSILON) {
        deltaY = 0;
      }

      motion.position.x += deltaX;
      motion.position.y += deltaY;
    }
  },
});

world.addSystem(motionSystem);
