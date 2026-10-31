import {type FederatedPointerEvent} from 'pixi.js';

import {type Runtime} from '../utilities/Runtime.js';

export type TextInputRuntime = Runtime<{
  blinkTick: number;
  caretOffset: number | undefined;
  caretWidth: number | undefined;
  pointerDownEvent: FederatedPointerEvent['nativeEvent'] | undefined;
  isEditing: boolean;
  value: string;
}>;
