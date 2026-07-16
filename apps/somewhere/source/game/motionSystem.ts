import {System} from '../engine/ecs/System.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {LevelComponent} from './LevelComponent.js';
import {levelQuery} from './levelQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {WallHit} from './WallHit.js';
import {wallHitChannel} from './wallHitChannel.js';

const MAX_DELTA_TIME = 2;

// Shared with playerSystem's keyboard path so keyboard speed and this clamp
// cannot drift apart — the clamp only runs when motion.target is set, so the
// keyboard path must carry the same value itself.
export const MAX_SPEED = 1;

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

        if (Math.abs(motion.velocity.x) < 0.025) {
          motion.velocity.x = 0;
        }

        if (Math.abs(motion.velocity.y) < 0.025) {
          motion.velocity.y = 0;
        }

        if (motion.velocity.length > MAX_SPEED) {
          motion.velocity.length = MAX_SPEED;
        }
      }

      let {boundingBox} = entity.getComponent(GraphicsComponent);
      let layer = map.layers[1]!;

      let deltaX = motion.velocity.x * deltaTime;
      let deltaY = motion.velocity.y * deltaTime;
      let contactTile;
      let isMoving = deltaX !== 0 || deltaY !== 0;

      // TODO: Both axis passes below scan the entire tile grid per moving
      // entity per frame (2 × columnCount × rowCount tile checks), even though
      // almost no tiles have a boundingBox. Tiles are grid-aligned (16 art px) and
      // layer.tiles is indexed [column][row], so each pass only needs the
      // column/row range covered by the swept player box (union of current and
      // tentative position, divided by tile size, clamped to grid bounds) —
      // a handful of cells instead of the full grid. The two passes are also
      // near-identical ~40-line copies differing only by axis; extract a
      // shared sweepAxis helper when fixing. Constraints to preserve: X pass
      // must run before Y (Y reads the clipped X), the overlap test is
      // deliberately strict (touching edges don't collide, so the player can
      // slide flush along walls), contactTile keeps the first hit in
      // column-major order, and a tile boundingBox larger than its 16-art-px cell
      // would escape a naive swept range (all current boxes fit their cell;
      // expand the range by a margin or assert the invariant).

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
              contactTile ??= tile;

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
              contactTile ??= tile;

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

      // Edge-trigger: one WallHit per contact episode, on the frame contact begins.
      // Idle frames keep the contact state, so resting flush against a wall stays one episode.
      if (isMoving) {
        if (contactTile !== undefined && !motion.isTouchingWall) {
          wallHitChannel.push(new WallHit({entity, tile: contactTile}));
        }

        motion.isTouchingWall = contactTile !== undefined;
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
