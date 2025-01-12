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
          // TODO: fix the typings
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- TODO
          event.clientX / 1 + cameraPosition.x - 32, // TODO: 32 is from the bounding box, fix it sthe value is used directly, not as a cosntant
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- TODO
          event.clientY / 1 + cameraPosition.y - 60, // TODO: 60 is from the bounding box, fix it sthe value is used directly, not as a cosntant
        );
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      }
    });
  },
  onUpdate: (delta, system) => {},
  onAddEntity: (entity, system) => {},
});

world.addSystem(playerSystem);
