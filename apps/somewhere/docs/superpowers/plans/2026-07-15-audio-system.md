# Audio System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-house Web Audio mixer to the engine and wire it to both audio consumers — the UI/screen layer (direct mixer calls) and the ECS/gameplay layer (a `PlaySound` event channel) — with menu/game music, wall-hit SFX, and the full UI-sound set demoable end-to-end.

**Architecture:** A pure Web Audio wrapper (`AudioMixer`) owns one lazily-created `AudioContext` and a four-node gain graph (`master → {music, sfx, ui}`). Gameplay SFX flow ECS-style: producers push `PlaySound` events onto a registered channel that `audioSystem` drains each world update and plays on the `sfx` bus. UI sounds and context music call the `audio` singleton directly (they must work with no world). Sounds load through the existing pixi `Assets` pipeline via a new `audioBufferAsset` `LoaderParser` that decodes with the mixer's context. This mirrors the just-shipped input system (T1.1) file-for-file on the ECS side.

**Tech Stack:** TypeScript, Web Audio API (`AudioContext`, `GainNode`, `AudioBufferSourceNode`), pixi.js v8 `Assets`/`LoaderParser`/`extensions`, the in-house ECS (`System`/`Entity`/`EventChannel`/`defineComponent`/`defineEvent`), Vitest + happy-dom.

Reference spec: [`docs/superpowers/specs/2026-07-15-audio-system-design.md`](../specs/2026-07-15-audio-system-design.md). Implements T1.2 of [`engine-review-2026-07-04.md`](../../engine-review-2026-07-04.md).

## Global Constraints

Every task's requirements implicitly include this section.

- **House style, copied from the input system:** options-object constructors; `#`-private fields; `let` (not `const`) for locals (see `Input.ts`); `DisposableStack` for listener cleanup; strict lifecycle throws; `.js` extensions on every relative import.
- **No pixi coupling in `AudioMixer`.** It operates on raw `AudioBuffer`s, never on asset names. Name→buffer resolution stays at call sites.
- **Lazy, SSR-safe context.** `new AudioContext()` is never called at module-evaluation time. The mixer defers it to first use via an injected `createContext` factory.
- **DEV-throw / prod-warn** for recoverable-but-wrong states, using exactly this shape (from `Tilemap.ts` / `EventChannel.ts`):
  ```ts
  if (import.meta.env.DEV) {
    throw new Error(message);
  }
  // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
  console.warn(message);
  ```
- **Placeholder audio format is `.wav`, not the spec's `.ogg`.** The spec fixes `.ogg` for *real* CC0 assets; this plan ships zero-dependency synthesized `.wav` placeholders (the spec's named fallback, §6) so the demo runs immediately. The parser's `test` matches **both** `.ogg` and `.wav`, so dropping in real `.ogg` files later is a one-line change to each bundle `sources` entry with zero parser/mixer changes. Filenames: `ui-click.wav`, `ui-key.wav`, `ui-error.wav`, `menu-music.wav`, `bump.wav`, `game-music.wav`.
- **Boundary rule (never crossed):** an ECS system never plays a UI click; a widget never emits a `PlaySound` event. UI/menu sounds + context music → direct `audio` calls (`ui`/`music` buses). Simulation sounds → `PlaySound` events (`sfx` bus).
- **Commands** (run from `apps/somewhere/`): single test file `npx vitest run tests/<File>.test.ts`; full suite `npm run test`; types `npm run typecheck`; lint `npm run lint`.

---

## File Structure

**Create (engine):**
- `source/engine/audio/AudioMixer.ts` — pure Web Audio wrapper (context, gain graph, `play`/`playMusic`/`stopMusic`/`setMuted`/`unlock`/`destroy`).
- `source/engine/audio/PlaySound.ts` — `defineEvent<{name: string}>()`.
- `source/engine/audio/AudioComponent.ts` — `defineComponent<{mixer, channel}>()`.
- `source/engine/audio/audioSystem.ts` — drains the `PlaySound` channel, plays each on `sfx`.

**Create (pixi-tools):**
- `source/pixi-tools/audioBufferAsset.ts` — `LoaderParser<AudioBuffer>` + `setAudioDecodeContext`.

**Create (game):**
- `source/game/audio.ts` — the `audio` mixer singleton, `playSoundChannel`, `audioEntity`, `playFocusSound`, initial mute, decode-context + unlock bootstrap.

**Create (assets + script):**
- `public/{ui-click,ui-key,ui-error,menu-music,bump,game-music}.wav`
- `scripts/generate-placeholder-audio.mjs` — WAV synthesis fallback.

**Create (tests):**
- `tests/AudioMixer.test.ts`, `tests/audioSystem.test.ts`, `tests/audioBufferAsset.test.ts`
- Extend `tests/UiRoot.test.ts` (add a focus-events `describe`).

**Modify (engine):**
- `source/engine/ui/UiRoot.ts` — add `UiFocusEvent` type + `onFocusEvent` option + firing on real focus changes / directional rejects.
- `source/engine/app/GameScreen.ts` — forward an `onFocusEvent` screen option into `UiRoot`.
- `source/engine/app/Game.ts` — `pixi.extensions.add(audioBufferAsset)`.

**Modify (game):**
- `source/game/game.ts` — audio bundle entries.
- `source/game/world.ts` — register `playSoundChannel`, add `audioSystem`, add `audioEntity`.
- `source/game/wallHitPopupSystem.ts` — push `PlaySound{name: 'bump'}` on each wall hit.
- `source/game/widgets.ts` — `createButton` plays `ui-click`.
- `source/game/mainMenuScreen.ts` — menu music on show; sound toggle → `setMuted`; name-input typing → `ui-key`; `onFocusEvent` wired.
- `source/game/gameScreen.ts` — game music on show; `onFocusEvent` wired.
- `source/routes/_index.tsx` — eval `game/audio.ts` at boot before `init()` loads the default bundle.

---

## Task 1: `AudioMixer` — the Web Audio wrapper

**Files:**
- Create: `source/engine/audio/AudioMixer.ts`
- Test: `tests/AudioMixer.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module; only the DOM `AudioContext`/`GainNode`/`AudioBufferSourceNode` lib types and the ambient `DisposableStack`).
- Produces:
  - `type AudioBus = 'master' | 'music' | 'sfx' | 'ui'`
  - `type AudioMixerOptions = {createContext: () => AudioContext}`
  - `class AudioMixer`:
    - `constructor(options: AudioMixerOptions)`
    - `get context(): AudioContext` — built on first access
    - `play(buffer: AudioBuffer, options: {bus: 'sfx' | 'ui'}): void`
    - `playMusic(buffer: AudioBuffer, options?: {loop?: boolean}): void` — `loop` defaults `true`
    - `stopMusic(): void`
    - `setMuted(bus: AudioBus, muted: boolean): void`
    - `unlock(): void`
    - `destroy(): void`

- [ ] **Step 1: Write the failing test**

Create `tests/AudioMixer.test.ts`:

```ts
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
  #ended: Array<() => void> = [];
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
  resume() {
    this.resumeCount += 1;
    this.state = 'running';

    return Promise.resolve();
  }
  close() {
    this.closed = true;

    return Promise.resolve();
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
    let buffer = {} as AudioBuffer;

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/AudioMixer.test.ts`
Expected: FAIL — cannot resolve `../source/engine/audio/AudioMixer.js` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `source/engine/audio/AudioMixer.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/AudioMixer.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add source/engine/audio/AudioMixer.ts tests/AudioMixer.test.ts
git commit -m "feat(audio): add AudioMixer Web Audio wrapper (T1.2)"
```

---

## Task 2: `audioBufferAsset` — the pixi loader parser

**Files:**
- Create: `source/pixi-tools/audioBufferAsset.ts`
- Modify: `source/engine/app/Game.ts:16-17` (register the parser)
- Test: `tests/audioBufferAsset.test.ts`

**Interfaces:**
- Consumes: pixi `LoaderParser`/`ExtensionType`/`LoaderParserPriority`/`extensions`.
- Produces:
  - `function setAudioDecodeContext(context: AudioContext): void`
  - `const audioBufferAsset` — a `{extension, loader}` bundle registered via `pixi.extensions.add`. `audioBufferAsset.loader.test(url)` matches `.ogg`/`.wav`; `audioBufferAsset.loader.load(url)` fetches → `arrayBuffer` → `decodeAudioData` → `AudioBuffer`, cached under the asset name.

- [ ] **Step 1: Write the failing test**

Create `tests/audioBufferAsset.test.ts`:

```ts
import {afterEach, describe, expect, test, vi} from 'vitest';

import {audioBufferAsset, setAudioDecodeContext} from '../source/pixi-tools/audioBufferAsset.js';

describe('audioBufferAsset.loader.test', () => {
  test('matches audio extensions and rejects others', () => {
    let test = audioBufferAsset.loader.test!;

    expect(test('sounds/ui-click.ogg')).toBe(true);
    expect(test('sounds/bump.wav')).toBe(true);
    expect(test('sounds/UI-CLICK.OGG')).toBe(true); // case-insensitive
    expect(test('sprites/character.png')).toBe(false);
    expect(test('maps/map.json')).toBe(false);
  });
});

describe('audioBufferAsset.loader.load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('decodes via the provided context and returns the AudioBuffer', async () => {
    let bytes = new ArrayBuffer(8);
    let buffer = {length: 1} as AudioBuffer;
    let decodeAudioData = vi.fn(async () => buffer);

    setAudioDecodeContext({decodeAudioData} as unknown as AudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({arrayBuffer: async () => bytes})),
    );

    let result = await audioBufferAsset.loader.load!<AudioBuffer>('sounds/ui-click.ogg');

    expect(decodeAudioData).toHaveBeenCalledWith(bytes);
    expect(result).toBe(buffer);
  });

  test('throws when no decode context has been set', async () => {
    vi.resetModules();

    let {audioBufferAsset: fresh} = await import('../source/pixi-tools/audioBufferAsset.js');

    await expect(fresh.loader.load!('sounds/ui-click.ogg')).rejects.toThrow(
      'Audio decode context is not set',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audioBufferAsset.test.ts`
Expected: FAIL — module `../source/pixi-tools/audioBufferAsset.js` does not exist.

- [ ] **Step 3: Write the parser**

Create `source/pixi-tools/audioBufferAsset.ts`:

```ts
import * as pixi from 'pixi.js';

// The single AudioContext used to decode compressed audio into AudioBuffers.
// Set once at bootstrap (game/audio.ts) before the first audio bundle loads;
// decoding needs a real context and the mixer owns the only one. AudioBuffers
// are context-portable per spec, so a dedicated decode context is possible if
// this parser is ever wanted fully standalone.
let decodeContext: AudioContext | null = null;

export function setAudioDecodeContext(context: AudioContext): void {
  decodeContext = context;
}

const AUDIO_EXTENSION = /\.(?:ogg|wav)$/i;

// A LoaderParser that owns the whole fetch→decode step for audio URLs; unlike
// the Tiled parsers (which transform JSON already loaded by the default
// loader) audio has no default loader, so `load` does everything. The decoded
// AudioBuffer lands in the normal Assets cache under its asset name.
const loader: pixi.LoaderParser<AudioBuffer> = {
  id: 'audioBufferAsset',
  extension: {
    type: pixi.ExtensionType.LoadParser,
    priority: pixi.LoaderParserPriority.High,
  },

  test: (url: string) => AUDIO_EXTENSION.test(url),

  load: async <T>(url: string): Promise<T> => {
    if (decodeContext === null) {
      throw new Error(
        'Audio decode context is not set — call setAudioDecodeContext() before loading audio assets!',
      );
    }

    let response = await fetch(url);
    let arrayBuffer = await response.arrayBuffer();
    let audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);

    return audioBuffer as T;
  },
};

export const audioBufferAsset = {
  extension: pixi.ExtensionType.Asset,
  loader,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/audioBufferAsset.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the parser in `Game.ts`**

In `source/engine/app/Game.ts`, add the import alongside the Tiled parser imports (after line 6):

```ts
import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
```

And register it alongside the existing `extensions.add` calls (after line 17):

```ts
pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);
pixi.extensions.add(audioBufferAsset);
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add source/pixi-tools/audioBufferAsset.ts tests/audioBufferAsset.test.ts source/engine/app/Game.ts
git commit -m "feat(audio): add audioBufferAsset loader parser and register it (T1.2)"
```

---

## Task 3: Gameplay SFX path — `PlaySound`, `AudioComponent`, `audioSystem`

**Files:**
- Create: `source/engine/audio/PlaySound.ts`
- Create: `source/engine/audio/AudioComponent.ts`
- Create: `source/engine/audio/audioSystem.ts`
- Test: `tests/audioSystem.test.ts`

**Interfaces:**
- Consumes: `AudioMixer` (Task 1, type only); `defineEvent`, `defineComponent`, `System`, `EventChannel` (ECS); pixi `Assets`.
- Produces:
  - `const PlaySound` — `defineEvent<{name: string}>()` (constructor type `typeof PlaySound`).
  - `const AudioComponent` — `defineComponent<{mixer: AudioMixer; channel: EventChannel<typeof PlaySound>}>()`.
  - `const audioSystem` — a module-level `System` (`displayName: 'Audio system'`, `components: [AudioComponent]`) that drains the component's channel each update and calls `mixer.play(buffer, {bus: 'sfx'})` per event.

- [ ] **Step 1: Write the failing test**

Create `tests/audioSystem.test.ts`:

```ts
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {type AudioMixer} from '../source/engine/audio/AudioMixer.js';
import {AudioComponent} from '../source/engine/audio/AudioComponent.js';
import {audioSystem} from '../source/engine/audio/audioSystem.js';
import {PlaySound} from '../source/engine/audio/PlaySound.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// audioSystem is a module-level singleton: every test must world.stop() so the
// next test's addSystem doesn't hit the already-has-a-world throw.
describe('audioSystem', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('plays one sfx per drained PlaySound event, then does not replay it', () => {
    let buffer = {} as AudioBuffer;

    vi.spyOn(pixi.Assets, 'get').mockReturnValue(buffer);

    let plays: Array<{buffer: unknown; bus: string}> = [];
    let mixer = {
      play(playedBuffer: AudioBuffer, options: {bus: string}) {
        plays.push({buffer: playedBuffer, bus: options.bus});
      },
    } as unknown as AudioMixer;
    let channel = new EventChannel({event: PlaySound, displayName: 'Play sound'});
    let entity = new Entity({components: [new AudioComponent({mixer, channel})]});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem).addEntity(entity);
      },
    });

    world.start();
    channel.push(new PlaySound({name: 'bump'}));

    // Channels swap at the end of update(): the push is readable next frame.
    world.update(tick());

    expect(plays).toHaveLength(0);

    world.update(tick());

    expect(plays).toEqual([{buffer, bus: 'sfx'}]);

    world.update(tick()); // drained; no replay

    expect(plays).toHaveLength(1);

    world.stop();
  });

  test('throws loudly when the audio entity is missing', () => {
    let channel = new EventChannel({event: PlaySound});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem);
      },
    });

    world.start();

    // Call the system directly rather than world.update(): a throw inside
    // world.update() would leave the world's updating flag set and make
    // stop() impossible, poisoning the module-level system for later tests.
    expect(() => audioSystem.update(tick())).toThrow('No entity found!');

    world.stop();
  });

  test('throws in DEV when a queued sound has no loaded buffer', () => {
    vi.spyOn(pixi.Assets, 'get').mockReturnValue(undefined);

    let mixer = {play: vi.fn()} as unknown as AudioMixer;
    let channel = new EventChannel({event: PlaySound});
    let entity = new Entity({components: [new AudioComponent({mixer, channel})]});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem).addEntity(entity);
      },
    });

    world.start();
    channel.push(new PlaySound({name: 'missing'}));
    world.update(tick()); // swap: the event is now current

    // Drain directly so a throw does not strand the world's updating flag.
    expect(() => audioSystem.update(tick())).toThrow('missing');

    world.stop();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audioSystem.test.ts`
Expected: FAIL — modules under `source/engine/audio/` (`PlaySound`, `AudioComponent`, `audioSystem`) do not exist.

- [ ] **Step 3: Write `PlaySound`**

Create `source/engine/audio/PlaySound.ts`:

```ts
import {defineEvent} from '../ecs/Event.js';

// Engine-generic gameplay SFX, identified by its asset cache key. No bus field
// — gameplay SFX are always the `sfx` bus (§1 boundary rule). Per-play
// pitch/gain variation is a named future field.
export const PlaySound = defineEvent<{name: string}>();
```

- [ ] **Step 4: Write `AudioComponent`**

Create `source/engine/audio/AudioComponent.ts`:

```ts
import {defineComponent} from '../ecs/Component.js';
import {type EventChannel} from '../ecs/EventChannel.js';
import {type AudioMixer} from './AudioMixer.js';
import {type PlaySound} from './PlaySound.js';

// Purely for discoverability, mirroring InputComponent. It carries the mixer
// AND the channel because the engine audioSystem cannot import a game-created
// channel (engine must not depend on game) — the component is how the engine
// system reaches a game-owned channel. Singleton entity + query per the T1.1
// pattern; not a module singleton, not a world resource (that API arrives with
// T2.15; the read migrates then).
export const AudioComponent = defineComponent<{
  mixer: AudioMixer;
  channel: EventChannel<typeof PlaySound>;
}>();
```

- [ ] **Step 5: Write `audioSystem`**

Create `source/engine/audio/audioSystem.ts`:

```ts
import * as pixi from 'pixi.js';

import {System} from '../ecs/System.js';
import {AudioComponent} from './AudioComponent.js';

export const audioSystem = new System({
  displayName: 'Audio system',
  components: [AudioComponent],
  onUpdate: (ticker, system) => {
    // getFirst() throws loudly when the singleton entity is missing (the
    // inputSystem/cameraSystem precedent). The system is the only holder of
    // the mixer on the SFX path; gameplay systems only push events.
    let {mixer, channel} = system.getFirst().getComponent(AudioComponent);

    for (let {name} of channel.events) {
      let buffer = pixi.Assets.get<AudioBuffer | undefined>(name);

      if (!buffer) {
        // DEV-throw / prod-warn, then skip (house style): a silent drop
        // reproduces as an inexplicably missing sound effect.
        let message = `No audio buffer loaded for sound "${name}"!`;

        if (import.meta.env.DEV) {
          throw new Error(message);
        }

        // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
        console.warn(message);

        continue;
      }

      mixer.play(buffer, {bus: 'sfx'});
    }
  },
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/audioSystem.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add source/engine/audio/PlaySound.ts source/engine/audio/AudioComponent.ts source/engine/audio/audioSystem.ts tests/audioSystem.test.ts
git commit -m "feat(audio): add PlaySound event, AudioComponent, and audioSystem (T1.2)"
```

---

## Task 4: Placeholder audio assets

**Files:**
- Create: `scripts/generate-placeholder-audio.mjs`
- Create: `public/ui-click.wav`, `public/ui-key.wav`, `public/ui-error.wav`, `public/bump.wav`, `public/menu-music.wav`, `public/game-music.wav`

No unit test — assets are exercised by the demo (Task 9). This task produces the six files the bundle entries (Task 6) reference.

- [ ] **Step 1: Write the synthesis script**

Create `scripts/generate-placeholder-audio.mjs`:

```js
// Zero-dependency placeholder audio generator: writes mono 16-bit PCM WAV files
// into public/. These are throwaway sounds for the demo; replace with real CC0
// .ogg clips later (the loader parser accepts both .ogg and .wav — just change
// the bundle `sources` entries in source/game/game.ts).
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const SAMPLE_RATE = 44100;

function encodeWav(samples) {
  let dataLength = samples.length * 2;
  let buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < samples.length; i++) {
    let clamped = Math.max(-1, Math.min(1, samples[i]));

    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

// A single decaying sine "blip".
function blip({freq, ms, volume = 0.4}) {
  let count = Math.floor((SAMPLE_RATE * ms) / 1000);
  let samples = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let t = i / SAMPLE_RATE;
    let envelope = Math.exp((-t * 3000) / ms); // fast exponential decay

    samples[i] = Math.sin(2 * Math.PI * freq * t) * envelope * volume;
  }

  return samples;
}

// A looping arpeggio built from a repeated note sequence (a placeholder track).
function loop({notes, noteMs, repeats}) {
  let chunks = [];

  for (let r = 0; r < repeats; r++) {
    for (let freq of notes) {
      chunks.push(blip({freq, ms: noteMs, volume: 0.25}));
    }
  }

  let total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let samples = new Float32Array(total);
  let offset = 0;

  for (let chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return samples;
}

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let files = {
  'ui-click.wav': blip({freq: 880, ms: 60}),
  'ui-key.wav': blip({freq: 660, ms: 40, volume: 0.3}),
  'ui-error.wav': blip({freq: 220, ms: 180, volume: 0.5}),
  'bump.wav': blip({freq: 140, ms: 120, volume: 0.6}),
  'menu-music.wav': loop({notes: [523, 659, 784, 659], noteMs: 220, repeats: 8}),
  'game-music.wav': loop({notes: [392, 523, 494, 587], noteMs: 180, repeats: 10}),
};

for (let [name, samples] of Object.entries(files)) {
  writeFileSync(publicDir + name, encodeWav(samples));
  // eslint-disable-next-line no-console -- one-shot generator script
  console.log(`wrote public/${name} (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
}
```

- [ ] **Step 2: Run the script to generate the files**

Run: `node scripts/generate-placeholder-audio.mjs`
Expected output (six lines):

```
wrote public/ui-click.wav (0.06s)
wrote public/ui-key.wav (0.04s)
wrote public/ui-error.wav (0.18s)
wrote public/bump.wav (0.12s)
wrote public/menu-music.wav (7.04s)
wrote public/game-music.wav (7.20s)
```

- [ ] **Step 3: Verify the files exist and are non-empty**

Run: `ls -l public/ui-click.wav public/ui-key.wav public/ui-error.wav public/bump.wav public/menu-music.wav public/game-music.wav`
Expected: six files, each > 44 bytes (a valid WAV header plus PCM data).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-placeholder-audio.mjs public/ui-click.wav public/ui-key.wav public/ui-error.wav public/bump.wav public/menu-music.wav public/game-music.wav
git commit -m "chore(audio): add placeholder WAV assets and synthesis script (T1.2)"
```

---

## Task 5: `game/audio.ts` singleton + boot bootstrap

**Files:**
- Create: `source/game/audio.ts`
- Modify: `source/routes/_index.tsx:18-24` (eval `game/audio.ts` at boot before `init()`)

No unit test — this wiring is exercised by the demo. Delivered here so the decode context is set at boot *before* Task 6 adds the audio bundle entries the boot loads.

**Interfaces:**
- Consumes: `AudioMixer` (T1), `setAudioDecodeContext` (T2), `PlaySound` + `AudioComponent` (T3), `EventChannel`, `Entity`, `settings`, pixi `Assets`, `UiFocusEvent` (T7 — a forward type-only import; see note below).
- Produces:
  - `const audio: AudioMixer` — the module singleton the UI/screen layer calls directly.
  - `const playSoundChannel: EventChannel<typeof PlaySound>` — imported directly by SFX producers (like `wallHitChannel`).
  - `const audioEntity: Entity` — carries `{mixer: audio, channel: playSoundChannel}`.
  - `function playFocusSound(event: UiFocusEvent): void` — the shared focus-sound callback passed to every screen.

> **Ordering note:** `playFocusSound` takes a `UiFocusEvent`, a type defined in Task 7. If executing tasks strictly in order, either (a) do Task 7 before this task, or (b) create this file now without `playFocusSound` and add it in Task 8 (which is where it is first *used*). The recommended order is **Task 7 before Task 8**; placing `playFocusSound` here keeps all game-audio wiring in one file. The code below assumes Task 7 is done. If it is not yet, omit the `playFocusSound` export and its `UiFocusEvent` import until Task 8.

- [ ] **Step 1: Write `game/audio.ts`**

Create `source/game/audio.ts`:

```ts
import * as pixi from 'pixi.js';

import {AudioComponent} from '../engine/audio/AudioComponent.js';
import {AudioMixer} from '../engine/audio/AudioMixer.js';
import {PlaySound} from '../engine/audio/PlaySound.js';
import {Entity} from '../engine/ecs/Entity.js';
import {EventChannel} from '../engine/ecs/EventChannel.js';
import {type UiFocusEvent} from '../engine/ui/UiRoot.js';
import {setAudioDecodeContext} from '../pixi-tools/audioBufferAsset.js';
import {settings} from './settings.js';

// The one mixer for the whole app. The UI/screen layer imports `audio` and
// calls it directly (it must work with no world, e.g. the main menu); the ECS
// layer reaches the same mixer through audioEntity's AudioComponent.
export const audio = new AudioMixer({createContext: () => new AudioContext()});

// A game module singleton, imported directly by SFX producers (like
// wallHitChannel today) and registered on the world so its swap() runs.
export const playSoundChannel = new EventChannel({event: PlaySound, displayName: 'Play sound'});

export const audioEntity = new Entity({
  components: [new AudioComponent({mixer: audio, channel: playSoundChannel})],
});

// Initial mute goes through the same setter the Options toggle uses (§5.1), so
// T1.8a persistence later only has to hydrate `settings` — zero mixer changes.
audio.setMuted('master', !settings.soundEnabled);

// The shared focus-sound callback passed to every screen (§4): a semantic focus
// event becomes a UI sound here, keeping UiRoot audio-agnostic. `move` reuses
// the click clip (no separate blip asset); `reject` is the error clip.
export function playFocusSound(event: UiFocusEvent): void {
  if (event.type === 'move') {
    audio.play(pixi.Assets.get<AudioBuffer>('ui-click'), {bus: 'ui'});
  } else {
    audio.play(pixi.Assets.get<AudioBuffer>('ui-error'), {bus: 'ui'});
  }
}

// Client-only bootstrap. The `typeof AudioContext` guard also keeps this safe
// under the happy-dom test env (which has `window` but no AudioContext), so any
// test that transitively imports this module does not construct a context.
if (typeof window !== 'undefined' && typeof AudioContext !== 'undefined') {
  // Hand the mixer's context to the loader parser BEFORE any audio bundle
  // loads (Game.init loads the `default` bundle, which carries the UI/menu
  // sounds), then arm the first-gesture unlock.
  setAudioDecodeContext(audio.context);
  audio.unlock();
}
```

- [ ] **Step 2: Eval the audio bootstrap at boot, before `init()`**

In `source/routes/_index.tsx`, add `game/audio.js` to the boot `Promise.all` so its module-eval bootstrap (decode context + unlock) runs before `importedGame.init()` loads the default bundle. Change the destructuring `await Promise.all([...])` (lines 18-24) to:

```tsx
      let [{game: importedGame}, {loadingScreen}, {mainMenuScreen}, {gameScreen}] =
        await Promise.all([
          import('../game/game.js'),
          import('../game/loadingScreen.js'),
          import('../game/mainMenuScreen.js'),
          import('../game/gameScreen.js'),
          // Eval audio bootstrap (decode context + first-gesture unlock) before
          // init() below loads the default bundle's audio assets.
          import('../game/audio.js'),
        ]);
```

(The fifth import is awaited for its module side-effects; the array destructure intentionally binds only the first four.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Requires Task 7's `UiFocusEvent` export to exist; see the ordering note above.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors on the new/changed files.

- [ ] **Step 5: Commit**

```bash
git add source/game/audio.ts source/routes/_index.tsx
git commit -m "feat(audio): add game audio singleton, channel, entity, and boot bootstrap (T1.2)"
```

---

## Task 6: Wire the gameplay SFX path end-to-end (bundle entries + world + producer)

**Files:**
- Modify: `source/game/game.ts:15-38` (default bundle) and `:40-56` (game bundle) — audio entries
- Modify: `source/game/world.ts` — register channel, add system + entity
- Modify: `source/game/wallHitPopupSystem.ts` — push `PlaySound{name: 'bump'}`

No unit test — verified by the demo (Task 9). After this task, a wall hit produces the `bump` sound in the running app.

- [ ] **Step 1: Add audio bundle entries in `game.ts`**

In `source/game/game.ts`, in the `default` bundle `assets` array (after the `focus-ring` entry, line 36), add:

```ts
        {name: 'ui-click', sources: ['ui-click.wav']},
        {name: 'ui-key', sources: ['ui-key.wav']},
        {name: 'ui-error', sources: ['ui-error.wav']},
        {name: 'menu-music', sources: ['menu-music.wav']},
```

In the `game` bundle `assets` array (after the `spark` entry, line 54), add:

```ts
        {name: 'bump', sources: ['bump.wav']},
        {name: 'game-music', sources: ['game-music.wav']},
```

- [ ] **Step 2: Register the channel and add the system + entity in `world.ts`**

In `source/game/world.ts`, add imports alongside the existing ones:

```ts
import {audioSystem} from '../engine/audio/audioSystem.js';
import {audioEntity, playSoundChannel} from './audio.js';
```

In `onStart`, register the channel alongside the others (after line 40, `world.addEventChannel(popupExpiredChannel);`):

```ts
    world.addEventChannel(playSoundChannel);
```

Add the system after `wallHitPopupSystem` (after line 51):

```ts
    world.addSystem(audioSystem); // placement is free: PlaySound events are buffered, seen next frame
```

Add the entity alongside the others (after line 60, `world.addEntity(inputEntity);`):

```ts
    world.addEntity(audioEntity);
```

- [ ] **Step 3: Push a `PlaySound` on each wall hit in `wallHitPopupSystem.ts`**

In `source/game/wallHitPopupSystem.ts`, add imports:

```ts
import {PlaySound} from '../engine/audio/PlaySound.js';
import {playSoundChannel} from './audio.js';
```

Inside the `for (let {entity, tile} of wallHitChannel.events)` loop, as the first statement of the loop body (before `let box = tile.boundingBox;`, line 57), add:

```ts
      // Gameplay SFX for the wall hit, alongside the popup this system already
      // spawns — no separate audio-bridge system. audioSystem plays it on `sfx`.
      playSoundChannel.push(new PlaySound({name: 'bump'}));
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Verify the SFX path in the running app**

Run: `npm run develop` and open the app in a browser.
- Click **New Game**, wait for the loading screen, then move the player (WASD) into a wall.
- Expected: a low `bump` sound on each wall-contact episode (the same moment the spark popup appears). Nothing sounds before your first click on the page (autoplay unlock).

Stop the dev server when confirmed.

- [ ] **Step 6: Commit**

```bash
git add source/game/game.ts source/game/world.ts source/game/wallHitPopupSystem.ts
git commit -m "feat(audio): wire gameplay SFX path (bundle entries, world, wall-hit push) (T1.2)"
```

---

## Task 7: `UiRoot` focus events (engine hook)

**Files:**
- Modify: `source/engine/ui/UiRoot.ts` — add `UiFocusEvent` type, `onFocusEvent` option, firing logic
- Modify: `source/engine/app/GameScreen.ts` — forward an `onFocusEvent` screen option into `UiRoot`
- Test: extend `tests/UiRoot.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type UiFocusEvent = {type: 'move'} | {type: 'reject'}`
  - `UiRootOptions` gains `onFocusEvent?: (event: UiFocusEvent) => void`
  - `GameScreenOptions` gains `onFocusEvent?: ((event: UiFocusEvent) => void) | undefined`

**Behavior:**
- `'move'` fires from `moveFocus`/`focusNext`/`focusPrevious` when focus lands on a component **different** from the prior `#focused`. Tap-driven silent focus (`#focusFromPointer`) fires nothing.
- `'reject'` fires when a directional `moveFocus` finds no candidate (`#nearestInDirection` returns `null`).

- [ ] **Step 1: Write the failing test**

Extend `tests/UiRoot.test.ts`. Add this `describe` block inside the top-level `describe('UiRoot', ...)` (e.g. after the existing `describe('pointer interplay', ...)`). It reuses the file's existing `createRoot`, `focusable`, and helper conventions:

```ts
  describe('focus events', () => {
    test('fires a move event when focus lands on a new component', () => {
      let onFocusEvent = vi.fn();
      let root = createRoot({onFocusEvent});
      let a = focusable({x: 0, y: 0, width: 10, height: 10});
      let b = focusable({x: 0, y: 20, width: 10, height: 10});

      root.addChild(a, b);

      root.moveFocus('down'); // null → nearest (a)

      expect(onFocusEvent).toHaveBeenLastCalledWith({type: 'move'});
      expect(root.focused).toBe(a);

      root.moveFocus('down'); // a → b

      expect(onFocusEvent).toHaveBeenLastCalledWith({type: 'move'});
      expect(root.focused).toBe(b);
      expect(onFocusEvent).toHaveBeenCalledTimes(2);
    });

    test('fires a move event from focusNext', () => {
      let onFocusEvent = vi.fn();
      let root = createRoot({onFocusEvent});
      let a = focusable({x: 0, y: 0, width: 10, height: 10});
      let b = focusable({x: 0, y: 20, width: 10, height: 10});

      root.addChild(a, b);

      root.focusNext(); // null → focusables[0] (a)
      root.focusNext(); // a → b

      expect(onFocusEvent).toHaveBeenCalledTimes(2);
      expect(onFocusEvent).toHaveBeenLastCalledWith({type: 'move'});
    });

    test('fires a reject event when a directional move finds no candidate', () => {
      let onFocusEvent = vi.fn();
      let root = createRoot({onFocusEvent});
      let a = focusable({x: 0, y: 0, width: 10, height: 10});

      root.addChild(a);

      root.moveFocus('down'); // null → a (move)

      expect(onFocusEvent).toHaveBeenLastCalledWith({type: 'move'});

      root.moveFocus('down'); // a has nothing below → reject

      expect(onFocusEvent).toHaveBeenLastCalledWith({type: 'reject'});
      expect(root.focused).toBe(a); // focus unchanged on reject
    });

    test('a tap that silently moves focus fires neither event', () => {
      let onFocusEvent = vi.fn();
      let root = createRoot({onFocusEvent});
      let view = root.view as unknown as MockContainer;
      let component = focusable();

      root.addChild(component);

      view.captureListeners.pointertap?.[0]?.({target: component.view});

      expect(root.focused).toBe(component);
      expect(onFocusEvent).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/UiRoot.test.ts`
Expected: FAIL — `onFocusEvent` is never called (option is ignored); the new tests fail their `toHaveBeenCalled` assertions.

- [ ] **Step 3: Add the type and option to `UiRoot`**

In `source/engine/ui/UiRoot.ts`, add the event type after `FocusDirection` (after line 6):

```ts
export type UiFocusEvent = {type: 'move'} | {type: 'reject'};
```

Extend `UiRootOptions` (lines 19-21) to:

```ts
export type UiRootOptions = {
  focusRing?: FocusRingOptions;
  // Semantic focus feedback (the game maps it to a sound). `move` fires when a
  // focus command lands on a different component; `reject` when a directional
  // move finds no candidate. Tap-driven silent focus fires nothing.
  onFocusEvent?: (event: UiFocusEvent) => void;
};
```

Add a private field alongside `#focusRing` (after line 49, `readonly #focusRing?: FocusRingOptions;`):

```ts
  readonly #onFocusEvent?: (event: UiFocusEvent) => void;
```

In the constructor, store it alongside the `focusRing` assignment. Change the signature and body (lines 56-59) to:

```ts
  constructor({focusRing, onFocusEvent}: UiRootOptions = {}) {
    if (focusRing !== undefined) {
      this.#focusRing = focusRing;
    }

    if (onFocusEvent !== undefined) {
      this.#onFocusEvent = onFocusEvent;
    }
```

- [ ] **Step 4: Fire the events from the focus commands**

In `source/engine/ui/UiRoot.ts`, rewrite `moveFocus` (lines 174-204) to capture the prior focus and emit:

```ts
  moveFocus(direction: FocusDirection) {
    let focusables = this.#collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    this.#isRingVisible = true;

    let previous = this.#focused;
    let current = this.#focused;

    if (current === null) {
      this.#focused = this.#nearestTopLeft(focusables);
      this.#emitFocusChange(previous);

      return;
    }

    if (!focusables.includes(current)) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#focused = null;

      return;
    }

    let next = this.#nearestInDirection(current, focusables, direction);

    if (next !== null) {
      this.#focused = next;
      this.#emitFocusChange(previous);
    } else {
      // Arrow-key navigation hit a wall: the clean, detectable negative-feedback case.
      this.#onFocusEvent?.({type: 'reject'});
    }
  }
```

Rewrite `#moveLinear` (lines 324-352) to emit on a real change:

```ts
  #moveLinear(step: -1 | 1) {
    let focusables = this.#collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    this.#isRingVisible = true;

    let previous = this.#focused;
    let current = this.#focused;

    if (current === null) {
      this.#focused = focusables[0] ?? null;
      this.#emitFocusChange(previous);

      return;
    }

    let index = focusables.indexOf(current);

    if (index === -1) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#focused = null;

      return;
    }

    this.#focused = focusables[(index + step + focusables.length) % focusables.length] ?? null;
    this.#emitFocusChange(previous);
  }
```

Add the private emit helper (place it next to `#nearestTopLeft`, e.g. after line 457's closing brace):

```ts
  // Fire `move` only when the focus actually changed to a different component
  // (a single-focusable focusNext wraps to itself and stays silent).
  #emitFocusChange(previous: Focusable | null) {
    if (this.#focused !== null && this.#focused !== previous) {
      this.#onFocusEvent?.({type: 'move'});
    }
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/UiRoot.test.ts`
Expected: PASS (existing focus tests plus the four new ones).

- [ ] **Step 6: Forward `onFocusEvent` through `GameScreen`**

In `source/engine/app/GameScreen.ts`, extend the `UiRoot` import (line 5) to include the new members:

```ts
import {type FocusRingOptions, type UiFocusEvent, type UiRootOptions, UiRoot} from '../ui/UiRoot.js';
```

Add `onFocusEvent` to `GameScreenOptions` (after the `focusRing` line, line 15):

```ts
  onFocusEvent?: ((event: UiFocusEvent) => void) | undefined;
```

Add a private field alongside `#focusRing` (after line 32):

```ts
  readonly #onFocusEvent?: (event: UiFocusEvent) => void;
```

Destructure and store it in the constructor. Add `onFocusEvent` to the destructured options (in the `constructor({...})` list, lines 52-61) and store it alongside `focusRing` (after the `focusRing` block, lines 68-70):

```ts
    if (onFocusEvent !== undefined) {
      this.#onFocusEvent = onFocusEvent;
    }
```

Rewrite the `UiRoot` construction in `setGame` (line 107) to compose both options:

```ts
    let uiRootOptions: UiRootOptions = {};

    if (this.#focusRing !== undefined) {
      uiRootOptions.focusRing = this.#focusRing;
    }

    if (this.#onFocusEvent !== undefined) {
      uiRootOptions.onFocusEvent = this.#onFocusEvent;
    }

    this.#ui = new UiRoot(uiRootOptions);
```

- [ ] **Step 7: Typecheck and full suite**

Run: `npm run typecheck && npx vitest run tests/UiRoot.test.ts tests/GameScreen.test.ts`
Expected: no type errors; both test files PASS.

- [ ] **Step 8: Commit**

```bash
git add source/engine/ui/UiRoot.ts source/engine/app/GameScreen.ts tests/UiRoot.test.ts
git commit -m "feat(ui): add UiRoot focus events and GameScreen forwarding (T1.2)"
```

---

## Task 8: UI-sound and music wiring (game layer)

**Files:**
- Modify: `source/game/widgets.ts` — `createButton` plays `ui-click`
- Modify: `source/game/mainMenuScreen.ts` — menu music on show; sound toggle → `setMuted`; name-input typing → `ui-key`; `onFocusEvent`
- Modify: `source/game/gameScreen.ts` — game music on show; `onFocusEvent`

No unit test — verified by the demo (Task 9). Engine widgets stay audio-agnostic; all sound choices live in the game layer.

- [ ] **Step 1: Play `ui-click` from `createButton`**

In `source/game/widgets.ts`, add imports at the top (after the pixi import, line 1):

```ts
import {audio} from './audio.js';
```

In `createButton`, wrap the caller's `onClick` so every button clicks centrally (change the `onClick` passed to `new Button`, line 56, from `onClick,` to an inline handler). Replace `onClick,` with:

```ts
    onClick: () => {
      audio.play(pixi.Assets.get<AudioBuffer>('ui-click'), {bus: 'ui'});
      onClick();
    },
```

- [ ] **Step 2: Wire the main menu — music, sound toggle, typing, focus events**

In `source/game/mainMenuScreen.ts`:

Add imports (after the pixi import, line 1):

```ts
import {audio, playFocusSound} from './audio.js';
```

**Menu music on show + focus events.** The `mainMenuScreen` `GameScreen` options currently have no `onShow`. Add both `onShow` and `onFocusEvent` to the `new GameScreen<MainMenuScreenState>({...})` options object (e.g. after `focusRing: FOCUS_RING,`, line 150):

```ts
  onFocusEvent: playFocusSound,
  onShow: () => {
    // Music is driven by direct mixer calls from the screen context (never the
    // world, never auto-stopped by pause). playMusic replaces the current voice.
    audio.playMusic(pixi.Assets.get<AudioBuffer>('menu-music'));
  },
```

**Sound toggle → master mute (§5.1).** Replace the `soundToggle` `onChange` (lines 87-89) with:

```ts
    onChange: (toggle) => {
      let enabled = toggle.isChecked;

      settings.soundEnabled = enabled;
      // Set mute first so an enabling toggle unmutes before its own click plays
      // (an audible confirmation); a disabling toggle mutes and stays silent.
      audio.setMuted('master', !enabled);
      audio.play(pixi.Assets.get<AudioBuffer>('ui-click'), {bus: 'ui'});
    },
```

**Typing sound on the name input.** The `nameInput` `onChange` fires per keystroke (line 63-65). Change it to also play `ui-key`:

```ts
    onChange: (input) => {
      settings.playerName = input.value;
      audio.play(pixi.Assets.get<AudioBuffer>('ui-key'), {bus: 'ui'});
    },
```

- [ ] **Step 3: Wire the game screen — music + focus events**

In `source/game/gameScreen.ts`:

Add an import (after `import {input} from './input.js';`, line 8):

```ts
import {audio, playFocusSound} from './audio.js';
import * as pixi from 'pixi.js';
```

Add `onFocusEvent` to the `new GameScreen<GameScreenState, UIEventMap>({...})` options (after `focusRing: FOCUS_RING,`, line 93):

```ts
  onFocusEvent: playFocusSound,
```

Add the game music to the existing `onShow` (line 153). At the end of the `onShow` body, after the `screen.subscribe('world:wallHit', ...)` block (after line 168), add:

```ts
    // Swap to the in-game track; the menu track (still playing through the
    // loading screen) is replaced by this single music voice — no silent gap,
    // no explicit stop. Music is not stopped on pause or onHide in the demo.
    audio.playMusic(pixi.Assets.get<AudioBuffer>('game-music'));
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (If lint flags the `import * as pixi` ordering in `gameScreen.ts`, run `npm run format` to fix import order, then re-lint.)

- [ ] **Step 5: Commit**

```bash
git add source/game/widgets.ts source/game/mainMenuScreen.ts source/game/gameScreen.ts
git commit -m "feat(audio): wire UI sounds and context music into the game layer (T1.2)"
```

---

## Task 9: Full-suite check + manual demo acceptance pass

**Files:** none (verification only). Audio barely unit-tests; the demo is the real acceptance test (§7).

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (including the four new/extended audio files). No coverage regressions that fail the run.

- [ ] **Step 2: Typecheck and lint the whole project**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual demo pass (the acceptance test)**

Run: `npm run develop`, open the app, and confirm each item from spec §7:

- [ ] **Autoplay gate:** nothing sounds before your first click/keypress on the page; everything sounds after.
- [ ] **Menu music (`music`):** the main menu plays `menu-music` on show.
- [ ] **UI clicks (`ui`):** New Game, Options, Close, Pause, Resume, Quit to menu buttons each click.
- [ ] **Toggle (`ui` + master mute):** toggling **Sound off** silences everything; toggling it back **on** restores audio (and the enabling toggle itself clicks).
- [ ] **Typing (`ui`):** typing in the Options **Player name** field blips per keystroke.
- [ ] **Focus blips (`ui`):** arrow/Tab navigation between widgets plays the focus-move click; arrowing into a wall (no candidate) plays the error sound. Tapping a widget with the mouse does **not** add a focus blip (just the widget's own click).
- [ ] **Game music (`music`):** starting a run swaps to `game-music` (a different track); the menu track carries through the loading screen with no silent gap.
- [ ] **Wall-hit SFX (`sfx`):** moving into a wall plays `bump` in sync with the spark popup.
- [ ] **Pause behavior:** opening the pause menu keeps music playing; no new wall-hit SFX occur while paused (the world is frozen).

Stop the dev server when all items are confirmed.

- [ ] **Step 4: Mark T1.2 complete**

The audio system is implemented and demo-verified. Out-of-scope seams (§8 — volume sliders + persistence, ducking, streaming music, crossfade, per-play pitch/gain, widget-level rejects, spatial audio, world resources) remain intentionally deferred with their attachment points in place.

---

## Self-Review

**Spec coverage:**
- §1 Two consumers, one mixer — UI/menu direct calls (Task 8), ECS `PlaySound` path (Tasks 3, 6), music via screen context (Task 8). Boundary rule enforced (Global Constraints). ✅
- §2 Engine surface — `AudioMixer` (Task 1), `PlaySound` + `AudioComponent` + `audioSystem` (Task 3), lazy SSR-safe context, four-bus graph, fire-and-forget `play`, single music voice, `unlock`, mute-only level control, "no new event machinery" (registered channel). ✅
- §3 Asset loading — `audioBufferAsset` parser + `setAudioDecodeContext` (Task 2), registration in `Game.ts` (Task 2), bundle entries (Task 6), decode-context bootstrap before first load (Task 5). ✅
- §4 `UiRoot` focus events — `UiFocusEvent`, `onFocusEvent`, `move`/`reject` firing, tap-silent, plumbing via `GameScreen` (Task 7). ✅
- §5 Game wiring — `game/audio.ts` (Task 5), `world.ts` registration (Task 6), UI-sound wiring (Task 8), gameplay SFX push in `wallHitPopupSystem` (Task 6), music on `onShow` (Task 8). §5.1 initial mute + toggle → `setMuted`, persistence seam named (Tasks 5, 8). ✅
- §6 Assets — six placeholder files + synthesis script (Task 4); `.ogg`↔`.wav` deviation documented (Global Constraints). ✅
- §7 Testing — `AudioMixer`, `audioSystem`, `audioBufferAsset`, extended `UiRoot` tests; manual demo pass (Task 9). ✅
- §8 Out of scope — nothing implemented; seams left in place (Task 9 note). ✅

**Type consistency:** `AudioBus`, `AudioMixerOptions`, and every mixer method signature defined in Task 1 are used unchanged in Tasks 3/5/8. `PlaySound`/`AudioComponent`/`audioSystem` names are consistent across Tasks 3/5/6. `EventChannel<typeof PlaySound>` matches the `defineEvent` constructor-type convention used by `wallHitChannel`. `UiFocusEvent`/`onFocusEvent`/`UiRootOptions` defined in Task 7 are consumed by `game/audio.ts` (Task 5) and `GameScreen` (Task 7) with matching shapes. `setAudioDecodeContext` and `audioBufferAsset` names match between Task 2 (definition) and Task 5 (use).

**Cross-task ordering caveat:** `game/audio.ts` (Task 5) imports `UiFocusEvent` from Task 7. The recommended execution order runs Task 7 before Task 8, and Task 5's typecheck step (5.4) will fail if Task 7 has not been done — the ordering note in Task 5 makes the dependency explicit and gives the fallback (defer `playFocusSound` to Task 8). This is a deliberate, flagged dependency, not a hidden one.
