import {type AudioBus} from './AudioBus.js';

// A Slider drag fires many setVolume calls per second; ramping over this
// window (rather than a direct gain.value assignment) avoids an audible click
// on each one.
const VOLUME_RAMP_SECONDS = 0.015;

/**
 * A pure Web Audio wrapper with no pixi coupling: it plays raw AudioBuffers
 * through a four-node gain graph (master ← {music, sfx, ui}).
 */
export class AudioMixer {
  /** TBD */
  readonly #busGains: Record<Exclude<AudioBus, 'master'>, GainNode>;

  /** TBD */
  readonly #context: AudioContext;

  /** TBD */
  readonly #masterGain: GainNode;

  // The single music voice; replaced by each playMusic, cleared by stopMusic.
  /** TBD */
  #musicSource: AudioBufferSourceNode | null = null;

  /** TBD */
  #unlockDisposables: DisposableStack | null = null;

  /** TBD */
  #unlocked = false;

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

    this.#context = context;
    this.#masterGain = master;
    this.#busGains = {music, sfx, ui};
  }

  /** The single AudioContext, created (with its gain graph) at construction. */
  get context(): AudioContext {
    return this.#context;
  }

  /** Destroys the instance. */
  destroy(): void {
    this.stopMusic();
    this.#unlockDisposables?.dispose();
    this.#unlockDisposables = null;
    void this.#context.close();
  }

  /**
   * Fire-and-forget one-shot: a fresh AudioBufferSourceNode → the chosen bus →
   * start(). The node drops its own connection on `ended` (Web Audio nodes are
   * single-use); no handle is returned. Overlapping plays are independent nodes.
   */
  play(buffer: AudioBuffer, {bus}: {bus: 'sfx' | 'ui'}): void {
    let source = this.#context.createBufferSource();

    source.buffer = buffer;
    source.connect(this.#gainForBus(bus));
    source.addEventListener('ended', () => {
      source.disconnect();
    });
    source.start();
  }

  /** The single music voice on the `music` bus; replaces any current track. */
  playMusic(buffer: AudioBuffer, options?: {loop?: boolean}): void {
    this.stopMusic();

    let source = this.#context.createBufferSource();

    source.buffer = buffer;
    source.loop = options?.loop ?? true;
    source.connect(this.#gainForBus('music'));
    source.start();
    this.#musicSource = source;
  }

  /**
   * Sets a bus's volume (clamped to [0, 1]). Ramps over a short (~15 ms)
   * AudioParam automation rather than a direct assignment, so a Slider's rapid
   * onChange calls during a drag don't produce an audible "zipper" click.
   */
  setVolume(bus: AudioBus, level: number): void {
    let clamped = Math.min(1, Math.max(0, level));
    let {currentTime} = this.#context;
    let {gain} = this.#gainForBus(bus);
    // Read before cancelling: mid-ramp this is the value actually being
    // heard, and it is what the replacement ramp must start from.
    let current = gain.value;

    // A drag calls this roughly every 16 ms, so the previous ramp's 15 ms
    // endpoint is usually still in the timeline when the next pair is
    // inserted. AudioParam events are ordered by time, not by insertion, so
    // the stale ramp would still run and briefly pull toward an abandoned
    // target — audible jitter in exactly the case the ramp exists to smooth.
    // Clearing the timeline from now leaves only the newest ramp.
    gain.cancelScheduledValues(currentTime);
    gain.setValueAtTime(current, currentTime);
    gain.linearRampToValueAtTime(clamped, currentTime + VOLUME_RAMP_SECONDS);
  }

  /** TBD */
  stopMusic(): void {
    if (this.#musicSource !== null) {
      this.#musicSource.stop();
      this.#musicSource.disconnect();
      this.#musicSource = null;
    }
  }

  /**
   * Installs one-shot pointerdown + keydown listeners; the first gesture
   * anywhere resumes the (autoplay-suspended) context and removes them.
   * Idempotent: no-op while armed or once already unlocked.
   */
  unlock(): void {
    if (this.#unlocked || this.#unlockDisposables !== null) {
      return;
    }

    let disposables = new DisposableStack();
    let handleGesture = () => {
      this.#unlocked = true;
      void this.#context.resume();
      disposables.dispose();
      this.#unlockDisposables = null;
    };

    globalThis.addEventListener('pointerdown', handleGesture);
    globalThis.addEventListener('keydown', handleGesture);
    disposables.defer(() => {
      globalThis.removeEventListener('pointerdown', handleGesture);
      globalThis.removeEventListener('keydown', handleGesture);
    });

    this.#unlockDisposables = disposables;
  }

  /** TBD */
  #gainForBus(bus: AudioBus): GainNode {
    return bus === 'master' ? this.#masterGain : this.#busGains[bus];
  }
}
