import {EntityQuery} from '../engine/EntityQuery.js';
import {LevelComponent} from './LevelComponent.js';
import {world} from './world.js';

export const levelQuery = new EntityQuery({
  components: [LevelComponent],
});

world.addEntityQuery(levelQuery);
