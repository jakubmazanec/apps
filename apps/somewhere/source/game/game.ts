import {Game} from '../engine/app/Game.js';
import {assets} from './assets.js';

export const game = new Game({
  assets,
  focusKeys: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    next: ['Tab'],
    previous: ['Shift+Tab'],
    activate: ['Enter', 'Space'],
  },
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
