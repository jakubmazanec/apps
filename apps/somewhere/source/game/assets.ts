import {GameAssets} from '../engine/app/GameAssets.js';

export const assets = new GameAssets({
  bundles: [
    {
      name: 'default',
      spritesheets: {ui: ['ui.json']},
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
      spritesheets: {character: ['character.json'], spark: ['spark.json']},
      tilemaps: {map: ['map.json']},
      sounds: {bump: ['bump.wav'], 'game-music': ['game-music.wav']},
    },
  ],
});
