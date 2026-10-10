import {createWayOut} from '../../../core/createWayOut.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {isOpen} from '../../hours.js';
import {standInPicture} from '../../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Dvořákova';
const ROTOR_BAR = 'Rotor Bar';
const SMOKERS = 'The smokers';
const STREET = 'The street';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      Dvořákova is a short street in the centre, lit by the sign over the bar and the shelter of
      a tram stop at the corner. A few people stand about in the cold with their glasses.
    `,
  },
});
const door = defineScript({
  start: (night) => (isOpen(night, 'rotorBar') ? 'open' : 'locked'),
  nodes: {
    open: {
      speaker: ROTOR_BAR,
      text: standIn`Music and warm air come through the door whenever somebody opens it.`,
      choices: [
        {
          text: 'Go in',
          onChoose: (night) => {
            night.place = 'rotorBarRoom';
          },
        },
        {text: 'Stay outside'},
      ],
    },
    locked: {
      speaker: ROTOR_BAR,
      text: standIn`The door is locked. Through the glass, the chairs stand on the tables.`,
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
        {text: 'Leave them to it'},
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
const street = createWayOut({
  speaker: STREET,
  text: standIn`
    The street runs out to the square at one end and down towards the station at the other.
  `,
  ways: ['walk', 'taxi'],
});

export const rotorBarStreet: Place = {
  id: 'rotorBarStreet',
  name: PLACE_NAME,
  outdoors: true,
  description,
  picture: standInPicture,
  spots: [
    {label: ROTOR_BAR, x: 0.3, y: 0.3, script: door},
    {label: SMOKERS, x: 0.7, y: 0.55, script: smokers},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
