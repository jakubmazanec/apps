import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type Constructor} from '../source/engine/utilities/Constructor.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {DialogueComponent} from '../source/game/components/DialogueComponent.js';
import {GraphicsComponent} from '../source/game/components/GraphicsComponent.js';
import {MotionComponent} from '../source/game/components/MotionComponent.js';
import {PlayerComponent} from '../source/game/components/PlayerComponent.js';
import {TriggerComponent} from '../source/game/components/TriggerComponent.js';
import {flags} from '../source/game/core/flags.js';
import {DialogueCommand} from '../source/game/events/DialogueCommand.js';
import {dialogueCommandChannel} from '../source/game/events/dialogueCommandChannel.js';
import {triggerEnterChannel} from '../source/game/events/triggerEnterChannel.js';
import {triggerExitChannel} from '../source/game/events/triggerExitChannel.js';
import {dialogueQuery} from '../source/game/queries/dialogueQuery.js';
import {playersQuery} from '../source/game/queries/playersQuery.js';
import {doorSystem} from '../source/game/systems/doorSystem.js';
import {triggerSystem} from '../source/game/systems/triggerSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime, deltaMS: 0} as unknown as pixi.Ticker;
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

let activeWorld: World | null = null;

// The travelSystem.test rig: doorSystem resolves the prompted trigger through
// findPromptEntity (player + bounding box) and honors the dialogue lock, so
// the harness carries a dialogue entity and both queries. The integration
// flag adds triggerSystem after doorSystem, in world.ts order.
function createHarness(
  triggers: Entity[],
  playerAt?: {x: number; y: number},
  {withTriggerSystem = false} = {},
) {
  let pos = playerAt ?? {x: 4, y: 4};
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let motion = new MotionComponent({
    position: new Vector(pos.x, pos.y),
    velocity: new Vector(0, 0),
  });
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEventChannel(triggerEnterChannel)
        .addEventChannel(triggerExitChannel)
        .addEntityQuery(dialogueQuery)
        .addEntityQuery(playersQuery)
        .addSystem(doorSystem);

      if (withTriggerSystem) {
        w.addSystem(triggerSystem);
      }

      w.addEntity(dialogueEntity).addEntity(player);

      for (let trigger of triggers) {
        w.addEntity(trigger);
      }
    },
  });

  activeWorld = world;

  return {world, dialogueEntity, motion};
}

// Commands pushed outside an update land in the write buffer; the manual swap
// makes them current for the next update (the travelSystem test pattern).
function pressInteract(count = 1): void {
  for (let index = 0; index < count; index++) {
    dialogueCommandChannel.push(new DialogueCommand({type: 'interact'}));
  }

  dialogueCommandChannel.swap();
}

describe('doorSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('interact while standing in a door teleports the player onto the target center, cancels the tap target, and arms the target', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {world, motion} = createHarness([doorA, doorB]);

    world.start();
    motion.target = new Vector(2, 2);
    motion.velocity.set(1, 0);
    pressInteract();
    world.update(tick());

    // Door B's rect center is (72, 8); the box (0, 0, 8, 8) centers at (68, 4).
    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);
    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(doorB.getComponent(TriggerComponent).isPlayerInside).toBe(true);
  });

  test('interact in the approach band outside a door does nothing (unlike an exit)', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    // Box 4..12 x 20..28; door A's rect ends at y 16, an exit's band would reach y 28.
    let {world, motion} = createHarness([doorA, doorB], {x: 4, y: 20});

    world.start();
    pressInteract();
    world.update(tick());

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(20);
  });

  test('interact away from any door does nothing', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {world, motion} = createHarness([doorA, doorB], {x: 100, y: 100});

    world.start();
    pressInteract();
    world.update(tick());

    expect(motion.position.x).toBe(100);
    expect(motion.position.y).toBe(100);
  });

  test('a dangling target leaves the door inert', () => {
    let doorC = createDoor(1, 99, 0, 0);
    let {world, motion} = createHarness([doorC]);

    world.start();
    pressInteract();
    world.update(tick());

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });

  test('an active dialogue locks the door (paging can never teleport)', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {world, dialogueEntity, motion} = createHarness([doorA, doorB]);

    world.start();
    dialogueEntity.getComponent(DialogueComponent).active = new Dialogue({
      script: {start: {text: 'hi'}},
      context: flags,
    });
    pressInteract();
    world.update(tick());

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });

  test("a resolved exit never teleports (travel is travelSystem's job)", () => {
    let exit = new Entity({
      components: [
        new TriggerComponent({
          id: 1,
          name: 'shop-exit',
          type: 'exit',
          rect: new pixi.Rectangle(0, 0, 16, 16),
          // A stray door-style target must not turn an exit into a door.
          properties: {map: 'shop-interior', entry: 'entrance', target: 2},
        }),
      ],
    });
    let doorB = createDoor(2, 1, 64, 0);
    let {world, motion} = createHarness([exit, doorB]);

    world.start();
    pressInteract();
    world.update(tick());

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });

  test('two interact commands in one frame teleport once, never straight back', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {world, motion} = createHarness([doorA, doorB]);

    world.start();
    pressInteract(2); // a key edge and a bubble tap on the same frame
    world.update(tick());

    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);
  });
});

describe('doorSystem with triggerSystem (integration)', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('walking into a door never teleports by itself', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {world, motion} = createHarness([doorA, doorB], {x: 20, y: 20}, {withTriggerSystem: true});

    world.start();
    world.update(tick()); // seeds both doors: outside

    motion.position.set(4, 4); // step into door A
    world.update(tick()); // triggerSystem pushes enter A
    world.update(tick()); // the enter is current: doorSystem ignores it

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
    expect(doorA.getComponent(TriggerComponent).isPlayerInside).toBe(true);
  });

  test('a press teleports; a held direction walks out of the target without re-firing it; a press back inside teleports back', () => {
    let doorA = createDoor(1, 2, 0, 0);
    let doorB = createDoor(2, 1, 64, 0);
    let {world, motion} = createHarness([doorA, doorB], {x: 20, y: 20}, {withTriggerSystem: true});

    world.start();
    world.update(tick()); // seeds both doors: outside

    motion.position.set(4, 4); // step into door A
    world.update(tick()); // triggerSystem pushes enter A
    pressInteract();
    world.update(tick()); // doorSystem teleports to B before triggerSystem tests

    expect(motion.position.x).toBe(68);
    expect(motion.position.y).toBe(4);
    expect(triggerEnterChannel.events).toHaveLength(0); // the armed arrival stayed silent
    expect(triggerExitChannel.events).toHaveLength(1); // the genuine exit from A

    // "Hold right" out of B: the suppressed arrival plus the genuine exit.
    motion.position.set(74, 4);
    world.update(tick());
    motion.position.set(82, 4); // box 82..90 leaves B's rect 64..80
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(0); // B never re-fired
    expect(triggerExitChannel.events).toHaveLength(1); // one genuine exit

    // Walk back into B: it re-armed, and the pair teleports back to A on a press.
    motion.position.set(68, 4);
    world.update(tick()); // enter B pushed, nothing moves
    world.update(tick());

    expect(motion.position.x).toBe(68);

    pressInteract();
    world.update(tick()); // doorSystem teleports to A's center (8, 8)

    expect(motion.position.x).toBe(4);
    expect(motion.position.y).toBe(4);
  });
});
