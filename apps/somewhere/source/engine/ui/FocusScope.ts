import {type Focusable} from './Focusable.js';
import {type UiChild} from './UiChild.js';

export type FocusScope = {
  onCancel?: (() => boolean) | undefined;
  previousFocus: Focusable | null;
  root: UiChild;
};
