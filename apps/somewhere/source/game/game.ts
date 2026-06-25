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
        {name: 'banner', sources: ['banner.png']},
        {name: 'banner-hover', sources: ['banner-hover.png']},
        {name: 'banner-active', sources: ['banner-active.png']},
        {name: 'toggle-unchecked', sources: ['toggle-unchecked.png']},
        {name: 'toggle-checked', sources: ['toggle-checked.png']},
        {name: 'toggle-hovered', sources: ['toggle-hovered.png']},
        {name: 'toggle-hovered-checked', sources: ['toggle-hovered-checked.png']},
        {name: 'toggle-disabled', sources: ['toggle-disabled.png']},
        {name: 'toggle-disabled-checked', sources: ['toggle-disabled-checked.png']},
        {name: 'text-input-normal', sources: ['text-input-normal.png']},
        {name: 'text-input-hovered', sources: ['text-input-hovered.png']},
        {name: 'text-input-disabled', sources: ['text-input-disabled.png']},
        {name: 'button-normal', sources: ['button-normal.png']},
        {name: 'button-hovered', sources: ['button-hovered.png']},
        {name: 'button-active', sources: ['button-active.png']},
        {name: 'button-disabled', sources: ['button-disabled.png']},
        {name: 'focus-ring', sources: ['focus-ring.png']},
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

/* eslint-disable unicorn/prefer-global-this -- browser-only debug handle: SSR-guarded by `typeof window` and typed via the `Window` augmentation above; `globalThis` would force a `var` global (vars-on-top) and a no-typeof-undefined/no-unnecessary-condition conflict on the guard */
if (typeof window !== 'undefined') {
  window.game = game;
}
/* eslint-enable unicorn/prefer-global-this */
