import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

const TEXTS_READ_KEY = 'foam:textsRead';
const PATH = 'rotorBarRoom › The corner table › cards';
// textsRead.ts hydrates at module load, so each test re-imports a fresh copy after seeding
// localStorage, as stories.browser.test.ts does; see settings.browser.test.ts for why the
// specifier is a variable with a query and the real .ts extension.
let textsReadImport = 0;

interface TextsReadModule {
  forgetTextsRead: () => void;
  markRead: (where: string, nodeId: string) => void;
  textsRead: {paths: string[]};
}

async function importTextsRead() {
  textsReadImport += 1;

  return import(
    /* @vite-ignore */ `../source/game/core/textsRead.ts?fresh=${textsReadImport}`
  ) as Promise<TextsReadModule>;
}

describe('the texts read', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('nothing stored gives an empty set', async () => {
    let {textsRead} = await importTextsRead();

    expect(textsRead).toEqual({paths: []});
  });

  test('a stored list loads', async () => {
    localStorage.setItem(TEXTS_READ_KEY, JSON.stringify({paths: [PATH]}));

    let {textsRead} = await importTextsRead();

    expect(textsRead.paths).toEqual([PATH]);
  });

  test('paths that are not a list load empty', async () => {
    localStorage.setItem(TEXTS_READ_KEY, JSON.stringify({paths: PATH}));

    let {textsRead} = await importTextsRead();

    expect(textsRead).toEqual({paths: []});
  });

  test('markRead adds the path once, saves, and prints it the first time only', async () => {
    let info = vitest.spyOn(console, 'info');

    try {
      let {markRead, textsRead} = await importTextsRead();

      markRead('rotorBarRoom › The corner table', 'cards');

      expect(textsRead.paths).toEqual([PATH]);
      expect(JSON.parse(localStorage.getItem(TEXTS_READ_KEY) ?? '')).toEqual({paths: [PATH]});
      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(`Read: ${PATH}`);

      markRead('rotorBarRoom › The corner table', 'cards');

      expect(textsRead.paths).toEqual([PATH]);
      expect(info).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
    }
  });

  test('forgetTextsRead empties in place and removes the key', async () => {
    localStorage.setItem(TEXTS_READ_KEY, JSON.stringify({paths: [PATH]}));

    let {forgetTextsRead, textsRead} = await importTextsRead();
    let {paths} = textsRead;

    forgetTextsRead();

    let {paths: pathsAfter} = textsRead;

    expect(paths).toEqual([]);
    expect(pathsAfter).toBe(paths);
    expect(localStorage.getItem(TEXTS_READ_KEY)).toBeNull();
  });
});
