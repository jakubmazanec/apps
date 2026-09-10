import {type z} from 'zod';

import {type PersistedStoreOptions} from './PersistedStoreOptions';

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
  /** TBD */
  readonly #key: string;

  /** TBD */
  readonly #schema: z.ZodDefault<z.ZodType<T>> | z.ZodPrefault<z.ZodType<T>>;

  constructor({key, schema}: PersistedStoreOptions<T>) {
    this.#key = key;
    this.#schema = schema;
  }

  /** TBD */
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

  /** TBD */
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

  /**
   * The schema's own default, rebuilt on every call: a fresh object graph the
   * caller is free to mutate. The option type demands a defaulted schema, so
   * this cannot throw.
   */
  #defaults(): T {
    return this.#schema.parse(undefined);
  }

  /** TBD */
  #resolveStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | undefined {
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

  /** TBD */
  #warnDiscard(reason: string, error: unknown): void {
    // eslint-disable-next-line no-console -- corruption must be debuggable but never fatal: the warn is the only observable artifact of a failed load
    console.warn(`PersistedStore "${this.#key}": ${reason}; using defaults.`, error);
  }
}
