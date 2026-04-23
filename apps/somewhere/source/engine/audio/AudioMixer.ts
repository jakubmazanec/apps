// The single source of truth for the bus set: `AudioBus` is derived from it, so
// the type and every loop that must visit all buses stay in lockstep. Adding a
// bus here widens `AudioBus`, which then fails to typecheck at any site that
// does not handle it (e.g. `settings.volumes[bus]`), instead of silently
// skipping it.
export const AUDIO_BUSES = ['master', 'music', 'sfx', 'ui'] as const;

export type AudioBus = (typeof AUDIO_BUSES)[number];

export type AudioMixerOptions = {
  // Factory for the single AudioContext, invoked lazily on first use. Deferring
  // creation keeps module load SSR-safe (no AudioContext in Node) and lets
  // tests inject a fake.
  createContext: () => AudioContext;
};

// A Slider drag fires many setVolume calls per second; ramping over this
// window (rather than a direct gain.value assignment) avoids an audible click
// on each one.
const VOLUME_RAMP_SECONDS = 0.015;

/**
 * A pure Web Audio wrapper with no pixi coupling: it plays raw AudioBuffers
 * through a four-node gain graph (master ← {music, sfx, ui}). The single
 * AudioContext is built on first use, never at construction, so the module is
 * SSR/test-safe and tests can inject a fake context.
 */
export class AudioMixer {
  /** TBD */
  #busGains: Record<Exclude<AudioBus, 'master'>, GainNode> | null = null;

  /** TBD */
  #context: AudioContext | null = null;

  /** TBD */
  readonly #createContext: () => AudioContext;

  /** TBD */
  #masterGain: GainNode | null = null;

  // The single music voice; replaced by each playMusic, cleared by stopMusic.
  /** TBD */
  #musicSource: AudioBufferSourceNode | null = null;

  /** TBD */
  #unlockDisposables: DisposableStack | null = null;

  /** TBD */
  #unlocked = false;

  // Volume intent per bus (0–1), applied when the gain graph is built (so a
  // setVolume before first use still takes effect).
  /** TBD */
  readonly #volumes: Record<AudioBus, number> = {
    master: 1,
    music: 1,
    sfx: 1,
    ui: 1,
  };

  constructor({createContext}: AudioMixerOptions) {
    this.#createContext = createContext;
  }

  /** The single AudioContext, created (with its gain graph) on first access. */
  get context(): AudioContext {
    return this.#ensureContext();
  }

  /** TBD */
  destroy(): void {
    this.stopMusic();
    this.#unlockDisposables?.dispose();
    this.#unlockDisposables = null;

    if (this.#context !== null) {
      void this.#context.close();
      this.#context = null;
      this.#masterGain = null;
      this.#busGains = null;
    }
  }

  /**
   * Fire-and-forget one-shot: a fresh AudioBufferSourceNode → the chosen bus →
   * start(). The node drops its own connection on `ended` (Web Audio nodes are
   * single-use); no handle is returned. Overlapping plays are independent nodes.
   */
  play(buffer: AudioBuffer, {bus}: {bus: 'sfx' | 'ui'}): void {
    let context = this.#ensureContext();
    let source = context.createBufferSource();

    source.buffer = buffer;
    source.connect(this.#gainForBus(bus));
    source.addEventListener('ended', () => {
      source.disconnect();
    });
    source.start();
  }

  /** The single music voice on the `music` bus; replaces any current track. */
  playMusic(buffer: AudioBuffer, options?: {loop?: boolean}): void {
    let context = this.#ensureContext();

    this.stopMusic();

    let source = context.createBufferSource();

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

    this.#volumes[bus] = clamped;

    // Apply live only if the graph exists; otherwise #buildGraph applies it.
    if (this.#context !== null) {
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

    // Ensure the context exists so the gesture handler can resume a real one.
    this.#ensureContext();

    let disposables = new DisposableStack();
    let handleGesture = () => {
      this.#unlocked = true;
      void this.#ensureContext().resume();
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
  #buildGraph(): void {
    let context = this.#createContext();
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

    // Apply stored volume intents now that the nodes exist.
    for (let bus of AUDIO_BUSES) {
      this.#gainForBus(bus).gain.value = this.#volumes[bus];
    }
  }

  /** TBD */
  #ensureContext(): AudioContext {
    if (this.#context === null) {
      this.#buildGraph();
    }

    return this.#context as AudioContext;
  }

  /** TBD */
  #gainForBus(bus: AudioBus): GainNode {
    if (this.#masterGain === null || this.#busGains === null) {
      throw new Error('Audio gain graph is not built!');
    }

    return bus === 'master' ? this.#masterGain : this.#busGains[bus];
  }
}
