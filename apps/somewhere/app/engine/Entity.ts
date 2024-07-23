import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';

export type EntityOptions<T extends readonly [...rest: readonly Component[]]> = {
  components: T;
};

export class Entity<
  const T extends readonly [...rest: readonly Component[]] = readonly [
    ...rest: readonly Component[],
  ],
> {
  // TODO: make it work with `ReadonlyMap`
  // private readonly components: ReadonlyMap<typeof Component, Component> = new Map();
  private readonly components: Map<typeof Component, Component> = new Map();

  constructor({components}: EntityOptions<T>) {
    for (let component of components) {
      this.components.set(component.constructor as typeof Component, component);
    }
  }

  hasComponent<U extends T[number]>(ComponentConstructor: Constructor<U>): boolean {
    return this.components.has(ComponentConstructor);
  }

  getComponent<U extends T[number] | Component>(
    ComponentConstructor: Constructor<U>,
  ): U extends T[number] ? U : U | undefined {
    return this.components.get(ComponentConstructor) as U extends T[number] ? U : U | undefined;
  }
}
