import type * as pixi from 'pixi.js';

import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Config} from '../utilities/Config.js';
import {type Focusable} from './Focusable.js';

export type ModalConfig = Config<{
  fadeDuration: number | undefined;
  initialFocus: Focusable | undefined;
  layout: Exclude<pixi.ContainerOptions['layout'], boolean>;
  scheduler: Scheduler | undefined;
  scrimAlpha: number;
}>;
