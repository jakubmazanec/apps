import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {BehaviorComponent, type StrollBehavior} from '../source/game/BehaviorComponent.js';
import {behaviorSystem} from '../source/game/behaviorSystem.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
import {MotionComponent} from '../source/game/MotionComponent.js';

function tick(deltaMS = 100): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

// dialogueQuery/behaviorSystem are module singletons: every test must
// world.stop() so the next one can register them again; afterEach stops via
// activeWorld even when an assertion throws mid-test.
let activeWorld: World | null = null;

function createWorld(overrides: Partial<StrollBehavior> = {}) {
  let motion = new MotionComponent({position: new Vector(100, 100), velocity: new Vector(0, 0)});
  let behaviorComponent = new BehaviorComponent({
    behavior: {
      type: 'stroll',
      home: new Vector(100, 100),
      destination: new Vector(148, 100),
      goal: 'destination',
      phase: 'waiting',
      waitRemaining: 5000,
      ...overrides,
    },
  });
  let npc = new Entity({components: [behaviorComponent, motion]});
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(dialogueQuery)
        .addSystem(behaviorSystem)
        .addEntity(dialogueEntity)
        .addEntity(npc);
    },
  });

  activeWorld = world;

  return {
    world,
    motion,
    behavior: behaviorComponent.behavior,
    dialogueComponent: dialogueEntity.getComponent(DialogueComponent),
  };
}

function startDialogue(dialogueComponent: {active: unknown}) {
  dialogueComponent.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
}

describe('behaviorSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
    vitest.restoreAllMocks();
  });

  test('the wait counts down and holds while time remains', () => {
    let {world, motion, behavior} = createWorld({waitRemaining: 250});

    world.start();
    world.update(tick(100));

    expect(behavior.phase).toBe('waiting');
    expect(behavior.waitRemaining).toBe(150);
    expect(motion.target).toBeUndefined();
  });

  test('an expired wait starts the walk toward the goal', () => {
    let {world, motion, behavior} = createWorld({waitRemaining: 250});

    world.start();
    world.update(tick(100));
    world.update(tick(100));
    world.update(tick(100)); // 300 ms elapsed: expires mid-frame

    expect(behavior.phase).toBe('walking');
    expect(motion.target?.x).toBe(148);
    expect(motion.target?.y).toBe(100);
    // The issued target is a copy, so motionSystem consuming it can never
    // touch the authored destination.
    expect(motion.target).not.toBe(behavior.destination);
  });

  test('a live walk is left alone', () => {
    let {world, motion, behavior} = createWorld({phase: 'walking'});

    world.start();
    motion.target = new Vector(148, 100);
    world.update(tick(100));

    expect(behavior.phase).toBe('walking');
    expect(behavior.goal).toBe('destination');
    expect(motion.target.x).toBe(148);
  });

  test('a cleared target flips the goal and rolls a fresh 3–8 s wait', () => {
    vitest.spyOn(Math, 'random').mockReturnValue(0.5);

    let {world, motion, behavior} = createWorld({phase: 'walking'});

    world.start();
    motion.target = undefined; // motionSystem cleared it: arrived, or fully blocked
    world.update(tick(100));

    expect(behavior.goal).toBe('home');
    expect(behavior.phase).toBe('waiting');
    expect(behavior.waitRemaining).toBe(5500); // 3000 + 0.5 × 5000
  });

  test('an active dialogue freezes a mid-walk stroll and preserves facing', () => {
    let {world, motion, behavior, dialogueComponent} = createWorld({
      phase: 'walking',
      destination: new Vector(100, 148),
    });

    world.start();
    motion.target = new Vector(100, 148);
    motion.velocity.set(0, 1); // walking down: angle 90
    startDialogue(dialogueComponent);
    world.update(tick(100));

    expect(behavior.phase).toBe('paused');
    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(motion.velocity.angle).toBe(90); // stored angle: still facing down
  });

  test('dialogue holds the wait timer', () => {
    let {world, behavior, dialogueComponent} = createWorld({waitRemaining: 250});

    world.start();
    startDialogue(dialogueComponent);
    world.update(tick(100));
    world.update(tick(100));

    expect(behavior.phase).toBe('waiting');
    expect(behavior.waitRemaining).toBe(250);
  });

  test('the interrupted stroll resumes toward the same goal after the dialogue', () => {
    let {world, motion, behavior, dialogueComponent} = createWorld({
      phase: 'walking',
      goal: 'home',
    });

    world.start();
    motion.target = new Vector(100, 100);
    startDialogue(dialogueComponent);
    world.update(tick(100)); // freeze

    expect(behavior.phase).toBe('paused');

    dialogueComponent.active = null;
    world.update(tick(100)); // resume

    expect(behavior.phase).toBe('walking');
    expect(behavior.goal).toBe('home');
    expect(motion.target.x).toBe(100);
    expect(motion.target.y).toBe(100);
  });
});
