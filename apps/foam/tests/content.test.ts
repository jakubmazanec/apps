import {Dialogue} from 'tellurion';
import {describe, expect, test} from 'vitest';

import locationData from '../source/game/content/data/locations.json';
import map from '../source/game/content/data/map.json';
import travel from '../source/game/content/data/travel.json';
import {journeys} from '../source/game/content/journeys.js';
import {locations, places} from '../source/game/content/locations.js';
import {nightEnd} from '../source/game/content/nightEnd.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {checkContent} from '../source/game/core/checkContent.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  GLYPH_WIDTH,
} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {createNight, type Night, type PlaceId} from '../source/game/core/night.js';
import {type Place, type Spot} from '../source/game/core/place.js';

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

function getPlace(id: PlaceId): Place {
  let place = places[id];

  if (place === undefined) {
    throw new Error(`The game has no place "${id}"!`);
  }

  return place;
}

function getSpotScript(place: Place, label: string): Spot['script'] {
  let spot = place.spots.find((candidate) => candidate.label === label);

  if (spot === undefined) {
    throw new Error(`The place "${place.id}" has no spot "${label}"!`);
  }

  return spot.script;
}

// A dialogue on a spot's script, as the story window runs it, on a night of its own in the place.
function openSpot(
  id: PlaceId,
  label: string,
  minutes: number,
): {dialogue: Dialogue<Night>; night: Night} {
  let night = createNight({place: id, minutes, money: 350});

  return {
    dialogue: new Dialogue({script: getSpotScript(getPlace(id), label), context: night}),
    night,
  };
}

function readChoices(dialogue: Dialogue<Night>): string[] {
  return dialogue.visibleChoices.map((choice) => choice.text);
}

function openWhiskyShopDoor(minutes: number): {dialogue: Dialogue<Night>; night: Night} {
  return openSpot('whiskyShopStreet', 'The Whisky Shop', minutes);
}

function readCornerTableAt(minutes: number): string[] {
  return readChoices(openSpot('rotorBarRoom', 'The corner table', minutes).dialogue);
}

describe('the game content', () => {
  test("the game's content has no problem", () => {
    expect(
      checkContent({locations, places, journeys, locationData, travel, map, end: nightEnd}),
    ).toEqual([]);
  });

  test('the end text reads the money', () => {
    let dialogue = new Dialogue({
      script: nightEnd,
      context: createNight({place: 'rotorBarRoom', minutes: 1925, money: 120}),
    });

    expect(dialogue.pageText).toContain('120 Kč');
    expect(dialogue.node?.speaker).toBe('Morning');
  });

  test('locations holds the seven locations, each with the places of the spec', () => {
    let read = Object.fromEntries(
      Object.entries(locations).map(([id, location]) => [
        id,
        {
          id: location.id,
          name: location.name,
          places: location.places.map((place) => place.id),
          arrival: location.arrival,
          outside: location.outside ?? null,
          hasClosing: location.closing !== undefined,
        },
      ]),
    );

    expect(read).toEqual({
      train: {
        id: 'train',
        name: 'The train',
        places: ['train'],
        arrival: 'train',
        outside: null,
        hasClosing: false,
      },
      zidenice: {
        id: 'zidenice',
        name: 'Brno-Židenice',
        places: ['zidenice'],
        arrival: 'zidenice',
        outside: null,
        hasClosing: false,
      },
      hlavniNadrazi: {
        id: 'hlavniNadrazi',
        name: 'Brno hlavní nádraží',
        places: ['hlavniNadraziHall', 'hlavniNadraziForecourt'],
        arrival: 'hlavniNadraziForecourt',
        outside: null,
        hasClosing: false,
      },
      whiskyShop: {
        id: 'whiskyShop',
        name: 'The Whisky Shop Brno',
        places: ['whiskyShopRoom', 'whiskyShopStreet'],
        arrival: 'whiskyShopRoom',
        outside: 'whiskyShopStreet',
        hasClosing: true,
      },
      rotorBar: {
        id: 'rotorBar',
        name: 'Rotor Bar',
        places: ['rotorBarRoom', 'rotorBarStreet'],
        arrival: 'rotorBarRoom',
        outside: 'rotorBarStreet',
        hasClosing: true,
      },
      namestiRepubliky: {
        id: 'namestiRepubliky',
        name: 'Náměstí Republiky',
        places: ['namestiRepubliky'],
        arrival: 'namestiRepubliky',
        outside: null,
        hasClosing: false,
      },
      malinovskehoNamesti: {
        id: 'malinovskehoNamesti',
        name: 'Malinovského náměstí',
        places: ['malinovskehoNamesti'],
        arrival: 'malinovskehoNamesti',
        outside: null,
        hasClosing: false,
      },
    });
  });

  test('places holds the ten places by their ids', () => {
    expect(Object.keys(places).toSorted()).toEqual([
      'hlavniNadraziForecourt',
      'hlavniNadraziHall',
      'malinovskehoNamesti',
      'namestiRepubliky',
      'rotorBarRoom',
      'rotorBarStreet',
      'train',
      'whiskyShopRoom',
      'whiskyShopStreet',
      'zidenice',
    ]);

    for (let [id, place] of Object.entries(places)) {
      expect(place.id).toBe(id);
    }
  });

  test('a night starts on the train at 16:00 with 350 Kč', () => {
    expect(nightStart.place).toBe('train');
    expect(nightStart.minutes).toBe(960);
    expect(nightStart.money).toBe(350);
    expect(nightStart.locations).toBe(locations);
    expect(nightStart.places).toBe(places);
    expect(nightStart.locationData).toBe(locationData);
    expect(nightStart.map).toBe(map);
  });

  test("the train's door leads to the hall", () => {
    let {dialogue, night} = openSpot('train', 'The door', 960);

    dialogue.advance();
    dialogue.choose(1);

    expect(night.place).toBe('hlavniNadraziHall');
  });

  test("Vranovská's door waits before the opening, opens at 16:30 and is locked from 21:00", () => {
    let {dialogue: early, night} = openWhiskyShopDoor(980);

    expect(readChoices(early)).toEqual(['Wait a while', 'Leave it']);

    early.advance();
    early.choose(0);

    expect(night.minutes).toBe(990);
    expect(readChoices(early)).toEqual(['Go in', 'Stay outside']);
    expect(readChoices(openWhiskyShopDoor(990).dialogue)).toEqual(['Go in', 'Stay outside']);
    expect(readChoices(openWhiskyShopDoor(1259).dialogue)).toEqual(['Go in', 'Stay outside']);

    let {dialogue: late} = openWhiskyShopDoor(1260);

    expect(readChoices(late)).toEqual([]);
    expect(late.pageText).toContain('locked');
  });

  test("Rotor Bar's corner table seats the guitarist from 22:00 to 01:00", () => {
    expect(readCornerTableAt(1320)).toEqual(['Ask for a song', 'Leave him to it']);
    expect(readCornerTableAt(1499)).toEqual(['Ask for a song', 'Leave him to it']);
    expect(readCornerTableAt(1319)).toEqual(['Take the spare chair', 'Leave them to it']);
    expect(readCornerTableAt(1500)).toEqual(['Take the spare chair', 'Leave them to it']);
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
