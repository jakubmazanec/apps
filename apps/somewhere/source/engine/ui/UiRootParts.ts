import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';

export type UiRootParts = Parts<{overlay: pixi.Container; ring: pixi.NineSliceSprite}>;
