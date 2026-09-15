import {type Toggle} from './Toggle.js';
import {type ToggleBackgrounds} from './ToggleBackgrounds.js';
import {type ThemedOptions} from './UiTheme.js';

export type ToggleOptions = ThemedOptions<ToggleBackgrounds> & {
  checked?: boolean | undefined;
  onChange?: ((toggle: Toggle) => void) | undefined;
};
