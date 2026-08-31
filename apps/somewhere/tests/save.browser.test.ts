import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {MotionComponent} from '../source/game/components/MotionComponent.js';
import {PlayerComponent} from '../source/game/components/PlayerComponent.js';
import {flags, resetFlags} from '../source/game/core/flags.js';
import {
  applyStagedSave,
  clearStagedSave,
  getStagedMapName,
  loadSave,
  stageContinue,
  writeSave,
} from '../source/game/core/save.js';
import {playersQuery} from '../source/game/queries/playersQuery.js';

const SAVE_KEY = 'somewhere:save';
// playersQuery is a module singleton: every test's world must be stopped so
// the next test can register it again. The player carries only
// PlayerComponent + MotionComponent — the query doesn't require
// GraphicsComponent, so no pixi assets are needed.
//
// activeWorld tracks the world a test created (set here rather than at each
// world.start() call site) so afterEach can stop it even if a mid-test
// assertion throws — a per-test trailing world.stop() would be skipped by
// that throw and leave playersQuery registered, cascading spurious failures
// through the rest of the file.
let activeWorld: World | null = null;

function createWorld(x: number, y: number) {
  let motion = new MotionComponent({position: new Vector(x, y), velocity: new Vector(0, 0)});
  let player = new Entity({components: [new PlayerComponent({name: 'Test'}), motion]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(playersQuery).addEntity(player);
    },
  });

  activeWorld = world;

  return {world, motion};
}

describe('save', () => {
  afterEach(() => {
    clearStagedSave();
    resetFlags();
    localStorage.clear();
    activeWorld?.stop();
    activeWorld = null;
  });

  test('writeSave writes the player position as a schema-valid payload', () => {
    let {world} = createWorld(42, 27);

    world.start();
    writeSave();

    expect(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '')).toEqual({
      player: {x: 42, y: 27},
      flags: {metMira: false},
      map: 'map',
    });
    expect(loadSave()).toEqual({player: {x: 42, y: 27}, flags: {metMira: false}, map: 'map'});
  });

  test('writeSave works on a paused world', () => {
    let {world} = createWorld(3, 4);

    world.start();
    world.pause();
    writeSave();

    expect(loadSave()).toEqual({player: {x: 3, y: 4}, flags: {metMira: false}, map: 'map'});
  });

  test('loadSave returns null when nothing is stored', () => {
    expect(loadSave()).toBeNull();
  });

  test('loadSave returns null for a schema-rejected payload, with one warning', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 'nope', y: 0}}));

    expect(loadSave()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('stageContinue then applyStagedSave restores the position and consumes the stage', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({player: {x: 5, y: 6}, flags: {metMira: false}, map: 'map'}),
    );
    stageContinue();

    let {world, motion} = createWorld(144, 160);

    world.start();
    applyStagedSave();

    expect(motion.position.x).toBe(5);
    expect(motion.position.y).toBe(6);

    // The stage was consumed: a second apply must not overwrite new movement.
    motion.position.set(50, 60);
    applyStagedSave();

    expect(motion.position.x).toBe(50);
    expect(motion.position.y).toBe(60);
  });

  test('clearStagedSave prevents a later apply', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({player: {x: 5, y: 6}, flags: {metMira: false}, map: 'map'}),
    );
    stageContinue();
    clearStagedSave();

    let {world, motion} = createWorld(144, 160);

    world.start();
    applyStagedSave();

    expect(motion.position.x).toBe(144);
    expect(motion.position.y).toBe(160);
  });

  test('applyStagedSave without a stage is a no-op', () => {
    let {world, motion} = createWorld(144, 160);

    world.start();
    applyStagedSave();

    expect(motion.position.x).toBe(144);
    expect(motion.position.y).toBe(160);
  });

  test('flags round-trip through the save blob', () => {
    let {world} = createWorld(1, 2);

    world.start();
    flags.metMira = true;
    writeSave();

    resetFlags();
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({player: {x: 1, y: 2}, flags: {metMira: true}, map: 'map'}),
    );
    stageContinue();
    applyStagedSave();

    expect(flags.metMira).toBe(true);
  });

  test('an old save without flags is schema-rejected and resets', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 5, y: 6}}));

    expect(loadSave()).toBeNull();

    warn.mockRestore();
  });

  test('the save blob round-trips the current map name', () => {
    let {world} = createWorld(1, 2);

    world.start();
    writeSave();

    expect(loadSave()).toMatchObject({map: 'map'});
  });

  test('an old save without a map field is schema-rejected and resets', () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SAVE_KEY, JSON.stringify({player: {x: 5, y: 6}, flags: {metMira: false}}));

    expect(loadSave()).toBeNull();

    warn.mockRestore();
  });

  test('getStagedMapName returns the staged map, or the default without a stage', () => {
    expect(getStagedMapName()).toBe('map');

    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({player: {x: 5, y: 6}, flags: {metMira: false}, map: 'shop-interior'}),
    );
    stageContinue();

    expect(getStagedMapName()).toBe('shop-interior');

    clearStagedSave();

    expect(getStagedMapName()).toBe('map');
  });
});
