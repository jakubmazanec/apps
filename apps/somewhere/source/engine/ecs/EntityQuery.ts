import {type Constructor} from '../../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type World} from './World.js';

export type EntityQueryOptions<
  T extends readonly [...rest: ReadonlyArray<Constructor<Component>>],
> = {
  components: T;

  displayName?: string | undefined;
};

export class EntityQuery<
  const T extends readonly [...rest: ReadonlyArray<Constructor<Component>>] = readonly [
    ...rest: ReadonlyArray<Constructor<Component>>,
  ],
> {
  /** TBD */
  readonly components: T;

  /** TBD */
  displayName: string;

  /** TBD */
  readonly entities: Array<Entity<readonly [InstanceType<T[number]>]>> = [];

  /** TBD */
  #world: World | null = null;

  constructor({components, displayName}: EntityQueryOptions<T>) {
    this.components = components;

    if (displayName === undefined) {
      this.displayName = EntityQuery.name;
    } else {
      this.displayName = displayName;
    }
  }

  /** TBD */
  get world(): World {
    if (!this.#world) {
      throw new Error('Entity query is not attached to a world!');
    }

    return this.#world;
  }

  /** @internal Use `world.addEntity()` instead. Called by `World` to sync entities. */
  addEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    if (this.entities.includes(entity)) {
      throw new Error('Entity was already added to the entity query!');
    }

    this.entities.push(entity);
  }

  /** @internal Called by `World`. */
  attach(world: World) {
    if (this.#world) {
      throw new Error('Entity query is already attached to a world!');
    }

    this.#world = world;
  }

  /** @internal Called by `World`. */
  detach() {
    if (!this.#world) {
      throw new Error('Entity query is not attached to a world!');
    }

    this.#world = null;
  }

  /** TBD */
  getFirst() {
    let [entity] = this.entities;

    if (!entity) {
      throw new Error('No entity found!');
    }

    return entity;
  }

  /** @internal Use `world.removeEntity()` instead. Called by `World` to sync entities. */
  removeEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    let index = this.entities.indexOf(entity);

    if (index < 0) {
      throw new Error("Entity wasn't found!");
    }

    this.entities.splice(index, 1);
  }
}
