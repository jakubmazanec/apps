import {Entity} from '../engine/ecs/Entity.js';
import {Input} from '../engine/input/Input.js';
import {InputComponent} from '../engine/input/InputComponent.js';

// WASD only — arrows stay with UI focus navigation (the spec's arbitration
// rule: UiRoot.moveFocus grabs the nearest focusable when nothing is focused,
// so arrow-bound movement would light the HUD focus ring).
export const input = new Input({
  bindings: {
    'move-up': {keys: ['KeyW']},
    'move-down': {keys: ['KeyS']},
    'move-left': {keys: ['KeyA']},
    'move-right': {keys: ['KeyD']},
    'move-to': {pointerTap: true},
  },
});

export const inputEntity = new Entity({components: [new InputComponent({input})]});
