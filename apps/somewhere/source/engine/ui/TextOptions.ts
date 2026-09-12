import type * as pixi from 'pixi.js';

import {type UiTheme} from './UiTheme.js';

// TODO: support other styling options
export type TextOptions = Pick<
  pixi.TextStyleOptions,
  // breakWords/wordWrap/wordWrapWidth are honored by pixi's own bitmap-text layout
  // (getBitmapTextLayout), so they need no engine-side wrapping pass; the dialogue's
  // wrapText exists for a different job (a length-preserving wrap the typewriter can index).
  'breakWords' | 'fontFamily' | 'fontSize' | 'wordWrap' | 'wordWrapWidth'
> & {
  text: string;
  theme?: UiTheme | undefined;
  // Which theme.text style applies. Labels are the common case.
  role?: 'body' | 'label' | undefined;
  fill?: pixi.ColorSource;
  anchor?: pixi.PointData | undefined;
  layout?: pixi.ContainerOptions['layout'] | undefined;
};
