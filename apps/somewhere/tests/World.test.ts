import {describe, expect, test} from 'vitest';

import {defineComponent} from '../source/engine/Component.js';
import {Entity} from '../source/engine/Entity.js';
import {EntityQuery} from '../source/engine/EntityQuery.js';
import {System} from '../source/engine/System.js';
import {World} from '../source/engine/World.js';

const FooComponent = defineComponent<{value: number}>();

describe('World', () => {
  test('addEntity adds the entity to a registered EntityQuery exactly once', () => {
    let world = new World();
    let sharedQuery = new EntityQuery({components: [FooComponent]});
    let systemA = new System({components: []});
    let systemB = new System({components: []});
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    world.addSystem(systemA).addSystem(systemB);
    world.addEntityQuery(sharedQuery);
    world.addEntity(entity);

    expect(sharedQuery.entities.filter((each) => each === entity)).toHaveLength(1);
  });

  test('removeEntity removes the entity from a registered EntityQuery without throwing', () => {
    let world = new World();
    let sharedQuery = new EntityQuery({components: [FooComponent]});
    let systemA = new System({components: []});
    let systemB = new System({components: []});
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    world.addSystem(systemA).addSystem(systemB);
    world.addEntityQuery(sharedQuery);
    world.addEntity(entity);

    expect(sharedQuery.entities).toContain(entity);
    expect(() => {
      world.removeEntity(entity);
    }).not.toThrow();
    expect(sharedQuery.entities).not.toContain(entity);
    expect(world.entities).not.toContain(entity);
  });

  test('addSystem throws when the same System is added twice', () => {
    let world = new World();
    let system = new System({components: []});

    world.addSystem(system);

    expect(() => {
      world.addSystem(system);
    }).toThrow('System was already added to the world!');
    expect(world.systems).toHaveLength(1);
  });

  test('addEntityQuery throws when the same EntityQuery is added twice', () => {
    let world = new World();
    let entityQuery = new EntityQuery({components: [FooComponent]});

    world.addEntityQuery(entityQuery);

    expect(() => {
      world.addEntityQuery(entityQuery);
    }).toThrow('Entity query was already added to the world!');
    expect(world.entityQueries).toHaveLength(1);
  });

  test('addEntityQuery picks up entities already in the world', () => {
    let world = new World();
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    world.addEntity(entity);

    let entityQuery = new EntityQuery({components: [FooComponent]});
    world.addEntityQuery(entityQuery);

    expect(entityQuery.entities).toContain(entity);
  });
});
