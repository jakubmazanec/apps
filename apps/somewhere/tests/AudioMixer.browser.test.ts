import {afterEach, describe, expect, test, vitest} from 'vitest';

import {AudioMixer} from '../source/engine/audio/AudioMixer.js';

// Minimal Web Audio fakes: record graph construction, connections, node
// lifecycle, and context.resume/close. The mixer touches nothing else.
// The fake has no timeline, so cancelScheduledValues has nothing to clear; it
// exists so the double keeps the shape of the real AudioParam the mixer talks
// to, and so `log` can prove the automation calls are ordered correctly.
function cancelScheduledValuesImpl(this: FakeAudioParam, when: number) {
  this.log.push(`cancelScheduledValues(${when})`);
}

function setValueAtTimeImpl(this: FakeAudioParam, value: number, when: number) {
  this.log.push(`setValueAtTime(${value}, ${when})`);
  this.value = value;
}

function linearRampToValueAtTimeImpl(this: FakeAudioParam, value: number, when: number) {
  this.log.push(`linearRampToValueAtTime(${value}, ${when})`);
  this.value = value;
}

class FakeAudioParam {
  readonly cancelScheduledValues =
    vitest.fn<typeof cancelScheduledValuesImpl>(cancelScheduledValuesImpl);

  readonly linearRampToValueAtTime = vitest.fn<typeof linearRampToValueAtTimeImpl>(
    linearRampToValueAtTimeImpl,
  );

  // Every automation call in order, so a test can assert the sequence rather
  // than just the membership of each call.
  readonly log: string[] = [];
  readonly setValueAtTime = vitest.fn<typeof setValueAtTimeImpl>(setValueAtTimeImpl);
  value = 1;
}

class FakeGain {
  connectedTo: unknown = null;
  gain = new FakeAudioParam();
  connect(node: unknown) {
    this.connectedTo = node;
  }
}

class FakeBufferSource {
  buffer: unknown = null;
  connectedTo: unknown = null;
  disconnected = false;
  loop = false;
  started = false;
  stopped = false;
  readonly #ended: Array<() => void> = [];
  addEventListener(type: string, listener: () => void) {
    if (type === 'ended') {
      this.#ended.push(listener);
    }
  }

  connect(node: unknown) {
    this.connectedTo = node;
  }

  disconnect() {
    this.disconnected = true;
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeAudioContext {
  closed = false;
  currentTime = 0;
  destination = {name: 'destination'};
  gains: FakeGain[] = [];
  resumeCount = 0;
  sources: FakeBufferSource[] = [];
  state = 'suspended';
  async close() {
    this.closed = true;
  }

  createBufferSource() {
    let source = new FakeBufferSource();

    this.sources.push(source);

    return source;
  }

  createGain() {
    let gain = new FakeGain();

    this.gains.push(gain);

    return gain;
  }

  async resume() {
    this.resumeCount += 1;
    this.state = 'running';
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

describe(AudioMixer, () => {
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
    expect(source.started).toBe(true);
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

    expect(first.loop).toBe(true);
    expect(first.connectedTo).toBe(context.gains[1]); // music bus
    expect(first.started).toBe(true);

    mixer.playMusic({} as AudioBuffer);

    let second = context.sources.at(-1)!;

    expect(first.stopped).toBe(true); // previous voice replaced
    expect(second.started).toBe(true);
  });

  test('stopMusic stops the current voice', () => {
    let {mixer, context} = createMixer();

    mixer.playMusic({} as AudioBuffer);

    let source = context.sources.at(-1)!;

    mixer.stopMusic();

    expect(source.stopped).toBe(true);
  });

  test('a setVolume issued before first use applies once the graph is built', () => {
    let {mixer, context} = createMixer();

    mixer.setVolume('master', 0.4);

    expect(context.gains).toHaveLength(0); // still no graph

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph now
    mixer.context;

    expect(context.gains[0]!.gain.value).toBe(0.4);
  });

  test('setVolume clamps out-of-range levels to [0, 1]', () => {
    let {mixer, context} = createMixer();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph
    mixer.context;
    mixer.setVolume('master', 1.5);

    expect(context.gains[0]!.gain.value).toBe(1);

    mixer.setVolume('master', -0.5);

    expect(context.gains[0]!.gain.value).toBe(0);
  });

  test('setVolume ramps the live gain rather than jumping it directly', () => {
    let {mixer, context} = createMixer();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph
    mixer.context;
    mixer.setVolume('sfx', 0.3);

    let {gain} = context.gains[2]!; // sfx bus

    expect(gain.setValueAtTime).toHaveBeenCalledTimes(1);
    // currentTime is 0 on the fake context, so the ramp end pins the ~15 ms
    // window the spec's Global Constraints call for.
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.3, 0.015);
    expect(gain.value).toBe(0.3);
  });

  // A drag issues a setVolume roughly every 16 ms, so the previous ramp's 15 ms
  // endpoint is still in the timeline when the next pair is inserted. AudioParam
  // events run in time order regardless of insertion order, so without the
  // cancel the stale ramp still executes and pulls briefly toward an abandoned
  // target — audible jitter in exactly the case the ramp exists to smooth.
  test('an overlapping setVolume cancels the prior ramp before scheduling its own', () => {
    let {mixer, context} = createMixer();

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- build the graph
    mixer.context;
    mixer.setVolume('sfx', 0.3);
    mixer.setVolume('sfx', 0.6);

    let sfxGain = context.gains.at(2)?.gain; // gains[2] is the sfx bus

    // The whole schedule, in order: each call clears the timeline first, then
    // anchors at the value the param currently holds (0.3 the second time, i.e.
    // where the first ramp left it — not the pre-drag 1), then ramps.
    expect(sfxGain?.log).toEqual([
      'cancelScheduledValues(0)',
      'setValueAtTime(1, 0)',
      'linearRampToValueAtTime(0.3, 0.015)',
      'cancelScheduledValues(0)',
      'setValueAtTime(0.3, 0)',
      'linearRampToValueAtTime(0.6, 0.015)',
    ]);
  });

  test('setVolume before first use records the intent without forcing the graph to build', () => {
    let {mixer, createdCount} = createMixer();

    mixer.setVolume('music', 0.4);

    expect(createdCount()).toBe(0);
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
