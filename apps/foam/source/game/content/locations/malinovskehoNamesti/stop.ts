import {createWayOut} from '../../../core/createWayOut.js';
import {findStory, getDrunkenness, hasMet, meet} from '../../../core/night.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {standInPicture} from '../../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs. A story's title is stand-in text too, written with
// standIn.
const PLACE_NAME = 'Malinovského náměstí';
const SHORT_NAME = 'Malinovského';
const TITLE = 'Malinovského nám.';
const THEATRE = 'The theatre';
const DISPLAY = 'The display';
const STREET = 'The street';
const FIGHT = 'The fight';
const FIGHT_STORY = standIn`The fight at the stop`;
// The square has its fight from 22:00.
const FIGHT_FROM = 1320;
const description = defineScript({
  start: (night) => {
    let event = night.pick('malinovskehoArrival', {none: 0.6, fight: 0.4});

    return event === 'none' || night.minutes < FIGHT_FROM || hasMet(night, event) ? 'stop' : event;
  },
  nodes: {
    stop: {
      speaker: TITLE,
      text: standIn`
        The square opens up in front of the theatre, lit from below like a stage. Trams slow
        at the stop and pull away again, nearly empty.
      `,
    },
    fight: {
      speaker: FIGHT,
      text: standIn`
        Two men shout at the edge of the stop, and the shouting is turning into pushing. A
        small crowd has gathered to watch, and nobody steps in.
      `,
      onEnter: (night) => {
        meet(night, 'fight');
      },
      choices: [
        {
          text: 'Step in',
          minutes: 10,
          odds: (night) => (getDrunkenness(night) >= 3 ? 0.3 : 0.5),
          next: ({roll}) => (roll?.won ? 'won' : 'lost'),
        },
        {text: 'Stay out', next: 'stop'},
      ],
    },
    won: {
      speaker: FIGHT,
      text: standIn`
        You get a shoulder between them, and the pushing stops. One of them laughs it off, and
        the other buys you a coffee from the kiosk.
      `,
      onEnter: (night) => {
        findStory(night, FIGHT_STORY);
      },
      next: 'stop',
    },
    lost: {
      speaker: FIGHT,
      text: standIn`
        A fist finds your jaw before you find the words. By the time the tram comes you are
        sitting on the kerb, and half an hour has gone.
      `,
      onEnter: (night) => {
        // A lost fight costs half an hour more.
        night.minutes += 30;
      },
      next: 'stop',
    },
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
  outdoors: true,
  description,
  picture: standInPicture,
  spots: [
    {label: THEATRE, x: 0.3, y: 0.3, script: theatre},
    {label: DISPLAY, x: 0.7, y: 0.55, script: display},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
