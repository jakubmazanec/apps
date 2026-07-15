import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {AudioComponent} from '../source/engine/audio/AudioComponent.js';
import {type AudioMixer} from '../source/engine/audio/AudioMixer.js';
import {audioSystem} from '../source/engine/audio/audioSystem.js';
import {PlaySound} from '../source/engine/audio/PlaySound.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// audioSystem is a module-level singleton: every test must world.stop() so the
// next test's addSystem doesn't hit the already-has-a-world throw.
describe('audioSystem', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('plays one sfx per drained PlaySound event, then does not replay it', () => {
    let buffer = {} as unknown as AudioBuffer;

    // The cast sidesteps Assets.get's overload typing in the spy (Sprite.test.ts precedent).
    vi.spyOn(pixi.Assets, 'get').mockReturnValue(buffer as never);

    let plays: Array<{buffer: unknown; bus: string}> = [];
    let mixer = {
      play(playedBuffer: AudioBuffer, options: {bus: string}) {
        plays.push({buffer: playedBuffer, bus: options.bus});
      },
    } as unknown as AudioMixer;
    let channel = new EventChannel({event: PlaySound, displayName: 'Play sound'});
    let entity = new Entity({components: [new AudioComponent({mixer, channel})]});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem).addEntity(entity);
      },
    });

    world.start();
    channel.push(new PlaySound({name: 'bump'}));

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
    let channel = new EventChannel({event: PlaySound});
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

  test('throws in DEV when a queued sound has no loaded buffer', () => {
    vi.spyOn(pixi.Assets, 'get').mockReturnValue(undefined as never);

    let mixer = {play: vi.fn()} as unknown as AudioMixer;
    let channel = new EventChannel({event: PlaySound});
    let entity = new Entity({components: [new AudioComponent({mixer, channel})]});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel);
        w.addSystem(audioSystem).addEntity(entity);
      },
    });

    world.start();
    channel.push(new PlaySound({name: 'missing'}));
    world.update(tick()); // swap: the event is now current

    // Drain directly so a throw does not strand the world's updating flag.
    expect(() => audioSystem.update(tick())).toThrow('missing');

    world.stop();
  });
});
