import {EntityQuery} from '../../engine/ecs/EntityQuery.js';
import {InputComponent} from '../components/InputComponent.js';

export const inputQuery = new EntityQuery({
  components: [InputComponent],
});
