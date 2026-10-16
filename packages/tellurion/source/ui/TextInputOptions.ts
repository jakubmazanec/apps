import type * as pixi from 'pixi.js';

import {type TextInput} from './TextInput.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type TextInputOptions = UiComponentThemeOptions<'textInput'> & {
  value?: string | undefined;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
  container: HTMLElement;
  // Consulted while editing, so the keys that commit or dismiss a field follow
  // the game's bindings. Structural, so tests pass a fake and neither module
  // imports the other.
  input: {focusMatches: (command: 'activate' | 'cancel', event: KeyboardEvent) => boolean};
  role?: 'body' | 'label' | undefined;
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
  fill?: pixi.ColorSource | undefined;
  onChange?: ((input: TextInput) => void) | undefined;
  onSubmit?: ((input: TextInput) => void) | undefined;
};
