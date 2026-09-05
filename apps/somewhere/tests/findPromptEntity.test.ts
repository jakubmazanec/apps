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
import {playersQuery} from '../source/game/queries/playersQuery.js';
import {findPromptEntity} from '../source/game/utilities/findPromptEntity.js';

function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

function createTrigger(
  type: string,
  rect: pixi.Rectangle,
  properties: Record<string, boolean | number | string> = {},
  id = 1,
): Entity {
  return new Entity({
    components: [new TriggerComponent({id, name: `${type}-${id}`, type, rect, properties})],
  });
}

let activeWorld: World | null = null;

// findPromptEntity reads the player through playersQuery, so the harness only
// needs the query registered and a player with a bounding box.
function createPlayerWorld(x: number, y: number): void {
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      new MotionComponent({position: new Vector(x, y), velocity: new Vector(0, 0)}),
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(playersQuery).addEntity(player);
    },
  });

  activeWorld = world;
  world.start();
}

describe(findPromptEntity, () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('an exit resolves through the near band without any dialogue property', () => {
    createPlayerWorld(4, 20); // box 4..12 x 20..28; rect 0..16 y 0..16, band reaches y 28

    let exit = createTrigger('exit', new pixi.Rectangle(0, 0, 16, 16), {
      map: 'shop-interior',
      entry: 'entrance',
    });

    expect(findPromptEntity([exit])).toBe(exit);
  });

  test('an exit resolves while the player stands inside it', () => {
    createPlayerWorld(4, 4);

    let exit = createTrigger('exit', new pixi.Rectangle(0, 0, 16, 16));

    expect(findPromptEntity([exit])).toBe(exit);
  });

  test('an exit beyond the band does not resolve', () => {
    createPlayerWorld(4, 50); // box top 50 > rect bottom 16 + 12

    let exit = createTrigger('exit', new pixi.Rectangle(0, 0, 16, 16));

    expect(findPromptEntity([exit])).toBeNull();
  });

  test('first match wins across an overlapping npc and exit', () => {
    createPlayerWorld(4, 4);

    let npc = createTrigger('npc', new pixi.Rectangle(0, 0, 16, 16), {dialogue: 'mira'}, 2);

    npc.getComponent(TriggerComponent).isPlayerInside = true;

    let exit = createTrigger('exit', new pixi.Rectangle(0, 0, 16, 16), {}, 3);

    expect(findPromptEntity([npc, exit])).toBe(npc);
    expect(findPromptEntity([exit, npc])).toBe(exit);
  });

  test('npc and zone resolution is unchanged', () => {
    createPlayerWorld(4, 4);

    let npc = createTrigger('npc', new pixi.Rectangle(0, 0, 16, 16), {dialogue: 'mira'}, 2);

    npc.getComponent(TriggerComponent).isPlayerInside = true;

    let farZone = createTrigger(
      'zone',
      new pixi.Rectangle(100, 100, 16, 16),
      {dialogue: 'sign'},
      4,
    );

    expect(findPromptEntity([farZone, npc])).toBe(npc);
  });

  test('a door resolves while the player stands inside it, without any dialogue property', () => {
    createPlayerWorld(4, 4);

    let door = createTrigger('door', new pixi.Rectangle(0, 0, 16, 16), {target: 2});

    expect(findPromptEntity([door])).toBe(door);
  });

  test('a door in the approach band alone does not resolve (unlike an exit)', () => {
    createPlayerWorld(4, 20); // box 4..12 x 20..28; rect 0..16 y 0..16, a band would reach y 28

    let door = createTrigger('door', new pixi.Rectangle(0, 0, 16, 16), {target: 2});

    expect(findPromptEntity([door])).toBeNull();
  });

  test('a door listed first never steals the prompt from a neighboring sign band', () => {
    // The village layout: the hut door (176, 176, 16x16) sits right under the
    // keep-out sign zone (192, 160, 16x14). Feet (196..204, 185..193) stand in
    // the sign's band and clear of the door's rect.
    createPlayerWorld(196, 185);

    let door = createTrigger('door', new pixi.Rectangle(176, 176, 16, 16), {target: 3}, 2);
    let sign = createTrigger('zone', new pixi.Rectangle(192, 160, 16, 14), {dialogue: 'sign'}, 6);

    expect(findPromptEntity([door, sign])).toBe(sign);
  });
});
