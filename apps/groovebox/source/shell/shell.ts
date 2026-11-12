/* eslint-disable unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin */
import wasmUrl from 'groovebox-core/build/groovebox-core.wasm?url';

import {bootCore, type Core} from './boot.js';
import {keyToInput} from './keyboard.js';
import {expandFrame, fitScreen} from './present.js';
import {type WorkerReply, type WorkerRequest} from './protocol.js';
import {startAudio} from './startAudio.js';

export async function runShell({
  canvas,
  controls,
  status,
  note,
  save,
}: {
  canvas: HTMLCanvasElement;
  controls: HTMLElement;
  status: HTMLElement;
  note: HTMLElement;
  save: HTMLButtonElement;
}): Promise<{core: Core; start: () => Promise<AudioContext>; stop: () => void}> {
  let core = await bootCore(wasmUrl);
  let {memory, worker, addresses} = core;
  let position = new BigUint64Array(memory.buffer, addresses.position, 1);
  let front = new Uint32Array(memory.buffer, addresses.front, 1);
  let palette = new Uint8Array(memory.buffer, addresses.palette, 256 * 3);
  let pixels = new Uint8Array(480 * 272);
  let image = new ImageData(480, 272);
  let drawing = canvas.getContext('2d') as CanvasRenderingContext2D;
  let listening = new AbortController();
  let audio: Promise<AudioContext> | undefined;
  let context: AudioContext | undefined;
  let frame = 0;

  // eslint-disable-next-line @typescript-eslint/promise-function-async -- every call returns the one promise
  let start = () => {
    audio ??= startAudio(core).then((started) => {
      let showRunning = () => {
        if (started.state === 'running') {
          status.textContent = '';
        }
      };

      started.addEventListener('statechange', showRunning);
      showRunning();
      context = started;

      return started;
    });

    return audio;
  };

  let startOnGesture = () => {
    if (navigator.userActivation.isActive) {
      void start();
    }
  };

  let sendKey = (event: KeyboardEvent) => {
    let input = keyToInput(event);

    if (context && input) {
      worker.postMessage({
        type: 'input',
        stamped: {sample: Atomics.load(position, 0), input},
      } satisfies WorkerRequest);
    }
  };

  let fit = () => {
    let {cssWidth, cssHeight, exact} = fitScreen(
      {
        width:
          window.innerWidth -
          controls.getBoundingClientRect().width -
          Number.parseFloat(getComputedStyle(controls.parentElement as HTMLElement).columnGap),
        height: window.innerHeight,
      },
      window.devicePixelRatio,
    );

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    note.textContent = exact ? '' : 'This display scale cannot show the screen pixel-exactly.';
  };

  // The window sends no resize when only the display scale changes
  let refitOnDisplayScaleChange = () => {
    globalThis.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        fit();
        refitOnDisplayScaleChange();
      },
      {once: true, signal: listening.signal},
    );
  };

  let present = () => {
    pixels.set(
      new Uint8Array(
        memory.buffer,
        Atomics.load(front, 0) === 0 ? addresses.screens[0] : addresses.screens[1],
        pixels.length,
      ),
    );
    expandFrame(pixels, palette, image.data);
    drawing.putImageData(image, 0, 0);
    frame = requestAnimationFrame(present);
  };

  status.textContent = 'Click to start';
  canvas.style.imageRendering = 'pixelated';
  fit();
  refitOnDisplayScaleChange();
  frame = requestAnimationFrame(present);

  globalThis.addEventListener('resize', fit, {signal: listening.signal});
  globalThis.addEventListener('pointerdown', startOnGesture, {signal: listening.signal});
  globalThis.addEventListener('pointerup', startOnGesture, {signal: listening.signal});
  globalThis.addEventListener('keydown', startOnGesture, {signal: listening.signal});
  globalThis.addEventListener('keydown', sendKey, {signal: listening.signal});
  globalThis.addEventListener('keyup', sendKey, {signal: listening.signal});
  save.addEventListener(
    'click',
    () => {
      void start().then(async (started) => {
        await started.suspend();

        let text = await new Promise<string>((resolve) => {
          worker.addEventListener(
            'message',
            ({data}: MessageEvent<Extract<WorkerReply, {type: 'session'}>>) => {
              resolve(data.text);
            },
            {once: true},
          );
          worker.postMessage({type: 'save'} satisfies WorkerRequest);
        });
        let link = document.createElement('a');

        link.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
        link.download = 'session.scene';
        link.click();
        URL.revokeObjectURL(link.href);
        await started.resume();
      });
    },
    {signal: listening.signal},
  );

  return {
    core,
    start,
    stop: () => {
      cancelAnimationFrame(frame);
      listening.abort();
      worker.terminate();
      void audio?.then(async (started) => started.close());
    },
  };
}
