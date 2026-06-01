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
        {name: 'toggle-unchecked', sources: ['toggle-unchecked.png']},
        {name: 'toggle-checked', sources: ['toggle-checked.png']},
        {name: 'toggle-hovered', sources: ['toggle-hovered.png']},
        {name: 'toggle-hovered-checked', sources: ['toggle-hovered-checked.png']},
        {name: 'toggle-disabled', sources: ['toggle-disabled.png']},
        {name: 'toggle-disabled-checked', sources: ['toggle-disabled-checked.png']},
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
