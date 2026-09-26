import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';
import {type SliderState} from './SliderState.js';

export type SliderParts = Parts<{
  fill: pixi.Container;
  trackBackgrounds: Record<SliderState, pixi.Container>;
}>;
