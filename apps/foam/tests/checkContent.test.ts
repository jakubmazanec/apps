import {defineDialogueScript, type RunnableDialogueScript} from 'tellurion';
import {describe, expect, test, vitest} from 'vitest';

import {checkContent} from '../source/game/core/checkContent.js';
import {getExpectedJourneys} from '../source/game/core/getExpectedJourneys.js';
import {type Night, type Way} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {type MapData, type PlaceData, type Travel} from '../source/game/core/travel.js';

function oneNode(text: string, speaker = 'Someone'): RunnableDialogueScript<Night> {
  return defineDialogueScript<Night>()({start: {speaker, text}});
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
const placeData: PlaceData = {
  zidenice: {kind: 'place', position},
  rotorBar: {
    kind: 'place',
    position,
    nearestTramStop: {name: 'Náměstí Republiky', position},
  },
  namestiRepubliky: {kind: 'stop', tramStop: 'Náměstí Republiky', position},
};

function createTravel(data: PlaceData): Travel {
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

const travel = createTravel(placeData);
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
    placeData?: PlaceData;
    travel?: Travel;
    map?: MapData;
    journeys?: Record<Way, RunnableDialogueScript<Night>>;
  } = {},
): string[] {
  return checkContent({places, journeys, placeData, travel, map, ...changes});
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
    let lines = check({placeData: {zidenice: placeData.zidenice!}});

    expect(lines).toContain('places.json: no entry for "rotorBar"');
    expect(lines).not.toContain('places.json: no entry for "train"');
  });

  test('reports an entry without a place', () => {
    let data = {...placeData, nowhere: {kind: 'place', position}};

    expect(check({placeData: data})).toContain('places.json: "nowhere" is not a place');
  });

  test('reports a missing kind and a kind that is neither place nor stop', () => {
    let data = structuredClone(placeData);

    delete (data.zidenice as {kind?: string}).kind;
    data.rotorBar!.kind = 'shop';

    let lines = check({placeData: data});

    expect(lines).toContain('places.json › zidenice: no kind');
    expect(lines).toContain('places.json › rotorBar: kind is "shop", not "place" or "stop"');
  });

  test('reports an entry without a position', () => {
    let data = structuredClone(placeData);

    delete data.zidenice!.position;

    expect(check({placeData: data})).toContain(
      'places.json › zidenice: no position; run the fill script',
    );
  });

  test('reports a missing journey', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    delete data.zidenice!.tram!.namestiRepubliky;

    expect(check({travel: data})).toContain(
      'travel.json: no journey zidenice › tram › namestiRepubliky',
    );
  });

  test('reports a journey the game does not offer', () => {
    let data = structuredClone(travel) as Record<string, Record<string, Record<string, unknown>>>;

    data.zidenice!.tram!.rotorBar = {minutes: 5, price: 25};

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

  test('calls a text function once per place and reports its fault once', () => {
    let text = vitest.fn<(night: Night) => string>(() => 'A supercalifragilistic word.');
    let description = defineDialogueScript<Night>()({start: {speaker: 'Bench', text}});
    let lines = check({places: withZidenice({description})});

    expect(text).toHaveBeenCalledTimes(4);
    expect(
      lines.filter((line) => line.startsWith('zidenice › description › start: "super')),
    ).toHaveLength(1);
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
});
