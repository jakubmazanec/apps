import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type Constructor} from '../source/engine/utilities/Constructor.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {GraphicsComponent} from '../source/game/components/GraphicsComponent.js';
import {MotionComponent} from '../source/game/components/MotionComponent.js';
import {PlayerComponent} from '../source/game/components/PlayerComponent.js';
import {TriggerComponent} from '../source/game/components/TriggerComponent.js';
import {triggerEnterChannel} from '../source/game/events/triggerEnterChannel.js';
import {triggerExitChannel} from '../source/game/events/triggerExitChannel.js';
import {playersQuery} from '../source/game/queries/playersQuery.js';
import {triggerSystem} from '../source/game/systems/triggerSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// GraphicsComponent builds a real Sprite from an asset name in its
// constructor; bypass it and assign the stub fields onto the real prototype
// so `entity.getComponent` (keyed by `.constructor`) still resolves it.
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

// playersQuery/triggerSystem are module singletons: every test must
// world.stop() so the next one can register them again; afterEach stops via
// activeWorld even when an assertion throws mid-test.
let activeWorld: World | null = null;

function createWorld(playerAt: {x: number; y: number}, rect: pixi.Rectangle) {
  let motion = new MotionComponent({
    position: new Vector(playerAt.x, playerAt.y),
    velocity: new Vector(0, 0),
  });
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      motion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let trigger = new Entity({
    components: [new TriggerComponent({id: 1, name: 'zone', type: 'zone', rect, properties: {}})],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel)
        .addEventChannel(triggerExitChannel)
        .addEntityQuery(playersQuery)
        .addSystem(triggerSystem)
        .addEntity(player)
        .addEntity(trigger);
    },
  });

  activeWorld = world;

  return {world, motion, player, trigger};
}

// An NPC-shaped trigger: rect authored at (240, 176, 24, 28), entity position
// (244, 180) — the real Mira numbers, so offsets are (−4, −4).
function createNpcWorld() {
  let playerMotion = new MotionComponent({
    position: new Vector(0, 0),
    velocity: new Vector(0, 0),
  });
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      playerMotion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let npcMotion = new MotionComponent({
    position: new Vector(244, 180),
    velocity: new Vector(0, 0),
  });
  let npc = new Entity({
    components: [
      new TriggerComponent({
        id: 5,
        name: 'mira',
        type: 'npc',
        rect: new pixi.Rectangle(240, 176, 24, 28),
        properties: {},
        rectOffsetX: -4,
        rectOffsetY: -4,
      }),
      npcMotion,
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel)
        .addEventChannel(triggerExitChannel)
        .addEntityQuery(playersQuery)
        .addSystem(triggerSystem)
        .addEntity(player)
        .addEntity(npc);
    },
  });

  activeWorld = world;

  return {world, playerMotion, npcMotion, trigger: npc.getComponent(TriggerComponent)};
}

describe('triggerSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('enter fires exactly once on overlap start and stays silent while inside', () => {
    let {world, motion, player, trigger} = createWorld(
      {x: 0, y: 0},
      new pixi.Rectangle(16, 0, 16, 16),
    );

    world.start();
    world.update(tick()); // seeds: outside

    expect(triggerEnterChannel.events).toHaveLength(0);

    motion.position.set(12, 0); // box 12..20 overlaps 16..32
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1);
    expect(triggerEnterChannel.events[0]!.entity).toBe(player);
    expect(triggerEnterChannel.events[0]!.trigger).toBe(trigger);

    world.update(tick()); // still inside

    expect(triggerEnterChannel.events).toHaveLength(0);
  });

  test('exit fires on leave and the trigger re-arms', () => {
    let {world, motion} = createWorld({x: 0, y: 0}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick()); // seed
    motion.position.set(12, 0);
    world.update(tick()); // enter
    motion.position.set(0, 0);
    world.update(tick());

    expect(triggerExitChannel.events).toHaveLength(1);

    motion.position.set(12, 0);
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1); // re-armed
  });

  test('flush edge contact never fires (strict overlap)', () => {
    // Player box 0..8 exactly touches the rect starting at 8.
    let {world} = createWorld({x: 0, y: 0}, new pixi.Rectangle(8, 0, 16, 16));

    world.start();
    world.update(tick()); // seed
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(0);
  });

  test('a first test that already overlaps seeds silently and re-arms normally (restored save)', () => {
    let {world, motion} = createWorld({x: 18, y: 2}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick()); // seeds: inside, but no enter event

    expect(triggerEnterChannel.events).toHaveLength(0);

    motion.position.set(40, 0); // walk out: a genuine exit
    world.update(tick());

    expect(triggerExitChannel.events).toHaveLength(1);

    motion.position.set(18, 2); // walk back in: enter fires now
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1);
  });

  test('the rect tracks a moved NPC via its offsets', () => {
    let {world, npcMotion, trigger} = createNpcWorld();

    world.start();
    npcMotion.position.set(292, 180); // strolled 3 tiles east
    world.update(tick());

    expect(trigger.rect.x).toBe(288); // 292 − 4
    expect(trigger.rect.y).toBe(176); // 180 − 4
    expect(trigger.rect.width).toBe(24); // size untouched
    expect(trigger.rect.height).toBe(28);
  });

  test('the moved talk zone is what enter fires against', () => {
    let {world, npcMotion} = createNpcWorld();

    world.start();
    world.update(tick()); // seeds: outside

    npcMotion.position.set(4, 4); // rect re-anchors to (0, 0): onto the player
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1);
  });

  test('a motionless trigger keeps its authored rect', () => {
    let {world, trigger} = createWorld({x: 0, y: 0}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick());

    expect(trigger.getComponent(TriggerComponent).rect).toMatchObject({x: 16, y: 0});
  });
});
