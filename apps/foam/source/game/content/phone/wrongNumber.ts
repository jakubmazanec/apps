import {findStory} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
const WRONG_NUMBER_STORY = standIn`The wrong number`;

export const wrongNumber: Message = {
  key: 'wrongNumber',
  from: SENDER,
  // From 18:40, on a night that sends it.
  arrives: (night) => {
    let version = night.pick('wrongNumber', {sent: 0.1, none: 0.9});

    return night.minutes >= 1120 && version === 'sent';
  },
  script: defineScript({
    start: 'crate',
    nodes: {
      crate: {
        speaker: SENDER,
        text: standIn`Second crate's at the back door, knock twice. Sorry, wrong person.`,
        choices: [{text: 'Which back door?', next: 'backDoor'}, {text: 'Ignore it'}],
      },
      backDoor: {
        speaker: SENDER,
        text: standIn`There is no back door, and there is no crate. Forget I wrote.`,
        onEnter: (night) => {
          findStory(night, WRONG_NUMBER_STORY);
        },
      },
    },
  }),
};
