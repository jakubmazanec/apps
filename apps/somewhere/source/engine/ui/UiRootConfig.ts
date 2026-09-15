import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type UiRootConfig = Config<{focusRing: UiTheme['focusRing'] | undefined; theme: UiTheme}>;
