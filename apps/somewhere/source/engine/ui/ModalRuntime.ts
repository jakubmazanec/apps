import {type Runtime} from '../utilities/Runtime.js';

export type ModalRuntime = Runtime<{cancelFade: (() => void) | null}>;
