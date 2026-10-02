import {type UiFocusEvent} from './UiFocusEvent.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type UiRootOptions = {
  theme: ResolvedUiTheme;
  // Semantic focus feedback (the game maps it to a sound). `move` fires when a
  // focus command lands on a different component; `reject` when a directional
  // move finds no candidate. Tap-driven silent focus fires nothing.
  onFocusEvent?: ((event: UiFocusEvent) => void) | undefined;
};
