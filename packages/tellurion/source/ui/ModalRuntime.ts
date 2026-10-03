import {type Runtime} from '../utilities/Runtime.js';
import {type UiRoot} from './UiRoot.js';

export type ModalRuntime = Runtime<{cancelFade: (() => void) | null; ui: UiRoot | null}>;
