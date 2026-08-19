/**
 * Strict overlap: touching edges do not count, matching wall collision
 * (unlike the edge-inclusive `doRectanglesIntersect`), so sliding flush
 * along an edge never counts as overlapping.
 */
export function doRectanglesOverlap(
  x1: number,
  y1: number,
  width1: number,
  height1: number,
  x2: number,
  y2: number,
  width2: number,
  height2: number,
): boolean {
  return x1 + width1 > x2 && x2 + width2 > x1 && y1 + height1 > y2 && y2 + height2 > y1;
}
