export type ShellInput =
  {kind: 'pad-hit'; pad: number; velocity: number} | {kind: 'pad-release'; pad: number};

export type StampedInput = {sample: bigint; input: ShellInput};

export type CoreAddresses = {
  stackTop: number;
  position: number;
  wake: number;
  front: number;
  screens: [number, number];
  palette: number;
};

export type WorkerRequest =
  | {type: 'input'; stamped: StampedInput}
  | {type: 'save'}
  | {type: 'start'; module: WebAssembly.Module; memory: WebAssembly.Memory};

export type WorkerReply =
  {type: 'ready'; addresses: CoreAddresses} | {type: 'session'; text: string};
