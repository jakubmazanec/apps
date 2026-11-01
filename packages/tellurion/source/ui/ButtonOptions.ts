import {type Button} from './Button.js';
import {type ChildUiComponent} from './ChildUiComponent.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type ButtonOptions = UiComponentThemeOptions<'button'> & {
  children?: ChildUiComponent[] | undefined;
  onClick?: ((button: Button) => void) | undefined;
};
