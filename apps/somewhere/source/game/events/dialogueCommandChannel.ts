import {EventChannel} from 'tellurion';

import {DialogueCommand} from './DialogueCommand.js';

// One game-owned channel, multiple producers (dialogueInputSystem, pointer
// handlers in dialogueBoxSystem), exactly one deciding consumer
// (dialogueSystem): that is what makes one command mean exactly one thing.
export const dialogueCommandChannel = new EventChannel({
  event: DialogueCommand,
  displayName: 'Dialogue command',
});
