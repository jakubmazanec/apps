/* eslint-disable unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin */
import {drainPending} from './pending.js';
import {
  type CoreAddresses,
  coreArguments,
  type StampedInput,
  type WorkerReply,
  type WorkerRequest,
} from './protocol.js';
import {SessionLog} from './session.js';

/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/max-params -- the core's exports */
type ControlExports = {
  control_queue_input: (sample: bigint, kind: number, a: number, b: number) => number;
  control_step: (until: bigint) => number;
  control_applied_number: (index: number) => number;
  control_applied_sample: (index: number) => bigint;
  screen_pointer: (index: number) => number;
  front_pointer: () => number;
  palette_pointer: () => number;
  lights_pointer: () => number;
  position_pointer: () => number;
  wake_pointer: () => number;
  audio_stack_top: () => number;
  audio_position: () => bigint;
  audio_fingerprint: () => bigint;
};
/* eslint-enable @typescript-eslint/naming-convention, @typescript-eslint/max-params */

globalThis.addEventListener(
  'message',
  ({data: {module, memory}}: MessageEvent<Extract<WorkerRequest, {type: 'start'}>>) => {
    void WebAssembly.instantiate(module, {env: {memory}}).then(async (instance) => {
      let core = instance.exports as ControlExports;
      let pending: StampedInput[] = [];
      let log = new SessionLog();
      let addresses: CoreAddresses = {
        stackTop: core.audio_stack_top(),
        position: core.position_pointer(),
        wake: core.wake_pointer(),
        front: core.front_pointer(),
        screens: [core.screen_pointer(0), core.screen_pointer(1)],
        palette: core.palette_pointer(),
        lights: core.lights_pointer(),
      };
      let wake = new Int32Array(memory.buffer, addresses.wake, 1);
      let position = new BigUint64Array(memory.buffer, addresses.position, 1);
      let stepped = 0n;

      let drain = () => {
        for (let stamped of drainPending(pending, ({sample, input}) => {
          let returned = core.control_queue_input(sample, ...coreArguments(input));

          // The core returns 1 when it queued the input, 0 when its queue is full and 2 when it
          // does not know the input
          if (returned === 1) {
            return 'queued';
          }

          return returned === 0 ? 'full' : 'dropped';
        })) {
          log.input(stamped);
        }
      };

      globalThis.addEventListener(
        'message',
        ({data}: MessageEvent<Exclude<WorkerRequest, {type: 'start'}>>) => {
          if (data.type === 'input') {
            pending.push(data.stamped);
            drain();
          } else {
            globalThis.postMessage({
              type: 'session',
              text: log.finish(core.audio_position(), core.audio_fingerprint()),
            } satisfies WorkerReply);
          }
        },
      );
      globalThis.postMessage({type: 'ready', addresses} satisfies WorkerReply);

      for (;;) {
        // Loaded before `position`, so that a batch rendered after this load ends the wait at once
        let woken = Atomics.load(wake, 0);
        let until = Atomics.load(position, 0);

        if (until !== stepped) {
          drain();
          log.step(until);

          let applied = core.control_step(until);

          for (let index = 0; index < applied; index++) {
            log.applied(core.control_applied_number(index), core.control_applied_sample(index));
          }

          stepped = until;
        }

        let waiting = Atomics.waitAsync(wake, 0, woken);

        if (waiting.async) {
          await waiting.value;
        }
      }
    });
  },
  {once: true},
);
