import {afterEach, describe, expect, test, vitest} from 'vitest';

import {
  audioBufferAsset,
  setAudioDecodeContext,
} from '../source/engine/pixi-tools/audioBufferAsset.js';

describe('audioBufferAsset.loader.test', () => {
  test('matches audio extensions and rejects others', () => {
    let test = audioBufferAsset.loader.test!;

    expect(test('sounds/ui-click.ogg')).toBe(true);
    expect(test('sounds/bump.wav')).toBe(true);
    expect(test('sounds/UI-CLICK.OGG')).toBe(true); // case-insensitive
    expect(test('sprites/character.png')).toBe(false);
    expect(test('maps/map.json')).toBe(false);
  });
});

describe('audioBufferAsset.loader.load', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
    vitest.unstubAllGlobals();
  });

  test('decodes via the provided context and returns the AudioBuffer', async () => {
    let bytes = new ArrayBuffer(8);
    let buffer = {length: 1} as unknown as AudioBuffer;
    let decodeAudioData = vitest.fn<() => Promise<AudioBuffer>>(async () => buffer);

    setAudioDecodeContext({decodeAudioData} as unknown as AudioContext);
    vitest.stubGlobal(
      'fetch',
      vitest.fn<() => Promise<{arrayBuffer: () => Promise<ArrayBuffer>}>>(async () => ({
        arrayBuffer: async () => bytes,
      })),
    );

    let result = await audioBufferAsset.loader.load!<AudioBuffer>('sounds/ui-click.ogg');

    expect(decodeAudioData).toHaveBeenCalledWith(bytes);
    expect(result).toBe(buffer);
  });

  test('throws when no decode context has been set', async () => {
    vitest.resetModules();

    let {audioBufferAsset: fresh} = await import('../source/engine/pixi-tools/audioBufferAsset.js');

    await expect(fresh.loader.load!('sounds/ui-click.ogg')).rejects.toThrow(
      'Audio decode context is not set',
    );
  });
});
