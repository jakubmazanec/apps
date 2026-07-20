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
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function createStore(storage: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>) {
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
    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
    let store = createStore(createFakeStorage({'test:data': '{not json'}));

    expect(store.load()).toEqual({count: 0});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('schema-rejected data returns defaults with one warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
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
    // eslint-disable-next-line @typescript-eslint/naming-convention -- test key intentionally uses namespace:key pattern
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
