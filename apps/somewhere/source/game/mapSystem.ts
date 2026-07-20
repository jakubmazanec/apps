import {System} from '../engine/ecs/System.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {LevelComponent} from './LevelComponent.js';

export const mapSystem = new System({
  displayName: 'Map system',
  components: [LevelComponent],
  onUpdate: (ticker, system) => {
    let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);

    for (let entity of system.entities) {
      let {map} = entity.getComponent(LevelComponent);

      // Advance animated tiles on world time (they are constructed with
      // autoUpdate: false); a paused world freezes them because this system
      // simply doesn't run.
      map.update(ticker);

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
