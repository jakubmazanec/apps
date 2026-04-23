import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';
import {Sprite} from '../source/engine/graphics/Sprite.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';

const Finished = defineEvent<{name: string}>();
const t = () => pixi.Texture.WHITE;

function makeSpriteset(): Spriteset {
  return new Spriteset({
    textures: {},
    animations: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
      'walking-down': {textures: [t(), t()], speed: 0.15, loop: true},
      // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
      'standing-down': {textures: [t()], speed: 0.15, loop: true},
      spin: {textures: [t(), t()], speed: 0.5, loop: false},
      jab: {textures: [t(), t()], speed: 0.5, loop: false},
    },
  });
}

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

const NAMES = ['standing-down', 'walking-down', 'spin', 'jab'] as const;

function makeSprite(): Sprite<readonly ['standing-down', 'walking-down', 'spin', 'jab']> {
  return new Sprite({spriteset: makeSpriteset(), spriteNames: NAMES});
}

describe(Sprite, () => {
  describe('Sprite construction', () => {
    test('applies per-animation speed and loop from the Spriteset', () => {
      let sprite = makeSprite();

      expect(sprite.sprites['walking-down'].animationSpeed).toBe(0.15);
      expect(sprite.sprites['walking-down'].loop).toBe(true);
      expect(sprite.sprites.spin.animationSpeed).toBe(0.5);
      expect(sprite.sprites.spin.loop).toBe(false);
    });

    test('initial animation is visible at construction', () => {
      let sprite = makeSprite();

      expect(sprite.view.visible).toBe(true);
      expect(sprite.currentSpriteName).toBe('standing-down');
      expect(sprite.view.playing).toBe(true);
    });

    test('every sprite is off the shared clock (autoUpdate: false)', () => {
      let sprite = makeSprite();

      for (let name of NAMES) {
        expect(sprite.sprites[name].autoUpdate).toBe(false);
      }
    });
  });

  describe('Sprite.show precedence', () => {
    test('a loop show bounces off a playing one-shot; lands after completion', () => {
      let sprite = makeSprite();

      sprite.show('spin');
      sprite.show('walking-down');

      expect(sprite.currentSpriteName).toBe('spin');

      sprite.view.update(tick(100)); // completes the one-shot

      sprite.show('walking-down');

      expect(sprite.currentSpriteName).toBe('walking-down');
    });

    test('a one-shot replaces a playing one-shot', () => {
      let sprite = makeSprite();

      sprite.show('spin');
      sprite.show('jab');

      expect(sprite.currentSpriteName).toBe('jab');
    });

    test('re-showing the current one-shot restarts it', () => {
      let sprite = makeSprite();

      sprite.show('spin');
      sprite.view.update(tick(3)); // advance past frame 0

      expect(sprite.view.currentFrame).toBeGreaterThan(0);

      sprite.show('spin');

      expect(sprite.view.currentFrame).toBe(0);
    });
  });

  describe('Sprite.show emit', () => {
    test('completion pushes the emit exactly once, readable after the channel swap', () => {
      let channel = new EventChannel({event: Finished, displayName: 'Test finished'});
      let world = new World({
        onStart: (w) => {
          w.addEventChannel(channel);
        },
      });

      world.start();

      let sprite = makeSprite();

      sprite.show('spin', {emit: {channel, event: new Finished({name: 'spin'})}});
      sprite.view.update(tick(100)); // one-shot completes; push is buffered

      expect(channel.events).toHaveLength(0);

      world.update(tick(16)); // swap: the buffered event surfaces

      expect(channel.events).toHaveLength(1);

      sprite.view.update(tick(100)); // no second completion
      world.update(tick(16));

      expect(channel.events).toHaveLength(0);

      world.stop();
    });

    test('an interrupted one-shot discards its emit; the replacement keeps its own', () => {
      let channel = new EventChannel({event: Finished, displayName: 'Test finished'});
      let world = new World({
        onStart: (w) => {
          w.addEventChannel(channel);
        },
      });

      world.start();

      let sprite = makeSprite();

      sprite.show('spin', {emit: {channel, event: new Finished({name: 'spin'})}});
      sprite.show('jab', {emit: {channel, event: new Finished({name: 'jab'})}});
      sprite.view.update(tick(100));
      world.update(tick(16));

      expect(channel.events).toHaveLength(1);
      expect((channel.events[0] as {name: string}).name).toBe('jab');

      world.stop();
    });
  });

  describe('Sprite.show guards (DEV throws)', () => {
    test('unknown name throws', () => {
      let sprite = makeSprite();

      // @ts-expect-error -- deliberately unknown name
      expect(() => sprite.show('nope')).toThrow('doesn\'t contain animated sprite "nope"');
    });

    test('emit on a looping animation throws', () => {
      let channel = new EventChannel({event: Finished, displayName: 'Test finished'});
      let sprite = makeSprite();

      expect(() =>
        sprite.show('walking-down', {emit: {channel, event: new Finished({name: 'walk'})}}),
      ).toThrow('never completes');
    });
  });
});
