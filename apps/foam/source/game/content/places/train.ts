import {type Place} from '../../core/place.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {standInPicture} from '../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'The train';
const WINDOW = 'The window';
const PASSENGER = 'A passenger';
const DOOR = 'The door';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The carriage rocks and the seats smell of dust and old coffee. Outside, the dark slides
      past in long strips, and a few other people sit far apart, each with a window of their
      own.
    `,
  },
});
const scenery = defineScript({
  start: {
    speaker: WINDOW,
    text: standIn`
      Brno arrives back to front: allotments, the river, the long wall of an old factory.
      Every lit window is somebody else's evening.
    `,
  },
});
const passenger = defineScript({
  start: {
    speaker: PASSENGER,
    text: standIn`
      Without being asked, he tells you which stop is for what. Židenice is for the quiet, the
      main station is for everything else.
    `,
  },
});
// The way out of the train is written by hand: it has two stops and no journey.
const door = defineScript({
  start: 'door',
  nodes: {
    door: {
      speaker: DOOR,
      text: standIn`The train slows. Židenice is next, and the main station after it.`,
      choices: [
        {text: 'Get off at Brno-Židenice', minutes: 4, next: 'zidenice'},
        {text: 'Ride on to the main station', minutes: 9, next: 'hlavniNadrazi'},
        {text: 'Not yet'},
      ],
    },
    zidenice: {
      speaker: DOOR,
      text: standIn`The platform is short and nearly empty.`,
      onEnter: (night) => {
        night.place = 'zidenice';
      },
    },
    hlavniNadrazi: {
      speaker: DOOR,
      text: standIn`The train crosses the river and rolls into the main station.`,
      onEnter: (night) => {
        night.place = 'hlavniNadrazi';
      },
    },
  },
});

export const train: Place = {
  id: 'train',
  name: PLACE_NAME,
  description,
  picture: standInPicture,
  spots: [
    {label: WINDOW, x: 0.3, y: 0.3, script: scenery},
    {label: PASSENGER, x: 0.7, y: 0.55, script: passenger},
    {label: DOOR, x: 0.5, y: 0.8, script: door},
  ],
};
