import {type TextInput} from './TextInput.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type TextInputOptions = UiComponentThemeOptions<'textInput'> & {
  value?: string | undefined;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
  container: HTMLElement;
  onChange?: ((input: TextInput) => void) | undefined;
  onSubmit?: ((input: TextInput) => void) | undefined;
};
