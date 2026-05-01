import {EntityQuery} from '../engine/ecs/EntityQuery.js';
import {LevelComponent} from './LevelComponent.js';

export const levelQuery = new EntityQuery({
  components: [LevelComponent],
});
