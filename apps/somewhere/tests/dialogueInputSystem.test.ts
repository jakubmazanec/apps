import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type GameInput} from '../source/engine/input/GameInput.js';
import {DialogueComponent} from '../source/game/components/DialogueComponent.js';
import {flags} from '../source/game/core/flags.js';
import {dialogueCommandChannel} from '../source/game/events/dialogueCommandChannel.js';
import {dialogueQuery} from '../source/game/queries/dialogueQuery.js';
import {dialogueInputSystem} from '../source/game/systems/dialogueInputSystem.js';

// The system imports the input singleton directly, so the module is replaced
// (hoisted above the imports) and each test installs its own fake.
const inputStub = vitest.hoisted(() => ({current: undefined as unknown as GameInput}));

vitest.mock(import('../source/game/core/input.js'), () => ({
  get input() {
    return inputStub.current;
  },
}));

function tick(): pixi.Ticker {
  return {deltaMS: 0} as unknown as pixi.Ticker;
}

function createFakeInput(pressedActions: string[]): GameInput {
  return {
    held: () => false,
    pressed: (action: string) => pressedActions.includes(action),
    released: () => false,
  } as unknown as GameInput;
}

let activeWorld: World | null = null;

function createWorld(pressedActions: string[]) {
  inputStub.current = createFakeInput(pressedActions);

  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEntityQuery(dialogueQuery)
        .addSystem(dialogueInputSystem)
        .addEntity(dialogueEntity);
    },
  });

  activeWorld = world;

  return {world, component: dialogueEntity.getComponent(DialogueComponent)};
}

describe('dialogueInputSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('an interact press always pushes the interact command', () => {
    let {world} = createWorld(['interact']);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(1);
    expect(dialogueCommandChannel.events[0]?.type).toBe('interact');
  });

  test('movement presses push nothing while no dialogue is active', () => {
    let {world} = createWorld(['move-up', 'move-down']);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(0);
  });

  test('movement presses become up/down commands while a dialogue is active', () => {
    let {world, component} = createWorld(['move-up', 'move-down']);

    world.start();
    component.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(dialogueCommandChannel.events.map((event) => event.type)).toEqual(['up', 'down']);
  });

  test('no presses push nothing', () => {
    let {world} = createWorld([]);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(0);
  });
});
