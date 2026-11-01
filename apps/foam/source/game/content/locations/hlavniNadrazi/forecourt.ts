import {createWayOut} from '../../../core/createWayOut.js';
import {findStory, hasMet, meet} from '../../../core/night.js';
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
const PLACE_NAME = 'Nádražní';
const DOORS = 'The doors';
const STRANGER = 'A stranger';
const STREET = 'The street';
const SELLER = 'The seller';

export const CROWNS_STORY = standIn`Twenty crowns`;

const PHONE_STORY = standIn`The phone from the forecourt`;
const description = defineScript({
  start: (night) => {
    let event = night.pick('forecourtArrival', {none: 0.6, phone: 0.4});

    return event === 'none' || hasMet(night, event) ? 'stop' : event;
  },
  nodes: {
    stop: {
      speaker: PLACE_NAME,
      text: standIn`
        The forecourt is a strip of wet paving between the station and the tram stop, with a line
        of taxis idling at the kerb. Trams pull in and out under the wires, and everybody here is
        on the way somewhere else.
      `,
    },
    phone: {
      speaker: SELLER,
      text: standIn`
        A man by the taxis opens his coat on a row of phones, each in its original box. He taps
        one and says two hundred, and no questions.
      `,
      onEnter: (night) => {
        meet(night, 'phone');
      },
      choices: [
        {
          text: 'Buy the phone',
          price: 200,
          odds: 0.5,
          next: ({roll}) => (roll?.won ? 'works' : 'brick'),
        },
        {text: 'Walk on', next: 'stop'},
      ],
    },
    works: {
      speaker: SELLER,
      text: standIn`
        The screen lights up before you reach the tram, and the signal bars climb. It is a good
        phone, and a good deal.
      `,
      onEnter: (night) => {
        findStory(night, PHONE_STORY);
      },
      next: 'stop',
    },
    brick: {
      speaker: SELLER,
      text: standIn`
        The box is heavy and sealed, and inside it lies a brick wrapped in a cloth. The man is
        already gone among the taxis.
      `,
      next: 'stop',
    },
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
      onEnter: (night) => {
        findStory(night, CROWNS_STORY);
      },
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
