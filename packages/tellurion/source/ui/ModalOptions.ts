import type * as pixi from 'pixi.js';

import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Focusable} from './Focusable.js';
import {type UiChildComponent} from './UiChildComponent.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type ModalOptions = UiComponentThemeOptions<'modal'> & {
  children?: UiChildComponent[] | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
  initialFocus?: Focusable | undefined;
  destroyOnClose?: boolean | undefined;
  onClosing?: (() => void) | undefined;
  onClosed?: (() => void) | undefined;
} & (
    {fadeDuration: number; scheduler: Scheduler} | {fadeDuration?: undefined; scheduler?: undefined}
  );
