import {describe, expect, test} from 'vitest';

import {countTags} from '../scripts/list-stand-ins.mjs';

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
