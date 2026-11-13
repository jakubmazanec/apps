import type * as pixi from 'pixi.js';

import {type ChildUiComponent} from './ChildUiComponent.js';

export type ContainerOptions = {
  children?: ChildUiComponent[] | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
