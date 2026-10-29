import {Dialogue} from 'tellurion';
import {describe, expect, test} from 'vitest';

import {
  AUTHOR,
  AUTHOR_STORY,
  getSeat,
  isAuthorIn,
  type Seat,
  SEATS,
} from '../source/game/content/author.js';
import locationData from '../source/game/content/data/locations.json';
import map from '../source/game/content/data/map.json';
import travel from '../source/game/content/data/travel.json';
import {journeys} from '../source/game/content/journeys.js';
import {locations, places} from '../source/game/content/locations.js';
import {CROWNS_STORY} from '../source/game/content/locations/hlavniNadrazi/forecourt.js';
import {FIGHT_STORY} from '../source/game/content/locations/malinovskehoNamesti/stop.js';
import {THROWN_OUT_STORY} from '../source/game/content/locations/rotorBar/location.js';
import {GUITARIST_STORY} from '../source/game/content/locations/rotorBar/room.js';
import {nightEnd} from '../source/game/content/nightEnd.js';
import {nightStart} from '../source/game/content/nightStart.js';
import {messages} from '../source/game/content/phone/index.js';
import {BIRTHDAY_STORY, FRIEND_EVENINGS, PARTY} from '../source/game/content/quest.js';
import {checkContent} from '../source/game/core/checkContent.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  GLYPH_WIDTH,
} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {isOpenAt} from '../source/game/core/hours.js';
import {
  createNight,
  type Ending,
  findStory,
  getDrunkenness,
  type Night,
  type PlaceId,
  type Quest,
} from '../source/game/core/night.js';
import {type Message} from '../source/game/core/phone.js';
import {type Place, type Spot} from '../source/game/core/place.js';
import {asChoice, formatChoice} from '../source/game/core/script.js';
import {todaySeed} from '../source/game/core/todaySeed.js';
import {getLocation} from '../source/game/core/travel.js';

const SCREENS = [
  {width: 480, height: 270},
  {width: 195, height: 350},
  {width: 146, height: 262},
] as const;
// The events of the arrival at each stop, by the place that has them.
const ARRIVALS = [
  ['namestiRepubliky', ['wallet', 'drunk']],
  ['malinovskehoNamesti', ['fight']],
  ['hlavniNadraziForecourt', ['phone']],
] as const;
const SEAT_ENTRIES = Object.entries(SEATS) as Array<[Seat, (typeof SEATS)[Seat]]>;

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

function getSpot(place: Place, label: string): Spot {
  let spot = place.spots.find((candidate) => candidate.label === label);

  if (spot === undefined) {
    throw new Error(`The place "${place.id}" has no spot "${label}"!`);
  }

  return spot;
}

function getSpotScript(place: Place, label: string): Spot['script'] {
  return getSpot(place, label).script;
}

// A night of its own in the place, with the version of today and the dice pinned.
function createPinnedNight(
  id: PlaceId,
  minutes: number,
  {collection, pick, random, ...start}: Parameters<typeof openSpot>[3] = {},
): Night {
  let night = createNight({seed: 1, place: id, minutes, money: 350, ...start}, collection);

  // The version of today is the first name of every table, unless the test names one: the night's
  // own pick would read the hash of the seed. It is pinned here because the dialogue is built
  // before a test could replace it, and the cast stands in for the generic name.
  night.pick = (key, odds) => (pick ?? Object.keys(odds)[0]) as never;

  if (random !== undefined) {
    night.random = () => random;
  }

  return night;
}

// A dialogue on a spot's script, as the story window runs it, on a night of its own in the place.
function openSpot(
  id: PlaceId,
  label: string,
  minutes: number,
  options: {
    money?: number;
    drunkenness?: number;
    collection?: Night['collection'];
    quest?: Partial<Quest>;
    events?: string[];
    pick?: string;
    random?: number;
  } = {},
): {dialogue: Dialogue<Night>; night: Night} {
  let night = createPinnedNight(id, minutes, options);

  return {
    dialogue: new Dialogue({script: getSpotScript(getPlace(id), label), context: night}),
    night,
  };
}

// A dialogue on the place's description, as the night screen opens it on arrival.
function openDescription(
  id: PlaceId,
  minutes: number,
  start: Parameters<typeof openSpot>[3] = {},
): {dialogue: Dialogue<Night>; night: Night} {
  let night = createPinnedNight(id, minutes, start);

  return {dialogue: new Dialogue({script: getPlace(id).description, context: night}), night};
}

function getMessage(key: string): Message {
  let message = messages.find((candidate) => candidate.key === key);

  if (message === undefined) {
    throw new Error(`The phone has no message "${key}"!`);
  }

  return message;
}

// A night of its own at the minute, in Rotor's room unless the test names a place.
function nightAt(
  minutes: number,
  {place, ...rest}: Parameters<typeof openSpot>[3] & {place?: PlaceId} = {},
): Night {
  return createPinnedNight(place ?? 'rotorBarRoom', minutes, rest);
}

function arrives(key: string, night: Night): boolean {
  return getMessage(key).arrives(night);
}

// A dialogue on the message's script, as the phone opens it, over the night.
function openMessageOn(key: string, night: Night): {dialogue: Dialogue<Night>; night: Night} {
  return {dialogue: new Dialogue({script: getMessage(key).script, context: night}), night};
}

// A dialogue on the message's script, on a night of its own at the minute.
function openMessage(
  key: string,
  minutes: number,
  options?: Parameters<typeof nightAt>[1],
): {dialogue: Dialogue<Night>; night: Night} {
  return openMessageOn(key, nightAt(minutes, options));
}

// The node a message's script holds under the id.
function messageNode(key: string, id: string): unknown {
  return getMessage(key).script.nodes?.[id];
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

// A night at its final minute, with the quest and the stories given.
function createEndNight(quest: Partial<Quest>, stories = 0): Night {
  let night = createNight({seed: 1, place: 'hlavniNadraziHall', minutes: 1920, money: 50, quest});

  for (let index = 0; index < stories; index++) {
    night.stories.push({title: 'A story', minutes: 1500});
  }

  return night;
}

function openEndOn(night: Night): Dialogue<Night> {
  return new Dialogue({script: nightEnd, context: night});
}

// The end script opened on a night at its final minute, with the quest and the stories given.
function openEnd(quest: Partial<Quest>, stories = 0): Dialogue<Night> {
  return openEndOn(createEndNight(quest, stories));
}

// The ending the night holds once the end script has opened on it.
function endingOf(quest: Partial<Quest>): Ending | null {
  let night = createEndNight(quest);

  openEndOn(night);

  return night.ending;
}

function readChoices(dialogue: Dialogue<Night>): string[] {
  return dialogue.visibleChoices.map((choice) => choice.text);
}

// The node a spot's script holds under the key.
function nodeOf(id: PlaceId, label: string, key: string): unknown {
  return getSpotScript(getPlace(id), label).nodes?.[key];
}

// The node a place's description holds under the key.
function descriptionNodeOf(id: PlaceId, key: string): unknown {
  return getPlace(id).description.nodes?.[key];
}

function getLongTableNode(minutes: number, quest?: Partial<Quest>): unknown {
  return openSpot('rotorBarRoom', 'The long table', minutes, quest === undefined ? {} : {quest})
    .dialogue.node;
}

function getLongTableKey(key: string): unknown {
  return nodeOf('rotorBarRoom', 'The long table', key);
}

function getBackRoomNode(minutes: number, options?: Parameters<typeof openSpot>[3]): unknown {
  return openSpot('rotorBarRoom', 'The back room', minutes, options).dialogue.node;
}

// The answer of the spot's friend node, asked for at the hour.
function ask(
  id: PlaceId,
  label: string,
  minutes: number,
  options?: Parameters<typeof openSpot>[3],
): string {
  let {dialogue} = openSpot(id, label, minutes, options);

  dialogue.advance();
  dialogue.choose(
    dialogue.visibleChoices.findIndex((choice) => choice.text === 'Ask after your friend'),
  );

  return dialogue.pageText;
}

function openWhiskyShopDoor(minutes: number): {dialogue: Dialogue<Night>; night: Night} {
  return openSpot('whiskyShopStreet', 'The Whisky Shop', minutes);
}

function readCornerTableAt(minutes: number, pick = 'music'): string[] {
  return readChoices(openSpot('rotorBarRoom', 'The corner table', minutes, {pick}).dialogue);
}

describe('the game content', () => {
  // The checker runs every script on 33,600 nights, and the CI runners are several times slower
  // than a dev machine and uneven among themselves: the slowest took it close to 50 seconds.
  test("the game's content has no problem", () => {
    expect(
      checkContent({
        locations,
        places,
        journeys,
        locationData,
        travel,
        map,
        end: nightEnd,
        messages,
      }),
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

  test('each ending node writes its name on entry, and both writes none until an answer', () => {
    let both = {hasKeys: true, hasTicket: true};
    let leaving = createEndNight(both);
    let leavingDialogue = openEndOn(leaving);
    let staying = createEndNight(both);
    let stayingDialogue = openEndOn(staying);

    expect(endingOf({hasTicket: true})).toBe('leave');
    expect(endingOf({hasKeys: true})).toBe('stay');
    expect(endingOf({})).toBe('stranded');
    expect(leaving.ending).toBeNull();

    leavingDialogue.advance();
    leavingDialogue.choose(0);
    stayingDialogue.advance();
    stayingDialogue.choose(1);

    expect(leaving.ending).toBe('leave');
    expect(staying.ending).toBe('stay');
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

  test("every evening's visits lie inside Rotor's hours, and the late one ends at its close", () => {
    let {hours} = locationData.rotorBar;
    let evenings = Object.values(FRIEND_EVENINGS);

    for (let span of [...evenings.flatMap(({early, late}) => [early, late]), PARTY]) {
      expect(isOpenAt(hours, span[0])).toBe(true);
      expect(isOpenAt(hours, span[1] - 1)).toBe(true);
    }

    for (let {late} of evenings) {
      expect(late[1]).toBe(hours.at(-1)?.[1]);
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

  test("the corner table's other two versions last all night, with their choices", () => {
    for (let minutes of [1000, 1390]) {
      expect(readCornerTableAt(minutes, 'cards')).toEqual(['Sit in for a hand', 'Watch a while']);
      expect(readCornerTableAt(minutes, 'couple')).toEqual(['Listen in', 'Leave them to it']);
    }
  });

  test("the hand's label reads its costs and its odds, which fall with the drinks", () => {
    for (let [drunkenness, label] of [
      [0, 'Sit in for a hand  15 min  50 Kč  50%'],
      [3, 'Sit in for a hand  15 min  50 Kč  30%'],
    ] as const) {
      let {dialogue, night} = openSpot('rotorBarRoom', 'The corner table', 1200, {
        pick: 'cards',
        drunkenness,
      });

      dialogue.advance();

      expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe(label);
    }
  });

  test('a won hand pays the pot and its story, and a lost one costs the stake', () => {
    let won = takeChoice(
      openSpot('rotorBarRoom', 'The corner table', 1200, {pick: 'cards'}),
      0,
      0.1,
    );

    expect(won.night.money).toBe(400);
    expect(won.night.minutes).toBe(1215);
    expect(won.dialogue.node).toBe(nodeOf('rotorBarRoom', 'The corner table', 'won'));
    expect(won.night.stories).toEqual([{title: 'The hand that paid for a round', minutes: 1215}]);

    let lost = takeChoice(
      openSpot('rotorBarRoom', 'The corner table', 1200, {pick: 'cards'}),
      0,
      0.9,
    );

    expect(lost.night.money).toBe(300);
    expect(lost.night.minutes).toBe(1215);
    expect(lost.dialogue.node).toBe(nodeOf('rotorBarRoom', 'The corner table', 'lost'));
    expect(lost.night.stories).toEqual([]);
  });

  test('listening to the couple is a story', () => {
    let {dialogue, night} = takeChoice(
      openSpot('rotorBarRoom', 'The corner table', 1200, {pick: 'couple'}),
      0,
    );

    expect(night.minutes).toBe(1210);
    expect(dialogue.node).toBe(nodeOf('rotorBarRoom', 'The corner table', 'listened'));
    expect(night.stories).toEqual([{title: 'The argument in whispers', minutes: 1210}]);
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

  test('the back room has the friend by the hour on each evening, and is a chat once the keys are in hand', () => {
    for (let [pick, minutes, key] of [
      ['usual', 1000, 'away'],
      ['usual', 1020, 'there'],
      ['usual', 1199, 'there'],
      ['usual', 1200, 'away'],
      ['usual', 1379, 'away'],
      ['usual', 1380, 'there'],
      ['usual', 1619, 'there'],
      ['sooner', 959, 'away'],
      ['sooner', 960, 'there'],
      ['sooner', 1079, 'there'],
      ['sooner', 1080, 'away'],
      ['sooner', 1319, 'away'],
      ['sooner', 1320, 'there'],
      ['later', 1139, 'away'],
      ['later', 1140, 'there'],
      ['later', 1259, 'there'],
      ['later', 1260, 'away'],
      ['later', 1439, 'away'],
      ['later', 1440, 'there'],
    ] as const) {
      expect(getBackRoomNode(minutes, {pick})).toBe(nodeOf('rotorBarRoom', 'The back room', key));
    }

    expect(getBackRoomNode(1300, {quest: {hasKeys: true}})).toBe(
      nodeOf('rotorBarRoom', 'The back room', 'chat'),
    );
  });

  test("the bartender and the back room name the evening's hours", () => {
    for (let [pick, left, back] of [
      ['usual', 'eight', 'eleven'],
      ['sooner', 'six', 'ten'],
      ['later', 'nine', 'midnight'],
    ] as const) {
      let answer = ask('rotorBarRoom', 'The bar', 1300, {pick});

      expect(answer).toContain(`left at ${left}`);
      expect(answer).toContain(`back at ${back}`);
      expect(openSpot('rotorBarRoom', 'The back room', 1300, {pick}).dialogue.pageText).toContain(
        back,
      );
    }
  });

  test('the smokers read the evening', () => {
    expect(ask('rotorBarStreet', 'The smokers', 1100, {pick: 'later'})).toBe(
      ask('rotorBarStreet', 'The smokers', 1000, {pick: 'later'}),
    );
    expect(ask('rotorBarStreet', 'The smokers', 1100, {pick: 'later'})).not.toBe(
      ask('rotorBarStreet', 'The smokers', 1100, {pick: 'usual'}),
    );
    // The sooner late visit has begun at 22:30, and the usual one has not.
    expect(ask('rotorBarStreet', 'The smokers', 1350, {pick: 'sooner'})).not.toBe(
      ask('rotorBarStreet', 'The smokers', 1350, {pick: 'usual'}),
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
    expect(ask('rotorBarRoom', 'The bar', 1100, {quest: {hasKeys: true}})).not.toBe(bartender[1]);
    expect(ask('rotorBarRoom', 'The bar', 1100, {quest: {hasBottle: true, hasTicket: true}})).toBe(
      bartender[1],
    );

    let shopkeeper = ask('whiskyShopRoom', 'The shopkeeper', 1100);

    expect(shopkeeper).toContain('Dvořákova');
    expect(ask('whiskyShopRoom', 'The shopkeeper', 1100, {quest: {hasKeys: true}})).not.toBe(
      shopkeeper,
    );
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

  test('at each stop none gives the plain description, and each event its node, met on entry', () => {
    for (let [id, events] of ARRIVALS) {
      let plain = openDescription(id, 1400, {pick: 'none'});

      expect(plain.dialogue.node).toBe(descriptionNodeOf(id, 'stop'));
      expect(plain.night.events).toEqual([]);

      for (let event of events) {
        let opened = openDescription(id, 1400, {pick: event});

        expect(opened.dialogue.node).toBe(descriptionNodeOf(id, event));
        expect(opened.night.events).toEqual([event]);
      }
    }
  });

  test('the refusing choice of every event leads to the description and costs nothing', () => {
    for (let [id, events] of ARRIVALS) {
      for (let event of events) {
        let {dialogue, night} = takeChoice(openDescription(id, 1400, {pick: event}), 1);

        expect(dialogue.node).toBe(descriptionNodeOf(id, 'stop'));
        expect(night.money).toBe(350);
        expect(night.minutes).toBe(1400);
      }
    }
  });

  test('a second opening on the same night gives the plain description', () => {
    for (let [id, events] of ARRIVALS) {
      for (let event of events) {
        let {night} = openDescription(id, 1400, {pick: event});
        let again = new Dialogue({script: getPlace(id).description, context: night});

        expect(again.node).toBe(descriptionNodeOf(id, 'stop'));
      }
    }
  });

  test('the wallet pays what its text names', () => {
    let opened = openDescription('namestiRepubliky', 1400, {pick: 'wallet', random: 0.5});

    expect(opened.dialogue.pageText).toContain('200 Kč');

    let {dialogue, night} = takeChoice(opened, 0, 0.5);

    expect(night.money).toBe(550);
    expect(dialogue.node).toBe(descriptionNodeOf('namestiRepubliky', 'kept'));
    expect(night.stories).toEqual([{title: 'The wallet on the bench', minutes: 1400}]);

    // The first press shows the rest of the page, the second follows next.
    dialogue.advance();
    dialogue.advance();

    expect(dialogue.node).toBe(descriptionNodeOf('namestiRepubliky', 'stop'));
    expect(
      openDescription('namestiRepubliky', 1400, {pick: 'wallet', random: 0}).dialogue.pageText,
    ).toContain('100 Kč');
    expect(
      openDescription('namestiRepubliky', 1400, {pick: 'wallet', random: 0.99}).dialogue.pageText,
    ).toContain('300 Kč');
  });

  test('the drunk costs ten minutes and a drink', () => {
    let {dialogue, night} = takeChoice(
      openDescription('namestiRepubliky', 1400, {pick: 'drunk'}),
      0,
    );

    expect(night.minutes).toBe(1410);
    expect(getDrunkenness(night)).toBe(1);
    expect(dialogue.node).toBe(descriptionNodeOf('namestiRepubliky', 'drank'));
    expect(night.stories).toEqual([{title: 'A drink at the stop', minutes: 1410}]);
  });

  test('the fight happens from 22:00, and the same night meets it then', () => {
    let {dialogue, night} = openDescription('malinovskehoNamesti', 1319, {pick: 'fight'});

    expect(dialogue.node).toBe(descriptionNodeOf('malinovskehoNamesti', 'stop'));
    expect(night.events).toEqual([]);

    night.minutes = 1320;

    let later = new Dialogue({script: getPlace('malinovskehoNamesti').description, context: night});

    expect(later.node).toBe(descriptionNodeOf('malinovskehoNamesti', 'fight'));
    expect(night.events).toEqual(['fight']);
  });

  test("the fight's odds fall with the drinks, a won one is a story and a lost one costs half an hour", () => {
    for (let [drunkenness, label] of [
      [0, 'Step in  10 min  50%'],
      [3, 'Step in  10 min  30%'],
    ] as const) {
      let {dialogue, night} = openDescription('malinovskehoNamesti', 1400, {
        pick: 'fight',
        drunkenness,
      });

      dialogue.advance();

      expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe(label);
    }

    let won = takeChoice(openDescription('malinovskehoNamesti', 1400, {pick: 'fight'}), 0, 0.1);

    expect(won.night.minutes).toBe(1410);
    expect(won.dialogue.node).toBe(descriptionNodeOf('malinovskehoNamesti', 'won'));
    expect(won.night.stories).toEqual([{title: 'The fight at the stop', minutes: 1410}]);

    let lost = takeChoice(openDescription('malinovskehoNamesti', 1400, {pick: 'fight'}), 0, 0.9);

    expect(lost.night.minutes).toBe(1440);
    expect(lost.dialogue.node).toBe(descriptionNodeOf('malinovskehoNamesti', 'lost'));
    expect(lost.night.stories).toEqual([]);
  });

  test('the phone is a story when it works, and a brick when it does not', () => {
    let {dialogue, night} = openDescription('hlavniNadraziForecourt', 1400, {pick: 'phone'});

    dialogue.advance();

    expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe(
      'Buy the phone  200 Kč  50%',
    );

    let works = takeChoice(
      openDescription('hlavniNadraziForecourt', 1400, {pick: 'phone'}),
      0,
      0.1,
    );

    expect(works.night.money).toBe(150);
    expect(works.dialogue.node).toBe(descriptionNodeOf('hlavniNadraziForecourt', 'works'));
    expect(works.night.stories).toEqual([{title: 'The phone from the forecourt', minutes: 1400}]);

    let brick = takeChoice(
      openDescription('hlavniNadraziForecourt', 1400, {pick: 'phone'}),
      0,
      0.9,
    );

    expect(brick.night.money).toBe(150);
    expect(brick.dialogue.node).toBe(descriptionNodeOf('hlavniNadraziForecourt', 'brick'));
    expect(brick.night.stories).toEqual([]);
  });

  test('the author is Jakub, his story The author, and his three seats lie in their hours', () => {
    expect(AUTHOR).toBe('Jakub');
    expect(AUTHOR_STORY).toBe('The author');
    expect(SEATS).toEqual({
      shop: {place: 'whiskyShopRoom', hours: [1020, 1140]},
      rotor: {place: 'rotorBarRoom', hours: [1260, 1380]},
      hall: {place: 'hlavniNadraziHall', hours: [1860, 1920]},
    });
  });

  test('getSeat picks each seat over the seeds 0 to 49', () => {
    let seats = new Set(
      Array.from({length: 50}, (_, seed) =>
        getSeat(createNight({seed, place: 'train', minutes: 960, money: 350})),
      ),
    );

    expect(seats).toEqual(new Set<Seat>(['hall', 'rotor', 'shop']));
  });

  test("isAuthorIn holds in the seat's place from its first minute to the minute before its end, and nowhere else", () => {
    for (let [seat, {place, hours}] of SEAT_ENTRIES) {
      let [from, to] = hours;
      let at = (minutes: number, pick: Seat = seat): Night =>
        createPinnedNight(place, minutes, {pick});

      expect(isAuthorIn(at(from), place)).toBe(true);
      expect(isAuthorIn(at(to - 1), place)).toBe(true);
      expect(isAuthorIn(at(from - 1), place)).toBe(false);
      expect(isAuthorIn(at(to), place)).toBe(false);

      for (let other of SEAT_ENTRIES.filter(([otherSeat]) => otherSeat !== seat)) {
        expect(isAuthorIn(at(from, other[0]), place)).toBe(false);
        expect(isAuthorIn(at(from), other[1].place)).toBe(false);
      }
    }
  });

  test("every seat lies inside its location's hours", () => {
    for (let {
      place,
      hours: [from, to],
    } of Object.values(SEATS)) {
      let location = getLocation(nightStart, place);
      let hours = location === undefined ? undefined : nightStart.locationData[location.id]?.hours;

      expect(location).toBeDefined();
      expect(isOpenAt(hours, from)).toBe(true);
      expect(isOpenAt(hours, to - 1)).toBe(true);
    }
  });

  test('the messages carry the twelve keys in order, and Jakub sends every one', () => {
    expect(messages.map(({key}) => key)).toEqual([
      'hello',
      'hours',
      'four',
      'five',
      'shop',
      'sang',
      'broke',
      'bet',
      'betSettled',
      'wrongNumber',
      'realOne',
      'lastCall',
    ]);
    expect(new Set(messages.map(({from}) => from))).toEqual(new Set(['Jakub']));
  });

  test('the hello always arrives, in three versions that answer "Who is this?" by the same pick, and reads the collection', () => {
    expect(arrives('hello', nightAt(960))).toBe(true);
    expect(arrives('hello', nightAt(1919, {place: 'train'}))).toBe(true);

    let answers = new Set<string>();

    for (let pick of ['code', 'guide', 'tram']) {
      let {dialogue} = openMessage('hello', 960, {pick});

      expect(dialogue.node).toBe(messageNode('hello', pick));

      dialogue.advance();

      expect(readChoices(dialogue)).toEqual(['Hi', 'Who is this?', 'Mute']);

      let who = takeChoice(openMessage('hello', 960, {pick}), 1).dialogue;

      expect(who.node).toBe(messageNode('hello', 'who'));

      answers.add(who.pageText);
    }

    expect(answers.size).toBe(3);

    let muted = takeChoice(openMessage('hello', 960), 2);

    expect(muted.dialogue.phase).toBe('ended');
    expect(muted.night.money).toBe(350);
    expect(muted.night.minutes).toBe(960);

    let first = openMessage('hello', 960).dialogue.pageText;
    let again = openMessage('hello', 960, {collection: {titles: ['A story']}}).dialogue.pageText;

    expect(again.length).toBeGreaterThan(first.length);
    expect(again).not.toBe(first);
  });

  test("the hint comes at 17:00 without the keys on a night that sends it, and names the evening's hours", () => {
    expect(arrives('hours', nightAt(1020))).toBe(true);
    expect(arrives('hours', nightAt(1019))).toBe(false);
    expect(arrives('hours', nightAt(1020, {pick: 'silent'}))).toBe(false);
    expect(arrives('hours', nightAt(1020, {quest: {hasKeys: true}}))).toBe(false);

    // The usual evening: the early visit from 17:00, the late one from 23:00.
    let text = openMessage('hours', 1300).dialogue.pageText;

    expect(text).toContain('five');
    expect(text).toContain('eleven');
    expect(takeChoice(openMessage('hours', 1300), 1).dialogue.node).toBe(
      messageNode('hours', 'room'),
    );
  });

  test('the water comes at four drinks, and a fifth after it was ignored brings a story', () => {
    expect(arrives('four', nightAt(1200, {drunkenness: 4}))).toBe(true);
    expect(arrives('four', nightAt(1200, {drunkenness: 3.9}))).toBe(false);

    let {dialogue, night} = openMessage('four', 1200, {drunkenness: 4});

    dialogue.advance();

    expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe('Water  10 min');

    let water = takeChoice(openMessage('four', 1200, {drunkenness: 4}), 0);

    expect(water.night.minutes).toBe(1210);
    expect(water.dialogue.node).toBe(messageNode('four', 'drank'));

    let another = takeChoice(openMessage('four', 1200, {drunkenness: 4}), 1);

    expect(another.night.events).toEqual(['ignoredWater']);
    expect(another.night.minutes).toBe(1200);
    expect(another.dialogue.node).toBe(messageNode('four', 'shrug'));
    expect(arrives('five', nightAt(1200, {drunkenness: 5, events: ['ignoredWater']}))).toBe(true);
    expect(arrives('five', nightAt(1200, {drunkenness: 5}))).toBe(false);
    expect(arrives('five', nightAt(1200, {drunkenness: 4.9, events: ['ignoredWater']}))).toBe(
      false,
    );
    expect(
      openMessage('five', 1200, {drunkenness: 5, events: ['ignoredWater']}).night.stories,
    ).toEqual([{title: 'Not carried home', minutes: 1200}]);
  });

  test('the shop nags at 20:30 without the bottle, and the skip brings the singing at 01:05', () => {
    expect(arrives('shop', nightAt(1230))).toBe(true);
    expect(arrives('shop', nightAt(1229))).toBe(false);
    expect(arrives('shop', nightAt(1230, {quest: {hasBottle: true}}))).toBe(false);
    expect(arrives('shop', nightAt(1230, {quest: {bottleGiven: true}}))).toBe(false);
    expect(takeChoice(openMessage('shop', 1230), 1).night.events).toEqual(['skippedBottle']);
    expect(takeChoice(openMessage('shop', 1230), 0).night.events).toEqual([]);
    expect(arrives('sang', nightAt(1505, {events: ['skippedBottle']}))).toBe(true);
    expect(arrives('sang', nightAt(1504, {events: ['skippedBottle']}))).toBe(false);
    expect(arrives('sang', nightAt(1505))).toBe(false);
    expect(
      arrives('sang', nightAt(1505, {events: ['skippedBottle'], quest: {bottleGiven: true}})),
    ).toBe(false);
  });

  test('broke comes from 20:00 under 50 Kč with neither keys nor ticket, and "Please" waits half an hour for a hundred', () => {
    expect(arrives('broke', nightAt(1200, {money: 49}))).toBe(true);
    expect(arrives('broke', nightAt(1200, {money: 50}))).toBe(false);
    expect(arrives('broke', nightAt(1199, {money: 49}))).toBe(false);
    expect(arrives('broke', nightAt(1200, {money: 49, quest: {hasKeys: true}}))).toBe(false);
    expect(arrives('broke', nightAt(1200, {money: 49, quest: {hasTicket: true}}))).toBe(false);

    let {dialogue, night} = openMessage('broke', 1200, {money: 40});

    expect(dialogue.node).toBe(messageNode('broke', 'pays'));

    dialogue.advance();

    expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe('Please  30 min');

    let please = takeChoice(openMessage('broke', 1200, {money: 40}), 0);

    expect(please.night.money).toBe(140);
    expect(please.night.minutes).toBe(1230);
    expect(please.dialogue.node).toBe(messageNode('broke', 'sent'));
    expect(openMessage('broke', 1200, {money: 40, pick: 'dry'}).dialogue.node).toBe(
      messageNode('broke', 'dry'),
    );
  });

  test('the bet is offered from 20:10, and settled from 22:05 by the corner table', () => {
    expect(arrives('bet', nightAt(1210))).toBe(true);
    expect(arrives('bet', nightAt(1209))).toBe(false);
    expect(takeChoice(openMessage('bet', 1210), 0).night.events).toEqual(['bet']);
    expect(arrives('betSettled', nightAt(1325, {events: ['bet']}))).toBe(true);
    expect(arrives('betSettled', nightAt(1324, {events: ['bet']}))).toBe(false);
    expect(arrives('betSettled', nightAt(1325))).toBe(false);

    // Music night, in the guitarist's hours.
    let {dialogue, night} = openMessage('betSettled', 1325, {events: ['bet']});

    expect(dialogue.node).toBe(messageNode('betSettled', 'payUp'));

    dialogue.advance();

    expect(formatChoice(asChoice(dialogue.visibleChoices[0]!), night)).toBe('Here  50 Kč');

    let here = takeChoice(openMessage('betSettled', 1325, {events: ['bet']}), 0);

    expect(here.night.money).toBe(300);
    expect(here.dialogue.node).toBe(messageNode('betSettled', 'paid'));

    let skint = takeChoice(openMessage('betSettled', 1325, {events: ['bet']}), 1);

    expect(skint.night.money).toBe(350);
    expect(skint.dialogue.node).toBe(messageNode('betSettled', 'skint'));
    // Music night after 01:00: the guitarist is gone, but he was there tonight.
    expect(openMessage('betSettled', 1505, {events: ['bet']}).dialogue.node).toBe(
      messageNode('betSettled', 'payUp'),
    );

    let won = openMessage('betSettled', 1325, {events: ['bet'], pick: 'cards'});

    expect(won.dialogue.node).toBe(messageNode('betSettled', 'win'));
    expect(won.night.money).toBe(400);
    expect(won.night.stories).toEqual([{title: 'The fifty on the guitar', minutes: 1325}]);
  });

  test('the wrong number comes from 18:40 on a night that sends it, and the back door is a story', () => {
    expect(arrives('wrongNumber', nightAt(1120))).toBe(true);
    expect(arrives('wrongNumber', nightAt(1119))).toBe(false);
    expect(arrives('wrongNumber', nightAt(1120, {pick: 'none'}))).toBe(false);

    let asked = takeChoice(openMessage('wrongNumber', 1120), 0);

    expect(asked.dialogue.node).toBe(messageNode('wrongNumber', 'backDoor'));
    expect(asked.night.stories).toEqual([{title: 'The wrong number', minutes: 1120}]);
    expect(takeChoice(openMessage('wrongNumber', 1120), 1).night.stories).toEqual([]);
  });

  test('the real one answers the first of five stories found tonight', () => {
    for (let [title, id] of [
      [CROWNS_STORY, 'crowns'],
      [FIGHT_STORY, 'fight'],
      [GUITARIST_STORY, 'guitarist'],
      [THROWN_OUT_STORY, 'thrownOut'],
      [BIRTHDAY_STORY, 'birthday'],
    ] as const) {
      let night = nightAt(1400);

      findStory(night, title);

      expect(arrives('realOne', night)).toBe(true);
      expect(openMessageOn('realOne', night).dialogue.node).toBe(messageNode('realOne', id));
    }

    let keys = nightAt(1400);

    findStory(keys, 'The keys');

    expect(arrives('realOne', nightAt(1400))).toBe(false);
    expect(arrives('realOne', keys)).toBe(false);

    let both = nightAt(1400);

    findStory(both, FIGHT_STORY);
    findStory(both, CROWNS_STORY);

    expect(openMessageOn('realOne', both).dialogue.node).toBe(messageNode('realOne', 'fight'));
    expect(takeChoice(openMessageOn('realOne', both), 0).dialogue.node).toBe(
      messageNode('realOne', 'really'),
    );
  });

  test("the last call comes from 07:00 away from the station, and reads the ticket's price", () => {
    expect(arrives('lastCall', nightAt(1860))).toBe(true);
    expect(arrives('lastCall', nightAt(1859))).toBe(false);
    expect(arrives('lastCall', nightAt(1860, {place: 'hlavniNadraziHall'}))).toBe(false);
    expect(arrives('lastCall', nightAt(1860, {place: 'hlavniNadraziForecourt'}))).toBe(false);
    expect(arrives('lastCall', nightAt(1860, {quest: {hasKeys: true}}))).toBe(false);
    expect(arrives('lastCall', nightAt(1860, {quest: {hasTicket: true}}))).toBe(false);

    let go = openMessage('lastCall', 1860, {money: 300}).dialogue;

    expect(go.node).toBe(messageNode('lastCall', 'go'));

    go.advance();

    expect(readChoices(go)).toEqual(['Going', 'Let it leave']);

    let stranded = openMessage('lastCall', 1860, {money: 299}).dialogue;

    expect(stranded.node).toBe(messageNode('lastCall', 'stranded'));

    stranded.advance();

    expect(readChoices(stranded)).toEqual(['Thanks']);
  });

  test("the game's content has twenty-two stories", () => {
    let {closing} = locations.rotorBar;

    if (closing === undefined) {
      throw new Error('Rotor Bar has no closing!');
    }

    // The bar closes at 03:00 and puts the player out on its street.
    let closed = createNight({seed: 1, place: 'rotorBarStreet', minutes: 1620, money: 350});
    // Each dialogue reaches the node of one story: 0.1 wins the spare chair's roll and the
    // shelter's and the back room's search and the hand of cards and the fight and the phone, and
    // 0.95 loses the chair's above 0.9, which spills the beer. The long table hands the bottle
    // over for the birthday. Three messages find theirs: the fifth drink, the bet settled on cards
    // night and the wrong number's back door.
    let opened = [
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1390), 0),
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1200), 0, 0.1),
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1200), 0, 0.95),
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1200, {pick: 'cards'}), 0, 0.1),
      takeChoice(openSpot('rotorBarRoom', 'The corner table', 1200, {pick: 'couple'}), 0),
      takeChoice(openSpot('rotorBarStreet', 'The smokers', 1200, {drunkenness: 2}), 0),
      takeChoice(openSpot('whiskyShopRoom', 'Two regulars', 1100), 0),
      takeChoice(openSpot('whiskyShopRoom', 'The shelves', 1100), 2),
      takeChoice(openSpot('rotorBarRoom', 'The back room', 1100), 0, 0.1),
      takeChoice(openSpot('rotorBarRoom', 'The long table', 1200, {quest: {hasBottle: true}}), 0),
      takeChoice(openSpot('hlavniNadraziForecourt', 'A stranger', 1100), 0),
      openSpot('hlavniNadraziHall', 'The hall', 1100),
      takeChoice(openSpot('namestiRepubliky', 'The shelter', 1100), 0, 0.1),
      takeChoice(openDescription('namestiRepubliky', 1400, {pick: 'wallet'}), 0, 0.5),
      takeChoice(openDescription('namestiRepubliky', 1400, {pick: 'drunk'}), 0),
      takeChoice(openDescription('malinovskehoNamesti', 1400, {pick: 'fight'}), 0, 0.1),
      takeChoice(openDescription('hlavniNadraziForecourt', 1400, {pick: 'phone'}), 0, 0.1),
      openSpot('zidenice', 'The bench', 1100),
      {dialogue: new Dialogue({script: closing, context: closed}), night: closed},
      openMessage('five', 1200, {drunkenness: 5, events: ['ignoredWater']}),
      openMessage('betSettled', 1325, {events: ['bet'], pick: 'cards'}),
      takeChoice(openMessage('wrongNumber', 1120), 0),
    ];

    expect(new Set(opened.flatMap(({night}) => night.stories.map(({title}) => title)))).toEqual(
      new Set([
        'A bottle saved for an occasion',
        'A drink at the stop',
        'A seat at the table',
        'A train not on the timetable',
        'Not carried home',
        'The argument in whispers',
        'The birthday',
        'The fifty on the guitar',
        'The fight at the stop',
        'The good one',
        'The guitarist who plays for one',
        'The hand that paid for a round',
        'The keys',
        'The man who knew the timetable',
        'The phone from the forecourt',
        'The spilled beer',
        'The station that never moved',
        'The tram that stopped early',
        'The wallet on the bench',
        'The wrong number',
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
