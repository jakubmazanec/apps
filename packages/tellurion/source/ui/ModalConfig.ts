import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Config} from '../utilities/Config.js';

export type ModalConfig = Config<{
  fadeDuration: number | undefined;
  isReusable: boolean;
  scheduler: Scheduler | undefined;
}>;
