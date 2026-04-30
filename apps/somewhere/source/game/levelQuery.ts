import {EntityQuery} from '../engine/EntityQuery.js';
import {LevelComponent} from './LevelComponent.js';

export const levelQuery = new EntityQuery({
  components: [LevelComponent],
});
