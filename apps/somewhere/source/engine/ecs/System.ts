import type * as pixi from 'pixi.js';

import {type Constructor} from '../../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type SystemOptions} from './SystemOptions.js';
import {type World} from './World.js';

export class System<
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
  readonly #onAddEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
    world: World,
  ) => void;

  /** TBD */
  readonly #onAttach?: (system: System<T>, world: World) => void;

  /** TBD */
  readonly #onDetach?: (system: System<T>, world: World) => void;

  /** TBD */
  readonly #onRemoveEntity?: (
    entity: Entity<readonly [InstanceType<T[number]>]>,
    system: System<T>,
    world: World,
  ) => void;

  /** TBD */
  readonly #onUpdate?: (ticker: pixi.Ticker, system: System<T>, world: World) => void;

  /** TBD */
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

  /** TBD */
  get view(): pixi.Container {
    if (!this.#world) {
      throw new Error('System is not attached to a world!');
    }

    return this.#world.view;
  }

  /** TBD */
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
    // symmetric with `detach`: `onAttach` fires with `world.entities` populated but `system.entities` not yet synced in
    this.#onAttach?.(this, this.#world);
  }

  /** @internal Called by `World`. */
  detach() {
    if (!this.#world) {
      throw new Error('System is not attached to a world!');
    }

    // events "hug" the state of the thing they belong to, i.e. starting events run after something is done, and ending events run before something is done
    // concretely `onDetach` fires with the world still attached and `world.entities` populated, but `system.entities` already drained — per-entity teardown belongs in `onRemoveEntity`. `World.stop` removes systems before entities so this holds there too, matching a standalone `removeSystem`. (M1)
    try {
      this.#onDetach?.(this, this.#world);
    } finally {
      // In the finally so a throwing `onDetach` still releases `#world`: otherwise the
      // system would believe itself attached forever, and re-adding it (e.g. a module-level
      // singleton re-added on the next `start()`) would throw 'System is already attached
      // to a world!' for the rest of the process.
      this.#world = null;
    }
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
    this.#onRemoveEntity?.(entity, this, this.world);
  }

  /** @internal Called by `World`. */
  update(ticker: pixi.Ticker) {
    this.#onUpdate?.(ticker, this, this.world);
  }
}
