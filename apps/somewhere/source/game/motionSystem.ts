import * as pixi from 'pixi.js';

import {System} from '../engine/ecs/System.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {LevelComponent} from './LevelComponent.js';
import {levelQuery} from './levelQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {WallHit} from './WallHit.js';
import {wallHitChannel} from './wallHitChannel.js';

// Shared with playerSystem's keyboard path so keyboard speed and this clamp
// cannot drift apart — the clamp only runs when motion.target is set, so the
// keyboard path must carry the same value itself.
export const MAX_SPEED = 1;

export const motionSystem = new System({
  components: [MotionComponent, GraphicsComponent],
  onUpdate: (ticker, system) => {
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    // Consume the whole minFPS-clamped frame delta, the same delta tweens and
    // timers use, so walking speed is frame-rate independent and stays in sync
    // with tween-driven visuals. The collision passes test destination overlap,
    // not the swept path, so this is safe only while the max per-frame
    // displacement stays below the collider-skip threshold (holds at
    // MAX_SPEED = 1: at most 6 art-px per frame at the 100 ms cap). If a faster
    // mover is added (dash, knockback, a higher MAX_SPEED), drain deltaTime in
    // sub-steps of at most 2 units, running the collision passes per chunk.
    let {deltaTime} = ticker;

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
      let layer = map.layers[map.entityLayerIndex]!;
      let deltaX = motion.velocity.x * deltaTime;
      let deltaY = motion.velocity.y * deltaTime;

      // Arrive-clamp: never step past a tap-to-move target, or the player
      // overshoots and oscillates about it at deltaTime > 1. Runs before the
      // wall passes, which still clip the step further. Error is target minus
      // position; position is unchanged this frame, and velocity is parallel to
      // the error, so deltaX and deltaY share its sign.
      if (motion.target) {
        let errorX = motion.target.x - motion.position.x;
        let errorY = motion.target.y - motion.position.y;

        if (Math.abs(deltaX) > Math.abs(errorX)) {
          deltaX = errorX;
        }

        if (Math.abs(deltaY) > Math.abs(errorY)) {
          deltaY = errorY;
        }
      }

      let contactTile;
      let contactBox;
      let isMoving = deltaX !== 0 || deltaY !== 0;

      // TODO: Both axis passes below scan the entire tile grid per moving
      // entity per frame (2 × columnCount × rowCount tile checks), even though
      // almost no tiles have collision boxes. Tiles are grid-aligned (16 art px) and
      // layer.tiles is indexed [column][row], so each pass only needs the
      // column/row range covered by the swept player box (union of current and
      // tentative position, divided by tile size, clamped to grid bounds) —
      // a handful of cells instead of the full grid. The two passes are also
      // near-identical ~40-line copies differing only by axis; extract a
      // shared sweepAxis helper when fixing. Constraints to preserve: X pass
      // must run before Y (Y reads the clipped X), the overlap test is
      // deliberately strict (touching edges don't collide, so the player can
      // slide flush along walls), contactTile keeps the first hit in
      // column-major order, and a tile collision box larger than its 16-art-px cell
      // would escape a naive swept range (all current boxes fit their cell;
      // expand the range by a margin or assert the invariant).

      // X-axis pass: move only along X, clip against tile walls.
      if (deltaX !== 0) {
        let tentativeX = motion.position.x + deltaX;

        for (let column = 0; column < map.columnCount; column++) {
          for (let row = 0; row < map.rowCount; row++) {
            let tile = layer.tiles[column]![row]!;

            for (let box of tile.collisionBoxes) {
              let tileX = tile.view.x + box.x;
              let tileY = tile.view.y + box.y;
              let tileRight = tileX + box.width;
              let tileBottom = tileY + box.height;
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
                if (contactTile === undefined) {
                  contactTile = tile;
                  contactBox = new pixi.Rectangle(tileX, tileY, box.width, box.height);
                }

                if (deltaX > 0) {
                  // Guard against teleport-backward when already stuck inside a tile.
                  tentativeX = Math.max(
                    motion.position.x,
                    tileX - boundingBox.x - boundingBox.width,
                  );
                } else {
                  tentativeX = Math.min(motion.position.x, tileRight - boundingBox.x);
                }
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

            for (let box of tile.collisionBoxes) {
              let tileX = tile.view.x + box.x;
              let tileY = tile.view.y + box.y;
              let tileRight = tileX + box.width;
              let tileBottom = tileY + box.height;
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
                if (contactTile === undefined) {
                  contactTile = tile;
                  contactBox = new pixi.Rectangle(tileX, tileY, box.width, box.height);
                }

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
        }

        deltaY = tentativeY - motion.position.y;
      }

      // Edge-trigger: one WallHit per contact episode, on the frame contact begins.
      // Idle frames keep the contact state, so resting flush against a wall stays one episode.
      if (isMoving) {
        if (contactTile !== undefined && contactBox !== undefined && !motion.isTouchingWall) {
          wallHitChannel.push(new WallHit({entity, tile: contactTile, box: contactBox}));
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
