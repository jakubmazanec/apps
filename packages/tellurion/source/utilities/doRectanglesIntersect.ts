export function doRectanglesIntersect(
  x1: number,
  y1: number,
  width1: number,
  height1: number,
  x2: number,
  y2: number,
  width2: number,
  height2: number,
): boolean {
  // check if one rectangle is to the left of the other
  if (x1 + width1 < x2 || x2 + width2 < x1) {
    return false;
  }

  // check if one rectangle is above the other
  if (y1 + height1 < y2 || y2 + height2 < y1) {
    return false;
  }

  return true;
}
