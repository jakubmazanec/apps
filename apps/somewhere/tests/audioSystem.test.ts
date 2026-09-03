import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {type AudioMixer} from '../source/engine/audio/AudioMixer.js';
import {World} from '../source/engine/ecs/World.js';
import {assets} from '../source/game/core/assets.js';
import {playSoundChannel} from '../source/game/core/playSoundChannel.js';
import {PlaySoundEvent} from '../source/game/events/PlaySoundEvent.js';
import {audioSystem} from '../source/game/systems/audioSystem.js';

// The real mixer module builds an AudioContext at import (browser-only), so it
// is replaced wholesale; play() is the only surface the SFX path touches.
const play = vitest.hoisted(() =>
  vitest.fn<(buffer: AudioBuffer, options: {bus: string}) => void>(),
);

vitest.mock(import('../source/game/core/audio.js'), () => ({
  audio: {play} as unknown as AudioMixer,
}));

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// audioSystem is a module-level singleton: every test must world.stop() so the
// next test's addSystem doesn't hit the already-has-a-world throw.
describe('audioSystem', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
    play.mockClear();
  });

  test('plays one sfx per drained PlaySoundEvent, then does not replay it', () => {
    let buffer = {} as unknown as AudioBuffer;

    // Spied rather than cached: GameAssets.sound checks `instanceof AudioBuffer`,
    // which the fake buffer is not.
    vitest.spyOn(assets, 'sound').mockReturnValue(buffer);

    let world = new World({
      onStart: (w) => {
        w.addEventChannel(playSoundChannel).addSystem(audioSystem);
      },
    });

    world.start();
    playSoundChannel.push(new PlaySoundEvent({name: 'bump'}));

    // Channels swap at the end of update(): the push is readable next frame.
    world.update(tick());

    expect(play).not.toHaveBeenCalled();

    world.update(tick());

    expect(play).toHaveBeenCalledExactlyOnceWith(buffer, {bus: 'sfx'});

    world.update(tick()); // drained; no replay

    expect(play).toHaveBeenCalledTimes(1);

    world.stop();
  });

  test('propagates the accessor throw when a queued sound is not loaded', () => {
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(playSoundChannel).addSystem(audioSystem);
      },
    });

    world.start();
    playSoundChannel.push(new PlaySoundEvent({name: 'missing'}));
    world.update(tick()); // swap: the event is now current

    // Drain directly so a throw does not strand the world's updating flag.
    expect(() => audioSystem.update(tick())).toThrow(`Sound "missing" wasn't loaded!`);

    world.stop();
  });
});
