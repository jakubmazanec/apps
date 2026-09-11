import {type z} from 'zod';

import {type PersistedStoreOptions} from './PersistedStoreOptions';

/** A schema-validated localStorage wrapper. */
export class PersistedStore<T> {
  /** Local sotrage key. */
  readonly #key: string;

  /** Schema. */
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

  /** TBD */
  load(): T {
    let storage = this.#resolveStorage();
    // The stored payload, or `undefined` when there is nothing to parse —
    // which is the input the schema turns into its defaults.
    let raw: unknown;

    if (storage === undefined) {
      raw = undefined;
    } else {
      try {
        let stored = storage.getItem(this.#key);

        // A missing key is a normal first run, not corruption — no warning.
        raw = stored === null ? undefined : JSON.parse(stored);
      } catch (error) {
        // eslint-disable-next-line no-console -- corruption must be debuggable but never fatal: the warn is the only observable artifact of a failed load
        console.warn(
          `PersistedStore "${this.#key}": stored value is unreadable; using defaults.`,
          error,
        );

        raw = undefined;
      }
    }

    return this.#schema.parse(raw);
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
}
