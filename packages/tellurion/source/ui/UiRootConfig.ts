import {type Config} from '../utilities/Config.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type UiRootConfig = Config<{theme: ResolvedUiTheme}>;
