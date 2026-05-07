import type * as pixi from 'pixi.js';

import {type Constructor} from '../../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type World} from './World.js';

export type SystemOptions<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]> = {
  components: T;
  onAdd?: ((system: System<T>, world: World) => void) | undefined;
  onRemove?: ((system: System<T>, world: World) => void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, system: System<T>, world: World) => void) | undefined;
  onAddEntity?:
    | ((
        entity: Entity<readonly [InstanceType<T[number]>]>,
        system: System<T>,
        world: World,
      ) => void)
    | undefined;
  onRemoveEntity?:
    | ((
        entity: Entity<readonly [InstanceType<T[number]>]>,
        system: System<T>,
        world: World,
      ) => void)
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

  private readonly onAdd?: (system: System<T>, world: World) => void;
  private readonly onRemove?: (system: System<T>, world: World) => void;
  private readonly onUpdate?: (ticker: pixi.Ticker, system: System<T>, world: World) => void;
  private readonly onAddEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
    world: World,
  ) => void;

  private readonly onRemoveEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
    world: World,
  ) => void;

  displayName: string;

  constructor({
    components,
    onAdd,
    onRemove,
    onUpdate,
    onAddEntity,
    onRemoveEntity,
    displayName,
  }: SystemOptions<T>) {
    this.components = components;

    if (onAdd !== undefined) {
      this.onAdd = onAdd;
    }

    if (onRemove !== undefined) {
      this.onRemove = onRemove;
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
    if (!this.#world) {
      throw new Error('World is not set on the system!');
    }

    return this.#world.view;
  }

  /** @internal Called by `World`. */
  setWorld(world: World) {
    if (this.#world) {
      throw new Error('World is already set on the system!');
    }

    this.#world = world;
    this.onAdd?.(this, this.#world);
  }

  /** @internal Called by `World`. */
  unsetWorld() {
    if (!this.#world) {
      throw new Error('World is not set on the system!');
    }

    // events "hug" the state of the thing they belong to, i.e. starting events run after something is done, and ending events run before something is done
    this.onRemove?.(this, this.#world);
    this.#world = null;
  }

  /** @internal Called by `World`. */
  update(ticker: pixi.Ticker) {
    this.onUpdate?.(ticker, this, this.world);
  }

  /** @internal Use `world.addEntity()` instead. Called by `World` to sync entities. */
  addEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    if (this.entities.includes(entity)) {
      throw new Error('Entity was already added to the system!');
    }

    this.entities.push(entity);
    this.onAddEntity?.(entity, this, this.world);
  }

  /** @internal Use `world.removeEntity()` instead. Called by `World` to sync entities. */
  removeEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    let index = this.entities.indexOf(entity);

    if (index < 0) {
      throw new Error("Entity wasn't found!");
    }

    this.entities.splice(index, 1);
    this.onRemoveEntity?.(entity, this, this.world);
  }

  getFirst() {
    let [entity] = this.entities;

    if (!entity) {
      throw new Error('No entity found!');
    }

    return entity;
  }
}
