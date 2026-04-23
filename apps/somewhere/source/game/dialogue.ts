import {Entity} from '../engine/ecs/Entity.js';
import {DialogueComponent} from './DialogueComponent.js';

// The dialogue singleton (query-per-singleton boilerplate; T2.15 world
// resources kills it later). The entity outlives the run, so world.onStart
// clears `active`: a mid-dialogue Quit leaves it set.
export const dialogueEntity = new Entity({
  components: [new DialogueComponent({active: null})],
});
