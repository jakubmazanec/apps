import {Game} from '../engine/Game.js';

export const game = await Game.create({
  assetBundles: [
    {
      name: 'default',
      assets: [
        {
          name: 'tileset',
          sources: ['tileset.json'],
        },
      ],
    },
    {
      name: 'game',
      assets: [
        {
          name: 'character_1-8',
          sources: ['character_1-8.json'],
        },
        {
          name: 'map1',
          sources: ['map1.json'],
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
