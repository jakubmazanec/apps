import {access, readdir} from 'node:fs/promises';
import {describe, expect, test} from 'vitest';

import {STATES} from '../source/gallery/states.js';

const SCENES = new URL('../../../packages/groovebox-core/scenes/', import.meta.url);
const LOOK = new URL('../../../docs/superpowers/specs/2026-11-07-groovebox-look/', import.meta.url);

describe('the gallery', () => {
  test('every gallery state points at files that exist', async () => {
    let approved = new Set(await readdir(LOOK));
    let missing = (
      await Promise.all(
        STATES.map(async (state) => [
          ...(await access(new URL(state.frame, SCENES))
            .then(() => [])
            .catch(() => [`scenes/${state.frame}`])),
          ...(state.approved === undefined || approved.has(state.approved) ?
            []
          : [`look/${state.approved}`]),
        ]),
      )
    ).flat();

    expect(missing).toStrictEqual([]);
  });

  test('every frame of the panel scenes is shown', async () => {
    let shown = new Set(STATES.map((state) => state.frame));
    let left = (
      await Promise.all(
        [
          'bars/',
          'menu-and-pages/',
          'metronome/',
          'new-synth/',
          'picker-while-playing/',
          'step-view/',
          'steps/',
          'synth-pages/',
        ].map(async (scene) =>
          (await readdir(new URL(scene, SCENES))).map((name) => `${scene}${name}`),
        ),
      )
    )
      .flat()
      .filter((frame) => !shown.has(frame));

    expect(left).toStrictEqual([]);
  });
});
