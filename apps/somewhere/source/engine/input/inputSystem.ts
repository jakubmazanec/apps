import {System} from '../ecs/System.js';
import {InputComponent} from './InputComponent.js';

export const inputSystem = new System({
  displayName: 'Input system',
  components: [InputComponent],
  onUpdate: (ticker, system) => {
    // getFirst() throws loudly when the singleton entity is missing (the
    // cameraSystem precedent). Exactly one update() call per world update —
    // that single call IS the "drain edges once per sim step" contract, owned
    // by the system rather than by an entity-count assumption.
    system.getFirst().getComponent(InputComponent).input.update();
  },
});
