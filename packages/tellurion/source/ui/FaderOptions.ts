import type * as pixi from 'pixi.js';

import {type Scheduler} from '../scheduler/Scheduler.js';

export type FaderOptions = {
  duration: number;
  scheduler: Scheduler;
  view: pixi.Container;
};
