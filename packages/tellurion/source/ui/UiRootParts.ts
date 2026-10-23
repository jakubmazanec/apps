import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';

export type UiRootParts = Parts<{ring: pixi.NineSliceSprite; ringContainer: pixi.Container}>;
