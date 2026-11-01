import {type Focusable} from './Focusable.js';
import {type UiOverlayComponent} from './UiOverlayComponent.js';

export type FocusScope = {
  previousFocus: Focusable | null;
  root: UiOverlayComponent;
};
