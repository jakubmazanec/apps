import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Config} from '../utilities/Config.js';
import {type Focusable} from './Focusable.js';

export type ModalConfig = Config<{
  fadeDuration: number | undefined;
  initialFocus: Focusable | undefined;
  scheduler: Scheduler | undefined;
}>;
