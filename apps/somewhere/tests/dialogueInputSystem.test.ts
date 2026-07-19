import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type Input} from '../source/engine/input/Input.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {dialogueCommandChannel} from '../source/game/dialogueCommandChannel.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueInputSystem} from '../source/game/dialogueInputSystem.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
import {inputQuery} from '../source/game/inputQuery.js';

function tick(): pixi.Ticker {
  return {deltaMS: 0} as unknown as pixi.Ticker;
}

function createFakeInput(pressedActions: string[]): Input {
  return {
    held: () => false,
    pressed: (action: string) => pressedActions.includes(action),
    released: () => false,
  } as unknown as Input;
}

let activeWorld: World | null = null;

function createWorld(pressedActions: string[]) {
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let inputEntity = new Entity({
    components: [new InputComponent({input: createFakeInput(pressedActions)})],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEntityQuery(dialogueQuery)
        .addEntityQuery(inputQuery)
        .addSystem(dialogueInputSystem)
        .addEntity(dialogueEntity)
        .addEntity(inputEntity);
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

  test('an advance press becomes the advance command only while a dialogue is active', () => {
    let {world, component} = createWorld(['advance']);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(0);

    component.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(dialogueCommandChannel.events.map((event) => event.type)).toEqual(['advance']);
  });

  test('no presses push nothing', () => {
    let {world} = createWorld([]);

    world.start();
    world.update(tick());

    expect(dialogueCommandChannel.events).toHaveLength(0);
  });
});
