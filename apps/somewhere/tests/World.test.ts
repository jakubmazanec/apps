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

describe(World, () => {
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

  test('removeSystem fires onDetach with system and world', () => {
    let world = new World();
    let receivedSystem: System<readonly []> | null = null;
    let receivedWorld: World | null = null;
    let system = new System({
      components: [],
      onDetach: (s, w) => {
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

  test('removeSystem: an entity spawned from onRemoveEntity does not re-enter the draining system', () => {
    let world = new World();
    let spawned = new Entity({components: [new FooComponent({value: 99})]});
    let hasSpawned = false;
    let systemEntitiesDuringRemove = -1;
    let system = new System({
      components: [FooComponent],
      onRemoveEntity: () => {
        // Spawn exactly once, so the test cannot loop even if the fix regresses.
        if (!hasSpawned) {
          hasSpawned = true;
          world.addEntity(spawned);
        }
      },
      onDetach: (removedSystem) => {
        systemEntitiesDuringRemove = removedSystem.entities.length;
      },
    });

    world.addSystem(system);
    world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
    world.removeSystem(system);

    expect(systemEntitiesDuringRemove).toBe(0); // the M1 invariant
    expect(system.entities).toHaveLength(0); // no stale reference on the detached system
    expect(world.entities).toContain(spawned); // the spawned entity is alive, not swallowed
  });

  test('removeSystem: a system removed from inside onRemoveEntity does not corrupt the splice', () => {
    let world = new World();
    let doomed = new System({components: [], displayName: 'doomed'});
    let keptA = new System({components: [], displayName: 'keptA'});
    let keptB = new System({components: [], displayName: 'keptB'});
    let hasRemovedDoomed = false;
    let target = new System({
      components: [FooComponent],
      displayName: 'target',
      onRemoveEntity: () => {
        if (!hasRemovedDoomed) {
          hasRemovedDoomed = true;
          world.removeSystem(doomed);
        }
      },
    });

    world.addSystem(doomed).addSystem(keptA).addSystem(keptB).addSystem(target);
    world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
    world.removeSystem(target);

    expect(world.systems).toHaveLength(2);
    expect(world.systems).toContain(keptA);
    expect(world.systems).toContain(keptB);
    expect(world.systems).not.toContain(target);
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
    expect(() => entityQuery.world).toThrow('Entity query is not attached to a world!');
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
      [
        'addSystem',
        (world) => () => {
          world.addSystem(new System({components: []}));
        },
      ],
      [
        'removeSystem',
        (world) => {
          let victim = new System({components: []});

          world.addSystem(victim);

          return () => {
            world.removeSystem(victim);
          };
        },
      ],
      [
        'addEntityQuery',
        (world) => () => {
          world.addEntityQuery(new EntityQuery({components: []}));
        },
      ],
      [
        'removeEntityQuery',
        (world) => {
          let victim = new EntityQuery({components: []});

          world.addEntityQuery(victim);

          return () => {
            world.removeEntityQuery(victim);
          };
        },
      ],
      [
        'addEventChannel',
        (world) => () => {
          world.addEventChannel(new EventChannel({event: BarEvent}));
        },
      ],
      [
        'removeEventChannel',
        (world) => {
          let victim = new EventChannel({event: BarEvent});

          world.addEventChannel(victim);

          return () => {
            world.removeEventChannel(victim);
          };
        },
      ],
    ])('%s called from a system update throws', (_name, prepare) => {
      let world = new World();
      let offend = prepare(world);

      world.addSystem(new System({components: [], onUpdate: offend}));
      // update() is a no-op on a world that is not running, so the offending call has to
      // happen inside a real frame.
      world.start();

      expect(() => world.update({deltaTime: 1} as never)).toThrow(/during an update/);
    });
  });

  describe('system teardown lifecycle ordering (M1)', () => {
    test('stop() fires system onDetach with world.entities populated and system.entities empty', () => {
      let world = new World();
      let worldEntitiesDuringRemove: number | null = null;
      let systemEntitiesDuringRemove: number | null = null;
      let system = new System({
        components: [FooComponent],
        onDetach: (s, w) => {
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

    test('removeSystem (standalone) fires onDetach with world.entities populated and system.entities empty', () => {
      let world = new World();
      let worldEntitiesDuringRemove: number | null = null;
      let systemEntitiesDuringRemove: number | null = null;
      let system = new System({
        components: [FooComponent],
        onDetach: (s, w) => {
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

    test('stop() fires every onRemoveEntity before the system onDetach', () => {
      let world = new World();
      let log: string[] = [];
      let system = new System({
        components: [FooComponent],
        onRemoveEntity: () => {
          log.push('removeEntity');
        },
        onDetach: () => {
          log.push('remove');
        },
      });

      world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
      world.addEntity(new Entity({components: [new FooComponent({value: 2})]}));
      world.addSystem(system);
      world.start();
      world.stop();

      expect(log).toEqual(['removeEntity', 'removeEntity', 'remove']);
    });

    test('onAttach fires with world.entities populated and system.entities empty (symmetry)', () => {
      let world = new World();
      let worldEntitiesDuringAdd: number | null = null;
      let systemEntitiesDuringAdd: number | null = null;
      let system = new System({
        components: [FooComponent],
        onAttach: (s, w) => {
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

  describe('World.update deferred structural changes', () => {
    test('a system that removes an entity during its onUpdate applies the removal (no hang)', () => {
      let target = new Entity({components: []});
      let remover = new System({
        components: [],
        onUpdate: (ticker, system, world) => {
          if (world.entities.includes(target)) {
            world.removeEntity(target);
          }
        },
      });
      let world = new World({
        onStart: (w) => {
          w.addSystem(remover).addEntity(target);
        },
      });

      world.start();

      expect(world.entities).toContain(target);

      world.update({deltaTime: 1} as never); // removal deferred during onUpdate, then flushed this frame

      expect(world.entities).not.toContain(target);

      world.stop();
    }, 2000);

    test('a system that adds an entity during its onUpdate applies the add (no hang)', () => {
      let spawned = new Entity({components: []});
      let hasSpawned = false;
      let spawner = new System({
        components: [],
        onUpdate: (ticker, system, world) => {
          if (!hasSpawned) {
            hasSpawned = true;
            world.addEntity(spawned);
          }
        },
      });
      let world = new World({
        onStart: (w) => {
          w.addSystem(spawner);
        },
      });

      world.start();

      world.update({deltaTime: 1} as never); // add deferred during onUpdate, then flushed at end of frame

      expect(world.entities).toContain(spawned);

      world.stop();
    }, 2000);

    test('two systems removing the same entity in one update do not throw', () => {
      let target = new Entity({components: []});
      let makeRemover = () =>
        new System({
          components: [],
          onUpdate: (ticker, system, world) => {
            if (world.entities.includes(target)) {
              world.removeEntity(target);
            }
          },
        });
      let world = new World({
        onStart: (w) => {
          w.addSystem(makeRemover()).addSystem(makeRemover()).addEntity(target);
        },
      });

      world.start();

      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities).not.toContain(target);

      world.stop();
    }, 2000);

    test('two systems adding the same entity in one update do not throw (deferred adds are idempotent)', () => {
      let spawned = new Entity({components: []});
      let makeSpawner = () =>
        new System({
          components: [],
          onUpdate: (ticker, system, world) => {
            if (!world.entities.includes(spawned)) {
              world.addEntity(spawned);
            }
          },
        });
      let world = new World({
        onStart: (w) => {
          w.addSystem(makeSpawner()).addSystem(makeSpawner());
        },
      });

      world.start();

      // Both systems see the entity absent (adds defer during the update), so
      // both enqueue it; the flush must apply the first and skip the repeat.
      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities.filter((each) => each === spawned)).toHaveLength(1);

      world.stop();
    }, 2000);

    test('removing and re-adding the same entity in one update keeps it in the world', () => {
      let target = new Entity({components: []});
      let hasRecycled = false;
      let recycler = new System({
        components: [],
        onUpdate: (ticker, system, world) => {
          if (!hasRecycled) {
            hasRecycled = true;
            world.removeEntity(target);
            world.addEntity(target);
          }
        },
      });
      let world = new World({
        onStart: (w) => {
          w.addSystem(recycler).addEntity(target);
        },
      });

      world.start();

      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities).toContain(target);

      world.stop();
    }, 2000);

    test('adding and immediately removing an entity in one update leaves it out', () => {
      let spawned = new Entity({components: []});
      let hasSpawned = false;
      let spawner = new System({
        components: [],
        onUpdate: (ticker, system, world) => {
          if (!hasSpawned) {
            hasSpawned = true;
            world.addEntity(spawned);
            world.removeEntity(spawned);
          }
        },
      });
      let world = new World({
        onStart: (w) => {
          w.addSystem(spawner);
        },
      });

      world.start();

      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities).not.toContain(spawned);

      world.stop();
    }, 2000);

    test('adding and immediately removing an entity that was already in the world keeps it', () => {
      let target = new Entity({components: []});
      let hasSpawned = false;
      let spawner = new System({
        components: [],
        onUpdate: (ticker, system, world) => {
          if (!hasSpawned) {
            hasSpawned = true;
            world.addEntity(target);
            world.removeEntity(target);
          }
        },
      });
      let world = new World({
        onStart: (w) => {
          w.addSystem(spawner).addEntity(target);
        },
      });

      world.start();

      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities).toContain(target);

      world.stop();
    }, 2000);

    test('removing and immediately re-adding an entity that was not in the world leaves it out', () => {
      let spawned = new Entity({components: []});
      let hasRecycled = false;
      let recycler = new System({
        components: [],
        onUpdate: (ticker, system, world) => {
          if (!hasRecycled) {
            hasRecycled = true;
            world.removeEntity(spawned);
            world.addEntity(spawned);
          }
        },
      });
      let world = new World({
        onStart: (w) => {
          w.addSystem(recycler);
        },
      });

      world.start();

      expect(() => {
        world.update({deltaTime: 1} as never);
      }).not.toThrow();
      expect(world.entities).not.toContain(spawned);

      world.stop();
    }, 2000);
  });

  describe('pause/resume (game UI design §3)', () => {
    const TICK = {deltaTime: 1} as const as never;

    test('isPaused reflects pause() and resume()', () => {
      let world = new World();

      world.start();

      expect(world.isPaused).toBe(false);

      world.pause();

      expect(world.isPaused).toBe(true);

      world.resume();

      expect(world.isPaused).toBe(false);

      world.stop();
    });

    test('update() while paused runs no systems', () => {
      let updates = 0;
      let world = new World();

      world.addSystem(
        new System({
          components: [],
          onUpdate: () => {
            updates += 1;
          },
        }),
      );
      world.start();
      world.update(TICK);

      expect(updates).toBe(1);

      world.pause();
      world.update(TICK);
      world.update(TICK);

      expect(updates).toBe(1);

      world.resume();
      world.update(TICK);

      expect(updates).toBe(2);

      world.stop();
    });

    test('events pushed before pause deliver on the first resumed update', () => {
      let seen: number[][] = [];
      let channel = new EventChannel({event: BarEvent});
      let world = new World();

      world.addEventChannel(channel);
      world.addSystem(
        new System({
          components: [],
          onUpdate: () => {
            seen.push(channel.events.map((event) => event.value));
          },
        }),
      );
      world.start();

      channel.push(new BarEvent({value: 1}));
      // A push with no intervening update delivers one update later: the swap
      // at the END of this update stages the event as current.
      world.update(TICK);

      expect(seen).toEqual([[]]);

      world.pause();
      world.resume();
      world.update(TICK);

      expect(seen).toEqual([[], [1]]);

      world.stop();
    });

    test('a paused update() does not swap channels, so staged events survive the pause', () => {
      let seen: number[][] = [];
      let channel = new EventChannel({event: BarEvent});
      let world = new World();

      world.addEventChannel(channel);
      world.addSystem(
        new System({
          components: [],
          onUpdate: () => {
            seen.push(channel.events.map((event) => event.value));
          },
        }),
      );
      world.start();

      channel.push(new BarEvent({value: 1}));
      world.update(TICK); // stages the event

      world.pause();
      world.update(TICK); // paused: no system run, and no swap that would drop the staged event
      world.resume();
      world.update(TICK);

      expect(seen).toEqual([[], [1]]);

      world.stop();
    });

    test('pause() throws when the world is not running', () => {
      let world = new World();

      expect(() => {
        world.pause();
      }).toThrow('World is not running!');
    });

    test('pause() throws when already paused', () => {
      let world = new World();

      world.start();
      world.pause();

      expect(() => {
        world.pause();
      }).toThrow('World is already paused!');

      world.stop();
    });

    test('resume() throws when not paused', () => {
      let world = new World();

      world.start();

      expect(() => {
        world.resume();
      }).toThrow('World is not paused!');

      world.stop();
    });

    test('stop() works on a paused world and the next start() begins unpaused', () => {
      let updates = 0;
      let world = new World({
        onStart: (w) => {
          w.addSystem(
            new System({
              components: [],
              onUpdate: () => {
                updates += 1;
              },
            }),
          );
        },
      });

      world.start();
      world.pause();

      expect(() => {
        world.stop();
      }).not.toThrow();

      world.start();

      expect(world.isPaused).toBe(false);

      world.update(TICK);

      expect(updates).toBe(1);

      world.stop();
    });

    test('a paused update() leaves entity changes synchronous and stop() callable', () => {
      let world = new World();

      world.start();
      world.pause();
      // Must return before #state is set to 'updating': returning after the flag would
      // wedge the world (deferred changes forever, stop() throwing).
      world.update(TICK);

      let entity = new Entity({components: []});

      world.addEntity(entity);

      expect(world.entities).toContain(entity); // synchronous path, not deferred

      world.removeEntity(entity);

      expect(world.entities).not.toContain(entity);

      expect(() => {
        world.stop();
      }).not.toThrow();
    });
  });

  describe('lifecycle flags survive a throw', () => {
    test('a throwing onStart rethrows and leaves the world not running', () => {
      let attempts = 0;
      let world = new World({
        onStart: () => {
          attempts += 1;

          if (attempts === 1) {
            throw new Error('spawn failed');
          }
        },
      });

      expect(() => {
        world.start();
      }).toThrow('spawn failed');
      expect(world.isRunning).toBe(false);

      // Without the rollback this threw 'World is already running!' forever, so
      // the world could never be started again.
      expect(() => {
        world.start();
      }).not.toThrow();
      expect(world.isRunning).toBe(true);

      world.stop();
    });

    test('a throwing system leaves the world stoppable', () => {
      let world = new World();

      world.addSystem(
        new System({
          components: [],
          onUpdate: () => {
            throw new Error('system failed');
          },
        }),
      );
      world.start();

      expect(() => world.update({deltaTime: 1} as never)).toThrow('system failed');

      // While #state stayed 'updating', stop(), addSystem and removeSystem all
      // threw forever and entity changes queued into a flush that never ran.
      expect(() => {
        world.stop();
      }).not.toThrow();
    });

    test('a world that is not running does not update its systems', () => {
      let updates = 0;
      let world = new World();

      world.addSystem(
        new System({
          components: [],
          onUpdate: () => {
            updates += 1;
          },
        }),
      );

      world.update({deltaTime: 1} as never);

      expect(updates).toBe(0);

      world.start();
      world.update({deltaTime: 1} as never);

      expect(updates).toBe(1);

      world.stop();
    });
  });

  describe('WorldState transitions', () => {
    test('stop() called from a teardown hook throws instead of re-running teardown', () => {
      let stopCount = 0;
      let nestedError: string | null = null;
      let world = new World({
        onStop: () => {
          stopCount += 1;
        },
      });
      let system = new System({
        components: [],
        onDetach: () => {
          try {
            world.stop();
          } catch (error) {
            nestedError = (error as Error).message;
          }
        },
      });

      world.addSystem(system);
      world.start();
      world.stop();

      expect(nestedError).toBe('Cannot stop the world while it is stopping!');
      expect(stopCount).toBe(1);
    });

    test('stop() called from inside onStop throws and does not re-run teardown', () => {
      let onStopCount = 0;
      let detachCount = 0;
      let nestedError: string | null = null;
      let world = new World({
        onStop: (w) => {
          onStopCount += 1;

          try {
            w.stop();
          } catch (error) {
            nestedError = (error as Error).message;
          }
        },
      });
      let system = new System({
        components: [],
        onDetach: () => {
          detachCount += 1;
        },
      });

      world.addSystem(system);
      world.start();
      world.stop();

      expect(nestedError).toBe('Cannot stop the world while it is stopping!');
      expect(onStopCount).toBe(1);
      expect(detachCount).toBe(1);
    });

    test('a throwing onStop still leaves the world stopped and startable', () => {
      let world = new World({
        onStop: () => {
          throw new Error('onStop blew up');
        },
      });

      world.start();

      expect(() => world.stop()).toThrow('onStop blew up');
      expect(world.isRunning).toBe(false);
      expect(() => world.start()).not.toThrow();
    });

    test('update() called from a system update does not re-enter the system loop', () => {
      let updateCount = 0;
      let world = new World();
      let system = new System({
        components: [],
        onUpdate: (ticker) => {
          updateCount += 1;
          world.update(ticker);
        },
      });

      world.addSystem(system);
      world.start();
      world.update({deltaTime: 1} as never);

      expect(updateCount).toBe(1);
    });

    test('pause() from inside a system update throws', () => {
      let pauseError: string | null = null;
      let world = new World();
      let system = new System({
        components: [],
        onUpdate: () => {
          try {
            world.pause();
          } catch (error) {
            pauseError = (error as Error).message;
          }
        },
      });

      world.addSystem(system);
      world.start();
      world.update({deltaTime: 1} as never);

      expect(pauseError).toBe('World is not running!');
      expect(world.isPaused).toBe(false);
    });

    test('a throwing teardown hook still resets World state, leaves it startable, and releases the system', () => {
      let world = new World();
      let system = new System({
        components: [],
        onDetach: () => {
          throw new Error('teardown blew up');
        },
      });

      world.addSystem(system);
      world.start();

      expect(() => world.stop()).toThrow('teardown blew up');
      expect(world.isRunning).toBe(false);
      expect(() => world.start()).not.toThrow();
      expect(() => system.world).toThrow('System is not attached to a world!');
    });
  });

  describe('topology registration during teardown', () => {
    test('addSystem from a teardown hook throws', () => {
      let thrown: string | null = null;
      let world = new World();
      let latecomer = new System({components: [], displayName: 'latecomer'});
      let culprit = new System({
        components: [],
        displayName: 'culprit',
        onDetach: () => {
          try {
            world.addSystem(latecomer);
          } catch (error) {
            thrown = (error as Error).message;
          }
        },
      });

      world.addSystem(culprit);
      world.start();
      world.stop();

      expect(thrown).toBe('Cannot add a system while the world is stopping!');
      expect(world.systems).toHaveLength(0);
    });

    test('addEntityQuery from a teardown hook throws', () => {
      let thrown: string | null = null;
      let world = new World();
      let latecomer = new EntityQuery({components: [FooComponent]});
      let culprit = new System({
        components: [],
        onDetach: () => {
          try {
            world.addEntityQuery(latecomer);
          } catch (error) {
            thrown = (error as Error).message;
          }
        },
      });

      world.addSystem(culprit);
      world.start();
      world.stop();

      expect(thrown).toBe('Cannot add an entity query while the world is stopping!');
      expect(world.entityQueries).toHaveLength(0);
    });

    test('addEventChannel from a teardown hook throws', () => {
      let thrown: string | null = null;
      let world = new World();
      let latecomer = new EventChannel({event: BarEvent, displayName: 'Bar'});
      let culprit = new System({
        components: [],
        onDetach: () => {
          try {
            world.addEventChannel(latecomer);
          } catch (error) {
            thrown = (error as Error).message;
          }
        },
      });

      world.addSystem(culprit);
      world.start();
      world.stop();

      expect(thrown).toBe('Cannot add an event channel while the world is stopping!');
      expect(world.eventChannels).toHaveLength(0);
    });

    // Deliberate asymmetry, matching how update() already treats the same call: entity
    // churn is tolerated, topology mutation is a programmer error. This test exists to
    // stop a future tidy-up from making the rule uniform.
    test('addEntity from a teardown hook is allowed and cleaned up', () => {
      let threw = false;
      let world = new World();
      let spawned = new Entity({components: [new FooComponent({value: 7})]});
      let culprit = new System({
        components: [],
        onDetach: () => {
          try {
            world.addEntity(spawned);
          } catch {
            threw = true;
          }
        },
      });

      world.addSystem(culprit);
      world.start();
      world.stop();

      expect(threw).toBe(false);
      expect(world.entities).toHaveLength(0);
    });

    test('stop() leaves every collection empty', () => {
      let world = new World();

      world.addSystem(new System({components: []}));
      world.addEntityQuery(new EntityQuery({components: [FooComponent]}));
      world.addEventChannel(new EventChannel({event: BarEvent, displayName: 'Bar'}));
      world.addEntity(new Entity({components: [new FooComponent({value: 1})]}));
      world.start();
      world.stop();

      expect(world.systems).toHaveLength(0);
      expect(world.entities).toHaveLength(0);
      expect(world.entityQueries).toHaveLength(0);
      expect(world.eventChannels).toHaveLength(0);
    });
  });
});
