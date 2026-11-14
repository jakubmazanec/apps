/* eslint-disable unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin */
import wasmUrl from 'groovebox-core/build/groovebox-core.wasm?url';

import {bootCore, type Core} from './boot.js';
import {Holders} from './holders.js';
import {keyToInput} from './keyboard.js';
import {dragClicks, isPush, wheelClicks} from './knob.js';
import {decodeLights, loadLights} from './lights.js';
import {createMidiMapper} from './midi.js';
import {buildPanel} from './panel.js';
import {pictureBlob} from './picture.js';
import {expandFrame, fitPanel} from './present.js';
import {
  type ButtonName,
  encoderName,
  type ShellInput,
  type WorkerReply,
  type WorkerRequest,
} from './protocol.js';
import {startAudio} from './startAudio.js';

const VOLUME = 4;

// The most clicks the core takes in one turn input, either way
const MOST_CLICKS = 127;

// The encoder of each knob on the panel: `encoder-k` is encoder k − 1 and the volume is encoder 4
const ENCODERS: ReadonlyMap<string, number> = new Map(
  Array.from({length: VOLUME + 1}, (_, encoder) => [encoderName(encoder), encoder]),
);

// What a pointer that went down on the panel does: it holds a key or a pad, or it turns a knob. A
// knob keeps the press point, the clicks sent and the farthest the pointer has been from the point
type Pointer =
  {control: string} | {encoder: number; x: number; y: number; clicks: number; farthest: number};

// The name of the control of the panel under the event's target, if there is one
function controlAt(event: Event) {
  return (event.target as Element).closest<HTMLElement>('[data-control]')?.dataset.control;
}

// The input that lets go of a key or a pad of the panel. Every name but a pad's is a button's
function releaseOf(control: string): ShellInput {
  return control.startsWith('pad-') ?
      {kind: 'pad-release', pad: Number(control.slice('pad-'.length))}
    : {kind: 'release', button: control as ButtonName};
}

function download(blob: Blob, name: string) {
  let link = document.createElement('a');

  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function runShell({
  panel: container,
  row,
  status,
  note,
  saveSession,
  savePicture,
}: {
  panel: HTMLElement;
  row: HTMLElement;
  status: HTMLElement;
  note: HTMLElement;
  saveSession: HTMLButtonElement;
  savePicture: HTMLButtonElement;
}): Promise<{core: Core; start: () => Promise<AudioContext>; stop: () => void}> {
  let core = await bootCore(wasmUrl);
  let {memory, worker, addresses} = core;
  let position = new BigUint64Array(memory.buffer, addresses.position, 1);
  let front = new Uint32Array(memory.buffer, addresses.front, 1);
  let palette = new Uint8Array(memory.buffer, addresses.palette, 256 * 3);
  let lightsWords = new Uint32Array(memory.buffer, addresses.lights, 2);
  let pixels = new Uint8Array(480 * 272);
  let image = new ImageData(480, 272);
  let listening = new AbortController();
  let holders = new Holders();
  let pointers = new Map<number, Pointer>();
  let wheelRests = new Map<string, number>();
  let midiAllowed = true;
  let audio: Promise<AudioContext> | undefined;
  let context: AudioContext | undefined;
  let frame = 0;

  // The line says "Click to start" until the audio runs, and then whether MIDI was refused
  let showStatus = () => {
    if (context?.state === 'running') {
      status.textContent = midiAllowed ? '' : 'MIDI not allowed';
    }
  };

  // A turn of more clicks than the core takes goes as several turns at one sample
  let send = (input: ShellInput, sample = Atomics.load(position, 0)) => {
    if (input.kind === 'turn' && Math.abs(input.clicks) > MOST_CLICKS) {
      let clicks = Math.sign(input.clicks) * MOST_CLICKS;

      send({...input, clicks}, sample);
      send({...input, clicks: input.clicks - clicks}, sample);
    } else {
      worker.postMessage({type: 'input', stamped: {sample, input}} satisfies WorkerRequest);
    }
  };

  // Every input, and every one plugged in later, gets its own mapper, as an absolute knob counts
  // from the last value of its own device
  let listenToMidi = async () => {
    let access: MIDIAccess;

    try {
      access = await navigator.requestMIDIAccess();
    } catch {
      // Refused, or a browser without Web MIDI
      midiAllowed = false;
      showStatus();

      return;
    }

    let heard = new WeakSet<MIDIInput>();

    let listen = () => {
      for (let input of access.inputs.values()) {
        if (!heard.has(input)) {
          let toInputs = createMidiMapper();

          heard.add(input);
          input.addEventListener(
            'midimessage',
            ({data}) => {
              if (context && data) {
                for (let mapped of toInputs(data)) {
                  send(mapped);
                }
              }
            },
            {signal: listening.signal},
          );
        }
      }
    };

    listen();
    access.addEventListener('statechange', listen, {signal: listening.signal});
  };

  // MIDI is asked for at the same gesture that starts the audio (answer 11)
  // eslint-disable-next-line @typescript-eslint/promise-function-async -- every call returns the one promise
  let start = () => {
    if (!audio) {
      void listenToMidi();
      audio = startAudio(core).then((started) => {
        context = started;
        started.addEventListener('statechange', showStatus);
        showStatus();

        return started;
      });
    }

    return audio;
  };

  let startOnGesture = () => {
    if (navigator.userActivation.isActive) {
      void start();
    }
  };

  // A key or a pointer takes a key or a pad of the panel. The core sees one physical control, so
  // it gets the press only from the first to take it (S9)
  let hold = (control: string, holder: string) => {
    if (holders.press(control, holder)) {
      send(
        control.startsWith('pad-') ?
          {kind: 'pad-hit', pad: Number(control.slice('pad-'.length)), velocity: 127}
        : {kind: 'press', button: control as ButtonName},
      );
    }
  };

  // ... and the release only from the last to let go
  let letGo = (control: string, holder: string) => {
    if (holders.release(control, holder)) {
      send(releaseOf(control));
    }
  };

  // On blur or a hidden page every key and pointer lets go, and a drag ends without a push. MIDI
  // notes stay (answer 16)
  let letGoOfAll = () => {
    for (let control of holders.releaseAll()) {
      send(releaseOf(control));
    }

    pointers.clear();
  };

  let sendKey = (event: KeyboardEvent) => {
    let {type, code, altKey, ctrlKey, metaKey, repeat} = event;
    // A repeat sends nothing, but a mapped key loses its browser default on every event, so that
    // a held arrow does not scroll the page
    let input = keyToInput({type, code, altKey, ctrlKey, metaKey, repeat: false});

    if (!input) {
      return;
    }

    event.preventDefault();

    if (!context || repeat) {
      return;
    }

    if (input.kind === 'press') {
      hold(input.button, `key:${code}`);
    } else if (input.kind === 'release') {
      letGo(input.button, `key:${code}`);
    } else if (input.kind === 'pad-hit') {
      hold(`pad-${input.pad}`, `key:${code}`);
    } else if (input.kind === 'pad-release') {
      letGo(`pad-${input.pad}`, `key:${code}`);
    }
  };

  // Each pointer is its own holder, so every finger holds or turns its own control (answer 15).
  // The panel captures the pointer, so a key or a pad is held wherever the pointer goes
  let press = (event: PointerEvent) => {
    let control = controlAt(event);

    if (!context || control === undefined || event.button !== 0) {
      return;
    }

    let encoder = ENCODERS.get(control);

    container.setPointerCapture(event.pointerId);

    if (encoder === undefined) {
      pointers.set(event.pointerId, {control});
      hold(control, `pointer:${event.pointerId}`);
    } else {
      pointers.set(event.pointerId, {
        encoder,
        x: event.clientX,
        y: event.clientY,
        clicks: 0,
        farthest: 0,
      });
    }
  };

  // A drag on a knob sends the clicks it has made since the last move (answer 13)
  let drag = (event: PointerEvent) => {
    let pointer = pointers.get(event.pointerId);

    if (pointer && 'encoder' in pointer) {
      let clicks = dragClicks(pointer.y, event.clientY);

      pointer.farthest = Math.max(
        pointer.farthest,
        Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y),
      );

      if (clicks !== pointer.clicks) {
        send({kind: 'turn', encoder: pointer.encoder, clicks: clicks - pointer.clicks});
        pointer.clicks = clicks;
      }
    }
  };

  // A pointer comes up or is cancelled. A knob that came up before it moved 4 px or turned is
  // pushed: a press and a release at the release's sample. The volume knob has no push
  let end = (event: PointerEvent) => {
    let pointer = pointers.get(event.pointerId);

    pointers.delete(event.pointerId);

    if (pointer && !('encoder' in pointer)) {
      letGo(pointer.control, `pointer:${event.pointerId}`);
    } else if (
      pointer &&
      event.type === 'pointerup' &&
      pointer.encoder !== VOLUME &&
      isPush(pointer.farthest, pointer.clicks)
    ) {
      let sample = Atomics.load(position, 0);
      let button = `push-${pointer.encoder + 1}` as ButtonName;

      send({kind: 'press', button}, sample);
      send({kind: 'release', button}, sample);
    }
  };

  // The wheel on a knob turns it and does not scroll the page
  let wheel = (event: WheelEvent) => {
    let control = controlAt(event);
    let encoder = control === undefined ? undefined : ENCODERS.get(control);

    if (control === undefined || encoder === undefined) {
      return;
    }

    event.preventDefault();

    if (context) {
      let {clicks, rest} = wheelClicks(wheelRests.get(control) ?? 0, event);

      wheelRests.set(control, rest);

      if (clicks !== 0) {
        send({kind: 'turn', encoder, clicks});
      }
    }
  };

  // The panel at the largest whole zoom that fits the window above the row
  let fitted = () => {
    let {zoom, exact} = fitPanel(
      {width: window.innerWidth, height: window.innerHeight - row.getBoundingClientRect().height},
      window.devicePixelRatio,
    );

    note.textContent = exact ? '' : 'This display scale cannot show the screen pixel-exactly.';

    return buildPanel(container, zoom, window.devicePixelRatio);
  };

  status.textContent = 'Click to start';

  let panel = fitted();

  let fit = () => {
    panel.dispose();
    panel = fitted();
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

  // Each frame shows the core's front buffer and its lights
  let present = () => {
    pixels.set(
      new Uint8Array(
        memory.buffer,
        Atomics.load(front, 0) === 0 ? addresses.screens[0] : addresses.screens[1],
        pixels.length,
      ),
    );
    expandFrame(pixels, palette, image.data);
    (panel.canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(image, 0, 0);

    let {pads, steps, tracks, padsKeys, roll, rec, play, tempo} = decodeLights(
      loadLights(lightsWords),
    );

    for (let [control, lit] of [
      ...pads.map((on, pad): [string, boolean] => [`pad-${pad}`, on]),
      ...steps.map((on, step): [string, boolean] => [`step-${step + 1}`, on]),
      ...tracks.map((on, track): [string, boolean] => [`t${track + 1}`, on]),
      ['pads-keys', padsKeys],
      ['roll', roll],
      ['rec', rec],
      ['play', play],
      ['tempo', tempo],
    ] as const) {
      panel.lights.get(control)?.toggleAttribute('data-lit', lit);
    }

    frame = requestAnimationFrame(present);
  };

  refitOnDisplayScaleChange();
  frame = requestAnimationFrame(present);

  globalThis.addEventListener('resize', fit, {signal: listening.signal});
  globalThis.addEventListener('pointerdown', startOnGesture, {signal: listening.signal});
  globalThis.addEventListener('pointerup', startOnGesture, {signal: listening.signal});
  globalThis.addEventListener('keydown', startOnGesture, {signal: listening.signal});
  globalThis.addEventListener('keydown', sendKey, {signal: listening.signal});
  globalThis.addEventListener('keyup', sendKey, {signal: listening.signal});
  globalThis.addEventListener('blur', letGoOfAll, {signal: listening.signal});
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') {
        letGoOfAll();
      }
    },
    {signal: listening.signal},
  );
  container.addEventListener('pointerdown', press, {signal: listening.signal});
  container.addEventListener('pointermove', drag, {signal: listening.signal});
  container.addEventListener(
    'pointerup',
    (event) => {
      drag(event);
      end(event);
    },
    {signal: listening.signal},
  );
  container.addEventListener('pointercancel', end, {signal: listening.signal});
  container.addEventListener('wheel', wheel, {passive: false, signal: listening.signal});
  saveSession.addEventListener(
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

        download(new Blob([text], {type: 'text/plain'}), 'session.scene');
        await started.resume();
      });
    },
    {signal: listening.signal},
  );
  // The shown frame, named by the audio position when it is saved (answer 21)
  savePicture.addEventListener(
    'click',
    () => {
      let name = `screen-${Atomics.load(position, 0)}.png`;

      void pictureBlob(new Uint8Array(pixels), new Uint8Array(palette)).then((blob) => {
        download(blob, name);
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
      panel.dispose();
      worker.terminate();
      void audio?.then(async (started) => started.close());
    },
  };
}
