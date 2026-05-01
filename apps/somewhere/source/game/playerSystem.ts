import type * as pixi from 'pixi.js';

import {System} from '../engine/ecs/System.js';
import {Vector} from '../engine/utilities/Vector.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {game} from './game.js';
import {MotionComponent} from './MotionComponent.js';
import {PlayerComponent} from './PlayerComponent.js';

let pointerTapHandler: ((event: pixi.FederatedPointerEvent) => void) | null = null;

export const playerSystem = new System({
  displayName: 'Player system',
  components: [PlayerComponent, MotionComponent],
  onAdd: (system) => {
    pointerTapHandler = (event) => {
      let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);

      for (let entity of system.entities) {
        let motion = entity.getComponent(MotionComponent);

        motion.target = new Vector(
          event.clientX / 1 + cameraPosition.x - 32, // TODO: 32 is from the bounding box, fix it sthe value is used directly, not as a cosntant
          event.clientY / 1 + cameraPosition.y - 60, // TODO: 60 is from the bounding box, fix it sthe value is used directly, not as a cosntant
        );
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      }
    };

    game.on('pointertap', pointerTapHandler);
  },
  onRemove: () => {
    if (pointerTapHandler) {
      game.off('pointertap', pointerTapHandler);
      pointerTapHandler = null;
    }
  },
  onUpdate: (delta, system) => {},
  onAddEntity: (entity, system) => {},
});
