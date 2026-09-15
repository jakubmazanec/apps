import {System} from '../../engine/ecs/System.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {dialogueCommandChannel} from '../events/dialogueCommandChannel.js';
import {
  findEntryPoint,
  getPendingTravel,
  isMapName,
  requestTravel,
} from '../levels/levelManager.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {findPromptEntity} from '../utilities/findPromptEntity.js';

/**
 * Turns a buffered interact press on a prompted exit into a pending travel;
 * the swap itself runs between frames in levelManager.flushPendingTravel.
 * Registered before dialogueSystem so `active` is still last frame's state:
 * the press that pages or closes a conversation can never also travel. One
 * press keeps one meaning through the shared resolver — an exit never starts
 * a script (dialogueSystem's guard) and an npc/zone never travels (the type
 * check below).
 */
export const travelSystem = new System({
  displayName: 'Travel system',
  // The component filter gives this system the trigger entities: the
  // resolver's input set.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    for (let command of dialogueCommandChannel.events) {
      if (command.type !== 'interact') {
        continue;
      }

      // The playerActionSystem lock: no travel while a conversation runs.
      if (dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null) {
        continue;
      }

      // Double-press guard: one travel per flush.
      if (getPendingTravel() !== null) {
        continue;
      }

      let entity = findPromptEntity(system.entities);
      let trigger = entity?.getComponent(TriggerComponent);

      if (trigger?.type !== 'exit') {
        continue;
      }

      // Already loud at spawn; silently inert here (the door precedent).
      let {map, entry} = trigger.properties;

      if (
        typeof map !== 'string' ||
        !isMapName(map) ||
        typeof entry !== 'string' ||
        findEntryPoint(map, entry) === null
      ) {
        continue;
      }

      requestTravel({mapName: map, entryName: entry});
    }
  },
});
