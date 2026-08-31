import {GameAssets} from '../../engine/app/GameAssets.js';

export const assets = new GameAssets({
  bundles: [
    {
      name: 'default',
      spritesets: {ui: ['ui.json']},
      fonts: {monogram: ['monogram.fnt'], 'monogram-outline': ['monogram-outline.fnt']},
      tilesets: {tileset: ['tileset.json']},
      sounds: {
        'ui-click': ['ui-click.wav'],
        'ui-key': ['ui-key.wav'],
        'ui-error': ['ui-error.wav'],
        'menu-music': ['menu-music.wav'],
      },
    },
    {
      name: 'game',
      spritesets: {
        spark: ['spark.json'],
        portraits: ['portraits.json'],
        'prompt-bubble': ['prompt-bubble.json'],
        characters: ['characters.json'],
      },
      tilemaps: {map: ['map.json'], 'shop-interior': ['shop-interior.json']},
      // Explicit tileset entries make loading deterministic behind the
      // loading screen; the tilemap loader would only lazily fetch them.
      tilesets: {
        'exterior-tileset': ['exterior-tileset.json'],
        'interior-tileset': ['interior-tileset.json'],
      },
      sounds: {
        bump: ['bump.wav'],
        chime: ['chime.wav'],
        blip: ['blip.wav'],
        'game-music': ['game-music.wav'],
      },
    },
  ],
});
