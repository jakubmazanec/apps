import {describe, expect, test} from 'vitest';

import map from '../source/game/content/data/map.json';
import placeData from '../source/game/content/data/places.json';
import travel from '../source/game/content/data/travel.json';
import {journeys} from '../source/game/content/journeys.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {places} from '../source/game/content/places.js';
import {checkContent} from '../source/game/core/checkContent.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  GLYPH_WIDTH,
} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';

const SCREENS = [
  {width: 480, height: 270},
  {width: 195, height: 350},
  {width: 146, height: 262},
] as const;

type Box = {left: number; top: number; width: number; height: number};

function doBoxesOverlap(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

describe('the game content', () => {
  test("the game's content has no problem", () => {
    expect(checkContent({places, journeys, placeData, travel, map})).toEqual([]);
  });

  test('places holds the seven places by their ids', () => {
    expect(Object.keys(places).toSorted()).toEqual([
      'hlavniNadrazi',
      'malinovskehoNamesti',
      'namestiRepubliky',
      'rotorBar',
      'train',
      'whiskyShop',
      'zidenice',
    ]);

    for (let [id, place] of Object.entries(places)) {
      expect(place.id).toBe(id);
    }
  });

  test('a night starts on the train at 17:00 with 350 Kč', () => {
    expect(nightStart.place).toBe('train');
    expect(nightStart.minutes).toBe(1020);
    expect(nightStart.money).toBe(350);
    expect(nightStart.places).toBe(places);
    expect(nightStart.placeData).toBe(placeData);
    expect(nightStart.map).toBe(map);
  });

  test('no two scene buttons of a place overlap', () => {
    for (let place of Object.values(places)) {
      for (let {width, height} of SCREENS) {
        let area = getSceneArea(width, height);
        let boxes = place.spots.map((spot) => {
          let buttonWidth = spot.label.length * GLYPH_WIDTH + 2 * BUTTON_PADDING_X;

          return {
            label: spot.label,
            width: buttonWidth,
            height: BUTTON_HEIGHT,
            ...getSpotPosition({
              x: spot.x,
              y: spot.y,
              width: buttonWidth,
              height: BUTTON_HEIGHT,
              area,
            }),
          };
        });
        let overlaps: string[] = [];

        for (let [index, box] of boxes.entries()) {
          for (let other of boxes.slice(index + 1)) {
            if (doBoxesOverlap(box, other)) {
              overlaps.push(`${place.id} ${width}x${height}: ${box.label} and ${other.label}`);
            }
          }
        }

        expect(overlaps).toEqual([]);
      }
    }
  });
});
