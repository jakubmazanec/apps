import {defineDialogueScript} from 'tellurion';

import {createWayOut} from '../source/game/core/createWayOut.js';
import {getMapPosition} from '../source/game/core/getMapPoint.js';
import {type Night, type PlaceId} from '../source/game/core/night.js';
import {type Place} from '../source/game/core/place.js';
import {defineScript} from '../source/game/core/script.js';
import {
  type MapData,
  type NightStart,
  type PlaceData,
  type Position,
  type Travel,
} from '../source/game/core/travel.js';
import {PROOF_PICTURE} from './proofPicture.js';

// The tests' own places and journeys, with fixed text and numbers, so that the
// night screen's tests do not change when the game's content does. The ids are
// not the game's, so they are cast to its id type.
export const FIXED_BAR = 'testBar' as PlaceId;
export const FIXED_SQUARE = 'testSquare' as PlaceId;
export const FIXED_STOP = 'testStop' as PlaceId;
export const FIXED_BROKEN = 'testBroken' as PlaceId;

// Temporary text for an invented place. Its limits: no word is longer than 16
// characters (every word must fit a line on the narrowest screen), nobody and
// nothing has a real name, every node sets `speaker`, and every `text` is one
// string without line ends, which the story window cuts into pages. A `*` in a
// `text` switches italic on or off, so the marks of a text come in pairs.
const BAR_NAME = 'The bar';
const BARTENDER = 'The bartender';
const WOMEN = 'Two women talking';
const PATRON = 'A patron';
const DOOR = 'The door';
const barDescription = defineDialogueScript<Night>()({
  start: {
    speaker: BAR_NAME,
    text:
      'The bar is one long room under a low ceiling, with a counter along the left wall and ' +
      'six tables that do not match. A radio plays quietly behind the taps. The air smells of ' +
      'beer and wet coats. Most of the chairs are taken, yet nobody is in a hurry, and the ' +
      'door lets in a little cold each time it opens.',
  },
});
const bartender = defineScript({
  start: 'counter',
  nodes: {
    counter: {
      speaker: BARTENDER,
      text:
        'She dries a glass and watches the room over its rim. When you step up to the counter ' +
        'she lifts her chin, which is as much of a question as you are going to get.',
      choices: [
        {text: 'Order a beer', price: 45, minutes: 10, drinks: 1, next: 'beer'},
        {text: 'Leave her alone'},
      ],
    },
    beer: {
      speaker: BARTENDER,
      text:
        'She pulls a beer without a word and sets it in front of you. The foam is thick and ' +
        'the glass is cold, and for ten minutes nothing else needs doing.',
    },
  },
});
const women = defineDialogueScript<Night>()({
  start: {
    speaker: WOMEN,
    text:
      'They lean close over two small glasses and talk in low voices, quick and sure, the way ' +
      'people do who have known each other for years. One of them laughs. Neither looks your ' +
      'way.',
  },
});
const patron = defineDialogueScript<Night>()({
  start: 'table',
  nodes: {
    table: {
      speaker: PATRON,
      text:
        'An old man sits alone at the table by the radiator, both hands around a glass that is ' +
        'nearly empty. He nods at you as if the two of you had met before.',
      choices: [
        {text: 'Talk to him', next: 'talk'},
        {text: 'Ignore him', next: 'ignore'},
      ],
    },
    talk: {
      speaker: PATRON,
      text:
        'He says he has been coming here since the place opened, and that the beer was *better* ' +
        'then. He points a finger at the ceiling and waits to see if you will ask.',
      choices: [{text: 'Ask about the ceiling', next: 'ceiling'}, {text: 'Let him be'}],
    },
    ignore: {
      speaker: PATRON,
      text:
        'You look past him. He shrugs, turns back to his glass and says something to it that ' +
        'you do not catch.',
    },
    ceiling: {
      speaker: PATRON,
      text:
        'It was the winter the pipes froze, he says, and the landlord had been told about the ' +
        'crack for two years. Everyone knew about the crack. It ran from the lamp to the ' +
        'corner above the taps, and in summer it was thin as a hair, and in winter you could ' +
        'push a coin into it. People made bets on it. A plumber who drank here drew a line at ' +
        'each end in pencil, with the date, so that we could see how fast it grew. That night ' +
        'the room was full, because of the cold and because somebody had a name day. There ' +
        'was a man with an accordion. I was sitting where you are standing now. Around ten ' +
        'the lamp began to swing, though nobody had touched it, and a little dust came down ' +
        'into the glasses. The landlord looked up and said it was only the people upstairs ' +
        'moving their beds. *Nobody* upstairs had moved a bed in thirty years. Then it went, ' +
        'all at once and without much noise, like snow sliding off a roof. Plaster, laths, a ' +
        'hundred years of dust, and in the middle of it a tin box that somebody had hidden up ' +
        'there long ago. It landed on the counter and broke two glasses. Nobody was hurt. The ' +
        'man with the accordion did not even stop playing, he only moved his chair. We opened ' +
        'the box, of course. There were letters in it, and a watch that did not run, and a ' +
        'photograph of a girl standing in front of this very door. The landlord kept the ' +
        'watch. The letters went to a museum, or so he said. The girl we never found, though ' +
        'we asked around for years. They fixed the ceiling in spring, and the beer has not ' +
        'been the same since. You can believe that or not.',
    },
  },
});
const door = defineScript({
  start: 'door',
  nodes: {
    door: {
      speaker: DOOR,
      text:
        'The door is heavy, with a brass handle worn pale. Through the glass you can see the ' +
        'street, wet and empty under the lamps.',
      choices: [
        {text: 'Step outside', next: 'outside'},
        {
          text: 'Knock on the glass',
          minutes: 5,
          odds: 0.6,
          next: ({roll}) => (roll?.won ? 'answered' : 'unanswered'),
        },
        {text: 'Stay'},
      ],
    },
    outside: {
      speaker: DOOR,
      text:
        'The cold wakes you at once. You stand a minute under the sign and breathe, then the ' +
        'noise behind the door pulls you back in.',
    },
    answered: {
      speaker: DOOR,
      text: 'Somebody on the pavement turns at the sound, grins and knocks back.',
    },
    unanswered: {
      speaker: DOOR,
      text: 'Nobody turns. The glass hums a little under your knuckles and then is still.',
    },
  },
});
const testBar: Place = {
  id: FIXED_BAR,
  name: BAR_NAME,
  description: barDescription,
  picture: PROOF_PICTURE,
  spots: [
    {label: BARTENDER, x: 0.22, y: 0.51, script: bartender},
    {label: WOMEN, x: 0.7, y: 0.84, script: women},
    {label: PATRON, x: 0.14, y: 0.93, script: patron},
    {label: DOOR, x: 0.91, y: 0.4, script: door},
  ],
};
// A place with a short name, a way out and two scripts that move the player.
const testSquare: Place = {
  id: FIXED_SQUARE,
  name: 'The square by the old market',
  shortName: 'The square',
  description: defineDialogueScript<Night>()({
    start: {
      speaker: 'The square',
      text: 'The square is wide and empty, and the market stalls stand closed under the lamps.',
    },
  }),
  picture: PROOF_PICTURE,
  spots: [
    {
      label: 'The passage',
      x: 0.3,
      y: 0.3,
      script: defineDialogueScript<Night>()({
        start: {
          speaker: 'The passage',
          text: 'A narrow passage leads off the square and comes out by the door of the bar.',
          onEnter: (night) => {
            night.place = FIXED_BAR;
          },
        },
      }),
    },
    {
      label: 'The street',
      x: 0.7,
      y: 0.55,
      script: createWayOut({
        speaker: 'The street',
        text: 'The street runs downhill from the square towards the tram stop.',
        ways: ['walk', 'tram', 'taxi'],
      }),
    },
    {
      label: 'A wrong turn',
      x: 0.5,
      y: 0.8,
      script: defineDialogueScript<Night>()({
        start: {
          speaker: 'A wrong turn',
          text: 'You take a turn that leads nowhere and come back to the square.',
          onEnter: (night) => {
            night.place = 'nowhere' as PlaceId;
          },
        },
      }),
    },
  ],
};
// A tram stop with no tram journey of its own, and a lane to a place that cannot be drawn.
const testStop: Place = {
  id: FIXED_STOP,
  name: 'The stop',
  description: defineDialogueScript<Night>()({
    start: {
      speaker: 'The stop',
      text: 'The tram stop is a bench under a glass roof, with a timetable nobody can read.',
    },
  }),
  picture: PROOF_PICTURE,
  spots: [
    {
      label: 'The street',
      x: 0.5,
      y: 0.4,
      script: createWayOut({
        speaker: 'The street',
        text: 'The street goes on past the stop in both directions.',
        ways: ['walk', 'tram', 'taxi'],
      }),
    },
    {
      label: 'A dark lane',
      x: 0.5,
      y: 0.8,
      script: defineDialogueScript<Night>()({
        start: {
          speaker: 'A dark lane',
          text: 'A lane behind the stop goes off into the dark.',
          onEnter: (night) => {
            night.place = FIXED_BROKEN;
          },
        },
      }),
    },
  ],
};
// Its picture does not compile.
const testBroken: Place = {
  id: FIXED_BROKEN,
  name: 'The broken place',
  description: defineDialogueScript<Night>()({
    start: {
      speaker: 'The broken place',
      text: 'Nothing here can be drawn.',
    },
  }),
  picture: 'vec3 picture(ivec2 p, vec2 q, float t) { return nope; }',
  spots: [],
};

export const fixedPlaces: Record<string, Place> = {
  [FIXED_BAR]: testBar,
  [FIXED_SQUARE]: testSquare,
  [FIXED_STOP]: testStop,
  [FIXED_BROKEN]: testBroken,
};

export const fixedTravel: Travel = {
  [FIXED_BAR]: {
    walk: {[FIXED_SQUARE]: {minutes: 12}},
    tram: {[FIXED_STOP]: {minutes: 9, price: 25}},
    taxi: {[FIXED_SQUARE]: {minutes: 6, price: 120}},
  },
  [FIXED_SQUARE]: {
    walk: {[FIXED_BAR]: {minutes: 12}},
    tram: {[FIXED_STOP]: {minutes: 8, price: 25}},
    taxi: {[FIXED_BAR]: {minutes: 6, price: 120}},
  },
  [FIXED_STOP]: {
    walk: {[FIXED_BAR]: {minutes: 4}, [FIXED_SQUARE]: {minutes: 7}},
    taxi: {[FIXED_BAR]: {minutes: 5, price: 90}, [FIXED_SQUARE]: {minutes: 5, price: 90}},
  },
};

export const FIXED_ORIGIN: Position = {latitude: 49.2, longitude: 16.6};

/** The position `x` metres east and `y` metres south of the fixed world's origin. */
export function at(x: number, y: number): Position {
  return getMapPosition({x, y}, FIXED_ORIGIN);
}

// testBroken has no entry. No two lines of the map cross where a test reads.
export const fixedPlaceData: PlaceData = {
  [FIXED_BAR]: {kind: 'place', position: at(-300, -200)},
  [FIXED_SQUARE]: {kind: 'place', position: at(300, -200)},
  [FIXED_STOP]: {kind: 'stop', position: at(0, 300)},
};

export const fixedMap: MapData = {
  origin: FIXED_ORIGIN,
  box: {left: -2300, top: -2200, right: 2300, bottom: 2300},
  minorStreets: [[-1000, 0, 1000, 0]],
  mainStreets: [[150, -1000, 150, 1000]],
  railway: [[-1000, 200, 1000, 200]],
  rivers: [[-150, -1000, -150, 1000]],
  parks: [[-260, 60, -200, 60, -200, 140, -260, 140, -260, 60]],
  tramLines: [[-1000, -100, 1000, -100]],
};

export const fixedStart: NightStart = {
  places: fixedPlaces,
  placeData: fixedPlaceData,
  travel: fixedTravel,
  map: fixedMap,
  place: FIXED_BAR,
  minutes: 1180,
  money: 350,
};

/** A place of the fixed world by its id. */
export function getFixedPlace(id: PlaceId): Place {
  let place = fixedPlaces[id];

  if (place === undefined) {
    throw new Error(`The fixed world has no place "${id}"!`);
  }

  return place;
}
