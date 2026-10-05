// The screen shows about this many art pixels across and about this many down, or more in one of
// the two directions.
const TARGET_WIDTH = 200;
const TARGET_HEIGHT = 270;

/**
 * Integer scale that turns art pixels into device pixels, from the screen size in device pixels.
 * Whichever of the two directions fits fewer times decides, so a 1920 × 1080 screen gives 4 and an
 * upright phone at 1170 × 2100 gives 6. The result is kept between 2 and 8.
 */
export function getPixelScale(width: number, height: number) {
  return Math.min(
    8,
    Math.max(2, Math.round(Math.min(width / TARGET_WIDTH, height / TARGET_HEIGHT))),
  );
}
