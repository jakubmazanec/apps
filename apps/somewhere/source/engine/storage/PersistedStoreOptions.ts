import {type z} from 'zod';

export type PersistedStoreOptions<T> = {
  /** Local sotrage key. */
  key: string;

  /**
   * The schema, carrying its own defaults, with `.prefault()` outermost. A
   * prefault is re-parsed rather than short-circuited, so the fallback is
   * validated by the same rules as stored data and is a fresh object graph on
   * every load; `.default()` would only shallow-clone, and callers would
   * share, and mutate, one nested instance. Totality is not asked of the
   * caller — the store adds the catch that sends a rejected payload here, so
   * no fallback can reach a caller unvalidated. What a mismatch costs is
   * still the schema's call: per-field `.default()` fills in a key the
   * payload is missing, per-field `.catch()` replaces a value that is present
   * but invalid, and whatever is left unhandled resets the whole blob.
   */
  schema: z.ZodPrefault<z.ZodType<T>>;
};
