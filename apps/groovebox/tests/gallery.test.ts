import {readdir} from 'node:fs/promises';
import {describe, expect, test} from 'vitest';

import {STATES} from '../source/gallery/states.js';

const SCENES = new URL('../../../packages/groovebox-core/scenes/', import.meta.url);
const LOOK = new URL('../../../docs/superpowers/specs/2026-11-07-groovebox-look/', import.meta.url);

describe('the gallery', () => {
  test('every gallery state points at files that exist', async () => {
    let frames = new Set(await readdir(SCENES, {recursive: true}));
    let approved = new Set(await readdir(LOOK));
    let missing = STATES.flatMap((state) => [
      ...(frames.has(state.frame) ? [] : [`scenes/${state.frame}`]),
      ...(state.approved === undefined || approved.has(state.approved) ?
        []
      : [`look/${state.approved}`]),
    ]);

    expect(missing).toStrictEqual([]);
  });

  test('every frame of the panel scenes is shown', async () => {
    let shown = new Set(STATES.map((state) => state.frame));
    let left = (await readdir(SCENES, {recursive: true})).filter(
      (path) =>
        ['menu-and-pages/', 'new-synth/', 'picker-while-playing/'].some((scene) =>
          path.startsWith(scene),
        ) && !shown.has(path),
    );

    expect(left).toStrictEqual([]);
  });
});
