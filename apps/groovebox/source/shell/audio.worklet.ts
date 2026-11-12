type ProcessorOptions = {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  stackTop: number;
};

/* eslint-disable @typescript-eslint/naming-convention -- the core's exports */
type AudioExports = {
  __stack_pointer: WebAssembly.Global<'i32'>;
  wake_pointer: () => number;
  audio_render: (frames: number) => number;
};
/* eslint-enable @typescript-eslint/naming-convention */

// The AudioWorkletGlobalScope's own names, which the DOM types do not declare
declare const AudioWorkletProcessor: new () => object;

declare function registerProcessor(
  name: string,
  processor: new (options: {processorOptions: ProcessorOptions}) => object,
): void;

registerProcessor(
  'groovebox',
  class extends AudioWorkletProcessor {
    readonly #memory: WebAssembly.Memory;
    readonly #core: AudioExports;
    readonly #wake: Int32Array;

    constructor({
      processorOptions: {module, memory, stackTop},
    }: {
      processorOptions: ProcessorOptions;
    }) {
      super();
      this.#memory = memory;
      this.#core = new WebAssembly.Instance(module, {env: {memory}}).exports as AudioExports;
      this.#core.__stack_pointer.value = stackTop;
      this.#wake = new Int32Array(memory.buffer, this.#core.wake_pointer(), 1);
    }

    process(_: unknown, [[left, right]]: [[Float32Array, Float32Array]]) {
      let address = this.#core.audio_render(128);

      left.set(new Float32Array(this.#memory.buffer, address, 128));
      right.set(new Float32Array(this.#memory.buffer, address + 128 * 4, 128));
      Atomics.add(this.#wake, 0, 1);
      Atomics.notify(this.#wake, 0);

      return true;
    }
  },
);
