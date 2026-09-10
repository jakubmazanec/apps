import {afterEach, describe, expect, test, vitest} from 'vitest';
import {z} from 'zod';

import {PersistedStore} from '../source/engine/storage/PersistedStore.js';

const schema = z.object({count: z.number().default(0).catch(0)}).prefault({});

type TestData = z.infer<typeof schema>;

// Map-backed fake installed as the global, the way the AudioMixer suite stubs
// AudioContext: this suite never touches a real localStorage.
function stubStorage(seed: Record<string, string> = {}) {
  let map = new Map(Object.entries(seed));

  vitest.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  });

  return map;
}

function createStore() {
  return new PersistedStore<TestData>({key: 'test:data', schema});
}

describe(PersistedStore, () => {
  afterEach(() => {
    vitest.unstubAllGlobals();
  });

  test('a missing key returns defaults without warning', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    stubStorage();

    let store = createStore();

    expect(store.load()).toEqual({count: 0});
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  test('corrupt JSON returns defaults with one warning', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
    stubStorage({'test:data': '{not json'});

    let store = createStore();

    expect(store.load()).toEqual({count: 0});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test("a schema-rejected value is the schema's problem: recovered, not warned about", () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
    stubStorage({'test:data': JSON.stringify({count: 'nope'})});

    let store = createStore();

    expect(store.load()).toEqual({count: 0});
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  test('a payload missing a field keeps the fields it does have', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
    stubStorage({'test:data': JSON.stringify({count: 7, gone: true})});

    let store = new PersistedStore({
      key: 'test:data',
      schema: z
        .object({count: z.number().default(0).catch(0), added: z.string().default('new')})
        .prefault({}),
    });

    expect(store.load()).toEqual({count: 7, added: 'new'});
  });

  test('a throwing getItem returns defaults with one warning', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    vitest.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    });

    let store = createStore();

    expect(store.load()).toEqual({count: 0});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('save then load roundtrips a valid value', () => {
    stubStorage();

    let store = createStore();

    store.save({count: 42});

    expect(store.load()).toEqual({count: 42});
  });

  test('the schema default is rebuilt per load: distinct objects, nested included', () => {
    stubStorage();

    // Nested, because that is where a `.default(literal)` schema would leak a
    // shared instance: zod only shallow-clones a default, while a prefault is
    // re-parsed into a fresh object graph.
    let store = new PersistedStore({
      key: 'test:data',
      schema: z
        .object({volumes: z.object({master: z.number().default(1).catch(1)}).prefault({})})
        .prefault({}),
    });
    let first = store.load();
    let second = store.load();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.volumes).not.toBe(second.volumes);

    first.volumes.master = 0.5;

    expect(store.load().volumes.master).toBe(1);
  });

  test('a throwing setItem (quota) is swallowed with one warning', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    vitest.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });

    let store = createStore();

    expect(() => {
      store.save({count: 1});
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('clear removes the key', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
    let map = stubStorage({'test:data': JSON.stringify({count: 7})});
    let store = createStore();

    store.clear();

    expect(map.has('test:data')).toBe(false);
    expect(store.load()).toEqual({count: 0});
  });

  test('no global storage: load defaults, save and clear no-op', () => {
    vitest.stubGlobal('localStorage', undefined);

    let store = createStore();

    expect(store.load()).toEqual({count: 0});
    expect(() => {
      store.save({count: 1});
      store.clear();
    }).not.toThrow();
  });
});
