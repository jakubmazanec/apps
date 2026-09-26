import {type Focusable} from '../Focusable.js';

export function nearestTopLeft(focusables: Focusable[]): Focusable | null {
  let best: Focusable | null = null;
  let bestScore = Infinity;

  for (let candidate of focusables) {
    let bounds = candidate.view.getBounds();
    let score = bounds.x + bounds.y;

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}
