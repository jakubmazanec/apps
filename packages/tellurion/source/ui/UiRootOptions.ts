import {type UiFocusEvent} from './UiFocusEvent.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type UiRootOptions = {
  theme: ResolvedUiTheme;
  onFocusEvent?: ((event: UiFocusEvent) => void) | undefined;
};
