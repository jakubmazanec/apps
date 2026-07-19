import * as pixi from 'pixi.js';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {DialogueCommand, type DialogueCommandType} from '../source/game/DialogueCommand.js';
import {dialogueCommandChannel} from '../source/game/dialogueCommandChannel.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {dialogueSystem} from '../source/game/dialogueSystem.js';
import {flags, resetFlags} from '../source/game/flags.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {TriggerEnter} from '../source/game/TriggerEnter.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';

function tick(deltaMS = 0): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

function createNpc(properties?: Record<string, boolean | number | string>) {
  let entity = new Entity({
    components: [
      new TriggerComponent({
        id: 1,
        name: 'mira',
        type: 'npc',
        rect: new pixi.Rectangle(0, 0, 16, 16),
        properties: properties ?? {dialogue: 'mira'},
      }),
    ],
  });

  entity.getComponent(TriggerComponent).isPlayerInside = true;

  return entity;
}

function createSignZone() {
  return new Entity({
    components: [
      new TriggerComponent({
        id: 2,
        name: 'keep-out-sign',
        type: 'zone',
        rect: new pixi.Rectangle(0, 32, 16, 8),
        properties: {dialogue: 'sign'},
      }),
    ],
  });
}

let activeWorld: World | null = null;

function createHarness(triggers: Entity[]) {
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let motion = new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)});
  let player = new Entity({components: [new PlayerComponent({name: 'Test'}), motion]});
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(dialogueCommandChannel)
        .addEventChannel(triggerEnterChannel)
        .addEntityQuery(dialogueQuery)
        .addEntityQuery(playersQuery)
        .addSystem(dialogueSystem)
        .addEntity(dialogueEntity)
        .addEntity(player);

      for (let trigger of triggers) {
        w.addEntity(trigger);
      }
    },
  });

  activeWorld = world;

  let component = dialogueEntity.getComponent(DialogueComponent);

  return {world, component, motion, player};
}

// Commands pushed outside an update land in the write buffer; the manual swap
// makes them current for the next update (the zoneSystem test pattern). Push
// all same-frame commands before one swap.
function pushCommands(...commands: Array<{type: DialogueCommandType; index?: number}>) {
  for (let command of commands) {
    dialogueCommandChannel.push(new DialogueCommand(command));
  }

  dialogueCommandChannel.swap();
}

describe('dialogueSystem', () => {
  beforeEach(() => {
    resetFlags();
  });

  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('one interact starts the standing NPC script without advancing it', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(component.active).not.toBeNull();
    expect(component.active?.phase).toBe('revealing');
    expect(component.active?.revealedCount).toBe(0); // zero delta: started, not advanced
    expect(component.active?.pageText).toBe('Welcome to Somewhere.');
  });

  test('interact advances while a dialogue is active', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    pushCommands({type: 'interact'});
    world.update(tick());

    // The greeting node has choices, so the skip lands in choosing.
    expect(component.active?.phase).toBe('choosing');
    expect(component.active?.revealedCount).toBe('Welcome to Somewhere.'.length);
  });

  test('the interact start clears the tap target and the velocity', () => {
    let {world, motion} = createHarness([createNpc()]);

    world.start();
    motion.target = new Vector(50, 50);
    motion.velocity.set(2, 0);
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
  });

  test('a zone enter with a dialogue property auto-starts and stops the walking player', () => {
    let sign = createSignZone();
    let {world, component, motion, player} = createHarness([sign]);

    world.start();
    motion.velocity.set(2, 0);
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(component.active?.pageText).toBe('KEEP OUT.');
    expect(motion.velocity.x).toBe(0);
  });

  test('an enter arriving while a dialogue is active is dropped for good', () => {
    let sign = createSignZone();
    let {world, component, player} = createHarness([sign]);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    let first = component.active;

    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(component.active).toBe(first); // not restarted
  });

  test('dialogue-scoped commands are dropped while none is active', () => {
    let {world, component} = createHarness([]);

    world.start();
    pushCommands(
      {type: 'advance'},
      {type: 'up'},
      {type: 'down'},
      {type: 'select', index: 0},
      {type: 'choose', index: 0},
    );
    world.update(tick());

    expect(component.active).toBeNull();
  });

  test('a text-panel tap (advance) is dropped while choosing', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    pushCommands({type: 'interact'});
    world.update(tick()); // choosing

    pushCommands({type: 'advance'});
    world.update(tick());

    expect(component.active?.phase).toBe('choosing'); // a stray tap cannot confirm
  });

  test('up/down move the selection, select hovers, choose confirms', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    pushCommands({type: 'interact'});
    world.update(tick()); // choosing, index 0

    pushCommands({type: 'down'});
    world.update(tick());

    expect(component.active?.selectedIndex).toBe(1);

    pushCommands({type: 'select', index: 0});
    world.update(tick());

    expect(component.active?.selectedIndex).toBe(0);

    pushCommands({type: 'choose', index: 1});
    world.update(tick());

    expect(component.active?.pageText).toBe('Suit yourself.'); // the inline dead-end tail
  });

  test('a started dialogue ticks the same frame', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick(1000)); // 40 chars/s x 1s covers the whole first page

    expect(component.active?.revealedCount).toBe('Welcome to Somewhere.'.length);
  });

  test('active clears when the dialogue ends, and terminal onEnter flags stick', () => {
    let sign = createSignZone();
    let {world, component, player} = createHarness([sign]);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity: player, trigger: sign}));
    triggerEnterChannel.swap();
    world.update(tick());

    pushCommands({type: 'interact'}); // skip the reveal
    world.update(tick());
    pushCommands({type: 'interact'}); // idle at last page, no next: ends
    world.update(tick());

    expect(component.active).toBeNull();
    expect(flags.metMira).toBeFalsy(); // the sign never touches flags
  });

  test('a paused world freezes the reveal', () => {
    let {world, component} = createHarness([createNpc()]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());
    world.pause();
    world.update(tick(1000));

    expect(component.active?.revealedCount).toBe(0);

    world.resume();
    world.update(tick(1000));

    expect(component.active?.revealedCount).toBe('Welcome to Somewhere.'.length);
  });

  test('an unregistered npc dialogue name never starts (inert NPC)', () => {
    let {world, component} = createHarness([createNpc({dialogue: 'nope'})]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(component.active).toBeNull();
  });

  test('interact outside any npc trigger does nothing', () => {
    let npc = createNpc();

    npc.getComponent(TriggerComponent).isPlayerInside = false;

    let {world, component} = createHarness([npc]);

    world.start();
    pushCommands({type: 'interact'});
    world.update(tick());

    expect(component.active).toBeNull();
  });
});
