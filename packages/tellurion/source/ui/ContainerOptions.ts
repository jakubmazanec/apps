import type * as pixi from 'pixi.js';

import {type UiChildComponent} from './UiChildComponent.js';

export type ContainerOptions = {
  children?: UiChildComponent[] | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
