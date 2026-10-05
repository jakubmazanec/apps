import * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

// Imported for its side effect: it registers the four Tellurion parsers with Pixi.
import '../source/app/GameAssets.js';

describe('Tellurion asset parsers', () => {
  test('register without a parser id conflict warning', async () => {
    let warn = vitest.spyOn(console, 'warn').mockReturnValue(undefined);

    await pixi.Assets.init();
    // Any load runs Pixi's parser validation, which is where the conflict is reported.
    await pixi.Assets.loader.load('data:application/json,{}');

    // Pixi prefixes its warnings with a separate "PixiJS Warning: " argument, so join them all.
    let conflicts = warn.mock.calls.filter((call) => call.join(' ').includes('parser id conflict'));

    warn.mockRestore();

    expect(conflicts).toEqual([]);
  });
});
