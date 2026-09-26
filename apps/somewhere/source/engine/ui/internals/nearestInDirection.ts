import {type Focusable} from '../Focusable.js';
import {type FocusDirection} from '../FocusDirection.js';

// Spatial scoring: distance along the movement axis plus a weighted penalty
// for perpendicular gap (zero while the candidate stays within the source's
// cross-axis extent); candidates whose bounds overlap the source's
// perpendicular extent score better, so "down" prefers the component directly
// below over a nearer diagonal one.
const PERPENDICULAR_PENALTY = 2;
const OVERLAP_BONUS = 0.5;

export function nearestInDirection(
  current: Focusable,
  focusables: Focusable[],
  direction: FocusDirection,
): Focusable | null {
  let source = current.view.getBounds();
  let horizontal = direction === 'left' || direction === 'right';
  let best: Focusable | null = null;
  let bestScore = Infinity;

  for (let candidate of focusables) {
    if (candidate === current) {
      continue;
    }

    let bounds = candidate.view.getBounds();
    let dx = bounds.x + bounds.width / 2 - (source.x + source.width / 2);
    let dy = bounds.y + bounds.height / 2 - (source.y + source.height / 2);
    let forward =
      direction === 'right' ? dx
      : direction === 'left' ? -dx
      : direction === 'down' ? dy
      : -dy;

    if (forward <= 0) {
      continue;
    }

    let overlaps =
      horizontal ?
        bounds.y < source.y + source.height && source.y < bounds.y + bounds.height
      : bounds.x < source.x + source.width && source.x < bounds.x + bounds.width;
    // Perpendicular distance is the gap between the two extents on the cross
    // axis, which is zero whenever the candidate sits within the source's
    // column (vertical moves) or row (horizontal moves). Measuring the gap
    // rather than the center-to-center offset means a small control directly
    // under a wide one counts as straight ahead, so "down" prefers it over a
    // farther but center-aligned component.
    let perpendicularGap =
      horizontal ?
        Math.max(
          0,
          Math.max(source.y, bounds.y) -
            Math.min(source.y + source.height, bounds.y + bounds.height),
        )
      : Math.max(
          0,
          Math.max(source.x, bounds.x) -
            Math.min(source.x + source.width, bounds.x + bounds.width),
        );
    let score = forward + PERPENDICULAR_PENALTY * perpendicularGap;

    if (overlaps) {
      score *= OVERLAP_BONUS;
    }

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}
