import {System} from '../engine/System.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {LevelComponent} from './LevelComponent.js';
import {world} from './world.js';

export const mapSystem = new System({
  displayName: 'Map system',
  world,
  components: [LevelComponent],
  entityQueries: {
    cameras: cameraQuery,
  },
  onUpdate: (delta, system) => {
    let {position: cameraPosition} = system.entityQueries.cameras
      .getFirst()
      .getComponent(CameraComponent);

    for (let entity of system.entities) {
      let {map} = entity.getComponent(LevelComponent);

      map.view.position.x = map.position.x - cameraPosition.x;
      map.view.position.y = map.position.y - cameraPosition.y;
    }
  },
  onAddEntity: (entity, system) => {
    let {map} = entity.getComponent(LevelComponent);

    system.view.addChild(map.view);
  },
  onRemoveEntity: (entity, system) => {
    let {map} = entity.getComponent(LevelComponent);

    system.view.removeChild(map.view);
  },
});

world.addSystem(mapSystem);
