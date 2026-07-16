import {Game} from '../engine/app/Game.js';

export const game = new Game({
  focusKeys: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    next: ['Tab'],
    previous: ['Shift+Tab'],
    activate: ['Enter', 'Space'],
  },
  assetBundles: [
    {
      name: 'default',
      assets: [
        {name: 'tileset', sources: ['tileset.json']},
        {name: 'monogram', sources: ['monogram.fnt']},
        {name: 'monogram-outline', sources: ['monogram-outline.fnt']},
        {name: 'ui', sources: ['ui.json']},
        {name: 'ui-click', sources: ['ui-click.wav']},
        {name: 'ui-key', sources: ['ui-key.wav']},
        {name: 'ui-error', sources: ['ui-error.wav']},
        {name: 'menu-music', sources: ['menu-music.wav']},
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
        {
          name: 'spark',
          sources: ['spark.json'],
        },
        {name: 'bump', sources: ['bump.wav']},
        {name: 'game-music', sources: ['game-music.wav']},
      ],
    },
  ],
});

declare global {
  interface Window {
    game: typeof game;
  }
}

/* eslint-disable unicorn/prefer-global-this -- browser-only debug handle: SSR-guarded by `typeof window` and typed via the `Window` augmentation above; `globalThis` would force a `var` global (vars-on-top) and a no-typeof-undefined/no-unnecessary-condition conflict on the guard */
if (typeof window !== 'undefined') {
  window.game = game;
}
/* eslint-enable unicorn/prefer-global-this */
