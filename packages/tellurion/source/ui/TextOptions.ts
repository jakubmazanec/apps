import type * as pixi from 'pixi.js';

import {type UiComponentThemeOptions} from './UiTheme.js';

// TODO: support other styling options
export type TextOptions = UiComponentThemeOptions<'text'> & {
  text: string;
  // Which theme.text style applies. Labels are the common case. `label` or `body`
  // replaces that style for this instance.
  role?: 'body' | 'label' | undefined;
  // breakWords/wordWrap/wordWrapWidth are honored by pixi's own bitmap-text layout
  // (getBitmapTextLayout), so they need no engine-side wrapping pass; the dialogue's
  // wrapText exists for a different job (a length-preserving wrap the typewriter can index).
  wrapWidth?: number | undefined;
  anchor?: pixi.PointData | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
