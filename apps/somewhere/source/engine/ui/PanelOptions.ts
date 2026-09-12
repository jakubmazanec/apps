import type * as pixi from 'pixi.js';

import {type UiChild} from './UiChild.js';
import {type UiTheme} from './UiTheme.js';

export type PanelOptions = {
  background?: pixi.Container | undefined;
  theme?: UiTheme | undefined;
  children?: UiChild[] | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
