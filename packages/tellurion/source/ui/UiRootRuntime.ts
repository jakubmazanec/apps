import {type Runtime} from '../utilities/Runtime.js';
import {type FocusableUiComponent} from './FocusableUiComponent.js';
import {type FocusScope} from './FocusScope.js';

export type UiRootRuntime = Runtime<{
  focused: FocusableUiComponent | null;
  isRingVisible: boolean;
  scopes: FocusScope[];
}>;
