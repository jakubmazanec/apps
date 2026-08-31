import {EntityQuery} from '../../engine/ecs/EntityQuery.js';
import {DialogueComponent} from '../components/DialogueComponent.js';

export const dialogueQuery = new EntityQuery({
  components: [DialogueComponent],
});
