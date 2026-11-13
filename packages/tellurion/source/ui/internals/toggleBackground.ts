import type * as pixi from 'pixi.js';

import {type ToggleState} from '../ToggleState.js';

export function toggleBackground(
  backgrounds: {
    checked: Record<ToggleState, pixi.Container>;
    unchecked: Record<ToggleState, pixi.Container>;
  },
  isChecked: boolean,
  state: ToggleState,
): pixi.Container {
  return backgrounds[isChecked ? 'checked' : 'unchecked'][state];
}
