import {EntityQuery} from 'tellurion';

import {DialogueComponent} from '../components/DialogueComponent.js';

export const dialogueQuery = new EntityQuery({
  components: [DialogueComponent],
});
