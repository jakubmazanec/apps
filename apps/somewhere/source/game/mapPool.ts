import {Entity} from '../engine/ecs/Entity.js';
import {ObjectPool} from '../engine/utilities/ObjectPool.js';
import {LevelComponent} from './LevelComponent.js';

// Requires the 'game' asset bundle to be loaded before .create() is called.
export const mapPool = new ObjectPool({
  onCreate: () =>
    new Entity({
      components: [new LevelComponent({mapOptions: {assetName: 'map'}})],
    }),
  onReset: (entity) => {
    let {map} = entity.getComponent(LevelComponent);

    map.position.set(0, 0);

    return entity;
  },
});
