import {EntityQuery} from '../engine/EntityQuery.js';
import {LevelComponent} from '../engine/LevelComponent.js';
import {world} from './world.js';

export const levelQuery = new EntityQuery({
  world,
  components: [LevelComponent],
});
