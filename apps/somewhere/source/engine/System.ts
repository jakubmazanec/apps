import type * as pixi from 'pixi.js';

import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type World} from './World.js';

export type SystemOptions<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]> = {
  components: T;
  onAdd?: ((system: System<T>) => void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, system: System<T>) => void) | undefined;
  onAddEntity?:
    | ((entity: Entity<readonly [InstanceType<T[number]>]>, system: System<T>) => void)
    | undefined;
  onRemoveEntity?:
    | ((entity: Entity<readonly [InstanceType<T[number]>]>, system: System<T>) => void)
    | undefined;

  displayName?: string | undefined;
};

export class System<
  const T extends readonly [...rest: ReadonlyArray<Constructor<Component>>] = readonly [
    ...rest: ReadonlyArray<Constructor<Component>>,
  ],
> {
  #world: World | null = null;

  readonly components: T;
  readonly entities: Array<Entity<readonly [InstanceType<T[number]>]>> = [];

  private readonly onAdd?: (system: System<T>) => void;
  private readonly onUpdate?: (ticker: pixi.Ticker, system: System<T>) => void;
  private readonly onAddEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
  ) => void;

  private readonly onRemoveEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
  ) => void;

  displayName: string;

  constructor({
    components,
    onAdd,
    onUpdate,
    onAddEntity,
    onRemoveEntity,
    displayName,
  }: SystemOptions<T>) {
    this.components = components;

    if (onAdd !== undefined) {
      this.onAdd = onAdd;
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
  }

  get world(): World {
    if (!this.#world) {
      throw new Error('World is not set on the system!');
    }

    return this.#world;
  }

  get view(): pixi.Container {
    return this.world.view;
  }

  setWorld(world: World) {
    if (this.#world) {
      throw new Error('World is already set on the system!');
    }

    this.#world = world;
    this.onAdd?.(this);
  }

  update(ticker: pixi.Ticker) {
    this.onUpdate?.(ticker, this);
  }

  /** @internal Use `world.addEntity()` instead. Called by `World` to sync entities. */
  addEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    if (this.entities.includes(entity)) {
      throw new Error('Entity was already added to the system!');
    }

    this.entities.push(entity);
    this.onAddEntity?.(entity, this);
  }

  /** @internal Use `world.removeEntity()` instead. Called by `World` to sync entities. */
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
