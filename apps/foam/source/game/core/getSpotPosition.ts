import {MARGIN, type SceneArea} from './getSceneArea.js';

export type SpotPositionOptions = {
  x: number;
  y: number;

  /** Size of the button. */
  width: number;
  height: number;

  area: SceneArea;
};

// When the button is larger than the room it has, the lower limit wins: the
// button then starts at the left or top limit and runs out at the other side.
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

// Returns the top left corner of a scene button in screen coordinates, in whole
// pixels. The centre goes to the given fractions of the area, and the button
// is then moved fully on screen: the margin away from the left, right and
// bottom edges, and under the top row.
export function getSpotPosition({x, y, width, height, area}: SpotPositionOptions): {
  left: number;
  top: number;
} {
  let left = Math.round(x * area.width - width / 2);
  let top = Math.round(area.top + y * area.height - height / 2);

  return {
    left: clamp(left, MARGIN, Math.floor(area.width - MARGIN - width)),
    top: clamp(top, Math.ceil(area.top), Math.floor(area.top + area.height - MARGIN - height)),
  };
}
