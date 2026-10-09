import {createWayOut} from '../../core/createWayOut.js';
import {getDrunkenness} from '../../core/night.js';
import {type Place} from '../../core/place.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {barPicture} from '../pictures/barPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Rotor Bar';
const BAR = 'The bar';
const SMOKERS = 'The smokers';
const TABLE = 'The corner table';
const DOOR = 'The door';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The bar is loud and low, with a counter along one wall and a crowd that has settled in
      for the night. The music is a little too loud to talk under, and nobody seems to mind.
    `,
  },
});
const bar = defineScript({
  start: 'bar',
  nodes: {
    bar: {
      speaker: BAR,
      text: standIn`The bartender nods at the taps.`,
      choices: [
        {text: 'Order a beer', price: 45, minutes: 10, drinks: 1, next: 'beer'},
        {text: 'Not now'},
      ],
    },
    beer: {
      speaker: BAR,
      text: standIn`The beer is cold and the foam is thick, and for a while nothing else needs doing.`,
    },
  },
});
const smokers = defineScript({
  start: 'smokers',
  nodes: {
    smokers: {
      speaker: SMOKERS,
      text: standIn`
        On the pavement outside, strangers talk more easily than they did inside. Somebody
        offers you a light you do not need.
      `,
      choices: [
        {text: 'Ask for a cigarette', minutes: 5, drunkenness: {min: 2}, next: 'cigarette'},
        {text: 'Go back in'},
      ],
    },
    cigarette: {
      speaker: SMOKERS,
      text: standIn`
        The cigarette comes with a story about a tram that stopped running early, and the five
        minutes go by in smoke.
      `,
    },
  },
});
const table = defineScript({
  start: 'table',
  nodes: {
    table: {
      speaker: TABLE,
      text: standIn`
        A few strangers sit around the table in the corner, with one spare chair among them.
        They glance at you, and then at the chair.
      `,
      choices: [
        {
          text: 'Take the spare chair',
          minutes: 15,
          odds: (night) => (getDrunkenness(night) >= 2 ? 0.7 : 0.4),
          next: ({roll}) =>
            roll?.won ? 'welcomed'
            : (roll?.value ?? 0) > 0.9 ? 'spilled'
            : 'brushedOff',
        },
        {text: 'Leave them to it'},
      ],
    },
    welcomed: {
      speaker: TABLE,
      text: standIn`
        Somebody moves a coat off the chair, and the talk opens up to let you in. A quarter of
        an hour goes by before anyone asks your name.
      `,
    },
    brushedOff: {
      speaker: TABLE,
      text: standIn`
        The nearest of them puts a hand on the chair before you reach it. Somebody is coming
        back, apparently. You stand there a while anyway.
      `,
    },
    spilled: {
      speaker: TABLE,
      text: standIn`
        The chair catches a glass on its way out, and the glass goes over. Everybody looks at
        you while somebody fetches a cloth, and the cleaning up takes a while longer.
      `,
      onEnter: (night) => {
        night.minutes += 10;
      },
    },
  },
});
const door = createWayOut({
  speaker: DOOR,
  text: standIn`The door lets in the cold and the sound of a tram in Dvořákova street.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const rotorBar: Place = {
  id: 'rotorBar',
  name: PLACE_NAME,
  description,
  picture: barPicture,
  spots: [
    {label: BAR, x: 0.22, y: 0.51, script: bar},
    {label: TABLE, x: 0.7, y: 0.84, script: table},
    {label: SMOKERS, x: 0.14, y: 0.93, script: smokers},
    {label: DOOR, x: 0.91, y: 0.4, script: door},
  ],
};
