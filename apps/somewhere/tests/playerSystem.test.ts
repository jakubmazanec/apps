import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type Input} from '../source/engine/input/Input.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {CameraComponent} from '../source/game/CameraComponent.js';
import {cameraQuery} from '../source/game/cameraQuery.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {inputQuery} from '../source/game/inputQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {MAX_SPEED} from '../source/game/motionSystem.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playerSystem} from '../source/game/playerSystem.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// GraphicsComponent builds a real Sprite from an asset name in its constructor, which needs
// pixi.Assets to already have a loaded spritesheet. Bypass the constructor and assign the stub
// fields onto the real prototype instead, so `entity.getComponent` (keyed by `.constructor`)
// still resolves it as the real component class.
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

type FakeInputState = {
  heldActions?: string[];
  pressedActions?: string[];
  tapPosition?: Vector;
};

// playerSystem only polls, so a state bag stands in for a real Input — no
// listeners, no update() plumbing.
function createFakeInput(state: FakeInputState): Input {
  return {
    held: (action: string) => state.heldActions?.includes(action) ?? false,
    pressed: (action: string) => state.pressedActions?.includes(action) ?? false,
    released: () => false,
    tapPosition: state.tapPosition ?? new Vector(0, 0),
  } as unknown as Input;
}

// cameraQuery/inputQuery/dialogueQuery/playerSystem are module singletons:
// every test must world.stop() so the next test can register them again.
function createWorld(state: FakeInputState) {
  let motion = new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)});
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 10, width: 16, height: 10}}),
    ],
  });
  let inputEntity = new Entity({
    components: [new InputComponent({input: createFakeInput(state)})],
  });
  let camera = new Entity({components: [new CameraComponent({position: new Vector(100, 50)})]});
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(inputQuery)
        .addEntityQuery(cameraQuery)
        .addEntityQuery(dialogueQuery)
        .addSystem(playerSystem)
        .addEntity(inputEntity)
        .addEntity(camera)
        .addEntity(dialogueEntity)
        .addEntity(player);
    },
  });

  return {world, motion, dialogueComponent: dialogueEntity.getComponent(DialogueComponent)};
}

describe('playerSystem', () => {
  test('held movement keys set velocity to MAX_SPEED and clear the tap target', () => {
    let {world, motion} = createWorld({heldActions: ['move-right']});

    world.start();
    motion.target = new Vector(500, 500);
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(MAX_SPEED);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('diagonal movement is normalized, not faster', () => {
    let {world, motion} = createWorld({heldActions: ['move-right', 'move-down']});

    world.start();
    world.update(tick());

    expect(motion.velocity.length).toBeCloseTo(MAX_SPEED);
    expect(motion.velocity.x).toBeCloseTo(MAX_SPEED / Math.SQRT2);
    expect(motion.velocity.y).toBeCloseTo(MAX_SPEED / Math.SQRT2);

    world.stop();
  });

  test('opposite keys cancel: target cleared, velocity zero', () => {
    let {world, motion} = createWorld({heldActions: ['move-left', 'move-right']});

    world.start();
    motion.target = new Vector(500, 500);
    motion.velocity.set(3, 3);
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('a tap sets the target from tapPosition plus camera offset and zeroes velocity', () => {
    let {world, motion} = createWorld({
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    motion.velocity.set(3, 3);
    world.update(tick());

    // Tap (10, 20) + camera (100, 50) = (110, 70), centered on the box (0, 10, 16, 10):
    // 110 - 0 - 8, 70 - 10 - 5.
    expect(motion.target?.x).toBe(102);
    expect(motion.target?.y).toBe(55);
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('no keys, no tap, no target: velocity is zeroed', () => {
    let {world, motion} = createWorld({});

    world.start();
    motion.velocity.set(3, 3);
    world.update(tick());

    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('an active tap target without key input is left alone for motionSystem', () => {
    let {world, motion} = createWorld({});

    world.start();
    motion.target = new Vector(5, 5);
    motion.velocity.set(3, 3);
    world.update(tick());

    expect(motion.target.x).toBe(5);
    expect(motion.velocity.x).toBe(3);

    world.stop();
  });

  test('keys beat a same-frame tap', () => {
    let {world, motion} = createWorld({
      heldActions: ['move-left'],
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(-MAX_SPEED);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('an active dialogue locks movement: keys and taps are ignored', () => {
    let {world, motion, dialogueComponent} = createWorld({
      heldActions: ['move-right'],
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    dialogueComponent.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(motion.target).toBeUndefined();

    world.stop();
  });

  test('an active dialogue locks a tap on its own: no target is set, velocity stays zero', () => {
    let {world, motion, dialogueComponent} = createWorld({
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    dialogueComponent.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('clearing the dialogue restores movement: the same tap lands once it ends', () => {
    let {world, motion, dialogueComponent} = createWorld({
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    dialogueComponent.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
    world.update(tick());

    expect(motion.target).toBeUndefined();

    dialogueComponent.active = null;
    world.update(tick());

    // Tap (10, 20) + camera (100, 50) = (110, 70), centered on the box (0, 10, 16, 10):
    // 110 - 0 - 8, 70 - 10 - 5.
    expect(motion.target?.x).toBe(102);
    expect(motion.target?.y).toBe(55);
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });
});
