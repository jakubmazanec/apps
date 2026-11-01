import {type MapPoint} from './getMapPoint.js';

/** Pixels kept free between the map's edge and the outermost place. */
export const MAP_INSET = 8;

/** Metres per pixel when the points have no extent to fit. */
const LONELY_METRES_PER_PIXEL = 10;

/** How the map's metres lie on its art pixels. */
export type MapFrame = {width: number; height: number; metresPerPixel: number; centre: MapPoint};

/** Fits every point into a map of this size with `inset` pixels to spare on every side. */
export function fitMapFrame(
  points: MapPoint[],
  width: number,
  height: number,
  inset: number,
): MapFrame {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (points.length === 0) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  let boxWidth = maxX - minX;
  let boxHeight = maxY - minY;
  let metresPerPixel =
    boxWidth === 0 && boxHeight === 0 ?
      LONELY_METRES_PER_PIXEL
    : Math.max(
        boxWidth / Math.max(1, width - 2 * inset),
        boxHeight / Math.max(1, height - 2 * inset),
      );

  return {width, height, metresPerPixel, centre: {x: (minX + maxX) / 2, y: (minY + maxY) / 2}};
}

/** A point in metres as a pixel of the map, rounded. */
export function toMapPixel(frame: MapFrame, point: MapPoint): {x: number; y: number} {
  return {
    x: Math.round(frame.width / 2 + (point.x - frame.centre.x) / frame.metresPerPixel),
    y: Math.round(frame.height / 2 + (point.y - frame.centre.y) / frame.metresPerPixel),
  };
}
