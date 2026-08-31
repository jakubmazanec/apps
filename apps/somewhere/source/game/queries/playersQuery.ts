import {EntityQuery} from '../../engine/ecs/EntityQuery.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {PlayerComponent} from '../components/PlayerComponent.js';

export const playersQuery = new EntityQuery({
  components: [PlayerComponent, MotionComponent],
});
