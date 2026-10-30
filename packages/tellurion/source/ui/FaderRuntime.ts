import {type Runtime} from '../utilities/Runtime.js';

export type FaderRuntime = Runtime<{cancelFade?: () => void}>;
