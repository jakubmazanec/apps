import {System} from '../engine/ecs/System.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {LevelComponent} from './LevelComponent.js';
import {levelQuery} from './levelQuery.js';
import {MotionComponent} from './MotionComponent.js';

const MAX_DELTA_TIME = 2;

export const motionSystem = new System({
  components: [MotionComponent, GraphicsComponent],
  onUpdate: (ticker, system) => {
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let deltaTime = Math.min(ticker.deltaTime, MAX_DELTA_TIME);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);

      if (motion.target) {
        motion.velocity.x = motion.target.x - motion.position.x;
        motion.velocity.y = motion.target.y - motion.position.y;

        if (Math.abs(motion.velocity.x) < 0.1) {
          motion.velocity.x = 0;
        }

        if (Math.abs(motion.velocity.y) < 0.1) {
          motion.velocity.y = 0;
        }

        if (motion.velocity.length > 4) {
          motion.velocity.length = 4;
        }
      }

      let {boundingBox} = entity.getComponent(GraphicsComponent);
      let layer = map.layers[1]!;

      let deltaX = motion.velocity.x * deltaTime;
      let deltaY = motion.velocity.y * deltaTime;

      // X-axis pass: move only along X, clip against tile walls.
      if (deltaX !== 0) {
        let tentativeX = motion.position.x + deltaX;

        for (let column = 0; column < map.columnCount; column++) {
          for (let row = 0; row < map.rowCount; row++) {
            let tile = layer.tiles[column]![row]!;

            if (!tile.boundingBox) {
              continue;
            }

            let tileX = tile.view.x + tile.boundingBox.x;
            let tileY = tile.view.y + tile.boundingBox.y;
            let tileRight = tileX + tile.boundingBox.width;
            let tileBottom = tileY + tile.boundingBox.height;
            let playerX = tentativeX + boundingBox.x;
            let playerY = motion.position.y + boundingBox.y;
            let playerRight = playerX + boundingBox.width;
            let playerBottom = playerY + boundingBox.height;

            // Strict overlap: touching edges don't count, so the player can slide flush along a wall.
            if (
              playerRight > tileX &&
              tileRight > playerX &&
              playerBottom > tileY &&
              tileBottom > playerY
            ) {
              if (deltaX > 0) {
                // Guard against teleport-backward when already stuck inside a tile.
                tentativeX = Math.max(motion.position.x, tileX - boundingBox.x - boundingBox.width);
              } else {
                tentativeX = Math.min(motion.position.x, tileRight - boundingBox.x);
              }
            }
          }
        }

        deltaX = tentativeX - motion.position.x;
      }

      // Y-axis pass: uses the already-clipped X so corner collisions resolve correctly.
      if (deltaY !== 0) {
        let tentativeY = motion.position.y + deltaY;

        for (let column = 0; column < map.columnCount; column++) {
          for (let row = 0; row < map.rowCount; row++) {
            let tile = layer.tiles[column]![row]!;

            if (!tile.boundingBox) {
              continue;
            }

            let tileX = tile.view.x + tile.boundingBox.x;
            let tileY = tile.view.y + tile.boundingBox.y;
            let tileRight = tileX + tile.boundingBox.width;
            let tileBottom = tileY + tile.boundingBox.height;
            let playerX = motion.position.x + deltaX + boundingBox.x;
            let playerY = tentativeY + boundingBox.y;
            let playerRight = playerX + boundingBox.width;
            let playerBottom = playerY + boundingBox.height;

            // Strict overlap: touching edges don't count, so the player can slide flush along a wall.
            if (
              playerRight > tileX &&
              tileRight > playerX &&
              playerBottom > tileY &&
              tileBottom > playerY
            ) {
              if (deltaY > 0) {
                tentativeY = Math.max(
                  motion.position.y,
                  tileY - boundingBox.y - boundingBox.height,
                );
              } else {
                tentativeY = Math.min(motion.position.y, tileBottom - boundingBox.y);
              }
            }
          }
        }

        deltaY = tentativeY - motion.position.y;
      }

      // Map-boundary clamp: keep the visible bounding box inside the map.
      let finalX = Math.min(
        Math.max(motion.position.x + deltaX, -boundingBox.x),
        map.width - boundingBox.x - boundingBox.width,
      );
      let finalY = Math.min(
        Math.max(motion.position.y + deltaY, -boundingBox.y),
        map.height - boundingBox.y - boundingBox.height,
      );

      deltaX = finalX - motion.position.x;
      deltaY = finalY - motion.position.y;

      if (deltaX === 0 && deltaY === 0) {
        motion.target = undefined;
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      }

      motion.position.x += deltaX;
      motion.position.y += deltaY;
    }
  },
});
