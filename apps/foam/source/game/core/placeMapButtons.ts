/** The side of a place button, in art pixels. */
export const BUTTON_SIZE = 8;

/** The least room between two place buttons. */
export const BUTTON_GAP = 4;

/** How far the light reaches from its centre pixel; the map picture draws it that far. */
export const LIGHT_REACH = 4;

/** The light's box is one pixel larger than a button so that it keeps a visible rim. */
const LIGHT_SIZE = 2 * LIGHT_REACH + 1;
const MAX_ROUNDS = 20;

type Box = {x: number; y: number; size: number; isLight: boolean};

/**
 * The top-left corners of 8 × 8 buttons centred on these pixels, pushed apart until 4 pixels
 * separate any two, kept off the light at `you` and inside a map of this size.
 */
export function placeMapButtons(
  centres: Array<{x: number; y: number}>,
  you: {x: number; y: number} | null,
  width: number,
  height: number,
): Array<{x: number; y: number}> {
  let boxes: Box[] = centres.map((centre) => ({
    x: centre.x - BUTTON_SIZE / 2,
    y: centre.y - BUTTON_SIZE / 2,
    size: BUTTON_SIZE,
    isLight: false,
  }));

  if (you) {
    boxes.push({x: you.x - LIGHT_REACH, y: you.y - LIGHT_REACH, size: LIGHT_SIZE, isLight: true});
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let moved = false;

    for (let [i, first] of boxes.entries()) {
      for (let second of boxes.slice(i + 1)) {
        if (separate(first, second)) {
          moved = true;
        }
      }
    }

    for (let box of boxes) {
      if (!box.isLight) {
        box.x = Math.min(Math.max(box.x, 0), width - BUTTON_SIZE);
        box.y = Math.min(Math.max(box.y, 0), height - BUTTON_SIZE);
      }
    }

    if (!moved) {
      break;
    }
  }

  return boxes.filter((box) => !box.isLight).map(({x, y}) => ({x, y}));
}

/** Moves two boxes apart along the axis that needs the shorter move; whether it moved them. */
function separate(first: Box, second: Box): boolean {
  let x = getAxisNeed(first, second, 'x');
  let y = getAxisNeed(first, second, 'y');

  if (x.need <= 0 || y.need <= 0) {
    return false;
  }

  let axis: 'x' | 'y' = y.need < x.need ? 'y' : 'x';
  let {lower, upper, need} = axis === 'x' ? x : y;

  if (lower.isLight) {
    upper[axis] += need;
  } else if (upper.isLight) {
    lower[axis] -= need;
  } else {
    let half = Math.floor(need / 2);

    lower[axis] -= half;
    upper[axis] += need - half;
  }

  return true;
}

/** The box with the lower centre on an axis (a tie takes the first) and the room it lacks. */
function getAxisNeed(first: Box, second: Box, axis: 'x' | 'y') {
  let firstCentre = first[axis] + first.size / 2;
  let secondCentre = second[axis] + second.size / 2;
  let [lower, upper] = secondCentre < firstCentre ? [second, first] : [first, second];
  let gap = upper[axis] - (lower[axis] + lower.size);

  return {lower, upper, need: BUTTON_GAP - gap};
}
