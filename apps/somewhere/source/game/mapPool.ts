import {Entity} from '../engine/ecs/Entity.js';
import {ObjectPool} from '../engine/utilities/ObjectPool.js';
import {LevelComponent} from './LevelComponent.js';

// One pool per map name, so each map's pixi view is built once and reused
// across visits. Requires the 'game' asset bundle to be loaded before
// .create() is called on a returned pool.
const mapPools = new Map<string, ObjectPool<Entity, []>>();

export function getMapPool(mapName: string): ObjectPool<Entity, []> {
  let pool = mapPools.get(mapName);

  if (pool === undefined) {
    pool = new ObjectPool({
      onCreate: () =>
        new Entity({
          components: [new LevelComponent({mapOptions: {assetName: mapName}})],
        }),
      onReset: (entity) => {
        let {map} = entity.getComponent(LevelComponent);

        map.position.set(0, 0);

        return entity;
      },
    });

    mapPools.set(mapName, pool);
  }

  return pool;
}
