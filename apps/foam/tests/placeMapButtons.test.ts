import {describe, expect, test} from 'vitest';

import {placeMapButtons} from '../source/game/core/placeMapButtons.js';

describe(placeMapButtons, () => {
  test('buttons far apart sit centred on their pixels', () => {
    expect(
      placeMapButtons(
        [
          {x: 20, y: 20},
          {x: 60, y: 60},
        ],
        null,
        100,
        100,
      ),
    ).toEqual([
      {x: 16, y: 16},
      {x: 56, y: 56},
    ]);
  });

  test('two close buttons are pushed apart', () => {
    expect(
      placeMapButtons(
        [
          {x: 50, y: 50},
          {x: 53, y: 50},
        ],
        null,
        100,
        100,
      ),
    ).toEqual([
      {x: 42, y: 46},
      {x: 54, y: 46},
    ]);
  });

  test('a button on the light moves away from it', () => {
    expect(placeMapButtons([{x: 50, y: 50}], {x: 50, y: 50}, 100, 100)).toEqual([{x: 34, y: 46}]);
  });

  test('buttons are kept inside the map', () => {
    expect(
      placeMapButtons(
        [
          {x: 2, y: 50},
          {x: 99, y: 99},
        ],
        null,
        100,
        100,
      ),
    ).toEqual([
      {x: 0, y: 46},
      {x: 92, y: 92},
    ]);
  });

  test('the same input gives the same output', () => {
    let centres = [
      {x: 30, y: 30},
      {x: 32, y: 31},
      {x: 34, y: 30},
    ];

    expect(placeMapButtons(centres, {x: 33, y: 31}, 100, 100)).toEqual(
      placeMapButtons(centres, {x: 33, y: 31}, 100, 100),
    );
  });

  test('three buttons on one point in a tiny map stay inside it', () => {
    let centre = {x: 5, y: 5};
    let result = placeMapButtons([centre, centre, centre], null, 10, 10);

    expect(result).toHaveLength(3);

    for (let {x, y} of result) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(2);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(2);
    }
  });
});
