import {type Disposables} from '../utilities/Disposables.js';
import {type AudioBus} from './AudioBus.js';

const VOLUME_RAMP_SECONDS = 0.015;

/**
 * A Web Audio wrapper. It plays raw AudioBuffers through a four-node gain graph.
 */
export class AudioMixer {
  /** Audio context. */
  readonly context: AudioContext;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<never, 'locked'> = {locked: null};

  /** TBD */
  readonly #gains: Record<AudioBus, GainNode>;

  /** TBD */
  #music: AudioBufferSourceNode | null = null;

  constructor() {
    let context = new AudioContext();
    let master = context.createGain();
    let music = context.createGain();
    let sfx = context.createGain();
    let ui = context.createGain();

    master.connect(context.destination);
    music.connect(master);
    sfx.connect(master);
    ui.connect(master);

    this.context = context;
    this.#gains = {master, music, sfx, ui};
  }

  /** Destroys the instance. */
  destroy(): void {
    this.stopMusic();
    this.#disposables.locked?.dispose();
    this.#disposables.locked = null;
    void this.context.close();
  }

  /** TBD */
  play(buffer: AudioBuffer, {bus}: {bus: 'sfx' | 'ui'}): void {
    let source = this.context.createBufferSource();

    source.buffer = buffer;
    source.connect(this.#gains[bus]);
    source.addEventListener('ended', () => {
      source.disconnect();
    });
    source.start();
  }

  /** TBD */
  playMusic(buffer: AudioBuffer, options?: {loop?: boolean}): void {
    this.stopMusic();

    let source = this.context.createBufferSource();

    source.buffer = buffer;
    source.loop = options?.loop ?? true;
    source.connect(this.#gains.music);
    source.start();
    this.#music = source;
  }

  /** TBD */
  setVolume(bus: AudioBus, level: number): void {
    let clamped = Math.min(1, Math.max(0, level));
    let {currentTime} = this.context;
    let {gain} = this.#gains[bus];
    let current = gain.value;

    gain.cancelScheduledValues(currentTime);
    gain.setValueAtTime(current, currentTime);
    gain.linearRampToValueAtTime(clamped, currentTime + VOLUME_RAMP_SECONDS);
  }

  /** TBD */
  stopMusic(): void {
    if (this.#music !== null) {
      this.#music.stop();
      this.#music.disconnect();
      this.#music = null;
    }
  }

  /** TBD */
  unlock(): void {
    if (this.#disposables.locked !== null) {
      return;
    }

    this.#disposables.locked = new DisposableStack();

    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleGesture = () => {
      void this.context.resume();
      this.#disposables.locked?.dispose();

      this.#disposables.locked = null;
    };

    globalThis.addEventListener('pointerdown', handleGesture);
    globalThis.addEventListener('keydown', handleGesture);
    this.#disposables.locked.defer(() => {
      globalThis.removeEventListener('pointerdown', handleGesture);
      globalThis.removeEventListener('keydown', handleGesture);
    });
  }
}
