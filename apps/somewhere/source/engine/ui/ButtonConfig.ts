import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type ButtonConfig = Config<{
  pressOffset: number;
  theme: UiTheme | undefined;
}>;
