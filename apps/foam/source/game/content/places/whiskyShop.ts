import {createWayOut} from '../../core/createWayOut.js';
import {type Place} from '../../core/place.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {barPicture} from '../pictures/barPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'The Whisky Shop Brno';
const SHORT_NAME = 'Whisky Shop';
const TITLE = 'The Whisky Shop';
const SHELVES = 'The shelves';
const SHOPKEEPER = 'The shopkeeper';
const REGULARS = 'Two regulars';
const DOOR = 'The door';
const description = defineScript({
  start: {
    speaker: TITLE,
    text: standIn`
      The shop is small and warm, and every wall is covered with bottles. It smells of oak and
      smoke, and somebody has left a chair by the counter for whoever stays.
    `,
  },
});
const shelves = defineScript({
  start: 'shelves',
  nodes: {
    shelves: {
      speaker: SHELVES,
      text: standIn`
        Sixty bottles stand open for tasting, each with a small card in a careful hand.
      `,
      choices: [
        {text: 'Pour a dram', price: 90, minutes: 15, drinks: 1, next: 'dram'},
        {text: 'Pour the good one', price: 180, minutes: 15, drinks: 1, next: 'goodOne'},
        {text: 'Not now'},
      ],
    },
    dram: {
      speaker: SHELVES,
      text: standIn`The dram is dark and slow, and it tastes of smoke, then of something sweet.`,
    },
    goodOne: {
      speaker: SHELVES,
      text: standIn`
        The good one is older than some of the regulars, and it takes its time on the tongue.
        The shopkeeper watches your face and says nothing.
      `,
    },
  },
});
const shopkeeper = defineScript({
  start: {
    speaker: SHOPKEEPER,
    text: standIn`
      He asks whether you like smoke or sweet, and waits as if the answer mattered to him.
    `,
  },
});
const regulars = defineScript({
  start: 'regulars',
  nodes: {
    regulars: {
      speaker: REGULARS,
      text: standIn`
        Two men lean on the counter. One of them is saving a bottle for an occasion that never
        comes, and the other has stopped asking which.
      `,
      choices: [
        {text: 'Ask about the bottle', minutes: 5, drunkenness: {max: 1}, next: 'bottle'},
        {text: 'Let them be'},
      ],
    },
    bottle: {
      speaker: REGULARS,
      text: standIn`
        The one with the bottle says where it came from, and the other says how long it has
        been waiting. Neither of them says what the occasion is.
      `,
    },
  },
});
const door = createWayOut({
  speaker: DOOR,
  text: standIn`The door opens onto the street, and a tram bell rings somewhere close.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const whiskyShop: Place = {
  id: 'whiskyShop',
  name: PLACE_NAME,
  shortName: SHORT_NAME,
  description,
  picture: barPicture,
  spots: [
    {label: SHELVES, x: 0.22, y: 0.51, script: shelves},
    {label: SHOPKEEPER, x: 0.14, y: 0.93, script: shopkeeper},
    {label: REGULARS, x: 0.7, y: 0.84, script: regulars},
    {label: DOOR, x: 0.91, y: 0.4, script: door},
  ],
};
