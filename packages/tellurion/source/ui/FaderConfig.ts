import type * as pixi from 'pixi.js';

import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Config} from '../utilities/Config.js';

export type FaderConfig = Config<{
  duration: number;
  scheduler: Scheduler;
  view: pixi.Container;
}>;
