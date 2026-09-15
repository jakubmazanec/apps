import type * as pixi from 'pixi.js';

import {type Config} from '../utilities/Config.js';
import {type UiTextStyle, type UiTheme} from './UiTheme.js';

export type TextInputConfig = Config<{
  caretHeight: number;
  container: HTMLElement;
  layout: Exclude<pixi.ContainerOptions['layout'], boolean>;
  maxLength: number | undefined;
  placeholder: string;
  textStyle: Partial<UiTextStyle>;
  theme: UiTheme | undefined;
}>;
