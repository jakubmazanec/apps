import {type z} from 'zod';

export type PersistedStoreOptions<T> = {
  /** Local sotrage key. */
  key: string;

  /** Schema used for validation. */
  schema: z.ZodType<T>;
  // A factory, not a value: every failed load returns a fresh object, so
  // callers can never share (and mutate) one defaults instance.
  defaults: () => T;
  // Test seam (the AudioMixer `createContext` injection pattern). Defaults to
  // `globalThis.localStorage`, resolved per call — module-scope stores stay
  // SSR-safe in Node, where the global is undefined.
  storage?: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined;
};
