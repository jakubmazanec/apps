import {type Runtime} from '../utilities/Runtime.js';
import {type Focusable} from './Focusable.js';
import {type FocusScope} from './FocusScope.js';

export type UiRootRuntime = Runtime<{
  focused: Focusable | null;
  isRingVisible: boolean;
  scopes: FocusScope[];
}>;
