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
    this.#schema = schema.catch(() => schema.parse(undefined));
  }

  /** TBD */
  clear(): void {
    try {
      globalThis.localStorage.removeItem(this.#key);
    } catch (error) {
      // eslint-disable-next-line no-console -- best-effort, like save()
      console.warn(`PersistedStore "${this.#key}": clear failed.`, error);
    }
  }

  /** TBD */
  load(): T {
    let raw: unknown;

    try {
      let stored = globalThis.localStorage.getItem(this.#key);

      if (stored) {
        raw = JSON.parse(stored);
      }
    } catch (error: unknown) {
      console.warn(
        `PersistedStore "${this.#key}": stored value is unreadable; using defaults.`,
        error,
      );

      raw = undefined;
    }

    return this.#schema.parse(raw);
  }

  /** TBD */
  save(value: T): void {
    try {
      globalThis.localStorage.setItem(this.#key, JSON.stringify(value));
    } catch (error) {
      // eslint-disable-next-line no-console -- persistence is best-effort: a quota or private-mode failure must never reach gameplay, but should stay debuggable
      console.warn(`PersistedStore "${this.#key}": write failed.`, error);
    }
  }
}
