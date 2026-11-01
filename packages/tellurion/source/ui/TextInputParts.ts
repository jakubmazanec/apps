import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Parts} from '../utilities/Parts.js';
import {type Text} from './Text.js';
import {type TextInputState} from './TextInputState.js';

export type TextInputParts = Parts<{
  backgrounds: Record<TextInputState, pixi.Container>;
  caret: pixi.Sprite;
  input: HTMLInputElement;
  placeholderText: Text;
  row: LayoutContainer;
  valueText: Text;
}>;
