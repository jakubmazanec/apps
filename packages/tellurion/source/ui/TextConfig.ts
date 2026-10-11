import {type Config} from '../utilities/Config.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type TextConfig = Config<{
  theme: ResolvedUiTheme | undefined;
}>;
