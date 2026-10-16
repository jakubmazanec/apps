import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';
import {type ToggleState} from './ToggleState.js';

export type ToggleParts = Parts<{
  backgrounds: {
    checked: Record<ToggleState, pixi.Container>;
    unchecked: Record<ToggleState, pixi.Container>;
  };
}>;
