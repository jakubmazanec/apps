import * as pixi from 'pixi.js';

import {areComponentsSame} from '../utilities/areComponentsSame.js';
import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type EntityQuery} from './EntityQuery.js';
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

  private readonly entitiesToBeAdded: Entity[] = [];
  private readonly entitiesToBeDeleted: Entity[] = [];

  private readonly onStart?: (world: World) => void;
  private readonly onStop?: (world: World) => void;

  constructor({onStart, onStop}: WorldOptions = {}) {
    if (onStart !== undefined) {
      this.onStart = onStart;
    }

    if (onStop !== undefined) {
      this.onStop = onStop;
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
    this.onStart?.(this);
  }

  stop() {
    if (!this.#isRunning) {
      throw new Error('World is not running!');
    }

    if (this.#isUpdating) {
      throw new Error('Cannot stop the world during an update!');
    }

    this.onStop?.(this);

    for (let i = this.entities.length - 1; i >= 0; i--) {
      let entity = this.entities[i];

      if (entity !== undefined) {
        this.removeEntity(entity);
      }
    }

    for (let i = this.systems.length - 1; i >= 0; i--) {
      let system = this.systems[i];

      if (system !== undefined) {
        this.removeSystem(system);
      }
    }

    for (let i = this.entityQueries.length - 1; i >= 0; i--) {
      let entityQuery = this.entityQueries[i];

      if (entityQuery !== undefined) {
        this.removeEntityQuery(entityQuery);
      }
    }

    this.entitiesToBeAdded.length = 0;
    this.entitiesToBeDeleted.length = 0;

    this.#isRunning = false;
  }

  addSystem<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]>(
    system: System<T>,
  ) {
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

  addEntity(entity: Entity) {
    if (this.#isUpdating) {
      this.entitiesToBeAdded.push(entity);
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
      this.entitiesToBeDeleted.push(entity);
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

    this.#isUpdating = false;

    while (this.entitiesToBeAdded.length) {
      this.addEntity(this.entitiesToBeAdded.shift() as Entity); // the type assertions is ok, because we checked `this.entitiesToBeAdded.length`
    }

    while (this.entitiesToBeDeleted.length) {
      this.removeEntity(this.entitiesToBeDeleted.shift() as Entity); // the type assertions is ok, because we checked `this.entitiesToBeDeleted.length`
    }
  }
}
