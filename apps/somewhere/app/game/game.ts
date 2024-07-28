import {Game} from '../engine/Game.js';

export const game = await Game.create({
  assetBundles: [
    {
      name: 'default',
      assets: [
        // {name: 'tileset', sources: ['tileset.json']},
        {name: 'tileset2', sources: ['tileset2.json']},
      ],
    },
    {
      name: 'game',
      assets: [
        // {
        //   name: 'character',
        //   sources: ['character.json'],
        // },
        {
          name: 'character2',
          sources: ['character2.json'],
        },
        // {
        //   name: 'map',
        //   sources: ['map.json'],
        // },
        {
          name: 'map2',
          sources: ['map2.json'],
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
