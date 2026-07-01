import {type Entity} from '../engine/ecs/Entity.js';
import {World} from '../engine/ecs/World.js';
import {timerSystem} from '../engine/scheduler/timerSystem.js';
import {tweenSystem} from '../engine/scheduler/tweenSystem.js';
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
import {popupCleanupSystem} from './popupCleanupSystem.js';
import {popupExpiredChannel} from './popupExpiredChannel.js';
import {uiBridge} from './uiBridge.js';
import {wallHitChannel} from './wallHitChannel.js';
import {wallHitPopupSystem} from './wallHitPopupSystem.js';

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

    world.addEventChannel(wallHitChannel);
    world.addEventChannel(popupExpiredChannel);

    world.addEntityQuery(cameraQuery);
    world.addEntityQuery(levelQuery);
    world.addEntityQuery(playersQuery);

    world.addSystem(mapSystem);
    world.addSystem(motionSystem);
    world.addSystem(wallHitPopupSystem); // spawn popups from the previous frame's wall hits
    world.addSystem(popupCleanupSystem); // remove popups whose lifetime timer has expired
    world.addSystem(timerSystem); // placement is free: timer events are buffered, seen next frame
    world.addSystem(uiBridge);
    world.addSystem(playerSystem);
    world.addSystem(cameraSystem);
    world.addSystem(tweenSystem); // late, just before graphicsSystem: scripted motion is the last word
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

/* eslint-disable unicorn/prefer-global-this -- browser-only debug handle: SSR-guarded by `typeof window` and typed via the `Window` augmentation above; `globalThis` would force a `var` global (vars-on-top) and a no-typeof-undefined/no-unnecessary-condition conflict on the guard */
if (typeof window !== 'undefined') {
  window.world = world;
}
/* eslint-enable unicorn/prefer-global-this */
