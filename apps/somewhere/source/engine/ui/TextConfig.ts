import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type TextConfig = Config<{
  anchor: pixi.PointData;
  layout: pixi.ContainerOptions['layout'];
  style: pixi.TextStyleOptions;
  theme: UiTheme | undefined;
}>;
