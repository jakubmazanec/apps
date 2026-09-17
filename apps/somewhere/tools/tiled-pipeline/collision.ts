import {type CollisionMode} from './config.js';
import {type TileMask} from './pixels.js';

export type CollisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function spanWithinRows(mask: TileMask, top: number, bottom: number): [number, number] | undefined {
  let minX = mask.width;
  let maxX = -1;

  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.solid[y * mask.width + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }

  return maxX < 0 ? undefined : [minX, maxX];
}

export function computeCollisionBox(
  mask: TileMask,
  mode: CollisionMode,
  footprintMaxHeight: number,
): CollisionBox | undefined {
  if (mode === 'none') {
    return undefined;
  }

  if (mode === 'full') {
    return {x: 0, y: 0, width: mask.width, height: mask.height};
  }

  let minY = mask.height;
  let maxY = -1;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.solid[y * mask.width + x]) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxY < 0) {
    return undefined;
  }

  // Clamping the rows first and measuring the span inside them is the whole
  // point: measuring over the whole tile gives anything wider at the top than
  // at the base a box with the top's width at the base's height.
  let top = mode === 'footprint' ? Math.max(minY, maxY - footprintMaxHeight + 1) : minY;
  let span = spanWithinRows(mask, top, maxY) as [number, number];

  return {x: span[0], y: top, width: span[1] - span[0] + 1, height: maxY - top + 1};
}
