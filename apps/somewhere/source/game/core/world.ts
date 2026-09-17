import {World} from '../../engine/ecs/World.js';
import {failUnsupported} from '../../engine/utilities/failUnsupported.js';
import {Vector} from '../../engine/utilities/Vector.js';
import {CameraComponent} from '../components/CameraComponent.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {LevelComponent} from '../components/LevelComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {dialogueCommandChannel} from '../events/dialogueCommandChannel.js';
import {playerActionFinishedChannel} from '../events/playerActionFinishedChannel.js';
import {popupExpiredChannel} from '../events/popupExpiredChannel.js';
import {triggerEnterChannel} from '../events/triggerEnterChannel.js';
import {triggerExitChannel} from '../events/triggerExitChannel.js';
import {wallHitChannel} from '../events/wallHitChannel.js';
import {
  DEFAULT_MAP_NAME,
  getCurrentMapName,
  releaseCurrentMap,
  resetLevelManager,
  spawnMap,
} from '../levels/levelManager.js';
import {playerPool} from '../levels/playerPool.js';
import {cameraQuery} from '../queries/cameraQuery.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {levelQuery} from '../queries/levelQuery.js';
import {playersQuery} from '../queries/playersQuery.js';
import {audioSystem} from '../systems/audioSystem.js';
import {behaviorSystem} from '../systems/behaviorSystem.js';
import {cameraSystem} from '../systems/cameraSystem.js';
import {dialogueBoxSystem} from '../systems/dialogueBoxSystem.js';
import {dialogueInputSystem} from '../systems/dialogueInputSystem.js';
import {dialogueSystem} from '../systems/dialogueSystem.js';
import {doorSystem} from '../systems/doorSystem.js';
import {graphicsSystem} from '../systems/graphicsSystem.js';
import {mapSystem} from '../systems/mapSystem.js';
import {motionSystem} from '../systems/motionSystem.js';
import {playerActionSystem} from '../systems/playerActionSystem.js';
import {playerSystem} from '../systems/playerSystem.js';
import {popupCleanupSystem} from '../systems/popupCleanupSystem.js';
import {timerSystem} from '../systems/timerSystem.js';
import {travelSystem} from '../systems/travelSystem.js';
import {triggerSystem} from '../systems/triggerSystem.js';
import {tweenSystem} from '../systems/tweenSystem.js';
import {uiBridge} from '../systems/uiBridge.js';
import {wallHitPopupSystem} from '../systems/wallHitPopupSystem.js';
import {zoneSystem} from '../systems/zoneSystem.js';
import {getPositionForBoundingBoxCenter} from '../utilities/getPositionForBoundingBoxCenter.js';
import {camera} from './camera.js';
import {dialogueEntity} from './dialogue.js';
import {resetFlags} from './flags.js';
import {playSoundChannel} from './playSoundChannel.js';
import {getStagedMapName} from './save.js';

declare global {
  interface Window {
    world: World;
  }
}

export const world = new World({
  onStart: (world) => {
    camera.getComponent(CameraComponent).position.set(0, 0);

    // Module state outlives the world: flags reset to defaults before
    // applyStagedSave runs, a mid-dialogue Quit left `active` set on the
    // singleton, and the level manager may hold a stale pending travel.
    resetFlags();
    dialogueEntity.getComponent(DialogueComponent).active = null;
    resetLevelManager(getStagedMapName());

    world.addEventChannel(wallHitChannel);
    world.addEventChannel(popupExpiredChannel);
    world.addEventChannel(playSoundChannel);
    world.addEventChannel(triggerEnterChannel);
    world.addEventChannel(triggerExitChannel);
    world.addEventChannel(dialogueCommandChannel);
    world.addEventChannel(playerActionFinishedChannel);

    world.addEntityQuery(cameraQuery);
    world.addEntityQuery(dialogueQuery);
    world.addEntityQuery(levelQuery);
    world.addEntityQuery(playersQuery);

    world.addSystem(dialogueInputSystem); // first: translates the freshly latched edges into commands
    world.addSystem(travelSystem); // before dialogueSystem: reads last frame's `active`, so the press that pages or closes a conversation can never also travel
    world.addSystem(doorSystem); // right after travelSystem, same reason: the same press teleports through a same-map door, never while a conversation pages
    world.addSystem(dialogueSystem); // before playerSystem: starts/advances on last frame's commands and enters, ticks, and playerSystem sees `active` and locks the same frame
    world.addSystem(mapSystem);
    world.addSystem(playerSystem); // before motionSystem: it writes velocity that motionSystem consumes this frame
    world.addSystem(behaviorSystem); // right after playerSystem, same reason: writes motion.target that motionSystem consumes this frame, and honors the same dialogue lock
    world.addSystem(playerActionSystem); // after playerSystem: same input snapshot, and its one-shot show() wins over graphicsSystem later this frame by the one-shot precedence rule
    world.addSystem(motionSystem);
    world.addSystem(triggerSystem); // right after motionSystem: overlap tests read the just-resolved position
    world.addSystem(zoneSystem); // consumes last frame's trigger enters (buffered, one-frame delay), before wallHitPopupSystem
    world.addSystem(wallHitPopupSystem); // spawn popups from the previous frame's wall hits
    world.addSystem(audioSystem); // placement is free: PlaySoundEvent is buffered, seen next frame
    world.addSystem(popupCleanupSystem); // remove popups whose lifetime timer has expired
    world.addSystem(timerSystem); // placement is free: timer events are buffered, seen next frame
    world.addSystem(uiBridge);
    world.addSystem(cameraSystem);
    world.addSystem(tweenSystem); // late, just before graphicsSystem: scripted motion is the last word
    world.addSystem(graphicsSystem);
    world.addSystem(dialogueBoxSystem); // after graphicsSystem: renders the just-ticked dialogue state into its own layer above the map

    world.addEntity(camera);
    world.addEntity(dialogueEntity);

    // Map first, characters after, player last, so graphicsSystem.onAddEntity
    // always reads a populated levelQuery — the same order the travel flush
    // uses.
    let mapName = getCurrentMapName();
    let {mapEntity, scopedEntities, playerEntity} = spawnMap(mapName, {includeSpawn: true});

    world.addEntity(mapEntity);

    for (let entity of scopedEntities) {
      world.addEntity(entity);
    }

    // A missing player crashes every playersQuery.getFirst() consumer. Only
    // the default map authors a spawn: any other starting map is a Continue
    // whose staged position lands right after start(), so the fallback is
    // quiet there and loud on the default map (an authoring error).
    if (playerEntity === null) {
      if (mapName === DEFAULT_MAP_NAME) {
        failUnsupported(
          'No spawn object in the map! Add a point object with type "spawn" in Tiled. Falling back to a player at the map center.',
        );
      }

      let {map} = mapEntity.getComponent(LevelComponent);

      playerEntity = playerPool.create();

      let position = getPositionForBoundingBoxCenter(
        new Vector(map.width / 2, map.height / 2),
        playerEntity.getComponent(GraphicsComponent).boundingBox,
      );

      playerEntity.getComponent(MotionComponent).position.set(position.x, position.y);
    }

    world.addEntity(playerEntity);
  },
  onStop: () => {
    // Trigger entities are plain entities that World.stop removes; only the
    // pooled player and map need explicit teardown. World.stop runs onStop
    // before removing entities, so the query is still populated. The guard
    // (instead of getFirst()) is defense in depth: every onStart path that
    // reaches a running world also spawns a player (real or the prod
    // fallback), but stop() does not lean on that invariant holding forever.
    let playerEntity = playersQuery.entities[0];

    if (playerEntity) {
      playerPool.destroy(playerEntity);
    }

    releaseCurrentMap();
  },
});

/* eslint-disable unicorn/prefer-global-this -- browser-only debug handle: SSR-guarded by `typeof window` and typed via the `Window` augmentation above; `globalThis` would force a `var` global (vars-on-top) and a no-typeof-undefined/no-unnecessary-condition conflict on the guard */
if (typeof window !== 'undefined') {
  window.world = world;
}
/* eslint-enable unicorn/prefer-global-this */
