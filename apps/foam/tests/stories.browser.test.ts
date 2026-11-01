import {afterEach, beforeEach, describe, expect, test} from 'vitest';

const STORIES_KEY = 'foam:stories';
// stories.ts hydrates at module load, so each test re-imports a fresh copy
// after seeding localStorage, as settings.browser.test.ts does; see there for why
// the specifier is a variable with a query and the real .ts extension.
let storiesImport = 0;

interface StoriesModule {
  collection: {titles: string[]};
  forgetStories: () => void;
  reloadCollection: () => void;
  saveCollection: () => void;
}

async function importStories() {
  storiesImport += 1;

  return import(
    /* @vite-ignore */ `../source/game/core/stories.ts?fresh=${storiesImport}`
  ) as Promise<StoriesModule>;
}

describe('stories', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('nothing stored gives an empty collection', async () => {
    let {collection} = await importStories();

    expect(collection).toEqual({titles: []});
  });

  test('a stored list loads', async () => {
    localStorage.setItem(STORIES_KEY, JSON.stringify({titles: ['A', 'B']}));

    let {collection} = await importStories();

    expect(collection.titles).toEqual(['A', 'B']);
  });

  test('text that is not JSON gives an empty collection', async () => {
    localStorage.setItem(STORIES_KEY, '{"titles": [');

    let {collection} = await importStories();

    expect(collection).toEqual({titles: []});
  });

  test('titles that are not a list give an empty collection', async () => {
    localStorage.setItem(STORIES_KEY, JSON.stringify({titles: 'A'}));

    let {collection} = await importStories();

    expect(collection).toEqual({titles: []});
  });

  test('saveCollection writes the titles', async () => {
    let {collection, saveCollection} = await importStories();

    collection.titles.push('A');
    saveCollection();

    expect(JSON.parse(localStorage.getItem(STORIES_KEY) ?? '')).toEqual({titles: ['A']});
  });

  test('reloadCollection replaces the titles in place from the store', async () => {
    localStorage.setItem(STORIES_KEY, JSON.stringify({titles: ['A', 'B']}));

    let {collection, reloadCollection} = await importStories();
    let {titles} = collection;

    titles.push('C');
    localStorage.setItem(STORIES_KEY, JSON.stringify({titles: ['A']}));
    reloadCollection();

    let {titles: titlesAfter} = collection;

    expect(titlesAfter).toEqual(['A']);
    expect(titlesAfter).toBe(titles);
  });

  test('forgetStories empties the object in place and removes the key', async () => {
    localStorage.setItem(STORIES_KEY, JSON.stringify({titles: ['A']}));

    let {collection, forgetStories} = await importStories();
    let {titles} = collection;

    forgetStories();

    let {titles: titlesAfter} = collection;

    expect(titles).toEqual([]);
    expect(titlesAfter).toBe(titles);
    expect(localStorage.getItem(STORIES_KEY)).toBeNull();
  });
});
