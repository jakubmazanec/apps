import {GameAssets} from 'tellurion';

// One bundle: the main menu needs everything Foam has, and Game.init loads
// `default` before any screen exists.
export const assets = new GameAssets({
  bundles: [
    {
      name: 'default',
      spritesets: {ui: ['ui.json']},
      fonts: {monogram: ['monogram.fnt'], 'monogram-outline': ['monogram-outline.fnt']},
      sounds: {
        'ui-click': ['ui-click.wav'],
        'ui-error': ['ui-error.wav'],
        'menu-music': ['menu-music.wav'],
      },
    },
  ],
});
