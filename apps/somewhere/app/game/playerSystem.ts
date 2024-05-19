import {CameraComponent} from '../engine/CameraComponent.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {PlayerComponent} from '../engine/PlayerComponent.js';
import {System} from '../engine/System.js';
import {Vector} from '../engine/Vector.js';
import {cameraQuery} from './cameraQuery.js';
import {game} from './game.js';
import {world} from './world.js';

export const playerSystem = new System({
  displayName: 'Player system',
  world,
  components: [PlayerComponent, MotionComponent],
  entityQueries: {
    cameras: cameraQuery,
  },
  onInit: (system) => {
    game.on('pointertap', (event) => {
      let {position: cameraPosition} = system.entityQueries.cameras
        .getFirst()
        .getComponent(CameraComponent);

      for (let entity of system.entities) {
        let motion = entity.getComponent(MotionComponent);

        motion.target = new Vector(
          event.clientX + cameraPosition.x,
          event.clientY + cameraPosition.y,
        );
      }
    });
  },
  onUpdate: (delta, system) => {},
  onAddEntity: (entity, system) => {
    // let player = entity.getComponent(PlayerComponent);
    // let motion = entity.getComponent(MotionComponent);
  },
  // onRemoveEntity: (entity, system) => {
  //   let {map} = entity.getComponent(PlayerComponent);

  //   system.view.removeChild(map.view);
  // },
});

world.addSystem(playerSystem);
