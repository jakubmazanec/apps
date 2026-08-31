import {System} from '../../engine/ecs/System.js';
import {InputComponent} from '../../engine/input/InputComponent.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {DialogueCommand} from '../events/DialogueCommand.js';
import {dialogueCommandChannel} from '../events/dialogueCommandChannel.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {inputQuery} from '../queries/inputQuery.js';

// Translates action edges into dialogue commands; pointer paths push the same
// commands from pixi handlers in dialogueBoxSystem. This system only
// produces; dialogueSystem is the one deciding consumer. Paging is `interact`:
// Enter and Space belong to the focus layer, which activates choice buttons.
export const dialogueInputSystem = new System({
  components: [],
  displayName: 'Dialogue input system',
  onUpdate: () => {
    let {input} = inputQuery.getFirst().getComponent(InputComponent);

    // Pushed even with no dialogue and no NPC in range (cheap, rare);
    // dialogueSystem drops it when it means nothing.
    if (input.pressed('interact')) {
      dialogueCommandChannel.push(new DialogueCommand({type: 'interact'}));
    }

    // Gate on an active dialogue so plain walking causes no channel churn.
    if (dialogueQuery.getFirst().getComponent(DialogueComponent).active === null) {
      return;
    }

    if (input.pressed('move-up')) {
      dialogueCommandChannel.push(new DialogueCommand({type: 'up'}));
    }

    if (input.pressed('move-down')) {
      dialogueCommandChannel.push(new DialogueCommand({type: 'down'}));
    }
  },
});
