import {type Config} from '../utilities/Config.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type ButtonConfig = Config<{
  pressOffset: number;
  theme: ResolvedUiTheme | undefined;
}>;
