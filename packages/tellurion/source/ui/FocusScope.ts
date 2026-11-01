import {type FocusableUiComponent} from './FocusableUiComponent.js';
import {type OverlayUiComponent} from './OverlayUiComponent.js';

export type FocusScope = {
  previousFocus: FocusableUiComponent | null;
  root: OverlayUiComponent;
};
