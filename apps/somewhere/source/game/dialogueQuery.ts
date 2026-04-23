import {EntityQuery} from '../engine/ecs/EntityQuery.js';
import {DialogueComponent} from './DialogueComponent.js';

export const dialogueQuery = new EntityQuery({
  components: [DialogueComponent],
});
