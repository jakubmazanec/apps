import {defineDialogueScript} from 'tellurion';

import {createWayOut} from '../../core/createWayOut.js';
import {type Night} from '../../core/night.js';
import {type Place} from '../../core/place.js';
import {standIn} from '../../core/prose.js';
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
const description = defineDialogueScript<Night>()({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The bar is loud and low, with a counter along one wall and a crowd that has settled in
      for the night. The music is a little too loud to talk under, and nobody seems to mind.
    `,
  },
});
const bar = defineDialogueScript<Night>()({
  start: 'bar',
  nodes: {
    bar: {
      speaker: BAR,
      text: standIn`
        The bartender nods at the taps. A beer costs money and ten minutes of standing here.
      `,
      choices: [{text: 'Order a beer', next: 'beer'}, {text: 'Not now'}],
    },
    beer: {
      speaker: BAR,
      text: standIn`The beer is cold and the foam is thick, and for a while nothing else needs doing.`,
      onEnter: (night) => {
        night.money -= 45;
        night.minutes += 10;
      },
    },
  },
});
const smokers = defineDialogueScript<Night>()({
  start: {
    speaker: SMOKERS,
    text: standIn`
      On the pavement outside, strangers talk more easily than they did inside. Somebody
      offers you a light you do not need.
    `,
  },
});
const table = defineDialogueScript<Night>()({
  start: {
    speaker: TABLE,
    text: standIn`
      A few strangers sit around the table in the corner, with one spare chair among them.
      They glance at you, and then at the chair.
    `,
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
    {label: SMOKERS, x: 0.14, y: 0.93, script: smokers},
    {label: TABLE, x: 0.7, y: 0.84, script: table},
    {label: DOOR, x: 0.91, y: 0.4, script: door},
  ],
};
