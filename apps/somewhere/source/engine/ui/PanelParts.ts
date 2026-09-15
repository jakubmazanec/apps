import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';

export type PanelParts = Parts<{background: pixi.Container | undefined}>;
