# Persistence (Settings + Saves) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** One schema-validated localStorage code path (`PersistedStore`) that persists settings and
a bespoke save blob, with auto-save on exit/tab-hide, a manual Save button in the pause menu, and a
Continue button on the main menu.

**Architecture:** A generic engine class (`PersistedStore<T>`) wraps localStorage behind zod
validation — every failed load degrades to a defaults factory, every write is best-effort. Two
per-key stores are built on it: `game/settings.ts` (hydrated at module load, written on change) and
`game/save.ts` (extraction-and-apply: save reads the player position out of the live world; Continue
stages the blob and `gameScreen.onShow` applies it after the normal New Game construction path). No
versioning, no envelope — the schema is the only gate.

**Tech Stack:** TypeScript, zod ^4.1.8 (already in dependencies), pixi.js UI widgets (existing
engine classes), vitest + happy-dom (happy-dom provides a real working `localStorage`).

**Spec:** `docs/superpowers/specs/2026-07-17-persistence-design.md` (read it if a decision here
seems surprising; its scope decisions are final — "Open decisions: None").

## Global Constraints

- All commands run from `apps/somewhere/` (the workspace app directory). Verification is
  `npm run typecheck`, `npm run lint`, `npm test`.
- localStorage keys are exactly `somewhere:settings` and `somewhere:save`.
- Persistence failures must never throw into the game loop or a screen transition. The only
  observable artifact of a failure is a single `console.warn` (spec §5).
- No new dependencies. zod ^4.1.8 is already in `package.json` dependencies; the engine imports it
  directly (precedent: `source/tiled-tools/*`).
- No version field, no envelope, no migration machinery. The stored shape is the JSON-serialized
  value itself.
- Deferred (do NOT build): `navigator.storage.persist()`, save export/import, save slots,
  migrations, a New Game overwrite confirmation, generic entity/system serialization (spec §7).
- House style: `let` for locals (`const` only at module scope), relative imports with `.js`
  extensions, inline type imports (`{type X}`), `// eslint-disable-next-line <rule> -- <reason>`
  comments where a rule must be silenced (`no-console`, `no-param-reassign` on `screen.state`
  writes).
- Commit style: plain imperative subject, no conventional-commit prefixes (repo precedent: "Add
  persistence design spec", "Add GameAssets engine class").
- Run `npm run format` before each commit (prettier uses `experimentalTernaries: true`;
  hand-formatted ternaries will otherwise churn).
- Tests use vitest `describe`/`test` (not `it`), and the inner loop runs a single file via
  `npx vitest run tests/<file>.test.ts` (plain `npm test` runs the whole suite with coverage — use
  it in the final verification step of each task).

---

### Task 1: `PersistedStore` engine class

**Files:**

- Create: `source/engine/storage/PersistedStore.ts` (new `storage/` directory)
- Test: `tests/PersistedStore.test.ts`

**Interfaces:**

- Consumes: `zod` (`z.ZodType`), nothing else.
- Produces (Tasks 2 and 3 build on these exact signatures):
  - `type PersistedStoreOptions<T> = {key: string; schema: z.ZodType<T>; defaults: () => T; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined}`
  - `class PersistedStore<T>` with `constructor(options: PersistedStoreOptions<T>)`, `load(): T`,
    `save(value: T): void`, `clear(): void`

Behavioral contract (spec §1):

- `storage` defaults to `globalThis.localStorage`, resolved **per call**, not captured at
  construction (SSR-safe: in Node the global is undefined, so `load()` returns defaults and
  `save()`/`clear()` no-op). Accessing the global can itself throw in browser privacy modes — treat
  a throw as "no storage".
- `load()` hardened path, in order: storage absent → defaults; `getItem` throws → warn + defaults;
  `getItem` returns `null` → defaults with **no** warn (normal first run); `JSON.parse` throws →
  warn + defaults; schema rejects → warn + defaults. Exactly one `console.warn` per discarded
  payload, naming the key and reason. `load()` never throws and never caches.
- `defaults` is a factory: every failed load returns a fresh value.
- `save(value)`: `setItem(key, JSON.stringify(value))` in try/catch; failures swallowed with one
  warn.
- `clear()`: `removeItem` in try/catch; failures swallowed with one warn.

- [ ] **Step 1: Write the failing test**

Create `tests/PersistedStore.test.ts`:

```ts
import {describe, expect, test, vi} from 'vitest';
import {z} from 'zod';

import {PersistedStore} from '../source/engine/storage/PersistedStore.js';

const schema = z.object({count: z.number()});

type TestData = z.infer<typeof schema>;

// Map-backed fake storage (the AudioMixer `createContext` injection pattern):
// this suite never touches the real localStorage.
function createFakeStorage(seed: Record<string, string> = {}) {
  let map = new Map(Object.entries(seed));

  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function createStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  return new PersistedStore<TestData>({
    key: 'test:data',
    schema,
    defaults: () => ({count: 0}),
    storage,
  });
}

describe('PersistedStore', () => {
  test('a missing key returns defaults without warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let store = createStore(createFakeStorage());

    expect(store.load()).toEqual({count: 0});
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  test('corrupt JSON returns defaults with one warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let store = createStore(createFakeStorage({'test:data': '{not json'}));

    expect(store.load()).toEqual({count: 0});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('schema-rejected data returns defaults with one warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let store = createStore(createFakeStorage({'test:data': JSON.stringify({count: 'nope'})}));

    expect(store.load()).toEqual({count: 0});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('a throwing getItem returns defaults with one warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let store = new PersistedStore<TestData>({
      key: 'test:data',
      schema,
      defaults: () => ({count: 0}),
      storage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {},
        removeItem: () => {},
      },
    });

    expect(store.load()).toEqual({count: 0});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('save then load roundtrips a valid value', () => {
    let store = createStore(createFakeStorage());

    store.save({count: 42});

    expect(store.load()).toEqual({count: 42});
  });

  test('defaults is a factory: two failed loads return distinct objects', () => {
    let store = createStore(createFakeStorage());
    let first = store.load();
    let second = store.load();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  test('a throwing setItem (quota) is swallowed with one warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let store = new PersistedStore<TestData>({
      key: 'test:data',
      schema,
      defaults: () => ({count: 0}),
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      },
    });

    expect(() => {
      store.save({count: 1});
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('clear removes the key', () => {
    let storage = createFakeStorage({'test:data': JSON.stringify({count: 7})});
    let store = createStore(storage);

    store.clear();

    expect(storage.map.has('test:data')).toBeFalsy();
    expect(store.load()).toEqual({count: 0});
  });

  test('no storage option and no global: load defaults, save and clear no-op', () => {
    vi.stubGlobal('localStorage', undefined);

    let store = new PersistedStore<TestData>({
      key: 'test:data',
      schema,
      defaults: () => ({count: 0}),
    });

    expect(store.load()).toEqual({count: 0});
    expect(() => {
      store.save({count: 1});
      store.clear();
    }).not.toThrow();

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/PersistedStore.test.ts` Expected: FAIL — "Failed to resolve import" /
"Cannot find module" for `../source/engine/storage/PersistedStore.js` (the file does not exist yet).

- [ ] **Step 3: Implement `PersistedStore`**

Create `source/engine/storage/PersistedStore.ts`:

```ts
import {type z} from 'zod';

export type PersistedStoreOptions<T> = {
  // The exact localStorage key; one store owns one key.
  key: string;
  // Validates the stored value; any failure discards the payload.
  schema: z.ZodType<T>;
  // A factory, not a value: every failed load returns a fresh object, so
  // callers can never share (and mutate) one defaults instance.
  defaults: () => T;
  // Test seam (the AudioMixer `createContext` injection pattern). Defaults to
  // `globalThis.localStorage`, resolved per call — module-scope stores stay
  // SSR-safe in Node, where the global is undefined.
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
};

/**
 * A schema-validated localStorage wrapper: the one code path through which
 * anything is persisted. `load()` never throws — storage absence, unreadable
 * JSON and schema-rejected payloads all degrade to `defaults()` — and writes
 * are best-effort (quota/private-mode failures are swallowed with a warning).
 * The stored shape is the JSON-serialized value itself: no envelope, no
 * version field. The schema is the only gate — a breaking format change is
 * just a schema change, and old payloads fail validation and reset.
 */
export class PersistedStore<T> {
  readonly #key: string;
  readonly #schema: z.ZodType<T>;
  readonly #defaults: () => T;
  readonly #storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;

  constructor({key, schema, defaults, storage}: PersistedStoreOptions<T>) {
    this.#key = key;
    this.#schema = schema;
    this.#defaults = defaults;
    this.#storage = storage;
  }

  /** Never throws and never caches — each call re-reads storage. */
  load(): T {
    let storage = this.#resolveStorage();

    if (storage === undefined) {
      return this.#defaults();
    }

    let raw: string | null;

    try {
      raw = storage.getItem(this.#key);
    } catch (error) {
      this.#warnDiscard('read failed', error);

      return this.#defaults();
    }

    if (raw === null) {
      // A missing key is a normal first run, not corruption — no warning.
      return this.#defaults();
    }

    let value: unknown;

    try {
      value = JSON.parse(raw);
    } catch (error) {
      this.#warnDiscard('stored JSON is unreadable', error);

      return this.#defaults();
    }

    let result = this.#schema.safeParse(value);

    if (!result.success) {
      this.#warnDiscard('stored value failed schema validation', result.error);

      return this.#defaults();
    }

    return result.data;
  }

  save(value: T): void {
    let storage = this.#resolveStorage();

    if (storage === undefined) {
      return;
    }

    try {
      storage.setItem(this.#key, JSON.stringify(value));
    } catch (error) {
      // eslint-disable-next-line no-console -- persistence is best-effort: a quota or private-mode failure must never reach gameplay, but should stay debuggable
      console.warn(`PersistedStore "${this.#key}": write failed.`, error);
    }
  }

  clear(): void {
    let storage = this.#resolveStorage();

    if (storage === undefined) {
      return;
    }

    try {
      storage.removeItem(this.#key);
    } catch (error) {
      // eslint-disable-next-line no-console -- best-effort, like save()
      console.warn(`PersistedStore "${this.#key}": clear failed.`, error);
    }
  }

  #resolveStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
    if (this.#storage !== undefined) {
      return this.#storage;
    }

    // Accessing the global can itself throw (browser privacy modes); absent
    // or throwing both mean "no persistence this session". lib.dom types the
    // global as always-present, but in Node it is undefined at runtime.
    try {
      let global: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined =
        globalThis.localStorage;

      return global;
    } catch {
      return undefined;
    }
  }

  #warnDiscard(reason: string, error: unknown): void {
    // eslint-disable-next-line no-console -- corruption must be debuggable but never fatal: the warn is the only observable artifact of a failed load
    console.warn(`PersistedStore "${this.#key}": ${reason}; using defaults.`, error);
  }
}
```

Note: `import {type z} from 'zod'` is type-only on purpose — the class calls `schema.safeParse`
through the instance, so the engine file has no runtime zod import. If the type-only namespace
import trips typecheck for any reason, fall back to `import {z} from 'zod';` (the `tiled-tools`
precedent) — both are allowed by the spec ("the engine imports zod directly").

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/PersistedStore.test.ts` Expected: PASS — 9 tests.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test` Expected: all pass; no unrelated test breaks.

- [ ] **Step 6: Format and commit**

```bash
npm run format
git add source/engine/storage/PersistedStore.ts tests/PersistedStore.test.ts
git commit -m "Add PersistedStore, a schema-validated localStorage wrapper"
```

---

### Task 2: Settings persistence

**Files:**

- Modify: `source/game/settings.ts` (whole file — it is 8 lines today)
- Modify: `source/game/mainMenuScreen.ts` (two Options-modal write sites: `nameInput.onChange`
  around line 65, `soundToggle.onChange` around line 88)
- Test: `tests/settings.test.ts` (rewrite — the current file tests the in-memory-only object)

**Interfaces:**

- Consumes: `PersistedStore` from Task 1 (`new PersistedStore({key, schema, defaults})`, `.load()`,
  `.save(value)`).
- Produces: `settings` keeps its exact current shape (`{playerName: string; soundEnabled: boolean}`,
  a plain mutable object) — **no consumer changes anywhere else**; new export
  `saveSettings(): void`.

Context that makes this safe with zero other changes: `source/game/audio.ts:26` already applies the
setting at module load through the same setter the toggle uses
(`audio.setMuted('master', !settings.soundEnabled)`), and its comment says persistence "only has to
hydrate `settings` — zero mixer changes". Import order (`audio.ts` imports `settings.js`) guarantees
hydration happens first.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/settings.test.ts` with:

```ts
import {afterEach, describe, expect, test, vi} from 'vitest';

const SETTINGS_KEY = 'somewhere:settings';

// settings.ts hydrates at module load, so each test re-imports a fresh copy
// after seeding happy-dom's real localStorage.
async function importSettings() {
  vi.resetModules();

  return import('../source/game/settings.js');
}

afterEach(() => {
  localStorage.clear();
});

describe('settings', () => {
  test('defaults when nothing is stored', async () => {
    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', soundEnabled: true});
  });

  test('a seeded valid payload hydrates settings at module load', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 'Ada', soundEnabled: false}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: 'Ada', soundEnabled: false});
  });

  test('a schema-rejected payload resets to defaults with one warning', async () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 42}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', soundEnabled: true});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('saveSettings writes the current object', async () => {
    let {settings, saveSettings} = await importSettings();

    settings.playerName = 'Ada';
    settings.soundEnabled = false;
    saveSettings();

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '')).toEqual({
      playerName: 'Ada',
      soundEnabled: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/settings.test.ts` Expected: FAIL — the hydration test gets
`{playerName: '', soundEnabled: true}` despite the seeded payload, and the `saveSettings` test fails
because the export does not exist.

- [ ] **Step 3: Implement settings persistence**

Replace the entire contents of `source/game/settings.ts` with:

```ts
import {z} from 'zod';

import {PersistedStore} from '../engine/storage/PersistedStore.js';

const settingsStore = new PersistedStore({
  key: 'somewhere:settings',
  schema: z.object({playerName: z.string(), soundEnabled: z.boolean()}),
  defaults: () => ({playerName: '', soundEnabled: true}),
});

// Game settings: a plain mutable object, written directly by the Options UI
// and read where needed (no getter/setter ceremony). Hydrated from
// localStorage at module load; write sites call saveSettings() right after
// each mutation. A corrupt or schema-rejected payload silently resets to
// defaults — the schema is the only gate.
export const settings = settingsStore.load();

export function saveSettings(): void {
  settingsStore.save(settings);
}
```

- [ ] **Step 4: Wire the two Options-modal write sites**

In `source/game/mainMenuScreen.ts`, change the settings import (line 18) to:

```ts
import {saveSettings, settings} from './settings.js';
```

In `nameInput`'s `onChange` (currently `settings.playerName = input.value;` then the key sound), add
the save right after the mutation:

```ts
    onChange: (input) => {
      settings.playerName = input.value;
      saveSettings();
      audio.play(assets.sound('ui-key'), {bus: 'ui'});
    },
```

In `soundToggle`'s `onChange`, likewise (keep the existing mute-ordering comment where it is):

```ts
    onChange: (toggle) => {
      let enabled = toggle.isChecked;

      settings.soundEnabled = enabled;
      saveSettings();
      // Set mute first so an enabling toggle unmutes before its own click plays
      // (an audible confirmation); a disabling toggle mutes and stays silent.
      audio.setMuted('master', !enabled);
      audio.play(assets.sound('ui-click'), {bus: 'ui'});
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/settings.test.ts` Expected: PASS — 4 tests.

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test` Expected: all pass. (`tests/Game.test.ts` and
others transitively import `settings.js`; hydration from an empty happy-dom localStorage returns
defaults, so nothing observable changes for them.)

- [ ] **Step 7: Format and commit**

```bash
npm run format
git add source/game/settings.ts source/game/mainMenuScreen.ts tests/settings.test.ts
git commit -m "Persist settings to localStorage"
```

---

### Task 3: Save blob module

**Files:**

- Create: `source/game/save.ts`
- Test: `tests/save.test.ts`

**Interfaces:**

- Consumes: `PersistedStore` (Task 1); `playersQuery` (`source/game/playersQuery.ts` —
  `[PlayerComponent, MotionComponent]`, `.getFirst()` throws when empty); `MotionComponent`
  (`.position: Vector` with `.set(x, y)`).
- Produces (Task 4 and 5 call these exact names):
  - `type SaveData = {player: {x: number; y: number}}`
  - `loadSave(): SaveData | null` — null means "no (valid) save exists"; drives Continue visibility.
  - `writeSave(): void` — captures the player position; works on a paused world.
  - `stageContinue(): void` — stages `loadSave()`'s result in a module-level variable.
  - `clearStagedSave(): void` — drops the staged value.
  - `applyStagedSave(): void` — applies + consumes the stage; no-op without one.

No import cycle: `save.ts` imports only `playersQuery`, `MotionComponent`, `PersistedStore` and zod.
The screens import `save.ts`, never the reverse.

- [ ] **Step 1: Write the failing test**

Create `tests/save.test.ts`:

```ts
import {afterEach, describe, expect, test, vi} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {
  applyStagedSave,
  clearStagedSave,
  loadSave,
  stageContinue,
  writeSave,
} from '../source/game/save.js';

const SAVE_KEY = 'somewhere:save';

// playersQuery is a module singleton: every test must world.stop() so the next
// test can register it again. The player carries only PlayerComponent +
// MotionComponent — the query doesn't require GraphicsComponent, so no pixi
// assets are needed.
function createWorld(x: number, y: number) {
  let motion = new MotionComponent({position: new Vector(x, y), velocity: new Vector(0, 0)});
  let player = new Entity({components: [new PlayerComponent({name: 'Test'}), motion]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(playersQuery).addEntity(player);
    },
  });

  return {world, motion};
}

afterEach(() => {
  clearStagedSave();
  localStorage.clear();
});

describe('save', () => {
  test('writeSave writes the player position as a schema-valid payload', () => {
    let {world} = createWorld(42, 27);

    world.start();
    writeSave();
    world.stop();

    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '')).toEqual({player: {x: 42, y: 27}});
    expect(loadSave()).toEqual({player: {x: 42, y: 27}});
  });

  test('writeSave works on a paused world', () => {
    let {world} = createWorld(3, 4);

    world.start();
    world.pause();
    writeSave();
    world.stop();

    expect(loadSave()).toEqual({player: {x: 3, y: 4}});
  });

  test('loadSave returns null when nothing is stored', () => {
    expect(loadSave()).toBeNull();
  });

  test('loadSave returns null for a schema-rejected payload, with one warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 'nope', y: 0}}));

    expect(loadSave()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('stageContinue then applyStagedSave restores the position and consumes the stage', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 5, y: 6}}));
    stageContinue();

    let {world, motion} = createWorld(144, 160);

    world.start();
    applyStagedSave();

    expect(motion.position.x).toBe(5);
    expect(motion.position.y).toBe(6);

    // The stage was consumed: a second apply must not overwrite new movement.
    motion.position.set(50, 60);
    applyStagedSave();

    expect(motion.position.x).toBe(50);
    expect(motion.position.y).toBe(60);

    world.stop();
  });

  test('clearStagedSave prevents a later apply', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 5, y: 6}}));
    stageContinue();
    clearStagedSave();

    let {world, motion} = createWorld(144, 160);

    world.start();
    applyStagedSave();

    expect(motion.position.x).toBe(144);
    expect(motion.position.y).toBe(160);

    world.stop();
  });

  test('applyStagedSave without a stage is a no-op', () => {
    let {world, motion} = createWorld(144, 160);

    world.start();
    applyStagedSave();

    expect(motion.position.x).toBe(144);
    expect(motion.position.y).toBe(160);

    world.stop();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/save.test.ts` Expected: FAIL — "Failed to resolve import" for
`../source/game/save.js`.

- [ ] **Step 3: Implement the save module**

Create `source/game/save.ts`:

```ts
import {z} from 'zod';

import {PersistedStore} from '../engine/storage/PersistedStore.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';

// One bespoke save blob, extraction-and-apply: save reads a few values out of
// the live world; restore runs the normal New Game construction path and then
// applies them. The world is always built by code — this file only
// parameterizes it. Each new persisted fact (flags, inventory, current map)
// is a new schema field; an old save that fails the new schema simply resets.
const saveSchema = z.object({
  // Art px (the pixelScale transform lives on the root container), so a saved
  // position is device-independent across per-device pixel scales. A
  // hand-edited save can place the player out of bounds; accepted — zod 4
  // numbers are finite-only, the camera clamps to the map, and the worst case
  // is walking back out.
  player: z.object({x: z.number(), y: z.number()}),
});

export type SaveData = z.infer<typeof saveSchema>;

const saveStore = new PersistedStore<SaveData | null>({
  key: 'somewhere:save',
  schema: saveSchema.nullable(),
  // null = "no save exists" — drives the main menu's Continue visibility.
  defaults: () => null,
});

// The Continue hand-off: the menu stages the save before the screen swap and
// gameScreen.onShow applies it after world.start().
let stagedSave: SaveData | null = null;

/** The main menu's Continue check; null when no (valid) save exists. */
export function loadSave(): SaveData | null {
  return saveStore.load();
}

/** Captures the player's position into the save blob. Works on a paused world. */
export function writeSave(): void {
  let {position} = playersQuery.getFirst().getComponent(MotionComponent);

  saveStore.save({player: {x: position.x, y: position.y}});
}

/** Stages the stored save for the next gameScreen show (the Continue click). */
export function stageContinue(): void {
  stagedSave = loadSave();
}

/**
 * Drops the staged value (the New Game click): a failed Continue transition
 * must not leave a stale stage that a later New Game would wrongly apply.
 */
export function clearStagedSave(): void {
  stagedSave = null;
}

/**
 * Applies and consumes the staged save; a no-op without one. Called by
 * gameScreen.onShow directly after world.start() — addEntity outside an
 * update applies synchronously, so playersQuery is already populated. The
 * camera needs nothing: cameraSystem re-centers on the player every frame.
 */
export function applyStagedSave(): void {
  if (stagedSave === null) {
    return;
  }

  let {position} = playersQuery.getFirst().getComponent(MotionComponent);

  position.set(stagedSave.player.x, stagedSave.player.y);
  stagedSave = null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/save.test.ts` Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test` Expected: all pass.

- [ ] **Step 6: Format and commit**

```bash
npm run format
git add source/game/save.ts tests/save.test.ts
git commit -m "Add the save blob module"
```

---

### Task 4: Save triggers — auto-save on exit and tab-hide, manual Save in the pause menu

**Files:**

- Modify: `source/game/widgets.ts` (widen `CreateButtonOptions.label` to `string | Text`)
- Modify: `source/game/gameScreen.ts` (state type, `buildPauseModal`, `onShow`, `onHide`)

**Interfaces:**

- Consumes: `writeSave()`, `applyStagedSave()` from Task 3; existing
  `createButton`/`Text`/`teardownGameScreen`.
- Produces: `CreateButtonOptions.label: string | Text` (Task 5 does not need it, but the
  Options/menu buttons keep passing strings — the change is backward compatible).

No new unit tests in this task: the changes are screen wiring, and the suite deliberately has no
real-screen integration harness (that is why `pauseFlow.ts` exists as extracted testable functions —
see its header comment). The behavior is covered by Task 3's tests (capture/apply logic) plus Task
6's smoke test. Verification here is typecheck + lint + the full existing suite.

- [ ] **Step 1: Widen `createButton`'s label**

In `source/game/widgets.ts`, change the options type and the children construction:

```ts
export type CreateButtonOptions = {
  // A string gets the standard monogram-outline label; a prebuilt Text lets
  // the caller keep the reference (e.g. to flip the label as click feedback).
  label: string | Text;
  onClick: () => void;
  fontSize?: number;
  layout?: pixi.ContainerOptions['layout'];
};
```

and in `createButton`'s body replace the `children` array with:

```ts
    children: [
      typeof label === 'string' ?
        new Text({
          text: label,
          fontFamily: 'monogram-outline',
          fontSize,
          fill: 0xffffff,
          layout: true,
        })
      : label,
    ],
```

(Everything else — backgrounds, `pressOffset`, the click sound, layout — stays exactly as is.)

- [ ] **Step 2: Add the Save button to the pause modal**

In `source/game/gameScreen.ts`, extend the save-related imports:

```ts
import {applyStagedSave, writeSave} from './save.js';
```

(`Text` and `createButton` are already imported.)

In `buildPauseModal`, after `resumeButton` and before `quitButton`, add:

```ts
let saveLabel = new Text({
  text: 'Save',
  fontFamily: 'monogram-outline',
  fontSize: 12,
  fill: 0xffffff,
  layout: true,
});
let saveButton = createButton({
  label: saveLabel,
  onClick: () => {
    // Manual save under the pause modal: capture works on a paused world.
    writeSave();
    // Feedback on the kept reference (the hitCounter idiom); the modal is
    // rebuilt per open, so the label resets naturally.
    saveLabel.setText('Saved');
  },
});
```

and put it between Resume and Quit in the panel's children:

```ts
    children: [
      new Text({
        text: 'Paused',
        fontFamily: 'monogram-outline',
        fontSize: 12,
        fill: 0xffffff,
        layout: true,
      }),
      resumeButton,
      saveButton,
      quitButton,
    ],
```

- [ ] **Step 3: Apply the staged save and register the tab-hide auto-save in `onShow`**

Add `visibilityDisposables` to the state type (keep keys sorted):

```ts
type GameScreenState = {
  hitCounter: Text;
  nameLabel: Text;
  openModal: Modal | null;
  pauseButton: Button;
  visibilityDisposables: DisposableStack | null;
};
```

`onAdd`'s return becomes:

```ts
return {hitCounter, nameLabel, openModal: null, pauseButton, visibilityDisposables: null};
```

In `onShow`, add `applyStagedSave()` directly after `world.start()`:

```ts
  onShow: (screen) => {
    screen.addToView(world);
    input.attach(game.view);
    world.start();
    // Safe directly after start(): addEntity outside an update applies
    // synchronously, so playersQuery is already populated. A no-op without a
    // staged save (New Game).
    applyStagedSave();
```

and at the end of `onShow` (after the `audio.playMusic(...)` call), register the visibility listener
(a fresh `DisposableStack` per show — a disposed stack cannot be reused; the `AudioMixer.unlock`
pattern):

```ts
// Auto-save at the last reliable lifecycle moment on mobile: covers tab
// close, tab switch and app backgrounding. Firing while the pause modal
// is open is fine — capture works on a paused world.
let disposables = new DisposableStack();
let handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    writeSave();
  }
};

document.addEventListener('visibilitychange', handleVisibilityChange);
disposables.defer(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
// eslint-disable-next-line no-param-reassign -- needed
screen.state.visibilityDisposables = disposables;
```

- [ ] **Step 4: Auto-save on exit in `onHide`**

`onHide` becomes (the two new statements come **before** `teardownGameScreen` — `world.stop()`
resets the player pool, which resets the position):

```ts
  onHide: (screen) => {
    // Auto-save before teardown: the world must still be alive when the
    // position is captured. This one choke point covers Quit-to-menu and any
    // future path away from the screen.
    writeSave();
    screen.state.visibilityDisposables?.dispose();
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.visibilityDisposables = null;
    teardownGameScreen({
      world,
      modal: screen.state.openModal,
      detachWorld: () => {
        screen.removeFromView(world);
      },
    });
    input.detach();
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.openModal = null;
  },
```

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test` Expected: all pass (no behavioral change is
visible to the existing suite — no test constructs `gameScreen`).

- [ ] **Step 6: Format and commit**

```bash
npm run format
git add source/game/widgets.ts source/game/gameScreen.ts
git commit -m "Auto-save on exit and tab-hide, add manual Save to the pause menu"
```

---

### Task 5: Continue button on the main menu, New Game stage clearing

**Files:**

- Modify: `source/game/mainMenuScreen.ts` (state type, `onAdd`, `onShow`, New Game click handler)

**Interfaces:**

- Consumes: `loadSave()`, `stageContinue()`, `clearStagedSave()` from Task 3; `Panel.children` /
  `.addChild(...)` / `.removeChild(...)` (public API — `addChild` only appends); `createButton`
  (string label).
- Produces: nothing consumed by later tasks.

Design notes locked in by the spec and codebase:

- The menu UI is built once in `onAdd` and lives across shows, so Continue's presence is recomputed
  **per show** (quitting a run creates a save while the menu object exists).
- Continue sits above New Game (below the title). `Panel.addChild` only appends, so slotting
  Continue mid-panel is done by removing and re-appending the tail (`newGameButton`,
  `optionsButton`) — re-parenting pixi views is safe, nothing is destroyed.
- Removal from the panel also removes it from the focus order: the focus walk recurses through
  `children` arrays (`UiRoot.#collectFocusables`), and spatial navigation only considers collected
  components.
- No New Game overwrite confirmation this branch (deferred; the old save is simply overwritten by
  the next auto-save).

- [ ] **Step 1: Implement the menu changes**

In `source/game/mainMenuScreen.ts`, add imports (`Panel` is already imported as a value; `Button` is
new, type-only):

```ts
import {type Button} from '../engine/ui/Button.js';
```

```ts
import {clearStagedSave, loadSave, stageContinue} from './save.js';
```

Extend the state type (keys sorted):

```ts
type MainMenuScreenState = {
  bannerPanel: Panel;
  continueButton: Button;
  newGameButton: Button;
  openModal: Modal | null;
  optionsButton: Button;
};
```

In `onAdd`, after `title` and before `newGameButton`, create the Continue button:

```ts
let continueButton = createButton({
  label: 'Continue',
  onClick: () => {
    // Stage before the swap so gameScreen.onShow can apply it after
    // world.start(). showScreen rejects when a bundle load fails; the
    // game stays usable and the click can be retried.
    stageContinue();
    game.showScreen(gameScreen).catch((error: unknown) => {
      // eslint-disable-next-line no-console -- no error UI exists yet
      console.error(error);
    });
  },
});
```

Give New Game's click handler a leading `clearStagedSave()`:

```ts
let newGameButton = createButton({
  label: 'New Game',
  onClick: () => {
    // A stale stage from a failed Continue transition must never leak
    // into a fresh run.
    clearStagedSave();
    // showScreen rejects when a bundle load fails; the game stays usable
    // and the click can be retried.
    game.showScreen(gameScreen).catch((error: unknown) => {
      // eslint-disable-next-line no-console -- no error UI exists yet
      console.error(error);
    });
  },
});
```

The banner panel keeps its built-once children (Continue is attached per show):

```ts
let bannerPanel = new Panel({
  background: nineSlice('banner'),
  // Continue is added/removed per show according to whether a save
  // exists; see onShow.
  children: [title, newGameButton, optionsButton],
  layout: {
    padding: 8,
    alignItems: 'center',
    flexDirection: 'column',
    gap: 4,
  },
});

screen.ui.addChild(bannerPanel);

return {bannerPanel, continueButton, newGameButton, openModal: null, optionsButton};
```

Replace `onShow` (it currently only plays music and takes no parameter):

```ts
  onShow: (screen) => {
    // Recomputed per show: the menu object lives across shows, and quitting a
    // run creates a save while it is hidden.
    let {bannerPanel, continueButton, newGameButton, optionsButton} = screen.state;
    let hasSave = loadSave() !== null;
    let isContinueShown = bannerPanel.children.includes(continueButton);

    if (hasSave && !isContinueShown) {
      // Panel.addChild only appends, so re-add the tail to slot Continue
      // between the title and New Game.
      bannerPanel.removeChild(newGameButton, optionsButton);
      bannerPanel.addChild(continueButton, newGameButton, optionsButton);
    } else if (!hasSave && isContinueShown) {
      // Dropping it from the panel also drops it from the focus order.
      bannerPanel.removeChild(continueButton);
    }

    // Music is driven by direct mixer calls from the screen context (never the
    // world, never auto-stopped by pause). playMusic replaces the current voice.
    audio.playMusic(assets.sound('menu-music'));
  },
```

- [ ] **Step 2: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test` Expected: all pass.

- [ ] **Step 3: Format and commit**

```bash
npm run format
git add source/game/mainMenuScreen.ts
git commit -m "Add Continue to the main menu"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full clean verification**

Run: `npm run typecheck && npm run lint && npm test` Expected: everything passes; the coverage
summary includes `source/engine/storage/PersistedStore.ts`, `source/game/save.ts` and
`source/game/settings.ts`.

- [ ] **Step 2: Manual smoke test in the running app**

Run: `npm run develop` and open `http://localhost:5000` (drive it with the Playwright tools if
available, otherwise ask your human partner to click through). Verify, in order:

1. Fresh profile (devtools → Application → clear localStorage): main menu shows **no** Continue
   button.
2. Options → type a name, toggle Sound off → reload the page → Options shows the same name and the
   toggle off; no sound plays.
3. New Game → walk somewhere → Pause → **Save** → the button label flips to `Saved`.
   `localStorage['somewhere:save']` holds `{"player":{"x":…,"y":…}}`.
4. Quit to menu → **Continue** now appears above New Game → click it → the player is where they were
   saved (camera centered on them).
5. Back in the menu (Quit again), devtools: `localStorage.setItem('somewhere:save', 'garbage')` →
   re-enter the menu is not possible without a reload, so reload → exactly one `console.warn` naming
   `somewhere:save` appears when the menu checks the save, and Continue is hidden.
6. New Game with an existing save starts at the spawn point (no staged apply), and quitting
   overwrites the old save.
7. In-game, switch to another tab and back → `somewhere:save` was rewritten (tab-hide auto-save).

Expected: all seven hold. If any fails, use superpowers:systematic-debugging before touching code.

- [ ] **Step 3: Final commit (only if fixes were needed)**

If the smoke test forced changes, re-run Step 1, then commit them with a subject describing the
actual fix.
