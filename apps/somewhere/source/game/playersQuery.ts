import {EntityQuery} from '../engine/ecs/EntityQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {PlayerComponent} from './PlayerComponent.js';

export const playersQuery = new EntityQuery({
  components: [PlayerComponent, MotionComponent],
});
