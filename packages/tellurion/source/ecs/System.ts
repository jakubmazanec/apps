import type * as pixi from 'pixi.js';

import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type SystemOptions} from './SystemOptions.js';
import {type World} from './World.js';

/** Runs logic on entities that have specified components. */
export class System<
  const T extends readonly [...rest: ReadonlyArray<Constructor<Component>>] = readonly [
    ...rest: ReadonlyArray<Constructor<Component>>,
  ],
> {
  /** Component classes an entity must have to match. */
  readonly components: T;

  /** Name for debugging purposes. */
  displayName: string;

  /** Matching entities. */
  readonly entities: Array<Entity<readonly [InstanceType<T[number]>]>> = [];

  /** Lifecycle hook called when an entity is added to the system. */
  readonly #onAddEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
    world: World,
  ) => void;

  /** Lifecycle hook called when system is attached. */
  readonly #onAttach?: (system: System<T>, world: World) => void;

  /** Lifecycle hook called when system is detached. */
  readonly #onDetach?: (system: System<T>, world: World) => void;

  /** Lifecycle hook called when an entity is removed from the system. */
  readonly #onRemoveEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
    world: World,
  ) => void;

  /** Lifecycle hook called on each tick. */
  readonly #onUpdate?: (ticker: pixi.Ticker, system: System<T>, world: World) => void;

  /** World the query is attached to. */
  #world: World | null = null;

  constructor({
    components,
    onAttach,
    onDetach,
    onUpdate,
    onAddEntity,
    onRemoveEntity,
    displayName = System.name,
  }: SystemOptions<T>) {
    this.components = components;

    if (onAttach !== undefined) {
      this.#onAttach = onAttach;
    }

    if (onDetach !== undefined) {
      this.#onDetach = onDetach;
    }

    if (onUpdate !== undefined) {
      this.#onUpdate = onUpdate;
    }

    if (onAddEntity !== undefined) {
      this.#onAddEntity = onAddEntity;
    }

    if (onRemoveEntity !== undefined) {
      this.#onRemoveEntity = onRemoveEntity;
    }

    this.displayName = displayName;
  }

  /** View of the attached world. */
  get view(): pixi.Container {
    if (!this.#world) {
      throw new Error('System is not attached to a world!');
    }

    return this.#world.view;
  }

  /** World the query is attached to. */
  get world(): World {
    if (!this.#world) {
      throw new Error('System is not attached to a world!');
    }

    return this.#world;
  }

  /** @internal Use `world.addEntity()` instead. Called by `World` to sync entities. */
  addEntity(entity: Entity<readonly [InstanceType<T[number]>]>) {
    if (this.entities.includes(entity)) {
      throw new Error('Entity was already added to the system!');
    }

    this.entities.push(entity);
    this.#onAddEntity?.(entity, this, this.world);
  }

  /** @internal Called by `World`. */
  attach(world: World) {
    if (this.#world) {
      throw new Error('System is already attached to a world!');
    }

    this.#world = world;

    this.#onAttach?.(this, this.#world);
  }

  /** @internal Called by `World`. */
  detach() {
    if (!this.#world) {
      throw new Error('System is not attached to a world!');
    }

    try {
      this.#onDetach?.(this, this.#world);
    } finally {
      this.#world = null;
    }
  }

  /** Returns the first matching entity. */
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
    this.#onRemoveEntity?.(entity, this, this.world);
  }

  /** @internal Called by `World` on each tick. */
  update(ticker: pixi.Ticker) {
    this.#onUpdate?.(ticker, this, this.world);
  }
}
