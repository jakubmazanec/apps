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
import {carryOut, fileAt, readRequest, STATUSES, type StorageReply, writeFile} from './storage.js';

/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/max-params -- the core's exports */
type ControlExports = {
  control_queue_input: (sample: bigint, kind: number, a: number, b: number) => number;
  control_step: (until: bigint) => number;
  control_applied_number: (index: number) => number;
  control_applied_sample: (index: number) => bigint;
  control_take_request: () => number;
  control_queue_reply: (
    sample: bigint,
    requestNumber: number,
    status: number,
    value: bigint,
  ) => number;
  request_pointer: () => number;
  io_pointer: () => number;
  sample_ram_pointer: () => number;
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
      let root = await navigator.storage.getDirectory();
      let storageAddresses = {io: core.io_pointer(), sampleRam: core.sample_ram_pointer()};
      // The storage's work, one piece at a time in the order it came: each request of the core
      // and each drop. The drift harness carries out a request right after the step that sent it,
      // so a drop must not write while a request is carried out
      let storage = Promise.resolve();
      // Puts `work` after the storage's work so far. A throw is logged and the work after it still
      // goes ahead, as a request skipped would leave the core waiting forever
      let queueStorageWork = (work: () => Promise<void>) => {
        let before = storage;

        storage = (async () => {
          await before;

          try {
            await work();
          } catch (error) {
            // eslint-disable-next-line no-console -- a worker has nowhere else to report a throw
            console.error(error);
          }
        })();
      };
      // The first request is the start-up's `Delete tmp`: a drop waits until it is carried out, or
      // it would be deleted
      let emptied = Promise.withResolvers<undefined>();
      // The files the session holds: those it copied the first time a request read them and those
      // it wrote
      let held = new Set<string>();
      // The files dropped since the start, which number the folders of `tmp/` (S26)
      let dropped = 0;

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
          } else if (data.type === 'drop') {
            // Each file goes into the next numbered folder of `tmp/`, and one that cannot be
            // copied is left out as if it had not been dropped. Then one input tells the core how
            // many came (answer 11)
            void (async () => {
              await emptied.promise;
              queueStorageWork(async () => {
                let before = dropped;

                for (let {path, file} of data.files) {
                  let copy = `tmp/${dropped + 1}/${path}`;

                  try {
                    let bytes = await file.bytes();

                    await writeFile(root, copy, new Blob([bytes]));
                    dropped += 1;
                    held.add(copy);
                    log.drop(Atomics.load(position, 0), path, bytes);
                  } catch {
                    // Left out
                  }
                }

                if (dropped > before) {
                  pending.push({
                    sample: Atomics.load(position, 0),
                    input: {kind: 'dropped', files: dropped - before},
                  });
                  drain();
                }
              });
            })();
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

          // The request the step sent is carried out while the loop goes on, and its reply is
          // stamped with the audio position when it is done
          if (core.control_take_request() === 1) {
            let request = readRequest(memory.buffer, core.request_pointer());

            queueStorageWork(async () => {
              // A file the session wrote needs no copy
              if ((request.kind === 'read' || request.kind === 'load') && !held.has(request.path)) {
                held.add(request.path);

                try {
                  log.file(request.path, await (await fileAt(root, request.path)).bytes());
                } catch {
                  // A file that is not there has nothing to copy
                }
              } else if (request.kind === 'begin') {
                held.add(request.path);
              }

              // A carry-out that throws is answered `failed`, and the throw goes on to be logged
              let reply: StorageReply = {status: 'failed', value: 0};

              try {
                reply = await carryOut(request, root, memory.buffer, storageAddresses);
              } finally {
                let sample = Atomics.load(position, 0);

                core.control_queue_reply(
                  sample,
                  request.requestNumber,
                  STATUSES.indexOf(reply.status),
                  BigInt(reply.value),
                );
                log.reply(request.requestNumber, sample, reply);
                emptied.resolve(undefined);
              }
            });
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
