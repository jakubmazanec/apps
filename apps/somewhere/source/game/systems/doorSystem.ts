import {System} from '../../engine/ecs/System.js';
import {Vector} from '../../engine/utilities/Vector.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {dialogueCommandChannel} from '../events/dialogueCommandChannel.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {playersQuery} from '../queries/playersQuery.js';
import {findPromptEntity} from '../utilities/findPromptEntity.js';
import {getPositionForBoundingBoxCenter} from '../utilities/getPositionForBoundingBoxCenter.js';

/**
 * Turns a buffered interact press on a prompted same-map door (the one the
 * player stands in) into a teleport onto its target door (door → target door
 * by Tiled object id). The travelSystem twin: doors show the same bubble and
 * answer the same press as exits, so walking into one never teleports by
 * itself. Registered right after travelSystem, so `active` is still last
 * frame's state: the press that pages or closes a conversation can never also
 * teleport. One press keeps one meaning through the shared resolver — an exit
 * travels (travelSystem's type check), a door teleports (the type check
 * below), and a door never starts a script (dialogueSystem's guard).
 */
export const doorSystem = new System({
  displayName: 'Door system',
  // The component filter gives this system the trigger entities: the
  // resolver's input set, which is also what door targets resolve against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    for (let command of dialogueCommandChannel.events) {
      if (command.type !== 'interact') {
        continue;
      }

      // The playerActionSystem lock: no teleport while a conversation runs.
      if (dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null) {
        continue;
      }

      let entity = findPromptEntity(system.entities);
      let door = entity?.getComponent(TriggerComponent);

      if (door?.type !== 'door') {
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

      // Already loud in spawnMap's validation; the door is inert.
      if (targetTrigger === undefined) {
        continue;
      }

      let playerEntity = playersQuery.getFirst();
      let graphics = playerEntity.getComponent(GraphicsComponent);

      // The player always carries GraphicsComponent; the query just cannot
      // prove it (the triggerSystem guard).
      if (graphics === undefined) {
        continue;
      }

      let motion = playerEntity.getComponent(MotionComponent);
      let position = getPositionForBoundingBoxCenter(
        new Vector(
          targetTrigger.rect.x + targetTrigger.rect.width / 2,
          targetTrigger.rect.y + targetTrigger.rect.height / 2,
        ),
        graphics.boundingBox,
      );

      motion.position.set(position.x, position.y);
      // Cancel an active tap target so motionSystem doesn't walk the player
      // straight back toward the door it just left.
      motion.target = undefined;
      motion.velocity.set(0, 0);
      // Arrival inside the target fires nothing; it re-arms after a genuine
      // exit (triggerSystem sees inside + isPlayerInside already true).
      targetTrigger.isPlayerInside = true;

      // Double-press guard (the travelSystem precedent): one teleport per
      // frame. A second command would resolve the target door the player now
      // stands in and bounce them straight back.
      break;
    }
  },
});
