import {sleepTillMorning} from '../../../core/hours.js';
import {findStory} from '../../../core/night.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {AUTHOR, AUTHOR_STORY, isAuthorIn} from '../../author.js';
import {standInPicture} from '../../pictures/standInPicture.js';
import {TICKET_PRICE} from '../../quest.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs, and the
// author's avatar Jakub is the one exception), every node sets `speaker`, a description is two or
// three sentences, a scene button one node of one or two, and the `*` marks of italic come in
// pairs. A story's title is stand-in text too, written with standIn.
const PLACE_NAME = 'Brno hlavní nádraží';
const SHORT_NAME = 'Hlavní nádraží';
const BOARD = 'The board';
const HALL = 'The hall';
const DOORS = 'The doors';
const MACHINE = 'The ticket machine';
const BENCHES = 'The benches';
const STATION_STORY = standIn`The station that never moved`;
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The main station is loud under its high ceiling, full of rolling cases and echoing
      announcements. Even at this hour somebody is always running for something.
    `,
  },
});
const board = defineScript({
  start: {
    speaker: BOARD,
    text: standIn`
      The departures board clatters through the trains that leave tonight. Most of them go
      somewhere you have never been.
    `,
  },
});
const hall = defineScript({
  start: {
    speaker: HALL,
    text: standIn`
      The city has been about to move this station for a hundred years. Everyone in the hall
      walks as if it already had.
    `,
    onEnter: (night) => {
      findStory(night, STATION_STORY);
    },
  },
});
const doors = defineScript({
  start: {
    speaker: DOORS,
    text: standIn`The doors slide apart, and the cold of the forecourt comes in.`,
    choices: [
      {
        text: 'Go out',
        onChoose: (night) => {
          night.place = 'hlavniNadraziForecourt';
        },
      },
    ],
  },
});
const machine = defineScript({
  start: (night) => (night.quest.hasTicket ? 'ticketed' : 'machine'),
  nodes: {
    machine: {
      speaker: MACHINE,
      text: standIn`The machine hums beside the board. A ticket home costs ${TICKET_PRICE} Kč.`,
      choices: [
        {
          text: 'Buy a ticket home',
          price: TICKET_PRICE,
          onChoose: (night) => {
            night.quest.hasTicket = true;
          },
          next: 'bought',
        },
        {text: 'Walk away'},
      ],
    },
    bought: {
      speaker: MACHINE,
      text: standIn`The ticket slides out, warm. It is for the 08:04.`,
    },
    ticketed: {
      speaker: MACHINE,
      text: standIn`You already have the ticket in your pocket. The machine can wait.`,
    },
  },
});
const benches = defineScript({
  start: 'benches',
  nodes: {
    benches: {
      speaker: BENCHES,
      text: standIn`
        A row of steel benches stands under the departures board. Several people sleep on them
        with their coats pulled up.
      `,
      choices: [
        {text: 'Doze till the first train', onChoose: sleepTillMorning, next: 'dozed'},
        {text: 'Stay on your feet'},
      ],
    },
    dozed: {
      speaker: BENCHES,
      text: standIn`
        You doze through the night with one hand on your bag. The first train wakes the whole
        hall, and it is morning.
      `,
    },
  },
});
const jakub = defineScript({
  start: 'bench',
  nodes: {
    bench: {
      speaker: AUTHOR,
      text: standIn`
        A man sits on the bench under the board with a notebook on his knee and a ticket for the
        08:04. He looks up as if he had been waiting for you.
      `,
      choices: [{text: 'Was any of it real?', next: 'real'}, {text: 'Say nothing'}],
      onEnter: (night) => {
        findStory(night, AUTHOR_STORY);
      },
    },
    real: {
      speaker: AUTHOR,
      text: standIn`The places, every one. The friend is three people. The brick is mine.`,
    },
  },
});

export const hlavniNadraziHall: Place = {
  id: 'hlavniNadraziHall',
  name: PLACE_NAME,
  shortName: SHORT_NAME,
  outdoors: false,
  description,
  picture: standInPicture,
  spots: [
    {label: BOARD, x: 0.3, y: 0.3, script: board},
    {label: HALL, x: 0.7, y: 0.55, script: hall},
    {label: DOORS, x: 0.5, y: 0.8, script: doors},
    {label: MACHINE, x: 0.5, y: 0.12, script: machine},
    {label: BENCHES, x: 0.5, y: 0.95, script: benches},
    {
      label: AUTHOR,
      x: 0.3,
      y: 0.6,
      script: jakub,
      isVisible: (night) => isAuthorIn(night, 'hlavniNadraziHall'),
    },
  ],
};
