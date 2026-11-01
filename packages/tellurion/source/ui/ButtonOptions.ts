import {type Button} from './Button.js';
import {type UiChildComponent} from './UiChildComponent.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type ButtonOptions = UiComponentThemeOptions<'button'> & {
  children?: UiChildComponent[] | undefined;
  onClick?: ((button: Button) => void) | undefined;
};
