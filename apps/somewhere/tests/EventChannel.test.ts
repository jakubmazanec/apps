import {describe, expect, test} from 'vitest';

import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {System} from '../source/engine/ecs/System.js';
import {World} from '../source/engine/ecs/World.js';

const FooEvent = defineEvent<{value: number}>();

describe(EventChannel, () => {
  // (a) swap latency: a pushed event is invisible via `events` until one swap()
  test('pushed event is invisible until swap, then visible the frame after', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    channel.attach(new World()); // driven by hand below; a real world attaches this in addEventChannel

    let ev = new FooEvent({value: 42});

    channel.push(ev);

    expect(channel.events).toHaveLength(0);

    channel.swap();

    expect(channel.events).toHaveLength(1);
    expect(channel.events[0]).toBe(ev);
  });

  // (b) FIFO order preserved across a swap
  test('events appear in push order after swap', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    channel.attach(new World()); // driven by hand below; a real world attaches this in addEventChannel

    let evA = new FooEvent({value: 1});
    let evB = new FooEvent({value: 2});

    channel.push(evA, evB);
    channel.swap();

    expect(channel.events[0]).toBe(evA);
    expect(channel.events[1]).toBe(evB);
    expect(channel.events).toHaveLength(2);
  });

  // (c) clear() empties both buffers
  test('clear() empties both buffers so nothing surfaces on a subsequent swap', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    channel.attach(new World()); // driven by hand below; a real world attaches this in addEventChannel

    channel.push(new FooEvent({value: 1}));
    channel.swap();
    channel.push(new FooEvent({value: 2}));

    channel.clear();
    channel.swap();

    expect(channel.events).toHaveLength(0);
  });

  // (f) re-entrancy: pushing while iterating events does not mutate the current snapshot
  test('pushing during iteration does not mutate the current snapshot', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    channel.attach(new World()); // driven by hand below; a real world attaches this in addEventChannel

    channel.push(new FooEvent({value: 1}));
    channel.swap();

    let lengthDuringIteration = -1;

    channel.events.forEach(() => {
      channel.push(new FooEvent({value: 99}));
      lengthDuringIteration = channel.events.length;
    });

    expect(lengthDuringIteration).toBe(1);

    channel.swap();

    expect(channel.events).toHaveLength(1);
    expect(channel.events[0]).toMatchObject({value: 99});
  });

  test('push on a detached channel throws in DEV', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    expect(() => {
      channel.push(new FooEvent({value: 1}));
    }).toThrow('Cannot push to the detached event channel "Foo"');
  });

  test('attach throws when the channel is already attached to a world', () => {
    let world = new World();
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    channel.attach(world);

    expect(() => {
      channel.attach(world);
    }).toThrow('Event channel is already attached to a world!');
  });

  test('detach throws when the channel is not attached', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    expect(() => {
      channel.detach();
    }).toThrow('Event channel is not attached to a world!');
  });
});

describe('World event channel integration', () => {
  // (d) double-add throws
  test('addEventChannel throws when the same channel is added twice', () => {
    let world = new World();
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    world.addEventChannel(channel);

    expect(() => {
      world.addEventChannel(channel);
    }).toThrow('Event channel was already added to the world!');
    expect(world.eventChannels).toHaveLength(1);
  });

  // removeEventChannel "wasn't found" throw
  test("removeEventChannel throws when the channel wasn't added", () => {
    let world = new World();
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    expect(() => {
      world.removeEventChannel(channel);
    }).toThrow("Event channel wasn't found!");
  });

  // (e) re-add after stop() succeeds (proves the splice, not just clear)
  test('re-add after stop() succeeds — stop() splices channels, not just clears', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
      },
    });

    world.start();
    world.stop();

    expect(() => {
      world.start();
    }).not.toThrow();

    world.stop();
  });

  // World.update() calls swap() on attached channels
  test('World.update() swaps all attached channels', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
    let world = new World();

    world.addEventChannel(channel);
    world.start();
    channel.push(new FooEvent({value: 7}));

    expect(channel.events).toHaveLength(0);

    // update needs a minimal ticker-like object
    world.update({deltaTime: 1} as never);

    expect(channel.events).toHaveLength(1);
  });

  // (H8) a push made between frames is delivered to an in-update consumer, not overwritten/lost
  test('event pushed between frames surfaces to an in-update consumer (H8)', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
    let seen: Array<InstanceType<typeof FooEvent>> = [];
    let recorder = new System({
      components: [],
      onUpdate: () => {
        for (let ev of channel.events) {
          seen.push(ev);
        }
      },
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel).addSystem(recorder);
      },
    });

    world.start();

    let ev = new FooEvent({value: 7});

    channel.push(ev); // between-frames push (outside any update)

    world.update({deltaTime: 1} as never); // frame 1: recorder reads [] (ev still in #nextEvents), then swap promotes ev

    expect(seen).toHaveLength(0);

    world.update({deltaTime: 1} as never); // frame 2: recorder reads [ev]

    expect(seen).toContain(ev); // delivered the following frame, not lost
  });

  test('attachment lifecycle: addEventChannel enables push, removeEventChannel disables it', () => {
    let world = new World();
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

    expect(channel.isAttached).toBe(false);

    world.addEventChannel(channel);

    expect(channel.isAttached).toBe(true);
    expect(() => {
      channel.push(new FooEvent({value: 1}));
    }).not.toThrow();

    world.removeEventChannel(channel);

    expect(channel.isAttached).toBe(false);
    expect(() => {
      channel.push(new FooEvent({value: 2}));
    }).toThrow(/detached event channel/);
  });

  test('stop() detaches channels, so a push after stop is loud (the T1.2 trap)', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
      },
    });

    world.start();

    expect(channel.isAttached).toBe(true);

    world.stop();

    expect(channel.isAttached).toBe(false);
  });
});
