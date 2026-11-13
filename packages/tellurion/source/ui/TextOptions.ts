import type * as pixi from 'pixi.js';

import {type UiComponentThemeOptions} from './UiTheme.js';

// TODO: support other styling options
export type TextOptions = UiComponentThemeOptions<'text'> & {
  text: string;
  role?: 'body' | 'label' | undefined;
  wrapWidth?: number | undefined;
  anchor?: pixi.PointData | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
