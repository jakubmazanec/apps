export type AudioBus = 'master' | 'music' | 'sfx' | 'ui';

export type AudioMixerOptions = {
  // Factory for the single AudioContext, invoked lazily on first use. Deferring
  // creation keeps module load SSR-safe (no AudioContext in Node) and lets
  // tests inject a fake.
  createContext: () => AudioContext;
};

/**
 * A pure Web Audio wrapper with no pixi coupling: it plays raw AudioBuffers
 * through a four-node gain graph (master ← {music, sfx, ui}). The single
 * AudioContext is built on first use, never at construction, so the module is
 * SSR/test-safe and tests can inject a fake context.
 */
export class AudioMixer {
  readonly #createContext: () => AudioContext;

  #context: AudioContext | null = null;
  #masterGain: GainNode | null = null;
  #busGains: Record<Exclude<AudioBus, 'master'>, GainNode> | null = null;

  // Mute intent per bus, applied when the gain graph is built (so a setMuted
  // before first use still takes effect). false = audible (gain 1).
  readonly #muted: Record<AudioBus, boolean> = {
    master: false,
    music: false,
    sfx: false,
    ui: false,
  };

  // The single music voice; replaced by each playMusic, cleared by stopMusic.
  #musicSource: AudioBufferSourceNode | null = null;

  #unlocked = false;
  #unlockDisposables: DisposableStack | null = null;

  constructor({createContext}: AudioMixerOptions) {
    this.#createContext = createContext;
  }

  /** The single AudioContext, created (with its gain graph) on first access. */
  get context(): AudioContext {
    return this.#ensureContext();
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

  stopMusic(): void {
    if (this.#musicSource !== null) {
      this.#musicSource.stop();
      this.#musicSource.disconnect();
      this.#musicSource = null;
    }
  }

  /** Mute is the only level control this cycle: a muted bus is gain 0, unmuted 1. */
  setMuted(bus: AudioBus, muted: boolean): void {
    this.#muted[bus] = muted;

    // Apply live only if the graph exists; otherwise #buildGraph applies it.
    if (this.#context !== null) {
      this.#gainForBus(bus).gain.value = muted ? 0 : 1;
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

  #ensureContext(): AudioContext {
    if (this.#context === null) {
      this.#buildGraph();
    }

    return this.#context as AudioContext;
  }

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

    // Apply stored mute intents now that the nodes exist.
    for (let bus of ['master', 'music', 'sfx', 'ui'] as const) {
      this.#gainForBus(bus).gain.value = this.#muted[bus] ? 0 : 1;
    }
  }

  #gainForBus(bus: AudioBus): GainNode {
    if (this.#masterGain === null || this.#busGains === null) {
      throw new Error('Audio gain graph is not built!');
    }

    return bus === 'master' ? this.#masterGain : this.#busGains[bus];
  }
}
