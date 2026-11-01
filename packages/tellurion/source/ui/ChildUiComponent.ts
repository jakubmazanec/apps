import type * as pixi from 'pixi.js';

import {type UiComponent} from './UiComponent.js';

export type ChildUiComponent = pixi.Container | UiComponent;
