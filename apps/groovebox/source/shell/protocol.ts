const FUNCTION_BUTTONS = [
  't1',
  't2',
  't3',
  't4',
  'pads-keys',
  'roll',
  'menu',
  'page',
  'copy',
  'shift',
  'rec',
  'play',
  'stop',
  'tempo',
  'up',
  'down',
  'left',
  'right',
  'ok',
  'cancel',
  'minus',
  'plus',
] as const;

export const STEP_BUTTONS = [
  'step-1',
  'step-2',
  'step-3',
  'step-4',
  'step-5',
  'step-6',
  'step-7',
  'step-8',
  'step-9',
  'step-10',
  'step-11',
  'step-12',
  'step-13',
  'step-14',
  'step-15',
  'step-16',
] as const;

const PUSH_BUTTONS = ['push-1', 'push-2', 'push-3', 'push-4'] as const;

// The scene names of the buttons. The function buttons have the codes 0 to 21 in this order
export type ButtonName =
  (typeof FUNCTION_BUTTONS)[number] | (typeof PUSH_BUTTONS)[number] | (typeof STEP_BUTTONS)[number];

const FIRST_STEP_CODE = 32;
const FIRST_PUSH_CODE = 48;
const VOLUME = 4;

// The codes of the "Buttons" table, which the core's `Button::code` shares
export const BUTTONS = Object.fromEntries([
  ...FUNCTION_BUTTONS.map((name, index) => [name, index] as const),
  ...STEP_BUTTONS.map((name, index) => [name, FIRST_STEP_CODE + index] as const),
  ...PUSH_BUTTONS.map((name, index) => [name, FIRST_PUSH_CODE + index] as const),
]) as Record<ButtonName, number>;

// The scene name of an encoder: the four encoders count from 1 and the volume is the fifth
export function encoderName(encoder: number): 'volume' | `encoder-${number}` {
  return encoder === VOLUME ? 'volume' : `encoder-${encoder + 1}`;
}

// One member per kind of the "Inputs" table, named as its scene line is. Pads 0–11, encoders 0–4
// (4 is the volume), clicks and velocities in the ranges that the core takes (`clicks` from -127
// to 127 and not 0, `files` from 1 to 65,535)
export type ShellInput =
  | {kind: 'channel-pressure'; pressure: number}
  | {kind: 'dropped'; files: number}
  | {kind: 'note-off'; note: number}
  | {kind: 'note-on'; note: number; velocity: number}
  | {kind: 'note-pressure'; note: number; pressure: number}
  | {kind: 'pad-hit'; pad: number; velocity: number}
  | {kind: 'pad-pressure'; pad: number; pressure: number}
  | {kind: 'pad-release'; pad: number}
  | {kind: 'press'; button: ButtonName}
  | {kind: 'release'; button: ButtonName}
  | {kind: 'turn'; encoder: number; clicks: number};

export type StampedInput = {sample: bigint; input: ShellInput};

/* eslint-disable default-case, @typescript-eslint/consistent-return -- the switch covers every kind, which TypeScript checks */
// The kind, `a` and `b` of `control_queue_input`, one row of the "Inputs" table per kind, like the
// core's `Input::to_wire`. A negative `clicks` goes through as it is: the core's `u32` parameter
// takes a number modulo 2^32, so it arrives as the bits of an `i32`
export function coreArguments(input: ShellInput): [kind: number, a: number, b: number] {
  switch (input.kind) {
    case 'channel-pressure': {
      return [9, input.pressure, 0];
    }

    case 'dropped': {
      return [10, input.files, 0];
    }

    case 'note-off': {
      return [7, input.note, 0];
    }

    case 'note-on': {
      return [6, input.note, input.velocity];
    }

    case 'note-pressure': {
      return [8, input.note, input.pressure];
    }

    case 'pad-hit': {
      return [0, input.pad, input.velocity];
    }

    case 'pad-pressure': {
      return [2, input.pad, input.pressure];
    }

    case 'pad-release': {
      return [1, input.pad, 0];
    }

    case 'press': {
      return [3, BUTTONS[input.button], 0];
    }

    case 'release': {
      return [4, BUTTONS[input.button], 0];
    }

    case 'turn': {
      return [5, input.encoder, input.clicks];
    }
  }
}
/* eslint-enable default-case, @typescript-eslint/consistent-return */

export type CoreAddresses = {
  stackTop: number;
  position: number;
  wake: number;
  front: number;
  screens: [number, number];
  palette: number;
  lights: number;
};

export type WorkerRequest =
  | {type: 'drop'; files: Array<{path: string; file: File}>}
  | {type: 'input'; stamped: StampedInput}
  | {type: 'save'}
  | {type: 'start'; module: WebAssembly.Module; memory: WebAssembly.Memory};

export type WorkerReply =
  {type: 'ready'; addresses: CoreAddresses} | {type: 'session'; text: string};
