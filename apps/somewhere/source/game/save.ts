import {z} from 'zod';

import {PersistedStore} from '../engine/storage/PersistedStore.js';
import {flags} from './flags.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';

// One bespoke save blob, extraction-and-apply: save reads a few values out of
// the live world; restore runs the normal New Game construction path and then
// applies them. The world is always built by code — this file only
// parameterizes it. Each new persisted fact (flags, inventory, current map)
// is a new schema field; an old save that fails the new schema simply resets.
const saveSchema = z.object({
  // Art px (the pixelScale transform lives on the root container), so a saved
  // position is device-independent across per-device pixel scales. A
  // hand-edited save can place the player out of bounds; accepted — zod 4
  // numbers are finite-only, the camera clamps to the map, and the worst case
  // is walking back out.
  player: z.object({x: z.number(), y: z.number()}),
  // Dialogue flags. Mid-dialogue state is never persisted: completion flags
  // go on terminal nodes' onEnter, so quitting mid-conversation only loses
  // what was not reached, never records what did not happen.
  flags: z.object({metMira: z.boolean()}),
});

export type SaveData = z.infer<typeof saveSchema>;

const saveStore = new PersistedStore<SaveData | null>({
  key: 'somewhere:save',
  schema: saveSchema.nullable(),
  // null = "no save exists" — drives the main menu's Continue visibility.
  defaults: () => null,
});

// The Continue hand-off: the menu stages the save before the screen swap and
// gameScreen.onShow applies it after world.start().
let stagedSave: SaveData | null = null;

/** The main menu's Continue check; null when no (valid) save exists. */
export function loadSave(): SaveData | null {
  return saveStore.load();
}

/**
 * Captures the player's position into the save blob. Works on a paused world.
 * Borrows the world invariant that a player entity exists from start() to
 * stop() (world.ts adds it in onStart): getFirst() would throw on an empty
 * query, so writeSave must only run while the world is alive.
 */
export function writeSave(): void {
  let {position} = playersQuery.getFirst().getComponent(MotionComponent);

  saveStore.save({player: {x: position.x, y: position.y}, flags: {...flags}});
}

/** Stages the stored save for the next gameScreen show (the Continue click). */
export function stageContinue(): void {
  stagedSave = loadSave();
}

/**
 * Drops the staged value (the New Game click): a failed Continue transition
 * must not leave a stale stage that a later New Game would wrongly apply.
 */
export function clearStagedSave(): void {
  stagedSave = null;
}

/**
 * Applies and consumes the staged save; a no-op without one. Called by
 * gameScreen.onShow directly after world.start() — addEntity outside an
 * update applies synchronously, so playersQuery is already populated. The
 * camera needs nothing: cameraSystem re-centers on the player every frame.
 */
export function applyStagedSave(): void {
  if (stagedSave === null) {
    return;
  }

  let {position} = playersQuery.getFirst().getComponent(MotionComponent);

  position.set(stagedSave.player.x, stagedSave.player.y);
  Object.assign(flags, stagedSave.flags);
  stagedSave = null;
}
