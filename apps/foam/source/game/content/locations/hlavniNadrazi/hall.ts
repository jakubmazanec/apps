import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {standInPicture} from '../../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Brno hlavní nádraží';
const SHORT_NAME = 'Hlavní nádraží';
const BOARD = 'The board';
const HALL = 'The hall';
const DOORS = 'The doors';
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
  ],
};
