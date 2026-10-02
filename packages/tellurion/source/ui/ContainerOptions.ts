import type * as pixi from 'pixi.js';

import {type UiChild} from './UiChild.js';

export type ContainerOptions = {
  children?: UiChild[] | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
