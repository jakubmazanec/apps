import {GameInput} from 'tellurion';

// Focus commands only: nothing in Foam polls game actions yet. A key may
// appear in exactly one entry (GameInput throws on a duplicate at
// construction).
export const input = new GameInput({
  focus: {
    up: {keys: ['ArrowUp']},
    down: {keys: ['ArrowDown']},
    left: {keys: ['ArrowLeft']},
    right: {keys: ['ArrowRight']},
    next: {keys: ['Tab']},
    previous: {keys: ['Shift+Tab']},
    activate: {keys: ['Enter', 'Space']},
    // Closes the topmost overlay: a story window, the menu or the Options
    // window. On the night screen with no overlay open, it opens the menu.
    cancel: {keys: ['Escape']},
    increase: {keys: ['Equal', 'PageUp']},
    decrease: {keys: ['Minus', 'PageDown']},
  },
});
