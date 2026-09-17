import {type Toggle} from './Toggle.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type ToggleOptions = UiComponentThemeOptions<'toggle'> & {
  checked?: boolean | undefined;
  onChange?: ((toggle: Toggle) => void) | undefined;
};
