import {type Focusable} from './Focusable.js';
import {type Overlay} from './Overlay.js';

export type FocusScope = {
  previousFocus: Focusable | null;
  root: Overlay;
};
