import {createWayOut} from '../../core/createWayOut.js';
import {type Place} from '../../core/place.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {standInPicture} from '../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Malinovského náměstí';
const SHORT_NAME = 'Malinovského';
const TITLE = 'Malinovského nám.';
const THEATRE = 'The theatre';
const DISPLAY = 'The display';
const STREET = 'The street';
const description = defineScript({
  start: {
    speaker: TITLE,
    text: standIn`
      The square opens up in front of the theatre, lit from below like a stage. Trams slow
      at the stop and pull away again, nearly empty.
    `,
  },
});
const theatre = defineScript({
  start: {
    speaker: THEATRE,
    text: standIn`
      People in good coats stand on the steps of the theatre at the interval, smoking and
      talking too loudly. A bell calls them back in.
    `,
  },
});
const display = defineScript({
  start: {
    speaker: DISPLAY,
    text: standIn`The display says the next tram comes in 4 minutes. You have your doubts.`,
  },
});
const street = createWayOut({
  speaker: STREET,
  text: standIn`The street is quiet, and the tram stop is close by.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const malinovskehoNamesti: Place = {
  id: 'malinovskehoNamesti',
  name: PLACE_NAME,
  shortName: SHORT_NAME,
  description,
  picture: standInPicture,
  spots: [
    {label: THEATRE, x: 0.3, y: 0.3, script: theatre},
    {label: DISPLAY, x: 0.7, y: 0.55, script: display},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
