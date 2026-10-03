import {EntityQuery} from 'tellurion';

import {LevelComponent} from '../components/LevelComponent.js';

export const levelQuery = new EntityQuery({
  components: [LevelComponent],
});
