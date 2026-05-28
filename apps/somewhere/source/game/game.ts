import {Game} from '../engine/app/Game.js';

export const game = new Game({
  assetBundles: [
    {
      name: 'default',
      assets: [
        {name: 'tileset', sources: ['tileset.json']},
        {name: 'monogram', sources: ['monogram.fnt']},
        {name: 'monogram-outline', sources: ['monogram-outline.fnt']},
        {name: 'banner', sources: ['banner.png']},
        {name: 'banner-hover', sources: ['banner-hover.png']},
        {name: 'banner-active', sources: ['banner-active.png']},
      ],
    },
    {
      name: 'game',
      assets: [
        {
          name: 'character',
          sources: ['character.json'],
        },
        {
          name: 'map',
          sources: ['map.json'],
        },
      ],
    },
  ],
});

declare global {
  interface Window {
    game: typeof game;
  }
}

if (typeof window !== 'undefined') {
  window.game = game;
}
