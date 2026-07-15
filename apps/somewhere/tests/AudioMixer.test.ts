import {afterEach, describe, expect, test} from 'vitest';

import {AudioMixer} from '../source/engine/audio/AudioMixer.js';

// Minimal Web Audio fakes: record graph construction, connections, node
// lifecycle, and context.resume/close. The mixer touches nothing else.
class FakeGain {
  gain = {value: 1};
  connectedTo: unknown = null;
  connect(node: unknown) {
    this.connectedTo = node;
  }
}

class FakeBufferSource {
  buffer: unknown = null;
  loop = false;
  started = false;
  stopped = false;
  disconnected = false;
  connectedTo: unknown = null;
  readonly #ended: Array<() => void> = [];
  connect(node: unknown) {
    this.connectedTo = node;
  }

  addEventListener(type: string, listener: () => void) {
    if (type === 'ended') {
      this.#ended.push(listener);
    }
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeAudioContext {
  destination = {name: 'destination'};
  state = 'suspended';
  resumeCount = 0;
  closed = false;
  gains: FakeGain[] = [];
  sources: FakeBufferSource[] = [];
  createGain() {
    let gain = new FakeGain();
    this.gains.push(gain);

    return gain;
  }

  createBufferSource() {
    let source = new FakeBufferSource();
    this.sources.push(source);

    return source;
  }

  async resume() {
    this.resumeCount += 1;
    this.state = 'running';
  }

  async close() {
    this.closed = true;
  }
}

// gains[0] = master, gains[1] = music, gains[2] = sfx, gains[3] = ui
// (creation order in #buildGraph).
function createMixer() {
  let context = new FakeAudioContext();
  let created = 0;
  let mixer = new AudioMixer({
    createContext: () => {
      created += 1;

      return context as unknown as AudioContext;
    },
  });

  return {mixer, context, createdCount: () => created};
}

describe('AudioMixer', () => {
  afterEach(() => {
    // Nothing global to restore; unlock listeners are removed by the tests
    // that arm them.
  });

  test('does not create the context until first use', () => {
    let {mixer, createdCount} = createMixer();

    expect(createdCount()).toBe(0);

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- accessing the getter is the trigger under test
    mixer.context;

    expect(createdCount()).toBe(1);

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- idempotency check
    mixer.context;

    expect(createdCount()).toBe(1);
  });

  test('wires the bus graph: each bus into master, master into destination', () => {
    let {mixer, context} = createMixer();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph
    mixer.context;

    expect(context.gains).toHaveLength(4);
    expect(context.gains[0]!.connectedTo).toBe(context.destination); // master → destination
    expect(context.gains[1]!.connectedTo).toBe(context.gains[0]); // music → master
    expect(context.gains[2]!.connectedTo).toBe(context.gains[0]); // sfx → master
    expect(context.gains[3]!.connectedTo).toBe(context.gains[0]); // ui → master
  });

  test('play routes an sfx one-shot to the sfx bus and starts it', () => {
    let {mixer, context} = createMixer();
    let buffer = {} as unknown as AudioBuffer;

    mixer.play(buffer, {bus: 'sfx'});

    let source = context.sources.at(-1)!;

    expect(source.buffer).toBe(buffer);
    expect(source.connectedTo).toBe(context.gains[2]); // sfx bus
    expect(source.started).toBeTruthy();
  });

  test('play routes a ui one-shot to the ui bus', () => {
    let {mixer, context} = createMixer();

    mixer.play({} as AudioBuffer, {bus: 'ui'});

    expect(context.sources.at(-1)!.connectedTo).toBe(context.gains[3]); // ui bus
  });

  test('playMusic loops by default, on the music bus, replacing the prior track', () => {
    let {mixer, context} = createMixer();

    mixer.playMusic({} as AudioBuffer);

    let first = context.sources.at(-1)!;

    expect(first.loop).toBeTruthy();
    expect(first.connectedTo).toBe(context.gains[1]); // music bus
    expect(first.started).toBeTruthy();

    mixer.playMusic({} as AudioBuffer);

    let second = context.sources.at(-1)!;

    expect(first.stopped).toBeTruthy(); // previous voice replaced
    expect(second.started).toBeTruthy();
  });

  test('stopMusic stops the current voice', () => {
    let {mixer, context} = createMixer();

    mixer.playMusic({} as AudioBuffer);

    let source = context.sources.at(-1)!;

    mixer.stopMusic();

    expect(source.stopped).toBeTruthy();
  });

  test('setMuted sets the bus gain to 0 and unmute restores it to 1', () => {
    let {mixer, context} = createMixer();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph
    mixer.context;
    mixer.setMuted('master', true);

    expect(context.gains[0]!.gain.value).toBe(0);

    mixer.setMuted('master', false);

    expect(context.gains[0]!.gain.value).toBe(1);
  });

  test('a setMuted issued before first use applies once the graph is built', () => {
    let {mixer, context} = createMixer();

    mixer.setMuted('master', true);

    expect(context.gains).toHaveLength(0); // still no graph

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph now
    mixer.context;

    expect(context.gains[0]!.gain.value).toBe(0);
  });

  test('unlock resumes once on the first gesture and removes its listeners', () => {
    let {mixer, context} = createMixer();

    mixer.unlock();
    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(context.resumeCount).toBe(1);

    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(context.resumeCount).toBe(1); // listeners were removed
  });
});
