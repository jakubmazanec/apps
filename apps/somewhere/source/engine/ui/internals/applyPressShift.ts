import {type ButtonState} from '../ButtonState.js';
import {type UiChild} from '../UiChild.js';

// Position composes on top of the yoga-computed placement rather than replacing it, so
// shifting children directly never touches yoga's style or triggers a relayout, unlike
// reassigning `layout`.
export function applyPressShift(
  children: UiChild[],
  state: ButtonState,
  pressOffset: number,
): void {
  let shift = state === 'active' ? pressOffset : 0;

  for (let child of children) {
    ('view' in child ? child.view : child).y = shift;
  }
}
