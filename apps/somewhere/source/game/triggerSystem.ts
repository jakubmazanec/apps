import {System} from '../engine/ecs/System.js';
import {doRectanglesOverlap} from '../utilities/doRectanglesOverlap.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';
import {TriggerComponent} from './TriggerComponent.js';
import {TriggerEnter} from './TriggerEnter.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';
import {TriggerExit} from './TriggerExit.js';
import {triggerExitChannel} from './triggerExitChannel.js';

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
