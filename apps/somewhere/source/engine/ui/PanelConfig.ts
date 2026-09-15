import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type PanelConfig = Config<{
  layout: Exclude<pixi.ContainerOptions['layout'], boolean>;
  theme: UiTheme | undefined;
}>;
