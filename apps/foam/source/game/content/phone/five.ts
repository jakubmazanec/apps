import {findStory, getDrunkenness, hasMet} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
const NOT_CARRIED_STORY = standIn`Not carried home`;

export const five: Message = {
  key: 'five',
  from: SENDER,
  arrives: (night) => hasMet(night, 'ignoredWater') && getDrunkenness(night) >= 5,
  script: defineScript({
    start: {
      speaker: SENDER,
      text: standIn`I'm not carrying you home.`,
      onEnter: (night) => {
        findStory(night, NOT_CARRIED_STORY);
      },
      choices: [{text: 'Noted'}],
    },
  }),
};
