import * as pixi from 'pixi.js';

import {areComponentsSame} from '../../utilities/areComponentsSame.js';
import {type Constructor} from '../../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type EntityQuery} from './EntityQuery.js';
import {type Event} from './Event.js';
import {type EventChannel} from './EventChannel.js';
import {type System} from './System.js';

export type WorldOptions = {
  onStart?: ((world: World) => void) | undefined;
  onStop?: ((world: World) => void) | undefined;
};

export class World {
  #isUpdating = false;
  #isRunning = false;

  readonly view: pixi.Container = new pixi.Container();

  readonly entities: Entity[] = [];
  readonly systems: System[] = [];
  readonly entityQueries: EntityQuery[] = [];
  readonly eventChannels: EventChannel[] = [];

  readonly #pendingChanges: Array<{entity: Entity; isRemoval: boolean}> = [];

  readonly #onStart?: (world: World) => void;
  readonly #onStop?: (world: World) => void;

  constructor({onStart, onStop}: WorldOptions = {}) {
    if (onStart !== undefined) {
      this.#onStart = onStart;
    }

    if (onStop !== undefined) {
      this.#onStop = onStop;
    }
  }

  get isRunning(): boolean {
    return this.#isRunning;
  }

  start() {
    if (this.#isRunning) {
      throw new Error('World is already running!');
    }

    this.#isRunning = true;
    this.#onStart?.(this);
  }

  stop() {
    if (!this.#isRunning) {
      throw new Error('World is not running!');
    }

    if (this.#isUpdating) {
      throw new Error('Cannot stop the world during an update!');
    }

    this.#onStop?.(this);

    // systems are removed before entities so each `onRemove` sees the same state as a standalone
    // `removeSystem`: world still populated, the system already drained (see `System.unsetWorld`)
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

    this.#pendingChanges.length = 0;

    this.#isRunning = false;
  }

  addSystem<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    system: System<T>,
  ) {
    if (this.#isUpdating) {
      throw new Error('Cannot add a system during an update!');
    }

    if (this.systems.includes(system as unknown as System)) {
      throw new Error('System was already added to the world!');
    }

    this.systems.push(system as unknown as System);
    system.setWorld(this);

    for (let entity of this.entities) {
      if (areComponentsSame(system as unknown as System, entity)) {
        system.addEntity(entity);
      }
    }

    return this;
  }

  removeSystem<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    system: System<T>,
  ) {
    if (this.#isUpdating) {
      throw new Error('Cannot remove a system during an update!');
    }

    let index = this.systems.indexOf(system as unknown as System);

    if (index < 0) {
      throw new Error("System wasn't found!");
    }

    for (let i = system.entities.length - 1; i >= 0; i--) {
      let entity = system.entities[i];

      if (entity !== undefined) {
        system.removeEntity(entity);
      }
    }

    this.systems.splice(index, 1);
    system.unsetWorld();

    return this;
  }

  addEntityQuery<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    entityQuery: EntityQuery<T>,
  ) {
    if (this.#isUpdating) {
      throw new Error('Cannot add an entity query during an update!');
    }

    if (this.entityQueries.includes(entityQuery as unknown as EntityQuery)) {
      throw new Error('Entity query was already added to the world!');
    }

    this.entityQueries.push(entityQuery as unknown as EntityQuery);
    entityQuery.setWorld(this);

    for (let entity of this.entities) {
      if (areComponentsSame(entityQuery, entity)) {
        entityQuery.addEntity(entity);
      }
    }

    return this;
  }

  removeEntityQuery<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    entityQuery: EntityQuery<T>,
  ) {
    if (this.#isUpdating) {
      throw new Error('Cannot remove an entity query during an update!');
    }

    let index = this.entityQueries.indexOf(entityQuery as unknown as EntityQuery);

    if (index < 0) {
      throw new Error("Entity query wasn't found!");
    }

    for (let i = entityQuery.entities.length - 1; i >= 0; i--) {
      let entity = entityQuery.entities[i];

      if (entity !== undefined) {
        entityQuery.removeEntity(entity);
      }
    }

    this.entityQueries.splice(index, 1);
    entityQuery.unsetWorld();

    return this;
  }

  addEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
    if (this.#isUpdating) {
      throw new Error('Cannot add an event channel during an update!');
    }

    if (this.eventChannels.includes(channel as unknown as EventChannel)) {
      throw new Error('Event channel was already added to the world!');
    }

    this.eventChannels.push(channel as unknown as EventChannel);

    return this;
  }

  removeEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
    if (this.#isUpdating) {
      throw new Error('Cannot remove an event channel during an update!');
    }

    let index = this.eventChannels.indexOf(channel as unknown as EventChannel);

    if (index < 0) {
      throw new Error("Event channel wasn't found!");
    }

    (channel as unknown as EventChannel).clear();
    this.eventChannels.splice(index, 1);

    return this;
  }

  addEntity(entity: Entity) {
    if (this.#isUpdating) {
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

  removeEntity(entity: Entity) {
    if (this.#isUpdating) {
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

  update(ticker: pixi.Ticker) {
    this.#isUpdating = true;

    for (let system of this.systems) {
      system.update(ticker);
    }

    // Clear the updating flag before flushing the deferred queues: addEntity/removeEntity
    // must now take their synchronous path and actually apply. While this stayed `true`,
    // a system that added or removed an entity during its own onUpdate re-queued it forever
    // here — an infinite loop.
    this.#isUpdating = false;

    while (this.#pendingChanges.length > 0) {
      // the type assertion is ok, because we checked `this.#pendingChanges.length`
      let {entity, isRemoval} = this.#pendingChanges.shift() as {
        entity: Entity;
        isRemoval: boolean;
      };

      if (isRemoval) {
        // Tolerate repeats: two systems may remove the same entity in one frame.
        if (this.entities.includes(entity)) {
          this.removeEntity(entity);
        }
      } else {
        this.addEntity(entity);
      }
    }

    for (let channel of this.eventChannels) {
      channel.swap();
    }
  }
}
