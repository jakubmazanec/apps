import {System} from '../../engine/ecs/System.js';
import {doRectanglesOverlap} from '../../engine/utilities/doRectanglesOverlap.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {TriggerEnter} from '../events/TriggerEnter.js';
import {triggerEnterChannel} from '../events/triggerEnterChannel.js';
import {TriggerExit} from '../events/TriggerExit.js';
import {triggerExitChannel} from '../events/triggerExitChannel.js';
import {playersQuery} from '../queries/playersQuery.js';

export const triggerSystem = new System({
  displayName: 'Trigger system',
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    let playerEntity = playersQuery.getFirst();
    let graphics = playerEntity.getComponent(GraphicsComponent);

    // The player always carries GraphicsComponent; the query just cannot
    // prove it (it only requires Player + Motion).
    if (graphics === undefined) {
      return;
    }

    let {position} = playerEntity.getComponent(MotionComponent);
    let {boundingBox} = graphics;
    let playerX = position.x + boundingBox.x;
    let playerY = position.y + boundingBox.y;

    for (let entity of system.entities) {
      let trigger = entity.getComponent(TriggerComponent);
      // A strolling NPC carries its talk zone: re-anchor the rect to the
      // just-resolved position (this system runs right after motionSystem, so
      // tracking is exact within the frame). Doors and zones have no
      // MotionComponent and keep their authored rect.
      let motion = entity.getComponent(MotionComponent);

      if (motion !== undefined) {
        trigger.rect.x = motion.position.x + trigger.rectOffsetX;
        trigger.rect.y = motion.position.y + trigger.rectOffsetY;
      }

      let isInside = doRectanglesOverlap(
        playerX,
        playerY,
        boundingBox.width,
        boundingBox.height,
        trigger.rect.x,
        trigger.rect.y,
        trigger.rect.width,
        trigger.rect.height,
      );

      // First test: seed from the current overlap without emitting, so a
      // restored save already inside a door or zone stays silent on load.
      if (trigger.isPlayerInside === undefined) {
        trigger.isPlayerInside = isInside;

        continue;
      }

      if (isInside && !trigger.isPlayerInside) {
        triggerEnterChannel.push(new TriggerEnter({entity: playerEntity, trigger: entity}));
      } else if (!isInside && trigger.isPlayerInside) {
        triggerExitChannel.push(new TriggerExit({entity: playerEntity, trigger: entity}));
      }

      trigger.isPlayerInside = isInside;
    }
  },
});
