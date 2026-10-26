import {Dialogue} from 'tellurion';
import {describe, expect, test} from 'vitest';

import locationData from '../source/game/content/data/locations.json';
import map from '../source/game/content/data/map.json';
import travel from '../source/game/content/data/travel.json';
import {journeys} from '../source/game/content/journeys.js';
import {locations, places} from '../source/game/content/locations.js';
import {nightEnd} from '../source/game/content/nightEnd.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {FRIEND_EARLY, FRIEND_LATE, PARTY} from '../source/game/content/quest.js';
import {checkContent} from '../source/game/core/checkContent.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  GLYPH_WIDTH,
} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {isOpenAt} from '../source/game/core/hours.js';
import {createNight, type Night, type PlaceId, type Quest} from '../source/game/core/night.js';
import {type Place, type Spot} from '../source/game/core/place.js';
import {asChoice, formatChoice} from '../source/game/core/script.js';
import {todaySeed} from '../source/game/core/todaySeed.js';

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
  {
    collection,
    ...start
  }: {
    money?: number;
    drunkenness?: number;
    collection?: Night['collection'];
    quest?: Partial<Quest>;
  } = {},
): {dialogue: Dialogue<Night>; night: Night} {
  let night = createNight({seed: 1, place: id, minutes, money: 350, ...start}, collection);

  return {
    dialogue: new Dialogue({script: getSpotScript(getPlace(id), label), context: night}),
    night,
  };
}

// Takes a choice of the dialogue's first node, with the dice pinned to `random`, so that a roll
// wins or loses as the test needs.
function takeChoice(
  opened: {dialogue: Dialogue<Night>; night: Night},
  index: number,
  random = 0,
): {dialogue: Dialogue<Night>; night: Night} {
  opened.night.random = () => random;
  opened.dialogue.advance();
  opened.dialogue.choose(index);

  return opened;
}

// Whether some spot of the place offers the flat at 1400 on a night with this quest.
function offersFlat(id: PlaceId, quest: Partial<Quest>): boolean {
  return getPlace(id).spots.some((spot) => {
    let night = createNight({seed: 1, place: id, minutes: 1400, money: 350, quest});
    let dialogue = new Dialogue({script: spot.script, context: night});

    dialogue.advance();

    return readChoices(dialogue).includes('Walk to the flat and sleep');
  });
}

// The end script opened on a night at its final minute, with the quest and the stories given.
function openEnd(quest: Partial<Quest>, stories = 0): Dialogue<Night> {
  let night = createNight({seed: 1, place: 'hlavniNadraziHall', minutes: 1920, money: 50, quest});

  for (let index = 0; index < stories; index++) {
    night.stories.push({title: 'A story', minutes: 1500});
  }

  return new Dialogue({script: nightEnd, context: night});
}

function readChoices(dialogue: Dialogue<Night>): string[] {
  return dialogue.visibleChoices.map((choice) => choice.text);
}

// The node a spot's script holds under the key.
function nodeOf(id: PlaceId, label: string, key: string): unknown {
  return getSpotScript(getPlace(id), label).nodes?.[key];
}

function getLongTableNode(minutes: number, quest?: Partial<Quest>): unknown {
  return openSpot('rotorBarRoom', 'The long table', minutes, quest === undefined ? {} : {quest})
    .dialogue.node;
}

function getLongTableKey(key: string): unknown {
  return nodeOf('rotorBarRoom', 'The long table', key);
}

function getBackRoomNode(minutes: number, quest?: Partial<Quest>): unknown {
  return openSpot('rotorBarRoom', 'The back room', minutes, quest === undefined ? {} : {quest})
    .dialogue.node;
}

// The answer of the spot's friend node, asked for at the hour.
function ask(id: PlaceId, label: string, minutes: number, quest?: Partial<Quest>): string {
  let {dialogue} = openSpot(id, label, minutes, quest === undefined ? {} : {quest});

  dialogue.advance();
  dialogue.choose(
    dialogue.visibleChoices.findIndex((choice) => choice.text === 'Ask after your friend'),
  );

  return dialogue.pageText;
}

function openWhiskyShopDoor(minutes: number): {dialogue: Dialogue<Night>; night: Night} {
  return openSpot('whiskyShopStreet', 'The Whisky Shop', minutes);
}

function readCornerTableAt(minutes: number): string[] {
  return readChoices(openSpot('rotorBarRoom', 'The corner table', minutes).dialogue);
}

describe('the game content', () => {
  // The checker runs every script on 33,600 nights, and the CI runners are several times slower
  // than a dev machine and uneven among themselves: the slowest took it close to 50 seconds.
  test("the game's content has no problem", () => {
    expect(
      checkContent({locations, places, journeys, locationData, travel, map, end: nightEnd}),
    ).toEqual([]);
  }, 120_000);

  test("the end's start reads the flags: a ticket, then the keys, then stranded", () => {
    let both = openEnd({hasKeys: true, hasTicket: true});

    expect(openEnd({hasTicket: true}).node).toBe(nightEnd.nodes?.leave);
    expect(openEnd({hasKeys: true}).node).toBe(nightEnd.nodes?.stay);
    expect(both.node).toBe(nightEnd.nodes?.both);
    expect(openEnd({}).node).toBe(nightEnd.nodes?.stranded);
    expect(openEnd({hasBottle: true}).node).toBe(nightEnd.nodes?.stranded);
    expect(both.node?.speaker).toBe('Morning');
    expect(openEnd({hasTicket: true}).node?.speaker).toBe('Morning');
    expect(openEnd({hasKeys: true}).node?.speaker).toBe('Morning');
    expect(openEnd({}).node?.speaker).toBe('Morning');
  });

  test('both offers two free choices, each to its ending', () => {
    let dialogue = openEnd({hasKeys: true, hasTicket: true});

    dialogue.advance();

    expect(readChoices(dialogue)).toEqual(['Take the train', 'Stay']);
    expect(
      dialogue.visibleChoices.every(
        (choice) => !('price' in choice || 'minutes' in choice || 'drinks' in choice),
      ),
    ).toBe(true);

    dialogue.choose(0);

    expect(dialogue.node).toBe(nightEnd.nodes?.leave);

    let again = openEnd({hasKeys: true, hasTicket: true});

    again.advance();
    again.choose(1);

    expect(again.node).toBe(nightEnd.nodes?.stay);
  });

  test("every ending tells the bottle's fate", () => {
    // The flag sets that give stranded, stay and leave.
    for (let base of [{}, {hasKeys: true}, {hasTicket: true}]) {
      let never = openEnd({...base}).pageText;
      let carried = openEnd({...base, hasBottle: true}).pageText;
      let given = openEnd({...base, hasBottle: true, bottleGiven: true}).pageText;

      expect(new Set([carried, given, never]).size).toBe(3);
      expect(openEnd({...base, bottleGiven: true}).pageText).toBe(given);
    }
  });

  test('every ending counts the stories', () => {
    for (let base of [{}, {hasKeys: true}, {hasTicket: true}]) {
      let none = openEnd({...base}, 0).pageText;
      let one = openEnd({...base}, 1).pageText;
      let three = openEnd({...base}, 3).pageText;

      expect(new Set([none, one, three]).size).toBe(3);
      expect(three).toContain('3');
    }
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

  test("a night starts on the train at 16:00 with today's seed and 300 to 500 Kč by 50", () => {
    expect(nightStart.place).toBe('train');
    expect(nightStart.minutes).toBe(960);
    expect(nightStart.seed).toBe(todaySeed());
    expect(nightStart.money).toEqual({min: 300, max: 500, step: 50});
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

  test("the quest's spans lie inside Rotor's hours", () => {
    let {hours} = locationData.rotorBar;

    for (let span of [FRIEND_EARLY, FRIEND_LATE, PARTY]) {
      expect(isOpenAt(hours, span[0])).toBe(true);
      expect(isOpenAt(hours, span[1] - 1)).toBe(true);
    }
  });

  test('the bag holds the note and the invitation, and the timetable the train and its price', () => {
    let {dialogue} = openSpot('train', 'The bag', 960);
    let first = dialogue.pageText;

    // The first press shows the rest of the page, the second turns it.
    dialogue.advance();
    dialogue.advance();

    expect(dialogue.node).toBe(nodeOf('train', 'The bag', 'bag'));
    expect(dialogue.pageIndex).toBe(1);
    expect(first).toContain("Keys are with me. Find me, I'm out.");
    expect(dialogue.pageText).toContain('Rotor Bar');

    let timetable = openSpot('train', 'The timetable', 960).dialogue;

    expect(timetable.pageText).toContain('08:04');
    expect(timetable.pageText).toContain('300 Kč');
  });

  test('the ticket machine sells the ticket once', () => {
    let opened = openSpot('hlavniNadraziHall', 'The ticket machine', 1500);

    expect(opened.dialogue.node).toBe(nodeOf('hlavniNadraziHall', 'The ticket machine', 'machine'));

    opened.dialogue.advance();

    expect(readChoices(opened.dialogue)).toEqual(['Buy a ticket home', 'Walk away']);

    opened.dialogue.choose(0);

    expect(opened.night.quest.hasTicket).toBe(true);
    expect(opened.night.money).toBe(50);
    expect(opened.dialogue.node).toBe(nodeOf('hlavniNadraziHall', 'The ticket machine', 'bought'));

    let ticketed = openSpot('hlavniNadraziHall', 'The ticket machine', 1500, {
      quest: {hasTicket: true},
    });

    ticketed.dialogue.advance();

    expect(ticketed.dialogue.node).toBe(
      nodeOf('hlavniNadraziHall', 'The ticket machine', 'ticketed'),
    );
    expect(readChoices(ticketed.dialogue)).toEqual([]);
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

  test("the corner table's song is a story, found once", () => {
    let {night} = takeChoice(openSpot('rotorBarRoom', 'The corner table', 1390), 0);

    expect(night.stories).toEqual([{title: 'The guitarist who plays for one', minutes: 1400}]);
    expect(night.log).toEqual([
      {kind: 'story', minutes: 1400, text: 'The guitarist who plays for one'},
    ]);

    let {night: later} = takeChoice(
      openSpot('rotorBarRoom', 'The corner table', 1390, {
        collection: {titles: ['The guitarist who plays for one']},
      }),
      0,
    );

    expect(later.stories).toEqual([]);
    expect(later.log).toEqual([]);
  });

  test('the cigarette and the bottle are offered only until their story is achieved', () => {
    expect(
      readChoices(openSpot('rotorBarStreet', 'The smokers', 1200, {drunkenness: 2}).dialogue),
    ).toEqual(['Ask for a cigarette', 'Ask after your friend', 'Leave them to it']);
    expect(
      readChoices(
        openSpot('rotorBarStreet', 'The smokers', 1200, {
          drunkenness: 2,
          collection: {titles: ['The tram that stopped early']},
        }).dialogue,
      ),
    ).toEqual(['Ask after your friend', 'Leave them to it']);
    expect(readChoices(openSpot('whiskyShopRoom', 'Two regulars', 1100).dialogue)).toEqual([
      'Ask about the bottle',
      'Let them be',
    ]);
    expect(
      readChoices(
        openSpot('whiskyShopRoom', 'Two regulars', 1100, {
          collection: {titles: ['A bottle saved for an occasion']},
        }).dialogue,
      ),
    ).toEqual(['Let them be']);
  });

  test('the back room has the friend by the hour, and is a chat once the keys are in hand', () => {
    expect(getBackRoomNode(1000)).toBe(nodeOf('rotorBarRoom', 'The back room', 'away'));
    expect(getBackRoomNode(1020)).toBe(nodeOf('rotorBarRoom', 'The back room', 'there'));
    expect(getBackRoomNode(1199)).toBe(nodeOf('rotorBarRoom', 'The back room', 'there'));
    expect(getBackRoomNode(1200)).toBe(nodeOf('rotorBarRoom', 'The back room', 'away'));
    expect(getBackRoomNode(1379)).toBe(nodeOf('rotorBarRoom', 'The back room', 'away'));
    expect(getBackRoomNode(1380)).toBe(nodeOf('rotorBarRoom', 'The back room', 'there'));
    expect(getBackRoomNode(1619)).toBe(nodeOf('rotorBarRoom', 'The back room', 'there'));
    expect(getBackRoomNode(1300, {hasKeys: true})).toBe(
      nodeOf('rotorBarRoom', 'The back room', 'chat'),
    );
  });

  test("the search's odds fall with the drinks", () => {
    for (let [drunkenness, label] of [
      [0, 'Look for them  10 min  70%'],
      [3, 'Look for them  10 min  40%'],
    ] as const) {
      let {dialogue, night} = openSpot('rotorBarRoom', 'The back room', 1100, {drunkenness});

      dialogue.advance();

      expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe(label);
    }
  });

  test('a won search hands over the keys, and a lost one costs an hour', () => {
    let won = takeChoice(openSpot('rotorBarRoom', 'The back room', 1100), 0, 0.1);

    expect(won.night.quest.hasKeys).toBe(true);
    expect(won.night.stories).toEqual([{title: 'The keys', minutes: 1110}]);
    expect(won.dialogue.node).toBe(nodeOf('rotorBarRoom', 'The back room', 'found'));

    let lost = takeChoice(openSpot('rotorBarRoom', 'The back room', 1100), 0, 0.9);

    expect(lost.night.quest.hasKeys).toBe(false);
    expect(lost.night.minutes).toBe(1170);
    expect(lost.dialogue.node).toBe(nodeOf('rotorBarRoom', 'The back room', 'missed'));
  });

  test('the hints answer by the hour and by the keys, and read nothing else', () => {
    let bartender = [1000, 1100, 1300, 1400].map((minutes) =>
      ask('rotorBarRoom', 'The bar', minutes),
    );
    let smokers = [1000, 1100, 1300, 1400, 1650].map((minutes) =>
      ask('rotorBarStreet', 'The smokers', minutes),
    );

    expect(new Set(bartender).size).toBe(4);
    expect(bartender[2]).toContain('eleven');
    expect(new Set(smokers).size).toBe(5);
    expect(ask('rotorBarRoom', 'The bar', 1100, {hasKeys: true})).not.toBe(bartender[1]);
    expect(ask('rotorBarRoom', 'The bar', 1100, {hasBottle: true, hasTicket: true})).toBe(
      bartender[1],
    );

    let shopkeeper = ask('whiskyShopRoom', 'The shopkeeper', 1100);

    expect(shopkeeper).toContain('Dvořákova');
    expect(ask('whiskyShopRoom', 'The shopkeeper', 1100, {hasKeys: true})).not.toBe(shopkeeper);
  });

  test('the shelves sell the bottle once', () => {
    let opened = openSpot('whiskyShopRoom', 'The shelves', 1020);

    opened.dialogue.advance();

    expect(readChoices(opened.dialogue)).toEqual([
      'Buy the bottle for the birthday',
      'Pour a dram',
      'Pour the good one',
      'Not now',
    ]);

    opened.dialogue.choose(0);

    expect(opened.night.quest.hasBottle).toBe(true);
    expect(opened.night.money).toBe(100);
    expect(opened.dialogue.node).toBe(nodeOf('whiskyShopRoom', 'The shelves', 'wrapped'));

    let bought = openSpot('whiskyShopRoom', 'The shelves', 1020, {quest: {hasBottle: true}});

    bought.dialogue.advance();

    expect(readChoices(bought.dialogue)).toEqual(['Pour a dram', 'Pour the good one', 'Not now']);
  });

  test('the long table is the birthday from 20:00 to 01:00', () => {
    expect(getLongTableNode(1100)).toBe(getLongTableKey('laid'));
    expect(getLongTableNode(1200)).toBe(getLongTableKey('withoutBottle'));
    expect(getLongTableNode(1200, {hasBottle: true})).toBe(getLongTableKey('withBottle'));
    expect(getLongTableNode(1499, {hasBottle: true})).toBe(getLongTableKey('withBottle'));
    expect(getLongTableNode(1200, {hasBottle: true, bottleGiven: true})).toBe(
      getLongTableKey('thanked'),
    );
    expect(getLongTableNode(1200, {bottleGiven: true})).toBe(getLongTableKey('thanked'));
    expect(getLongTableNode(1500)).toBe(getLongTableKey('over'));
  });

  test('the hand-over keeps the promise, and at three drinks the bottle is opened', () => {
    let given = takeChoice(
      openSpot('rotorBarRoom', 'The long table', 1200, {quest: {hasBottle: true}}),
      0,
    );

    expect(given.night.quest.bottleGiven).toBe(true);
    expect(given.night.stories).toEqual([{title: 'The birthday', minutes: 1200}]);
    expect(given.dialogue.node).toBe(nodeOf('rotorBarRoom', 'The long table', 'given'));

    let opened = takeChoice(
      openSpot('rotorBarRoom', 'The long table', 1200, {
        drunkenness: 3,
        quest: {hasBottle: true},
      }),
      0,
    );

    expect(opened.night.quest.bottleGiven).toBe(true);
    expect(opened.night.stories).toEqual([{title: 'The birthday', minutes: 1200}]);
    expect(opened.dialogue.node).toBe(nodeOf('rotorBarRoom', 'The long table', 'opened'));
  });

  test("the game's content has thirteen stories", () => {
    let {closing} = locations.rotorBar;

    if (closing === undefined) {
      throw new Error('Rotor Bar has no closing!');
    }

    // The bar closes at 03:00 and puts the player out on its street.
    let closed = createNight({seed: 1, place: 'rotorBarStreet', minutes: 1620, money: 350});
    // Each dialogue reaches the node of one story: 0.1 wins the spare chair's roll and the
    // shelter's and the back room's search, and 0.95 loses the chair's above 0.9, which spills
    // the beer. The long table hands the bottle over for the birthday.
    let opened = [
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1390), 0),
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1200), 0, 0.1),
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1200), 0, 0.95),
      takeChoice(openSpot('rotorBarStreet', 'The smokers', 1200, {drunkenness: 2}), 0),
      takeChoice(openSpot('whiskyShopRoom', 'Two regulars', 1100), 0),
      takeChoice(openSpot('whiskyShopRoom', 'The shelves', 1100), 2),
      takeChoice(openSpot('rotorBarRoom', 'The back room', 1100), 0, 0.1),
      takeChoice(openSpot('rotorBarRoom', 'The long table', 1200, {quest: {hasBottle: true}}), 0),
      takeChoice(openSpot('hlavniNadraziForecourt', 'A stranger', 1100), 0),
      openSpot('hlavniNadraziHall', 'The hall', 1100),
      takeChoice(openSpot('namestiRepubliky', 'The shelter', 1100), 0, 0.1),
      openSpot('zidenice', 'The bench', 1100),
      {dialogue: new Dialogue({script: closing, context: closed}), night: closed},
    ];

    expect(new Set(opened.flatMap(({night}) => night.stories.map(({title}) => title)))).toEqual(
      new Set([
        'A bottle saved for an occasion',
        'A seat at the table',
        'A train not on the timetable',
        'The birthday',
        'The good one',
        'The guitarist who plays for one',
        'The keys',
        'The man who knew the timetable',
        'The spilled beer',
        'The station that never moved',
        'The tram that stopped early',
        'Thrown out at three',
        'Twenty crowns',
      ]),
    );
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

  test('three places let a stranded player sleep till morning', () => {
    let benches = openSpot('hlavniNadraziHall', 'The benches', 1380);

    benches.dialogue.advance();

    expect(readChoices(benches.dialogue)).toEqual([
      'Doze till the first train',
      'Stay on your feet',
    ]);

    benches.dialogue.choose(0);

    expect(benches.night.minutes).toBe(1920);

    let bench = openSpot('zidenice', 'The bench', 1380);

    bench.dialogue.advance();

    expect(readChoices(bench.dialogue)).toEqual(['Sleep it off', 'Leave him to it']);

    bench.dialogue.choose(0);

    expect(bench.night.minutes).toBe(1920);

    let shelter = openSpot('namestiRepubliky', 'The shelter', 1380);

    shelter.dialogue.advance();

    expect(readChoices(shelter.dialogue)).toEqual([
      'Ask when the next tram goes',
      'Wait in silence',
      'Sleep it off',
    ]);

    shelter.dialogue.choose(2);

    expect(shelter.night.minutes).toBe(1920);
  });

  test('every outdoor place offers the flat with the keys, and none without', () => {
    let outdoor = Object.values(places).filter((place) => place.outdoors);

    expect(outdoor.length).toBeGreaterThan(0);
    expect(outdoor.filter((place) => !offersFlat(place.id, {hasKeys: true}))).toEqual([]);
    expect(outdoor.filter((place) => offersFlat(place.id, {}))).toEqual([]);
  });
});
