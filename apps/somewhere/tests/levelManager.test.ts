import * as pixi from 'pixi.js';
import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

// The travel flush (Task 10) presets the camera through the game singleton;
// mock it before any game module loads (the dialogueBoxSystem.test pattern).
vitest.mock(import('../source/game/game.js'), () => {
  let game = {app: {canvas: {width: 64, height: 64}}, pixelScale: 1};

  return {game: game as never};
});

const {Spriteset} = await import('../source/engine/graphics/Spriteset.js');
const {toTileGid} = await import('../source/engine/tiled/TileGid.js');
const {Tilemap} = await import('../source/engine/tiled/Tilemap.js');
const {assets} = await import('../source/game/assets.js');
const {
  DEFAULT_MAP_NAME,
  findEntryPoint,
  flushPendingTravel,
  getCurrentMapName,
  getPendingTravel,
  isMapName,
  releaseCurrentMap,
  requestTravel,
  resetLevelManager,
  spawnMap,
} = await import('../source/game/levelManager.js');
const {TriggerComponent} = await import('../source/game/TriggerComponent.js');
const {World} = await import('../source/engine/ecs/World.js');
const {System} = await import('../source/engine/ecs/System.js');
const {Entity} = await import('../source/engine/ecs/Entity.js');
const {camera} = await import('../source/game/camera.js');
const {CameraComponent} = await import('../source/game/CameraComponent.js');
const {cameraQuery} = await import('../source/game/cameraQuery.js');
const {levelQuery} = await import('../source/game/levelQuery.js');
const {mapSystem} = await import('../source/game/mapSystem.js');
const {playersQuery} = await import('../source/game/playersQuery.js');
const {playerPool} = await import('../source/game/playerPool.js');
const {MotionComponent} = await import('../source/game/MotionComponent.js');
const {LevelComponent} = await import('../source/game/LevelComponent.js');
const {Vector} = await import('../source/engine/utilities/Vector.js');

// `const {Tilemap} = await import(...)` only binds Tilemap as a value (unlike
// a static `import {Tilemap} from ...`, which merges value and type); the
// separate type alias lets buildTilemap/stubAssets below annotate with it.
type Tilemap = import('../source/engine/tiled/Tilemap.js').Tilemap;
type TilemapObject = import('../source/engine/tiled/Tilemap.js').TilemapObject;
type World = import('../source/engine/ecs/World.js').World;
type Entity = import('../source/engine/ecs/Entity.js').Entity;

const SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
  'spin',
];

function object(overrides: Partial<TilemapObject>): TilemapObject {
  return {
    id: 1,
    name: '',
    type: '',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    point: false,
    properties: {},
    ...overrides,
  };
}

function spawnObject(id = 1): TilemapObject {
  return object({id, type: 'spawn', x: 32, y: 32, point: true});
}

function entryObject(id: number, name: string, x = 32, y = 32): TilemapObject {
  return object({id, name, type: 'entry', x, y, point: true});
}

function exitObject(id: number, properties: Record<string, string>): TilemapObject {
  return object({
    id,
    name: `exit-${id}`,
    type: 'exit',
    x: 48,
    y: 48,
    width: 16,
    height: 16,
    properties,
  });
}

function zoneObject(id: number, x = 0, y = 48): TilemapObject {
  return object({id, name: `zone-${id}`, type: 'zone', x, y, width: 16, height: 16});
}

// A real all-empty Tilemap: gid 0 renders nothing, so Map never touches a
// tileset asset. `columns` scales the map size per test.
function buildTilemap(objects: TilemapObject[], columns = 4): Tilemap {
  return new Tilemap({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: columns,
    rowCount: columns,
    tilesets: [{assetName: 'tileset', firstTileGid: toTileGid(1)}],
    layers: [
      {
        class: 'entities',
        tiles: Array.from({length: columns * columns}, () => ({
          gid: toTileGid(0),
          flipHorizontal: false,
          flipVertical: false,
          flipDiagonal: false,
        })),
      },
    ],
    objectLayers: [{name: 'objects', objects}],
  });
}

function stubAssets(tilemaps: Record<string, Tilemap>): void {
  vitest.spyOn(assets, 'tilemap').mockImplementation(((name: string) => tilemaps[name]) as never);
  vitest.spyOn(assets, 'spriteset').mockReturnValue(
    new Spriteset({
      textures: {},
      animations: Object.fromEntries(
        SPRITE_NAMES.map((name) => [
          `character-${name}`,
          {textures: [pixi.Texture.WHITE], speed: 0.15, loop: true},
        ]),
      ),
    }),
  );
}

describe('levelManager: names and pending travel', () => {
  beforeEach(() => {
    resetLevelManager(DEFAULT_MAP_NAME);
  });

  test('isMapName accepts only known maps', () => {
    expect(isMapName('map')).toBe(true);
    expect(isMapName('shop-interior')).toBe(true);
    expect(isMapName('basement')).toBe(false);
  });

  test('requestTravel is readable and reset clears it with the starting name', () => {
    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});

    expect(getPendingTravel()).toEqual({mapName: 'shop-interior', entryName: 'entrance'});

    resetLevelManager('shop-interior');

    expect(getPendingTravel()).toBeNull();
    expect(getCurrentMapName()).toBe('shop-interior');
  });
});

describe('levelManager: spawnMap', () => {
  beforeEach(() => {
    resetLevelManager(DEFAULT_MAP_NAME);
  });

  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('builds the map entity and scoped entities; spawn honored only with includeSpawn', () => {
    stubAssets({
      map: buildTilemap([
        spawnObject(1),
        zoneObject(2),
        exitObject(3, {map: 'shop-interior', entry: 'entrance'}),
        entryObject(4, 'village-entry'),
      ]),
      'shop-interior': buildTilemap([entryObject(1, 'entrance')]),
    });

    let spawned = spawnMap('map', {includeSpawn: true});

    expect(spawned.playerEntity).not.toBeNull();
    // zone + exit; the entry object spawned nothing.
    expect(spawned.scopedEntities).toHaveLength(2);
    expect(spawned.scopedEntities.every((entity) => entity.hasComponent(TriggerComponent))).toBe(
      true,
    );

    let again = spawnMap('map', {includeSpawn: false});

    expect(again.playerEntity).toBeNull(); // silent skip: travel destinations may keep a spawn
  });

  test('a second spawn object throws in DEV', () => {
    stubAssets({map: buildTilemap([spawnObject(1), spawnObject(2)])});

    expect(() => spawnMap('map', {includeSpawn: true})).toThrow(/second spawn/u);
  });

  test('duplicate entry names throw in DEV', () => {
    stubAssets({map: buildTilemap([entryObject(1, 'front'), entryObject(2, 'front', 48, 48)])});

    expect(() => spawnMap('map', {includeSpawn: false})).toThrow(/duplicate/u);
  });

  test('an unnamed entry throws in DEV', () => {
    stubAssets({map: buildTilemap([entryObject(1, '')])});

    expect(() => spawnMap('map', {includeSpawn: false})).toThrow(/no name/u);
  });

  test('an exit with an unknown map throws in DEV', () => {
    stubAssets({map: buildTilemap([exitObject(2, {map: 'basement', entry: 'entrance'})])});

    expect(() => spawnMap('map', {includeSpawn: false})).toThrow(/missing or unknown "map"/u);
  });

  test('an exit with a missing entry property throws in DEV', () => {
    // No 'shop-interior' stub: validateExit checks "map" before "entry", so
    // findEntryPoint is never reached and the stub would be unused.
    stubAssets({map: buildTilemap([exitObject(2, {map: 'shop-interior'})])});

    expect(() => spawnMap('map', {includeSpawn: false})).toThrow(/missing "entry"/u);
  });

  test('an exit whose entry is absent from the destination throws in DEV', () => {
    stubAssets({
      map: buildTilemap([exitObject(2, {map: 'shop-interior', entry: 'nope'})]),
      'shop-interior': buildTilemap([entryObject(1, 'entrance')]),
    });

    expect(() => spawnMap('map', {includeSpawn: false})).toThrow(/doesn't exist/u);
  });

  test('a dangling door target still throws in DEV (moved validation)', () => {
    stubAssets({
      map: buildTilemap([
        object({
          id: 2,
          name: 'door',
          type: 'door',
          width: 16,
          height: 16,
          properties: {target: 99},
        }),
      ]),
    });

    expect(() => spawnMap('map', {includeSpawn: false})).toThrow(/dangling target/u);
  });

  test('the map entity is pooled per name across visits', () => {
    stubAssets({map: buildTilemap([])});

    let first = spawnMap('map', {includeSpawn: false});

    releaseCurrentMap();

    let second = spawnMap('map', {includeSpawn: false});

    expect(second.mapEntity).toBe(first.mapEntity);
  });

  test('spawnMap syncs the tracked current map name', () => {
    // releaseCurrentMap destroys into getMapPool(currentMapName); a stale
    // name after spawning a different map would poison the wrong pool.
    stubAssets({'shop-interior': buildTilemap([])});

    spawnMap('shop-interior', {includeSpawn: false});

    expect(getCurrentMapName()).toBe('shop-interior');
  });

  test('findEntryPoint returns the named point or null', () => {
    stubAssets({'shop-interior': buildTilemap([entryObject(1, 'entrance', 40, 24)])});

    expect(findEntryPoint('shop-interior', 'entrance')).toMatchObject({x: 40, y: 24});
    expect(findEntryPoint('shop-interior', 'missing')).toBeNull();
  });
});

// Village 4x4 (64 px); shop 8x8 (128 px) so the camera clamp is exercised.
// The shop zone overlaps the entry so arrival-arming is observable.
function stubBothMaps(): void {
  stubAssets({
    map: buildTilemap([entryObject(9, 'village-entry'), zoneObject(10)]),
    'shop-interior': buildTilemap(
      [
        entryObject(1, 'entrance', 96, 96),
        object({id: 2, name: 'mat', type: 'zone', x: 80, y: 80, width: 32, height: 32}),
      ],
      8,
    ),
  });
}

describe('levelManager: flushPendingTravel', () => {
  let activeWorld: World | null = null;
  // A components-less probe matches every entity; it records hook order so
  // the swap's documented sequence is asserted, not assumed. (Sprite
  // reparenting itself is graphicsSystem's already-tested behavior — the
  // order below is the contract it depends on.)
  let events: Array<{entity: Entity; kind: 'add' | 'remove'}> = [];
  let probe = new System({
    components: [],
    displayName: 'Probe',
    onAddEntity: (entity) => {
      events.push({kind: 'add', entity});
    },
    onRemoveEntity: (entity) => {
      events.push({kind: 'remove', entity});
    },
  });

  function startWorld() {
    resetLevelManager('map');

    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(playersQuery).addEntityQuery(cameraQuery).addEntityQuery(levelQuery);
        w.addSystem(probe);
        w.addEntity(camera);
      },
    });

    activeWorld = world;
    world.start();

    let spawned = spawnMap('map', {includeSpawn: false});

    world.addEntity(spawned.mapEntity);

    for (let entity of spawned.scopedEntities) {
      world.addEntity(entity);
    }

    let player = playerPool.create();

    player.getComponent(MotionComponent).position.set(4, 4);
    world.addEntity(player);
    events = [];

    return {world, player, spawned};
  }

  beforeEach(() => {
    stubBothMaps();
  });

  afterEach(() => {
    camera.getComponent(CameraComponent).position.set(0, 0);
    activeWorld?.stop();
    activeWorld = null;
    vitest.restoreAllMocks();
  });

  test('swaps entity sets in the documented order and finishes the travel', () => {
    let {world, player, spawned} = startWorld();

    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);

    // Remove: player, old scoped, old map. Add: new map, new scoped, player.
    let kinds = events.map((event) => event.kind);

    expect(kinds).toEqual(['remove', 'remove', 'remove', 'add', 'add', 'add']);
    expect(events[0]!.entity).toBe(player);
    expect(events[1]!.entity).toBe(spawned.scopedEntities[0]);
    expect(events[2]!.entity).toBe(spawned.mapEntity);
    expect(events[5]!.entity).toBe(player);

    // The new map is live in levelQuery; the player is still the same entity.
    expect(levelQuery.getFirst().getComponent(LevelComponent).map.width).toBe(128);
    expect(playersQuery.getFirst()).toBe(player);
    expect(getCurrentMapName()).toBe('shop-interior');
    expect(getPendingTravel()).toBeNull();
  });

  test('centers the player on the entry, clears the target, zeroes velocity, keeps facing', () => {
    let {world, player} = startWorld();
    let motion = player.getComponent(MotionComponent);

    motion.target = new Vector(50, 50);
    motion.velocity.set(0, 1); // facing down

    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);

    // Entry (96, 96); player box (0, 10, 16, 10) centers at (88, 81).
    expect(motion.position.x).toBe(88);
    expect(motion.position.y).toBe(81);
    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(motion.velocity.angle).toBe(90); // Vector preserves the angle through set(0, 0)
  });

  test('arms every destination trigger the player lands inside', () => {
    let {world} = startWorld();

    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);

    // hasComponent first: world.entities also holds the camera, map, and
    // player entities, none of which carry TriggerComponent.
    let mat = world.entities.find(
      (entity) =>
        entity.hasComponent(TriggerComponent) &&
        entity.getComponent(TriggerComponent).name === 'mat',
    );

    expect(mat?.getComponent(TriggerComponent).isPlayerInside).toBe(true);
  });

  test('presets the camera to the clamped position', () => {
    let {world} = startWorld();

    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);

    // Player (88, 81), 64x64 viewport (mocked game), 128 px map:
    // x = floor(88 - 32) = 56 (< clamp 64), y = floor(81 - 32) = 49.
    let {position} = camera.getComponent(CameraComponent);

    expect(position.x).toBe(56);
    expect(position.y).toBe(49);
  });

  test('a paused world still flushes (add/remove are legal outside an update)', () => {
    let {world} = startWorld();

    world.pause();
    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);

    expect(getCurrentMapName()).toBe('shop-interior');

    world.resume();
  });

  test('traveling back reuses the pooled map entity', () => {
    let {world, spawned} = startWorld();

    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);
    requestTravel({mapName: 'map', entryName: 'village-entry'});
    flushPendingTravel(world);

    expect(levelQuery.getFirst()).toBe(spawned.mapEntity);
    expect(getCurrentMapName()).toBe('map');
  });

  test('the swapped-in map view stays below the overlay layers', () => {
    let {world} = startWorld();

    // system.view is the shared world view, so paint order is addChild order.
    // The map lands first (world.onStart adds it before any update runs) and
    // dialogueBoxSystem's prompt layer attaches above it on its first update;
    // the swap must not invert that, or the new map paints over the bubble.
    world.addSystem(mapSystem);

    let overlay = new pixi.Container();

    world.view.addChild(overlay);
    requestTravel({mapName: 'shop-interior', entryName: 'entrance'});
    flushPendingTravel(world);

    let {map} = levelQuery.getFirst().getComponent(LevelComponent);

    expect(world.view.getChildIndex(map.view)).toBeLessThan(world.view.getChildIndex(overlay));
  });

  test('no pending travel or a stopped world is a no-op', () => {
    let {world} = startWorld();
    let before = [...world.entities];

    flushPendingTravel(world);

    expect(world.entities).toEqual(before);
  });
});
