import {createWayOut} from '../../../core/createWayOut.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {standInPicture} from '../../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Náměstí Republiky';
const SHORT_NAME = 'Nám. Republiky';
const SHELTER = 'The shelter';
const DISPLAY = 'The display';
const STREET = 'The street';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The tram stop is a glass shelter on a wide, empty street. A few lit windows hang above
      it, and the rails shine wet in both directions.
    `,
  },
});
const shelter = defineScript({
  start: 'shelter',
  nodes: {
    shelter: {
      speaker: SHELTER,
      text: standIn`
        Somebody stands under the glass with the look of a person who has just missed a tram.
        They check the time anyway.
      `,
      choices: [
        {
          text: 'Ask when the next tram goes',
          minutes: 5,
          odds: 0.6,
          next: ({roll}) => (roll?.won ? 'knows' : 'shrugs'),
        },
        {text: 'Wait in silence'},
      ],
    },
    knows: {
      speaker: SHELTER,
      text: standIn`
        They know the line and the minute, and they tell you both without looking up from the
        rails.
      `,
    },
    shrugs: {
      speaker: SHELTER,
      text: standIn`
        They shrug. The display has been wrong all evening, and they stopped believing it an
        hour ago.
      `,
    },
  },
});
const display = defineScript({
  start: {
    speaker: DISPLAY,
    text: standIn`The display says the next tram comes in 6 minutes. It has said so for a while.`,
  },
});
const street = createWayOut({
  speaker: STREET,
  text: standIn`The street runs on in both directions, and the rails run with it.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const namestiRepubliky: Place = {
  id: 'namestiRepubliky',
  name: PLACE_NAME,
  shortName: SHORT_NAME,
  outdoors: true,
  description,
  picture: standInPicture,
  spots: [
    {label: SHELTER, x: 0.3, y: 0.3, script: shelter},
    {label: DISPLAY, x: 0.7, y: 0.55, script: display},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
