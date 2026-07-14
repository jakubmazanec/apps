import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Input} from '../source/engine/input/Input.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {inputSystem} from '../source/engine/input/inputSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// Input never calls anything on the view except on/off in attach/detach.
function createFakeView(): pixi.Container {
  return {on() {}, off() {}} as unknown as pixi.Container;
}

// inputSystem is a module-level singleton: every test must world.stop() so the
// next test's addSystem doesn't hit the already-has-a-world throw.
describe('inputSystem', () => {
  test('calls input.update() exactly once per world update', () => {
    let updateCount = 0;
    let fakeInput = {
      update() {
        updateCount += 1;
      },
    } as unknown as Input;
    let entity = new Entity({components: [new InputComponent({input: fakeInput})]});
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick());

    expect(updateCount).toBe(1);

    world.update(tick());

    expect(updateCount).toBe(2);

    world.stop();
  });

  test('throws loudly when the input entity is missing', () => {
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem);
      },
    });

    world.start();

    // Call the system directly rather than world.update(): a throw inside
    // world.update() would leave the world's updating flag set and make
    // stop() impossible, poisoning the module-level system for later tests.
    expect(() => inputSystem.update(tick())).toThrow('No entity found!');

    world.stop();
  });

  test('an edge latched before pause() stays readable across paused frames and resolves to held after resume()', () => {
    let input = new Input({bindings: {'move-up': {keys: ['KeyW']}}});

    input.attach(createFakeView());

    let entity = new Entity({components: [new InputComponent({input})]});
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem).addEntity(entity);
      },
    });

    world.start();
    globalThis.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', cancelable: true}));
    world.update(tick());

    expect(input.pressed('move-up')).toBeTruthy();

    world.pause();
    world.update(tick());
    world.update(tick());

    // The step boundary never advanced: the pre-pause edge is still this step's edge.
    expect(input.pressed('move-up')).toBeTruthy();
    expect(input.held('move-up')).toBeTruthy();

    world.resume();
    world.update(tick());

    // First frame after resume: plain held, no new edge.
    expect(input.pressed('move-up')).toBeFalsy();
    expect(input.held('move-up')).toBeTruthy();

    world.stop();
    input.detach();
  });

  test('a key pressed and released entirely during pause leaves no edge after resume', () => {
    let input = new Input({bindings: {'move-up': {keys: ['KeyW']}}});

    input.attach(createFakeView());

    let entity = new Entity({components: [new InputComponent({input})]});
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick());
    world.pause();

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', cancelable: true}));
    world.update(tick());
    globalThis.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyW', cancelable: true}));
    world.update(tick());

    world.resume();
    world.update(tick());

    expect(input.pressed('move-up')).toBeFalsy();
    expect(input.held('move-up')).toBeFalsy();
    expect(input.released('move-up')).toBeFalsy();

    world.stop();
    input.detach();
  });
});
