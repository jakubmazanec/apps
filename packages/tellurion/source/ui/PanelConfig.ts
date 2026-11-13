import {type Config} from '../utilities/Config.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type PanelConfig = Config<{
  theme: ResolvedUiTheme | undefined;
}>;
