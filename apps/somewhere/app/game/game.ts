import {Game} from '../engine/Game.js';

export const game = await Game.create({
  assetBundles: [
    {
      name: 'default',
      assets: [{name: 'tileset', sources: ['tileset.json']}],
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
