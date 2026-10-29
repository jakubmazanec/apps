import {getDrunkenness, meet} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {AUTHOR} from '../author.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const four: Message = {
  key: 'four',
  from: AUTHOR,
  arrives: (night) => getDrunkenness(night) >= 4,
  script: defineScript({
    start: 'water',
    nodes: {
      water: {
        speaker: AUTHOR,
        text: standIn`Water. Now.`,
        choices: [
          {text: 'Water', minutes: 10, next: 'drank'},
          {
            text: 'Another',
            onChoose: (night) => {
              meet(night, 'ignoredWater');
            },
            next: 'shrug',
          },
        ],
      },
      drank: {
        speaker: AUTHOR,
        text: standIn`Good. The night is long, and so is the walk home.`,
      },
      shrug: {
        speaker: AUTHOR,
        text: standIn`Suit yourself. I did say it.`,
      },
    },
  }),
};
