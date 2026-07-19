import * as pixi from 'pixi.js';

import {audioSystem} from '../engine/audio/audioSystem.js';
import {type Entity} from '../engine/ecs/Entity.js';
import {World} from '../engine/ecs/World.js';
import {inputSystem} from '../engine/input/inputSystem.js';
import {timerSystem} from '../engine/scheduler/timerSystem.js';
import {tweenSystem} from '../engine/scheduler/tweenSystem.js';
import {Tilemap} from '../engine/tiled/Tilemap.js';
import {failUnsupported} from '../engine/utilities/failUnsupported.js';
import {Vector} from '../engine/utilities/Vector.js';
import {audioEntity, playSoundChannel} from './audio.js';
import {camera} from './camera.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {cameraSystem} from './cameraSystem.js';
import {dialogueEntity} from './dialogue.js';
import {dialogueBoxSystem} from './dialogueBoxSystem.js';
import {dialogueCommandChannel} from './dialogueCommandChannel.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueInputSystem} from './dialogueInputSystem.js';
import {dialogueQuery} from './dialogueQuery.js';
import {dialogueSystem} from './dialogueSystem.js';
import {doorSystem} from './doorSystem.js';
import {resetFlags} from './flags.js';
import {getPositionForBoundingBoxCenter} from './getPositionForBoundingBoxCenter.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {graphicsSystem} from './graphicsSystem.js';
import {inputEntity} from './input.js';
import {inputQuery} from './inputQuery.js';
import {LevelComponent} from './LevelComponent.js';
import {levelQuery} from './levelQuery.js';
import {mapPool} from './mapPool.js';
import {mapSystem} from './mapSystem.js';
import {MotionComponent} from './MotionComponent.js';
import {motionSystem} from './motionSystem.js';
import {objectFactories} from './objectFactories.js';
import {playerPool} from './playerPool.js';
import {playersQuery} from './playersQuery.js';
import {playerSystem} from './playerSystem.js';
import {popupCleanupSystem} from './popupCleanupSystem.js';
import {popupExpiredChannel} from './popupExpiredChannel.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';
import {triggerExitChannel} from './triggerExitChannel.js';
import {triggerSystem} from './triggerSystem.js';
import {uiBridge} from './uiBridge.js';
import {wallHitChannel} from './wallHitChannel.js';
import {wallHitPopupSystem} from './wallHitPopupSystem.js';
import {zoneSystem} from './zoneSystem.js';

declare global {
  interface Window {
    world: World;
  }
}

let mapEntity: Entity | null = null;

export const world = new World({
  onStart: (world) => {
    camera.getComponent(CameraComponent).position.set(0, 0);

    // Module state outlives the world: flags reset to defaults before
    // applyStagedSave runs, and a mid-dialogue Quit left `active` set on the
    // singleton that outlives the run.
    resetFlags();
    dialogueEntity.getComponent(DialogueComponent).active = null;

    world.addEventChannel(wallHitChannel);
    world.addEventChannel(popupExpiredChannel);
    world.addEventChannel(playSoundChannel);
    world.addEventChannel(triggerEnterChannel);
    world.addEventChannel(triggerExitChannel);
    world.addEventChannel(dialogueCommandChannel);

    world.addEntityQuery(cameraQuery);
    world.addEntityQuery(dialogueQuery);
    world.addEntityQuery(inputQuery);
    world.addEntityQuery(levelQuery);
    world.addEntityQuery(playersQuery);

    world.addSystem(inputSystem); // first: every system this frame reads the same freshly-advanced input
    world.addSystem(dialogueInputSystem); // right after inputSystem: translates the freshly advanced edges into commands
    world.addSystem(dialogueSystem); // before playerSystem: starts/advances on last frame's commands and enters, ticks, and playerSystem sees `active` and locks the same frame
    world.addSystem(mapSystem);
    world.addSystem(playerSystem); // before motionSystem: it writes velocity that motionSystem consumes this frame
    world.addSystem(motionSystem);
    world.addSystem(triggerSystem); // right after motionSystem: overlap tests read the just-resolved position
    world.addSystem(doorSystem); // consumes last frame's trigger enters (buffered, one-frame delay)
    world.addSystem(zoneSystem); // like doorSystem: last frame's enters, before wallHitPopupSystem
    world.addSystem(wallHitPopupSystem); // spawn popups from the previous frame's wall hits
    world.addSystem(audioSystem); // placement is free: PlaySound events are buffered, seen next frame
    world.addSystem(popupCleanupSystem); // remove popups whose lifetime timer has expired
    world.addSystem(timerSystem); // placement is free: timer events are buffered, seen next frame
    world.addSystem(uiBridge);
    world.addSystem(cameraSystem);
    world.addSystem(tweenSystem); // late, just before graphicsSystem: scripted motion is the last word
    world.addSystem(graphicsSystem);
    world.addSystem(dialogueBoxSystem); // after graphicsSystem: renders the just-ticked dialogue state into its own layer above the map

    world.addEntity(camera);
    world.addEntity(inputEntity);
    world.addEntity(audioEntity);
    world.addEntity(dialogueEntity);

    // Map must be added before player so graphicsSystem.onAddEntity can read levelQuery.
    mapEntity = mapPool.create();
    world.addEntity(mapEntity);

    // The spawn loop: every object of every object layer dispatches through
    // the game-owned factory record. Object layers live on the Tilemap asset
    // (not the rendered Map) — they are data for the game.
    let tilemap = pixi.Assets.get<Tilemap | undefined>('map');

    if (!(tilemap instanceof Tilemap)) {
      throw new Error(`Tilemap "map" wasn't found!`);
    }

    let hasSpawn = false;

    for (let objectLayer of tilemap.objectLayers) {
      for (let object of objectLayer.objects) {
        // Spawn-count enforcement lives in the loop, since a factory that
        // never runs cannot degrade anything: a second spawn is loud and
        // skipped before its factory runs (first wins).
        if (object.type === 'spawn') {
          if (hasSpawn) {
            failUnsupported(
              `Object "${object.name}" (id ${object.id}) is a second spawn! Keep exactly one spawn object; the first one wins and this one is skipped.`,
            );

            continue;
          }

          hasSpawn = true;
        }

        let factory =
          Object.hasOwn(objectFactories, object.type) ? objectFactories[object.type] : undefined;

        if (factory === undefined) {
          failUnsupported(
            `Object "${object.name}" (id ${object.id}) has unknown type "${object.type}"! Add a factory to objectFactories or fix the type in Tiled. The object is skipped.`,
          );

          continue;
        }

        world.addEntity(factory(object));
      }
    }

    // A missing player crashes every playersQuery.getFirst() consumer, so
    // prod falls back to one at the map center.
    if (!hasSpawn) {
      failUnsupported(
        'No spawn object in the map! Add a point object with type "spawn" in Tiled. Falling back to a player at the map center.',
      );

      let {map} = mapEntity.getComponent(LevelComponent);
      let player = playerPool.create();
      let position = getPositionForBoundingBoxCenter(
        new Vector(map.width / 2, map.height / 2),
        player.getComponent(GraphicsComponent).boundingBox,
      );

      player.getComponent(MotionComponent).position.set(position.x, position.y);
      world.addEntity(player);
    }

    // Door-target validation runs once, after the loop, so forward references
    // resolve (a system hook would fire on addSystem, before any trigger
    // entities exist). A failing door stays spawned and simply goes inert in
    // doorSystem.
    let triggers = world.entities
      .filter((entity) => entity.hasComponent(TriggerComponent))
      .map((entity) => entity.getComponent(TriggerComponent));

    for (let trigger of triggers) {
      if (trigger.type !== 'door') {
        continue;
      }

      // Tiled serializes an unset object property as value 0, which no
      // object id matches, so unset falls out as dangling.
      let {target} = trigger.properties;

      if (typeof target !== 'number' || !triggers.some((other) => other.id === target)) {
        failUnsupported(
          `Door "${trigger.name}" (id ${trigger.id}) has a missing or dangling target! Set its "target" property to another door object in Tiled. The door is inert.`,
        );
      }
    }
  },
  onStop: () => {
    // Trigger entities are plain entities that World.stop removes; only the
    // pooled player and map need explicit teardown. World.stop runs onStop
    // before removing entities, so the query is still populated. The guard
    // (instead of getFirst()) keeps stop() able to clean up after a DEV
    // throw mid-spawn left no player — the worldSpawn tests rely on it.
    let playerEntity = playersQuery.entities[0];

    if (playerEntity) {
      playerPool.destroy(playerEntity);
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
