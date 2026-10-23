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
    // Closes the menu, the Options window or the travel window when one is on
    // top. Otherwise, on the night screen, it opens the menu, also above a
    // story window.
    cancel: {keys: ['Escape']},
    increase: {keys: ['Equal', 'PageUp']},
    decrease: {keys: ['Minus', 'PageDown']},
  },
});
