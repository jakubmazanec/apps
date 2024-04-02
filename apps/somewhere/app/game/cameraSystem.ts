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
    // // cameraPosition.set(
    // //   playerPosition.x - game.app.view.width / 2,
    // //   playerPosition.y - game.app.view.height / 2,
    // // );
    // cameraPosition.set(
    //   Math.floor(playerPosition.x - game.app.view.width / 2),
    //   Math.floor(playerPosition.y - game.app.view.height / 2),
    // );
  },
});

world.addSystem(cameraSystem);
