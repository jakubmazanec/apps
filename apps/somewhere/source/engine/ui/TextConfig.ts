import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type TextConfig = Config<{
  theme: UiTheme | undefined;
}>;
