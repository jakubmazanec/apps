import {type Config} from '../utilities/Config.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type ButtonConfig = Config<{
  pressOffset: number;
  // TODO: this should be simply optional! Also, verify other such mistakes.
  theme: ResolvedUiTheme | undefined;
}>;
