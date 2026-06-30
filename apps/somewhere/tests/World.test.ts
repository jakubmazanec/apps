import {describe, expect, test} from 'vitest';

import {defineComponent} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {EntityQuery} from '../source/engine/ecs/EntityQuery.js';
import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {System} from '../source/engine/ecs/System.js';
import {World} from '../source/engine/ecs/World.js';

const FooComponent = defineComponent<{value: number}>();
const BarEvent = defineEvent<{value: number}>();

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

  test('EntityQuery.addEntity throws an entity-query-specific message when the same entity is added twice (L1)', () => {
    let entityQuery = new EntityQuery({components: [FooComponent]});
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    entityQuery.addEntity(entity);

    expect(() => {
      entityQuery.addEntity(entity);
    }).toThrow('Entity was already added to the entity query!');
  });

  test('removeSystem removes the system from the world', () => {
    let world = new World();
    let system = new System({components: []});

    world.addSystem(system);
    world.removeSystem(system);

    expect(world.systems).not.toContain(system);
    expect(world.systems).toHaveLength(0);
  });

  test("removeSystem throws when the System wasn't added", () => {
    let world = new World();
    let system = new System({components: []});

    expect(() => {
      world.removeSystem(system);
    }).toThrow("System wasn't found!");
  });

  test('removeSystem fires onRemove with system and world', () => {
    let world = new World();
    let receivedSystem: System<readonly []> | null = null;
    let receivedWorld: World | null = null;
    let system = new System({
      components: [],
      onRemove: (s, w) => {
        receivedSystem = s;
        receivedWorld = w;
      },
    });

    world.addSystem(system);
    world.removeSystem(system);

    expect(receivedSystem).toBe(system);
    expect(receivedWorld).toBe(world);
  });

  test('removeSystem fires onRemoveEntity for each tracked entity', () => {
    let world = new World();
    let removed: Entity[] = [];
    let system = new System({
      components: [FooComponent],
      onRemoveEntity: (entity) => {
        removed.push(entity);
      },
    });
    let entity1 = new Entity({components: [new FooComponent({value: 1})]});
    let entity2 = new Entity({components: [new FooComponent({value: 2})]});

    world.addEntity(entity1);
    world.addEntity(entity2);
    world.addSystem(system);
    world.removeSystem(system);

    expect(removed).toHaveLength(2);
    expect(removed).toContain(entity1);
    expect(removed).toContain(entity2);
    expect(system.entities).toHaveLength(0);
  });

  test('removeSystem allows the system to be re-added', () => {
    let world = new World();
    let system = new System({components: []});

    world.addSystem(system);
    world.removeSystem(system);

    expect(() => {
      world.addSystem(system);
    }).not.toThrow();
    expect(world.systems).toContain(system);
  });

  test('removeSystem returns the world for chaining', () => {
    let world = new World();
    let system = new System({components: []});

    world.addSystem(system);

    expect(world.removeSystem(system)).toBe(world);
  });

  test('removeEntityQuery removes the query from the world', () => {
    let world = new World();
    let entityQuery = new EntityQuery({components: [FooComponent]});

    world.addEntityQuery(entityQuery);
    world.removeEntityQuery(entityQuery);

    expect(world.entityQueries).not.toContain(entityQuery);
    expect(world.entityQueries).toHaveLength(0);
  });

  test("removeEntityQuery throws when the EntityQuery wasn't added", () => {
    let world = new World();
    let entityQuery = new EntityQuery({components: [FooComponent]});

    expect(() => {
      world.removeEntityQuery(entityQuery);
    }).toThrow("Entity query wasn't found!");
  });

  test('removeEntityQuery clears entities and unsets the world', () => {
    let world = new World();
    let entityQuery = new EntityQuery({components: [FooComponent]});
    let entity = new Entity({components: [new FooComponent({value: 1})]});

    world.addEntity(entity);
    world.addEntityQuery(entityQuery);

    expect(entityQuery.entities).toContain(entity);

    world.removeEntityQuery(entityQuery);

    expect(entityQuery.entities).toHaveLength(0);
    expect(() => entityQuery.world).toThrow('World is not set on the entity query!');
  });

  test('removeEntityQuery allows the query to be re-added', () => {
    let world = new World();
    let entityQuery = new EntityQuery({components: [FooComponent]});

    world.addEntityQuery(entityQuery);
    world.removeEntityQuery(entityQuery);

    expect(() => {
      world.addEntityQuery(entityQuery);
    }).not.toThrow();
    expect(world.entityQueries).toContain(entityQuery);
  });

  describe('topology mutation during an update throws (H7)', () => {
    test.each<[string, (world: World) => () => void]>([
      ['addSystem', (world) => () => world.addSystem(new System({components: []}))],
      [
        'removeSystem',
        (world) => {
          let victim = new System({components: []});
          world.addSystem(victim);
          return () => world.removeSystem(victim);
        },
      ],
      ['addEntityQuery', (world) => () => world.addEntityQuery(new EntityQuery({components: []}))],
      [
        'removeEntityQuery',
        (world) => {
          let victim = new EntityQuery({components: []});
          world.addEntityQuery(victim);
          return () => world.removeEntityQuery(victim);
        },
      ],
      [
        'addEventChannel',
        (world) => () => world.addEventChannel(new EventChannel({event: BarEvent})),
      ],
      [
        'removeEventChannel',
        (world) => {
          let victim = new EventChannel({event: BarEvent});
          world.addEventChannel(victim);
          return () => world.removeEventChannel(victim);
        },
      ],
    ])('%s called from a system update throws', (_name, prepare) => {
      let world = new World();
      let offend = prepare(world);
      world.addSystem(new System({components: [], onUpdate: offend}));

      expect(() => world.update({deltaTime: 1} as never)).toThrow(/during an update/);
    });
  });

  describe('system teardown lifecycle ordering (M1)', () => {
    test('stop() fires system onRemove with world.entities populated and system.entities empty', () => {
      let world = new World();
      let worldEntitiesDuringRemove: number | null = null;
      let systemEntitiesDuringRemove: number | null = null;
      let system = new System({
        components: [FooComponent],
        onRemove: (s, w) => {
          worldEntitiesDuringRemove = w.entities.length;
          systemEntitiesDuringRemove = s.entities.length;
        },
      });
      let entity1 = new Entity({components: [new FooComponent({value: 1})]});
      let entity2 = new Entity({components: [new FooComponent({value: 2})]});

      world.addEntity(entity1);
      world.addEntity(entity2);
      world.addSystem(system);
      world.start();
      world.stop();

      expect(worldEntitiesDuringRemove).toBe(2);
      expect(systemEntitiesDuringRemove).toBe(0);
    });

    test('removeSystem (standalone) fires onRemove with world.entities populated and system.entities empty', () => {
      let world = new World();
      let worldEntitiesDuringRemove: number | null = null;
      let systemEntitiesDuringRemove: number | null = null;
      let system = new System({
        components: [FooComponent],
        onRemove: (s, w) => {
          worldEntitiesDuringRemove = w.entities.length;
          systemEntitiesDuringRemove = s.entities.length;
        },
      });

      world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
      world.addEntity(new Entity({components: [new FooComponent({value: 2})]}));
      world.addSystem(system);
      world.removeSystem(system);

      expect(worldEntitiesDuringRemove).toBe(2);
      expect(systemEntitiesDuringRemove).toBe(0);
    });

    test('stop() fires every onRemoveEntity before the system onRemove', () => {
      let world = new World();
      let log: string[] = [];
      let system = new System({
        components: [FooComponent],
        onRemoveEntity: () => log.push('removeEntity'),
        onRemove: () => log.push('remove'),
      });

      world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
      world.addEntity(new Entity({components: [new FooComponent({value: 2})]}));
      world.addSystem(system);
      world.start();
      world.stop();

      expect(log).toEqual(['removeEntity', 'removeEntity', 'remove']);
    });

    test('onAdd fires with world.entities populated and system.entities empty (symmetry)', () => {
      let world = new World();
      let worldEntitiesDuringAdd: number | null = null;
      let systemEntitiesDuringAdd: number | null = null;
      let system = new System({
        components: [FooComponent],
        onAdd: (s, w) => {
          worldEntitiesDuringAdd = w.entities.length;
          systemEntitiesDuringAdd = s.entities.length;
        },
      });

      world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
      world.addEntity(new Entity({components: [new FooComponent({value: 2})]}));
      world.addSystem(system);

      expect(worldEntitiesDuringAdd).toBe(2);
      expect(systemEntitiesDuringAdd).toBe(0);
    });
  });
});
