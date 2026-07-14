import {EntityQuery} from '../engine/ecs/EntityQuery.js';
import {InputComponent} from '../engine/input/InputComponent.js';

export const inputQuery = new EntityQuery({
  components: [InputComponent],
});
