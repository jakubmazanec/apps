import {EntityQuery} from '../engine/EntityQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {PlayerComponent} from './PlayerComponent.js';
import {world} from './world.js';

export const playersQuery = new EntityQuery({
  components: [PlayerComponent, MotionComponent],
});

world.addEntityQuery(playersQuery);
