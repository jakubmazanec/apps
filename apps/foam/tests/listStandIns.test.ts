import {describe, expect, test} from 'vitest';

import {countTags, listStandIns} from '../scripts/list-stand-ins.mjs';

describe(countTags, () => {
  test('counts the tags and not the words', () => {
    let source = [
      'const a = standIn`One.`;',
      'const b = standIn`',
      '  Two.',
      '`;',
      'const c = prose`Three.`;',
      'import {standInPicture} from "./standInPicture.js"; // the prose is here',
    ].join('\n');

    expect(countTags(source)).toEqual({standIn: 2, written: 1});
  });
});

describe(listStandIns, () => {
  test('lists the files of every location folder, the journeys and the data', async () => {
    let lines = (await listStandIns()).split('\n');
    let starts = [
      'train/train.ts',
      'rotorBar/room.ts',
      'rotorBar/street.ts',
      'rotorBar/location.ts',
      'journeys.ts',
      'Locations not checked:',
    ];

    // The starts no line has.
    expect(starts.filter((start) => !lines.some((line) => line.startsWith(start)))).toEqual([]);
  });
});
