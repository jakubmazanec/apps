import {type TextInput} from './TextInput.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type TextInputOptions = UiComponentThemeOptions<'textInput'> & {
  value?: string | undefined;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
  // TODO: think of better way how to handle this (i.e. needing container element so native
  // <input> can be properly placed on canvas).
  container: HTMLElement;
  onChange?: ((input: TextInput) => void) | undefined;
  onSubmit?: ((input: TextInput) => void) | undefined;
};
