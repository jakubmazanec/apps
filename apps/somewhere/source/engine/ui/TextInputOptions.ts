import type * as pixi from 'pixi.js';

import {type TextInput} from './TextInput.js';
import {type TextInputBackgrounds} from './TextInputBackgrounds.js';
import {type ThemedOptions} from './UiTheme.js';

export type TextInputOptions = ThemedOptions<TextInputBackgrounds> & {
  value?: string | undefined;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
  container: HTMLElement;
  role?: 'body' | 'label' | undefined;
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
  fill?: pixi.ColorSource | undefined;
  onChange?: ((input: TextInput) => void) | undefined;
  onEnter?: ((input: TextInput) => void) | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
