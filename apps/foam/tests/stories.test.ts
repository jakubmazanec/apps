import {describe, expect, test} from 'vitest';

import {createNight, findStory, hasStory} from '../source/game/core/night.js';

const START = {place: 'rotorBarRoom', minutes: 1390, money: 350} as const;
const SONG = 'The guitarist who plays for one';

describe(findStory, () => {
  test("adds the title to the collection, to the night's list with the minute and to the log", () => {
    let night = createNight(START);

    findStory(night, SONG);

    expect(night.collection.titles).toEqual([SONG]);
    expect(night.stories).toEqual([{title: SONG, minutes: 1390}]);
    expect(night.log).toEqual([{kind: 'story', minutes: 1390, text: SONG}]);
  });

  test('the same title again adds nothing anywhere', () => {
    let night = createNight(START);

    findStory(night, SONG);
    findStory(night, SONG);

    expect(night.collection.titles).toHaveLength(1);
    expect(night.stories).toHaveLength(1);
    expect(night.log).toHaveLength(1);
  });

  test('a title already in the collection handed to the night gives nothing', () => {
    let night = createNight(START, {titles: [SONG]});

    findStory(night, SONG);

    expect(night.stories).toEqual([]);
    expect(night.log).toEqual([]);
  });

  test('a title of several pages throws', () => {
    let night = createNight(START);

    expect(() => {
      findStory(night, ['One.', 'Two.']);
    }).toThrow(/several pages/);
  });

  test("two nights sharing one collection see each other's finds", () => {
    let collection = {titles: []};
    let first = createNight(START, collection);
    let second = createNight(START, collection);

    findStory(first, SONG);

    expect(hasStory(second, SONG)).toBe(true);
    expect(second.stories).toEqual([]);
  });
});

describe(hasStory, () => {
  test('is false before the find and true after, by the title', () => {
    let night = createNight(START);

    expect(hasStory(night, SONG)).toBe(false);

    findStory(night, SONG);

    expect(hasStory(night, SONG)).toBe(true);
    expect(hasStory(night, 'The keys')).toBe(false);
  });
});
