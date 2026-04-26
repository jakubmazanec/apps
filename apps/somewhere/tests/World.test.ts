import {describe, expect, test} from 'vitest';

import {defineComponent} from '../source/engine/Component.js';
import {Entity} from '../source/engine/Entity.js';
import {EntityQuery} from '../source/engine/EntityQuery.js';
import {System} from '../source/engine/System.js';
import {World} from '../source/engine/World.js';

const FooComponent = defineComponent<{value: number}>();

describe('World', () => {
  test('addEntity adds the entity to a shared EntityQuery exactly once', () => {
    let world = new World();
    let sharedQuery = new EntityQuery({world, components: [FooComponent]});
    let systemA = new System({
      world,
      components: [],
      entityQueries: {shared: sharedQuery},
    });
    let systemB = new System({
      world,
      components: [],
      entityQueries: {shared: sharedQuery},
    });
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    world.addSystem(systemA).addSystem(systemB);
    world.addEntity(entity);

    expect(sharedQuery.entities.filter((each) => each === entity)).toHaveLength(1);
  });

  test('removeEntity does not throw when an EntityQuery is shared across systems', () => {
    let world = new World();
    let sharedQuery = new EntityQuery({world, components: [FooComponent]});
    let systemA = new System({
      world,
      components: [],
      entityQueries: {shared: sharedQuery},
    });
    let systemB = new System({
      world,
      components: [],
      entityQueries: {shared: sharedQuery},
    });
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    world.addSystem(systemA).addSystem(systemB);
    world.addEntity(entity);

    expect(sharedQuery.entities).toContain(entity);
    expect(() => {
      world.removeEntity(entity);
    }).not.toThrow();
    expect(sharedQuery.entities).not.toContain(entity);
    expect(world.entities).not.toContain(entity);
  });
});
