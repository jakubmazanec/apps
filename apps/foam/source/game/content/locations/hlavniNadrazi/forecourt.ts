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
const PLACE_NAME = 'Nádražní';
const DOORS = 'The doors';
const STRANGER = 'A stranger';
const STREET = 'The street';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The forecourt is a strip of wet paving between the station and the tram stop, with a line
      of taxis idling at the kerb. Trams pull in and out under the wires, and everybody here is
      on the way somewhere else.
    `,
  },
});
const doors = defineScript({
  start: {
    speaker: DOORS,
    text: standIn`
      The doors slide apart, and the warmth and the noise of the hall come out to meet you.
    `,
    choices: [
      {
        text: 'Go in',
        onChoose: (night) => {
          night.place = 'hlavniNadraziHall';
        },
      },
    ],
  },
});
const stranger = defineScript({
  start: 'stranger',
  nodes: {
    stranger: {
      speaker: STRANGER,
      text: standIn`
        A man in a thin jacket steps up and asks for twenty crowns for a ticket home. He has
        asked everybody else already.
      `,
      choices: [{text: 'Give some change', price: 20, next: 'given'}, {text: 'Walk on'}],
    },
    given: {
      speaker: STRANGER,
      text: standIn`
        He takes the coins without looking at them and is gone before you can change your mind.
      `,
    },
  },
});
const street = createWayOut({
  speaker: STREET,
  text: standIn`The street runs past the stop in both directions, and the taxis wait at the kerb.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const hlavniNadraziForecourt: Place = {
  id: 'hlavniNadraziForecourt',
  name: PLACE_NAME,
  outdoors: true,
  description,
  picture: standInPicture,
  spots: [
    {label: DOORS, x: 0.3, y: 0.3, script: doors},
    {label: STRANGER, x: 0.7, y: 0.55, script: stranger},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
