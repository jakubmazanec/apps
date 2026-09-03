import {type Entity} from '../../engine/ecs/Entity.js';
import {type World} from '../../engine/ecs/World.js';
import {type TilemapObject} from '../../engine/tiled/Tilemap.js';
import {doRectanglesOverlap} from '../../engine/utilities/doRectanglesOverlap.js';
import {failUnsupported} from '../../engine/utilities/failUnsupported.js';
import {Vector} from '../../engine/utilities/Vector.js';
import {CameraComponent} from '../components/CameraComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {LevelComponent} from '../components/LevelComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {assets} from '../core/assets.js';
import {game} from '../core/game.js';
import {cameraQuery} from '../queries/cameraQuery.js';
import {playersQuery} from '../queries/playersQuery.js';
import {getClampedCameraPosition} from '../utilities/getClampedCameraPosition.js';
import {getPositionForBoundingBoxCenter} from '../utilities/getPositionForBoundingBoxCenter.js';
import {getMapPool} from './mapPool.js';
import {objectFactories} from './objectFactories.js';

/** The known maps; the save schema's enum and travel validation reuse it. */
export const mapNames = ['map', 'shop-interior'] as const;

export type MapName = (typeof mapNames)[number];

export const DEFAULT_MAP_NAME: MapName = 'map';

export type PendingTravel = {entryName: string; mapName: MapName};

export type SpawnedMap = {
  mapEntity: Entity;
  playerEntity: Entity | null;
  scopedEntities: Entity[];
};

// Module state outlives the world (the flags.ts precedent): world.onStart
// resets it before spawning, so a stale pending travel or tracked list from a
// quit run can never leak into the next one.
let currentMapName: MapName = DEFAULT_MAP_NAME;
let currentMapEntity: Entity | null = null;
// The travel flush (Task 10) reads this to remove the outgoing map's
// non-player entities from a running world, unlike world.onStop's quit path,
// where World.stop tears down every entity itself.
let currentScopedEntities: Entity[] = [];
let pendingTravel: PendingTravel | null = null;

export function isMapName(value: string): value is MapName {
  return (mapNames as readonly string[]).includes(value);
}

/** The save blob records this alongside position and flags. */
export function getCurrentMapName(): MapName {
  return currentMapName;
}

export function getPendingTravel(): PendingTravel | null {
  return pendingTravel;
}

/** travelSystem's output; the ticker-side flush consumes it between frames. */
export function requestTravel(travel: PendingTravel): void {
  pendingTravel = travel;
}

/**
 * Called from world.onStart before spawning (the resetFlags precedent). The
 * starting name is a parameter so this module never imports save.ts — save.ts
 * imports from here and the dependency stays one-way.
 */
export function resetLevelManager(startingMapName: MapName): void {
  currentMapName = startingMapName;
  currentMapEntity = null;
  currentScopedEntities = [];
  pendingTravel = null;
}

/** world.onStop returns the current map entity to its pool. */
export function releaseCurrentMap(): void {
  if (currentMapEntity !== null) {
    getMapPool(currentMapName).destroy(currentMapEntity);
    currentMapEntity = null;
  }
}

/**
 * The named entry point of a map, read from the tilemap asset (entry objects
 * are data, not entities). All tilemaps are preloaded with the game bundle,
 * so cross-map lookups work at spawn-validation time as well as travel time.
 * Duplicate names are loud at that map's own spawn; first wins here.
 */
export function findEntryPoint(mapName: MapName, entryName: string): TilemapObject | null {
  let tilemap = assets.tilemap(mapName);

  for (let objectLayer of tilemap.objectLayers) {
    for (let object of objectLayer.objects) {
      if (object.type === 'entry' && object.name === entryName) {
        return object;
      }
    }
  }

  return null;
}

function validateExit(trigger: TriggerComponent): void {
  let {map, entry} = trigger.properties;

  if (typeof map !== 'string' || !isMapName(map)) {
    failUnsupported(
      `Exit "${trigger.name}" (id ${trigger.id}) has a missing or unknown "map" property! Set it to one of: ${mapNames.join(', ')}. The exit is inert.`,
    );

    return;
  }

  if (typeof entry !== 'string' || entry === '') {
    failUnsupported(
      `Exit "${trigger.name}" (id ${trigger.id}) has a missing "entry" property! Set it to an entry point name in "${map}". The exit is inert.`,
    );

    return;
  }

  if (findEntryPoint(map, entry) === null) {
    failUnsupported(
      `Exit "${trigger.name}" (id ${trigger.id}) targets entry "${entry}", which doesn't exist in "${map}"! Add an entry point with that name in Tiled. The exit is inert.`,
    );
  }
}

/**
 * The spawn loop promoted from world.onStart: create the map entity from the
 * per-map pool, dispatch object layers through objectFactories, record what
 * was spawned. Nothing is added to the world here — the caller owns add
 * order, which is what lets the travel flush build a whole map before
 * swapping anything.
 *
 * `entry` objects are data and spawn nothing. `spawn` objects are honored
 * only with `includeSpawn: true` (the initial New Game/Continue build) and
 * skipped silently on travel, so a map that has one can still be a travel
 * destination without ever creating a second player.
 */
export function spawnMap(mapName: MapName, {includeSpawn}: {includeSpawn: boolean}): SpawnedMap {
  let tilemap = assets.tilemap(mapName);
  let mapEntity = getMapPool(mapName).create();
  let scopedEntities: Entity[] = [];
  let playerEntity: Entity | null = null;
  let entryNames = new Set<string>();

  for (let objectLayer of tilemap.objectLayers) {
    for (let object of objectLayer.objects) {
      if (object.type === 'entry') {
        if (object.name === '') {
          failUnsupported(
            `Entry point (id ${object.id}) has no name! Name it in Tiled so exits can target it. The entry is unusable.`,
          );
        } else if (entryNames.has(object.name)) {
          failUnsupported(
            `Entry point "${object.name}" (id ${object.id}) is a duplicate! Entry names must be unique within a map; the first one wins.`,
          );
        } else {
          entryNames.add(object.name);
        }

        continue;
      }

      if (object.type === 'spawn') {
        if (!includeSpawn) {
          continue;
        }

        if (playerEntity !== null) {
          failUnsupported(
            `Object "${object.name}" (id ${object.id}) is a second spawn! Keep exactly one spawn object; the first one wins and this one is skipped.`,
          );

          continue;
        }
      }

      let factory =
        Object.hasOwn(objectFactories, object.type) ? objectFactories[object.type] : undefined;

      if (factory === undefined) {
        failUnsupported(
          `Object "${object.name}" (id ${object.id}) has unknown type "${object.type}"! Add a factory to objectFactories or fix the type in Tiled. The object is skipped.`,
        );

        continue;
      }

      let entity = factory(object);

      if (object.type === 'spawn') {
        playerEntity = entity;
      } else {
        scopedEntities.push(entity);
      }
    }
  }

  // Trigger validation runs once, after the loop, so forward references
  // resolve. A failing door or exit stays spawned and simply goes inert in
  // its consuming system.
  let triggers = scopedEntities
    .filter((entity) => entity.hasComponent(TriggerComponent))
    .map((entity) => entity.getComponent(TriggerComponent));

  for (let trigger of triggers) {
    if (trigger.type === 'door') {
      // Tiled serializes an unset object property as value 0, which no
      // object id matches, so unset falls out as dangling.
      let {target} = trigger.properties;

      if (typeof target !== 'number' || !triggers.some((other) => other.id === target)) {
        failUnsupported(
          `Door "${trigger.name}" (id ${trigger.id}) has a missing or dangling target! Set its "target" property to another door object in Tiled. The door is inert.`,
        );
      }
    }

    if (trigger.type === 'exit') {
      validateExit(trigger);
    }
  }

  // currentMapName must track currentMapEntity: releaseCurrentMap destroys
  // into getMapPool(currentMapName), and ObjectPool.destroy does no ownership
  // check, so a stale name would silently return the wrong map's entity to
  // its pool.
  currentMapName = mapName;
  currentMapEntity = mapEntity;
  currentScopedEntities = scopedEntities;

  return {mapEntity, playerEntity, scopedEntities};
}

/**
 * The between-frames swap. Runs as a HIGH-priority pixi ticker callback
 * (registered by worldScreen.onShow): pixi runs it before the world's
 * NORMAL-priority update and renders at LOW priority afterward, so entity
 * changes apply synchronously and atomically — no frame ever renders
 * half-swapped. A paused world still flushes (add/remove are legal outside
 * an update; the run resumes in the new map).
 */
export function flushPendingTravel(world: World): void {
  if (pendingTravel === null || !world.isRunning) {
    return;
  }

  let travel = pendingTravel;
  // The [0] guard (world.ts onStop precedent): a DEV throw mid-spawn can
  // leave no player while the ticker still runs.
  let playerEntity = playersQuery.entities[0];

  if (playerEntity === undefined) {
    return;
  }

  // The player always carries GraphicsComponent; playersQuery just cannot
  // prove it (it only requires Player + Motion) — same as triggerSystem.
  // Read it now, before any entity is touched, so this guard is as atomic as
  // the missing-player one above: either the whole flush runs, or none of it.
  let {boundingBox} = playerEntity.getComponent(GraphicsComponent) ?? {};

  if (boundingBox === undefined) {
    return;
  }

  let oldMapName = currentMapName;
  let oldMapEntity = currentMapEntity;
  let oldScopedEntities = currentScopedEntities;
  // 1. Build the destination first: components exist, nothing is added yet.
  // spawnMap also syncs currentMapName/currentMapEntity/currentScopedEntities,
  // which is why oldMapName/oldMapEntity/oldScopedEntities were snapshotted
  // above, before this call.
  let {mapEntity, scopedEntities} = spawnMap(travel.mapName, {includeSpawn: false});

  // 2. Remove the player first, then the old scoped entities, then the old
  // map last, so every graphicsSystem.onRemoveEntity still sees the old map
  // in levelQuery while detaching sprites from its layers. The old map
  // returns to its pool; old scoped entities are dropped (the same lifecycle
  // world.stop gives them).
  world.removeEntity(playerEntity);

  for (let entity of oldScopedEntities) {
    world.removeEntity(entity);
  }

  if (oldMapEntity !== null) {
    world.removeEntity(oldMapEntity);
    getMapPool(oldMapName).destroy(oldMapEntity);
  }

  // 3. Add the new map first, then its scoped entities, then the player
  // last, so every onAddEntity parents sprites into the new map's layers.
  world.addEntity(mapEntity);

  for (let entity of scopedEntities) {
    world.addEntity(entity);
  }

  world.addEntity(playerEntity);

  // 4. Center the player on the entry point. Vector preserves the stored
  // angle through velocity.set(0, 0), so the player keeps facing their
  // direction of approach. The entry was validated loud at spawn; the map
  // center is the same defense-in-depth fallback world.onStart uses.
  let motion = playerEntity.getComponent(MotionComponent);
  let {map} = mapEntity.getComponent(LevelComponent);
  let entry = findEntryPoint(travel.mapName, travel.entryName);
  let position = getPositionForBoundingBoxCenter(
    entry === null ? new Vector(map.width / 2, map.height / 2) : new Vector(entry.x, entry.y),
    boundingBox,
  );

  motion.position.set(position.x, position.y);
  motion.target = undefined;
  motion.velocity.set(0, 0);

  // 5. Arm every destination trigger the player lands inside: no spurious
  // zone enters on arrival; each re-arms after a genuine exit, exactly like
  // a door's target after a teleport.
  for (let entity of scopedEntities) {
    // hasComponent first (the spawnMap trigger-validation precedent above):
    // every scoped entity is a door/zone/exit/npc today, all of which carry
    // TriggerComponent, but nothing here should assume a future object
    // factory always will.
    if (!entity.hasComponent(TriggerComponent)) {
      continue;
    }

    let trigger = entity.getComponent(TriggerComponent);

    if (
      doRectanglesOverlap(
        motion.position.x + boundingBox.x,
        motion.position.y + boundingBox.y,
        boundingBox.width,
        boundingBox.height,
        trigger.rect.x,
        trigger.rect.y,
        trigger.rect.width,
        trigger.rect.height,
      )
    ) {
      trigger.isPlayerInside = true;
    }
  }

  // 6. Preset the camera: mapSystem positions the map view before
  // cameraSystem runs, so without this the first frame after the cut would
  // draw the new map with the old camera.
  let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);
  let {app, pixelScale} = game;
  let clamped = getClampedCameraPosition({
    map,
    playerX: motion.position.x,
    playerY: motion.position.y,
    viewportWidth: app.canvas.width / pixelScale,
    viewportHeight: app.canvas.height / pixelScale,
    pixelScale,
  });

  cameraPosition.set(clamped.x, clamped.y);

  // currentMapName is already travel.mapName: spawnMap synced it in step 1.
  pendingTravel = null;
}
