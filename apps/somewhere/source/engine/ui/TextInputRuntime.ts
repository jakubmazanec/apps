import {type Runtime} from '../utilities/Runtime.js';

export type TextInputRuntime = Runtime<{
  blinkTick: number;
  caretOffset: number;
  caretWidth: number;
  isEditing: boolean;
  isOwnPointerDown: boolean;
  value: string;
}>;
