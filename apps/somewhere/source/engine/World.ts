import * as pixi from 'pixi.js';

import {areComponentsSame} from '../utilities/areComponentsSame.js';
import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type EntityQuery} from './EntityQuery.js';
import {type System} from './System.js';

export class World {
  #isUpdating = false;

  readonly view: pixi.Container = new pixi.Container();

  readonly entities: Entity[] = [];
  readonly systems: System[] = [];

  private readonly entitiesToBeAdded: Entity[] = [];
  private readonly entitiesToBeDeleted: Entity[] = [];

  constructor() {}

  // TODO: the same type after `extends` is also used in `System`; create some type alias?
  addSystem<
    T extends readonly [...rest: ReadonlyArray<Constructor<Component>>],
    U extends Record<string, EntityQuery>,
  >(system: System<T, U>) {
    this.systems.push(system as unknown as System);

    for (let entity of this.entities) {
      for (let entityQuery of Object.values(system.entityQueries)) {
        if (!entityQuery.entities.includes(entity) && areComponentsSame(entityQuery, entity)) {
          entityQuery.addEntity(entity);
        }
      }

      if (!system.entities.includes(entity) && areComponentsSame(system, entity)) {
        system.addEntity(entity);
      }
    }

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

      for (let system of this.systems) {
        for (let entityQuery of Object.values(system.entityQueries)) {
          if (!entityQuery.entities.includes(entity) && areComponentsSame(entityQuery, entity)) {
            entityQuery.addEntity(entity);
          }
        }

        if (!system.entities.includes(entity) && areComponentsSame(system, entity)) {
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

      for (let system of this.systems) {
        for (let entityQuery of Object.values(system.entityQueries)) {
          if (areComponentsSame(entityQuery, entity)) {
            entityQuery.removeEntity(entity);
          }
        }

        if (areComponentsSame(system, entity)) {
          system.removeEntity(entity);
        }
      }
    }

    return entity;
  }

  update(delta: number) {
    this.#isUpdating = true;

    for (let system of this.systems) {
      system.update(delta);
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
