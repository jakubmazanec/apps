import type * as pixi from 'pixi.js';

import {type Scheduler} from '../scheduler/Scheduler.js';
import {type ChildUiComponent} from './ChildUiComponent.js';
import {type FocusableUiComponent} from './FocusableUiComponent.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type ModalOptions = UiComponentThemeOptions<'modal'> & {
  children?: ChildUiComponent[] | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
  initialFocus?: FocusableUiComponent | undefined;
  destroyOnClose?: boolean | undefined;
  onClosing?: (() => void) | undefined;
  onClosed?: (() => void) | undefined;
} & (
    {fadeDuration: number; scheduler: Scheduler} | {fadeDuration?: undefined; scheduler?: undefined}
  );
