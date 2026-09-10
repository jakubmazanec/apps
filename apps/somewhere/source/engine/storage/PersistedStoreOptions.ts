import {type z} from 'zod';

export type PersistedStoreOptions<T> = {
  /** Local sotrage key. */
  key: string;

  /**
   * Schema used for validation; its own default is what every failed load
   * falls back to. Prefer `.prefault(value)` over `.default(value)`: prefault
   * re-parses the value, so each fallback is a freshly built object graph
   * (and the literal itself is validated), while `.default()` short-circuits
   * and only shallow-clones — callers would share, and mutate, one nested
   * defaults instance.
   */
  schema: z.ZodDefault<z.ZodType<T>> | z.ZodPrefault<z.ZodType<T>>;
};
