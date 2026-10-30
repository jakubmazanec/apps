import {type Runtime} from '../utilities/Runtime.js';
import {type Fader} from './Fader.js';
import {type UiRoot} from './UiRoot.js';

export type ModalRuntime = Runtime<{fader: Fader | null; ui: UiRoot | null}>;
