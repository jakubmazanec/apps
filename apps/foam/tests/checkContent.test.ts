import {defineDialogueScript, type RunnableDialogueScript} from 'tellurion';
import {describe, expect, test, vitest} from 'vitest';

import {checkContent} from '../source/game/core/checkContent.js';
import {createWayOut} from '../source/game/core/createWayOut.js';
import {getExpectedJourneys} from '../source/game/core/getExpectedJourneys.js';
import {type Location} from '../source/game/core/location.js';
import {
  findStory,
  getDrunkenness,
  hasMet,
  hasStory,
  meet,
  type Night,
  type Way,
} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {type Choice, defineScript, type Node} from '../source/game/core/script.js';
import {type LocationData, type MapData, type Travel} from '../source/game/core/travel.js';

function oneNode(text: string, speaker = 'Someone'): RunnableDialogueScript<Night> {
  return defineDialogueScript<Night>()({start: {speaker, text}});
}

function nodeWithChoices(choices: Array<Choice<string>>): RunnableDialogueScript<Night> {
  return defineScript({start: {speaker: 'Bench', text: 'Hello.', choices}});
}

function withEntry(
  onEnter: (night: Night) => void,
  text: ((night: Night) => string) | string = 'Hello.',
): RunnableDialogueScript<Night> {
  return defineDialogueScript<Night>()({start: {speaker: 'Bench', text, onEnter}});
}

function throwNoWay(): never {
  throw new Error('No way.');
}

function findGone(night: Night): void {
  findStory(night, 'Gone');
}

function createPlace(id: Place['id'], name: string, outdoors: boolean, shortName?: string): Place {
  return {
    id,
    name,
    ...(shortName === undefined ? {} : {shortName}),
    outdoors,
    description: oneNode('A quiet place with a bench.', name),
    picture: '',
    spots: [{label: 'The door', x: 0.5, y: 0.5, script: oneNode('A door.')}],
  };
}

const locations: Record<string, Location> = {
  train: {
    id: 'train',
    name: 'The train',
    places: [createPlace('train', 'The train', false)],
    arrival: 'train',
  },
  zidenice: {
    id: 'zidenice',
    name: 'Brno-Židenice',
    places: [createPlace('zidenice', 'Brno-Židenice', true)],
    arrival: 'zidenice',
  },
  rotorBar: {
    id: 'rotorBar',
    name: 'Rotor Bar',
    places: [
      createPlace('rotorBarRoom', 'Rotor Bar', false),
      createPlace('rotorBarStreet', 'Dvořákova', true),
    ],
    arrival: 'rotorBarRoom',
    outside: 'rotorBarStreet',
    closing: oneNode('Closing.', 'Closing time'),
  },
  namestiRepubliky: {
    id: 'namestiRepubliky',
    name: 'Náměstí Republiky',
    places: [createPlace('namestiRepubliky', 'Náměstí Republiky', true, 'Nám. Republiky')],
    arrival: 'namestiRepubliky',
  },
};
// The places of the locations by id, as content/locations.ts derives them.
const places: Record<string, Place> = Object.fromEntries(
  Object.values(locations).flatMap((location) => location.places.map((place) => [place.id, place])),
);
const position = {latitude: 49.2, longitude: 16.6};
const locationData: LocationData = {
  zidenice: {position},
  rotorBar: {position, hours: [[960, 1620]]},
  namestiRepubliky: {tramStop: 'Náměstí Republiky', position},
};

function createTravel(data: LocationData): Travel {
  let travel: Record<
    string,
    Partial<Record<Way, Record<string, {minutes: number; price?: number}>>>
  > = {};

  for (let {from, way, to} of getExpectedJourneys(data)) {
    travel[from] ??= {};

    let ways = travel[from];

    ways[way] ??= {};

    let journeys = ways[way];

    journeys[to] = way === 'walk' ? {minutes: 10} : {minutes: 10, price: 25};
  }

  return travel;
}

const travel = createTravel(locationData);
const map: MapData = {
  origin: position,
  box: {left: -5000, top: -5000, right: 5000, bottom: 5000},
  minorStreets: [],
  mainStreets: [],
  railway: [],
  rivers: [],
  parks: [],
  tramLines: [],
};
const journeys: Record<Way, RunnableDialogueScript<Night>> = {
  walk: oneNode('You walk.', 'On foot'),
  tram: oneNode('You ride.', 'The tram'),
  taxi: oneNode('You drive.', 'The taxi'),
};
const end = oneNode('Morning.', 'Morning');
const LONG = 'A supercalifragilistic word.';
const LONG_LINE =
  'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit';

function check(
  changes: {
    locations?: Record<string, Location>;
    places?: Record<string, Place>;
    locationData?: LocationData;
    travel?: Travel;
    map?: MapData;
    journeys?: Record<Way, RunnableDialogueScript<Night>>;
    end?: RunnableDialogueScript<Night>;
  } = {},
): string[] {
  return checkContent({locations, places, journeys, locationData, travel, map, end, ...changes});
}

function withZidenice(change: Partial<Place>): Record<string, Place> {
  return {...places, zidenice: {...places.zidenice!, ...change}};
}

function withRotorBar(change: Partial<Location>): Record<string, Location> {
  return {...locations, rotorBar: {...locations.rotorBar!, ...change}};
}

function door(id: string): string {
  return `${id} › The door › start › `;
}

function withDoor(id: 'namestiRepubliky' | 'rotorBarRoom' | 'rotorBarStreet'): string[] {
  let script = createWayOut({
    speaker: 'The door',
    text: 'A door.',
    ways: ['walk', 'tram', 'taxi'],
  });
  let place = places[id]!;
  let spots = [...place.spots, {label: 'The door', x: 0.5, y: 0.5, script}];

  return check({places: {...places, [id]: {...place, spots}}}).filter((line) =>
    line.includes('The door › start'),
  );
}

describe(checkContent, () => {
  test('gives no line for good content', () => {
    expect(check()).toEqual([]);
  });

  test('reports a location the map does not cover', () => {
    expect(check({map: {...map, box: {...map.box, right: 1999}}})).toContain(
      'map.json: does not cover "zidenice"; run node scripts/fetch-map-data.mjs',
    );
  });

  test('reports a long word of a text', () => {
    let description = oneNode('A *wonderfullyunreasonable* word.', 'Bench');

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: "wonderfullyunreasonable" has 23 characters, and 16 fit',
    );
  });

  test('reports a long word of a choice', () => {
    let description = defineDialogueScript<Night>()({
      start: 'a',
      nodes: {
        a: {speaker: 'Bench', text: 'Hello.', choices: [{text: 'Supercalifragilistic'}]},
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › a: "Supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  test('reports an odd number of italic marks on a page', () => {
    let description = defineDialogueScript<Night>()({
      start: {speaker: 'Bench', text: ['Fine *page* here.', 'A *bad* *page.']},
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: page 2 has 3 italic marks',
    );
  });

  test('reports a node without a speaker', () => {
    let description = defineDialogueScript<Night>()({start: {text: 'Silence.'}});

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: no speaker',
    );
  });

  test('reports a speaker longer than the title room', () => {
    let description = oneNode('Hello.', 'A very long title indeed');

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: the title "A very long title indeed" has 24 characters, ' +
        'and 19 fit',
    );
  });

  test('reports a name longer than the place button', () => {
    expect(check({places: withZidenice({name: 'The Whisky Shop Brno'})})).toContain(
      'zidenice: the name has 20 characters and the place button holds 14; give a shortName',
    );
  });

  test('reports a shortName longer than the place button', () => {
    expect(check({places: withZidenice({shortName: 'Much too long name'})})).toContain(
      'zidenice: the shortName has 18 characters and the place button holds 14',
    );
  });

  test('reports a label longer than the scene button', () => {
    let label = 'A label of twenty-three';
    let spots = [{label, x: 0.5, y: 0.5, script: oneNode('A door.')}];

    expect(check({places: withZidenice({spots})})).toContain(
      'zidenice › "A label of twenty-three": the label has 23 characters, and 21 fit',
    );
  });

  test('reports an x and a y outside 0 to 1', () => {
    let spots = [{label: 'The door', x: 1.2, y: -0.1, script: oneNode('A door.')}];
    let lines = check({places: withZidenice({spots})});

    expect(lines).toContain('zidenice › The door: x is 1.2');
    expect(lines).toContain('zidenice › The door: y is -0.1');
  });

  test('reports a location without an entry, but not the train', () => {
    let lines = check({locationData: {zidenice: locationData.zidenice!}});

    expect(lines).toContain('locations.json: no entry for "rotorBar"');
    expect(lines).not.toContain('locations.json: no entry for "train"');
  });

  test('reports an entry that is no location', () => {
    let data = {...locationData, nowhere: {position}};

    expect(check({locationData: data})).toContain('locations.json: "nowhere" is not a location');
  });

  test('reports an entry without a position', () => {
    let data = structuredClone(locationData);

    delete data.zidenice!.position;

    expect(check({locationData: data})).toContain(
      'locations.json › zidenice: no position; run the fill script',
    );
  });

  test('reports a span that is not of the night, and one that is not after the span before it', () => {
    let data = structuredClone(locationData);

    data.rotorBar!.hours = [[1620, 960], [900, 1000], [960, 1921], [960]];

    let lines = check({locationData: data});

    expect(lines).toContain(
      'locations.json › rotorBar › hours: [1620, 960] is not a span of the night',
    );
    expect(lines).toContain(
      'locations.json › rotorBar › hours: [900, 1000] is not a span of the night',
    );
    expect(lines).toContain(
      'locations.json › rotorBar › hours: [960, 1921] is not a span of the night',
    );
    expect(lines).toContain('locations.json › rotorBar › hours: [960] is not a span of the night');

    data.rotorBar!.hours = [
      [960, 1200],
      [1200, 1300],
    ];

    expect(check({locationData: data})).toContain(
      'locations.json › rotorBar › hours: [1200, 1300] is not after [960, 1200]',
    );
  });

  test('reports a missing journey', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    delete data.zidenice!.walk!.namestiRepubliky;

    expect(check({travel: data})).toContain(
      'travel.json: no journey zidenice › walk › namestiRepubliky',
    );
  });

  test('reports a journey the game does not offer', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    data.zidenice!.tram = {rotorBar: {minutes: 5, price: 25}};

    expect(check({travel: data})).toContain(
      'travel.json: zidenice › tram › rotorBar is not a journey the game offers',
    );
  });

  test('reports minutes that are not a whole number above 0', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    data.zidenice!.walk!.rotorBar = {minutes: 0};
    data.rotorBar!.walk!.zidenice = {minutes: 2.5};

    let lines = check({travel: data});

    expect(lines).toContain('travel.json › zidenice › walk › rotorBar: minutes is 0');
    expect(lines).toContain('travel.json › rotorBar › walk › zidenice: minutes is 2.5');
  });

  test('reports a price that is not a whole number, 0 or more', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    data.zidenice!.taxi!.rotorBar = {minutes: 5, price: -1};
    data.rotorBar!.taxi!.zidenice = {minutes: 5, price: 12.5};

    let lines = check({travel: data});

    expect(lines).toContain('travel.json › zidenice › taxi › rotorBar: price is -1');
    expect(lines).toContain('travel.json › rotorBar › taxi › zidenice: price is 12.5');
  });

  test('reports a tram or taxi journey without a price', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    data.zidenice!.taxi!.rotorBar = {minutes: 5};

    expect(check({travel: data})).toContain('travel.json › zidenice › taxi › rotorBar: no price');
  });

  test('reports a fault of a journey script', () => {
    let lines = check({journeys: {...journeys, tram: oneNode('You ride.', '')}});

    expect(lines).toContain('journeys › tram › start: no speaker');
  });

  test('reports a fault of the end script', () => {
    expect(check({end: oneNode('Morning.', '')})).toContain('end › start: no speaker');
  });

  test('reports a fault of a closing script', () => {
    let lines = check({
      locations: {
        ...locations,
        rotorBar: {...locations.rotorBar!, closing: oneNode('Closing.', '')},
      },
    });

    expect(lines).toContain('rotorBar › closing › start: no speaker');
  });

  test('checks every script at each half hour and both sides of every opening and closing', () => {
    let text = vitest.fn<(night: Night) => string>(() => 'A supercalifragilistic word.');
    let description = defineDialogueScript<Night>()({start: {speaker: 'Bench', text}});
    let lines = check({places: withZidenice({description})});

    // 32 half hours from 16:00 to 07:30, and of the edges 959, 960, 1619 and 1620 of Rotor Bar's
    // hours, 960 and 1620 are half hours and 959 lies before the night. The 16 is the quest states,
    // the 2 the two collections, the 5 the fixture's places and the 3 the levels.
    expect(text).toHaveBeenCalledTimes(16 * 2 * 5 * 33 * 3);
    expect(
      lines.filter((line) => line.startsWith('zidenice › description › start: "super')),
    ).toHaveLength(1);
  });

  test('follows a door that branches on the hours on both sides of the closing', () => {
    let description = defineScript({
      start: (night) => ({
        speaker: 'Door',
        text:
          night.minutes === 1619 ? 'A supercalifragilistic word.'
          : night.minutes === 1620 ? 'Fine *odd.'
          : 'Fine.',
      }),
    });
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain(
      'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit',
    );
    expect(lines).toContain('zidenice › description › start: page 1 has 1 italic marks');
  });

  test('reports a place in no location and a place in two', () => {
    let alone = {...locations, zidenice: {...locations.zidenice!, places: []}};
    let twice = {
      ...locations,
      namestiRepubliky: {
        ...locations.namestiRepubliky!,
        places: [...locations.namestiRepubliky!.places, places.rotorBarStreet!],
      },
    };

    expect(check({locations: alone})).toContain('zidenice: in no location');
    expect(check({locations: twice})).toContain('rotorBarStreet: in rotorBar and namestiRepubliky');
  });

  test('reports an arrival and an outside that are not the location’s places, and an outside indoors', () => {
    expect(check({locations: withRotorBar({arrival: 'zidenice'})})).toContain(
      'rotorBar: arrival "zidenice" is not one of its places',
    );
    expect(check({locations: withRotorBar({outside: 'zidenice'})})).toContain(
      'rotorBar: outside "zidenice" is not one of its places',
    );
    expect(check({locations: withRotorBar({outside: 'rotorBarRoom'})})).toContain(
      'rotorBar: outside "rotorBarRoom" is not outdoors',
    );
  });

  test('reports hours without a closing or an outside, and a closing or an outside without hours', () => {
    let {closing, outside, ...rest} = locations.rotorBar!;
    let lines = [
      check({locations: {...locations, rotorBar: {...rest, outside: outside!}}}),
      check({locations: {...locations, rotorBar: {...rest, closing: closing!}}}),
    ];

    expect(lines[0]).toContain('rotorBar: hours but no closing');
    expect(lines[1]).toContain('rotorBar: hours but no outside');

    let withClosing = {
      ...locations,
      zidenice: {...locations.zidenice!, closing: oneNode('Closing.', 'Closing time')},
    };
    let withOutside = {...locations, zidenice: {...locations.zidenice!, outside: 'zidenice'}};

    expect(check({locations: withClosing})).toContain('zidenice: a closing but no hours');
    expect(check({locations: withOutside as unknown as Record<string, Location>})).toContain(
      'zidenice: an outside but no hours',
    );
  });

  test('reports walk and taxi indoors, and the tram where no tram stops', () => {
    expect(withDoor('rotorBarRoom')).toEqual([
      `${door('rotorBarRoom')}"Walk": walk is offered indoors`,
      `${door('rotorBarRoom')}"Take the tram": the tram does not stop here`,
      `${door('rotorBarRoom')}"Take a taxi": taxi is offered indoors`,
    ]);
    expect(withDoor('rotorBarStreet')).toEqual([
      `${door('rotorBarStreet')}"Take the tram": the tram does not stop here`,
    ]);
    expect(withDoor('namestiRepubliky')).toEqual([]);
  });

  test('reports an onChoose that throws on a scene button, and returns normally', () => {
    let script = defineScript({
      start: 'a',
      nodes: {
        a: {
          speaker: 'The door',
          text: 'A door.',
          choices: [
            {
              text: 'Try',
              onChoose() {
                throw new Error('No way.');
              },
            },
          ],
        },
      },
    });
    let place = places.rotorBarStreet!;
    let spots = [...place.spots, {label: 'The door', x: 0.5, y: 0.5, script}];
    let lines = check({places: {...places, rotorBarStreet: {...place, spots}}});

    expect(lines).toContain('rotorBarStreet › The door › a › "Try": throws "No way."');
  });

  test('a text that reads the level is checked sober, tipsy and drunk', () => {
    let description = defineScript({
      start: {
        speaker: 'Bench',
        text: (night) => (getDrunkenness(night) >= 5 ? 'A supercalifragilistic word.' : 'Fine.'),
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  test('a text that reads the keys is checked with and without them, which proves the quest states run', () => {
    let description = defineScript({
      start: {
        speaker: 'Bench',
        text: (night) => (night.quest.hasKeys ? 'A supercalifragilistic word.' : 'Fine.'),
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  test('an effect runs on the state of its night', () => {
    let description = defineScript({
      start: {
        speaker: 'Bench',
        text: 'Hello.',
        choices: [
          {
            text: 'Try',
            onChoose(night) {
              if (night.quest.hasTicket && !night.quest.hasKeys) {
                throwNoWay();
              }
            },
          },
          {text: 'Go'},
        ],
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start › "Try": throws "No way."',
    );
  });

  test('names an inline node by how it is reached', () => {
    let description = defineDialogueScript<Night>()({
      start: {
        speaker: 'Bench',
        text: 'Hello.',
        choices: [{text: 'Go', next: {text: 'Supercalifragilistic'}}],
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start › "Go": no speaker',
    );
  });

  test('reports a price, minutes or drinks that is not a whole number above 0', () => {
    let description = nodeWithChoices([
      {text: 'Order a beer', price: 0},
      {text: 'Wait', minutes: 2.5},
      {text: 'Drink', drinks: -1},
      {text: 'Go'},
    ]);
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain(
      'zidenice › description › start › "Order a beer": price is 0; leave it out',
    );
    expect(lines).toContain('zidenice › description › start › "Wait": minutes is 2.5');
    expect(lines).toContain('zidenice › description › start › "Drink": drinks is -1');
  });

  test("reports odds that are not above 0 and below 1, as a number and as a function's result", () => {
    let description = nodeWithChoices([
      {text: 'Try', odds: 1},
      {text: 'Try again', odds: (night) => (getDrunkenness(night) >= 5 ? 0 : 0.5)},
      {text: 'Go'},
    ]);
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain('zidenice › description › start › "Try": odds is 1');
    expect(lines.filter((line) => line.includes('"Try again"'))).toEqual([
      'zidenice › description › start › "Try again": odds is 0',
    ]);
  });

  test('reports a drunkenness condition with no bound, a bound below 0 or min above max', () => {
    let description = nodeWithChoices([
      {text: 'A', drunkenness: {}},
      {text: 'B', drunkenness: {min: -1}},
      {text: 'C', drunkenness: {min: 3, max: 2}},
      {text: 'Go'},
    ]);
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain(
      'zidenice › description › start › "A": drunkenness names neither min nor max',
    );
    expect(lines).toContain('zidenice › description › start › "B": drunkenness has min -1');
    expect(lines).toContain(
      'zidenice › description › start › "C": drunkenness has min 3 above max 2',
    );
  });

  test('follows a function next with every roll and with no roll, and reports an id the script lacks', () => {
    let description = defineScript<string>({
      start: 'a',
      nodes: {
        a: {
          speaker: 'Bench',
          text: 'Hello.',
          choices: [
            {
              text: 'Try',
              odds: 0.5,
              next: ({roll}) =>
                roll?.won ? 'b'
                : (roll?.value ?? 0) > 0.98 ? 'missing'
                : 'a',
            },
            {text: 'Sure', next: ({roll}) => (roll === null ? 'b' : 'missing')},
            {text: 'Go'},
          ],
        },
        b: {
          speaker: 'Bench',
          text: 'Fine.',
          next: (night) => (night.roll === null ? 'a' : 'missing'),
        },
      },
    });
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain(
      'zidenice › description › a › "Try" › next: returns "missing", which is not a node',
    );
    expect(lines.filter((line) => line.includes('"Sure"') || line.includes('› b › next'))).toEqual(
      [],
    );
  });

  test('reports a function next that throws, on a choice and on a node', () => {
    let description = defineScript({
      start: 'a',
      nodes: {
        a: {
          speaker: 'Bench',
          text: 'Hello.',
          choices: [{text: 'Try', next: throwNoWay}, {text: 'Go'}],
        },
        b: {speaker: 'Bench', text: 'Fine.', next: throwNoWay},
      },
    });
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain('zidenice › description › a › "Try" › next: throws "No way."');
    expect(lines).toContain('zidenice › description › b › next: throws "No way."');
  });

  test('reports a node whose choices have no way out that costs nothing on every check night', () => {
    let paid = nodeWithChoices([
      {text: 'Pay', price: 10},
      {text: 'Wait', minutes: 5},
      {text: 'Drink', drinks: 1},
    ]);
    let hidden = nodeWithChoices([
      {text: 'Pay', price: 10},
      {text: 'Go', drunkenness: {min: 2}},
      {text: 'Leave', isVisible: (night) => getDrunkenness(night) < 5},
    ]);
    let free = nodeWithChoices([
      {text: 'Pay', price: 10},
      {text: 'Try', odds: 0.5},
    ]);
    let line = 'zidenice › description › start: no way out that costs nothing';

    expect(check({places: withZidenice({description: paid})})).toContain(line);
    expect(check({places: withZidenice({description: hidden})})).toContain(line);
    expect(check({places: withZidenice({description: free})})).not.toContain(line);
  });

  test('reports an entry effect that throws', () => {
    expect(check({places: withZidenice({description: withEntry(throwNoWay)})})).toContain(
      'zidenice › description › start: throws "No way."',
    );
  });

  test("reports an empty title, a marked title and a long word of a title under the effect's path", () => {
    let description = withEntry((night) => {
      findStory(night, '');
      findStory(night, 'A *marked* title');
      findStory(night, 'A supercalifragilistic title');
    });
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain('zidenice › description › start: a story with an empty title');
    expect(lines).toContain(
      'zidenice › description › start: the story "A *marked* title" has an italic mark',
    );
    expect(lines).toContain(
      'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  test('finds a title given under an hour condition inside the effect', () => {
    let description = withEntry((night) => {
      if (night.minutes === 1619) {
        findStory(night, 'A supercalifragilistic title');
      }
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  // Its rolled next returns an inline node, which the checker follows on each of 100 rolls of
  // every check night, now on sixteen quest states too, so it does a great deal more work than its
  // neighbours; under coverage the run passes five seconds.
  test('finds a title given on the roll inside an entry effect', () => {
    let won: Node<string> = {
      speaker: 'Bench',
      text: 'You won.',
      onEnter: (night) => {
        if (night.roll?.won) {
          findStory(night, 'A supercalifragilistic title');
        }
      },
    };
    let lost: Node<string> = {speaker: 'Bench', text: 'You lost.'};
    let description = nodeWithChoices([
      {text: 'Try', odds: 0.5, next: (night) => (night.roll?.won ? won : lost)},
    ]);

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start › "Try" › next: "supercalifragilistic" has 20 characters, ' +
        'and 16 fit',
    );
  }, 60_000);

  test('checks a text that reads an achieved story with it achieved, which proves the full collection runs', () => {
    let description = withEntry(findGone, (night) =>
      hasStory(night, 'Gone') ? 'A supercalifragilistic word.' : 'Fine.',
    );

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  test('reports a choice hidden by an achieved story that leaves no free way out', () => {
    let choices: Array<Choice<string>> = [
      {text: 'Pay', price: 10},
      {text: 'Go', isVisible: (night) => !hasStory(night, 'Gone')},
    ];
    let hidden = defineScript({
      start: {speaker: 'Bench', text: 'Hello.', onEnter: findGone, choices},
    });
    let free = defineScript({
      start: {
        speaker: 'Bench',
        text: 'Hello.',
        onEnter: findGone,
        choices: [...choices, {text: 'Leave'}],
      },
    });
    let line = 'zidenice › description › start: no way out that costs nothing';

    expect(check({places: withZidenice({description: hidden})})).toContain(line);
    expect(check({places: withZidenice({description: free})})).not.toContain(line);
  });

  test("runs a choice's effect on a journey and the end too", () => {
    let script = nodeWithChoices([{text: 'Try', onChoose: throwNoWay}]);

    expect(check({journeys: {...journeys, tram: script}})).toContain(
      'journeys › tram › start › "Try": throws "No way."',
    );
    expect(check({end: script})).toContain('end › start › "Try": throws "No way."');
  });

  test('follows a start that picks one of three versions by random into all three', () => {
    let description = defineScript({
      start: (night) => {
        let version = night.random('version');

        return (
          version < 1 / 3 ? {speaker: 'Bench', text: 'Fine.'}
          : version < 2 / 3 ? {speaker: 'Bench', text: 'Also fine.'}
          : {speaker: 'Bench', text: LONG}
        );
      },
    });

    expect(check({places: withZidenice({description})})).toContain(LONG_LINE);
  });

  test('reports a text that throws under one of the six values', () => {
    let description = defineScript({
      start: {
        speaker: 'Bench',
        text: (night) => (night.random('mood') > 0.8 ? throwNoWay() : 'Fine.'),
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: throws "No way."',
    );
  });

  test('runs a text that reads random under the six values, and reports its long word once', () => {
    let text = vitest.fn<(night: Night) => string>((night) =>
      night.random('mood') > 0.8 ? LONG : 'Fine.',
    );
    let description = defineDialogueScript<Night>()({start: {speaker: 'Bench', text}});
    let lines = check({places: withZidenice({description})});

    // The six values of random, each on every check night of the test of the half hours.
    expect(text).toHaveBeenCalledTimes(6 * 16 * 2 * 5 * 33 * 3);
    expect(
      lines.filter((line) => line.startsWith('zidenice › description › start: "super')),
    ).toHaveLength(1);
  });

  test('runs an effect that reads random under the six values', () => {
    let description = withEntry((night) => {
      if (night.random('luck') > 0.8) {
        throwNoWay();
      }
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: throws "No way."',
    );
  });

  test('reports a free way out hidden under one value of random', () => {
    let description = nodeWithChoices([
      {text: 'Pay', price: 10},
      {text: 'Go', isVisible: (night) => night.random('door') < 0.5},
    ]);

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: no way out that costs nothing',
    );
  });

  test('reports odds that are 1 under one value of random', () => {
    let description = nodeWithChoices([
      {text: 'Try', odds: (night) => (night.random('luck') > 0.8 ? 1 : 0.5)},
      {text: 'Go'},
    ]);

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start › "Try": odds is 1',
    );
  });

  test("puts the night's random back after the hundred rolls", () => {
    let description = defineScript({
      start: 'a',
      nodes: {
        a: {
          speaker: 'Bench',
          text: 'Hello.',
          choices: [{text: 'Try', odds: 0.5, next: () => 'b'}, {text: 'Go'}],
        },
        b: {speaker: 'Bench', text: (night) => (night.random('mood') < 0.1 ? LONG : 'Fine.')},
      },
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › b: "supercalifragilistic" has 20 characters, and 16 fit',
    );
  });

  test('follows a start that picks one of three names into all three', () => {
    let description = defineScript({
      start: (night) => {
        let version = night.pick('version', {a: 0.5, b: 0.3, c: 0.2});

        return version === 'c' ? {speaker: 'Bench', text: LONG} : {speaker: 'Bench', text: 'Fine.'};
      },
    });

    expect(check({places: withZidenice({description})})).toContain(LONG_LINE);
  });

  test('runs a text that picks from a table of three under each name, and reports its long word once', () => {
    let text = vitest.fn<(night: Night) => string>((night) =>
      night.pick('mood', {a: 0.5, b: 0.3, c: 0.2}) === 'c' ? LONG : 'Fine.',
    );
    let description = defineDialogueScript<Night>()({start: {speaker: 'Bench', text}});
    let lines = check({places: withZidenice({description})});

    expect(text).toHaveBeenCalledTimes(3 * 16 * 2 * 5 * 33 * 3);
    expect(
      lines.filter((line) => line.startsWith('zidenice › description › start: "super')),
    ).toHaveLength(1);
  });

  test('runs a function that picked from tables of two and three names three times, wrapping the shorter', () => {
    let seen = new Set<string>();
    let description = defineDialogueScript<Night>()({
      start: {
        speaker: 'Bench',
        text: (night) => {
          seen.add(
            `${night.pick('two', {x: 0.5, y: 0.5})} ${night.pick('three', {p: 0.5, q: 0.3, r: 0.2})}`,
          );

          return 'Fine.';
        },
      },
    });

    check({places: withZidenice({description})});

    expect(seen).toEqual(new Set(['x p', 'x r', 'y q']));
  });

  test('reports odds that do not sum to 1, an odd of 0 or less and an empty table, and passes a rounding error', () => {
    let description = defineScript({
      start: (night) => {
        night.pick('short', {a: 0.5, b: 0.4});
        night.pick('zero', {a: 1, b: 0});
        night.pick('below', {a: 1.5, b: -0.5});
        night.pick('empty', {});
        night.pick('rounded', {a: 0.7, b: 0.2, c: 0.1});

        return {speaker: 'Bench', text: 'Fine.'};
      },
    });
    let lines = check({places: withZidenice({description})});

    expect(lines).toContain('zidenice › description › start: the odds of "short" sum to 0.9');
    expect(lines).toContain('zidenice › description › start: the odds of "zero" give "b" 0');
    expect(lines).toContain('zidenice › description › start: the odds of "below" give "b" -0.5');
    expect(lines).toContain('zidenice › description › start: the odds of "empty" sum to 0');
    expect(
      lines.filter(
        (line) =>
          line.includes('"rounded"') || line.includes('"zero" sum') || line.includes('"below" sum'),
      ),
    ).toEqual([]);
  });

  test('reports a text that throws once an event is met, which proves the second pass carries the keys', () => {
    let description = withEntry(
      (night) => {
        meet(night, 'wallet');
      },
      (night) => (hasMet(night, 'wallet') ? throwNoWay() : 'Fine.'),
    );

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: throws "No way."',
    );
  });

  test('runs an effect on the events of its night, and gathers what it met', () => {
    let description = withEntry((night) => {
      if (hasMet(night, 'wallet')) {
        throwNoWay();
      }

      meet(night, 'wallet');
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: throws "No way."',
    );
  });

  test('runs an effect that picks under every name', () => {
    // The night's own hash would all but never give 'b'.
    let description = withEntry((night) => {
      if (night.pick('luck', {a: 0.999, b: 0.001}) === 'b') {
        throwNoWay();
      }
    });

    expect(check({places: withZidenice({description})})).toContain(
      'zidenice › description › start: throws "No way."',
    );
  });
});
