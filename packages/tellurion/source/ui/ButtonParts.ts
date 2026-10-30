import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';
import {type ButtonState} from './ButtonState.js';

export type ButtonParts = Parts<{backgrounds: Record<ButtonState, pixi.Container>}>;
