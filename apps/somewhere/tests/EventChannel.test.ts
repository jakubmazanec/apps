import {describe, expect, test} from 'vitest';

import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';

const FooEvent = defineEvent<{value: number}>();

describe('EventChannel', () => {
  // (a) swap latency: a pushed event is invisible via `events` until one swap()
  test('pushed event is invisible until swap, then visible the frame after', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
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
    let evA = new FooEvent({value: 1});
    let evB = new FooEvent({value: 2});

    channel.push(evA);
    channel.push(evB);
    channel.swap();

    expect(channel.events[0]).toBe(evA);
    expect(channel.events[1]).toBe(evB);
    expect(channel.events).toHaveLength(2);
  });

  // (c) clear() empties both buffers
  test('clear() empties both buffers so nothing surfaces on a subsequent swap', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});

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

  // World.update() calls swap() on registered channels
  test('World.update() swaps all registered channels', () => {
    let channel = new EventChannel({event: FooEvent, displayName: 'Foo'});
    let world = new World();

    world.addEventChannel(channel);
    channel.push(new FooEvent({value: 7}));

    expect(channel.events).toHaveLength(0);

    // update needs a minimal ticker-like object
    world.update({deltaTime: 1} as never);

    expect(channel.events).toHaveLength(1);
  });
});
