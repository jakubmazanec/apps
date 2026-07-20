import {System} from '../engine/ecs/System.js';
import {Vector} from '../engine/utilities/Vector.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';

export const doorSystem = new System({
  displayName: 'Door system',
  // The component filter gives this system the trigger entities, which is
  // exactly the set door targets resolve against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    for (let {entity, trigger} of triggerEnterChannel.events) {
      let door = trigger.getComponent(TriggerComponent);

      if (door.type !== 'door') {
        continue;
      }

      let {target} = door.properties;
      let targetTrigger;

      for (let other of system.entities) {
        let otherTrigger = other.getComponent(TriggerComponent);

        if (otherTrigger.id === target) {
          targetTrigger = otherTrigger;

          break;
        }
      }

      // Already loud in world.onStart's validation; the door is inert.
      if (targetTrigger === undefined) {
        continue;
      }

      let motion = entity.getComponent(MotionComponent);
      let {boundingBox} = entity.getComponent(GraphicsComponent);
      let position = getPositionForBoundingBoxCenter(
        new Vector(
          targetTrigger.rect.x + targetTrigger.rect.width / 2,
          targetTrigger.rect.y + targetTrigger.rect.height / 2,
        ),
        boundingBox,
      );

      motion.position.set(position.x, position.y);
      // Cancel an active tap target so motionSystem doesn't walk the player
      // straight back toward the door it just left.
      motion.target = undefined;
      motion.velocity.set(0, 0);
      // Arrival inside the target fires nothing; it re-arms after a genuine
      // exit (triggerSystem sees inside + isPlayerInside already true).
      targetTrigger.isPlayerInside = true;
    }
  },
});
