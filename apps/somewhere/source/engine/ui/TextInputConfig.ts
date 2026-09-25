import {type Config} from '../utilities/Config.js';
import {type TextInputOptions} from './TextInputOptions.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type TextInputConfig = Config<{
  caretHeight: number;
  container: HTMLElement;
  input: TextInputOptions['input'];
  maxLength: number | undefined;
  theme: ResolvedUiTheme | undefined;
}>;
