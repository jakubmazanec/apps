import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type World} from './World.js';

export type EntityQueryOptions<
  T extends readonly [...rest: ReadonlyArray<Constructor<Component>>],
> = {
  world: World;
  components: T;

  displayName?: string | undefined;
};

export class EntityQuery<
  const T extends readonly [...rest: ReadonlyArray<Constructor<Component>>] = readonly [
    ...rest: ReadonlyArray<Constructor<Component>>,
  ],
> {
  readonly world: World;
  readonly components: T;
  readonly entities: Array<Entity<readonly [InstanceType<T[number]>]>> = [];

  displayName: string;

  constructor({world, components, displayName}: EntityQueryOptions<T>) {
    this.world = world;
    this.components = components;

    if (displayName === undefined) {
      this.displayName = EntityQuery.name;
    } else {
      this.displayName = displayName;
    }
  }

  addEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    if (this.entities.includes(entity)) {
      throw new Error('Entity was already added to the system!');
    }

    this.entities.push(entity);
  }

  removeEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    let index = this.entities.indexOf(entity);

    if (index < 0) {
      throw new Error("Entity wasn't found!");
    }

    this.entities.splice(index, 1);
  }

  getFirst() {
    let [entity] = this.entities;

    if (!entity) {
      throw new Error('No entity found!');
    }

    return entity;
  }
}
