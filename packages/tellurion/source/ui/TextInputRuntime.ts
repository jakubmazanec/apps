import {type Runtime} from '../utilities/Runtime.js';

export type TextInputRuntime = Runtime<{
  blinkTick: number;
  caretOffset: number | undefined;
  caretWidth: number | undefined;
  isEditing: boolean;
  isOwnPointerDown: boolean;
  value: string;
}>;
