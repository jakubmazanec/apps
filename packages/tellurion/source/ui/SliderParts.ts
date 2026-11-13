import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';
import {type SliderState} from './SliderState.js';

export type SliderParts = Parts<{backgrounds: Record<SliderState | 'fill', pixi.Container>}>;
