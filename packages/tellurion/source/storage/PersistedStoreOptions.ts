import {type z} from 'zod';

export type PersistedStoreOptions<T> = {
  /** Local sotrage key. */
  key: string;

  /** The schema, carrying its own defaults. */
  schema: z.ZodPrefault<z.ZodType<T>>;
};
