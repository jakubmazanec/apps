export type ObjectPoolOptions<T extends object, A extends unknown[]> = {
  onCreate: () => T;
  onReset: (object: T, ...rest: A) => T;
  onDestroy?: (object: T) => void;
  initialSize?: number;
};

export class ObjectPool<T extends object, A extends unknown[]> {
  /** TBD */
  readonly #objects: T[] = [];

  /** Lifecycle hook called when a new object is needed to be created. */
  readonly #onCreate: () => T;

  /** Lifecycle hook called when an object is released back to the pool. */
  readonly #onDestroy?: (object: T) => void;

  /** Lifecycle hook called when an object is handed out, to reset it. */
  readonly #onReset: (object: T, ...rest: A) => T;

  constructor({onCreate, onReset, onDestroy, initialSize}: ObjectPoolOptions<T, A>) {
    this.#onCreate = onCreate;
    this.#onReset = onReset;

    if (onDestroy !== undefined) {
      this.#onDestroy = onDestroy;
    }

    if (initialSize !== undefined) {
      for (let i = 0; i < initialSize; i++) {
        this.#objects.push(this.#onCreate());
      }
    }
  }

  /** TBD */
  create(...rest: A) {
    let object = this.#objects.pop();

    if (object) {
      object = this.#onReset(object, ...rest);
    } else {
      object = this.#onReset(this.#onCreate(), ...rest);
    }

    return object;
  }

  /** Destroys the instance. */
  destroy(object: T) {
    if (import.meta.env.DEV && this.#objects.includes(object)) {
      throw new Error('Object was already destroyed!');
    }

    this.#onDestroy?.(object);

    this.#objects.push(object);

    return this;
  }

  /** TBD */
  getSize() {
    return this.#objects.length;
  }
}
