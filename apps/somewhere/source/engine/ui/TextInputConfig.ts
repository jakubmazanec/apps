import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type TextInputConfig = Config<{
  caretHeight: number;
  container: HTMLElement;
  maxLength: number | undefined;
  theme: UiTheme | undefined;
}>;
