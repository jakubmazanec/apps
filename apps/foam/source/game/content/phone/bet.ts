import {meet} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const bet: Message = {
  key: 'bet',
  from: SENDER,
  // From 20:10.
  arrives: (night) => night.minutes >= 1210,
  script: defineScript({
    start: {
      speaker: SENDER,
      text: standIn`Fifty says there's a guitar in Rotor's corner tonight.`,
      choices: [
        {
          text: 'Bet',
          onChoose: (night) => {
            meet(night, 'bet');
          },
        },
        {text: 'No'},
      ],
    },
  }),
};
