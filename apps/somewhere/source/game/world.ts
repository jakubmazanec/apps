import {type Entity} from '../engine/ecs/Entity.js';
import {World} from '../engine/ecs/World.js';
import {camera} from './camera.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {cameraSystem} from './cameraSystem.js';
import {graphicsSystem} from './graphicsSystem.js';
import {levelQuery} from './levelQuery.js';
import {mapPool} from './mapPool.js';
import {mapSystem} from './mapSystem.js';
import {motionSystem} from './motionSystem.js';
import {playerPool} from './playerPool.js';
import {playersQuery} from './playersQuery.js';
import {playerSystem} from './playerSystem.js';

declare global {
  interface Window {
    world: World;
  }
}

let mapEntity: Entity | null = null;
let playerEntity: Entity | null = null;

export const world = new World({
  onStart: (world) => {
    camera.getComponent(CameraComponent).position.set(0, 0);

    world.addEntityQuery(cameraQuery);
    world.addEntityQuery(levelQuery);
    world.addEntityQuery(playersQuery);

    world.addSystem(mapSystem);
    world.addSystem(motionSystem);
    world.addSystem(playerSystem);
    world.addSystem(cameraSystem);
    world.addSystem(graphicsSystem);

    world.addEntity(camera);

    // Map must be added before player so graphicsSystem.onAddEntity can read levelQuery.
    mapEntity = mapPool.create();
    world.addEntity(mapEntity);

    playerEntity = playerPool.create();
    world.addEntity(playerEntity);
  },
  onStop: () => {
    if (playerEntity) {
      playerPool.destroy(playerEntity);
      playerEntity = null;
    }

    if (mapEntity) {
      mapPool.destroy(mapEntity);
      mapEntity = null;
    }
  },
});

if (typeof window !== 'undefined') {
  window.world = world;
}
