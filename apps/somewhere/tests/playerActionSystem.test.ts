import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {type GameInput} from '../source/engine/input/GameInput.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {assets} from '../source/game/assets.js';
import {playSoundChannel} from '../source/game/audio.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {inputQuery} from '../source/game/inputQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {playerActionFinishedChannel} from '../source/game/playerActionFinishedChannel.js';
import {playerActionSystem} from '../source/game/playerActionSystem.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime, deltaMS: deltaTime} as unknown as pixi.Ticker;
}

describe('playerActionSystem', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('spin press plays the one-shot; completion emits and chimes', () => {
    let t = () => pixi.Texture.WHITE;
    let characterSpriteset = new Spriteset({
      textures: {},
      animations: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
        'standing-down': {textures: [t()], speed: 0.15, loop: true},
        spin: {textures: [t(), t()], speed: 0.5, loop: false},
      },
    });

    vitest.spyOn(assets, 'spriteset').mockReturnValue(characterSpriteset);

    let isSpinPressed = true;
    let fakeInput = {
      pressed: (name: string) => name === 'spin' && isSpinPressed,
      held: () => false,
    } as unknown as GameInput;
    let inputEntity = new Entity({components: [new InputComponent({input: fakeInput})]});
    let dialogueEntity = new Entity({
      components: [new DialogueComponent({active: null})],
    });
    let player = new Entity({
      components: [
        new PlayerComponent({name: 'Test'}),
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {assetName: 'character', spriteNames: ['standing-down', 'spin']},
          boundingBox: new pixi.Rectangle(0, 10, 16, 10),
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(playerActionFinishedChannel)
          .addEventChannel(playSoundChannel)
          .addEntityQuery(inputQuery)
          .addEntityQuery(dialogueQuery)
          .addSystem(playerActionSystem)
          .addEntity(inputEntity)
          .addEntity(dialogueEntity)
          .addEntity(player);
      },
    });

    world.start();
    world.update(tick(16)); // spin pressed: show('spin', {emit})

    let {sprite} = player.getComponent(GraphicsComponent);

    expect(sprite.currentSpriteName).toBe('spin');

    isSpinPressed = false;
    sprite.view.update(tick(100)); // one-shot completes; PlayerActionFinished buffered
    world.update(tick(16)); // event surfaces; system pushes the chime
    world.update(tick(16)); // chime surfaces

    let sounds = playSoundChannel.events as ReadonlyArray<{name: string}>;

    expect(sounds).toHaveLength(1);
    expect(sounds[0]!.name).toBe('chime');

    world.stop();
  });

  test('an active dialogue locks out the spin action', () => {
    let t = () => pixi.Texture.WHITE;
    let characterSpriteset = new Spriteset({
      textures: {},
      animations: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
        'standing-down': {textures: [t()], speed: 0.15, loop: true},
        spin: {textures: [t(), t()], speed: 0.5, loop: false},
      },
    });

    vitest.spyOn(assets, 'spriteset').mockReturnValue(characterSpriteset);

    let fakeInput = {
      pressed: (name: string) => name === 'spin',
      held: () => false,
    } as unknown as GameInput;
    let inputEntity = new Entity({components: [new InputComponent({input: fakeInput})]});
    let dialogueEntity = new Entity({
      components: [new DialogueComponent({active: {}} as never)],
    });
    let player = new Entity({
      components: [
        new PlayerComponent({name: 'Test'}),
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {assetName: 'character', spriteNames: ['standing-down', 'spin']},
          boundingBox: new pixi.Rectangle(0, 10, 16, 10),
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(playerActionFinishedChannel)
          .addEventChannel(playSoundChannel)
          .addEntityQuery(inputQuery)
          .addEntityQuery(dialogueQuery)
          .addSystem(playerActionSystem)
          .addEntity(inputEntity)
          .addEntity(dialogueEntity)
          .addEntity(player);
      },
    });

    world.start();
    world.update(tick(16)); // spin pressed, but dialogue is active: the lock bounces it off

    let {sprite} = player.getComponent(GraphicsComponent);

    expect(sprite.currentSpriteName).toBe('standing-down');

    world.stop();
  });

  test('a prefixed player shows the prefixed spin name', () => {
    let t = () => pixi.Texture.WHITE;
    let charactersSpriteset = new Spriteset({
      textures: {},
      animations: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
        'character-standing-down': {textures: [t()], speed: 0.15, loop: true},
        // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
        'character-spin': {textures: [t(), t()], speed: 0.5, loop: false},
      },
    });

    vitest.spyOn(assets, 'spriteset').mockReturnValue(charactersSpriteset);

    let fakeInput = {
      pressed: (name: string) => name === 'spin',
      held: () => false,
    } as unknown as GameInput;
    let inputEntity = new Entity({components: [new InputComponent({input: fakeInput})]});
    let dialogueEntity = new Entity({
      components: [new DialogueComponent({active: null})],
    });
    let player = new Entity({
      components: [
        new PlayerComponent({name: 'Test'}),
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {
            assetName: 'characters',
            character: 'character',
            spriteNames: ['standing-down', 'spin'],
          },
          boundingBox: new pixi.Rectangle(0, 10, 16, 10),
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(playerActionFinishedChannel)
          .addEventChannel(playSoundChannel)
          .addEntityQuery(inputQuery)
          .addEntityQuery(dialogueQuery)
          .addSystem(playerActionSystem)
          .addEntity(inputEntity)
          .addEntity(dialogueEntity)
          .addEntity(player);
      },
    });

    world.start();
    world.update(tick(16)); // spin pressed: show('character-spin', {emit})

    let {sprite} = player.getComponent(GraphicsComponent);

    expect(sprite.currentSpriteName).toBe('character-spin');

    world.stop();
  });
});
