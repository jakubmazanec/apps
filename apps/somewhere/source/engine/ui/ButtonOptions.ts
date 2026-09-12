import type * as pixi from 'pixi.js';

import {type Button} from './Button.js';
import {type ButtonBackgrounds} from './ButtonBackgrounds.js';
import {type UiChild} from './UiChild.js';
import {type ThemedOptions} from './UiTheme.js';

export type ButtonOptions = ThemedOptions<ButtonBackgrounds> & {
  children?: UiChild[] | undefined;
  onClick?: ((button: Button) => void) | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
  // Pixels to shift the content down while pressed, so the label tracks a
  // background whose face drops on press (e.g. an extruded 3D button).
  pressOffset?: number | undefined;
};
