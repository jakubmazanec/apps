import {createWayOut} from '../../../core/createWayOut.js';
import {isWithin} from '../../../core/hours.js';
import {findStory, hasStory} from '../../../core/night.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {isOpen} from '../../hours.js';
import {standInPicture} from '../../pictures/standInPicture.js';
import {getFriendEvening} from '../../quest.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs. A story's title is stand-in text too, written with
// standIn.
const PLACE_NAME = 'Dvořákova';
const ROTOR_BAR = 'Rotor Bar';
const SMOKERS = 'The smokers';
const STREET = 'The street';
const TRAM_STORY = standIn`The tram that stopped early`;
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
        {
          text: 'Ask for a cigarette',
          minutes: 5,
          drunkenness: {min: 2},
          isVisible: (night) => !hasStory(night, TRAM_STORY),
          next: 'cigarette',
        },
        {text: 'Ask after your friend', next: 'friend'},
        {text: 'Leave them to it'},
      ],
    },
    friend: {
      speaker: SMOKERS,
      text: (night) => {
        let {early, late} = getFriendEvening(night);

        return (
          night.quest.hasKeys ?
            standIn`Somebody shrugs. Your friend is wherever they are tonight, and you have the keys.`
          : night.minutes < early[0] ?
            standIn`Nobody has seen your friend here tonight, and nobody has looked.`
          : isWithin(night, early) ?
            standIn`Somebody nods at the door. Your friend went in a while ago.`
          : night.minutes < late[0] ?
            standIn`Your friend came out, somebody says, and said something about later.`
            // The close ends the friend's hours, and the player stands outside after it.
          : isWithin(night, late) ? standIn`Somebody points at the door. Your friend went back in.`
          : standIn`Your friend came out at closing with everybody else, and went off somewhere.`
        );
      },
    },
    cigarette: {
      speaker: SMOKERS,
      text: standIn`
        The cigarette comes with a story about a tram that stopped running early, and the five
        minutes go by in smoke.
      `,
      onEnter: (night) => {
        findStory(night, TRAM_STORY);
      },
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
