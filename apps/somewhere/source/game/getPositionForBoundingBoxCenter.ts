import type * as pixi from 'pixi.js';

import {Vector} from '../engine/utilities/Vector.js';

/**
 * The entity position that centers its bounding box on `center` (map-space
 * art px). Shared by the spawn factory, door teleports, and tap targeting.
 */
export function getPositionForBoundingBoxCenter(
  center: Vector,
  boundingBox: pixi.Rectangle,
): Vector {
  return new Vector(
    center.x - boundingBox.x - boundingBox.width / 2,
    center.y - boundingBox.y - boundingBox.height / 2,
  );
}
