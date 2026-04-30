import {Entity} from '../engine/Entity.js';
import {ObjectPool} from '../engine/ObjectPool.js';
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
