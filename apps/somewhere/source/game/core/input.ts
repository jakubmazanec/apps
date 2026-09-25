import {GameInput} from '../../engine/input/GameInput.js';

// One table: the focus half is consumed by Game's router, the actions half by
// world systems. A key may appear in exactly one entry (GameInput throws on a
// duplicate at construction), so nothing has to arbitrate at runtime.
export const input = new GameInput({
  focus: {
    up: {keys: ['ArrowUp']},
    down: {keys: ['ArrowDown']},
    left: {keys: ['ArrowLeft']},
    right: {keys: ['ArrowRight']},
    next: {keys: ['Tab']},
    previous: {keys: ['Shift+Tab']},
    activate: {keys: ['Enter', 'Space']},
    // Dismisses the topmost overlay; with nothing dismissible open the world
    // screen reads this same command and opens the pause menu.
    cancel: {keys: ['Escape']},
    increase: {keys: ['Equal', 'PageUp']},
    decrease: {keys: ['Minus', 'PageDown']},
  },
  actions: {
    // WASD only: arrows are focus navigation above, and one key cannot do both.
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-up': {keys: ['KeyW']},
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-down': {keys: ['KeyS']},
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-left': {keys: ['KeyA']},
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-right': {keys: ['KeyD']},
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-to': {pointerTap: true},
    // E runs a whole conversation: it starts, pages, and confirms the
    // highlighted choice, so the hand never leaves it. Enter and Space confirm
    // as well, through the focus layer's `activate` on the choice buttons.
    interact: {keys: ['KeyE']},
    // A second way into the pause menu. Escape cannot be shared with cancel:
    // a key may appear in exactly one entry.
    pause: {keys: ['KeyP']},
    spin: {keys: ['KeyQ']},
  },
});
