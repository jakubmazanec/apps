import {type FocusableUiComponent} from '../FocusableUiComponent.js';

export function findNearestTopLeft(
  focusables: FocusableUiComponent[],
): FocusableUiComponent | null {
  let best: FocusableUiComponent | null = null;
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
