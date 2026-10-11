import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type EntityOptions} from './EntityOptions.js';

/** A game object made of components. */
export class Entity<
  const T extends readonly [...rest: readonly Component[]] = readonly [
    ...rest: readonly Component[],
  ],
> {
  /** Map of components and their classes. */
  readonly #components: ReadonlyMap<typeof Component, Component> = new Map();

  constructor({components}: EntityOptions<T>) {
    for (let component of components) {
      (this.#components as Map<typeof Component, Component>).set(
        component.constructor as typeof Component,
        component,
      );
    }
  }

  /** Returns the component of the given class. */
  getComponent<U extends Component | T[number]>(
    ComponentConstructor: Constructor<U>,
  ): U extends T[number] ? U : U | undefined {
    return this.#components.get(ComponentConstructor) as U extends T[number] ? U : U | undefined;
  }

  /** Does the entity have a component of the given class? */
  hasComponent<U extends T[number]>(ComponentConstructor: Constructor<U>): boolean {
    return this.#components.has(ComponentConstructor);
  }
}
