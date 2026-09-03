import * as pixi from 'pixi.js';

import {areComponentsSame} from '../utilities/areComponentsSame.js';
import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type EntityQuery} from './EntityQuery.js';
import {type Event} from './Event.js';
import {type EventChannel} from './EventChannel.js';
import {type System} from './System.js';
import {type WorldState} from './WorldState.js';

export type WorldOptions = {
  onStart?: ((world: World) => void) | undefined;
  onStop?: ((world: World) => void) | undefined;
};

/** Owns and hadles entities, entity queries, event channels and systems. */
export class World {
  /** Entities. */
  readonly entities: Entity[] = [];

  /** Entity queries. */
  readonly entityQueries: EntityQuery[] = [];

  /** Event channels. */
  readonly eventChannels: EventChannel[] = [];

  /** Systems. */
  readonly systems: System[] = [];

  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Lifecycle hook called when world is started. */
  readonly #onStart?: (world: World) => void;

  /** Lifecycle hook called when world is stopped. */
  readonly #onStop?: (world: World) => void;

  /** Pending changes to the entities that happened during a tick, to be applied after. */
  readonly #pendingChanges: Array<{entity: Entity; isRemoval: boolean}> = [];

  /** State; which part of its life cycle the instance is currently in. */
  #state: WorldState = 'stopped';

  constructor({onStart, onStop}: WorldOptions = {}) {
    if (onStart !== undefined) {
      this.#onStart = onStart;
    }

    if (onStop !== undefined) {
      this.#onStop = onStop;
    }
  }

  /** Is the world paused? */
  get isPaused(): boolean {
    return this.#state === 'paused';
  }

  /** Is the world started, i.e. not stopped? */
  get isRunning(): boolean {
    return this.#state !== 'stopped';
  }

  /** Adds an entity; during an update it is queued until the tick ends. */
  addEntity(entity: Entity) {
    if (this.#state === 'updating') {
      this.#pendingChanges.push({entity, isRemoval: false});
    } else {
      if (this.entities.includes(entity)) {
        throw new Error('Entity was already added to the world!');
      }

      this.entities.push(entity);

      for (let entityQuery of this.entityQueries) {
        if (areComponentsSame(entityQuery, entity)) {
          entityQuery.addEntity(entity);
        }
      }

      for (let system of this.systems) {
        if (areComponentsSame(system, entity)) {
          system.addEntity(entity);
        }
      }
    }

    return this;
  }

  /** Adds an entity query and fills it with the matching entities. */
  addEntityQuery<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    entityQuery: EntityQuery<T>,
  ) {
    if (this.#state === 'updating') {
      throw new Error('Cannot add an entity query during an update!');
    }

    if (this.#state === 'stopping') {
      throw new Error('Cannot add an entity query while the world is stopping!');
    }

    if (this.entityQueries.includes(entityQuery)) {
      throw new Error('Entity query was already added to the world!');
    }

    this.entityQueries.push(entityQuery);
    entityQuery.attach(this);

    for (let entity of this.entities) {
      if (areComponentsSame(entityQuery, entity)) {
        entityQuery.addEntity(entity);
      }
    }

    return this;
  }

  /** Adds an event channel. */
  addEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
    if (this.#state === 'updating') {
      throw new Error('Cannot add an event channel during an update!');
    }

    if (this.#state === 'stopping') {
      throw new Error('Cannot add an event channel while the world is stopping!');
    }

    if (this.eventChannels.includes(channel)) {
      throw new Error('Event channel was already added to the world!');
    }

    this.eventChannels.push(channel);
    (channel as unknown as EventChannel).attach(this);

    return this;
  }

  /** Adds a system and fills it with the matching entities. */
  addSystem<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    system: System<T>,
  ) {
    if (this.#state === 'updating') {
      throw new Error('Cannot add a system during an update!');
    }

    // The systems loop runs first in stop(), so a system appended here lands past its
    // descending cursor and survives the teardown, with its world reference still set.
    // source/game/core/world.ts re-adds module-level singletons on every start(), so a survivor
    // either makes the next start() throw or silently prepends a stale system to a
    // load-bearing update order. Entities, queries and channels added from a teardown hook
    // are cleaned up by the loops that run afterwards, which is why only topology is
    // guarded here.
    if (this.#state === 'stopping') {
      throw new Error('Cannot add a system while the world is stopping!');
    }

    if (this.systems.includes(system as unknown as System)) {
      throw new Error('System was already added to the world!');
    }

    this.systems.push(system as unknown as System);
    system.attach(this);

    for (let entity of this.entities) {
      if (areComponentsSame(system as unknown as System, entity)) {
        system.addEntity(entity);
      }
    }

    return this;
  }

  /** Pauses the world. */
  pause() {
    // Checked before the running test so an already-paused world keeps its own message.
    if (this.#state === 'paused') {
      throw new Error('World is already paused!');
    }

    if (this.#state !== 'running') {
      throw new Error('World is not running!');
    }

    this.#state = 'paused';
  }

  /** Removes an entity; during an update it is queued until the tick ends. */
  removeEntity(entity: Entity) {
    if (this.#state === 'updating') {
      this.#pendingChanges.push({entity, isRemoval: true});
    } else {
      let index = this.entities.indexOf(entity);

      if (index < 0) {
        throw new Error("Entity wasn't found!");
      }

      this.entities.splice(index, 1);

      for (let entityQuery of this.entityQueries) {
        if (entityQuery.entities.includes(entity)) {
          entityQuery.removeEntity(entity);
        }
      }

      for (let system of this.systems) {
        if (system.entities.includes(entity)) {
          system.removeEntity(entity);
        }
      }
    }

    return entity;
  }

  /** Removes an entity query. */
  removeEntityQuery<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    entityQuery: EntityQuery<T>,
  ) {
    if (this.#state === 'updating') {
      throw new Error('Cannot remove an entity query during an update!');
    }

    let index = this.entityQueries.indexOf(entityQuery);

    if (index < 0) {
      throw new Error("Entity query wasn't found!");
    }

    // Same order as `removeSystem`: out of the registry first, then drained. No hook can
    // reenter here today (EntityQuery fires none), but the two methods stay identical.
    this.entityQueries.splice(index, 1);

    for (let i = entityQuery.entities.length - 1; i >= 0; i--) {
      let entity = entityQuery.entities[i];

      if (entity !== undefined) {
        entityQuery.removeEntity(entity);
      }
    }

    entityQuery.detach();

    return this;
  }

  /** Removes an event channel. */
  removeEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
    if (this.#state === 'updating') {
      throw new Error('Cannot remove an event channel during an update!');
    }

    let index = this.eventChannels.indexOf(channel);

    if (index < 0) {
      throw new Error("Event channel wasn't found!");
    }

    (channel as unknown as EventChannel).clear();
    (channel as unknown as EventChannel).detach();
    this.eventChannels.splice(index, 1);

    return this;
  }

  /** Removes a system. */
  removeSystem<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    system: System<T>,
  ) {
    if (this.#state === 'updating') {
      throw new Error('Cannot remove a system during an update!');
    }

    let index = this.systems.indexOf(system as unknown as System);

    if (index < 0) {
      throw new Error("System wasn't found!");
    }

    // The system leaves `this.systems` before its drain, not after. While it is still
    // registered, an `onRemoveEntity` hook that calls `world.addEntity` would push the new
    // entity straight back into the array this loop is walking downwards, so the system
    // would keep a reference to it forever and `onDetach` would see a non-empty `entities`.
    // Splicing first also keeps `index` valid: a hook that removes another system shifts
    // `this.systems` under us, and the old order spliced with a stale index.
    this.systems.splice(index, 1);

    for (let i = system.entities.length - 1; i >= 0; i--) {
      let entity = system.entities[i];

      if (entity !== undefined) {
        system.removeEntity(entity);
      }
    }

    system.detach();

    return this;
  }

  /** Resumes the paused world. */
  resume() {
    if (this.#state !== 'paused') {
      throw new Error('World is not paused!');
    }

    this.#state = 'running';
  }

  /** Starts the world. */
  start() {
    if (this.#state !== 'stopped') {
      throw new Error('World is already running!');
    }

    // The state is set first so `#onStart` runs inside a running world, which is what
    // registration hooks expect, and rolled back if it throws: without the rollback a
    // world whose spawn failed stayed "running" forever, so every later start() threw
    // 'World is already running!' and the screen owning it could never recover.
    this.#state = 'running';

    try {
      this.#onStart?.(this);
    } catch (error) {
      this.#state = 'stopped';

      throw error;
    }
  }

  /** Stops the world and removes everything from it. */
  stop() {
    if (this.#state === 'stopped') {
      throw new Error('World is not running!');
    }

    if (this.#state === 'updating') {
      throw new Error('Cannot stop the world during an update!');
    }

    if (this.#state === 'stopping') {
      throw new Error('Cannot stop the world while it is stopping!');
    }

    this.#state = 'stopping';

    try {
      // Runs inside the `stopping` window, so a nested stop() called from this hook is
      // rejected like any other teardown-hook reentry. The world is still fully populated
      // here: the four drain loops below haven't run yet.
      this.#onStop?.(this);

      // systems are removed before entities so each `onDetach` sees the same state as a standalone
      // `removeSystem`: world still populated, the system already drained (see `System.detach`)
      for (let i = this.systems.length - 1; i >= 0; i--) {
        let system = this.systems[i];

        if (system !== undefined) {
          this.removeSystem(system);
        }
      }

      for (let i = this.entities.length - 1; i >= 0; i--) {
        let entity = this.entities[i];

        if (entity !== undefined) {
          this.removeEntity(entity);
        }
      }

      for (let i = this.entityQueries.length - 1; i >= 0; i--) {
        let entityQuery = this.entityQueries[i];

        if (entityQuery !== undefined) {
          this.removeEntityQuery(entityQuery);
        }
      }

      for (let i = this.eventChannels.length - 1; i >= 0; i--) {
        let channel = this.eventChannels[i];

        if (channel !== undefined) {
          this.removeEventChannel(channel);
        }
      }
    } finally {
      this.#pendingChanges.length = 0;
      this.#state = 'stopped';
    }
  }

  /** @internal Called by game's ticker on each tick. */
  update(ticker: pixi.Ticker) {
    if (this.#state !== 'running') {
      return;
    }

    this.#state = 'updating';

    try {
      for (let system of this.systems) {
        system.update(ticker);
      }
    } finally {
      this.#state = 'running';
    }

    // Only after update is done, we can add or remove entities.
    while (this.#pendingChanges.length > 0) {
      // The type assertion is ok, because we checked `this.#pendingChanges.length`.
      let {entity, isRemoval} = this.#pendingChanges.shift() as {
        entity: Entity;
        isRemoval: boolean;
      };

      if (isRemoval) {
        if (this.entities.includes(entity)) {
          this.removeEntity(entity);
        }
      } else if (!this.entities.includes(entity)) {
        this.addEntity(entity);
      }
    }

    for (let channel of this.eventChannels) {
      channel.swap();
    }
  }
}
