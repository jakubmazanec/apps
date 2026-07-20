import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {doorSystem} from '../source/game/doorSystem.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {TriggerEnter} from '../source/game/TriggerEnter.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';
import {triggerExitChannel} from '../source/game/triggerExitChannel.js';
import {triggerSystem} from '../source/game/triggerSystem.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

function createDoor(id: number, target: number, x: number, y: number) {
  return new Entity({
    components: [
      new TriggerComponent({
        id,
        name: `door-${id}`,
        type: 'door',
        rect: new pixi.Rectangle(x, y, 16, 16),
        properties: {target},
      }),
    ],
  });
}

function createPlayer(x: number, y: number) {
  let motion = new MotionComponent({position: new Vector(x, y), velocity: new Vector(0, 0)});
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });

  return {player, motion};
}

let activeWorld: World | null = null;

// Unit rig: doorSystem alone; enters are pushed by hand (uiBridge.test's
// push-then-swap pattern makes them current for the next update).
function createUnitWorld(triggerEntities: Entity[]) {
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel);

      for (let entity of triggerEntities) {
        w.addEntity(entity);
      }

      w.addSystem(doorSystem);
    },
  });

  activeWorld = world;

  return world;
}

describe('doorSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('an enter on a door teleports the player onto the target center, cancels the tap target, and suppresses the arrival enter', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let world = createUnitWorld([doorA, doorB]);
    let {player, motion} = createPlayer(4, 4);

    world.start();
    motion.target = new Vector(2, 2);
    motion.velocity.set(1, 0);
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: doorA}));
    triggerEnterChannel.swap();
    world.update(tick());

    // Door B's rect center is (72, 8); the box (0, 0, 8, 8) centers at (68, 4).
    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);
    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(doorB.getComponent(TriggerComponent).isPlayerInside).toBeTruthy();
  });

  test('a dangling target leaves the door inert', () => {
    let doorC = createDoor(1, 99, 0, 0);
    let world = createUnitWorld([doorC]);
    let {player, motion} = createPlayer(4, 4);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: doorC}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });

  test('an enter on a non-door trigger is ignored', () => {
    let zone = new Entity({
      components: [
        new TriggerComponent({
          id: 1,
          name: 'zone',
          type: 'zone',
          rect: new pixi.Rectangle(0, 0, 16, 16),
          properties: {},
        }),
      ],
    });
    let world = createUnitWorld([zone]);
    let {player, motion} = createPlayer(4, 4);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: zone}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(motion.position.x).toBe(4);
  });
});

describe('doorSystem with triggerSystem (integration)', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('a held direction walks out of door B without re-firing it; walking back in teleports back', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {player, motion} = createPlayer(20, 20);
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(triggerEnterChannel)
          .addEventChannel(triggerExitChannel)
          .addEntityQuery(playersQuery)
          .addSystem(triggerSystem)
          .addSystem(doorSystem)
          .addEntity(player)
          .addEntity(doorA)
          .addEntity(doorB);
      },
    });

    activeWorld = world;

    world.start();
    world.update(tick()); // seeds both doors: outside

    motion.position.set(4, 4); // step into door A
    world.update(tick()); // triggerSystem pushes enter A
    world.update(tick()); // doorSystem consumes it: teleport to B

    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);

    // "Hold right" out of B: the suppressed arrival plus the genuine exit.
    motion.position.set(74, 4);
    world.update(tick());
    motion.position.set(82, 4); // box 82..90 leaves B's rect 64..80
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(0); // B never re-fired
    expect(triggerExitChannel.events).toHaveLength(1); // one genuine exit

    // Walk back into B: it re-armed, so the pair teleports back to A.
    motion.position.set(68, 4);
    world.update(tick()); // enter B pushed
    world.update(tick()); // doorSystem teleports to A's center (8, 8)

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });
});
