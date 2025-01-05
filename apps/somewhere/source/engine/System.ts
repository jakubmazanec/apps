import type * as pixi from 'pixi.js';

import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type EntityQuery} from './EntityQuery.js';
import {type World} from './World.js';

export type SystemOptions<
  T extends readonly [...rest: ReadonlyArray<Constructor<Component>>],
  U extends Record<string, EntityQuery>,
> = {
  world: World;
  components: T;
  entityQueries?: U | undefined;
  onInit?: ((system: System<T, U>) => void) | undefined;
  onUpdate?: ((delta: number, system: System<T, U>) => void) | undefined;
  onAddEntity?:
    | ((entity: Entity<readonly [InstanceType<T[number]>]>, system: System<T, U>) => void)
    | undefined;
  onRemoveEntity?:
    | ((entity: Entity<readonly [InstanceType<T[number]>]>, system: System<T, U>) => void)
    | undefined;

  displayName?: string | undefined;
};

export class System<
  const T extends readonly [...rest: ReadonlyArray<Constructor<Component>>] = readonly [
    ...rest: ReadonlyArray<Constructor<Component>>,
  ],
  const U extends Readonly<Record<string, EntityQuery>> = Readonly<Record<string, EntityQuery>>,
> {
  readonly view: pixi.Container;
  readonly world: World;
  readonly components: T; // components are for querying entities that this system will modify
  readonly entities: Array<Entity<readonly [InstanceType<T[number]>]>> = [];
  readonly entityQueries: U; // entity queries are for querying entities that this system will only read, not modify

  private readonly onUpdate?: (delta: number, system: System<T, U>) => void;
  private readonly onAddEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T, U>,
  ) => void;
  private readonly onRemoveEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T, U>,
  ) => void;

  displayName: string;

  constructor({
    world,
    components,
    entityQueries,
    onInit,
    onUpdate,
    onAddEntity,
    onRemoveEntity,
    displayName,
  }: SystemOptions<T, U>) {
    this.view = world.view;
    this.world = world;
    this.components = components;

    if (entityQueries === undefined) {
      this.entityQueries = {} as unknown as U;
    } else {
      this.entityQueries = entityQueries;
    }

    if (onUpdate !== undefined) {
      this.onUpdate = onUpdate;
    }

    if (onAddEntity !== undefined) {
      this.onAddEntity = onAddEntity;
    }

    if (onRemoveEntity !== undefined) {
      this.onRemoveEntity = onRemoveEntity;
    }

    if (displayName === undefined) {
      this.displayName = System.name;
    } else {
      this.displayName = displayName;
    }

    onInit?.(this);
  }

  update(delta: number) {
    this.onUpdate?.(delta, this);
  }

  addEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    if (this.entities.includes(entity)) {
      throw new Error('Entity was already added to the system!');
    }

    this.entities.push(entity);
    this.onAddEntity?.(entity, this);
  }

  removeEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    let index = this.entities.indexOf(entity);

    if (index < 0) {
      throw new Error("Entity wasn't found!");
    }

    this.entities.splice(index, 1);
    this.onRemoveEntity?.(entity, this);
  }

  getFirst() {
    let [entity] = this.entities;

    if (!entity) {
      throw new Error('No entity found!');
    }

    return entity;
  }
}
