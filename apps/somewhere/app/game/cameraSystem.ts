import {CameraComponent} from '../engine/CameraComponent.js';
import {EntityQuery} from '../engine/EntityQuery.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {PlayerComponent} from '../engine/PlayerComponent.js';
import {System} from '../engine/System.js';
import {world} from './world.js';

export const cameraSystem = new System({
  displayName: 'Camera system',
  world,
  components: [CameraComponent],
  entityQueries: {
    players: new EntityQuery({
      world,
      components: [PlayerComponent, MotionComponent],
    }),
  },
  onUpdate: (delta, system) => {
    // let {position: cameraPosition} = system.getFirst().getComponent(CameraComponent);
    // let {position: playerPosition} = system.entityQueries.players
    //   .getFirst()
    //   .getComponent(MotionComponent);
    // cameraPosition.set(playerPosition.x - 500, playerPosition.y - 200);
    // cameraPosition.set(Math.floor(playerPosition.x - 500), Math.floor(playerPosition.y - 200));
  },
});

world.addSystem(cameraSystem);
