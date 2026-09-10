import {type z} from 'zod';

import {type PersistedStoreOptions} from './PersistedStoreOptions';

/**
 * A schema-validated localStorage wrapper: the one code path through which
 * anything is persisted. `load()` never throws — storage absence, unreadable
 * JSON and a missing key all reach the schema as `undefined`, and a payload
 * the schema rejects is recovered by the schema's own defaults — and writes
 * are best-effort (quota/private-mode failures are swallowed with a warning).
 * The stored shape is the JSON-serialized value itself: no envelope, no
 * version field. The schema is the only gate, and it decides alone what a
 * mismatch costs: a stale field, or the whole blob. A schema whose own
 * prefault does not validate is the one way through: that ZodError is a
 * caller bug, and surfacing it beats returning a value the schema rejects.
 */
export class PersistedStore<T> {
  /** TBD */
  readonly #key: string;

  /** TBD */
  readonly #schema: z.ZodCatch<z.ZodPrefault<z.ZodType<T>>>;

  constructor({key, schema}: PersistedStoreOptions<T>) {
    this.#key = key;
    // Totality is the store's guarantee rather than the caller's: zod never
    // validates a catch value, so a caller-supplied catch could hand back a
    // value that violates its own schema. Pinning the fallback to the
    // schema's prefault runs it through the parser like any stored payload.
    this.#schema = schema.catch(() => schema.parse(undefined));
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
    return this.#schema.parse(this.#read());
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
   * The stored payload, or `undefined` when there is nothing to parse — which
   * is the input the schema turns into its defaults.
   */
  #read(): unknown {
    let storage = this.#resolveStorage();

    if (storage === undefined) {
      return undefined;
    }

    try {
      let raw = storage.getItem(this.#key);

      // A missing key is a normal first run, not corruption — no warning.
      return raw === null ? undefined : JSON.parse(raw);
    } catch (error) {
      this.#warnDiscard('stored value is unreadable', error);

      return undefined;
    }
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
