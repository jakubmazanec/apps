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
    // KeyE only (the arbitration precedent): Space and Enter stay with the
    // focus layer. No pointerTap here; all pointer input reaches dialogue
    // through pixi objects on the box and the prompt.
    interact: {keys: ['KeyE']},
    // Space and Enter page through an open dialogue box; dialogueInputSystem
    // gates the command on an active dialogue, so with no box on screen both
    // keys still belong to the focus layer (the arbitration rule above).
    advance: {keys: ['Enter', 'Space']},
  },
});

export const inputEntity = new Entity({components: [new InputComponent({input})]});
