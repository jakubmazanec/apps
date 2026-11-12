/* eslint-disable unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin */
import ControlWorker from './control.worker.ts?worker';
import {readMemoryLimits} from './memoryLimits.js';
import {type CoreAddresses, type WorkerReply, type WorkerRequest} from './protocol.js';

export type Core = {
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
  worker: Worker;
  addresses: CoreAddresses;
};

export async function bootCore(wasmUrl: string): Promise<Core> {
  let bytes = await (await fetch(wasmUrl)).bytes();
  let limits = readMemoryLimits(bytes);
  let module = await WebAssembly.compile(bytes);
  let memory = new WebAssembly.Memory({...limits, shared: true});
  let worker = new ControlWorker();

  let addresses = await new Promise<CoreAddresses>((resolve) => {
    worker.addEventListener(
      'message',
      ({data}: MessageEvent<Extract<WorkerReply, {type: 'ready'}>>) => {
        resolve(data.addresses);
      },
      {once: true},
    );
    worker.postMessage({type: 'start', module, memory} satisfies WorkerRequest);
  });

  return {module, memory, worker, addresses};
}
