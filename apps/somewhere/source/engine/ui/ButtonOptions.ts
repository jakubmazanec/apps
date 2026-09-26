import {type Button} from './Button.js';
import {type UiChild} from './UiChild.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type ButtonOptions = UiComponentThemeOptions<'button'> & {
  children?: UiChild[] | undefined;
  onClick?: ((button: Button) => void) | undefined;
};
