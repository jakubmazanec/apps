import {System} from '../../engine/ecs/System.js';
import {Vector} from '../../engine/utilities/Vector.js';
import {CameraComponent} from '../components/CameraComponent.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {InputComponent} from '../components/InputComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {PlayerComponent} from '../components/PlayerComponent.js';
import {cameraQuery} from '../queries/cameraQuery.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {inputQuery} from '../queries/inputQuery.js';
import {getPositionForBoundingBoxCenter} from '../utilities/getPositionForBoundingBoxCenter.js';
import {MAX_SPEED} from './motionSystem.js';

export const playerSystem = new System({
  displayName: 'Player system',
  components: [PlayerComponent, MotionComponent, GraphicsComponent],
  onUpdate: (delta, system) => {
    // Dialogue movement lock, game policy: skipping the whole body also
    // neutralizes view-level move-to taps during dialogue. Velocity was
    // already zeroed by dialogueSystem on start.
    if (dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null) {
      return;
    }

    let {input} = inputQuery.getFirst().getComponent(InputComponent);
    let isUpHeld = input.held('move-up');
    let isDownHeld = input.held('move-down');
    let isLeftHeld = input.held('move-left');
    let isRightHeld = input.held('move-right');
    let isMoveHeld = isUpHeld || isDownHeld || isLeftHeld || isRightHeld;
    let directionX = (isRightHeld ? 1 : 0) - (isLeftHeld ? 1 : 0);
    let directionY = (isDownHeld ? 1 : 0) - (isUpHeld ? 1 : 0);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);

      if (isMoveHeld) {
        // Keys beat taps in a same-frame tie and take over from an active tap
        // target. Normalized so diagonals are not faster; opposite keys cancel
        // to a zero vector, which normalize leaves at zero.
        motion.target = undefined;
        motion.velocity.set(directionX, directionY).normalize(MAX_SPEED);
      } else if (input.pressed('move-to')) {
        let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);
        let {boundingBox} = entity.getComponent(GraphicsComponent);

        motion.target = getPositionForBoundingBoxCenter(
          new Vector(
            input.tapPosition.x + cameraPosition.x,
            input.tapPosition.y + cameraPosition.y,
          ),
          boundingBox,
        );
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      } else if (motion.target === undefined) {
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      }
    }
  },
});
