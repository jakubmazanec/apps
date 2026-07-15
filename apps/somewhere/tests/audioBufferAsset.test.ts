import {afterEach, describe, expect, test, vi} from 'vitest';

import {audioBufferAsset, setAudioDecodeContext} from '../source/pixi-tools/audioBufferAsset.js';

describe('audioBufferAsset.loader.test', () => {
  test('matches audio extensions and rejects others', () => {
    let test = audioBufferAsset.loader.test!;

    expect(test('sounds/ui-click.ogg')).toBeTruthy();
    expect(test('sounds/bump.wav')).toBeTruthy();
    expect(test('sounds/UI-CLICK.OGG')).toBeTruthy(); // case-insensitive
    expect(test('sprites/character.png')).toBeFalsy();
    expect(test('maps/map.json')).toBeFalsy();
  });
});

describe('audioBufferAsset.loader.load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('decodes via the provided context and returns the AudioBuffer', async () => {
    let bytes = new ArrayBuffer(8);
    let buffer = {length: 1} as unknown as AudioBuffer;
    let decodeAudioData = vi.fn(async () => buffer);

    setAudioDecodeContext({decodeAudioData} as unknown as AudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({arrayBuffer: async () => bytes})),
    );

    let result = await audioBufferAsset.loader.load!<AudioBuffer>('sounds/ui-click.ogg');

    expect(decodeAudioData).toHaveBeenCalledWith(bytes);
    expect(result).toBe(buffer);
  });

  test('throws when no decode context has been set', async () => {
    vi.resetModules();

    let {audioBufferAsset: fresh} = await import('../source/pixi-tools/audioBufferAsset.js');

    await expect(fresh.loader.load!('sounds/ui-click.ogg')).rejects.toThrow(
      'Audio decode context is not set',
    );
  });
});
