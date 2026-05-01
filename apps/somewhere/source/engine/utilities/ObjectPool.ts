export type ObjectPoolOptions<T extends object, A extends unknown[]> = {
  onCreate: () => T;
  onReset: (object: T, ...rest: A) => T;
  onDestroy?: (object: T) => void;
  initialSize?: number;
};

export class ObjectPool<P extends unknown[], T extends object = object> {
  protected readonly objects: T[] = [];

  private readonly onCreate: () => T;
  private readonly onReset: (object: T, ...rest: P) => T;
  private readonly onDestroy?: (object: T) => void;

  constructor({onCreate, onReset, onDestroy, initialSize}: ObjectPoolOptions<T, P>) {
    this.onCreate = onCreate;
    this.onReset = onReset;

    if (onDestroy !== undefined) {
      this.onDestroy = onDestroy;
    }

    if (initialSize !== undefined) {
      for (let i = 0; i < initialSize; i++) {
        this.objects.push(this.onCreate());
      }
    }
  }

  getSize() {
    return this.objects.length;
  }

  create(...rest: P) {
    let object = this.objects.pop();

    if (object) {
      object = this.onReset(object, ...rest);
    } else {
      object = this.onReset(this.onCreate(), ...rest);
    }

    return object;
  }

  destroy(object: T) {
    this.onDestroy?.(object);

    this.objects.push(object);

    return this;
  }
}
