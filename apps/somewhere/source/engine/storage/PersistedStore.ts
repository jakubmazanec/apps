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
  storage?: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined;
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
  readonly #storage: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined;

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

  #resolveStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined {
    if (this.#storage !== undefined) {
      return this.#storage;
    }

    // Accessing the global can itself throw (browser privacy modes); absent
    // or throwing both mean "no persistence this session". lib.dom types the
    // global as always-present, but in Node it is undefined at runtime.
    try {
      let global: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined =
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
