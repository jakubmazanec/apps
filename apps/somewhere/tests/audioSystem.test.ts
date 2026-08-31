import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {GameAssets} from '../source/engine/app/GameAssets.js';
import {type AudioMixer} from '../source/engine/audio/AudioMixer.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';
import {AudioComponent} from '../source/game/components/AudioComponent.js';
import {PlaySoundEvent} from '../source/game/events/PlaySoundEvent.js';
import {audioSystem} from '../source/game/systems/audioSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// audioSystem is a module-level singleton: every test must world.stop() so the
// next test's addSystem doesn't hit the already-has-a-world throw.
describe('audioSystem', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('plays one sfx per drained PlaySoundEvent, then does not replay it', () => {
    let buffer = {} as unknown as AudioBuffer;
    let assets = new GameAssets({bundles: [{name: 'default', sounds: {bump: ['bump.wav']}}]});

    // Spied rather than cached: GameAssets.sound checks `instanceof AudioBuffer`,
    // which the fake buffer is not.
    vitest.spyOn(assets, 'sound').mockReturnValue(buffer);

    let plays: Array<{buffer: unknown; bus: string}> = [];
    let mixer = {
      play(playedBuffer: AudioBuffer, options: {bus: string}) {
        plays.push({buffer: playedBuffer, bus: options.bus});
      },
    } as unknown as AudioMixer;
    let channel = new EventChannel({event: PlaySoundEvent, displayName: 'Play sound'});
    let entity = new Entity({components: [new AudioComponent({mixer, channel, assets})]});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem).addEntity(entity);
      },
    });

    world.start();
    channel.push(new PlaySoundEvent({name: 'bump'}));

    // Channels swap at the end of update(): the push is readable next frame.
    world.update(tick());

    expect(plays).toHaveLength(0);

    world.update(tick());

    expect(plays).toEqual([{buffer, bus: 'sfx'}]);

    world.update(tick()); // drained; no replay

    expect(plays).toHaveLength(1);

    world.stop();
  });

  test('throws loudly when the audio entity is missing', () => {
    let channel = new EventChannel({event: PlaySoundEvent});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem);
      },
    });

    world.start();

    // Call the system directly rather than world.update(): a throw inside
    // world.update() would leave the world's updating flag set and make
    // stop() impossible, poisoning the module-level system for later tests.
    expect(() => audioSystem.update(tick())).toThrow('No entity found!');

    world.stop();
  });

  test('propagates the accessor throw when a queued sound is not loaded', () => {
    let assets = new GameAssets({
      bundles: [{name: 'default', sounds: {missing: ['missing.wav']}}],
    });
    let mixer = {play: vitest.fn<() => void>()} as unknown as AudioMixer;
    let channel = new EventChannel({event: PlaySoundEvent});
    let entity = new Entity({components: [new AudioComponent({mixer, channel, assets})]});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem).addEntity(entity);
      },
    });

    world.start();
    channel.push(new PlaySoundEvent({name: 'missing'}));
    world.update(tick()); // swap: the event is now current

    // Drain directly so a throw does not strand the world's updating flag.
    expect(() => audioSystem.update(tick())).toThrow(`Sound "missing" wasn't loaded!`);

    world.stop();
  });
});
