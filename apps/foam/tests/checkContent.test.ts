import {defineDialogueScript, type RunnableDialogueScript} from 'tellurion';
import {describe, expect, test, vitest} from 'vitest';

import {checkContent} from '../source/game/core/checkContent.js';
import {getExpectedJourneys} from '../source/game/core/getExpectedJourneys.js';
import {getDrunkenness, type Night, type Way} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {type Choice, defineScript} from '../source/game/core/script.js';
import {type LocationData, type MapData, type Travel} from '../source/game/core/travel.js';

function oneNode(text: string, speaker = 'Someone'): RunnableDialogueScript<Night> {
  return defineDialogueScript<Night>()({start: {speaker, text}});
}

function nodeWithChoices(choices: Array<Choice<string>>): RunnableDialogueScript<Night> {
  return defineScript({start: {speaker: 'Bench', text: 'Hello.', choices}});
}

function throwNoWay(): never {
  throw new Error('No way.');
}

function createPlace(id: Place['id'], name: string, shortName?: string): Place {
  return {
    id,
    name,
    ...(shortName === undefined ? {} : {shortName}),
    description: oneNode('A quiet place with a bench.', name),
    picture: '',
    spots: [{label: 'The door', x: 0.5, y: 0.5, script: oneNode('A door.')}],
  };
}

const places: Record<string, Place> = {
  train: createPlace('train', 'The train'),
  zidenice: createPlace('zidenice', 'Brno-Židenice'),
  rotorBar: createPlace('rotorBar', 'Rotor Bar'),
  namestiRepubliky: createPlace('namestiRepubliky', 'Náměstí Republiky', 'Nám. Republiky'),
};
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

function check(
  changes: {
    places?: Record<string, Place>;
    locationData?: LocationData;
    travel?: Travel;
    map?: MapData;
    journeys?: Record<Way, RunnableDialogueScript<Night>>;
  } = {},
): string[] {
  return checkContent({places, journeys, locationData, travel, map, ...changes});
}

function withZidenice(change: Partial<Place>): Record<string, Place> {
  return {...places, zidenice: {...places.zidenice!, ...change}};
}

describe(checkContent, () => {
  test('gives no line for good content', () => {
    expect(check()).toEqual([]);
  });

  test('reports a place the map does not cover', () => {
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

  test('reports a place without an entry, but not the train', () => {
    let lines = check({locationData: {zidenice: locationData.zidenice!}});

    expect(lines).toContain('locations.json: no entry for "rotorBar"');
    expect(lines).not.toContain('locations.json: no entry for "train"');
  });

  test('reports an entry without a place', () => {
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

  test('calls a text function once per place and level and reports its fault once', () => {
    let text = vitest.fn<(night: Night) => string>(() => 'A supercalifragilistic word.');
    let description = defineDialogueScript<Night>()({start: {speaker: 'Bench', text}});
    let lines = check({places: withZidenice({description})});

    expect(text).toHaveBeenCalledTimes(12);
    expect(
      lines.filter((line) => line.startsWith('zidenice › description › start: "super')),
    ).toHaveLength(1);
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
});
