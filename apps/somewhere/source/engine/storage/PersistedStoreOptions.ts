import {type z} from 'zod';

export type PersistedStoreOptions<T> = {
  /** Local sotrage key. */
  key: string;

  /** Schema used for validation. */
  schema: z.ZodType<T>;
  // A factory, not a value: every failed load returns a fresh object, so
  // callers can never share (and mutate) one defaults instance.
  defaults: () => T;
};
